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
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

import { appUsersTable } from "./accounts";

/**
 * Outbox delivery states. Each one is a truthful statement about what the
 * application knows, never a guess about what the recipient saw.
 *
 *   queued    — intent committed with the state change; nothing sent yet
 *   sending   — a dispatcher has claimed the row and is calling the provider
 *   accepted  — the provider accepted the message (it may still bounce)
 *   delivered — the provider later confirmed delivery (receipt callback)
 *   failed    — permanent provider failure or the retry budget is exhausted
 *   cancelled — the triggering state was reverted before anything was sent
 *
 * Transitions:
 *   queued    -> sending    (dispatcher claims the row)
 *   sending   -> accepted   (provider accepted)
 *   sending   -> queued     (transient failure; attempts += 1, nextRetryAt set)
 *   sending   -> failed     (permanent failure or attempts exhausted)
 *   sending   -> queued     (stale claim reclaimed after a dispatcher crash)
 *   accepted  -> delivered  (provider receipt; repeated receipts are no-ops)
 *   failed    -> queued     (explicit support resend; attempts reset)
 *   queued    -> cancelled  (the triggering state was reverted)
 *
 * Rows are written in the same transaction as the state change they describe
 * (FR-013). When no delivery provider is configured they remain `queued`.
 */
export const OUTBOX_STATUSES = [
  "queued",
  "sending",
  "accepted",
  "delivered",
  "failed",
  "cancelled",
] as const;
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
    /**
     * Retention-safe template variables only (ids, names, statuses). Never
     * contact data, evidence, tokens, or reviewer notes; see the allow-list in
     * the API server's outbox module.
     */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Caller-supplied key that makes writing the same event twice a no-op. */
    idempotencyKey: text("idempotency_key"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** Retry budget recorded per row so a later configuration change cannot silently extend it. */
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    /** Set while `sending`; lets a restarted dispatcher reclaim abandoned rows. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("lifecycle_outbox_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("lifecycle_outbox_provider_message_unique")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index("lifecycle_outbox_status_retry_idx").on(table.status, table.nextRetryAt),
    index("lifecycle_outbox_recipient_idx").on(table.recipientUserId, table.createdAt),
  ],
);

export const DELIVERY_ATTEMPT_OUTCOMES = [
  "accepted",
  "transient_failure",
  "permanent_failure",
] as const;
export type DeliveryAttemptOutcome = (typeof DELIVERY_ATTEMPT_OUTCOMES)[number];

/**
 * One row per provider call. Attempts are append-only; the unique
 * (outbox, attempt) pair means a duplicate dispatcher cannot record the same
 * attempt twice. Only error codes are stored, never provider response bodies.
 */
export const lifecycleDeliveryAttemptsTable = pgTable(
  "lifecycle_delivery_attempts",
  {
    id: serial("id").primaryKey(),
    outboxId: integer("outbox_id")
      .notNull()
      .references(() => lifecycleOutboxTable.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    outcome: text("outcome").notNull(),
    errorCode: text("error_code"),
    providerMessageId: text("provider_message_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lifecycle_delivery_attempts_outbox_attempt_unique").on(table.outboxId, table.attempt),
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
 *   received  -> blocked    (e.g. sole owner of a business)
 *   received  -> in_review  (support picks it up)
 *   blocked   -> received   (every blocker resolved through a recorded decision)
 *   blocked   -> in_review  (support picks it up to resolve the blockers)
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
export const OPEN_ACCOUNT_REQUEST_STATUSES = [
  "received",
  "blocked",
  "in_review",
] as const satisfies readonly AccountRequestStatus[];

export const ACCOUNT_REQUEST_BLOCKERS = ["blocked_ownership"] as const;
export type AccountRequestBlocker = (typeof ACCOUNT_REQUEST_BLOCKERS)[number];

/**
 * Resolution codes recorded by the support path. The first three resolve an
 * ownership blocker for one business; the last two close the request itself.
 */
export const ACCOUNT_REQUEST_RESOLUTIONS = [
  "ownership_transferred",
  "business_closed",
  "business_unpublished",
  "account_deleted",
  "request_rejected",
] as const;
export type AccountRequestResolution = (typeof ACCOUNT_REQUEST_RESOLUTIONS)[number];

export type AccountRequestBlockerDetails = {
  /** Businesses the requester is the only owner of, as of the latest evaluation. */
  businessProfileIds: number[];
};

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
    /** Set only from release configuration; null means no deadline has been approved. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    /** Scopes the requester explicitly acknowledged when submitting. */
    acknowledgedScopes: jsonb("acknowledged_scopes").$type<string[]>().notNull().default([]),
    blockerCode: text("blocker_code"),
    blockerDetails: jsonb("blocker_details").$type<AccountRequestBlockerDetails>(),
    resolutionCode: text("resolution_code"),
    /** Internal support note; never serialised to the requester. */
    resolutionNote: text("resolution_note"),
    resolvedByUserId: text("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("account_requests_user_idx").on(table.userId, table.createdAt),
    index("account_requests_status_idx").on(table.status, table.deadlineAt),
    // One open request per user, scope, and type at a time.
    uniqueIndex("account_requests_one_open_per_user_unique")
      .on(table.userId, table.scope, table.type)
      .where(sql`${table.status} in ('received', 'blocked', 'in_review')`),
  ],
);

export const ACCOUNT_REQUEST_ACTORS = ["requester", "support", "system"] as const;
export type AccountRequestActor = (typeof ACCOUNT_REQUEST_ACTORS)[number];

/**
 * Append-only audit trail of request transitions and blocker resolutions.
 * Support actors are recorded by internal subject only; the requester never
 * sees who handled the request or the internal note.
 */
export const accountRequestEventsTable = pgTable(
  "account_request_events",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => accountRequestsTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actor: text("actor").notNull(),
    /** Clerk subject of the support actor; null for requester/system entries. */
    actorUserId: text("actor_user_id"),
    resolutionCode: text("resolution_code"),
    /** Business the resolution applied to, when it concerned one. */
    businessProfileId: integer("business_profile_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("account_request_events_request_idx").on(table.requestId, table.createdAt)],
);

export const insertLifecycleOutboxSchema = createInsertSchema(lifecycleOutboxTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertLifecycleDeliveryAttemptSchema = createInsertSchema(
  lifecycleDeliveryAttemptsTable,
).omit({ id: true, finishedAt: true });
export const insertAccountRequestSchema = createInsertSchema(accountRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAccountRequestEventSchema = createInsertSchema(accountRequestEventsTable).omit({
  id: true,
  createdAt: true,
});

export type LifecycleOutboxRow = typeof lifecycleOutboxTable.$inferSelect;
export type LifecycleDeliveryAttempt = typeof lifecycleDeliveryAttemptsTable.$inferSelect;
export type AccountRequest = typeof accountRequestsTable.$inferSelect;
export type AccountRequestEvent = typeof accountRequestEventsTable.$inferSelect;
export type InsertLifecycleOutboxRow = z.infer<typeof insertLifecycleOutboxSchema>;
export type InsertLifecycleDeliveryAttempt = z.infer<typeof insertLifecycleDeliveryAttemptSchema>;
export type InsertAccountRequest = z.infer<typeof insertAccountRequestSchema>;
export type InsertAccountRequestEvent = z.infer<typeof insertAccountRequestEventSchema>;
