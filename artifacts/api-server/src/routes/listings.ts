import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { discoveredEventsTable } from "@workspace/db/schema";
import { MARKERS } from "../lib/static-listings.js";

const router: IRouter = Router();
type ListingSection = "events" | "businesses" | "food-drink";
type ListingCategory = "Museums" | "Tours" | "Family" | "Entertainment" | "Outdoors" | "Markets" | "Businesses" | "Food & Drink";
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
  description: string;
  x: number;
  y: number;
  details: string;
  lat: number;
  lng: number;
  sourceUrl?: string;
  businessCategory?: BusinessCategory;
  source?: ListingSource;
};

// Bounding boxes for each supported city (south, west, north, east)
const CITY_BOUNDS: Record<string, { s: number; w: number; n: number; e: number }> = {
  ams: { s: 52.34, w: 4.85, n: 52.40, e: 5.00 },
  rot: { s: 51.88, w: 4.43, n: 51.96, e: 4.55 },
  utr: { s: 52.07, w: 5.09, n: 52.12, e: 5.17 },
  dhg: { s: 52.05, w: 4.26, n: 52.11, e: 4.36 },
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

function normalizedTitle(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function parseListingSection(value: unknown): ListingSection {
  const section = String(value ?? "events").trim();
  if (section === "businesses" || section === "food-drink") return section;
  return "events";
}

function isInHagueBounds(lat: number, lng: number): boolean {
  const bounds = CITY_BOUNDS.dhg;
  return lat >= bounds.s - 0.025 && lat <= bounds.n + 0.025
    && lng >= bounds.w - 0.025 && lng <= bounds.e + 0.025;
}

function hasHagueEvidence(address: string): boolean {
  const value = address.toLowerCase();
  if (/\b(delft|oegstgeest|wassenaar|rijswijk|zoetermeer|leidschendam)\b/.test(value)) return false;
  return /\bden haag\b|\bthe hague\b|\bscheveningen\b|\b25\d{2}\s?[a-z]{2}\b/i.test(address);
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

type GooglePlacesResponse = { places?: GooglePlace[] };

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

function businessCategoryForGooglePlace(
  place: GooglePlace,
  section: Exclude<ListingSection, "events">,
): BusinessCategory {
  const primaryType = place.primaryType?.toLowerCase();
  if (primaryType) {
    const mappedCategory = GOOGLE_TYPE_TO_BUSINESS_CATEGORY[primaryType];
    if (mappedCategory) return mappedCategory;
  }
  return section === "food-drink" ? "Food & Drink" : "Professional Services";
}

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_TIMEOUT_MS = 12_000;
const GOOGLE_PLACES_MAX_RESULTS = 60;
const GOOGLE_PLACES_CACHE_TTL_MS = 15 * 60 * 1000;
const googlePlacesCache = new Map<string, { expiresAt: number; listings: Listing[] }>();

const GOOGLE_SEARCHES: Record<Exclude<ListingSection, "events">, string[]> = {
  businesses: [
    "local businesses in The Hague Netherlands",
    "shops in The Hague Netherlands",
    "local services in The Hague Netherlands",
  ],
  "food-drink": [
    "cafes in The Hague Netherlands",
    "restaurants in The Hague Netherlands",
    "bars in The Hague Netherlands",
  ],
};

function googlePlaceDescription(place: GooglePlace, section: Exclude<ListingSection, "events">): string {
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

async function fetchGooglePlaces(
  bounds: { s: number; w: number; n: number; e: number },
  section: Exclude<ListingSection, "events">,
): Promise<Listing[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return [];

  const cacheKey = section;
  const cached = googlePlacesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.listings;

  const results: Listing[] = [];
  const seen = new Set<string>();
  const searches = GOOGLE_SEARCHES[section];
  for (const textQuery of searches) {
    const response = await fetch(GOOGLE_PLACES_URL, {
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
        ].join(","),
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "nl",
        regionCode: "NL",
        pageSize: 20,
        locationBias: {
          rectangle: {
            low: { latitude: bounds.s - 0.01, longitude: bounds.w - 0.01 },
            high: { latitude: bounds.n + 0.01, longitude: bounds.e + 0.01 },
          },
        },
      }),
      signal: AbortSignal.timeout(GOOGLE_PLACES_TIMEOUT_MS),
    });
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

      const key = place.id ?? `${normalizedTitle(name)}|${normalizedTitle(address)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { x, y } = toXY(lat, lng, bounds);
      results.push({
        id: `google-${place.id ?? normalizedTitle(name).replace(/\s+/g, "-")}`,
        locationId: "dhg",
        category: section === "food-drink" ? "Food & Drink" : "Businesses",
        businessCategory: businessCategoryForGooglePlace(place, section),
        name,
        description: googlePlaceDescription(place, section),
        x,
        y,
        details: googlePlaceDetails(place),
        lat,
        lng,
        sourceUrl: googlePlaceUrl(place),
        source: "google_maps",
      });
      if (results.length >= GOOGLE_PLACES_MAX_RESULTS) break;
    }
    if (results.length >= GOOGLE_PLACES_MAX_RESULTS) break;
  }

  googlePlacesCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_PLACES_CACHE_TTL_MS, listings: results });
  return results;
}

function businessCategoryForOsmTags(
  tags: Record<string, string>,
  section: Exclude<ListingSection, "events">,
): BusinessCategory {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const office = tags.office;
  const craft = tags.craft;
  const leisure = tags.leisure;
  const tourism = tags.tourism;

  if (section === "food-drink"
    || ["cafe", "restaurant", "bar", "pub", "bakery", "fast_food", "ice_cream", "food_court"].includes(amenity ?? "")) {
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

function fetchOpenStreetMapBusinesses(elements: OsmElement[], section: Exclude<ListingSection, "events">, bounds: { s: number; w: number; n: number; e: number }): Listing[] {
  const seen = new Set<string>();
  return elements
    .filter((element) => {
      const tags = element.tags ?? {};
      const isFood = ["cafe", "restaurant", "bar", "pub", "bakery", "fast_food", "ice_cream", "food_court"].includes(tags.amenity);
      return tags.name && (section === "food-drink" ? isFood : !isFood && Boolean(tags.shop || tags.amenity));
    })
    .filter((element) => {
      const key = normalizedTitle(element.tags.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, GOOGLE_PLACES_MAX_RESULTS)
    .map((element) => {
      const tags = element.tags;
      const { x, y } = toXY(element.lat, element.lon, bounds);
      return {
        id: `osm-${element.id}`,
        locationId: "dhg",
        category: section === "food-drink" ? "Food & Drink" : "Businesses",
        businessCategory: businessCategoryForOsmTags(tags, section),
        name: tags.name,
        description: descriptionFromTags(tags),
        x,
        y,
        details: detailsFromTags(tags, "Markets"),
        lat: element.lat,
        lng: element.lon,
        source: "openstreetmap",
      };
    });
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
  // Single query combining businesses, events, and specials to avoid rate limits
  const bbox = `${bounds.s},${bounds.w},${bounds.n},${bounds.e}`;
  const query = `[out:json][timeout:20];
(
  node[amenity][name](${bbox});
  node[shop][name](${bbox});
  node[leisure][name](${bbox});
  node[tourism][name](${bbox});
);
out 120;`;

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

  // All cities have hand-curated datasets. For Den Haag, source-scanned events are
  // persisted separately and merged in so a completed scan changes the public list.
  const curated = MARKERS.filter((m) => m.locationId === cityId);
  if (curated.length > 0) {
    if (cityId !== "dhg") {
      res.json({ listings: curated, source: "curated" });
      return;
    }

    if (listingSection !== "events") {
      try {
        const googleListings = await fetchGooglePlaces(bounds, listingSection);
        if (googleListings.length > 0) {
          res.json({
            listings: googleListings,
            source: "google_places",
            message: `${googleListings.length} Haagse ${listingSection === "food-drink" ? "horecazaken" : "bedrijven"} uit Google Places.`,
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
          `Source: ${event.sourceName}`,
        ].filter(Boolean).join(" · "),
        lat: event.lat,
        lng: event.lng,
        sourceUrl: event.canonicalUrl,
        isApproximateLocation: event.isApproximateLocation,
      }));
      res.json({
        listings: [...curated, ...discoveredListings],
        source: "curated",
        message: discoveredListings.length > 0
          ? `${discoveredListings.length} source-scanned event${discoveredListings.length === 1 ? "" : "s"} added to the curated Den Haag activities.`
          : undefined,
      });
    } catch {
      res.json({
        listings: curated,
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
          // sourceUrl not available for live OSM entries
        });
        return acc;
      }, []);

    // If Overpass returned nothing meaningful, fall back to static data
    if (listings.length === 0) {
      const fallback = MARKERS.filter((m) => m.locationId === cityId);
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
    const fallback = MARKERS.filter((m) => m.locationId === cityId);
    res.json({
      listings: fallback,
      source: "fallback",
      message: "Live data temporarily unavailable – showing curated listings",
    });
  }
});

export default router;
