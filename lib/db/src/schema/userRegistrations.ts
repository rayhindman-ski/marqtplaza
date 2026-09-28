import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRegistrationsTable = pgTable(
  "user_registrations",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    registrationType: text("registration_type").notNull(),
    email: text("email").notNull(),
    // Survey answers are collected only after ~two weeks of use, so a fresh
    // registration legitimately has none of them yet.
    usefulnessRating: integer("usefulness_rating"),
    referralLikelihood: integer("referral_likelihood"),
    desiredFeatures: text("desired_features"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("user_registrations_user_unique").on(table.userId)],
);

export const insertUserRegistrationSchema = createInsertSchema(userRegistrationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserRegistration = typeof userRegistrationsTable.$inferSelect;
export type InsertUserRegistration = z.infer<typeof insertUserRegistrationSchema>;