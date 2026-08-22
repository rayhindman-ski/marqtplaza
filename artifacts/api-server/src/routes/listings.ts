import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import { discoveredEventsTable } from "@workspace/db/schema";
import { MARKERS } from "../lib/static-listings.js";

const router: IRouter = Router();

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
