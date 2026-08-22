import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const newsArticlesTable = pgTable(
  "news_articles",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    publishedAt: text("published_at"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("news_articles_canonical_url_unique").on(table.canonicalUrl),
    index("news_articles_category_published_at_index").on(table.category, table.publishedAt),
    index("news_articles_source_id_index").on(table.sourceId),
  ],
);

export const insertNewsArticleSchema = createInsertSchema(newsArticlesTable)
  .omit({ id: true, firstSeenAt: true, lastSeenAt: true, updatedAt: true });

export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;
export type NewsArticle = typeof newsArticlesTable.$inferSelect;