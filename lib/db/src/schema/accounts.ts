import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Account lifecycle states for a local user row.
 *
 * Transitions (server-side only, never client-selected):
 *   active     -> suspended  (operator action)
 *   suspended  -> active     (operator action)
 *   active     -> deleted    (approved account deletion request)
 *   suspended  -> deleted    (approved account deletion request)
 *   deleted    -> (terminal)
 *
 * Verification ("unverified") is not an account state: it is derived from the
 * identity provider on every request and never persisted here.
 */
export const APP_USER_STATUSES = ["active", "suspended", "deleted"] as const;
export type AppUserStatus = (typeof APP_USER_STATUSES)[number];

export const ACCOUNT_LOCALES = ["nl", "en"] as const;
export type AccountLocale = (typeof ACCOUNT_LOCALES)[number];

/**
 * One row per trusted identity-provider subject (Clerk user id).
 *
 * This table is additive: it does not replace `user_registrations`, which
 * remains the campaign-style research registration, and it does not own
 * business authority, which stays in `business_members`.
 */
export const appUsersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    emailChangePendingAt: timestamp("email_change_pending_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    locale: text("locale").notNull().default("nl"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReasonCode: text("suspension_reason_code"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Permanent tombstone; a closed Clerk subject must never be reprovisioned. */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Server-side fence: a PUT received before a clear may never recreate the row. */
    lastSearchClearedAt: timestamp("last_search_cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("app_users_clerk_user_unique").on(table.clerkUserId),
    index("app_users_status_idx").on(table.status),
  ],
);

/**
 * Optional, controlled consumer preferences. Owned by exactly one app user.
 * `revision` is the optimistic-concurrency version: every update must carry
 * the expected revision and increments it by one.
 */
export const consumerPreferencesTable = pgTable(
  "consumer_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    neighborhoodIds: jsonb("neighborhood_ids").$type<string[]>().notNull().default([]),
    interestIds: jsonb("interest_ids").$type<string[]>().notNull().default([]),
    retainLastSearch: boolean("retain_last_search").notNull().default(true),
    externalSearchScope: text("external_search_scope").notNull().default("ask"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("consumer_preferences_user_unique").on(table.userId)],
);

/** Private, expiring, single most recent discovery context per account. */
export const accountLastSearchTable = pgTable(
  "account_last_search",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    cityId: text("city_id").notNull(),
    section: text("section").notNull().default("events"),
    neighborhoodIds: jsonb("neighborhood_ids").$type<string[]>().notNull().default([]),
    query: text("query"),
    categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
    filters: jsonb("filters").$type<Record<string, boolean>>().notNull().default({}),
    locale: text("locale").notNull().default("nl"),
    sourceScope: text("source_scope").notNull().default("local"),
    selectedListing: jsonb("selected_listing").$type<{ source: string; id: string } | null>(),
    presentationMode: text("presentation_mode").notNull().default("map"),
    zoom: smallint("zoom"),
    centerLat: numeric("center_lat", { precision: 6, scale: 3 }),
    centerLng: numeric("center_lng", { precision: 6, scale: 3 }),
    scrollContext: text("scroll_context"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.userId], foreignColumns: [appUsersTable.id], name: "account_last_search_user_fk" }).onDelete("cascade"),
    uniqueIndex("account_last_search_user_unique").on(table.userId),
    index("account_last_search_expires_idx").on(table.expiresAt),
  ],
);

export const CONSENT_SOURCES = ["onboarding", "account_settings", "support", "system"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Append-only consent ledger. Rows are never updated or deleted by the
 * application; the current state of a consent type is the most recent row.
 */
export const accountConsentEventsTable = pgTable(
  "account_consent_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    consentType: text("consent_type").notNull(),
    noticeVersion: text("notice_version").notNull(),
    locale: text("locale"),
    purposeLawfulBasis: text("purpose_lawful_basis"),
    granted: boolean("granted").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("account_consent_events_user_type_idx").on(
      table.userId,
      table.consentType,
      table.createdAt,
    ),
  ],
);

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertConsumerPreferencesSchema = createInsertSchema(consumerPreferencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAccountConsentEventSchema = createInsertSchema(accountConsentEventsTable).omit({
  id: true,
  createdAt: true,
});

export type AppUser = typeof appUsersTable.$inferSelect;
export type ConsumerPreferences = typeof consumerPreferencesTable.$inferSelect;
export type AccountConsentEvent = typeof accountConsentEventsTable.$inferSelect;
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type InsertConsumerPreferences = z.infer<typeof insertConsumerPreferencesSchema>;
export type InsertAccountConsentEvent = z.infer<typeof insertAccountConsentEventSchema>;
