import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  discoveredEventsTable,
  externalQueriesTable,
  externalResultsTable,
  providerUsageTable,
  pool,
  type DiscoveredEvent,
  userQueriesTable,
} from "@workspace/db";
import { MARKERS } from "../lib/static-listings.js";
import {
  SOCIAL_MAP_LISTINGS,
  SOCIAL_MAP_SNAPSHOT_DATE,
  SOCIAL_MAP_SOURCE_NOTE,
  type SocialMapCategory,
} from "../lib/social-map-listings.js";
import { getSocialMapReviewReport } from "../lib/social-map-review.js";
import {
  ensureLocalizedEventCopy,
  eventCopyForLanguage,
  selectEventsWithLocalizedCopy,
  type EventLanguage,
} from "../lib/event-localization.js";

const router: IRouter = Router();
export type ListingSection = "events" | "businesses" | "food-drink" | "social-map";
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
  reviewStatus?: "verified" | "review_due" | "changed" | "unavailable";
  reviewReason?: string | null;
  lastCheckedAt?: string;
  nextReviewAt?: string;
  startsAt?: string | null;
  isCancelled?: boolean;
  openingTimes?: string | null;
  venue?: string | null;
  sourceGroup?: "city-agenda" | "culture" | "community" | "meals";
  organizer?: string | null;
  activityKind?: string | null;
  priceType?: "free" | "low-cost" | "paid" | "unknown";
  priceText?: string | null;
  mealType?: "community-meal" | "food-support" | null;
  audience?: string | null;
  recurrenceText?: string | null;
  isApproximateLocation?: boolean;
  isIndoor?: boolean | null;
  openNow?: boolean | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
};

export type ClaimableBusinessListing = Pick<
  Listing,
  | "id"
  | "locationId"
  | "name"
  | "address"
  | "neighborhood"
  | "lat"
  | "lng"
  | "sourceUrl"
  | "source"
>;

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

export type ListingsMode = "live" | "stored_only";

export function parseListingsMode(value: unknown): ListingsMode {
  return value === "stored_only" ? "stored_only" : "live";
}

export function allowsExternalQueries(mode: ListingsMode): boolean {
  return mode === "live";
}

export function parseAnonymousId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 100 ? normalized : undefined;
}

export async function prepareEventsForMode(
  events: DiscoveredEvent[],
  language: EventLanguage,
  mode: ListingsMode,
  ensureCopy: typeof ensureLocalizedEventCopy = ensureLocalizedEventCopy,
): Promise<DiscoveredEvent[]> {
  if (!allowsExternalQueries(mode)) {
    return selectEventsWithLocalizedCopy(events, language);
  }
  return ensureCopy(events, language);
}

export function normalizeNeighborhoods(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return [...new Map(
    raw.split(",")
      .map((neighborhood) => neighborhood.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 12)
      .map((neighborhood) => [neighborhood.toLocaleLowerCase("nl-NL"), neighborhood] as const),
  ).values()].sort((a, b) => a.localeCompare(b, "nl-NL"));
}

export function normalizedListingsKey(
  cityId: string,
  section: ListingSection,
  language: EventLanguage,
  neighborhoods: string[],
): string {
  return JSON.stringify({
    cityId: cityId.trim().toLowerCase(),
    section,
    language,
    neighborhoods: normalizeNeighborhoods(neighborhoods)
      .map((neighborhood) => neighborhood.toLocaleLowerCase("nl-NL"))
      .sort((a, b) => a.localeCompare(b, "nl-NL")),
  });
}

export function parseEventLanguage(value: unknown): EventLanguage | null {
  return value === "nl" || value === "en" ? value : null;
}

export function localizedEventDetails(
  event: typeof discoveredEventsTable.$inferSelect,
  language: EventLanguage,
): string {
  const locale = language === "nl" ? "nl-NL" : "en-GB";
  const parsedDate = event.startsAt ? new Date(event.startsAt) : null;
  const date = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: event.startsAt?.includes("T") ? "short" : undefined,
        timeZone: "Europe/Amsterdam",
      }).format(parsedDate)
    : (language === "nl" ? "Datum niet beschikbaar" : "Date not provided");
  const openingTimeRanges = event.openingTimes?.match(/\b\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\b/g);
  const openingTimes = event.openingTimes
    ? openingTimeRanges?.join(", ")
      ?? (language === "nl" ? "Zie evenementpagina" : "See event page")
    : "";
  const genericVenue = event.venue?.trim().toLowerCase();
  const venue = !event.venue || genericVenue === "walking" || genericVenue === "route" || genericVenue === "directions"
    ? (language === "nl" ? "Locatie niet beschikbaar" : "Venue not provided")
    : language === "en" && /\b(exacte locatie|locatie volgt)\b/i.test(event.venue)
      ? "The Hague, exact venue to be confirmed"
      : language === "nl" && /\b(exact location|venue to be confirmed)\b/i.test(event.venue)
        ? "Den Haag, exacte locatie volgt"
        : event.venue;
  return [
    date,
    openingTimes
      ? `${language === "nl" ? "Openingstijden" : "Opening times"}: ${openingTimes}`
      : "",
    venue,
    event.isApproximateLocation
      ? (language === "nl"
          ? "Kaartpunt: centrum van Den Haag (exacte coördinaten niet beschikbaar)"
          : "Map pin: The Hague city centre (exact coordinates unavailable)")
      : "",
  ].filter(Boolean).join(" · ");
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
  currentOpeningHours?: { openNow?: boolean };
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
const GOOGLE_PLACES_MAX_RESULTS = 200;
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

function googleSearchSpecs(
  section: Exclude<ListingSection, "events" | "social-map">,
  neighborhoods: string[] = [],
): GoogleSearchSpec[] {
  const terms = neighborhoods.length > 0
    ? neighborhoods.flatMap((neighborhood) =>
      GOOGLE_SEARCH_TERMS[section].map((term) => `${term} nabij ${neighborhood}`),
    )
    : GOOGLE_SEARCH_TERMS[section];
  return HAGUE_DISCOVERY_AREAS.flatMap((area) =>
    terms.map((term) => ({
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
  neighborhoods: string[] = [],
): Promise<Listing[]> {
  const cacheKey = `${section}:${neighborhoods.slice().sort().join("|")}`;
  const cached = googlePlacesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.listings;
  const inFlight = googlePlacesRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = collectGooglePlaces(bounds, section, neighborhoods);
  googlePlacesRequests.set(cacheKey, request);
  try {
    const listings = await request;
    googlePlacesCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_PLACES_CACHE_TTL_MS, listings });
    return listings;
  } finally {
    googlePlacesRequests.delete(cacheKey);
  }
}

export async function resolveClaimableBusinessListing(
  cityId: string,
  listingSource: string,
  listingId: string,
): Promise<ClaimableBusinessListing | null> {
  if (cityId !== "dhg") return null;
  const bounds = CITY_BOUNDS[cityId];
  if (!bounds) return null;

  if (listingSource === "google_maps") {
    const results = await Promise.allSettled([
      fetchGooglePlaces(bounds, "businesses"),
      fetchGooglePlaces(bounds, "food-drink"),
    ]);
    const listings = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (listings.length === 0) {
      throw new Error("Google Places did not return claimable business listings.");
    }
    return listings.find((listing) => listing.id === listingId) ?? null;
  }

  if (listingSource === "openstreetmap") {
    const elements = await fetchCityListings(bounds);
    const listings = [
      ...fetchOpenStreetMapBusinesses(elements, "businesses", bounds),
      ...fetchOpenStreetMapBusinesses(elements, "food-drink", bounds),
    ];
    return listings.find((listing) => listing.id === listingId) ?? null;
  }

  return null;
}

async function collectGooglePlaces(
  bounds: { s: number; w: number; n: number; e: number },
  section: Exclude<ListingSection, "events" | "social-map">,
  neighborhoods: string[] = [],
): Promise<Listing[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const seen = new Set<string>();
  const searches = googleSearchSpecs(section, neighborhoods);
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
        await reserveGooglePlacesRequest();
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
              "places.currentOpeningHours.openNow",
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
             openNow: place.currentOpeningHours?.openNow ?? null,
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

export interface OsmElement {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OsmResponse {
  elements: OsmElement[];
}

const GOOGLE_PLACES_LIFETIME_LIMIT = 100;
const OVERPASS_MIN_INTERVAL_MS = 2_000;
const PROVIDER_MAX_ATTEMPTS = 3;

export async function reserveGooglePlacesRequest(): Promise<void> {
  const reserved = await db.execute(sql`
    insert into ${providerUsageTable} (provider, request_count, updated_at)
    values ('google_places', 1, now())
    on conflict (provider) do update
      set request_count = ${providerUsageTable.requestCount} + 1,
          updated_at = now()
      where ${providerUsageTable.requestCount} < ${GOOGLE_PLACES_LIFETIME_LIMIT}
    returning request_count
  `);
  if (reserved.rows.length === 0) {
    throw new Error(`Google Places permanent request allowance of ${GOOGLE_PLACES_LIFETIME_LIMIT} is exhausted.`);
  }
}

export function retryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1_000, 30_000);
  }
  return Math.min(1_000 * (2 ** attempt), 30_000);
}

export async function withBoundedBackoff<T>(
  operation: () => Promise<T>,
  attempts = PROVIDER_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Provider operation failed.");
}

async function waitForOverpassSlot(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", ["buurtplaza:overpass"]);
    const usage = await client.query<{ updated_at: Date }>(
      "select updated_at from provider_usage where provider = $1",
      ["openstreetmap"],
    );
    const lastRequestAt = usage.rows[0]?.updated_at?.getTime() ?? 0;
    const waitMs = Math.max(0, lastRequestAt + OVERPASS_MIN_INTERVAL_MS - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    await client.query(`
      insert into provider_usage (provider, request_count, updated_at)
      values ($1, 0, now())
      on conflict (provider) do update set updated_at = now()
    `, ["openstreetmap"]);
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", ["buurtplaza:overpass"]);
    } finally {
      client.release();
    }
  }
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

interface OverpassRequestDependencies {
  fetch: typeof fetch;
  waitForSlot: () => Promise<void>;
  sleep: (milliseconds: number) => Promise<void>;
}

const defaultOverpassRequestDependencies: OverpassRequestDependencies = {
  fetch,
  waitForSlot: waitForOverpassSlot,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function fetchCityListingsFromOverpass(
  bounds: { s: number; w: number; n: number; e: number },
  dependencies: OverpassRequestDependencies = defaultOverpassRequestDependencies,
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

  let lastError: unknown;
  for (let attempt = 0; attempt < PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    await dependencies.waitForSlot();
    let res: Response;
    try {
      res = await dependencies.fetch(url, {
        headers: {
          "User-Agent":
            "buurtplaza.nl/1.0 (neighbourhood discovery app; contact: info@buurtplaza.nl)",
        },
        signal: AbortSignal.timeout(25000),
      });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < PROVIDER_MAX_ATTEMPTS) {
        await dependencies.sleep(retryDelayMs(attempt));
      }
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as OsmResponse;
      return data.elements ?? [];
    }
    lastError = new Error(`Overpass HTTP ${res.status}`);
    if (res.status !== 429 && res.status < 500) throw lastError;
    if (attempt + 1 < PROVIDER_MAX_ATTEMPTS) {
      await dependencies.sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass request failed.");
}

type ExternalProvider = "google_places" | "openstreetmap";
export const SCHEDULED_DISCOVERY_PROVIDERS = ["openstreetmap"] as const satisfies readonly ExternalProvider[];

async function createListingsQuery(input: {
  cityId: string;
  section: ListingSection;
  language: EventLanguage;
  neighborhoods: string[];
  mode: ListingsMode;
  anonymousId?: string;
  userId?: string | null;
  normalizedKey: string;
}): Promise<number> {
  const [query] = await db.insert(userQueriesTable).values({
    ...input,
    interests: [input.section],
    status: "running",
    startedAt: new Date(),
  }).returning({ id: userQueriesTable.id });
  if (!query) throw new Error("Could not persist listings query.");
  return query.id;
}

async function finalizeListingsQuery(queryId: number, status: "succeeded" | "partial" | "failed", error?: string): Promise<void> {
  await db.update(userQueriesTable).set({
    status,
    ...(error ? { error } : {}),
    completedAt: new Date(),
  }).where(eq(userQueriesTable.id, queryId));
}

export interface NeighborhoodRefreshScope {
  cityId: string;
  section: "businesses" | "food-drink";
  language: EventLanguage;
  neighborhoods: string[];
  normalizedKey: string;
}

export async function refreshNeighborhoodDiscoveryScope(scope: NeighborhoodRefreshScope): Promise<{
  status: "succeeded" | "partial" | "failed";
  providers: ExternalProvider[];
}> {
  const bounds = CITY_BOUNDS[scope.cityId];
  if (!bounds) throw new Error(`Unknown city: ${scope.cityId}`);
  const neighborhoods = normalizeNeighborhoods(scope.neighborhoods);
  const normalizedKey = normalizedListingsKey(scope.cityId, scope.section, scope.language, neighborhoods);
  if (normalizedKey !== scope.normalizedKey) throw new Error("Refresh scope normalized key does not match its fields.");

  const queryId = await createListingsQuery({
    cityId: scope.cityId,
    section: scope.section,
    language: scope.language,
    neighborhoods,
    mode: "live",
    normalizedKey,
  });
  // Scheduled refreshes deliberately use the non-billable source. Google Places
  // has a permanent 100-request allowance and remains available for intentional
  // live searches; background work must not silently consume that finite budget.
  const outcomes = await Promise.all(SCHEDULED_DISCOVERY_PROVIDERS.map((provider) =>
    captureProviderResult(queryId, provider, normalizedKey, {
      section: scope.section,
      scheduled: true,
    }, async () => fetchOpenStreetMapBusinesses(await fetchCityListings(bounds), scope.section, bounds), 1),
  ));
  const successful = outcomes.filter((outcome) => !outcome.error);
  const status = successful.length === 0 ? "failed" : "succeeded";
  await finalizeListingsQuery(queryId, status, status === "failed" ? "Scheduled OpenStreetMap refresh failed." : undefined);
  return { status, providers: successful.map((outcome) => outcome.provider) };
}

async function captureProviderResult(
  queryId: number,
  provider: ExternalProvider,
  normalizedKey: string,
  requestPayload: Record<string, unknown>,
  load: () => Promise<Listing[]>,
  attempts = PROVIDER_MAX_ATTEMPTS,
): Promise<{ provider: ExternalProvider; listings: Listing[]; error?: unknown }> {
  let externalQueryId: number | undefined;
  try {
    const [externalQuery] = await db.insert(externalQueriesTable).values({
      userQueryId: queryId,
      provider,
      normalizedKey,
      requestPayload,
      status: "running",
      startedAt: new Date(),
    }).returning({ id: externalQueriesTable.id });
    if (!externalQuery) throw new Error(`Could not persist ${provider} query.`);
    const persistedExternalQueryId = externalQuery.id;
    externalQueryId = persistedExternalQueryId;

    const listings = await withBoundedBackoff(load, attempts);
    await db.transaction(async (tx) => {
      await tx.insert(externalResultsTable).values({
        externalQueryId: persistedExternalQueryId,
        userQueryId: queryId,
        provider,
        normalizedKey,
        payload: listings,
        resultCount: listings.length,
      });
      await tx.update(externalQueriesTable).set({
        status: "succeeded",
        completedAt: new Date(),
      }).where(eq(externalQueriesTable.id, persistedExternalQueryId));
    });
    return { provider, listings };
  } catch (error) {
    if (externalQueryId !== undefined) {
      try {
        await db.update(externalQueriesTable).set({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        }).where(eq(externalQueriesTable.id, externalQueryId));
      } catch {
        // The original provider/persistence failure is the useful error returned
        // to the caller; the parent query will still be finalized there.
      }
    }
    return { provider, listings: [], error };
  }
}

export function mergeStoredProviderListings(
  googleListings: Listing[],
  osmListings: Listing[],
): Listing[] {
  return mergeBusinessListings(googleListings, osmListings).listings;
}

async function loadStoredProviderResults(
  normalizedKey: string,
  providers: ExternalProvider[],
): Promise<Map<ExternalProvider, Listing[]>> {
  const rows = await db.select({
    provider: externalResultsTable.provider,
    payload: externalResultsTable.payload,
  }).from(externalResultsTable)
    .where(and(
      eq(externalResultsTable.normalizedKey, normalizedKey),
    ))
    .orderBy(desc(externalResultsTable.fetchedAt), desc(externalResultsTable.id));
  const results = new Map<ExternalProvider, Listing[]>();
  for (const row of rows) {
    if (!providers.includes(row.provider as ExternalProvider) || results.has(row.provider as ExternalProvider)) continue;
    if (Array.isArray(row.payload)) results.set(row.provider as ExternalProvider, row.payload as Listing[]);
  }
  return results;
}

function storedMissMessage(language: EventLanguage): string {
  return language === "nl"
    ? "Geen opgeslagen resultaten beschikbaar voor deze zoekopdracht. Vernieuw in live-modus."
    : "No stored results are available for this query. Refresh in live mode.";
}

router.get("/listings", async (req, res): Promise<void> => {
  const cityId = String(req.query["cityId"] ?? "").trim();
  const listingSection = parseListingSection(req.query["section"]);
  const language = parseEventLanguage(req.query["language"]);
  const requestedNeighborhoods = normalizeNeighborhoods(req.query["neighborhoods"]);
  const mode = parseListingsMode(req.query["mode"]);
  const anonymousId = parseAnonymousId(req.query["anonymousId"]);

  if (!cityId || !language) {
    res.status(400).json({
      listings: [],
      source: "fallback",
      message: !cityId ? "cityId is required" : "language must be nl or en",
    });
    return;
  }

  const bounds = CITY_BOUNDS[cityId];
  if (!bounds) {
    res.status(400).json({ listings: [], source: "fallback", message: `Unknown city: ${cityId}` });
    return;
  }
  const normalizedKey = normalizedListingsKey(cityId, listingSection, language, requestedNeighborhoods);
  const queryId = await createListingsQuery({
    cityId,
    section: listingSection,
    language,
    neighborhoods: requestedNeighborhoods,
    mode,
    anonymousId,
    userId: getAuth(req).userId,
    normalizedKey,
  });

  if (listingSection === "social-map") {
    if (cityId !== "dhg") {
      await finalizeListingsQuery(queryId, "succeeded");
      res.json({
        listings: [],
        source: "curated",
        message: "De Sociale kaart is momenteel alleen beschikbaar voor Den Haag.",
        queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [],
      });
      return;
    }
    let reviewReport: Awaited<ReturnType<typeof getSocialMapReviewReport>>;
    try {
      reviewReport = await getSocialMapReviewReport();
    } catch (error) {
      await finalizeListingsQuery(queryId, "failed", "Could not load social map review data.");
      req.log.warn({ err: error }, "Social map review data unavailable");
      res.status(503).json({
        listings: [],
        source: "curated",
        message: language === "nl"
          ? "De Sociale kaart is tijdelijk niet beschikbaar."
          : "The social map is temporarily unavailable.",
        queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [],
      });
      return;
    }
    const reviewItems = new Map(reviewReport.items.map((item) => [item.id, item]));
    const listings: Listing[] = SOCIAL_MAP_LISTINGS.map((listing) => {
      const { x, y } = toXY(listing.lat, listing.lng, bounds);
      const review = reviewItems.get(listing.id);
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
        snapshotDate: reviewReport.snapshotDate,
        reviewStatus: review?.status ?? "review_due",
        reviewReason: review?.reason ?? "No source-review record is available",
        lastCheckedAt: review?.lastCheckedAt ?? SOCIAL_MAP_SNAPSHOT_DATE,
        nextReviewAt: review?.nextReviewAt ?? SOCIAL_MAP_SNAPSHOT_DATE,
      };
    });
    await finalizeListingsQuery(queryId, "succeeded");
    res.json({
      listings,
      source: "curated",
      message: `${SOCIAL_MAP_SOURCE_NOTE} Snapshot: ${reviewReport.snapshotDate}.`,
      queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [],
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
      await finalizeListingsQuery(queryId, "succeeded");
      res.json({ listings: curatedListings, source: "curated", queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [] });
      return;
    }

    if (listingSection !== "events") {
      const providers: ExternalProvider[] = ["google_places", "openstreetmap"];
      if (!allowsExternalQueries(mode)) {
        const stored = await loadStoredProviderResults(normalizedKey, providers);
        const googleListings = stored.get("google_places") ?? [];
        const osmListings = stored.get("openstreetmap") ?? [];
        const hit = stored.size > 0;
        await finalizeListingsQuery(queryId, hit && stored.size < providers.length ? "partial" : "succeeded");
        res.json({
          listings: mergeStoredProviderListings(googleListings, osmListings),
          source: "stored",
          ...(hit ? {} : { message: storedMissMessage(language) }),
          queryId, mode, cacheHit: hit, cacheMiss: !hit, partial: hit && stored.size < providers.length,
          providers: [...stored.keys()],
        });
        return;
      }
      const [google, osm] = await Promise.all([
        captureProviderResult(queryId, "google_places", normalizedKey, { section: listingSection, neighborhoods: requestedNeighborhoods }, () =>
          fetchGooglePlaces(bounds, listingSection, requestedNeighborhoods)),
        captureProviderResult(queryId, "openstreetmap", normalizedKey, { section: listingSection }, async () =>
          fetchOpenStreetMapBusinesses(await fetchCityListings(bounds), listingSection, bounds), 1),
      ]);
      const successful = [google, osm].filter((result) => !result.error);
      const merged = mergeBusinessListings(google.listings, osm.listings);
      const partial = successful.length > 0 && successful.length < providers.length;
      const status = successful.length === 0 ? "failed" : partial ? "partial" : "succeeded";
      await finalizeListingsQuery(queryId, status, successful.length === 0 ? "All external providers failed." : undefined);
      if (google.error) req.log.warn({ err: google.error }, "Google Places listings unavailable");
      if (osm.error) req.log.warn({ err: osm.error }, "OpenStreetMap listings unavailable");
      res.json({
        listings: merged.listings,
        source: google.listings.length > 0 ? "google_places" : "fallback",
        message: google.listings.length > 0
          ? `${google.listings.length} Haagse ${listingSection === "food-drink" ? "horecazaken" : "bedrijven"} uit Google Places${merged.osmAdded > 0 ? ` en ${merged.osmAdded} aanvullende OpenStreetMap-vermeldingen` : ""}.`
          : osm.listings.length > 0
            ? "Google Places is tijdelijk niet beschikbaar; OpenStreetMap-resultaten worden getoond."
            : "Er zijn tijdelijk geen gecontroleerde resultaten voor deze sectie.",
        queryId, mode, cacheHit: false, cacheMiss: false, partial,
        providers: successful.map((result) => result.provider),
      });
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
      const localizedEvents = await prepareEventsForMode(discovered, language, mode);
      const discoveredListings = localizedEvents
        .map((event) => {
        const copy = eventCopyForLanguage(event, language);
        return {
        id: `source-${event.id}`,
        locationId: event.locationId,
        category: event.category,
        name: copy.title,
        description: copy.description,
        startsAt: event.startsAt,
        isCancelled: event.isCancelled,
        x: event.x,
        y: event.y,
        details: localizedEventDetails(event, language),
        lat: event.lat,
        lng: event.lng,
        sourceUrl: event.canonicalUrl,
         source: "source_scan" as const,
         sourceName: event.sourceName,
          isApproximateLocation: event.isApproximateLocation,
          sourceGroup: event.sourceGroup === "agenda" ? "city-agenda" : event.sourceGroup,
          organizer: event.organizer,
          activityKind: event.activityKind,
          priceType: event.priceType,
          priceText: event.priceText,
          mealType: event.mealType,
          audience: event.audience,
          neighborhood: event.neighborhood,
          recurrenceText: event.recurrenceText,
          openingTimes: event.openingTimes,
          venue: event.venue,
          isIndoor: event.isIndoor,
          firstSeenAt: event.firstSeenAt?.toISOString(),
          lastSeenAt: event.lastSeenAt?.toISOString(),
          updatedAt: event.updatedAt?.toISOString(),
      }});
      await finalizeListingsQuery(queryId, "succeeded");
      const storedHit = discoveredListings.length > 0;
      res.json({
        listings: discoveredListings,
        source: mode === "stored_only"
          ? "stored"
          : discoveredListings.length > 0 ? "live" : "fallback",
        message: mode === "stored_only" && !storedHit
          ? storedMissMessage(language)
          : discoveredListings.length > 0
            ? language === "nl"
              ? `${discoveredListings.length} gecontroleerde aankomende evenement${discoveredListings.length === 1 ? "" : "en"} gevonden in Den Haag.`
              : `${discoveredListings.length} verified upcoming event${discoveredListings.length === 1 ? "" : "s"} found in The Hague.`
            : language === "nl"
              ? "Er zijn momenteel geen gecontroleerde aankomende evenementen beschikbaar."
              : "No verified upcoming events are currently available.",
        queryId,
        mode,
        cacheHit: mode === "stored_only" && storedHit,
        cacheMiss: mode === "stored_only" && !storedHit,
        partial: false,
        providers: [],
      });
    } catch (error) {
      await finalizeListingsQuery(queryId, "failed", "Could not load discovered events.");
      req.log.warn({ err: error }, "Discovered events unavailable");
      res.json({
        listings: [],
        source: "fallback",
        message: language === "nl"
          ? "Actuele evenementen zijn tijdelijk niet beschikbaar."
          : "Current events are temporarily unavailable.",
        queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [],
      });
    }
    return;
  }

  if (!allowsExternalQueries(mode)) {
    const stored = await loadStoredProviderResults(normalizedKey, ["openstreetmap"]);
    const listings = stored.get("openstreetmap") ?? [];
    const hit = stored.has("openstreetmap");
    await finalizeListingsQuery(queryId, "succeeded");
    res.json({
      listings,
      source: "stored",
      ...(hit ? {} : { message: storedMissMessage(language) }),
      queryId, mode, cacheHit: hit, cacheMiss: !hit, partial: false,
      providers: hit ? ["openstreetmap"] : [],
    });
    return;
  }

  let overpassQueryId: number | undefined;
  try {
    const [overpassQuery] = await db.insert(externalQueriesTable).values({
      userQueryId: queryId,
      provider: "openstreetmap",
      normalizedKey,
      requestPayload: { section: listingSection, cityId },
      status: "running",
      startedAt: new Date(),
    }).returning({ id: externalQueriesTable.id });
    if (!overpassQuery) throw new Error("Could not persist OpenStreetMap query.");
    const persistedOverpassQueryId = overpassQuery.id;
    overpassQueryId = persistedOverpassQueryId;

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
      await db.transaction(async (tx) => {
        await tx.insert(externalResultsTable).values({
          externalQueryId: persistedOverpassQueryId,
          userQueryId: queryId,
          provider: "openstreetmap",
          normalizedKey,
          payload: listings,
          resultCount: 0,
        });
        await tx.update(externalQueriesTable).set({ status: "succeeded", completedAt: new Date() })
          .where(eq(externalQueriesTable.id, persistedOverpassQueryId));
      });
      await finalizeListingsQuery(queryId, "succeeded");
      res.json({
        listings: fallback,
        source: "fallback",
        message: "No live results – showing curated listings",
        queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: ["openstreetmap"],
      });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(externalResultsTable).values({
        externalQueryId: persistedOverpassQueryId,
        userQueryId: queryId,
        provider: "openstreetmap",
        normalizedKey,
        payload: listings,
        resultCount: listings.length,
      });
      await tx.update(externalQueriesTable).set({ status: "succeeded", completedAt: new Date() })
        .where(eq(externalQueriesTable.id, persistedOverpassQueryId));
    });
    await finalizeListingsQuery(queryId, "succeeded");
    res.json({ listings, source: "live", queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: ["openstreetmap"] });
  } catch (error) {
    if (overpassQueryId !== undefined) {
      try {
        await db.update(externalQueriesTable).set({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        }).where(eq(externalQueriesTable.id, overpassQueryId));
      } catch {
        // Finalizing the parent query below prevents a permanently running row.
      }
    }
    await finalizeListingsQuery(queryId, "failed", "OpenStreetMap provider failed.");
    req.log.warn({ err: error }, "OpenStreetMap listings unavailable");
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
      queryId, mode, cacheHit: false, cacheMiss: false, partial: false, providers: [],
    });
  }
});

export default router;
