import { and, eq, inArray, ne, sql } from "drizzle-orm";

import {
  businessClaimsTable,
  businessMembersTable,
  businessProfileRevisionsTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  type BusinessClaim,
  type BusinessProfile,
} from "@workspace/db";

import { ClaimConflictError, REVIEWABLE_CLAIM_STATUSES } from "./businessClaims";
import { notifyUser } from "./lifecycleNotifications";
import { SelfReviewError, assertNotReviewingOwnBusiness, assertNotSelfReview } from "./permissions";

export type ClaimDecision = "approve" | "reject" | "request_changes";

export type ClaimDecisionInput = {
  claimId: number;
  reviewerId: string;
  decision: ClaimDecision;
  /** The claim version the reviewer looked at. */
  expectedVersion: number;
  reason: string | null;
};

export type ClaimDecisionOutcome =
  | { kind: "decided"; claim: BusinessClaim; profile: BusinessProfile }
  | { kind: "not_found" }
  | { kind: "not_reviewable"; status: string }
  | { kind: "stale"; currentVersion: number }
  | { kind: "reason_required" }
  | { kind: "self_review"; message: string }
  | { kind: "conflict"; message: string };

const STALE_MESSAGE = "This claim changed since you reviewed it. Reload and review the current version.";

/**
 * Apply an authority (ownership) decision to exactly one claim version.
 *
 * Shared by the legacy moderation route and the reviewer queue so both keep
 * the same guarantees: version-bound, self-review refused (re-checked inside
 * the transaction), approval grants exactly one owner membership and rejects
 * competing open claims, and every decision writes an immutable review row
 * that records the version whose evidence was reviewed.
 */
export async function applyClaimDecision(input: ClaimDecisionInput): Promise<ClaimDecisionOutcome> {
  const [row] = await db
    .select({ claim: businessClaimsTable, profile: businessProfilesTable })
    .from(businessClaimsTable)
    .innerJoin(businessProfilesTable, eq(businessClaimsTable.businessProfileId, businessProfilesTable.id))
    .where(eq(businessClaimsTable.id, input.claimId))
    .limit(1);
  if (!row) return { kind: "not_found" };
  if (!REVIEWABLE_CLAIM_STATUSES.has(row.claim.status)) {
    return { kind: "not_reviewable", status: row.claim.status };
  }
  if (input.expectedVersion !== row.claim.version) {
    return { kind: "stale", currentVersion: row.claim.version };
  }
  if (input.decision !== "approve" && !input.reason) {
    return { kind: "reason_required" };
  }
  try {
    assertNotSelfReview(input.reviewerId, [row.claim.claimantId, row.profile.createdByUserId]);
    // An editor who already belongs to the business may not decide competing claims on it.
    await assertNotReviewingOwnBusiness(input.reviewerId, row.profile.id);
  } catch (error) {
    if (error instanceof SelfReviewError) return { kind: "self_review", message: error.message };
    throw error;
  }

  const approved = input.decision === "approve";
  const nextStatus = approved ? "approved" : input.decision === "reject" ? "rejected" : "changes_requested";
  const previousStatus = row.claim.status;
  const reviewedVersion = input.expectedVersion;
  const reviewerId = input.reviewerId;

  try {
    const result = await db.transaction(async (tx) => {
      // Profile row lock first: claim creation and every other review decision take
      // the same lock, so the interested-party checks below are atomic with the commit.
      const [lockedProfile] = await tx
        .select({ id: businessProfilesTable.id, approvedRevisionId: businessProfilesTable.approvedRevisionId })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, row.profile.id))
        .for("update");
      // The author of the currently approved public snapshot is an interested party
      // for ownership decisions too, even after leaving the business.
      if (lockedProfile?.approvedRevisionId) {
        const [approvedRevision] = await tx
          .select({ authorUserId: businessProfileRevisionsTable.authorUserId })
          .from(businessProfileRevisionsTable)
          .where(eq(businessProfileRevisionsTable.id, lockedProfile.approvedRevisionId))
          .limit(1);
        if (approvedRevision?.authorUserId === reviewerId) throw new SelfReviewError();
      }
      // Re-checked inside the transaction so a membership granted concurrently
      // (e.g. this editor's own claim approved by someone else) still blocks the decision.
      const [reviewerMembership] = await tx
        .select({ id: businessMembersTable.id })
        .from(businessMembersTable)
        .where(
          and(eq(businessMembersTable.businessProfileId, row.profile.id), eq(businessMembersTable.userId, reviewerId)),
        )
        .limit(1);
      if (reviewerMembership) throw new SelfReviewError();
      // An editor with their own competing claim on this business is an interested party too.
      const [reviewerClaim] = await tx
        .select({ id: businessClaimsTable.id })
        .from(businessClaimsTable)
        .where(
          and(
            eq(businessClaimsTable.businessProfileId, row.profile.id),
            eq(businessClaimsTable.claimantId, reviewerId),
            inArray(businessClaimsTable.status, ["draft", "pending", "submitted", "changes_requested", "disputed", "approved"]),
          ),
        )
        .limit(1);
      if (reviewerClaim) throw new SelfReviewError();
      const [claim] = await tx
        .update(businessClaimsTable)
        .set({
          status: nextStatus,
          reviewNote: input.reason,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          version: reviewedVersion + 1,
        })
        .where(
          and(
            eq(businessClaimsTable.id, row.claim.id),
            eq(businessClaimsTable.status, previousStatus),
            eq(businessClaimsTable.version, reviewedVersion),
          ),
        )
        .returning();
      if (!claim) throw new ClaimConflictError(STALE_MESSAGE);
      let profile = row.profile;
      if (approved) {
        // Approval creates exactly one owner membership. A business that already has
        // an owner (a disputed claim) cannot be approved here; ownership transfer is a
        // separate, explicit process.
        const [existingOwner] = await tx
          .select({ userId: businessMembersTable.userId })
          .from(businessMembersTable)
          .where(and(eq(businessMembersTable.businessProfileId, row.profile.id), eq(businessMembersTable.role, "owner")))
          .limit(1);
        if (existingOwner && existingOwner.userId !== row.claim.claimantId) {
          throw new ClaimConflictError("This business already has a verified owner.");
        }
        [profile] = await tx
          .update(businessProfilesTable)
          .set({ isClaimed: true, claimedAt: row.profile.claimedAt ?? new Date() })
          .where(eq(businessProfilesTable.id, row.profile.id))
          .returning();
        if (!profile) throw new ClaimConflictError("This listing has already been claimed.");
        await tx
          .insert(businessMembersTable)
          .values({ businessProfileId: profile.id, userId: row.claim.claimantId, role: "owner" })
          .onConflictDoNothing();
        const competing = await tx
          .update(businessClaimsTable)
          .set({
            status: "rejected",
            reviewNote: "Another claim for this listing was approved.",
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            version: sql`${businessClaimsTable.version} + 1`,
          })
          .where(
            and(
              eq(businessClaimsTable.businessProfileId, profile.id),
              inArray(businessClaimsTable.status, ["pending", "submitted", "changes_requested", "disputed"]),
              ne(businessClaimsTable.id, claim.id),
            ),
          )
          .returning({ id: businessClaimsTable.id, claimantId: businessClaimsTable.claimantId, version: businessClaimsTable.version });
        for (const other of competing) {
          await notifyUser(tx, {
            clerkUserId: other.claimantId,
            eventCode: "claim.rejected",
            idempotencyKey: `claim:${other.id}:v${other.version}:rejected`,
            payload: { claimId: other.id, businessProfileId: profile.id, businessName: profile.name, status: "rejected" },
          });
        }
      }
      await tx.insert(businessReviewsTable).values({
        targetType: "claim",
        targetId: claim.id,
        // The version whose evidence was reviewed, not the one this decision created.
        targetVersion: reviewedVersion,
        reviewerUserId: reviewerId,
        decision: input.decision,
        reasonCode: approved ? null : input.decision,
        reason: input.reason,
      });
      // The claimant's message commits with the decision (FR-013); the reviewer's
      // note and identity stay out of the payload.
      await notifyUser(tx, {
        clerkUserId: claim.claimantId,
        eventCode: approved ? "claim.approved" : input.decision === "reject" ? "claim.rejected" : "claim.changes_requested",
        idempotencyKey: `claim:${claim.id}:v${claim.version}:${nextStatus}`,
        payload: { claimId: claim.id, businessProfileId: profile.id, businessName: profile.name, status: nextStatus },
      });
      return { claim, profile };
    });
    return { kind: "decided", ...result };
  } catch (error) {
    if (error instanceof ClaimConflictError) return { kind: "conflict", message: error.message };
    if (error instanceof SelfReviewError) return { kind: "self_review", message: error.message };
    throw error;
  }
}
