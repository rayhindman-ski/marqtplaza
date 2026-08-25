import { date, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const communityPostsTable = pgTable(
  "community_posts",
  {
    id: serial("id").primaryKey(),
    cityId: text("city_id").notNull(),
    neighborhood: text("neighborhood"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    startsAt: date("starts_at", { mode: "string" }),
    expiresAt: date("expires_at", { mode: "string" }).notNull(),
    authorId: text("author_id").notNull(),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("community_posts_city_neighborhood_index").on(table.cityId, table.neighborhood),
    index("community_posts_status_expires_index").on(table.status, table.expiresAt),
  ],
);

export type CommunityPost = typeof communityPostsTable.$inferSelect;