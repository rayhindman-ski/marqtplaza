import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const providerUsageTable = pgTable(
  "provider_usage",
  {
    provider: text("provider").primaryKey(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastResetAt: timestamp("last_reset_at"),
  },
  (table) => [
    check("provider_usage_request_count_check", sql`${table.requestCount} >= 0`),
  ],
);

export type ProviderUsage = typeof providerUsageTable.$inferSelect;