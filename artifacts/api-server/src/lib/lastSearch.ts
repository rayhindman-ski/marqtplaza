import { lt } from "drizzle-orm";
import { db, accountLastSearchTable } from "@workspace/db";
import { getAccountOptions, type AccountOptionsSource } from "./accountOptions";
import { PutAccountLastSearchBody } from "@workspace/api-zod";
type AccountLastSearchInput = ReturnType<typeof PutAccountLastSearchBody.parse>;

export const LAST_SEARCH_RETENTION_DAYS = 90;

export function validateLastSearch(input: AccountLastSearchInput, options: AccountOptionsSource = getAccountOptions) {
  const catalog = options();
  const knownNeighborhoods = new Set(catalog.neighborhoods.map((item) => item.id));
  const knownCategories = new Set(catalog.interests.map((item) => item.id));
  return {
    cityId: input.cityId,
    neighborhoodIds: [...new Set(input.neighborhoodIds)].filter((id) => knownNeighborhoods.has(id)),
    categoryIds: [...new Set(input.categoryIds)].filter((id) => knownCategories.has(id)),
    query: input.query ?? null,
    filters: input.filters ?? {},
    locale: input.locale,
    sourceScope: input.sourceScope,
    selectedListing: input.selectedListing ?? null,
    presentationMode: input.presentationMode,
    zoom: input.zoom ?? null,
    centerLat: input.centerLat === undefined ? null : input.centerLat.toFixed(3),
    centerLng: input.centerLng === undefined ? null : input.centerLng.toFixed(3),
    scrollContext: input.scrollContext ?? null,
  };
}

export async function purgeExpiredLastSearch(now = new Date()): Promise<void> {
  await db.delete(accountLastSearchTable).where(lt(accountLastSearchTable.expiresAt, now));
}

export function serializeLastSearch(row: typeof accountLastSearchTable.$inferSelect, options: AccountOptionsSource = getAccountOptions) {
  const validated = validateLastSearch({
    cityId: row.cityId,
    neighborhoodIds: row.neighborhoodIds,
    categoryIds: row.categoryIds,
    ...(row.query ? { query: row.query } : {}),
    filters: row.filters,
    locale: row.locale === "en" ? "en" : "nl",
    sourceScope: row.sourceScope === "web" ? "web" : "local",
    ...(row.selectedListing ? { selectedListing: row.selectedListing } : {}),
    presentationMode: row.presentationMode === "list" ? "list" : "map",
    ...(row.zoom !== null ? { zoom: row.zoom } : {}),
    ...(row.centerLat !== null ? { centerLat: Number(row.centerLat) } : {}),
    ...(row.centerLng !== null ? { centerLng: Number(row.centerLng) } : {}),
    ...(row.scrollContext ? { scrollContext: row.scrollContext } : {}),
  }, options);
  const catalog = options();
  const names = validated.neighborhoodIds.map((id) => catalog.neighborhoods.find((item) => item.id === id)?.label[validated.locale]).filter(Boolean);
  const categories = validated.categoryIds.map((id) => catalog.interests.find((item) => item.id === id)?.label[validated.locale]).filter(Boolean);
  return {
    ...validated,
    summary: [...names, ...categories].join(" · ") || (validated.locale === "nl" ? "Den Haag" : "The Hague"),
    capturedAt: row.capturedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}