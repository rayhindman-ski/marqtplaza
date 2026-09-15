import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  businessProfileRevisionsTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
} from "@workspace/db";

import { contentFromProfileColumns } from "./businessRevisions";
import { logger } from "./logger";

/** Recorded as author/reviewer of migrated snapshots; never a real account id. */
export const BACKFILL_ACTOR_ID = "system:revision-backfill";
export const BACKFILL_REASON_CODE = "backfill_v1";

/**
 * Profiles whose column data was already public (or was public until an
 * editor pulled it) before revisions existed. Their columns are the de facto
 * approved snapshot, so they receive an approved revision v1. Private intake
 * drafts (`draft`) and archived rows are left alone: nothing about them has
 * been reviewed.
 */
const MIGRATABLE_STATUSES = ["published", "unpublished", "suspended"] as const;

export type BackfillSummary = { migrated: number; skipped: number };

/**
 * Idempotent: only profiles without an approved snapshot and without any
 * revision are migrated, each under its own row lock, so re-running (or two
 * instances starting together) never produces a second v1.
 */
export async function backfillApprovedRevisions(now: () => Date = () => new Date()): Promise<BackfillSummary> {
  const candidates = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(
      and(
        isNull(businessProfilesTable.approvedRevisionId),
        inArray(businessProfilesTable.publicationStatus, [...MIGRATABLE_STATUSES]),
      ),
    );
  let migrated = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const done = await db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, candidate.id))
        .for("update");
      if (!profile || profile.approvedRevisionId !== null) return false;
      if (!(MIGRATABLE_STATUSES as readonly string[]).includes(profile.publicationStatus)) return false;
      const [existing] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(businessProfileRevisionsTable)
        .where(eq(businessProfileRevisionsTable.businessProfileId, profile.id));
      if (Number(existing?.count ?? 0) > 0) return false;

      const at = now();
      const [revision] = await tx
        .insert(businessProfileRevisionsTable)
        .values({
          businessProfileId: profile.id,
          version: 1,
          status: "approved",
          content: contentFromProfileColumns(profile),
          authorUserId: BACKFILL_ACTOR_ID,
          submittedAt: at,
          decidedAt: at,
        })
        .returning();
      await tx
        .update(businessProfilesTable)
        .set({ approvedRevisionId: revision.id })
        .where(eq(businessProfilesTable.id, profile.id));
      await tx.insert(businessReviewsTable).values({
        targetType: "revision",
        targetId: revision.id,
        targetVersion: 1,
        reviewerUserId: BACKFILL_ACTOR_ID,
        decision: "approve",
        reasonCode: BACKFILL_REASON_CODE,
        reason: "Existing public profile data migrated as approved revision v1.",
      });
      return true;
    });
    if (done) migrated += 1;
    else skipped += 1;
  }
  if (migrated > 0) {
    logger.info({ event: "business_publication.backfill", migrated, skipped }, "Approved revision v1 backfill applied");
  }
  return { migrated, skipped };
}
