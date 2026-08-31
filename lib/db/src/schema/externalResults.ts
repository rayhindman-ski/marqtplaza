import {
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
import { externalQueriesTable } from "./externalQueries";
import { userQueriesTable } from "./userQueries";

export const externalResultsTable = pgTable(
  "external-results",
  {
    id: serial("id").primaryKey(),
    externalQueryId: integer("external_query_id").notNull().references(() => externalQueriesTable.id, { onDelete: "cascade" }),
    userQueryId: integer("user_query_id").notNull().references(() => userQueriesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    payload: jsonb("payload").$type<unknown[]>().notNull(),
    resultCount: integer("result_count").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("external_results_external_query_id_unique").on(table.externalQueryId),
    index("external_results_user_query_id_index").on(table.userQueryId),
    index("external_results_lookup_index").on(table.normalizedKey, table.provider, table.fetchedAt),
  ],
);

export const insertExternalResultSchema = createInsertSchema(externalResultsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertExternalResult = z.infer<typeof insertExternalResultSchema>;
export type ExternalResult = typeof externalResultsTable.$inferSelect;