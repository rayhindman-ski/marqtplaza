import {
  boolean,
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
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    isApproximateLocation: boolean("is_approximate_location").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discovered_events_canonical_url_unique").on(table.canonicalUrl),
    index("discovered_events_location_id_index").on(table.locationId),
  ],
);

export type DiscoveredEvent = typeof discoveredEventsTable.$inferSelect;