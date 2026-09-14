import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type RequestHandler, type Response } from "express";

import {
  businessClaimsTable,
  businessMembersTable,
  businessProfileRevisionsTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  factChecksTable,
  type BusinessProfile,
  type BusinessProfileRevision,
} from "@workspace/db";
import {
  DiscardBusinessRevisionBody,
  DiscardBusinessRevisionParams,
  DiscardBusinessRevisionResponse,
  GetAuthorityQueueQueryParams,
  GetAuthorityQueueResponse,
  GetBusinessRevisionWorkspaceParams,
  GetBusinessRevisionWorkspaceResponse,
  GetEditorialQueueQueryParams,
  GetEditorialQueueResponse,
  GetPublicationQueueQueryParams,
  GetPublicationQueueResponse,
  ReviewBusinessClaimBody,
  ReviewBusinessClaimParams,
  ReviewBusinessClaimResponse,
  ReviewBusinessRevisionBody,
  ReviewBusinessRevisionParams,
  ReviewBusinessRevisionResponse,
  SetBusinessPublicationBody,
  SetBusinessPublicationParams,
  SetBusinessPublicationResponse,
  SubmitBusinessRevisionBody,
  SubmitBusinessRevisionParams,
  SubmitBusinessRevisionResponse,
  UpdateBusinessRevisionBody,
  UpdateBusinessRevisionParams,
  UpdateBusinessRevisionResponse,
  type ApiFieldError,
} from "@workspace/api-zod";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import { claimKind, serialiseClaim, serialiseProfile } from "../lib/businessClaims";
import { applyClaimDecision } from "../lib/claimDecisions";
import { notifyBusinessOwners } from "../lib/lifecycleNotifications";
import {
  CHECKABLE_FIELDS,
  approvedRevisionFor,
  contentFromProfileColumns,
  deriveOwnerState,
  factChecksFor,
  freshnessFor,
  hasSubmittableContent,
  latestDecisionFor,
  latestRevisionFor,
  mergeContent,
  normaliseContent,
  serialiseFactCheck,
  serialiseReview,
  serialiseRevision,
  validPublicUrl,
  type ContentPatch,
} from "../lib/businessRevisions";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { SelfReviewError, assertNotSelfReview, type IdentityResolver } from "../lib/permissions";
import { requireAppUser } from "../middlewares/requireAppUser";
import { requireFlag } from "../middlewares/requireFlag";

/**
 * Business review publication: owner profile revisions, authority and
 * editorial reviewer queues, exact-version decisions, and publication control.
 *
 * Every route is gated per-route behind the `businessPublication` flag. The
 * four dimensions stay independent on purpose: ownership (claims/members),
 * editorial approval (revision status + approvedRevisionId), publication
 * (publicationStatus), and fact freshness (fact checks) are never collapsed
 * into one another.
 */

export type BusinessPublicationRouterOptions = {
  resolveIdentity?: IdentityResolver;
  flags?: FeatureFlagSource;
  now?: () => Date;
};

const NO_FIELDS: ReadonlySet<string> = new Set();
const PAGE_QUERY_FIELDS: ReadonlySet<string> = new Set(["cursor", "limit"]);
const REVISION_UPDATE_FIELDS: ReadonlySet<string> = new Set(["expectedVersion", "nl", "en", "facts"]);
const TEXT_BLOCK_FIELDS: ReadonlySet<string> = new Set(["tagline", "description", "openingHours"]);
const FACT_BLOCK_FIELDS: ReadonlySet<string> = new Set(["websiteUrl", "phone", "email", "address", "logoUrl", "coverUrl"]);
const TRANSITION_FIELDS: ReadonlySet<string> = new Set(["expectedVersion"]);
const CLAIM_DECISION_FIELDS: ReadonlySet<string> = new Set(["decision", "expectedVersion", "reason"]);
const REVISION_DECISION_FIELDS: ReadonlySet<string> = new Set(["decision", "expectedVersion", "reason", "factChecks"]);
const FACT_CHECK_FIELDS: ReadonlySet<string> = new Set(["field", "status", "sourceUrl", "note"]);
const PUBLICATION_FIELDS: ReadonlySet<string> = new Set(["action", "expectedRevisionVersion", "reason"]);

function zodFieldErrors(issues: { path: PropertyKey[]; code: string }[]): ApiFieldError[] {
  return issues.map((issue) => ({ field: issue.path.map(String).join(".") || "body", code: issue.code }));
}

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
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    for (const [key, allowed] of [
      ["nl", TEXT_BLOCK_FIELDS],
      ["en", TEXT_BLOCK_FIELDS],
      ["facts", FACT_BLOCK_FIELDS],
    ] as const) {
      if (allowedBodyFields.has(key) && body[key] && typeof body[key] === "object") {
        fieldErrors.push(
          ...unknownFieldErrors(body[key], allowed).map((error) => ({ ...error, field: `${key}.${error.field}` })),
        );
      }
    }
    if (allowedBodyFields.has("factChecks") && Array.isArray(body.factChecks)) {
      body.factChecks.forEach((check, index) => {
        if (check && typeof check === "object") {
          fieldErrors.push(
            ...unknownFieldErrors(check, FACT_CHECK_FIELDS).map((error) => ({
              ...error,
              field: `factChecks.${index}.${error.field}`,
            })),
          );
        }
      });
    }
  }
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

function trimmedReason(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Opaque numeric cursor; malformed cursors start from the beginning. */
function decodeCursor(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function summariseProfile(profile: BusinessProfile) {
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    neighborhood: profile.neighborhood,
    category: profile.category,
    listingSource: profile.listingSource,
    sourceUrl: profile.sourceUrl,
    isClaimed: profile.isClaimed,
    publicationStatus: profile.publicationStatus,
  };
}

type MemberRow = { profile: BusinessProfile; role: string };

async function findMemberProfile(profileId: number, userId: string): Promise<MemberRow | null> {
  const [row] = await db
    .select({ profile: businessProfilesTable, role: businessMembersTable.role })
    .from(businessMembersTable)
    .innerJoin(businessProfilesTable, eq(businessMembersTable.businessProfileId, businessProfilesTable.id))
    .where(and(eq(businessMembersTable.businessProfileId, profileId), eq(businessMembersTable.userId, userId)))
    .limit(1);
  if (!row || row.profile.publicationStatus === "archived") return null;
  return row;
}

type Queryable = Pick<typeof db, "select">;

/**
 * Every account that must never review this business: the profile creator,
 * the explicitly passed owners (claimant, revision author), current members,
 * and anyone with an active claim on it. Runs on `db` for queue hints and on
 * the transaction for the authoritative check under the profile lock.
 */
async function reviewerConflicts(
  executor: Queryable,
  reviewerId: string,
  profile: BusinessProfile,
  extraOwners: (string | null)[],
): Promise<boolean> {
  // The author of the currently approved snapshot stays an interested party even
  // after leaving the business, for every dimension (claims, revisions, publication).
  const [approvedAuthor] = profile.approvedRevisionId
    ? await executor
        .select({ authorUserId: businessProfileRevisionsTable.authorUserId })
        .from(businessProfileRevisionsTable)
        .where(eq(businessProfileRevisionsTable.id, profile.approvedRevisionId))
        .limit(1)
    : [];
  try {
    assertNotSelfReview(reviewerId, [profile.createdByUserId, approvedAuthor?.authorUserId ?? null, ...extraOwners]);
  } catch (error) {
    if (error instanceof SelfReviewError) return true;
    throw error;
  }
  const [membership] = await executor
    .select({ id: businessMembersTable.id })
    .from(businessMembersTable)
    .where(and(eq(businessMembersTable.businessProfileId, profile.id), eq(businessMembersTable.userId, reviewerId)))
    .limit(1);
  if (membership) return true;
  const [claim] = await executor
    .select({ id: businessClaimsTable.id })
    .from(businessClaimsTable)
    .where(
      and(
        eq(businessClaimsTable.businessProfileId, profile.id),
        eq(businessClaimsTable.claimantId, reviewerId),
        inArray(businessClaimsTable.status, [...ACTIVE_CLAIMANT_STATUSES]),
      ),
    )
    .limit(1);
  return Boolean(claim);
}

/** Claims that make their claimant an interested party (open, private, or granted). */
const ACTIVE_CLAIMANT_STATUSES: readonly string[] = ["draft", "pending", "submitted", "changes_requested", "disputed", "approved"];

/** Whether a reviewer may decide for this business: not creator, member, claimant, or author. */
async function canReviewerDecide(reviewerId: string, profile: BusinessProfile, extraOwners: (string | null)[]): Promise<boolean> {
  return !(await reviewerConflicts(db, reviewerId, profile, extraOwners));
}

async function buildWorkspace(row: MemberRow, now: () => Date) {
  const profile = row.profile;
  const [latest, approved] = await Promise.all([latestRevisionFor(profile.id), approvedRevisionFor(profile)]);
  const checks = await factChecksFor(approved?.id ?? null);
  const revisionIds = [latest?.id, approved?.id].filter((id): id is number => typeof id === "number");
  const decision = await latestDecisionFor(profile.id, revisionIds);
  const freshness = freshnessFor(checks, now());
  return {
    profile: { ...serialiseProfile(profile), approvedRevisionVersion: approved?.version ?? null },
    role: row.role,
    state: deriveOwnerState({ publicationStatus: profile.publicationStatus, latest, approved, freshness }),
    latestRevision: latest ? serialiseRevision(latest) : null,
    approvedRevision: approved ? serialiseRevision(approved) : null,
    latestDecision: decision ? serialiseReview(decision) : null,
    factChecks: checks.map(serialiseFactCheck),
    freshness,
  };
}

type DraftOutcome =
  | { kind: "ok"; revision: BusinessProfileRevision }
  | { kind: "stale"; currentVersion: number }
  | { kind: "not_editable" }
  | { kind: "invalid"; fieldErrors: ApiFieldError[] };

/**
 * Merge an owner patch into a draft revision. A `draft` is edited in place;
 * any other latest state (none, approved, rejected, changes requested) gets a
 * new draft version seeded from the latest content, or from the legacy
 * columns when the business has no revision yet. The approved row is never
 * touched.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Every owner mutation (save, submit, discard) and every review decision takes
 * the business profile row lock first and only then reads the latest revision
 * (also locked). One lock order means a save can never interleave with a submit
 * or discard of the same draft.
 */
async function lockLatestRevision(tx: Tx, profileId: number) {
  await tx
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, profileId))
    .for("update");
  const [latest] = await tx
    .select()
    .from(businessProfileRevisionsTable)
    .where(
      and(
        eq(businessProfileRevisionsTable.businessProfileId, profileId),
        inArray(businessProfileRevisionsTable.status, ["draft", "submitted", "changes_requested", "approved", "rejected"]),
      ),
    )
    .orderBy(desc(businessProfileRevisionsTable.version))
    .limit(1)
    .for("update");
  return latest ?? null;
}

export async function upsertDraftRevision(
  profile: BusinessProfile,
  authorUserId: string,
  expectedVersion: number,
  patch: ContentPatch,
): Promise<DraftOutcome> {
  return db.transaction(async (tx): Promise<DraftOutcome> => {
    // Profile lock first, then the latest revision: two tabs cannot both create
    // version n+1, and a save cannot overtake a concurrent submit or discard.
    const latest = await lockLatestRevision(tx, profile.id);
    const currentVersion = latest?.version ?? 0;
    if (currentVersion !== expectedVersion) return { kind: "stale", currentVersion };
    if (latest?.status === "submitted") return { kind: "not_editable" };

    const base = latest ? normaliseContent(latest.content) : contentFromProfileColumns(profile);
    const merged = mergeContent(base, patch);
    if (merged.fieldErrors.length > 0) return { kind: "invalid", fieldErrors: merged.fieldErrors };

    if (latest?.status === "draft") {
      const [revision] = await tx
        .update(businessProfileRevisionsTable)
        .set({ content: merged.content, updatedAt: new Date() })
        .where(
          and(
            eq(businessProfileRevisionsTable.id, latest.id),
            eq(businessProfileRevisionsTable.version, latest.version),
            eq(businessProfileRevisionsTable.status, "draft"),
          ),
        )
        .returning();
      // Cannot happen under the lock, but a submitted revision must never be rewritten.
      if (!revision) return { kind: "not_editable" };
      return { kind: "ok", revision };
    }
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${businessProfileRevisionsTable.version}), 0)` })
      .from(businessProfileRevisionsTable)
      .where(eq(businessProfileRevisionsTable.businessProfileId, profile.id));
    const [revision] = await tx
      .insert(businessProfileRevisionsTable)
      .values({
        businessProfileId: profile.id,
        version: Number(maxRow?.max ?? 0) + 1,
        status: "draft",
        content: merged.content,
        authorUserId,
      })
      .returning();
    return { kind: "ok", revision };
  });
}

export function createBusinessPublicationRouter(options: BusinessPublicationRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const flags = options.flags ?? getFeatureFlags;
  const now = options.now ?? (() => new Date());

  const memberGuarded: RequestHandler[] = [
    requireFlag("businessPublication", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity }),
  ];
  const ownerGuarded: RequestHandler[] = [
    requireFlag("businessPublication", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity, requireVerified: true }),
  ];
  const reviewerGuarded: RequestHandler[] = [
    requireFlag("businessPublication", flags),
    requireAppUser({ resolveIdentity: options.resolveIdentity }),
    requireReviewer,
  ];

  // ---------------------------------------------------------------- owner ---

  router.get("/business-profiles/:id/revision", memberGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS)) return;
    const params = GetBusinessRevisionWorkspaceParams.safeParse(req.params);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const row = await findMemberProfile(params.data.id, req.account!.identity.userId);
    if (!row) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    res.json(GetBusinessRevisionWorkspaceResponse.parse(await buildWorkspace(row, now)));
  });

  router.patch("/business-profiles/:id/revision", ownerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, REVISION_UPDATE_FIELDS)) return;
    const params = UpdateBusinessRevisionParams.safeParse(req.params);
    const body = UpdateBusinessRevisionBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(body.error.issues) });
      return;
    }
    if (!Number.isInteger(body.data.expectedVersion) || body.data.expectedVersion < 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    const userId = req.account!.identity.userId;
    const row = await findMemberProfile(params.data.id, userId);
    if (!row) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (row.role !== "owner") {
      sendApiError(req, res, "FORBIDDEN");
      return;
    }
    const outcome = await upsertDraftRevision(row.profile, userId, body.data.expectedVersion, {
      nl: body.data.nl,
      en: body.data.en,
      facts: body.data.facts,
    });
    if (outcome.kind === "stale") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
      return;
    }
    if (outcome.kind === "not_editable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_editable" }] });
      return;
    }
    if (outcome.kind === "invalid") {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: outcome.fieldErrors });
      return;
    }
    req.log?.info?.(
      { event: "business_publication.draft_saved", profileId: row.profile.id, revisionId: outcome.revision.id },
      "Business profile draft saved",
    );
    res.json(UpdateBusinessRevisionResponse.parse(await buildWorkspace(row, now)));
  });

  router.post("/business-profiles/:id/revision/submit", ownerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, TRANSITION_FIELDS)) return;
    const params = SubmitBusinessRevisionParams.safeParse(req.params);
    const body = SubmitBusinessRevisionBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    const userId = req.account!.identity.userId;
    const row = await findMemberProfile(params.data.id, userId);
    if (!row) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (row.role !== "owner") {
      sendApiError(req, res, "FORBIDDEN");
      return;
    }
    const expectedVersion = body.data.expectedVersion;
    type Outcome = "ok" | "not_submittable" | "empty" | { conflict: number };
    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const latest = await lockLatestRevision(tx, row.profile.id);
      const currentVersion = latest?.version ?? 0;
      if (currentVersion !== expectedVersion) return { conflict: currentVersion };
      if (!latest || latest.status !== "draft") return "not_submittable";
      if (!hasSubmittableContent(normaliseContent(latest.content))) return "empty";
      const [submitted] = await tx
        .update(businessProfileRevisionsTable)
        .set({ status: "submitted", submittedAt: new Date(), decidedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(businessProfileRevisionsTable.id, latest.id),
            eq(businessProfileRevisionsTable.version, latest.version),
            eq(businessProfileRevisionsTable.status, "draft"),
          ),
        )
        .returning({ id: businessProfileRevisionsTable.id });
      if (!submitted) return "not_submittable";
      return "ok";
    });
    if (outcome === "not_submittable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_submittable" }] });
      return;
    }
    if (outcome === "empty") {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "nl.description", code: "required" }] });
      return;
    }
    if (typeof outcome === "object") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.conflict });
      return;
    }
    req.log?.info?.(
      { event: "business_publication.revision_submitted", profileId: row.profile.id, version: expectedVersion },
      "Business profile revision submitted",
    );
    res.json(SubmitBusinessRevisionResponse.parse(await buildWorkspace(row, now)));
  });

  router.post("/business-profiles/:id/revision/discard", memberGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, TRANSITION_FIELDS)) return;
    const params = DiscardBusinessRevisionParams.safeParse(req.params);
    const body = DiscardBusinessRevisionBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "expectedVersion", code: "invalid_type" }] });
      return;
    }
    const userId = req.account!.identity.userId;
    const row = await findMemberProfile(params.data.id, userId);
    if (!row) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (row.role !== "owner") {
      sendApiError(req, res, "FORBIDDEN");
      return;
    }
    const expectedVersion = body.data.expectedVersion;
    type DiscardOutcome = "ok" | "not_discardable" | { conflict: number };
    const outcome = await db.transaction(async (tx): Promise<DiscardOutcome> => {
      const latest = await lockLatestRevision(tx, row.profile.id);
      const currentVersion = latest?.version ?? 0;
      if (currentVersion !== expectedVersion) return { conflict: currentVersion };
      if (!latest || latest.status !== "draft") return "not_discardable";
      const [discarded] = await tx
        .update(businessProfileRevisionsTable)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(businessProfileRevisionsTable.id, latest.id),
            eq(businessProfileRevisionsTable.version, latest.version),
            eq(businessProfileRevisionsTable.status, "draft"),
          ),
        )
        .returning({ id: businessProfileRevisionsTable.id });
      return discarded ? "ok" : "not_discardable";
    });
    if (typeof outcome === "object") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.conflict });
      return;
    }
    if (outcome === "not_discardable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_discardable" }] });
      return;
    }
    res.json(DiscardBusinessRevisionResponse.parse(await buildWorkspace(row, now)));
  });

  // ------------------------------------------------------------- reviewer ---

  router.get("/review/claims", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, PAGE_QUERY_FIELDS)) return;
    const query = GetAuthorityQueueQueryParams.safeParse(req.query);
    if (!query.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(query.error.issues) });
      return;
    }
    const limit = Math.floor(query.data.limit);
    const after = decodeCursor(query.data.cursor);
    const reviewerId = req.account!.identity.userId;
    const rows = await db
      .select({ claim: businessClaimsTable, profile: businessProfilesTable })
      .from(businessClaimsTable)
      .innerJoin(businessProfilesTable, eq(businessClaimsTable.businessProfileId, businessProfilesTable.id))
      .where(
        and(
          inArray(businessClaimsTable.status, ["pending", "submitted", "disputed"]),
          ne(businessProfilesTable.publicationStatus, "archived"),
          after !== null ? gt(businessClaimsTable.id, after) : undefined,
        ),
      )
      .orderBy(asc(businessClaimsTable.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const items = [];
    for (const { claim, profile } of page) {
      items.push({
        id: claim.id,
        version: claim.version,
        status: claim.status,
        kind: claimKind(profile),
        relationship: claim.relationship,
        authorityDeclaration: claim.authorityDeclaration,
        evidenceReference: claim.evidenceReference,
        message: claim.message,
        contactName: claim.contactName,
        submittedAt: claim.updatedAt.toISOString(),
        createdAt: claim.createdAt.toISOString(),
        profile: summariseProfile(profile),
        canDecide: await canReviewerDecide(reviewerId, profile, [claim.claimantId]),
      });
    }
    res.json(
      GetAuthorityQueueResponse.parse({
        items,
        pageInfo: {
          hasMore: rows.length > limit,
          nextCursor: rows.length > limit ? String(page[page.length - 1]!.claim.id) : null,
        },
      }),
    );
  });

  router.post("/review/claims/:id/decision", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, CLAIM_DECISION_FIELDS)) return;
    const params = ReviewBusinessClaimParams.safeParse(req.params);
    const body = ReviewBusinessClaimBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: body.success ? [{ field: "expectedVersion", code: "invalid_type" }] : zodFieldErrors(body.error.issues),
      });
      return;
    }
    const reviewerId = req.account!.identity.userId;
    const outcome = await applyClaimDecision({
      claimId: params.data.id,
      reviewerId,
      decision: body.data.decision,
      expectedVersion: body.data.expectedVersion,
      reason: trimmedReason(body.data.reason),
    });
    switch (outcome.kind) {
      case "not_found":
        sendApiError(req, res, "NOT_FOUND");
        return;
      case "not_reviewable":
        sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_reviewable" }] });
        return;
      case "stale":
        sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
        return;
      case "reason_required":
        sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "reason", code: "required" }] });
        return;
      case "self_review":
        sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
        return;
      case "conflict":
        sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "owner_exists" }] });
        return;
      case "decided":
        break;
    }
    req.log?.info?.(
      { event: "business_publication.claim_decided", claimId: outcome.claim.id, decision: body.data.decision },
      "Business claim decided",
    );
    res.json(ReviewBusinessClaimResponse.parse(serialiseClaim(outcome.claim, outcome.profile)));
  });

  router.get("/review/revisions", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, PAGE_QUERY_FIELDS)) return;
    const query = GetEditorialQueueQueryParams.safeParse(req.query);
    if (!query.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(query.error.issues) });
      return;
    }
    const limit = Math.floor(query.data.limit);
    const after = decodeCursor(query.data.cursor);
    const reviewerId = req.account!.identity.userId;
    const rows = await db
      .select({ revision: businessProfileRevisionsTable, profile: businessProfilesTable })
      .from(businessProfileRevisionsTable)
      .innerJoin(businessProfilesTable, eq(businessProfileRevisionsTable.businessProfileId, businessProfilesTable.id))
      .where(
        and(
          eq(businessProfileRevisionsTable.status, "submitted"),
          ne(businessProfilesTable.publicationStatus, "archived"),
          after !== null ? gt(businessProfileRevisionsTable.id, after) : undefined,
        ),
      )
      .orderBy(asc(businessProfileRevisionsTable.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const items = [];
    for (const { revision, profile } of page) {
      const approved = await approvedRevisionFor(profile);
      items.push({
        revision: serialiseRevision(revision),
        profile: summariseProfile(profile),
        approvedRevision: approved ? serialiseRevision(approved) : null,
        canDecide: await canReviewerDecide(reviewerId, profile, [revision.authorUserId]),
      });
    }
    res.json(
      GetEditorialQueueResponse.parse({
        items,
        pageInfo: {
          hasMore: rows.length > limit,
          nextCursor: rows.length > limit ? String(page[page.length - 1]!.revision.id) : null,
        },
      }),
    );
  });

  router.post("/review/revisions/:id/decision", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, REVISION_DECISION_FIELDS)) return;
    const params = ReviewBusinessRevisionParams.safeParse(req.params);
    const body = ReviewBusinessRevisionBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: body.success ? [{ field: "expectedVersion", code: "invalid_type" }] : zodFieldErrors(body.error.issues),
      });
      return;
    }
    const reason = trimmedReason(body.data.reason);
    const decision = body.data.decision;
    if (decision !== "approve" && !reason) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "reason", code: "required" }] });
      return;
    }
    const factChecks = body.data.factChecks ?? [];
    const checkErrors: ApiFieldError[] = [];
    const seenFields = new Set<string>();
    factChecks.forEach((check, index) => {
      if (!CHECKABLE_FIELDS.has(check.field)) checkErrors.push({ field: `factChecks.${index}.field`, code: "unknown" });
      if (seenFields.has(check.field)) checkErrors.push({ field: `factChecks.${index}.field`, code: "duplicate" });
      seenFields.add(check.field);
      if (!validPublicUrl(check.sourceUrl ?? null)) checkErrors.push({ field: `factChecks.${index}.sourceUrl`, code: "invalid_url" });
    });
    if (checkErrors.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: checkErrors });
      return;
    }

    const reviewerId = req.account!.identity.userId;
    const [existing] = await db
      .select({ revision: businessProfileRevisionsTable, profile: businessProfilesTable })
      .from(businessProfileRevisionsTable)
      .innerJoin(businessProfilesTable, eq(businessProfileRevisionsTable.businessProfileId, businessProfilesTable.id))
      .where(eq(businessProfileRevisionsTable.id, params.data.id))
      .limit(1);
    if (!existing || existing.profile.publicationStatus === "archived") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!(await canReviewerDecide(reviewerId, existing.profile, [existing.revision.authorUserId]))) {
      sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
      return;
    }

    type Outcome =
      | { kind: "ok"; revision: BusinessProfileRevision; profile: BusinessProfile }
      | { kind: "stale"; currentVersion: number }
      | { kind: "not_reviewable" }
      | { kind: "self_review" };
    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const [profile] = await tx
        .select()
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, existing.profile.id))
        .for("update");
      const [revision] = await tx
        .select()
        .from(businessProfileRevisionsTable)
        .where(eq(businessProfileRevisionsTable.id, existing.revision.id))
        .for("update");
      if (!profile || !revision) return { kind: "not_reviewable" };
      // Re-checked under lock: a membership or claim created meanwhile still blocks the decision.
      if (await reviewerConflicts(tx, reviewerId, profile, [revision.authorUserId])) return { kind: "self_review" };
      // A decision targets exactly the version the reviewer saw; a newer submission
      // (or any other status change) makes the stale decision a conflict.
      const [newest] = await tx
        .select({ version: businessProfileRevisionsTable.version })
        .from(businessProfileRevisionsTable)
        .where(
          and(
            eq(businessProfileRevisionsTable.businessProfileId, profile.id),
            inArray(businessProfileRevisionsTable.status, ["draft", "submitted", "changes_requested", "approved", "rejected"]),
          ),
        )
        .orderBy(desc(businessProfileRevisionsTable.version))
        .limit(1);
      if (revision.version !== body.data.expectedVersion || (newest && newest.version !== revision.version)) {
        return { kind: "stale", currentVersion: newest?.version ?? revision.version };
      }
      if (revision.status !== "submitted") return { kind: "not_reviewable" };

      const nextStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
      const decidedAt = new Date();
      const [decided] = await tx
        .update(businessProfileRevisionsTable)
        .set({ status: nextStatus, decidedAt, updatedAt: decidedAt })
        .where(and(eq(businessProfileRevisionsTable.id, revision.id), eq(businessProfileRevisionsTable.status, "submitted")))
        .returning();
      if (!decided) return { kind: "not_reviewable" };
      let nextProfile = profile;
      if (decision === "approve") {
        if (profile.approvedRevisionId !== null && profile.approvedRevisionId !== revision.id) {
          await tx
            .update(businessProfileRevisionsTable)
            .set({ status: "superseded", updatedAt: decidedAt })
            .where(
              and(
                eq(businessProfileRevisionsTable.id, profile.approvedRevisionId),
                eq(businessProfileRevisionsTable.status, "approved"),
              ),
            );
        }
        [nextProfile] = await tx
          .update(businessProfilesTable)
          .set({ approvedRevisionId: revision.id })
          .where(eq(businessProfilesTable.id, profile.id))
          .returning();
        if (factChecks.length > 0) {
          await tx.insert(factChecksTable).values(
            factChecks.map((check) => ({
              revisionId: revision.id,
              field: check.field,
              status: check.status,
              sourceUrl: trimmedReason(check.sourceUrl ?? undefined),
              checkedOn: check.status === "unchecked" ? null : decidedAt,
              reviewerUserId: reviewerId,
              note: trimmedReason(check.note ?? undefined),
            })),
          );
        }
      }
      const [reviewRow] = await tx
        .insert(businessReviewsTable)
        .values({
          targetType: "revision",
          targetId: revision.id,
          targetVersion: revision.version,
          reviewerUserId: reviewerId,
          decision,
          reasonCode: decision === "approve" ? null : decision,
          reason,
        })
        .returning({ id: businessReviewsTable.id });
      await notifyBusinessOwners(tx, {
        businessProfileId: profile.id,
        eventCode: decision === "approve" ? "revision.approved" : decision === "reject" ? "revision.rejected" : "revision.changes_requested",
        dedupeScope: `review:${reviewRow.id}`,
        payload: { businessProfileId: profile.id, businessName: profile.name, revisionVersion: revision.version, status: nextStatus },
      });
      return { kind: "ok", revision: decided, profile: nextProfile };
    });

    if (outcome.kind === "stale") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
      return;
    }
    if (outcome.kind === "not_reviewable") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "not_reviewable" }] });
      return;
    }
    if (outcome.kind === "self_review") {
      sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
      return;
    }
    req.log?.info?.(
      { event: "business_publication.revision_decided", revisionId: outcome.revision.id, decision },
      "Business profile revision decided",
    );
    const approved = await approvedRevisionFor(outcome.profile);
    res.json(
      ReviewBusinessRevisionResponse.parse({
        revision: serialiseRevision(outcome.revision),
        profile: summariseProfile(outcome.profile),
        approvedRevision: approved ? serialiseRevision(approved) : null,
        canDecide: false,
      }),
    );
  });

  router.get("/review/businesses", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, NO_FIELDS, PAGE_QUERY_FIELDS)) return;
    const query = GetPublicationQueueQueryParams.safeParse(req.query);
    if (!query.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: zodFieldErrors(query.error.issues) });
      return;
    }
    const limit = Math.floor(query.data.limit);
    const before = decodeCursor(query.data.cursor);
    const reviewerId = req.account!.identity.userId;
    const rows = await db
      .select()
      .from(businessProfilesTable)
      .where(
        and(
          or(
            sql`${businessProfilesTable.approvedRevisionId} is not null`,
            inArray(businessProfilesTable.publicationStatus, ["draft", "unpublished", "suspended"]),
          ),
          ne(businessProfilesTable.publicationStatus, "archived"),
          before !== null ? lt(businessProfilesTable.id, before) : undefined,
        ),
      )
      .orderBy(desc(businessProfilesTable.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const items = [];
    for (const profile of page) {
      const approved = await approvedRevisionFor(profile);
      const checks = await factChecksFor(approved?.id ?? null);
      const decision = await latestDecisionFor(profile.id, approved ? [approved.id] : []);
      items.push({
        profile: summariseProfile(profile),
        approvedRevision: approved ? serialiseRevision(approved) : null,
        latestDecision: decision ? serialiseReview(decision) : null,
        freshness: freshnessFor(checks, now()),
        // The approved snapshot's author is an interested party even after leaving the business.
        canDecide: await canReviewerDecide(reviewerId, profile, approved ? [approved.authorUserId] : []),
      });
    }
    res.json(
      GetPublicationQueueResponse.parse({
        items,
        pageInfo: {
          hasMore: rows.length > limit,
          nextCursor: rows.length > limit ? String(page[page.length - 1]!.id) : null,
        },
      }),
    );
  });

  router.post("/review/businesses/:id/publication", reviewerGuarded, async (req: Request, res: Response): Promise<void> => {
    if (rejectClientFields(req, res, PUBLICATION_FIELDS)) return;
    const params = SetBusinessPublicationParams.safeParse(req.params);
    const body = SetBusinessPublicationBody.safeParse(req.body);
    if (!params.success) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    if (!body.success || !Number.isInteger(body.data.expectedRevisionVersion)) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: body.success
          ? [{ field: "expectedRevisionVersion", code: "invalid_type" }]
          : zodFieldErrors(body.error.issues),
      });
      return;
    }
    const action = body.data.action;
    const reason = trimmedReason(body.data.reason);
    if (action !== "publish" && !reason) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "reason", code: "required" }] });
      return;
    }
    const reviewerId = req.account!.identity.userId;
    const [existing] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, params.data.id)).limit(1);
    if (!existing || existing.publicationStatus === "archived") {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const existingApproved = await approvedRevisionFor(existing);
    if (!(await canReviewerDecide(reviewerId, existing, existingApproved ? [existingApproved.authorUserId] : []))) {
      sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
      return;
    }

    type Outcome =
      | { kind: "ok"; profile: BusinessProfile; approved: BusinessProfileRevision | null }
      | { kind: "stale"; currentVersion: number }
      | { kind: "no_snapshot" }
      | { kind: "self_review" }
      | { kind: "invalid_transition"; status: string };
    const outcome = await db.transaction(async (tx): Promise<Outcome> => {
      const [profile] = await tx
        .select()
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, existing.id))
        .for("update");
      if (!profile) return { kind: "invalid_transition", status: "archived" };
      const [approved] = profile.approvedRevisionId
        ? await tx
            .select()
            .from(businessProfileRevisionsTable)
            .where(
              and(
                eq(businessProfileRevisionsTable.id, profile.approvedRevisionId),
                eq(businessProfileRevisionsTable.status, "approved"),
              ),
            )
            .limit(1)
        : [];
      // Re-checked under the profile lock so a concurrently granted membership or claim
      // cannot slip through; the snapshot's author stays excluded after leaving the business.
      if (await reviewerConflicts(tx, reviewerId, profile, approved ? [approved.authorUserId] : [])) {
        return { kind: "self_review" };
      }
      const currentVersion = approved?.version ?? 0;
      if (currentVersion !== body.data.expectedRevisionVersion) return { kind: "stale", currentVersion };

      const from = profile.publicationStatus;
      let to: string;
      if (action === "publish") {
        // Publishing needs a reviewed snapshot; legacy column-only profiles cannot be
        // (re)published through this route without an approved revision.
        if (!approved) return { kind: "no_snapshot" };
        if (from !== "draft" && from !== "unpublished" && from !== "suspended") {
          return { kind: "invalid_transition", status: from };
        }
        to = "published";
      } else if (action === "unpublish") {
        if (from !== "published" && from !== "suspended") return { kind: "invalid_transition", status: from };
        to = "unpublished";
      } else {
        if (from !== "published" && from !== "unpublished" && from !== "draft") {
          return { kind: "invalid_transition", status: from };
        }
        to = "suspended";
      }
      const [updated] = await tx
        .update(businessProfilesTable)
        .set({ publicationStatus: to })
        .where(and(eq(businessProfilesTable.id, profile.id), eq(businessProfilesTable.publicationStatus, from)))
        .returning();
      if (!updated) return { kind: "invalid_transition", status: from };
      const [reviewRow] = await tx
        .insert(businessReviewsTable)
        .values({
          targetType: "publication",
          targetId: profile.id,
          targetVersion: currentVersion,
          reviewerUserId: reviewerId,
          decision: action,
          reasonCode: action === "publish" ? null : action,
          reason,
        })
        .returning({ id: businessReviewsTable.id });
      // Owners learn about the transition through the outbox committed here; the
      // reviewer's reason is an audit field and is not part of the message.
      await notifyBusinessOwners(tx, {
        businessProfileId: profile.id,
        eventCode: to === "published" ? "business.published" : to === "unpublished" ? "business.unpublished" : "business.suspended",
        dedupeScope: `review:${reviewRow.id}`,
        payload: { businessProfileId: profile.id, businessName: profile.name, status: to },
      });
      return { kind: "ok", profile: updated, approved: approved ?? null };
    });

    if (outcome.kind === "stale") {
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.currentVersion });
      return;
    }
    if (outcome.kind === "self_review") {
      sendApiError(req, res, "SELF_REVIEW_FORBIDDEN");
      return;
    }
    if (outcome.kind === "no_snapshot") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "approvedRevision", code: "required" }] });
      return;
    }
    if (outcome.kind === "invalid_transition") {
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "publicationStatus", code: "invalid_transition" }] });
      return;
    }
    req.log?.info?.(
      { event: "business_publication.publication_changed", profileId: outcome.profile.id, action },
      "Business publication state changed",
    );
    const checks = await factChecksFor(outcome.approved?.id ?? null);
    const decision = await latestDecisionFor(outcome.profile.id, outcome.approved ? [outcome.approved.id] : []);
    res.json(
      SetBusinessPublicationResponse.parse({
        profile: summariseProfile(outcome.profile),
        approvedRevision: outcome.approved ? serialiseRevision(outcome.approved) : null,
        latestDecision: decision ? serialiseReview(decision) : null,
        freshness: freshnessFor(checks, now()),
        canDecide: true,
      }),
    );
  });

  return router;
}

export default createBusinessPublicationRouter();
