import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userQueriesTable = pgTable(
  "user-queries",
  {
    id: serial("id").primaryKey(),
    cityId: text("city_id").notNull(),
    section: text("section").notNull(),
    language: text("language").notNull(),
    neighborhoods: jsonb("neighborhoods").$type<string[]>().notNull().default([]),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    mode: text("mode").notNull().default("live"),
    userId: text("user_id"),
    anonymousId: text("anonymous_id"),
    normalizedKey: text("normalized_key").notNull(),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("user_queries_normalized_key_index").on(table.normalizedKey, table.createdAt),
    index("user_queries_user_id_index").on(table.userId, table.createdAt),
    index("user_queries_anonymous_id_index").on(table.anonymousId, table.createdAt),
    check("user_queries_mode_check", sql`${table.mode} in ('live', 'stored_only')`),
    check("user_queries_status_check", sql`${table.status} in ('pending', 'running', 'succeeded', 'partial', 'failed')`),
  ],
);

export const insertUserQuerySchema = createInsertSchema(userQueriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserQuery = z.infer<typeof insertUserQuerySchema>;
export type UserQuery = typeof userQueriesTable.$inferSelect;