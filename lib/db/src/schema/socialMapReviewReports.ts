import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const socialMapReviewReportsTable = pgTable("social_map_review_reports", {
  reportKey: text("report_key").primaryKey(),
  report: jsonb("report").notNull(),
  reviewLeaseUntil: timestamp("review_lease_until", { withTimezone: true }),
});