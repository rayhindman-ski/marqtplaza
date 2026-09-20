import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const businessProfilesTable = pgTable(
  "business_profiles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    cityId: text("city_id").notNull(),
    listingSource: text("listing_source").notNull(),
    listingId: text("listing_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    neighborhood: text("neighborhood"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    sourceUrl: text("source_url"),
    tagline: text("tagline"),
    description: text("description"),
    websiteUrl: text("website_url"),
    phone: text("phone"),
    email: text("email"),
    openingHours: text("opening_hours"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    isClaimed: boolean("is_claimed").notNull().default(false),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /**
     * Publication lifecycle. Existing rows default to `published` so no public
     * profile disappears when the column is added.
     *   draft -> published (explicit reviewer publication)
     *   published <-> unpublished (owner/reviewer), published -> suspended
     *   (reviewer), any -> archived (terminal)
     */
    publicationStatus: text("publication_status").notNull().default("published"),
    /** Points at the single approved `business_profile_revisions` row, if any. */
    approvedRevisionId: integer("approved_revision_id"),
    /** Clerk subject that created a draft business; null for listing-derived rows. */
    createdByUserId: text("created_by_user_id"),
    /** Self-reported business category for new-business drafts; null for listing-derived rows. */
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("business_profiles_slug_unique").on(table.slug),
    uniqueIndex("business_profiles_city_source_listing_unique").on(
      table.cityId,
      table.listingSource,
      table.listingId,
    ),
    index("business_profiles_city_claimed_idx").on(table.cityId, table.isClaimed),
    index("business_profiles_publication_idx").on(table.publicationStatus, table.cityId),
  ],
);

export const PUBLICATION_STATUSES = [
  "draft",
  "unpublished",
  "published",
  "suspended",
  "archived",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * Claim states. `pending` is kept as the legacy alias of `submitted` so the
 * existing moderation queue and the one-open-claim rule keep working.
 *
 *   draft -> submitted | withdrawn (intake flow; drafts are private and hold no slot)
 *   pending|submitted -> approved | rejected | changes_requested | withdrawn
 *   changes_requested -> submitted (resubmission with current version) | withdrawn
 *   submitted on an already-owned business -> disputed (competing authority claim,
 *     recorded for manual review; never grants or transfers ownership by itself)
 *   disputed -> approved (only once no other owner exists) | rejected | withdrawn
 * Open states that hold the per-profile slot: pending, submitted,
 * changes_requested, disputed.
 */
export const CLAIM_STATUSES = [
  /** Private, unsubmitted intake draft; holds no claim slot. */
  "draft",
  "pending",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "disputed",
  "withdrawn",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
/** Listing source recorded for businesses created through the intake draft flow. */
export const SELF_REPORTED_LISTING_SOURCE = "self_reported";
export const OPEN_CLAIM_STATUSES = [
  "pending",
  "submitted",
  "changes_requested",
  "disputed",
] as const satisfies readonly ClaimStatus[];

export const businessClaimsTable = pgTable(
  "business_claims",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id")
      .notNull()
      .references(() => businessProfilesTable.id, { onDelete: "cascade" }),
    claimantId: text("claimant_id").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    relationship: text("relationship").notNull(),
    evidenceUrl: text("evidence_url"),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Claimant's declared authority over the business (free text, private). */
    authorityDeclaration: text("authority_declaration"),
    /** URL or short text reference supporting the declaration (private). */
    evidenceReference: text("evidence_reference"),
    /** Optimistic-concurrency version; every claimant or reviewer change increments it. */
    version: integer("version").notNull().default(1),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    /**
     * Client-supplied `Idempotency-Key` for draft/claim creation. Unique per
     * claimant so a retried request returns the original claim instead of a
     * duplicate.
     */
    /** Exact raw Idempotency-Key supplied by the claimant; unique per claimant. */
    idempotencyKey: text("idempotency_key"),
    /** Digest of the request payload the key was first used with, to detect key reuse with other input. */
    idempotencyDigest: text("idempotency_digest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("business_claims_claimant_idx").on(table.claimantId, table.createdAt),
    index("business_claims_profile_status_idx").on(
      table.businessProfileId,
      table.status,
    ),
    uniqueIndex("business_claims_one_open_claim_per_profile_unique")
      .on(table.businessProfileId)
      .where(
        sql`${table.status} in ('pending', 'submitted', 'changes_requested', 'disputed')`,
      ),
    uniqueIndex("business_claims_one_draft_per_claimant_unique")
      .on(table.businessProfileId, table.claimantId)
      .where(sql`${table.status} = 'draft'`),
    uniqueIndex("business_claims_claimant_idempotency_unique")
      .on(table.claimantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const businessMembersTable = pgTable(
  "business_members",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id")
      .notNull()
      .references(() => businessProfilesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_members_profile_user_unique").on(
      table.businessProfileId,
      table.userId,
    ),
    index("business_members_user_idx").on(table.userId),
  ],
);

export const dealsTable = pgTable(
  "business_deals",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id")
      .notNull()
      .references(() => businessProfilesTable.id, { onDelete: "cascade" }),
    cityId: text("city_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    offerText: text("offer_text").notNull(),
    redemptionUrl: text("redemption_url"),
    couponCode: text("coupon_code"),
    imageUrl: text("image_url"),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("business_deals_city_status_idx").on(table.cityId, table.status),
    index("business_deals_profile_idx").on(table.businessProfileId),
    index("business_deals_validity_idx").on(table.validFrom, table.validUntil),
  ],
);

export const insertBusinessProfileSchema = createInsertSchema(businessProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBusinessClaimSchema = createInsertSchema(businessClaimsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBusinessMemberSchema = createInsertSchema(businessMembersTable).omit({
  id: true,
  createdAt: true,
});
export const insertDealSchema = createInsertSchema(dealsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BusinessProfile = typeof businessProfilesTable.$inferSelect;
export type BusinessClaim = typeof businessClaimsTable.$inferSelect;
export type BusinessMember = typeof businessMembersTable.$inferSelect;
export type Deal = typeof dealsTable.$inferSelect;
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type InsertBusinessClaim = z.infer<typeof insertBusinessClaimSchema>;
export type InsertBusinessMember = z.infer<typeof insertBusinessMemberSchema>;
export type InsertDeal = z.infer<typeof insertDealSchema>;