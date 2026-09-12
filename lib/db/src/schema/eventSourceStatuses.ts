import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const eventSourceStatusesTable = pgTable("event_source_statuses", {
  sourceId: text("source_id").primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceGroup: text("source_group").notNull(),
  status: text("status").notNull().default("pending"),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  nextScanAt: timestamp("next_scan_at", { withTimezone: true }),
  retryLeaseUntil: timestamp("retry_lease_until", { withTimezone: true }),
  message: text("message"),
  eventsCaptured: integer("events_captured").notNull().default(0),
  eventsEligible: integer("events_eligible").notNull().default(0),
  eventsAdded: integer("events_added").notNull().default(0),
  eventsUpdated: integer("events_updated").notNull().default(0),
  pagesFailed: integer("pages_failed").notNull().default(0),
});

export type EventSourceStatus = typeof eventSourceStatusesTable.$inferSelect;