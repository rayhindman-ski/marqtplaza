import { jsonb, index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedEventSnapshotsTable = pgTable(
  "saved_event_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("saved_event_snapshots_user_event_unique").on(table.userId, table.eventId),
    index("saved_event_snapshots_user_idx").on(table.userId),
  ],
);

export const savedEventAlertsTable = pgTable(
  "saved_event_alerts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    alert: jsonb("alert").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("saved_event_alerts_user_fingerprint_unique").on(table.userId, table.fingerprint),
    index("saved_event_alerts_user_event_idx").on(table.userId, table.eventId),
  ],
);

export const savedEventTombstonesTable = pgTable(
  "saved_event_tombstones",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_event_tombstones_user_event_unique").on(table.userId, table.eventId),
    index("saved_event_tombstones_user_idx").on(table.userId),
  ],
);

export const insertSavedEventSnapshotSchema = createInsertSchema(savedEventSnapshotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSavedEventAlertSchema = createInsertSchema(savedEventAlertsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSavedEventTombstoneSchema = createInsertSchema(savedEventTombstonesTable).omit({
  id: true,
  deletedAt: true,
});

export type InsertSavedEventSnapshot = z.infer<typeof insertSavedEventSnapshotSchema>;
export type InsertSavedEventAlert = z.infer<typeof insertSavedEventAlertSchema>;
export type InsertSavedEventTombstone = z.infer<typeof insertSavedEventTombstoneSchema>;
export type SavedEventSnapshot = typeof savedEventSnapshotsTable.$inferSelect;
export type SavedEventAlert = typeof savedEventAlertsTable.$inferSelect;
export type SavedEventTombstone = typeof savedEventTombstonesTable.$inferSelect;