import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const newsSourceStatusesTable = pgTable("news_source_statuses", {
  sourceId: text("source_id").primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull().default("pending"),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  nextScanAt: timestamp("next_scan_at", { withTimezone: true }),
  retryLeaseUntil: timestamp("retry_lease_until", { withTimezone: true }),
  message: text("message"),
  articlesCaptured: integer("articles_captured").notNull().default(0),
  articlesPublished: integer("articles_published").notNull().default(0),
  articlesUpdated: integer("articles_updated").notNull().default(0),
  pagesFailed: integer("pages_failed").notNull().default(0),
});

export type NewsSourceStatus = typeof newsSourceStatusesTable.$inferSelect;