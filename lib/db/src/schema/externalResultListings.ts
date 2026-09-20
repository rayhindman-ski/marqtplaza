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
import { externalResultsTable } from "./externalResults";

export const externalResultListingsTable = pgTable(
  "external-result-listings",
  {
    id: serial("id").primaryKey(),
    externalResultId: integer("external_result_id").notNull()
      .references(() => externalResultsTable.id, { onDelete: "cascade" }),
    cityId: text("city_id").notNull(),
    section: text("section").notNull(),
    listingId: text("listing_id").notNull(),
    listing: jsonb("listing").$type<unknown>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("external_result_listings_snapshot_listing_unique")
      .on(table.externalResultId, table.listingId),
    index("external_result_listings_direct_lookup_index")
      .on(table.cityId, table.section, table.listingId, table.fetchedAt.desc(), table.externalResultId.desc()),
  ],
);

export const insertExternalResultListingSchema = createInsertSchema(externalResultListingsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertExternalResultListing = z.infer<typeof insertExternalResultListingSchema>;
export type ExternalResultListing = typeof externalResultListingsTable.$inferSelect;