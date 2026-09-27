import { check, foreignKey, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { businessProfilesTable } from "./businessDirectory";

/**
 * Business membership lifecycle (v0.5.2, BMEM-002/004). Invitations are
 * addressed to an e-mail; the single-use link token is minted at dispatch
 * time and only its digest is stored (same pattern as consumer registration).
 * `business_member_events` is append-only: rows are never updated or deleted
 * while the business exists.
 */
export const BUSINESS_MEMBER_ROLES = ["owner", "manager"] as const;
export type BusinessMemberRole = (typeof BUSINESS_MEMBER_ROLES)[number];

export const BUSINESS_MEMBER_EVENT_ACTIONS = [
  "invited",
  "accepted",
  "revoked",
  "removed",
  "left",
  "role_changed",
  "transferred",
  "closed",
] as const;
export type BusinessMemberEventAction = (typeof BUSINESS_MEMBER_EVENT_ACTIONS)[number];

export const businessInvitationsTable = pgTable(
  "business_invitations",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id").notNull(),
    /** Lower-cased, trimmed address the owner typed; matched against the accepting account's verified address. */
    normalizedEmail: text("normalized_email").notNull(),
    role: text("role").notNull(),
    /** Clerk subject of the inviting owner. */
    invitedByUserId: text("invited_by_user_id").notNull(),
    locale: text("locale").notNull().default("nl"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "business_invitations_profile_fk",
      columns: [table.businessProfileId],
      foreignColumns: [businessProfilesTable.id],
    }).onDelete("cascade"),
    // One open invitation per address per business (BMEM-002).
    uniqueIndex("business_invitations_open_email_unique")
      .on(table.businessProfileId, table.normalizedEmail)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("business_invitations_profile_idx").on(table.businessProfileId, table.createdAt),
    check("business_invitations_role_check", sql`${table.role} in ('owner', 'manager')`),
  ],
);

export const businessInvitationTokensTable = pgTable(
  "business_invitation_tokens",
  {
    id: serial("id").primaryKey(),
    invitationId: integer("invitation_id").notNull(),
    tokenDigest: text("token_digest").notNull(),
    /** Outbox row that carried this token; a retried send of the same row keeps its first token valid. */
    outboxId: integer("outbox_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "business_invitation_tokens_invitation_fk",
      columns: [table.invitationId],
      foreignColumns: [businessInvitationsTable.id],
    }).onDelete("cascade"),
    uniqueIndex("business_invitation_tokens_digest_unique").on(table.tokenDigest),
    index("business_invitation_tokens_invitation_idx").on(table.invitationId, table.createdAt),
  ],
);

export const businessMemberEventsTable = pgTable(
  "business_member_events",
  {
    id: serial("id").primaryKey(),
    businessProfileId: integer("business_profile_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    targetUserId: text("target_user_id"),
    invitationId: integer("invitation_id"),
    action: text("action").notNull(),
    reasonCode: text("reason_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "business_member_events_profile_fk",
      columns: [table.businessProfileId],
      foreignColumns: [businessProfilesTable.id],
    }).onDelete("cascade"),
    index("business_member_events_profile_idx").on(table.businessProfileId, table.createdAt),
    check(
      "business_member_events_action_check",
      sql`${table.action} in ('invited', 'accepted', 'revoked', 'removed', 'left', 'role_changed', 'transferred', 'closed')`,
    ),
  ],
);

export type BusinessInvitation = typeof businessInvitationsTable.$inferSelect;
export type BusinessMemberEvent = typeof businessMemberEventsTable.$inferSelect;
