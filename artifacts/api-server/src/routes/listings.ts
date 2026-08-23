import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { discoveredEventsTable } from "@workspace/db/schema";
import { MARKERS } from "../lib/static-listings.js";
import {
  SOCIAL_MAP_LISTINGS,
  SOCIAL_MAP_SNAPSHOT_DATE,
  SOCIAL_MAP_SOURCE_NOTE,
  type SocialMapCategory,
} from "../lib/social-map-listings.js";

const router: IRouter = Router();
type ListingSection = "events" | "businesses" | "food-drink" | "social-map";
type ListingCategory = "Museums" | "Tours" | "Family" | "Entertainment" | "Outdoors" | "Markets" | "Businesses" | "Food & Drink" | "Social map";
type BusinessCategory =
  | "Retail & Shopping"
  | "Food & Drink"
  | "Health & Wellness"
  | "Beauty & Personal Care"
  | "Professional Services"
  | "Finance & Legal"
  | "Home & Repair"
  | "Automotive & Mobility"
  | "Education & Childcare"
  | "Hospitality & Travel"
  | "Arts, Culture & Entertainment"
  | "Fitness & Sports";
type ListingSource = "google_maps" | "openstreetmap" | "curated" | "source_scan";
type Listing = {
  id: string;
  locationId: string;
  category: ListingCategory;
  name: string;
  address?: string;
  description: string;
  x: number;
  y: number;
  details: string;
  lat: number;
  lng: number;
  sourceUrl?: string;
  businessCategory?: BusinessCategory;
  source?: ListingSource;
  sourceName?: string;
  neighborhood?: string;
  socialCategory?: SocialMapCategory;
  officialUrl?: string;
  sourcePageUrl?: string;
  snapshotDate?: string;
};

function sourceNameFromUrl(sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Bounding boxes for each supported city (south, west, north, east)
const CITY_BOUNDS: Record<string, { s: number; w: number; n: number; e: number }> = {
  ams: { s: 52.34, w: 4.85, n: 52.40, e: 5.00 },
  rot: { s: 51.88, w: 4.43, n: 51.96, e: 4.55 },
  utr: { s: 52.07, w: 5.09, n: 52.12, e: 5.17 },
  // Include the Hague's outer neighbourhoods. Provider locality evidence
  // below rejects nearby municipalities inside this safe discovery rectangle.
  dhg: { s: 52.025, w: 4.235, n: 52.125, e: 4.42 },
  ein: { s: 51.41, w: 5.43, n: 51.47, e: 5.52 },
};

// Map amenity/shop/leisure tags to our 6 app categories
const AMENITY_TO_CATEGORY: Record<string, string> = {
  // Markets — food, drink, everyday commerce
  cafe: "Markets",
  restaurant: "Markets",
  bar: "Markets",
  pub: "Markets",
  bakery: "Markets",
  pharmacy: "Markets",
  bank: "Markets",
  hairdresser: "Markets",
  florist: "Markets",
  butcher: "Markets",
  supermarket: "Markets",
  fast_food: "Markets",
  ice_cream: "Markets",
  food_court: "Markets",
  marketplace: "Markets",
  market: "Markets",
  // Entertainment — performances, nightlife, venues
  theatre: "Entertainment",
  cinema: "Entertainment",
  arts_centre: "Entertainment",
  community_centre: "Entertainment",
  events_venue: "Entertainment",
  nightclub: "Entertainment",
  music_venue: "Entertainment",
  social_centre: "Entertainment",
  // Museums — cultural institutions
  library: "Museums",
};

const SHOP_TO_CATEGORY: Record<string, string> = {
  books: "Markets",
  clothes: "Markets",
  bicycle: "Markets",
  furniture: "Markets",
  gift: "Markets",
  jewelry: "Markets",
  shoes: "Markets",
  sports: "Markets",
  toys: "Markets",
  electronics: "Markets",
  convenience: "Markets",
  deli: "Markets",
  confectionery: "Markets",
};

const LEISURE_TO_CATEGORY: Record<string, string> = {
  fitness_centre: "Outdoors",
  sports_centre: "Outdoors",
  stadium: "Entertainment",
  park: "Outdoors",
  nature_reserve: "Outdoors",
  beach: "Outdoors",
};

const TOURISM_TO_CATEGORY: Record<string, string> = {
  museum: "Museums",
  gallery: "Museums",
  attraction: "Tours",
  viewpoint: "Outdoors",
};

function classifyNode(tags: Record<string, string>): string | null {
  if (tags["amenity"] && AMENITY_TO_CATEGORY[tags["amenity"]]) {
    return AMENITY_TO_CATEGORY[tags["amenity"]];
  }
  if (tags["shop"] && SHOP_TO_CATEGORY[tags["shop"]]) {
    return SHOP_TO_CATEGORY[tags["shop"]];
  }
  if (tags["leisure"] && LEISURE_TO_CATEGORY[tags["leisure"]]) {
    return LEISURE_TO_CATEGORY[tags["leisure"]];
  }
  if (tags["tourism"] && TOURISM_TO_CATEGORY[tags["tourism"]]) {
    return TOURISM_TO_CATEGORY[tags["tourism"]];
  }
  return null;
}

// Convert lat/lon to x/y percentage within city bounding box
function toXY(
  lat: number,
  lon: number,
  bounds: { s: number; w: number; n: number; e: number },
): { x: number; y: number } {
  const x = ((lon - bounds.w) / (bounds.e - bounds.w)) * 100;
  const y = ((bounds.n - lat) / (bounds.n - bounds.s)) * 100;
  return {
    x: Math.max(5, Math.min(95, Math.round(x))),
    y: Math.max(5, Math.min(95, Math.round(y))),
  };
}

// Build a human-readable description from OSM tags
function descriptionFromTags(tags: Record<string, string>): string {
  const cuisine = tags["cuisine"];
  const amenity = tags["amenity"];
  const shop = tags["shop"];
  const leisure = tags["leisure"];
  const tourism = tags["tourism"];

  if (cuisine) {
    const type = (amenity ?? "restaurant").replace(/_/g, " ");
    return `${cap(type)} – ${cuisine.split(";")[0].replace(/_/g, " ")} cuisine`;
  }
  if (shop) return `Local ${shop.replace(/_/g, " ")} shop`;
  if (amenity) return cap(amenity.replace(/_/g, " ")) + " in the neighbourhood";
  if (leisure) return cap(leisure.replace(/_/g, " ")) + " venue";
  if (tourism) return cap(tourism.replace(/_/g, " ")) + " attraction";
  return "Local spot in the neighbourhood";
}

// Build a short details string from OSM tags
function detailsFromTags(tags: Record<string, string>, category: string): string {
  if (category === "Markets") {
    const hours = tags["opening_hours"];
    if (hours) {
      const match = hours.match(/\d{2}:\d{2}/g);
      if (match && match.length >= 2) return `Open until ${match[1]}`;
    }
    return "Open today";
  }
  if (category === "Entertainment") return "Check venue for schedule";
  if (category === "Museums") return "Open during regular hours";
  return "";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function canonicalExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return null;
  }
}

function normalizedTitle(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizedAddress(value: string | undefined): string {
  return normalizedTitle(value ?? "");
}

function parseListingSection(value: unknown): ListingSection {
  const section = String(value ?? "events").trim();
  if (section === "businesses" || section === "food-drink" || section === "social-map") return section;
  return "events";
}

function isInHagueBounds(lat: number, lng: number): boolean {
  const bounds = CITY_BOUNDS.dhg;
  return lat >= bounds.s && lat <= bounds.n
    && lng >= bounds.w && lng <= bounds.e;
}

function hasHagueEvidence(address: string): boolean {
  const value = address.toLowerCase();
  if (/\b(delft|oegstgeest|wassenaar|rijswijk|zoetermeer|leidschendam|voorburg|westland)\b/.test(value)) return false;
  return /\bden haag\b|\bthe hague\b|\bscheveningen\b|\bs?-?gravenhage\b|\b25\d{2}\s?[a-z]{2}\b/i.test(address);
}

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

type GooglePlacesResponse = { places?: GooglePlace[]; nextPageToken?: string };

const GOOGLE_TYPE_TO_BUSINESS_CATEGORY: Record<string, BusinessCategory> = {
  restaurant: "Food & Drink",
  cafe: "Food & Drink",
  bar: "Food & Drink",
  bakery: "Food & Drink",
  meal_takeaway: "Food & Drink",
  meal_delivery: "Food & Drink",
  food: "Food & Drink",
  store: "Retail & Shopping",
  shopping_mall: "Retail & Shopping",
  clothing_store: "Retail & Shopping",
  convenience_store: "Retail & Shopping",
  department_store: "Retail & Shopping",
  electronics_store: "Retail & Shopping",
  furniture_store: "Retail & Shopping",
  hardware_store: "Retail & Shopping",
  home_goods_store: "Retail & Shopping",
  jewelry_store: "Retail & Shopping",
  book_store: "Retail & Shopping",
  pet_store: "Retail & Shopping",
  pharmacy: "Health & Wellness",
  doctor: "Health & Wellness",
  dentist: "Health & Wellness",
  hospital: "Health & Wellness",
  physiotherapist: "Health & Wellness",
  beauty_salon: "Beauty & Personal Care",
  barber_shop: "Beauty & Personal Care",
  hair_care: "Beauty & Personal Care",
  spa: "Beauty & Personal Care",
  lawyer: "Finance & Legal",
  accounting: "Finance & Legal",
  bank: "Finance & Legal",
  insurance_agency: "Finance & Legal",
  real_estate_agency: "Finance & Legal",
  electrician: "Home & Repair",
  plumber: "Home & Repair",
  locksmith: "Home & Repair",
  roofing_contractor: "Home & Repair",
  general_contractor: "Home & Repair",
  painter: "Home & Repair",
  car_dealer: "Automotive & Mobility",
  car_repair: "Automotive & Mobility",
  car_wash: "Automotive & Mobility",
  car_rental: "Automotive & Mobility",
  gas_station: "Automotive & Mobility",
  parking: "Automotive & Mobility",
  school: "Education & Childcare",
  primary_school: "Education & Childcare",
  secondary_school: "Education & Childcare",
  university: "Education & Childcare",
  preschool: "Education & Childcare",
  child_care_agency: "Education & Childcare",
  hotel: "Hospitality & Travel",
  lodging: "Hospitality & Travel",
  hostel: "Hospitality & Travel",
  travel_agency: "Hospitality & Travel",
  museum: "Arts, Culture & Entertainment",
  art_gallery: "Arts, Culture & Entertainment",
  movie_theater: "Arts, Culture & Entertainment",
  performing_arts_theater: "Arts, Culture & Entertainment",
  theater: "Arts, Culture & Entertainment",
  night_club: "Arts, Culture & Entertainment",
  tourist_attraction: "Arts, Culture & Entertainment",
  gym: "Fitness & Sports",
  fitness_center: "Fitness & Sports",
  sports_club: "Fitness & Sports",
  sports_activity_location: "Fitness & Sports",
  stadium: "Fitness & Sports",
};

const GOOGLE_FOOD_PLACE_TYPES = new Set([
  "bakery",
  "bar",
  "cafe",
  "cafeteria",
  "coffee_shop",
  "dessert_shop",
  "fast_food_restaurant",
  "food",
  "ice_cream_shop",
  "meal_delivery",
  "meal_takeaway",
  "pizza_restaurant",
  "pub",
  "restaurant",
  "tea_house",
  "wine_bar",
]);

function isFoodGooglePlace(place: GooglePlace): boolean {
  const primaryType = place.primaryType?.toLowerCase();
  return Boolean(
    primaryType
    && (GOOGLE_FOOD_PLACE_TYPES.has(primaryType) || primaryType.endsWith("_restaurant")),
  );
}

function businessCategoryForGooglePlace(
  place: GooglePlace,
  section: Exclude<ListingSection, "events" | "social-map">,
): BusinessCategory {
  if (section === "food-drink") return "Food & Drink";
  const primaryType = place.primaryType?.toLowerCase();
  if (isFoodGooglePlace(place)) return "Food & Drink";
  if (primaryType) {
    const mappedCategory = GOOGLE_TYPE_TO_BUSINESS_CATEGORY[primaryType];
    if (mappedCategory) return mappedCategory;
  }
  return "Professional Services";
}

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_TIMEOUT_MS = 12_000;
const GOOGLE_PLACES_MAX_RESULTS = 1000;
const GOOGLE_PLACES_MAX_PAGES_PER_SEARCH = 3;
const GOOGLE_PLACES_CONCURRENCY = 6;
const GOOGLE_PLACES_CACHE_TTL_MS = 15 * 60 * 1000;
const OPEN_STREET_MAP_RESULT_RESERVE = 0.25;
const googlePlacesCache = new Map<string, { expiresAt: number; listings: Listing[] }>();
const googlePlacesRequests = new Map<string, Promise<Listing[]>>();
let activeGoogleRequests = 0;
const queuedGoogleRequests: Array<() => void> = [];
const overpassCache = new Map<string, { expiresAt: number; elements: OsmElement[] }>();
const overpassRequests = new Map<string, Promise<OsmElement[]>>();

type GeographicBounds = { s: number; w: number; n: number; e: number };
type GoogleSearchSpec = { textQuery: string; bounds: GeographicBounds };

// Text Search is ranked and query-scoped, so one city-wide query systematically
// misses smaller businesses. These overlapping cells give every part of The
// Hague a chance to rank for each relevant business group while the final
// bounds/evidence checks remain the source of truth.
const HAGUE_DISCOVERY_AREAS: GeographicBounds[] = [
  // Two rows by three columns. Adjacent cells overlap so ranked results near
  // a cell edge get another opportunity without making the search unbounded.
  { s: 52.025, w: 4.235, n: 52.077, e: 4.31 },
  { s: 52.025, w: 4.295, n: 52.077, e: 4.375 },
  { s: 52.025, w: 4.36, n: 52.077, e: 4.42 },
  { s: 52.073, w: 4.235, n: 52.125, e: 4.31 },
  { s: 52.073, w: 4.295, n: 52.125, e: 4.375 },
  { s: 52.073, w: 4.36, n: 52.125, e: 4.42 },
];

const GOOGLE_SEARCH_TERMS: Record<Exclude<ListingSection, "events" | "social-map">, string[]> = {
  businesses: [
    "winkels en retail in Den Haag Nederland",
    "kleding schoenen juweliers en boekhandels in Den Haag",
    "elektronica meubels en woonwinkels in Den Haag",
    "supermarkten en speciaalzaken in Den Haag",
    "zorg huisartsen tandartsen en apotheken in Den Haag",
    "kappers schoonheidssalons en spa's in Den Haag",
    "professionele diensten kantoren en consultants in Den Haag",
    "advocaten accountants banken verzekeringen en makelaars in Den Haag",
    "klusbedrijven loodgieters elektriciens en reparatie in Den Haag",
    "autogarages fietsenwinkels en mobiliteit in Den Haag",
    "scholen kinderopvang en onderwijs in Den Haag",
    "hotels hostels reisbureaus en toerisme in Den Haag",
    "kunst cultuur theaters bioscopen en musea in Den Haag",
    "sportscholen fitness en sportclubs in Den Haag",
  ],
  "food-drink": [
    "restaurants en eetcafes in Den Haag Nederland",
    "koffiebars lunchrooms en brunch in Den Haag",
    "bars pubs en nachtleven in Den Haag",
    "bakkerijen patisserieen en chocolatiers in Den Haag",
    "afhaalrestaurants bezorging en fastfood in Den Haag",
    "ijssalons en dessertzaken in Den Haag",
    "vegan vegetarische en internationale horeca in Den Haag",
  ],
};

function googleSearchSpecs(section: Exclude<ListingSection, "events" | "social-map">): GoogleSearchSpec[] {
  return HAGUE_DISCOVERY_AREAS.flatMap((area) =>
    GOOGLE_SEARCH_TERMS[section].map((term) => ({
      textQuery: term,
      bounds: area,
    })),
  );
}

function googlePlaceDescription(place: GooglePlace, section: Exclude<ListingSection, "events" | "social-map">): string {
  const type = place.primaryTypeDisplayName?.text
    ?? place.primaryType?.replace(/_/g, " ")
    ?? (section === "food-drink" ? "Food & drink" : "Local business");
  return `${cap(type)} in Den Haag`;
}

function googlePlaceDetails(place: GooglePlace): string {
  const parts = [place.formattedAddress];
  if (typeof place.rating === "number") {
    parts.push(`${place.rating.toFixed(1)}★${place.userRatingCount ? ` (${place.userRatingCount} reviews)` : ""}`);
  }
  const opening = place.regularOpeningHours?.weekdayDescriptions?.[0];
  if (opening) parts.push(opening);
  return parts.filter(Boolean).join(" · ");
}

function googlePlaceUrl(place: GooglePlace): string | undefined {
  if (place.googleMapsUri) return place.googleMapsUri;
  if (place.websiteUri) return place.websiteUri;
  return place.id
    ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(place.id)}`
    : undefined;
}

async function withGoogleRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const grant = () => {
      activeGoogleRequests += 1;
      resolve();
    };
    if (activeGoogleRequests < GOOGLE_PLACES_CONCURRENCY) {
      grant();
    } else {
      queuedGoogleRequests.push(grant);
    }
  });
  try {
    return await operation();
  } finally {
    activeGoogleRequests -= 1;
    queuedGoogleRequests.shift()?.();
  }
}

async function fetchGooglePlaces(
  bounds: { s: number; w: number; n: number; e: number },
  section: Exclude<ListingSection, "events" | "social-map">,
): Promise<Listing[]> {
  const cacheKey = section;
  const cached = googlePlacesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.listings;
  const inFlight = googlePlacesRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = collectGooglePlaces(bounds, section);
  googlePlacesRequests.set(cacheKey, request);
  try {
    const listings = await request;
    googlePlacesCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_PLACES_CACHE_TTL_MS, listings });
    return listings;
  } finally {
    googlePlacesRequests.delete(cacheKey);
  }
}

async function collectGooglePlaces(
  bounds: { s: number; w: number; n: number; e: number },
  section: Exclude<ListingSection, "events" | "social-map">,
): Promise<Listing[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const seen = new Set<string>();
  const searches = googleSearchSpecs(section);
  const resultsBySearch = searches.map((): Listing[] => []);
  let nextSearchIndex = 0;
  const worker = async () => {
    while (true) {
      const searchIndex = nextSearchIndex++;
      if (searchIndex >= searches.length) return;
      const search = searches[searchIndex];
      const searchResults = resultsBySearch[searchIndex];
      let pageToken: string | undefined;
      for (let page = 0; page < GOOGLE_PLACES_MAX_PAGES_PER_SEARCH; page += 1) {
        const response = await withGoogleRequestSlot(() => fetch(GOOGLE_PLACES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
              "places.id",
              "places.displayName",
              "places.formattedAddress",
              "places.location",
              "places.primaryType",
              "places.primaryTypeDisplayName",
              "places.googleMapsUri",
              "places.websiteUri",
              "places.rating",
              "places.userRatingCount",
              "places.regularOpeningHours.weekdayDescriptions",
              "nextPageToken",
            ].join(","),
          },
          body: JSON.stringify({
            textQuery: search.textQuery,
            languageCode: "nl",
            regionCode: "NL",
            pageSize: 20,
            ...(pageToken ? { pageToken } : {}),
            locationBias: {
              rectangle: {
                low: { latitude: search.bounds.s, longitude: search.bounds.w },
                high: { latitude: search.bounds.n, longitude: search.bounds.e },
              },
            },
          }),
          signal: AbortSignal.timeout(GOOGLE_PLACES_TIMEOUT_MS),
        }));
        if (!response.ok) {
          throw new Error(`Google Places HTTP ${response.status}`);
        }

        const data = (await response.json()) as GooglePlacesResponse;
        for (const place of data.places ?? []) {
          const name = place.displayName?.text?.trim();
          const address = place.formattedAddress?.trim();
          const lat = place.location?.latitude;
          const lng = place.location?.longitude;
          if (!name || !address || typeof lat !== "number" || typeof lng !== "number") continue;
          if (!isInHagueBounds(lat, lng) || !hasHagueEvidence(address)) continue;
           if (section === "food-drink" && place.primaryType && !isFoodGooglePlace(place)) continue;
           const businessCategory = businessCategoryForGooglePlace(place, section);
           if (section === "businesses" && businessCategory === "Food & Drink") continue;

           const providerKey = place.id ? `id:${place.id}` : undefined;
           const nameAddressKey = `place:${normalizedTitle(name)}|${normalizedAddress(address)}`;
           if ((providerKey && seen.has(providerKey)) || seen.has(nameAddressKey)) continue;
           if (providerKey) seen.add(providerKey);
           seen.add(nameAddressKey);
          const { x, y } = toXY(lat, lng, bounds);
          searchResults.push({
             id: `google-${section}-${place.id ?? normalizedTitle(name).replace(/\s+/g, "-")}`,
            locationId: "dhg",
            category: section === "food-drink" ? "Food & Drink" : "Businesses",
             businessCategory,
            name,
             address,
            description: googlePlaceDescription(place, section),
            x,
            y,
            details: googlePlaceDetails(place),
            lat,
            lng,
            sourceUrl: googlePlaceUrl(place),
            source: "google_maps",
            sourceName: "Google Maps",
          });
        }
        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }
    }
  };

  const workerResults = await Promise.allSettled(
    Array.from({ length: Math.min(GOOGLE_PLACES_CONCURRENCY, searches.length) }, () => worker()),
  );
  const results: Listing[] = [];
  for (let resultIndex = 0; results.length < GOOGLE_PLACES_MAX_RESULTS; resultIndex += 1) {
    let foundResult = false;
    for (const searchResults of resultsBySearch) {
      const result = searchResults[resultIndex];
      if (!result) continue;
      results.push(result);
      foundResult = true;
      if (results.length >= GOOGLE_PLACES_MAX_RESULTS) break;
    }
    if (!foundResult) break;
  }
  if (results.length === 0) {
    const failure = workerResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  return results;
}

function listingDedupeKey(listing: Pick<Listing, "name" | "address" | "lat" | "lng">): string {
  if (listing.address) {
    return `${normalizedTitle(listing.name)}|${normalizedAddress(listing.address)}`;
  }
  // A ~100m coordinate bucket is the fallback for OSM nodes without address
  // tags; it keeps separate branches while removing an alternate provider pin.
  return `${normalizedTitle(listing.name)}|${Math.round(listing.lat * 1000)}|${Math.round(listing.lng * 1000)}`;
}

function mergeBusinessListings(
  googleListings: Listing[],
  osmListings: Listing[],
): { listings: Listing[]; osmAdded: number } {
  const listings: Listing[] = [];
  const seen = new Set<string>();
  const addListing = (listing: Listing): boolean => {
    const key = listingDedupeKey(listing);
    if (seen.has(key)) return false;
    seen.add(key);
    listings.push(listing);
    return true;
  };
  const reservedForOsm = Math.min(
    osmListings.length,
    Math.ceil(GOOGLE_PLACES_MAX_RESULTS * OPEN_STREET_MAP_RESULT_RESERVE),
  );
  const preferredGoogleCount = Math.max(0, GOOGLE_PLACES_MAX_RESULTS - reservedForOsm);
  for (const listing of googleListings.slice(0, preferredGoogleCount)) addListing(listing);

  let osmAdded = 0;
  for (const listing of osmListings) {
    if (listings.length >= GOOGLE_PLACES_MAX_RESULTS) break;
    if (addListing(listing)) osmAdded += 1;
  }
  for (const listing of googleListings.slice(preferredGoogleCount)) {
    if (listings.length >= GOOGLE_PLACES_MAX_RESULTS) break;
    addListing(listing);
  }
  return {
    listings,
    osmAdded,
  };
}

function businessCategoryForOsmTags(
  tags: Record<string, string>,
  section: Exclude<ListingSection, "events" | "social-map">,
): BusinessCategory {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const office = tags.office;
  const craft = tags.craft;
  const leisure = tags.leisure;
  const tourism = tags.tourism;

  if (section === "food-drink"
    || ["cafe", "restaurant", "bar", "pub", "bakery", "fast_food", "ice_cream", "food_court", "confectionery"].includes(amenity ?? "")) {
    return "Food & Drink";
  }
  if (["pharmacy", "doctors", "dentist", "clinic", "hospital", "optician", "hearing_aids"].includes(amenity ?? "")) {
    return "Health & Wellness";
  }
  if (["hairdresser", "beauty", "beauty_salon", "spa"].includes(amenity ?? "") || ["hairdresser", "beauty"].includes(shop ?? "")) {
    return "Beauty & Personal Care";
  }
  if (["bank", "bureau_de_change", "insurance", "lawyer", "notary"].includes(amenity ?? "")
    || ["financial", "insurance", "lawyer"].includes(office ?? "")) {
    return "Finance & Legal";
  }
  if (["school", "college", "university", "kindergarten", "language_school"].includes(amenity ?? "")) {
    return "Education & Childcare";
  }
  if (["car_repair", "car", "car_parts", "tyres", "fuel", "bicycle", "motorcycle"].includes(shop ?? "")
    || ["car_repair", "fuel", "parking"].includes(amenity ?? "")) {
    return "Automotive & Mobility";
  }
  if (["gym", "sports_centre", "fitness_centre", "stadium", "pitch"].includes(leisure ?? "")) {
    return "Fitness & Sports";
  }
  if (["museum", "gallery"].includes(tourism ?? "")
    || ["theatre", "cinema", "arts_centre", "music_venue"].includes(amenity ?? "")) {
    return "Arts, Culture & Entertainment";
  }
  if (["hotel", "hostel", "guest_house", "motel"].includes(tourism ?? "")
    || ["hotel", "hostel"].includes(amenity ?? "")) {
    return "Hospitality & Travel";
  }
  if (["electrician", "plumber", "carpenter", "painter", "roofing", "gardener", "handyman"].includes(craft ?? "")
    || ["hardware", "trade"].includes(shop ?? "")) {
    return "Home & Repair";
  }
  if (shop || tags.amenity || craft || office) {
    return shop ? "Retail & Shopping" : "Professional Services";
  }
  return "Professional Services";
}

function osmAddressFromTags(tags: Record<string, string>): string | undefined {
  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const postcode = tags["addr:postcode"];
  const city = tags["addr:city"] ?? tags["addr:place"];
  const line = [street, houseNumber].filter(Boolean).join(" ");
  const locality = [postcode, city].filter(Boolean).join(" ");
  return [line, locality].filter(Boolean).join(", ") || undefined;
}

function hasForeignOsmLocality(tags: Record<string, string>): boolean {
  const city = normalizedTitle(tags["addr:city"] ?? tags["addr:place"]);
  if (city && !["den haag", "the hague", "s gravenhage", "scheveningen"].includes(city)) return true;
  const postcode = tags["addr:postcode"];
  return Boolean(postcode && !/^25\d{2}/.test(postcode.replace(/\s/g, "")));
}

function hasHagueOsmEvidence(tags: Record<string, string>): boolean {
  return hasHagueEvidence([
    tags["addr:postcode"],
    tags["addr:city"] ?? tags["addr:place"],
  ].filter(Boolean).join(" "));
}

const OSM_FOOD_AMENITIES = new Set([
  "bakery",
  "bar",
  "cafe",
  "cafe;bar",
  "fast_food",
  "food_court",
  "ice_cream",
  "pub",
  "restaurant",
]);

const OSM_FOOD_SHOPS = new Set([
  "bakery",
  "confectionery",
  "deli",
  "ice_cream",
  "pastry",
]);

function isFoodOsmTags(tags: Record<string, string>): boolean {
  return OSM_FOOD_AMENITIES.has(tags.amenity) || OSM_FOOD_SHOPS.has(tags.shop);
}

function fetchOpenStreetMapBusinesses(elements: OsmElement[], section: Exclude<ListingSection, "events" | "social-map">, bounds: { s: number; w: number; n: number; e: number }): Listing[] {
  const listings: Listing[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    if (!isInHagueBounds(element.lat, element.lon)) continue;
    const tags = element.tags ?? {};
    if (hasForeignOsmLocality(tags) || !hasHagueOsmEvidence(tags)) continue;

    const isFood = isFoodOsmTags(tags);
    if (!tags.name || (section === "food-drink" ? !isFood : isFood || !Boolean(tags.shop || tags.amenity))) continue;

    const address = osmAddressFromTags(tags);
    const { x, y } = toXY(element.lat, element.lon, bounds);
    const listing: Listing = {
      id: `osm-${element.id}`,
      locationId: "dhg",
      category: section === "food-drink" ? "Food & Drink" : "Businesses",
      businessCategory: businessCategoryForOsmTags(tags, section),
      name: tags.name,
      ...(address ? { address } : {}),
      description: descriptionFromTags(tags),
      x,
      y,
      details: [address, detailsFromTags(tags, "Markets")].filter(Boolean).join(" · "),
      lat: element.lat,
      lng: element.lon,
      source: "openstreetmap",
      sourceName: "OpenStreetMap",
    };
    const key = listingDedupeKey(listing);
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push(listing);
    if (listings.length >= GOOGLE_PLACES_MAX_RESULTS) break;
  }

  return listings;
}

interface OsmElement {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OsmResponse {
  elements: OsmElement[];
}

async function fetchCityListings(
  bounds: { s: number; w: number; n: number; e: number },
): Promise<OsmElement[]> {
  const cacheKey = `${bounds.s}:${bounds.w}:${bounds.n}:${bounds.e}`;
  const cached = overpassCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.elements;
  const inFlight = overpassRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = fetchCityListingsFromOverpass(bounds);
  overpassRequests.set(cacheKey, request);
  try {
    const elements = await request;
    overpassCache.set(cacheKey, {
      expiresAt: Date.now() + GOOGLE_PLACES_CACHE_TTL_MS,
      elements,
    });
    return elements;
  } finally {
    overpassRequests.delete(cacheKey);
  }
}

async function fetchCityListingsFromOverpass(
  bounds: { s: number; w: number; n: number; e: number },
): Promise<OsmElement[]> {
  // Single query combining businesses, events, and specials to avoid rate limits
  const bbox = `${bounds.s},${bounds.w},${bounds.n},${bounds.e}`;
  const query = `[out:json][timeout:20];
(
  node[amenity][name](${bbox});
  node[shop][name](${bbox});
  node[leisure][name](${bbox});
  node[tourism][name](${bbox});
);
   out 2000;`;

  const url =
    "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "buurtplaza.nl/1.0 (neighbourhood discovery app; contact: info@buurtplaza.nl)",
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as OsmResponse;
  return data.elements ?? [];
}

router.get("/listings", async (req, res) => {
  const cityId = String(req.query["cityId"] ?? "").trim();
  const listingSection = parseListingSection(req.query["section"]);

  if (!cityId) {
    res.status(400).json({ listings: [], source: "fallback", message: "cityId is required" });
    return;
  }

  const bounds = CITY_BOUNDS[cityId];
  if (!bounds) {
    res.status(400).json({ listings: [], source: "fallback", message: `Unknown city: ${cityId}` });
    return;
  }

  if (listingSection === "social-map") {
    if (cityId !== "dhg") {
      res.json({
        listings: [],
        source: "curated",
        message: "De Sociale kaart is momenteel alleen beschikbaar voor Den Haag.",
      });
      return;
    }
    const listings: Listing[] = SOCIAL_MAP_LISTINGS.map((listing) => {
      const { x, y } = toXY(listing.lat, listing.lng, bounds);
      return {
        id: listing.id,
        locationId: "dhg",
        category: "Social map",
        name: listing.name,
        description: listing.description,
        x,
        y,
        details: listing.address,
        lat: listing.lat,
        lng: listing.lng,
        sourceUrl: listing.officialUrl,
        officialUrl: listing.officialUrl,
        sourcePageUrl: listing.sourcePageUrl,
        source: "curated",
        sourceName: listing.sourceName,
        address: listing.address,
        neighborhood: listing.neighborhood,
        socialCategory: listing.socialCategory,
        snapshotDate: SOCIAL_MAP_SNAPSHOT_DATE,
      };
    });
    res.json({
      listings,
      source: "curated",
      message: `${SOCIAL_MAP_SOURCE_NOTE} Snapshot: ${SOCIAL_MAP_SNAPSHOT_DATE}.`,
    });
    return;
  }

  // All cities have hand-curated datasets. For Den Haag, source-scanned events are
  // persisted separately and merged in so a completed scan changes the public list.
  const curated = MARKERS.filter((m) => m.locationId === cityId);
  const curatedListings: Listing[] = curated.map((listing) => ({
    ...listing,
    source: "curated",
    sourceName: sourceNameFromUrl(listing.sourceUrl),
  }));
  if (curated.length > 0) {
    if (cityId !== "dhg") {
      res.json({ listings: curatedListings, source: "curated" });
      return;
    }

    if (listingSection !== "events") {
      try {
        const googleListings = await fetchGooglePlaces(bounds, listingSection);
        if (googleListings.length > 0) {
          let mergedListings = googleListings;
          let osmAdded = 0;
          try {
    const elements = await fetchCityListings(bounds);
            const supplementalListings = fetchOpenStreetMapBusinesses(elements, listingSection, bounds);
            const merged = mergeBusinessListings(googleListings, supplementalListings);
            mergedListings = merged.listings;
            osmAdded = merged.osmAdded;
          } catch (error) {
            console.warn("[listings] OpenStreetMap supplement unavailable:", error instanceof Error ? error.message : error);
          }
          res.json({
            listings: mergedListings,
            source: "google_places",
            message: `${googleListings.length} Haagse ${listingSection === "food-drink" ? "horecazaken" : "bedrijven"} uit Google Places${osmAdded > 0 ? ` en ${osmAdded} aanvullende OpenStreetMap-vermeldingen` : ""}.`,
          });
          return;
        }
      } catch (error) {
        console.warn(`[listings] Google Places ${listingSection} unavailable:`, error instanceof Error ? error.message : error);
      }

      try {
    const elements = await fetchCityListings(bounds);
        const fallbackListings = fetchOpenStreetMapBusinesses(elements, listingSection, bounds);
        res.json({
          listings: fallbackListings,
          source: "fallback",
          message: fallbackListings.length > 0
            ? "Google Places is tijdelijk niet beschikbaar; OpenStreetMap-resultaten worden getoond."
            : "Er zijn tijdelijk geen gecontroleerde resultaten voor deze sectie.",
        });
      } catch {
        res.json({
          listings: [],
          source: "fallback",
          message: "Google Places en de aanvullende kaartbron zijn tijdelijk niet beschikbaar.",
        });
      }
      return;
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const discovered = await db
        .select()
        .from(discoveredEventsTable)
        .where(and(
          eq(discoveredEventsTable.locationId, "dhg"),
          eq(discoveredEventsTable.reviewStatus, "approved"),
          gte(discoveredEventsTable.startsAt, today),
        ))
        .orderBy(asc(discoveredEventsTable.startsAt), desc(discoveredEventsTable.lastSeenAt));
      const curatedUrls = new Set(
        curated.map((listing) => canonicalExternalUrl(listing.sourceUrl)).filter((url): url is string => Boolean(url)),
      );
      const curatedTitles = new Set(curated.map((listing) => normalizedTitle(listing.name)));
      const discoveredListings = discovered
        .filter((event) =>
          !curatedUrls.has(canonicalExternalUrl(event.canonicalUrl) ?? event.canonicalUrl) &&
          !curatedTitles.has(normalizedTitle(event.title)),
        )
        .map((event) => ({
        id: `source-${event.id}`,
        locationId: event.locationId,
        category: event.category,
        name: event.title,
        description: event.description,
        x: event.x,
        y: event.y,
        details: [
          event.startsAt ? event.startsAt.replace("T", " ").slice(0, 16) : "Date not provided",
          event.openingTimes ? `Opening times: ${event.openingTimes}` : "",
          event.venue ?? "Venue not provided",
          event.isApproximateLocation ? "Map pin: Den Haag city centre (exact coordinates unavailable)" : "",
        ].filter(Boolean).join(" · "),
        lat: event.lat,
        lng: event.lng,
        sourceUrl: event.canonicalUrl,
         source: "source_scan" as const,
         sourceName: event.sourceName,
        isApproximateLocation: event.isApproximateLocation,
      }));
      res.json({
        listings: [...curatedListings, ...discoveredListings],
        source: "curated",
        message: discoveredListings.length > 0
          ? `${discoveredListings.length} source-scanned event${discoveredListings.length === 1 ? "" : "s"} added to the curated Den Haag activities.`
          : undefined,
      });
    } catch {
      res.json({
        listings: curatedListings,
        source: "curated",
        message: "Curated activities are available; source-scanned events are temporarily unavailable.",
      });
    }
    return;
  }

  try {
    const elements = await fetchCityListings(bounds);

    // Classify elements into categories (max 20 per category)
    const counts: Record<string, number> = {
      Museums: 0, Tours: 0, Family: 0, Entertainment: 0, Outdoors: 0, Markets: 0,
    };
    const MAX_PER_CATEGORY = 20;

    const listings = elements
      .filter((el) => el.tags?.name)
      .reduce<Array<{
        id: string;
        locationId: string;
        category: string;
        name: string;
        description: string;
        x: number;
        y: number;
        details: string;
        lat: number;
        lng: number;
        sourceUrl?: string;
        source: ListingSource;
        sourceName: string;
      }>>((acc, el) => {
        const category = classifyNode(el.tags);
        if (!category) return acc;
        if (counts[category] >= MAX_PER_CATEGORY) return acc;
        counts[category]++;

        const { x, y } = toXY(el.lat, el.lon, bounds);
        acc.push({
          id: `osm-${el.id}`,
          locationId: cityId,
          category,
          name: el.tags.name,
          description: descriptionFromTags(el.tags),
          x,
          y,
          details: detailsFromTags(el.tags, category),
          lat: el.lat,
          lng: el.lon,
          source: "openstreetmap",
          sourceName: "OpenStreetMap",
        });
        return acc;
      }, []);

    // If Overpass returned nothing meaningful, fall back to static data
    if (listings.length === 0) {
    const fallback = MARKERS
      .filter((m) => m.locationId === cityId)
      .map((listing) => ({
        ...listing,
        source: "curated" as const,
        sourceName: sourceNameFromUrl(listing.sourceUrl),
      }));
      res.json({
        listings: fallback,
        source: "fallback",
        message: "No live results – showing curated listings",
      });
      return;
    }

    res.json({ listings, source: "live" });
  } catch {
    // Overpass unreachable or timed out – serve static fallback so the UI is never broken
    const fallback = MARKERS
      .filter((m) => m.locationId === cityId)
      .map((listing) => ({
        ...listing,
        source: "curated" as const,
        sourceName: sourceNameFromUrl(listing.sourceUrl),
      }));
    res.json({
      listings: fallback,
      source: "fallback",
      message: "Live data temporarily unavailable – showing curated listings",
    });
  }
});

export default router;
