import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type RequestHandler, type Response } from "express";

import {
  accountRequestEventsTable,
  accountRequestsTable,
  appUsersTable,
  businessMembersTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  lifecycleOutboxTable,
  OPEN_ACCOUNT_REQUEST_STATUSES,
  type AccountRequest,
  type AccountRequestEvent,
  type AccountRequestResolution,
  type AccountRequestStatus,
} from "@workspace/db";
import {
  CreateAccountDeletionRequestBody,
  CreateAccountDeletionRequestResponse,
  DecideSupportAccountRequestBody,
  DecideSupportAccountRequestParams,
  DecideSupportAccountRequestResponse,
  GetAccountMessagesResponse,
  GetAccountRequestsResponse,
  GetSupportAccountRequestsQueryParams,
  GetSupportAccountRequestsResponse,
  GetSupportLifecycleMessagesQueryParams,
  GetSupportLifecycleMessagesResponse,
  ResendSupportLifecycleMessageParams,
  ResendSupportLifecycleMessageResponse,
  WithdrawAccountRequestBody,
  WithdrawAccountRequestParams,
  WithdrawAccountRequestResponse,
  type AccountDeletionScope,
  type ApiFieldError,
} from "@workspace/api-zod";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { notifyBusinessOwners, notifyUser } from "../lib/lifecycleNotifications";
import {
  listLifecycleMessagesForUser,
  requeueFailedLifecycleMessage,
  serialiseLifecycleMessageForSupport,
} from "../lib/lifecycleOutbox";
import type { IdentityResolver } from "../lib/permissions";
import { requireAppUser } from "../middlewares/requireAppUser";
import { requireFlag } from "../middlewares/requireFlag";

/**
 * Account lifecycle self-service and its support path.
 *
 * A deletion request is a tracked record, never an immediate erasure: erasure
 * follows the approved retention configuration (release gates Q5/Q6/Q8) and a
 * completed support decision. Every transition commits together with its
 * outbox message and an append-only audit event.
 */

export type AccountLifecycleRouterOptions = {
  resolveIdentity?: IdentityResolver;
  flags?: FeatureFlagSource;
  now?: () => Date;
};

type Tx = Pick<typeof db, "insert" | "select" | "update">;

/** Every scope a requester must acknowledge; the research registration is deliberately not one of them (gate Q8). */
export const ACCOUNT_DELETION_SCOPES: readonly AccountDeletionScope[] = [
  "account_profile",
  "preferences",
  "consents",
  "saved_events",
  "business_memberships",
];

const NO_FIELDS: ReadonlySet<string> = new Set();
const DELETION_FIELDS: ReadonlySet<string> = new Set(["acknowledgedScopes"]);
const WITHDRAW_FIELDS: ReadonlySet<string> = new Set(["expectedVersion"]);
const DECISION_FIELDS: ReadonlySet<string> = new Set([
  "expectedVersion",
  "decision",
  "resolutionCode",
  "businessProfileId",
  "note",
]);
const STATUS_QUERY: ReadonlySet<string> = new Set(["status"]);

/**
 * Publication states that make a sole-owned business a deletion blocker: the
 * public directory would otherwise keep (or be waiting to restore) a listing
 * nobody can manage. Drafts and unpublished profiles are not public and do not
 * block; support resolves a blocker by transfer, closure, or unpublication.
 */
const BLOCKING_PUBLICATION_STATUSES = ["published", "suspended"] as const;

function rejectClientFields(
  req: Request,
  res: Response,
  allowedBodyFields: ReadonlySet<string>,
  allowedQueryFields: ReadonlySet<string> = NO_FIELDS,
): boolean {
  const fieldErrors = [
    ...unknownFieldErrors(req.body, allowedBodyFields),
    ...unknownFieldErrors(req.query, allowedQueryFields),
  ];
  if (fieldErrors.length === 0) return false;
  sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
  return true;
}

function requireReviewer(req: Request, res: Response, next: NextFunction): void {
  if (!req.account!.identity.isEditor) {
    sendApiError(req, res, "FORBIDDEN");
    return;
  }
  next();
}

// ------------------------------------------------------------ sole owners ---

type SoleOwnedBusiness = { id: number; name: string; publicationStatus: string };

/**
 * Businesses where this user is the only owner. Locks the membership rows so a
 * concurrent membership change cannot slip between the check and the decision.
 */
async function findSoleOwnedBusinesses(tx: Tx, clerkUserId: string): Promise<SoleOwnedBusiness[]> {
  const owned = await tx
    .select({ businessProfileId: businessMembersTable.businessProfileId })
    .from(businessMembersTable)
    .where(and(eq(businessMembersTable.userId, clerkUserId), eq(businessMembersTable.role, "owner")))
    .for("update");
  if (owned.length === 0) return [];
  const ids = owned.map((row) => row.businessProfileId);
  const otherOwners = await tx
    .select({ businessProfileId: businessMembersTable.businessProfileId })
    .from(businessMembersTable)
    .where(
      and(
        inArray(businessMembersTable.businessProfileId, ids),
        eq(businessMembersTable.role, "owner"),
        ne(businessMembersTable.userId, clerkUserId),
      ),
    );
  const shared = new Set(otherOwners.map((row) => row.businessProfileId));
  const soleIds = ids.filter((id) => !shared.has(id));
  if (soleIds.length === 0) return [];
  const profiles = await tx
    .select({
      id: businessProfilesTable.id,
      name: businessProfilesTable.name,
      publicationStatus: businessProfilesTable.publicationStatus,
    })
    .from(businessProfilesTable)
    .where(and(inArray(businessProfilesTable.id, soleIds), inArray(businessProfilesTable.publicationStatus, [...BLOCKING_PUBLICATION_STATUSES])))
    .orderBy(asc(businessProfilesTable.id));
  return profiles;
}

// ------------------------------------------------------------ serialisers ---

async function loadBlockedBusinesses(
  request: AccountRequest,
  events: AccountRequestEvent[],
): Promise<{ businessProfileId: number; name: string; publicationStatus: string; resolved: boolean }[]> {
  const ids = request.blockerDetails?.businessProfileIds ?? [];
  if (ids.length === 0) return [];
  const profiles = await db
    .select({
      id: businessProfilesTable.id,
      name: businessProfilesTable.name,
      publicationStatus: businessProfilesTable.publicationStatus,
    })
    .from(businessProfilesTable)
    .where(inArray(businessProfilesTable.id, ids));
  const resolved = new Set(
    events.filter((event) => event.businessProfileId !== null && event.resolutionCode !== null).map((event) => event.businessProfileId),
  );
  return ids
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .map((profile) => ({
      businessProfileId: profile.id,
      name: profile.name,
      publicationStatus: profile.publicationStatus,
      resolved: resolved.has(profile.id),
    }));
}

async function loadEvents(requestIds: number[]): Promise<Map<number, AccountRequestEvent[]>> {
  const map = new Map<number, AccountRequestEvent[]>();
  if (requestIds.length === 0) return map;
  const rows = await db
    .select()
    .from(accountRequestEventsTable)
    .where(inArray(accountRequestEventsTable.requestId, requestIds))
    .orderBy(asc(accountRequestEventsTable.createdAt), asc(accountRequestEventsTable.id));
  for (const row of rows) {
    const list = map.get(row.requestId) ?? [];
    list.push(row);
    map.set(row.requestId, list);
  }
  return map;
}

/** Requester view: no support note, no handler, no internal ids beyond the request itself. */
async function serialiseRequest(request: AccountRequest, events: AccountRequestEvent[]) {
  const businesses = request.blockerCode ? await loadBlockedBusinesses(request, events) : [];
  return {
    id: request.id,
    scope: request.scope,
    type: request.type,
    status: request.status,
    version: request.version,
    acknowledgedScopes: request.acknowledgedScopes,
    blocker: request.blockerCode ? { code: request.blockerCode, businesses } : null,
    resolutionCode: request.resolutionCode,
    deadlineAt: request.deadlineAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    withdrawnAt: request.withdrawnAt?.toISOString() ?? null,
  };
}

async function serialiseRequestForSupport(request: AccountRequest, events: AccountRequestEvent[]) {
  return {
    ...(await serialiseRequest(request, events)),
    userId: request.userId,
    resolutionNote: request.resolutionNote,
    resolvedByUserId: request.resolvedByUserId,
    events: events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor,
      resolutionCode: event.resolutionCode,
      businessProfileId: event.businessProfileId,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function findRequestForUser(userId: number, id: number): Promise<AccountRequest | null> {
  const [row] = await db
    .select()
    .from(accountRequestsTable)
    .where(and(eq(accountRequestsTable.id, id), eq(accountRequestsTable.userId, userId)))
    .limit(1);
  return row ?? null;
}

// ----------------------------------------------------------------- router ---

export function createAccountLifecycleRouter(options: AccountLifecycleRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const flags = options.flags ?? getFeatureFlags;
  const now = options.now ?? (() => new Date());

  const guarded: RequestHandler[] = [requireFlag("accounts", flags), requireAppUser({ resolveIdentity: options.resolveIdentity })];
  const verifiedGuarded: RequestHandler[] = [
    requireFlag("accounts", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity, requireVerified: true }),
  ];
  const supportGuarded: RequestHandler[] = [...guarded, requireReviewer];

  // ------------------------------------------------------------- requester ---

  router.post("/account/deletion-requests", verifiedGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, DELETION_FIELDS)) return;
    const body = CreateAccountDeletionRequestBody.safeParse(req.body);
    if (!body.success) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: body.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", code: "invalid" })),
      });
      return;
    }
    const acknowledged = new Set(body.data.acknowledgedScopes);
    const missing = ACCOUNT_DELETION_SCOPES.filter((scope) => !acknowledged.has(scope));
    const fieldErrors: ApiFieldError[] = missing.map((scope) => ({ field: `acknowledgedScopes.${scope}`, code: "required" }));
    if (acknowledged.size !== body.data.acknowledgedScopes.length) {
      fieldErrors.push({ field: "acknowledgedScopes", code: "duplicate" });
    }
    if (fieldErrors.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors });
      return;
    }

    const { user, identity } = req.account!;
    const outcome = await db.transaction(async (tx) => {
      // Serialise per user so two concurrent submissions cannot both pass the open-request check.
      await tx.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.id, user.id)).for("update");
      const [open] = await tx
        .select({ id: accountRequestsTable.id })
        .from(accountRequestsTable)
        .where(
          and(
            eq(accountRequestsTable.userId, user.id),
            eq(accountRequestsTable.scope, "account"),
            eq(accountRequestsTable.type, "deletion"),
            inArray(accountRequestsTable.status, [...OPEN_ACCOUNT_REQUEST_STATUSES]),
          ),
        )
        .limit(1);
      if (open) return { kind: "already_open" as const };

      const soleOwned = await findSoleOwnedBusinesses(tx, identity.userId);
      const blocked = soleOwned.length > 0;
      const [request] = await tx
        .insert(accountRequestsTable)
        .values({
          userId: user.id,
          scope: "account",
          type: "deletion",
          status: blocked ? "blocked" : "received",
          acknowledgedScopes: [...ACCOUNT_DELETION_SCOPES],
          blockerCode: blocked ? "blocked_ownership" : null,
          blockerDetails: blocked ? { businessProfileIds: soleOwned.map((business) => business.id) } : null,
        })
        .returning();
      await tx.insert(accountRequestEventsTable).values({
        requestId: request.id,
        fromStatus: null,
        toStatus: request.status,
        actor: "requester",
      });
      await notifyUser(tx, {
        clerkUserId: identity.userId,
        eventCode: blocked ? "account.deletion_blocked" : "account.deletion_received",
        idempotencyKey: `account-request:${request.id}:v${request.version}:${request.status}`,
        payload: { requestId: request.id, status: request.status, blockerCode: request.blockerCode ?? undefined },
      });
      return { kind: "created" as const, request };
    });

    if (outcome.kind === "already_open") {
      sendApiError(req, res, "IDEMPOTENCY_CONFLICT", { fieldErrors: [{ field: "request", code: "already_open" }] });
      return;
    }
    req.log?.info?.(
      { event: "account_request.created", requestId: outcome.request.id, status: outcome.request.status, blockerCode: outcome.request.blockerCode },
      "Account deletion request recorded",
    );
    const events = (await loadEvents([outcome.request.id])).get(outcome.request.id) ?? [];
    res.status(201).json(CreateAccountDeletionRequestResponse.parse(await serialiseRequest(outcome.request, events)));
  });

  router.get("/account/requests", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS)) return;
    const rows = await db
      .select()
      .from(accountRequestsTable)
      .where(eq(accountRequestsTable.userId, req.account!.user.id))
      .orderBy(desc(accountRequestsTable.createdAt), desc(accountRequestsTable.id))
      .limit(50);
    const events = await loadEvents(rows.map((row) => row.id));
    const requests = await Promise.all(rows.map((row) => serialiseRequest(row, events.get(row.id) ?? [])));
    res.json(GetAccountRequestsResponse.parse({ requests }));
  });

  router.post("/account/requests/:id/withdraw", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, WITHDRAW_FIELDS)) return;
    const params = WithdrawAccountRequestParams.safeParse(req.params);
    const body = WithdrawAccountRequestBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid" }] });
      return;
    }
    const { user, identity } = req.account!;
    const existing = await findRequestForUser(user.id, params.data.id);
    if (!existing) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(accountRequestsTable).where(eq(accountRequestsTable.id, existing.id)).for("update");
      if (!locked) return { kind: "not_found" as const };
      if (locked.version !== body.data.expectedVersion) return { kind: "stale" as const, currentVersion: locked.version };
      if (locked.status !== "received" && locked.status !== "blocked") return { kind: "not_withdrawable" as const, currentVersion: locked.version };
      const at = now();
      const [updated] = await tx
        .update(accountRequestsTable)
        .set({ status: "withdrawn", withdrawnAt: at, version: locked.version + 1 })
        .where(eq(accountRequestsTable.id, locked.id))
        .returning();
      await tx.insert(accountRequestEventsTable).values({
        requestId: locked.id,
        fromStatus: locked.status,
        toStatus: "withdrawn",
        actor: "requester",
      });
      await notifyUser(tx, {
        clerkUserId: identity.userId,
        eventCode: "account.deletion_withdrawn",
        idempotencyKey: `account-request:${locked.id}:v${updated.version}:withdrawn`,
        payload: { requestId: locked.id, status: "withdrawn" },
      });
      return { kind: "ok" as const, request: updated };
    });
    if (outcome.kind === "not_found") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (outcome.kind === "stale") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
      return;
    }
    if (outcome.kind === "not_withdrawable") {
      sendApiError(req, res, "VERSION_CONFLICT", {
        expectedVersion: outcome.currentVersion,
        fieldErrors: [{ field: "status", code: "not_withdrawable" }],
      });
      return;
    }
    req.log?.info?.({ event: "account_request.withdrawn", requestId: outcome.request.id }, "Account request withdrawn");
    const events = (await loadEvents([outcome.request.id])).get(outcome.request.id) ?? [];
    res.json(WithdrawAccountRequestResponse.parse(await serialiseRequest(outcome.request, events)));
  });

  router.get("/account/messages", guarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS)) return;
    const messages = await listLifecycleMessagesForUser(req.account!.user.id);
    res.json(GetAccountMessagesResponse.parse({ messages }));
  });

  // --------------------------------------------------------------- support ---

  router.get("/review/account-requests", supportGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, STATUS_QUERY)) return;
    const query = GetSupportAccountRequestsQueryParams.safeParse(req.query);
    if (!query.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "status", code: "invalid" }] });
      return;
    }
    const status = query.data.status as AccountRequestStatus | undefined;
    const rows = await db
      .select()
      .from(accountRequestsTable)
      .where(status ? eq(accountRequestsTable.status, status) : inArray(accountRequestsTable.status, [...OPEN_ACCOUNT_REQUEST_STATUSES]))
      .orderBy(asc(accountRequestsTable.createdAt), asc(accountRequestsTable.id))
      .limit(100);
    const events = await loadEvents(rows.map((row) => row.id));
    const requests = await Promise.all(rows.map((row) => serialiseRequestForSupport(row, events.get(row.id) ?? [])));
    res.json(GetSupportAccountRequestsResponse.parse({ requests }));
  });

  router.post("/review/account-requests/:id/decision", supportGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, DECISION_FIELDS)) return;
    const params = DecideSupportAccountRequestParams.safeParse(req.params);
    const body = DecideSupportAccountRequestBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: body.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", code: "invalid" })),
      });
      return;
    }
    const reviewerId = req.account!.identity.userId;
    const input = body.data;
    const note = input.note?.trim() || null;

    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(accountRequestsTable).where(eq(accountRequestsTable.id, params.data.id)).for("update");
      if (!request) return { kind: "not_found" as const };
      const [requester] = await tx
        .select({ clerkUserId: appUsersTable.clerkUserId })
        .from(appUsersTable)
        .where(eq(appUsersTable.id, request.userId))
        .limit(1);
      if (!requester) return { kind: "not_found" as const };
      if (requester.clerkUserId === reviewerId) return { kind: "self_review" as const };
      if (request.version !== input.expectedVersion) return { kind: "stale" as const, currentVersion: request.version };
      const at = now();
      const audit = async (toStatus: AccountRequestStatus, extra: { resolutionCode?: AccountRequestResolution; businessProfileId?: number } = {}) => {
        await tx.insert(accountRequestEventsTable).values({
          requestId: request.id,
          fromStatus: request.status,
          toStatus,
          actor: "support",
          actorUserId: reviewerId,
          resolutionCode: extra.resolutionCode ?? null,
          businessProfileId: extra.businessProfileId ?? null,
          note,
        });
      };
      const invalid = (field: string, code: string) => ({ kind: "invalid" as const, fieldErrors: [{ field, code }] });

      switch (input.decision) {
        case "start_review": {
          if (request.status !== "received" && request.status !== "blocked") return invalid("status", "not_reviewable");
          const [updated] = await tx
            .update(accountRequestsTable)
            .set({ status: "in_review", version: request.version + 1 })
            .where(eq(accountRequestsTable.id, request.id))
            .returning();
          await audit("in_review");
          await notifyUser(tx, {
            clerkUserId: requester.clerkUserId,
            eventCode: "account.deletion_in_review",
            idempotencyKey: `account-request:${request.id}:v${updated.version}:in_review`,
            payload: { requestId: request.id, status: "in_review" },
          });
          return { kind: "ok" as const, request: updated };
        }
        case "resolve_blocker": {
          if (request.status !== "blocked" && request.status !== "in_review") return invalid("status", "not_blocked");
          if (!request.blockerDetails || request.blockerCode !== "blocked_ownership") return invalid("status", "not_blocked");
          const businessId = input.businessProfileId;
          if (!businessId || !request.blockerDetails.businessProfileIds.includes(businessId)) {
            return invalid("businessProfileId", "not_blocking");
          }
          const resolution = input.resolutionCode;
          if (resolution !== "ownership_transferred" && resolution !== "business_closed" && resolution !== "business_unpublished") {
            return invalid("resolutionCode", "invalid");
          }
          const [profile] = await tx.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId)).for("update");
          if (!profile) return invalid("businessProfileId", "not_found");

          if (resolution === "ownership_transferred") {
            // Transfer is only *recorded* here; the new owner membership must already exist.
            const [other] = await tx
              .select({ id: businessMembersTable.id })
              .from(businessMembersTable)
              .where(
                and(
                  eq(businessMembersTable.businessProfileId, businessId),
                  eq(businessMembersTable.role, "owner"),
                  ne(businessMembersTable.userId, requester.clerkUserId),
                ),
              )
              .limit(1);
            if (!other) return invalid("resolutionCode", "no_other_owner");
          } else {
            const nextStatus = resolution === "business_closed" ? "archived" : "unpublished";
            if (profile.publicationStatus !== nextStatus) {
              await tx
                .update(businessProfilesTable)
                .set({ publicationStatus: nextStatus })
                .where(eq(businessProfilesTable.id, businessId));
              const [reviewRow] = await tx
                .insert(businessReviewsTable)
                .values({
                  targetType: "publication",
                  targetId: businessId,
                  targetVersion: request.version,
                  reviewerUserId: reviewerId,
                  decision: "unpublish",
                  reasonCode: resolution,
                  reason: `account_request:${request.id}`,
                })
                .returning({ id: businessReviewsTable.id });
              await notifyBusinessOwners(tx, {
                businessProfileId: businessId,
                eventCode: resolution === "business_closed" ? "business.closed" : "business.unpublished",
                dedupeScope: `review:${reviewRow.id}`,
                payload: { businessProfileId: businessId, businessName: profile.name, status: nextStatus, resolutionCode: resolution },
              });
            }
          }

          // Re-evaluate: the request only leaves `blocked` when no sole-owned live business remains.
          const remaining = await findSoleOwnedBusinesses(tx, requester.clerkUserId);
          const stillBlocked = remaining.length > 0;
          const nextStatus: AccountRequestStatus = request.status === "in_review" ? "in_review" : stillBlocked ? "blocked" : "received";
          const knownIds = new Set(request.blockerDetails.businessProfileIds);
          for (const business of remaining) knownIds.add(business.id);
          const [updated] = await tx
            .update(accountRequestsTable)
            .set({
              status: nextStatus,
              version: request.version + 1,
              blockerCode: stillBlocked ? "blocked_ownership" : request.blockerCode,
              blockerDetails: { businessProfileIds: [...knownIds] },
            })
            .where(eq(accountRequestsTable.id, request.id))
            .returning();
          await audit(nextStatus, { resolutionCode: resolution, businessProfileId: businessId });
          if (!stillBlocked && request.status === "blocked") {
            await notifyUser(tx, {
              clerkUserId: requester.clerkUserId,
              eventCode: "account.deletion_received",
              idempotencyKey: `account-request:${request.id}:v${updated.version}:received`,
              payload: { requestId: request.id, status: "received", resolutionCode: resolution },
            });
          }
          return { kind: "ok" as const, request: updated };
        }
        case "complete": {
          if (request.status !== "in_review") return invalid("status", "not_in_review");
          const remaining = await findSoleOwnedBusinesses(tx, requester.clerkUserId);
          if (remaining.length > 0) return invalid("status", "ownership_unresolved");
          const [updated] = await tx
            .update(accountRequestsTable)
            .set({
              status: "completed",
              version: request.version + 1,
              resolutionCode: "account_deleted",
              resolutionNote: note,
              resolvedByUserId: reviewerId,
              resolvedAt: at,
            })
            .where(eq(accountRequestsTable.id, request.id))
            .returning();
          // Soft state only: the account stops working immediately; record erasure
          // follows the approved retention configuration and is not performed here.
          await tx.update(appUsersTable).set({ status: "deleted" }).where(eq(appUsersTable.id, request.userId));
          await audit("completed", { resolutionCode: "account_deleted" });
          await notifyUser(tx, {
            clerkUserId: requester.clerkUserId,
            eventCode: "account.deletion_completed",
            idempotencyKey: `account-request:${request.id}:v${updated.version}:completed`,
            payload: { requestId: request.id, status: "completed", resolutionCode: "account_deleted" },
          });
          return { kind: "ok" as const, request: updated };
        }
        case "reject": {
          if (request.status !== "in_review") return invalid("status", "not_in_review");
          const [updated] = await tx
            .update(accountRequestsTable)
            .set({
              status: "rejected",
              version: request.version + 1,
              resolutionCode: "request_rejected",
              resolutionNote: note,
              resolvedByUserId: reviewerId,
              resolvedAt: at,
            })
            .where(eq(accountRequestsTable.id, request.id))
            .returning();
          await audit("rejected", { resolutionCode: "request_rejected" });
          await notifyUser(tx, {
            clerkUserId: requester.clerkUserId,
            eventCode: "account.deletion_rejected",
            idempotencyKey: `account-request:${request.id}:v${updated.version}:rejected`,
            payload: { requestId: request.id, status: "rejected", resolutionCode: "request_rejected" },
          });
          return { kind: "ok" as const, request: updated };
        }
      }
    });

    switch (outcome.kind) {
      case "not_found":
        sendApiError(req, res, "NOT_FOUND");
        return;
      case "self_review":
        sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
        return;
      case "stale":
        sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
        return;
      case "invalid":
        sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: outcome.fieldErrors });
        return;
      case "ok": {
        req.log?.info?.(
          { event: "account_request.decided", requestId: outcome.request.id, decision: input.decision, status: outcome.request.status },
          "Account request decision recorded",
        );
        const events = (await loadEvents([outcome.request.id])).get(outcome.request.id) ?? [];
        res.json(DecideSupportAccountRequestResponse.parse(await serialiseRequestForSupport(outcome.request, events)));
      }
    }
  });

  router.get("/review/lifecycle-messages", supportGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, STATUS_QUERY)) return;
    const query = GetSupportLifecycleMessagesQueryParams.safeParse(req.query);
    if (!query.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "status", code: "invalid" }] });
      return;
    }
    const rows = await db
      .select()
      .from(lifecycleOutboxTable)
      .where(query.data.status ? eq(lifecycleOutboxTable.status, query.data.status) : sql`true`)
      .orderBy(
        // Exhausted retries surface first so support sees what needs a decision.
        sql`case ${lifecycleOutboxTable.status} when 'failed' then 0 when 'queued' then 1 else 2 end`,
        desc(lifecycleOutboxTable.createdAt),
      )
      .limit(100);
    res.json(GetSupportLifecycleMessagesResponse.parse({ messages: rows.map(serialiseLifecycleMessageForSupport) }));
  });

  router.post("/review/lifecycle-messages/:id/resend", supportGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS)) return;
    const params = ResendSupportLifecycleMessageParams.safeParse(req.params);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const result = await requeueFailedLifecycleMessage(params.data.id);
    if (result === "not_found") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (result === "not_failed") {
      sendApiError(req, res, "IDEMPOTENCY_CONFLICT", { fieldErrors: [{ field: "status", code: "not_failed" }] });
      return;
    }
    req.log?.info?.({ event: "lifecycle_message.resend", outboxId: params.data.id }, "Lifecycle message re-queued");
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, params.data.id)).limit(1);
    res.json(ResendSupportLifecycleMessageResponse.parse(serialiseLifecycleMessageForSupport(row!)));
  });

  return router;
}

export default createAccountLifecycleRouter();
