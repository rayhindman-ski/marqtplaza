import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const captureResultsTable = pgTable("capture_results", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  businessUrl: text("business_url"),
  zipCode: text("zip_code"),
  resultType: text("result_type").notNull(), // 'news' | 'event' | 'ad'
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  publishedAt: text("published_at"),
  rawJson: text("raw_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCaptureResultSchema = createInsertSchema(
  captureResultsTable,
).omit({ id: true, createdAt: true });

export type InsertCaptureResult = z.infer<typeof insertCaptureResultSchema>;
export type CaptureResult = typeof captureResultsTable.$inferSelect;
