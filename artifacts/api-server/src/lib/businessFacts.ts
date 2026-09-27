import { sql } from "drizzle-orm";
import { db, externalResultsTable } from "@workspace/db";
import { NEIGHBORHOOD_BOUNDARIES, isPointInsideNeighborhoods } from "@workspace/geo";
import { BusinessCategory, type ApiFieldError } from "@workspace/api-zod";

/**
 * New-business facts (v0.5.2, BPROF-003/004). The category and subcategory
 * come from the taxonomy the directory already serves: `BusinessCategory` is
 * the category; for Food & Drink the food type is the subcategory. Geography
 * is derived server-side from the address using what the directory already
 * knows (stored listings at the same postcode and house number, then the
 * official neighbourhood polygons). No external geocoder is called; when
 * nothing matches, the declared neighbourhood is kept only if it is an
 * official one, and the reviewer sees that the geography is declared, not
 * derived.
 */
export const BUSINESS_CATEGORIES: readonly string[] = Object.values(BusinessCategory);
export const FOOD_DRINK_CATEGORY = "Food & Drink";
export const FOOD_SUBCATEGORIES: readonly string[] = ["restaurant", "cafe", "bar", "bakery", "takeaway", "other"];
export const LOOKUP_CITY_ID = "dhg";

export function isKnownNeighborhood(name: string | null | undefined): boolean {
  return Boolean(name && Object.prototype.hasOwnProperty.call(NEIGHBORHOOD_BOUNDARIES, name));
}

export function subcategoriesFor(category: string): readonly string[] {
  return category === FOOD_DRINK_CATEGORY ? FOOD_SUBCATEGORIES : [];
}

const DUTCH_POSTCODE = /\b([1-9][0-9]{3})\s?([A-Za-z]{2})\b/;
const HOUSE_NUMBER = /\b(\d{1,5})(?:\s?[a-zA-Z]|-\d+)?\b/;

export type ParsedAddress = { postcode: string | null; houseNumber: string | null };

export function parseAddress(address: string | null | undefined): ParsedAddress {
  if (!address) return { postcode: null, houseNumber: null };
  const postcode = address.match(DUTCH_POSTCODE);
  const withoutPostcode = postcode ? address.replace(postcode[0], " ") : address;
  const houseNumber = withoutPostcode.match(HOUSE_NUMBER);
  return {
    postcode: postcode ? `${postcode[1]}${postcode[2].toUpperCase()}` : null,
    houseNumber: houseNumber ? houseNumber[1] : null,
  };
}

export type BusinessFactsInput = {
  name: string;
  category: string;
  subcategory: string | null;
  neighborhood: string;
  address: string | null;
  websiteUrl: string | null;
  phone: string | null;
};

/**
 * Draft-time checks: only things that can never be right are refused, so a
 * partially filled draft still saves (BPROF-009).
 */
export function validateBusinessFactsForDraft(facts: BusinessFactsInput): ApiFieldError[] {
  const errors: ApiFieldError[] = [];
  if (!BUSINESS_CATEGORIES.includes(facts.category)) errors.push({ field: "business.category", code: "invalid" });
  if (facts.subcategory && !subcategoriesFor(facts.category).includes(facts.subcategory)) {
    errors.push({ field: "business.subcategory", code: "invalid" });
  }
  if (facts.phone && !/^[+0-9][0-9 ()-]{6,24}$/.test(facts.phone)) errors.push({ field: "business.phone", code: "invalid" });
  return errors;
}

/** Submit-time checks: the release's required facts for a business that is not listed yet. */
export function validateBusinessFactsForSubmit(facts: BusinessFactsInput): ApiFieldError[] {
  const errors = validateBusinessFactsForDraft(facts);
  if (!facts.address || parseAddress(facts.address).postcode === null) {
    errors.push({ field: "business.address", code: facts.address ? "postcode_required" : "required" });
  }
  if (subcategoriesFor(facts.category).length > 0 && !facts.subcategory) errors.push({ field: "business.subcategory", code: "required" });
  if (!facts.phone && !facts.websiteUrl) errors.push({ field: "business.phone", code: "phone_or_website_required" });
  return errors;
}

export type DerivedGeography = {
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  /** How the neighbourhood was established; the reviewer sees this. */
  basis: "address_match" | "declared_official" | "unresolved";
};

export type AddressMatchLoader = (postcode: string, houseNumber: string | null) => Promise<{ lat: number; lng: number; neighborhood: string | null }[]>;

/** Stored provider listings at the same postcode (and house number when given). */
export const loadStoredAddressMatches: AddressMatchLoader = async (postcode, houseNumber) => {
  const spaced = `${postcode.slice(0, 4)} ${postcode.slice(4)}`.toLowerCase();
  const compact = postcode.toLowerCase();
  const rows = await db.execute<{ lat: number | null; lng: number | null; neighborhood: string | null; address: string | null }>(sql`
    with recent as (
      select ${externalResultsTable.payload} as payload
      from ${externalResultsTable}
      where ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY_ID}","section":"businesses"%`}
         or ${externalResultsTable.normalizedKey} like ${`{"cityId":"${LOOKUP_CITY_ID}","section":"food-drink"%`}
      order by ${externalResultsTable.fetchedAt} desc, ${externalResultsTable.id} desc
      limit 200
    )
    select distinct on (elem->>'id')
      (elem->>'lat')::double precision as lat,
      (elem->>'lng')::double precision as lng,
      elem->>'neighborhood' as neighborhood,
      elem->>'address' as address
    from recent, jsonb_array_elements(recent.payload) as elem
    where lower(elem->>'address') like ${`%${spaced}%`} or lower(elem->>'address') like ${`%${compact}%`}
    order by elem->>'id'
    limit 50
  `);
  const matches = rows.rows
    .filter((row) => row.lat !== null && row.lng !== null)
    .map((row) => ({ lat: row.lat!, lng: row.lng!, neighborhood: row.neighborhood, address: row.address }));
  if (!houseNumber) return matches;
  const exact = matches.filter((row) => parseAddress(row.address).houseNumber === houseNumber);
  return exact.length > 0 ? exact : matches;
};

export async function deriveGeography(
  address: string | null,
  declaredNeighborhood: string | null,
  load: AddressMatchLoader = loadStoredAddressMatches,
): Promise<DerivedGeography> {
  const parsed = parseAddress(address);
  if (parsed.postcode) {
    let matches: Awaited<ReturnType<AddressMatchLoader>> = [];
    try {
      matches = await load(parsed.postcode, parsed.houseNumber);
    } catch {
      matches = [];
    }
    if (matches.length > 0) {
      const lat = matches.reduce((sum, row) => sum + row.lat, 0) / matches.length;
      const lng = matches.reduce((sum, row) => sum + row.lng, 0) / matches.length;
      const names = Object.keys(NEIGHBORHOOD_BOUNDARIES);
      const inside = names.find((name) => isPointInsideNeighborhoods(lat, lng, [name])) ?? null;
      const fromListing = matches.map((row) => row.neighborhood).find((name) => isKnownNeighborhood(name)) ?? null;
      const neighborhood = inside ?? fromListing;
      if (neighborhood) return { neighborhood, latitude: lat, longitude: lng, basis: "address_match" };
    }
  }
  if (isKnownNeighborhood(declaredNeighborhood)) {
    return { neighborhood: declaredNeighborhood!, latitude: null, longitude: null, basis: "declared_official" };
  }
  return { neighborhood: null, latitude: null, longitude: null, basis: "unresolved" };
}
