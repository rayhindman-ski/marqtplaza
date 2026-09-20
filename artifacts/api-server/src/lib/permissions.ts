import { getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import type { Request } from "express";

import { businessMembersTable, db, type AppUser } from "@workspace/db";
import type { AccountCapabilities, AccountRole } from "@workspace/api-zod";

import type { FeatureFlags } from "./featureFlags";

/**
 * Server-derived identity for one request.
 *
 * Everything here comes from the verified Clerk session; nothing is read from
 * the request body, query string, or custom headers in production. Tests
 * inject a resolver the same way `createRegistrationRouter` does.
 */
export type Identity = {
  /** Trusted identity-provider subject (Clerk user id). */
  userId: string;
  /** Whether the provider reports a verified primary email for this session. */
  emailVerified: boolean;
  /** Whether the session carries the trusted editor/admin role claim. */
  isEditor: boolean;
};

export type IdentityResolver = (req: Request) => Identity | null | undefined;

type RoleClaims = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
  role?: unknown;
  email_verified?: unknown;
  emailVerified?: unknown;
};

const EDITOR_ROLES = new Set(["admin", "editor"]);

export function roleFromClaims(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const roleClaims = claims as RoleClaims;
  const role = roleClaims.metadata?.role ?? roleClaims.public_metadata?.role ?? roleClaims.role;
  return typeof role === "string" ? role.toLowerCase() : null;
}

export function isEditorRole(role: string | null | undefined): boolean {
  return Boolean(role && EDITOR_ROLES.has(role));
}

export function isEditor(claims: unknown): boolean {
  return isEditorRole(roleFromClaims(claims));
}

/**
 * Clerk only issues a session after its configured sign-up verification, so a
 * session without an explicit `email_verified` claim counts as verified. When
 * a deployment adds the claim to its session token, an explicit `false` is
 * honoured and the request is treated as unverified.
 */
export function emailVerifiedFromClaims(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return true;
  const roleClaims = claims as RoleClaims;
  const value = roleClaims.email_verified ?? roleClaims.emailVerified;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() !== "false";
  return true;
}

export function identityFromClaims(userId: string, claims: unknown): Identity {
  return {
    userId,
    emailVerified: emailVerifiedFromClaims(claims),
    isEditor: isEditor(claims),
  };
}

/** Default resolver: the verified Clerk session attached by `clerkMiddleware`. */
export const resolveClerkIdentity: IdentityResolver = (req) => {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  return identityFromClaims(auth.userId, auth.sessionClaims);
};

export async function countBusinessMemberships(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(businessMembersTable)
    .where(eq(businessMembersTable.userId, userId));
  return row?.count ?? 0;
}

export async function isBusinessOwner(profileId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: businessMembersTable.id })
    .from(businessMembersTable)
    .where(
      and(
        eq(businessMembersTable.businessProfileId, profileId),
        eq(businessMembersTable.userId, userId),
        eq(businessMembersTable.role, "owner"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function isBusinessMember(profileId: number, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: businessMembersTable.id })
    .from(businessMembersTable)
    .where(
      and(
        eq(businessMembersTable.businessProfileId, profileId),
        eq(businessMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export class SelfReviewError extends Error {
  constructor() {
    super("Reviewers may not decide on their own claims or businesses.");
    this.name = "SelfReviewError";
  }
}

/**
 * Refuse a decision when the reviewer is the target's owner, author, or
 * claimant. Callers pass every subject associated with the target.
 */
export function assertNotSelfReview(
  reviewerUserId: string,
  targetSubjects: ReadonlyArray<string | null | undefined>,
): void {
  if (targetSubjects.some((subject) => subject && subject === reviewerUserId)) {
    throw new SelfReviewError();
  }
}

export async function assertNotReviewingOwnBusiness(
  reviewerUserId: string,
  profileId: number,
): Promise<void> {
  if (await isBusinessMember(profileId, reviewerUserId)) throw new SelfReviewError();
}

export type CapabilityInput = {
  identity: Identity;
  user: Pick<AppUser, "status">;
  businessMembershipCount: number;
  flags: FeatureFlags;
};

/** Capabilities are recomputed on every request and never accepted from clients. */
export function deriveCapabilities(input: CapabilityInput): AccountCapabilities {
  const active = input.user.status === "active";
  const verified = input.identity.emailVerified;
  const editor = input.identity.isEditor;
  return {
    isVerified: verified,
    isEditor: editor,
    isBusinessMember: input.businessMembershipCount > 0,
    canClaimBusiness: active && verified && input.flags.businessIntake,
    canPublishBusiness: active && editor && input.flags.businessPublication,
    canReview: active && editor,
  };
}

export function deriveRole(input: CapabilityInput): AccountRole {
  if (!input.identity.emailVerified) return "unverified";
  if (input.identity.isEditor) return "reviewer";
  if (input.businessMembershipCount > 0) return "business_member";
  return "user";
}
