import { date, index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

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

export const communityPostParticipationTable = pgTable(
  "community_post_participation",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("community_post_participation_post_user_action").on(table.postId, table.userId, table.action),
    index("community_post_participation_post_action_index").on(table.postId, table.action),
  ],
);

export type CommunityPost = typeof communityPostsTable.$inferSelect;
export type CommunityPostParticipation = typeof communityPostParticipationTable.$inferSelect;