import { createHash, randomBytes } from "node:crypto";

import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";

import {
  BUSINESS_MEMBER_ROLES,
  businessInvitationTokensTable,
  businessInvitationsTable,
  businessMemberEventsTable,
  businessMembersTable,
  businessProfilesTable,
  db,
  lifecycleOutboxTable,
  type BusinessMemberEventAction,
  type BusinessMemberRole,
} from "@workspace/db";

import { normalizeEmail } from "./consumerRegistration";
import { enqueueInvitationLifecycleMessage, enqueueLifecycleMessage } from "./lifecycleOutbox";
import { notifyBusinessOwners } from "./lifecycleNotifications";

/**
 * Business membership and lifecycle (v0.5.2, BMEM-001…007).
 *
 * Every mutation runs in one transaction that locks the business's membership
 * rows, so the last-owner guard holds under concurrent requests. Audit rows in
 * `business_member_events` are written in the same transaction as the change.
 * Nothing here reads or writes consumer preferences (BMEM-007).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000; // provisional policy: 7 days
export const MEMBER_ROLES = BUSINESS_MEMBER_ROLES;
export type { BusinessMemberRole };

export type MembershipError =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "last_owner" }
  | { kind: "invalid"; field: string; code: string }
  | { kind: "duplicate_invitation" }
  | { kind: "already_member" }
  | { kind: "invalid_transition"; status: string };

export type MembershipResult<T> = { ok: true; value: T } | { ok: false; error: MembershipError };

const fail = <T>(error: MembershipError): MembershipResult<T> => ({ ok: false, error });
const ok = <T>(value: T): MembershipResult<T> => ({ ok: true, value });

export function isMemberRole(value: unknown): value is BusinessMemberRole {
  return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ tokens ---

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Mint a token for one outbox row. Tokens of *other* rows are superseded;
 * tokens already minted for the same row stay valid because a provider may
 * deduplicate a retried send and deliver the first body.
 */
export async function issueInvitationToken(
  tx: Pick<typeof db, "insert" | "update">,
  input: { invitationId: number; outboxId: number | null; now: Date; expiresAt: Date },
): Promise<{ token: string }> {
  await tx
    .update(businessInvitationTokensTable)
    .set({ supersededAt: input.now })
    .where(
      and(
        eq(businessInvitationTokensTable.invitationId, input.invitationId),
        isNull(businessInvitationTokensTable.usedAt),
        isNull(businessInvitationTokensTable.supersededAt),
        input.outboxId === null ? undefined : ne(businessInvitationTokensTable.outboxId, input.outboxId),
      ),
    );
  const token = generateInvitationToken();
  await tx.insert(businessInvitationTokensTable).values({
    invitationId: input.invitationId,
    tokenDigest: digestInvitationToken(token),
    outboxId: input.outboxId,
    expiresAt: input.expiresAt,
  });
  return { token };
}

// ------------------------------------------------------------ membership ----

export type MemberRow = { id: number; userId: string; role: BusinessMemberRole; joinedAt: Date; invitedByUserId: string | null };

async function lockMembers(tx: Tx, businessProfileId: number): Promise<MemberRow[]> {
  const rows = await tx
    .select({
      id: businessMembersTable.id,
      userId: businessMembersTable.userId,
      role: businessMembersTable.role,
      joinedAt: businessMembersTable.joinedAt,
      invitedByUserId: businessMembersTable.invitedByUserId,
    })
    .from(businessMembersTable)
    .where(eq(businessMembersTable.businessProfileId, businessProfileId))
    .orderBy(asc(businessMembersTable.id))
    .for("update");
  return rows.map((row) => ({ ...row, role: row.role as BusinessMemberRole }));
}

async function lockProfile(tx: Tx, businessProfileId: number) {
  const [profile] = await tx
    .select({
      id: businessProfilesTable.id,
      name: businessProfilesTable.name,
      publicationStatus: businessProfilesTable.publicationStatus,
      closedAt: businessProfilesTable.closedAt,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, businessProfileId))
    .limit(1)
    .for("update");
  return profile ?? null;
}

async function recordEvent(
  tx: Tx,
  input: { businessProfileId: number; actorUserId: string; targetUserId?: string | null; invitationId?: number | null; action: BusinessMemberEventAction; reasonCode?: string | null },
): Promise<void> {
  await tx.insert(businessMemberEventsTable).values({
    businessProfileId: input.businessProfileId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId ?? null,
    invitationId: input.invitationId ?? null,
    action: input.action,
    reasonCode: input.reasonCode ?? null,
  });
}

/** Role of `userId` at the business, or null when not a member. Not locked; for reads and gates. */
export async function memberRoleOf(businessProfileId: number, userId: string): Promise<BusinessMemberRole | null> {
  const [row] = await db
    .select({ role: businessMembersTable.role })
    .from(businessMembersTable)
    .where(and(eq(businessMembersTable.businessProfileId, businessProfileId), eq(businessMembersTable.userId, userId)))
    .limit(1);
  return row ? (row.role as BusinessMemberRole) : null;
}

export type InvitationStatus = "open" | "accepted" | "revoked" | "expired";

export function invitationStatus(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): InvitationStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "open";
}

export async function listMembership(businessProfileId: number, now: Date) {
  const [members, invitations] = await Promise.all([
    db
      .select({
        id: businessMembersTable.id,
        userId: businessMembersTable.userId,
        role: businessMembersTable.role,
        joinedAt: businessMembersTable.joinedAt,
        invitedByUserId: businessMembersTable.invitedByUserId,
      })
      .from(businessMembersTable)
      .where(eq(businessMembersTable.businessProfileId, businessProfileId))
      .orderBy(asc(businessMembersTable.id)),
    db
      .select()
      .from(businessInvitationsTable)
      .where(eq(businessInvitationsTable.businessProfileId, businessProfileId))
      .orderBy(desc(businessInvitationsTable.id))
      .limit(50),
  ]);
  return {
    members: members.map((row) => ({ ...row, role: row.role as BusinessMemberRole })),
    invitations: invitations.map((row) => ({ ...row, status: invitationStatus(row, now) })),
  };
}

// ---------------------------------------------------------------- invite ----

export async function inviteMember(input: {
  businessProfileId: number;
  actorUserId: string;
  email: string;
  role: BusinessMemberRole;
  locale: string;
  now: Date;
}): Promise<MembershipResult<{ invitationId: number; expiresAt: Date; created: boolean }>> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) return fail({ kind: "invalid", field: "email", code: "invalid" });
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, input.businessProfileId);
    if (!profile) return fail({ kind: "not_found" });
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor || actor.role !== "owner") return fail({ kind: "forbidden" });
    if (profile.closedAt) return fail({ kind: "invalid_transition", status: "closed" });
    const [existing] = await tx
      .select({ id: businessInvitationsTable.id, expiresAt: businessInvitationsTable.expiresAt })
      .from(businessInvitationsTable)
      .where(
        and(
          eq(businessInvitationsTable.businessProfileId, input.businessProfileId),
          eq(businessInvitationsTable.normalizedEmail, normalizedEmail),
          isNull(businessInvitationsTable.acceptedAt),
          isNull(businessInvitationsTable.revokedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (existing) {
      if (existing.expiresAt.getTime() > input.now.getTime()) return fail({ kind: "duplicate_invitation" });
      // An expired open invitation is superseded: revoke it so the partial unique index admits the new one.
      await tx.update(businessInvitationsTable).set({ revokedAt: input.now }).where(eq(businessInvitationsTable.id, existing.id));
    }
    const expiresAt = new Date(input.now.getTime() + INVITATION_TTL_MS);
    const [invitation] = await tx
      .insert(businessInvitationsTable)
      .values({
        businessProfileId: input.businessProfileId,
        normalizedEmail,
        role: input.role,
        invitedByUserId: input.actorUserId,
        locale: input.locale,
        expiresAt,
      })
      .returning({ id: businessInvitationsTable.id });
    await recordEvent(tx, { businessProfileId: input.businessProfileId, actorUserId: input.actorUserId, invitationId: invitation.id, action: "invited" });
    const outcome = await enqueueInvitationLifecycleMessage(tx, {
      invitationId: invitation.id,
      idempotencyKey: `business-invitation:${invitation.id}:invited`,
      locale: input.locale,
      payload: { businessProfileId: profile.id, businessName: profile.name, role: input.role },
    });
    return ok({ invitationId: invitation.id, expiresAt, created: outcome.created });
  });
}

export async function revokeInvitation(input: {
  businessProfileId: number;
  invitationId: number;
  actorUserId: string;
  now: Date;
}): Promise<MembershipResult<{ revoked: boolean }>> {
  return db.transaction(async (tx) => {
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor || actor.role !== "owner") return fail({ kind: members.length === 0 ? "not_found" : "forbidden" });
    const [invitation] = await tx
      .select()
      .from(businessInvitationsTable)
      .where(and(eq(businessInvitationsTable.id, input.invitationId), eq(businessInvitationsTable.businessProfileId, input.businessProfileId)))
      .limit(1)
      .for("update");
    if (!invitation) return fail({ kind: "not_found" });
    if (invitation.acceptedAt) return fail({ kind: "invalid_transition", status: "accepted" });
    if (invitation.revokedAt) return ok({ revoked: false });
    await tx.update(businessInvitationsTable).set({ revokedAt: input.now }).where(eq(businessInvitationsTable.id, invitation.id));
    await tx
      .update(businessInvitationTokensTable)
      .set({ supersededAt: input.now })
      .where(and(eq(businessInvitationTokensTable.invitationId, invitation.id), isNull(businessInvitationTokensTable.usedAt), isNull(businessInvitationTokensTable.supersededAt)));
    // A queued (not yet sent) invitation e-mail must not go out after revocation.
    await tx
      .update(lifecycleOutboxTable)
      .set({ status: "cancelled", cancelledAt: input.now })
      .where(and(eq(lifecycleOutboxTable.recipientInvitationId, invitation.id), eq(lifecycleOutboxTable.status, "queued")));
    await recordEvent(tx, { businessProfileId: input.businessProfileId, actorUserId: input.actorUserId, invitationId: invitation.id, action: "revoked" });
    return ok({ revoked: true });
  });
}

// ---------------------------------------------------------------- accept ----

export type AcceptFailure = "invalid" | "expired" | "used" | "revoked" | "email_mismatch";

/**
 * Accept an invitation with a single-use token. The accepting account's
 * verified address must equal the invited address (BMEM-002). Replaying a
 * used token answers `used`; superseded tokens read as `invalid`.
 */
export async function acceptInvitation(input: {
  token: string;
  userId: string;
  userEmail: string | null;
  now: Date;
}): Promise<{ ok: true; businessProfileId: number; businessName: string; role: BusinessMemberRole; alreadyMember: boolean } | { ok: false; reason: AcceptFailure }> {
  if (!TOKEN_SHAPE.test(input.token)) return { ok: false, reason: "invalid" };
  const digest = digestInvitationToken(input.token);
  return db.transaction(async (tx) => {
    const [tokenRow] = await tx
      .select()
      .from(businessInvitationTokensTable)
      .where(eq(businessInvitationTokensTable.tokenDigest, digest))
      .limit(1)
      .for("update");
    if (!tokenRow || tokenRow.supersededAt) return { ok: false as const, reason: "invalid" as const };
    if (tokenRow.usedAt) return { ok: false as const, reason: "used" as const };
    const [invitation] = await tx
      .select()
      .from(businessInvitationsTable)
      .where(eq(businessInvitationsTable.id, tokenRow.invitationId))
      .limit(1)
      .for("update");
    if (!invitation) return { ok: false as const, reason: "invalid" as const };
    if (invitation.revokedAt) return { ok: false as const, reason: "revoked" as const };
    if (invitation.acceptedAt) return { ok: false as const, reason: "used" as const };
    if (tokenRow.expiresAt.getTime() <= input.now.getTime() || invitation.expiresAt.getTime() <= input.now.getTime()) {
      return { ok: false as const, reason: "expired" as const };
    }
    const accountEmail = input.userEmail ? normalizeEmail(input.userEmail) : null;
    if (!accountEmail || accountEmail !== invitation.normalizedEmail) return { ok: false as const, reason: "email_mismatch" as const };

    const profile = await lockProfile(tx, invitation.businessProfileId);
    if (!profile || profile.closedAt) return { ok: false as const, reason: "revoked" as const };
    const members = await lockMembers(tx, invitation.businessProfileId);
    const already = members.find((member) => member.userId === input.userId);
    const role = invitation.role as BusinessMemberRole;
    if (!already) {
      await tx.insert(businessMembersTable).values({
        businessProfileId: invitation.businessProfileId,
        userId: input.userId,
        role,
        invitedByUserId: invitation.invitedByUserId,
        joinedAt: input.now,
      });
    } else if (already.role !== "owner" && role === "owner") {
      await tx.update(businessMembersTable).set({ role }).where(eq(businessMembersTable.id, already.id));
    }
    await tx.update(businessInvitationsTable).set({ acceptedAt: input.now, acceptedByUserId: input.userId }).where(eq(businessInvitationsTable.id, invitation.id));
    await tx.update(businessInvitationTokensTable).set({ usedAt: input.now }).where(eq(businessInvitationTokensTable.id, tokenRow.id));
    await tx
      .update(businessInvitationTokensTable)
      .set({ supersededAt: input.now })
      .where(and(eq(businessInvitationTokensTable.invitationId, invitation.id), isNull(businessInvitationTokensTable.usedAt), isNull(businessInvitationTokensTable.supersededAt)));
    await recordEvent(tx, { businessProfileId: invitation.businessProfileId, actorUserId: input.userId, targetUserId: input.userId, invitationId: invitation.id, action: "accepted" });
    await notifyBusinessOwners(tx, {
      businessProfileId: invitation.businessProfileId,
      eventCode: "business.member_joined",
      dedupeScope: `invitation:${invitation.id}:accepted`,
      payload: { businessProfileId: profile.id, businessName: profile.name, role },
    });
    return { ok: true as const, businessProfileId: profile.id, businessName: profile.name, role, alreadyMember: Boolean(already) };
  });
}

// ------------------------------------------------------- roles / removal ----

function ownersAmong(members: MemberRow[]): MemberRow[] {
  return members.filter((member) => member.role === "owner");
}

export async function changeMemberRole(input: {
  businessProfileId: number;
  memberId: number;
  actorUserId: string;
  role: BusinessMemberRole;
  now: Date;
}): Promise<MembershipResult<{ changed: boolean }>> {
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, input.businessProfileId);
    if (!profile) return fail({ kind: "not_found" });
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor || actor.role !== "owner") return fail({ kind: "forbidden" });
    const target = members.find((member) => member.id === input.memberId);
    if (!target) return fail({ kind: "not_found" });
    if (target.role === input.role) return ok({ changed: false });
    // Demoting the last owner (including yourself) is refused; use transfer instead (BMEM-003).
    if (target.role === "owner" && input.role !== "owner" && ownersAmong(members).length <= 1) return fail({ kind: "last_owner" });
    await tx.update(businessMembersTable).set({ role: input.role }).where(eq(businessMembersTable.id, target.id));
    await recordEvent(tx, { businessProfileId: input.businessProfileId, actorUserId: input.actorUserId, targetUserId: target.userId, action: "role_changed", reasonCode: input.role });
    if (target.userId !== input.actorUserId) {
      await enqueueLifecycleMessage(tx, {
        eventCode: "business.member_role_changed",
        recipientClerkUserId: target.userId,
        idempotencyKey: `business-member:${target.id}:role:${input.role}:${input.now.getTime()}`,
        payload: { businessProfileId: profile.id, businessName: profile.name, role: input.role },
      });
    }
    return ok({ changed: true });
  });
}

/**
 * Remove a member (owner action) or leave (any member removing themselves).
 * The last owner can neither be removed nor leave (BMEM-003).
 */
export async function removeMember(input: {
  businessProfileId: number;
  memberId: number;
  actorUserId: string;
  now: Date;
}): Promise<MembershipResult<{ left: boolean }>> {
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, input.businessProfileId);
    if (!profile) return fail({ kind: "not_found" });
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor) return fail({ kind: "forbidden" });
    const target = members.find((member) => member.id === input.memberId);
    if (!target) return fail({ kind: "not_found" });
    const self = target.userId === input.actorUserId;
    if (!self && actor.role !== "owner") return fail({ kind: "forbidden" });
    if (target.role === "owner" && ownersAmong(members).length <= 1) return fail({ kind: "last_owner" });
    await tx.delete(businessMembersTable).where(eq(businessMembersTable.id, target.id));
    await recordEvent(tx, { businessProfileId: input.businessProfileId, actorUserId: input.actorUserId, targetUserId: target.userId, action: self ? "left" : "removed" });
    if (!self) {
      await enqueueLifecycleMessage(tx, {
        eventCode: "business.member_removed",
        recipientClerkUserId: target.userId,
        idempotencyKey: `business-member:${target.id}:removed`,
        payload: { businessProfileId: profile.id, businessName: profile.name },
      });
    }
    return ok({ left: self });
  });
}

export async function transferOwnership(input: {
  businessProfileId: number;
  memberId: number;
  actorUserId: string;
  now: Date;
}): Promise<MembershipResult<{ newOwnerUserId: string }>> {
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, input.businessProfileId);
    if (!profile) return fail({ kind: "not_found" });
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor || actor.role !== "owner") return fail({ kind: "forbidden" });
    const target = members.find((member) => member.id === input.memberId);
    if (!target) return fail({ kind: "not_found" });
    if (target.userId === input.actorUserId) return fail({ kind: "invalid", field: "memberId", code: "self" });
    // Atomic swap: the target becomes owner, the actor steps down to manager. Owner count never drops below one.
    await tx.update(businessMembersTable).set({ role: "owner" }).where(eq(businessMembersTable.id, target.id));
    await tx.update(businessMembersTable).set({ role: "manager" }).where(eq(businessMembersTable.id, actor.id));
    await recordEvent(tx, { businessProfileId: input.businessProfileId, actorUserId: input.actorUserId, targetUserId: target.userId, action: "transferred" });
    await enqueueLifecycleMessage(tx, {
      eventCode: "business.ownership_transferred",
      recipientClerkUserId: target.userId,
      idempotencyKey: `business-member:${target.id}:transferred:${input.now.getTime()}`,
      payload: { businessProfileId: profile.id, businessName: profile.name, role: "owner" },
    });
    return ok({ newOwnerUserId: target.userId });
  });
}

// ----------------------------------------------------------------- close ----

/**
 * Close a business (BMEM-006): the listing is unpublished through the same
 * state as a reviewer unpublication, `closed_at` is set, and every record is
 * kept. Idempotent for an already-closed business.
 */
export async function closeBusiness(input: {
  businessProfileId: number;
  actorUserId: string;
  now: Date;
}): Promise<MembershipResult<{ publicationStatus: string; alreadyClosed: boolean }>> {
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, input.businessProfileId);
    if (!profile) return fail({ kind: "not_found" });
    const members = await lockMembers(tx, input.businessProfileId);
    const actor = members.find((member) => member.userId === input.actorUserId);
    if (!actor || actor.role !== "owner") return fail({ kind: "forbidden" });
    if (profile.closedAt) return ok({ publicationStatus: profile.publicationStatus, alreadyClosed: true });
    const from = profile.publicationStatus;
    // Published and suspended listings leave the public directory; drafts and unpublished rows only gain the closed marker.
    const to = from === "published" || from === "suspended" ? "unpublished" : from;
    await tx
      .update(businessProfilesTable)
      .set({ publicationStatus: to, closedAt: input.now })
      .where(and(eq(businessProfilesTable.id, profile.id), eq(businessProfilesTable.publicationStatus, from)));
    await recordEvent(tx, { businessProfileId: profile.id, actorUserId: input.actorUserId, action: "closed", reasonCode: from });
    // Open invitations cannot be accepted into a closed business.
    await tx
      .update(businessInvitationsTable)
      .set({ revokedAt: input.now })
      .where(and(eq(businessInvitationsTable.businessProfileId, profile.id), isNull(businessInvitationsTable.acceptedAt), isNull(businessInvitationsTable.revokedAt)));
    await notifyBusinessOwners(tx, {
      businessProfileId: profile.id,
      eventCode: "business.closed",
      dedupeScope: `owner-close:${profile.id}`,
      payload: { businessProfileId: profile.id, businessName: profile.name, status: to },
    });
    return ok({ publicationStatus: to, alreadyClosed: false });
  });
}

// --------------------------------------------------------- account/me list --

export async function listBusinessesForUser(userId: string) {
  return db
    .select({
      id: businessProfilesTable.id,
      name: businessProfilesTable.name,
      slug: businessProfilesTable.slug,
      role: businessMembersTable.role,
      publicationStatus: businessProfilesTable.publicationStatus,
      closedAt: businessProfilesTable.closedAt,
    })
    .from(businessMembersTable)
    .innerJoin(businessProfilesTable, eq(businessProfilesTable.id, businessMembersTable.businessProfileId))
    .where(eq(businessMembersTable.userId, userId))
    .orderBy(asc(businessProfilesTable.name));
}

/** Newest outbox row for an invitation; only that generation may mint a link. */
export async function newestInvitationOutboxId(tx: Pick<typeof db, "select">, invitationId: number): Promise<number | null> {
  const [newest] = await tx
    .select({ id: lifecycleOutboxTable.id })
    .from(lifecycleOutboxTable)
    .where(eq(lifecycleOutboxTable.recipientInvitationId, invitationId))
    .orderBy(desc(lifecycleOutboxTable.id))
    .limit(1);
  return newest?.id ?? null;
}
