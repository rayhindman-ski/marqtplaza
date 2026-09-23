import { foreignKey, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

/**
 * Consumer registration foundation (release v0.5.1).
 *
 * A pending registration is *not* an account: no `app_users` row, no identity
 * provider user, and no credential exist until a later release completes the
 * journey. This table only records that someone asked to register with a
 * given contact set and whether they have proven control of the mailbox.
 *
 * States (server-side only):
 *   pending   — request accepted, registration email queued/sent, not yet verified
 *   verified  — a registration link was consumed; awaiting the (future) full form
 *   expired   — no valid link was consumed before `expires_at`
 *   cancelled — withdrawn by policy or support; never reactivated
 *
 * Transitions:
 *   pending  -> verified   (POST verify with the newest valid token)
 *   pending  -> expired    (cleanup after expires_at)
 *   pending  -> cancelled  (support / policy)
 *   verified -> cancelled  (support / policy)
 *
 * This table is additive and unrelated to `user_registrations`, which remains
 * the campaign-style research registration.
 */
export const CONSUMER_REGISTRATION_STATUSES = ["pending", "verified", "expired", "cancelled"] as const;
export type ConsumerRegistrationStatus = (typeof CONSUMER_REGISTRATION_STATUSES)[number];

export const consumerRegistrationsTable = pgTable(
  "consumer_registrations",
  {
    id: serial("id").primaryKey(),
    /** Conservatively normalized address (trimmed, lower-cased domain); never merges distinct addresses. */
    normalizedEmail: text("normalized_email").notNull(),
    name: text("name").notNull(),
    /** E.164 where derivable; contact data only, never an SMS sign-in factor. */
    normalizedPhone: text("normalized_phone").notNull(),
    locale: text("locale").notNull().default("nl"),
    status: text("status").notNull().default("pending"),
    /** Opaque, allow-listed internal return reference (never interpreted here). */
    returnRef: text("return_ref"),
    /** The pending registration itself expires; tokens expire sooner. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resendCount: integer("resend_count").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One effective (pending or verified) registration per address at a time.
    uniqueIndex("consumer_registrations_one_open_per_email_unique")
      .on(table.normalizedEmail)
      .where(sql`${table.status} in ('pending', 'verified')`),
    index("consumer_registrations_status_expiry_idx").on(table.status, table.expiresAt),
  ],
);

/**
 * One row per issued registration link. Only the SHA-256 digest of the token
 * is stored (REG-013); the raw token exists solely inside the email. A token is
 * effective when it is unused, unsuperseded, and not yet expired. Issuing a new
 * token supersedes every earlier effective token in the same transaction.
 */
export const consumerRegistrationTokensTable = pgTable(
  "consumer_registration_tokens",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id").notNull(),
    tokenDigest: text("token_digest").notNull(),
    /** Outbox row that carried this token; keeps delivery and token lifecycle auditable together. */
    outboxId: integer("outbox_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Named explicitly: the generated name would exceed PostgreSQL's 63-char limit.
    foreignKey({
      name: "consumer_registration_tokens_registration_fk",
      columns: [table.registrationId],
      foreignColumns: [consumerRegistrationsTable.id],
    }).onDelete("cascade"),
    uniqueIndex("consumer_registration_tokens_digest_unique").on(table.tokenDigest),
    index("consumer_registration_tokens_registration_idx").on(table.registrationId, table.createdAt),
  ],
);

export const insertConsumerRegistrationSchema = createInsertSchema(consumerRegistrationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertConsumerRegistrationTokenSchema = createInsertSchema(
  consumerRegistrationTokensTable,
).omit({ id: true, createdAt: true });

export type ConsumerRegistration = typeof consumerRegistrationsTable.$inferSelect;
export type ConsumerRegistrationToken = typeof consumerRegistrationTokensTable.$inferSelect;
export type InsertConsumerRegistration = z.infer<typeof insertConsumerRegistrationSchema>;
export type InsertConsumerRegistrationToken = z.infer<typeof insertConsumerRegistrationTokenSchema>;
