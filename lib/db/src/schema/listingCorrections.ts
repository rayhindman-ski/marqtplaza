import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const LISTING_CORRECTION_FIELDS = [
  "name",
  "address",
  "neighborhood",
  "website_url",
  "opening_hours",
  "category",
  "accessibility",
  "dietary",
  "price",
] as const;
export type ListingCorrectionField = (typeof LISTING_CORRECTION_FIELDS)[number];

export const LISTING_CORRECTION_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type ListingCorrectionStatus = (typeof LISTING_CORRECTION_STATUSES)[number];

export const listingCorrectionsTable = pgTable(
  "listing_corrections",
  {
    id: serial("id").primaryKey(),
    receipt: text("receipt").notNull(),
    cityId: text("city_id").notNull(),
    listingSource: text("listing_source").notNull(),
    listingId: text("listing_id").notNull(),
    fieldKey: text("field_key").notNull(),
    proposedValue: text("proposed_value").notNull(),
    explanation: text("explanation"),
    evidenceUrl: text("evidence_url"),
    locale: text("locale").notNull(),
    consentNoticeVersion: text("consent_notice_version").notNull(),
    status: text("status").notNull().default("pending_review"),
    idempotencyKey: text("idempotency_key").notNull(),
    idempotencyDigest: text("idempotency_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
  },
  (table) => [
    uniqueIndex("listing_corrections_receipt_unique").on(table.receipt),
    uniqueIndex("listing_corrections_idempotency_unique").on(table.idempotencyKey),
    index("listing_corrections_status_created_idx").on(table.status, table.createdAt),
    index("listing_corrections_listing_idx").on(
      table.cityId,
      table.listingSource,
      table.listingId,
    ),
  ],
);

export const insertListingCorrectionSchema = createInsertSchema(listingCorrectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ListingCorrection = typeof listingCorrectionsTable.$inferSelect;
export type InsertListingCorrection = z.infer<typeof insertListingCorrectionSchema>;