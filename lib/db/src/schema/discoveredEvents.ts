import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const discoveredEventsTable = pgTable(
  "discovered_events",
  {
    id: serial("id").primaryKey(),
    locationId: text("location_id").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    startsAt: text("starts_at"),
    openingTimes: text("opening_times"),
    venue: text("venue"),
    category: text("category").notNull(),
    sourceGroup: text("source_group").notNull().default("city-agenda"),
    organizer: text("organizer"),
    activityKind: text("activity_kind"),
    priceType: text("price_type").notNull().default("unknown"),
    priceText: text("price_text"),
    mealType: text("meal_type"),
    audience: text("audience"),
    neighborhood: text("neighborhood"),
    recurrenceText: text("recurrence_text"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    isApproximateLocation: boolean("is_approximate_location").notNull().default(true),
    reviewStatus: text("review_status").notNull().default("approved"),
    reviewReason: text("review_reason"),
    reviewEvidenceUrl: text("review_evidence_url"),
    reviewedAt: timestamp("reviewed_at"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discovered_events_canonical_url_unique").on(table.canonicalUrl),
    index("discovered_events_location_id_index").on(table.locationId),
    check(
      "discovered_events_source_group_check",
      sql`${table.sourceGroup} in ('city-agenda', 'culture', 'community', 'meals', 'agenda')`,
    ),
    check(
      "discovered_events_activity_kind_check",
      sql`${table.activityKind} is null or ${table.activityKind} in ('community', 'culture', 'learning', 'movement', 'meal', 'family', 'market', 'outdoor', 'entertainment')`,
    ),
    check(
      "discovered_events_price_type_check",
      sql`${table.priceType} in ('free', 'low-cost', 'paid', 'unknown')`,
    ),
    check(
      "discovered_events_meal_type_check",
      sql`${table.mealType} is null or ${table.mealType} in ('community-meal', 'food-support')`,
    ),
  ],
);

export type DiscoveredEvent = typeof discoveredEventsTable.$inferSelect;