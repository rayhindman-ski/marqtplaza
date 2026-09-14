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

import { appUsersTable } from "./accounts";

/**
 * Outbox delivery states.
 *
 * Transitions:
 *   queued    -> sending   (dispatcher claims the row)
 *   sending   -> sent      (provider accepted)
 *   sending   -> queued    (transient failure; attempts += 1, nextRetryAt set)
 *   sending   -> failed    (permanent failure or attempts exhausted)
 *   queued    -> cancelled (the triggering state was reverted)
 *
 * Rows are written in the same transaction as the state change they describe
 * (FR-013). When no delivery provider is configured they remain `queued`.
 */
export const OUTBOX_STATUSES = ["queued", "sending", "sent", "failed", "cancelled"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const lifecycleOutboxTable = pgTable(
  "lifecycle_outbox",
  {
    id: serial("id").primaryKey(),
    /** Stable event code, e.g. `claim.submitted`. */
    eventCode: text("event_code").notNull(),
    /** Internal reference to the recipient (app user id), never an address. */
    recipientUserId: integer("recipient_user_id").references(() => appUsersTable.id, {
      onDelete: "set null",
    }),
    template: text("template").notNull(),
    locale: text("locale").notNull().default("nl"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Caller-supplied key that makes writing the same event twice a no-op. */
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("lifecycle_outbox_idempotency_unique").on(table.idempotencyKey),
    index("lifecycle_outbox_status_retry_idx").on(table.status, table.nextRetryAt),
    index("lifecycle_outbox_recipient_idx").on(table.recipientUserId, table.createdAt),
  ],
);

export const ACCOUNT_REQUEST_SCOPES = ["account", "business"] as const;
export type AccountRequestScope = (typeof ACCOUNT_REQUEST_SCOPES)[number];

export const ACCOUNT_REQUEST_TYPES = ["deletion", "export", "suspension_appeal"] as const;
export type AccountRequestType = (typeof ACCOUNT_REQUEST_TYPES)[number];

/**
 * Request states.
 *
 * Transitions:
 *   received  -> blocked    (e.g. sole owner of a published business)
 *   received  -> in_review  (operator picks it up)
 *   blocked   -> received   (blocker resolved by the user)
 *   in_review -> completed  (resolution recorded)
 *   in_review -> rejected   (resolution recorded)
 *   received  -> withdrawn  (user withdraws before review)
 *   blocked   -> withdrawn  (user withdraws before review)
 */
export const ACCOUNT_REQUEST_STATUSES = [
  "received",
  "blocked",
  "in_review",
  "completed",
  "rejected",
  "withdrawn",
] as const;
export type AccountRequestStatus = (typeof ACCOUNT_REQUEST_STATUSES)[number];

export const accountRequestsTable = pgTable(
  "account_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUsersTable.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("received"),
    /** Optimistic-concurrency version; every transition increments it. */
    version: integer("version").notNull().default(1),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    blockerCode: text("blocker_code"),
    resolutionCode: text("resolution_code"),
    resolutionNote: text("resolution_note"),
    resolvedByUserId: text("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("account_requests_user_idx").on(table.userId, table.createdAt),
    index("account_requests_status_idx").on(table.status, table.deadlineAt),
  ],
);

export const insertLifecycleOutboxSchema = createInsertSchema(lifecycleOutboxTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAccountRequestSchema = createInsertSchema(accountRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LifecycleOutboxRow = typeof lifecycleOutboxTable.$inferSelect;
export type AccountRequest = typeof accountRequestsTable.$inferSelect;
export type InsertLifecycleOutboxRow = z.infer<typeof insertLifecycleOutboxSchema>;
export type InsertAccountRequest = z.infer<typeof insertAccountRequestSchema>;
