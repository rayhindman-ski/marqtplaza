import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { businessProfilesTable } from "./businessDirectory";

/**
 * Revision review states.
 *
 * Transitions:
 *   draft             -> submitted          (owner submits)
 *   submitted         -> approved           (reviewer decision; becomes the
 *                                            profile's approved revision)
 *   submitted         -> changes_requested  (reviewer decision with reason)
 *   submitted         -> rejected           (reviewer decision with reason)
 *   changes_requested -> submitted          (owner resubmits, new version)
 *   approved          -> superseded         (a later revision is approved)
 *   draft             -> discarded          (owner discards)
 *
 * A business has at most one approved revision at any time.
 */
export const BUSINESS_REVISION_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "superseded",
  "discarded",
] as const;
export type BusinessRevisionStatus = (typeof BUSINESS_REVISION_STATUSES)[number];

export type BusinessRevisionContent = {
  nl?: Record<string, string | null>;
  en?: Record<string, string | null>;
  facts?: Record<string, string | number | boolean | null>;
};

export const businessProfileRevisionsTable = pgTable(
  "business_profile_revisions",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    content: jsonb("content").$type<BusinessRevisionContent>().notNull().default({}),
    /** Clerk subject of the account that authored this revision. */
    authorUserId: text("author_user_id").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Named explicitly: the generated name exceeds PostgreSQL's 63-character
    // identifier limit, which makes drizzle-kit push recreate it every run.
    foreignKey({
      name: "business_profile_revisions_profile_fk",
      columns: [table.businessProfileId],
      foreignColumns: [businessProfilesTable.id],
    }).onDelete("cascade"),
    uniqueIndex("business_profile_revisions_profile_version_unique").on(
      table.businessProfileId,
      table.version,
    ),
    index("business_profile_revisions_status_idx").on(table.status, table.submittedAt),
  ],
);

export const REVIEW_TARGET_TYPES = ["claim", "revision", "publication"] as const;
export type ReviewTargetType = (typeof REVIEW_TARGET_TYPES)[number];

export const REVIEW_DECISIONS = [
  "approve",
  "reject",
  "request_changes",
  "publish",
  "unpublish",
  "suspend",
] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * Immutable audit record of every reviewer decision. Rows are never updated.
 * `targetVersion` is the version the reviewer looked at; a decision against a
 * stale version is rejected before a row is written.
 */
export const businessReviewsTable = pgTable(
  "business_reviews",
  {
    id: serial("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    targetVersion: integer("target_version").notNull(),
    /** Clerk subject of the reviewer; must never equal the target's owner. */
    reviewerUserId: text("reviewer_user_id").notNull(),
    decision: text("decision").notNull(),
    reasonCode: text("reason_code"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("business_reviews_target_idx").on(table.targetType, table.targetId, table.createdAt),
    index("business_reviews_reviewer_idx").on(table.reviewerUserId, table.createdAt),
  ],
);

export const FACT_CHECK_STATUSES = ["unchecked", "confirmed", "contradicted", "unavailable"] as const;
export type FactCheckStatus = (typeof FACT_CHECK_STATUSES)[number];

export const factChecksTable = pgTable(
  "business_fact_checks",
  {
    id: serial("id").primaryKey(),
    revisionId: integer("revision_id").notNull(),
    field: text("field").notNull(),
    sourceUrl: text("source_url"),
    status: text("status").notNull().default("unchecked"),
    checkedOn: timestamp("checked_on", { withTimezone: true }),
    reviewerUserId: text("reviewer_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "business_fact_checks_revision_fk",
      columns: [table.revisionId],
      foreignColumns: [businessProfileRevisionsTable.id],
    }).onDelete("cascade"),
    index("business_fact_checks_revision_idx").on(table.revisionId, table.field),
  ],
);

export const insertBusinessProfileRevisionSchema = createInsertSchema(
  businessProfileRevisionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBusinessReviewSchema = createInsertSchema(businessReviewsTable).omit({
  id: true,
  createdAt: true,
});
export const insertFactCheckSchema = createInsertSchema(factChecksTable).omit({
  id: true,
  createdAt: true,
});

export type BusinessProfileRevision = typeof businessProfileRevisionsTable.$inferSelect;
export type BusinessReview = typeof businessReviewsTable.$inferSelect;
export type FactCheck = typeof factChecksTable.$inferSelect;
export type InsertBusinessProfileRevision = z.infer<typeof insertBusinessProfileRevisionSchema>;
export type InsertBusinessReview = z.infer<typeof insertBusinessReviewSchema>;
export type InsertFactCheck = z.infer<typeof insertFactCheckSchema>;
