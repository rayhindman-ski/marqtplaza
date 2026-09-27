import { clerkClient } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import {
  acceptInvitation,
  changeMemberRole,
  closeBusiness,
  inviteMember,
  isMemberRole,
  listMembership,
  memberRoleOf,
  removeMember,
  revokeInvitation,
  transferOwnership,
  type MembershipError,
} from "../lib/businessMembership";
import { safeErrorSummary, SlidingWindowLimiter } from "../lib/consumerRegistration";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { logger } from "../lib/logger";
import { requireAppUser, type RequireAppUserOptions } from "../middlewares/requireAppUser";
import { requireFlag } from "../middlewares/requireFlag";

/**
 * Business membership routes (v0.5.2, BMEM-001…006, BSEC-001…005).
 *
 * Gate order is fixed: feature flag (404 while closed) → verified active
 * account → business role. Non-members receive 404 for a business they are not
 * part of, so the surface never confirms which businesses exist for whom;
 * members without the required role receive 403.
 */

/** Resolves the verified primary e-mail of an account; injected in tests. */
export type AccountEmailLookup = (clerkUserId: string) => Promise<string | null>;

export const clerkAccountEmail: AccountEmailLookup = async (clerkUserId) => {
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== "verified") return null;
    return primary.emailAddress;
  } catch (error) {
    logger.warn({ error: safeErrorSummary(error), event: "business_membership.email_lookup_failed" }, "Account e-mail lookup failed");
    throw new AccountEmailUnavailableError();
  }
};

export class AccountEmailUnavailableError extends Error {
  constructor() {
    super("Account e-mail lookup unavailable");
    this.name = "AccountEmailUnavailableError";
  }
}

/** Display names for member rows; injected in tests. Never returns addresses. */
export type MemberDisplayLookup = (clerkUserIds: string[]) => Promise<Map<string, string>>;

export const clerkMemberDisplay: MemberDisplayLookup = async (clerkUserIds) => {
  const names = new Map<string, string>();
  if (clerkUserIds.length === 0) return names;
  try {
    const page = await clerkClient.users.getUserList({ userId: clerkUserIds, limit: Math.min(100, clerkUserIds.length) });
    for (const user of page.data) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      if (name) names.set(user.id, name);
    }
  } catch (error) {
    logger.warn({ error: safeErrorSummary(error), event: "business_membership.display_lookup_failed" }, "Member display lookup failed");
  }
  return names;
};

export type BusinessMembershipRouterOptions = {
  flags?: FeatureFlagSource;
  resolveIdentity?: RequireAppUserOptions["resolveIdentity"];
  accountEmail?: AccountEmailLookup;
  memberDisplay?: MemberDisplayLookup;
  limiter?: SlidingWindowLimiter;
  now?: () => Date;
  clientKey?: (req: Request) => string;
};

const INVITE_FIELDS: ReadonlySet<string> = new Set(["email", "role"]);
const ROLE_FIELDS: ReadonlySet<string> = new Set(["role"]);
const TRANSFER_FIELDS: ReadonlySet<string> = new Set(["memberId"]);
const ACCEPT_FIELDS: ReadonlySet<string> = new Set(["token"]);
const CLOSE_FIELDS: ReadonlySet<string> = new Set(["confirm"]);

const ACCEPT_PER_NETWORK_PER_TEN_MINUTES = 20;
const INVITES_PER_ACCOUNT_PER_HOUR = 30;
const TEN_MINUTES = 10 * 60_000;
const HOUR = 60 * 60_000;

function positiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function bodyOf(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

function sendMembershipError(req: Request, res: Response, error: MembershipError): void {
  switch (error.kind) {
    case "not_found":
      sendApiError(req, res, "NOT_FOUND");
      return;
    case "forbidden":
      sendApiError(req, res, "FORBIDDEN");
      return;
    case "last_owner":
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "role", code: "last_owner" }] });
      return;
    case "invalid":
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: error.field, code: error.code }] });
      return;
    case "duplicate_invitation":
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "email", code: "already_invited" }] });
      return;
    case "already_member":
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "email", code: "already_member" }] });
      return;
    case "invalid_transition":
      sendApiError(req, res, "VERSION_CONFLICT", { fieldErrors: [{ field: "status", code: "invalid_transition" }] });
      return;
  }
}

export function createBusinessMembershipRouter(options: BusinessMembershipRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const flags = options.flags ?? getFeatureFlags;
  const accountEmail = options.accountEmail ?? clerkAccountEmail;
  const memberDisplay = options.memberDisplay ?? clerkMemberDisplay;
  const limiter = options.limiter ?? new SlidingWindowLimiter();
  const now = options.now ?? (() => new Date());
  const clientKey = options.clientKey ?? ((req: Request) => req.ip || req.socket.remoteAddress || "unknown");

  const guard = [requireFlag("businessOnboarding", flags), requireAppUser({ resolveIdentity: options.resolveIdentity, requireVerified: true })];
  router.use("/businesses/:id/members", guard);
  router.use("/businesses/:id/invitations", guard);
  router.use("/businesses/:id/ownership", guard);
  router.use("/businesses/:id/close", guard);
  router.use("/business-invitations", guard);

  /** Membership gate for `:id` routes: 404 for non-members, 403 below the required role. */
  async function requireBusinessRole(req: Request, res: Response, role: "owner" | "member"): Promise<{ businessId: number; role: "owner" | "manager" } | null> {
    const businessId = positiveInt(req.params.id);
    if (!businessId) {
      sendApiError(req, res, "NOT_FOUND");
      return null;
    }
    const memberRole = await memberRoleOf(businessId, req.account!.identity.userId);
    if (!memberRole) {
      sendApiError(req, res, "NOT_FOUND");
      return null;
    }
    if (role === "owner" && memberRole !== "owner") {
      sendApiError(req, res, "FORBIDDEN");
      return null;
    }
    return { businessId, role: memberRole };
  }

  router.get("/businesses/:id/members", async (req, res): Promise<void> => {
    const gate = await requireBusinessRole(req, res, "member");
    if (!gate) return;
    const at = now();
    const { members, invitations } = await listMembership(gate.businessId, at);
    const names = await memberDisplay(members.map((member) => member.userId));
    const self = req.account!.identity.userId;
    res.json({
      businessId: gate.businessId,
      viewerRole: gate.role,
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        displayName: names.get(member.userId) ?? null,
        isSelf: member.userId === self,
        joinedAt: member.joinedAt.toISOString(),
      })),
      // Invitations carry addresses; only owners may see them.
      invitations:
        gate.role === "owner"
          ? invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.normalizedEmail,
              role: invitation.role,
              status: invitation.status,
              expiresAt: invitation.expiresAt.toISOString(),
              createdAt: invitation.createdAt.toISOString(),
            }))
          : [],
    });
  });

  router.post("/businesses/:id/invitations", async (req, res): Promise<void> => {
    // Membership first: an outsider learns nothing from validation errors (404 before 400).
    const gate = await requireBusinessRole(req, res, "owner");
    if (!gate) return;
    const unknown = unknownFieldErrors(req.body, INVITE_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    const body = bodyOf(req);
    const fieldErrors: { field: string; code: string }[] = [];
    if (typeof body.email !== "string" || body.email.trim().length === 0) fieldErrors.push({ field: "email", code: "required" });
    if (!isMemberRole(body.role)) fieldErrors.push({ field: "role", code: "invalid_enum_value" });
    if (fieldErrors.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors });
      return;
    }
    const at = now();
    const budget = limiter.check(`invite:${req.account!.identity.userId}`, INVITES_PER_ACCOUNT_PER_HOUR, HOUR, at.getTime());
    if (!budget.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(budget.retryAfterMs / 1000)));
      sendApiError(req, res, "RATE_LIMITED");
      return;
    }
    const result = await inviteMember({
      businessProfileId: gate.businessId,
      actorUserId: req.account!.identity.userId,
      email: body.email as string,
      role: body.role as "owner" | "manager",
      locale: req.account!.user.locale,
      now: at,
    });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    req.log?.info?.({ event: "business_membership.invited", businessId: gate.businessId, invitationId: result.value.invitationId }, "Business member invited");
    res.status(201).json({ id: result.value.invitationId, role: body.role, expiresAt: result.value.expiresAt.toISOString(), status: "open" });
  });

  router.delete("/businesses/:id/invitations/:invitationId", async (req, res): Promise<void> => {
    const gate = await requireBusinessRole(req, res, "owner");
    if (!gate) return;
    const invitationId = positiveInt(req.params.invitationId);
    if (!invitationId) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const result = await revokeInvitation({ businessProfileId: gate.businessId, invitationId, actorUserId: req.account!.identity.userId, now: now() });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    res.json({ id: invitationId, status: "revoked" });
  });

  router.post("/business-invitations/accept", async (req, res): Promise<void> => {
    const unknown = unknownFieldErrors(req.body, ACCEPT_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    const body = bodyOf(req);
    if (typeof body.token !== "string" || body.token.length === 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "token", code: "required" }] });
      return;
    }
    const at = now();
    const decision = limiter.check(`accept:${clientKey(req)}`, ACCEPT_PER_NETWORK_PER_TEN_MINUTES, TEN_MINUTES, at.getTime());
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(decision.retryAfterMs / 1000)));
      sendApiError(req, res, "RATE_LIMITED");
      return;
    }
    let userEmail: string | null;
    try {
      userEmail = await accountEmail(req.account!.identity.userId);
    } catch (error) {
      if (error instanceof AccountEmailUnavailableError) {
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
        return;
      }
      throw error;
    }
    const result = await acceptInvitation({ token: body.token, userId: req.account!.identity.userId, userEmail, now: at });
    if (!result.ok) {
      req.log?.info?.({ event: "business_membership.accept_rejected", reason: result.reason }, "Business invitation not accepted");
      res.status(result.reason === "email_mismatch" ? 403 : 409).json({ accepted: false, reason: result.reason });
      return;
    }
    req.log?.info?.({ event: "business_membership.accepted", businessId: result.businessProfileId }, "Business invitation accepted");
    res.json({ accepted: true, businessId: result.businessProfileId, businessName: result.businessName, role: result.role });
  });

  router.patch("/businesses/:id/members/:memberId", async (req, res): Promise<void> => {
    // Membership first: an outsider learns nothing from validation errors (404 before 400).
    const gate = await requireBusinessRole(req, res, "owner");
    if (!gate) return;
    const unknown = unknownFieldErrors(req.body, ROLE_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    const memberId = positiveInt(req.params.memberId);
    if (!memberId) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const role = bodyOf(req).role;
    if (!isMemberRole(role)) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "role", code: "invalid_enum_value" }] });
      return;
    }
    const result = await changeMemberRole({ businessProfileId: gate.businessId, memberId, actorUserId: req.account!.identity.userId, role, now: now() });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    res.json({ id: memberId, role });
  });

  router.delete("/businesses/:id/members/:memberId", async (req, res): Promise<void> => {
    const gate = await requireBusinessRole(req, res, "member");
    if (!gate) return;
    const memberId = positiveInt(req.params.memberId);
    if (!memberId) {
      sendApiError(req, res, "NOT_FOUND");
      return;
    }
    const result = await removeMember({ businessProfileId: gate.businessId, memberId, actorUserId: req.account!.identity.userId, now: now() });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    res.json({ id: memberId, removed: true, left: result.value.left });
  });

  router.post("/businesses/:id/ownership/transfer", async (req, res): Promise<void> => {
    // Membership first: an outsider learns nothing from validation errors (404 before 400).
    const gate = await requireBusinessRole(req, res, "owner");
    if (!gate) return;
    const unknown = unknownFieldErrors(req.body, TRANSFER_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    const memberId = positiveInt(bodyOf(req).memberId);
    if (!memberId) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "memberId", code: "required" }] });
      return;
    }
    const result = await transferOwnership({ businessProfileId: gate.businessId, memberId, actorUserId: req.account!.identity.userId, now: now() });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    req.log?.info?.({ event: "business_membership.transferred", businessId: gate.businessId }, "Business ownership transferred");
    res.json({ businessId: gate.businessId, viewerRole: "manager" });
  });

  router.post("/businesses/:id/close", async (req, res): Promise<void> => {
    // Membership first: an outsider learns nothing from validation errors (404 before 400).
    const gate = await requireBusinessRole(req, res, "owner");
    if (!gate) return;
    const unknown = unknownFieldErrors(req.body, CLOSE_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    if (bodyOf(req).confirm !== true) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "confirm", code: "required" }] });
      return;
    }
    const result = await closeBusiness({ businessProfileId: gate.businessId, actorUserId: req.account!.identity.userId, now: now() });
    if (!result.ok) {
      sendMembershipError(req, res, result.error);
      return;
    }
    req.log?.info?.({ event: "business_membership.closed", businessId: gate.businessId, alreadyClosed: result.value.alreadyClosed }, "Business closed by owner");
    res.json({ businessId: gate.businessId, publicationStatus: result.value.publicationStatus, closed: true });
  });

  return router;
}

export default createBusinessMembershipRouter();
