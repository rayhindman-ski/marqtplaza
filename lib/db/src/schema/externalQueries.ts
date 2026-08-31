import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userQueriesTable } from "./userQueries";

export const externalQueriesTable = pgTable(
  "external-queries",
  {
    id: serial("id").primaryKey(),
    userQueryId: integer("user_query_id").notNull().references(() => userQueriesTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("external_queries_user_query_id_index").on(table.userQueryId),
    index("external_queries_lookup_index").on(table.provider, table.normalizedKey, table.createdAt),
    check("external_queries_provider_check", sql`${table.provider} in ('google_places', 'openstreetmap')`),
    check("external_queries_status_check", sql`${table.status} in ('pending', 'running', 'succeeded', 'failed')`),
  ],
);

export const insertExternalQuerySchema = createInsertSchema(externalQueriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExternalQuery = z.infer<typeof insertExternalQuerySchema>;
export type ExternalQuery = typeof externalQueriesTable.$inferSelect;