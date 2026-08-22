import { Router } from "express";
import { inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { discoveredEventsTable } from "@workspace/db/schema";

const router = Router();

type SourceDefinition = {
  id: string;
  name: string;
  activityUrl: string;
};

type EventCategory = "Museums" | "Tours" | "Family" | "Entertainment" | "Outdoors" | "Markets";

type SourceScanEvent = {
  title: string;
  url: string;
  context?: string;
  description?: string;
  startsAt?: string;
  venue?: string;
  category?: EventCategory;
  lat?: number;
  lng?: number;
};

type CrawlPage = {
  url: string;
  depth: number;
  fallbackTitle?: string;
};

type ScanMetrics = {
  eventLinksRead: number;
  eventsCaptured: number;
  pagesRead: number;
  pagesFailed: number;
  eventsAdded: number;
  eventsUpdated: number;
  eventsSkipped: number;
};

const DEN_HAAG_SOURCES: SourceDefinition[] = [
  { id: "getyourguide", name: "GetYourGuide", activityUrl: "https://www.getyourguide.com/en-gb/the-hague-l1267/" },
  { id: "denhaag-com", name: "DenHaag.com", activityUrl: "https://denhaag.com/en/calendar" },
  { id: "wearetravelers", name: "We Are Travelers", activityUrl: "https://www.wearetravelers.nl" },
  { id: "flitz-events", name: "Flitz-Events", activityUrl: "https://flitz-events.nl/teamuitje/den-haag" },
  { id: "tripadvisor", name: "Tripadvisor", activityUrl: "https://www.tripadvisor.nl/Attractions-g188633-Activities-The_Hague_South_Holland_Province.html" },
  { id: "kidsproof", name: "Kidsproof Den Haag", activityUrl: "https://www.kidsproof.nl/denhaag/uitjes/uitagenda/" },
  { id: "reisroutes", name: "Reisroutes", activityUrl: "https://www.reisroutes.nl/stadswandelingen/den-haag/" },
  { id: "follow-my-footprints", name: "Follow my footprints", activityUrl: "https://www.followmyfootprints.nl/category/nederland/den-haag/" },
  { id: "dagjeweg", name: "DagjeWeg.NL", activityUrl: "https://www.dagjeweg.nl/dagjeuit/den-haag/stedentrips" },
  { id: "eventbrite", name: "Eventbrite", activityUrl: "https://www.eventbrite.nl/d/netherlands--the-hague/events/" },
  { id: "fijnuit", name: "FijnUit", activityUrl: "https://www.fijnuit.nl/den-haag" },
  { id: "wattedoenin", name: "Wat te doen in", activityUrl: "https://www.wattedoenin.nl/wat-te-doen-in/den-haag/" },
  { id: "travel-around-with-me", name: "Travel Around With Me", activityUrl: "https://www.travelaroundwithme.com/gratis-doen-den-haag/" },
  { id: "yellowbrick", name: "Yellowbrick", activityUrl: "https://yellowbrick.nl/blog/wat-te-doen-in-den-haag-tips-and-uitagenda/" },
  { id: "wannado", name: "Wannado", activityUrl: "https://wannado.nl/wat-te-doen/den-haag/categorie/activiteiten-uitjes" },
  { id: "see-the-hague", name: "seeTheHague", activityUrl: "https://seethehague.nl/activiteiten-in-den-haag/" },
  { id: "stappen-in-den-haag", name: "Stappen in Den Haag", activityUrl: "https://stappenindenhaag.nl/de-uitagenda-van-den-haag/" },
  { id: "weekends-in", name: "Weekends in", activityUrl: "https://week-endsin.com/the-hague/activities/" },
  { id: "mooiste-stedentrips", name: "Mooiste Stedentrips", activityUrl: "https://mooistestedentrips.nl/mini-break-in-nederland-den-haag/" },
  { id: "1001activiteiten", name: "1001activiteiten", activityUrl: "https://www.1001activiteiten.nl/provincie-zuid-holland/den-haag" },
  { id: "uitjes-nl", name: "Uitjes.nl", activityUrl: "https://uitjes.nl/den-haag-uitjes/" },
  { id: "enter-the-hague", name: "Enter The Hague", activityUrl: "https://www.enterthehague.com/the-hague-free-walking-tour" },
  { id: "cultuurschakel", name: "CultuurSchakel", activityUrl: "https://www.cultuurschakel.nl/vrije-tijd/cultuur-proeven/" },
  { id: "lekkerweg", name: "Lekkerweg Tips", activityUrl: "https://www.lekkerwegtips.nl/wat-te-doen-in-den-haag/" },
];

const SOURCE_BY_ID = new Map(DEN_HAAG_SOURCES.map((source) => [source.id, source]));
const EVENT_TERMS = [
  "agenda", "calendar", "event", "events", "activit", "uitje", "uitagenda",
  "festival", "concert", "workshop", "markt", "market", "theater", "theatre",
  "tentoonstelling", "expositie", "exhibition", "expo", "tour", "show",
  "optreden", "performance", "what's on", "things to do",
];
const NAVIGATION_LINK_TITLES = new Set([
  "nederlands", "english", "frans", "deutsch", "skip filters", "skip to content",
  "excursions & activities", "activities", "agenda", "calendar", "events",
]);
const MAX_PAGES_PER_SOURCE = 9;
const MAX_DETAIL_PAGES = 8;
const MAX_EVENTS_PER_SOURCE = 40;
const MAX_RESPONSE_CHARS = 700_000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 3;
const MAX_ACTIVE_SCAN_REQUESTS = 2;
const DEN_HAAG_CENTER = { lat: 52.0705, lng: 4.3007 };
const DEN_HAAG_BOUNDS = { south: 52.05, west: 4.26, north: 52.11, east: 4.36 };
let activeScanRequests = 0;

function emptyMetrics(): ScanMetrics {
  return {
    eventLinksRead: 0,
    eventsCaptured: 0,
    pagesRead: 0,
    pagesFailed: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripMarkup(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function shorten(value: string | undefined, maxLength = 440): string | undefined {
  if (!value) return undefined;
  const clean = stripMarkup(value).replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

function canonicalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "ref"].includes(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return null;
  }
}

function isApprovedSourceUrl(url: string, source: SourceDefinition): boolean {
  try {
    const candidateHost = new URL(url).hostname.replace(/^www\./, "");
    const sourceHost = new URL(source.activityUrl).hostname.replace(/^www\./, "");
    return candidateHost === sourceHost;
  } catch {
    return false;
  }
}

function classifyEvent(value: string): EventCategory {
  const text = value.toLowerCase();
  if (/(kind|kids|family|gezin|children|child|baby|speel)/.test(text)) return "Family";
  if (/(museum|exhib|tentoon|expo|gallery|kunst|art)/.test(text)) return "Museums";
  if (/(tour|walk|wandeling|rondvaart|cruise|guided)/.test(text)) return "Tours";
  if (/(market|markt|food|eten|culin|proeverij)/.test(text)) return "Markets";
  if (/(beach|strand|park|outdoor|buiten|nature|natuur)/.test(text)) return "Outdoors";
  return "Entertainment";
}

function parseCoordinates(value: unknown): { lat?: number; lng?: number } {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const lat = Number(record.latitude ?? record.lat);
  const lng = Number(record.longitude ?? record.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {};
}

function venueFromLocation(value: unknown): string | undefined {
  if (typeof value === "string") return shorten(value, 160);
  if (!value || typeof value !== "object") return undefined;
  const location = value as Record<string, unknown>;
  const name = typeof location.name === "string" ? location.name : "";
  const address = location.address;
  const addressText = typeof address === "string"
    ? address
    : address && typeof address === "object"
      ? [
          (address as Record<string, unknown>).streetAddress,
          (address as Record<string, unknown>).addressLocality,
        ].filter((part): part is string => typeof part === "string").join(", ")
      : "";
  return shorten([name, addressText].filter(Boolean).join(" · "), 180);
}

function eventFromStructuredNode(
  value: unknown,
  pageUrl: string,
  source: SourceDefinition,
): SourceScanEvent | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const rawTypes = node["@type"];
  const types = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
  if (!types.some((type) => String(type).toLowerCase() === "event")) return null;

  const title = shorten(typeof node.name === "string" ? node.name : "", 180);
  const urlValue = typeof node.url === "string" ? node.url : pageUrl;
  const url = canonicalizeUrl(urlValue, pageUrl);
  if (!title || !url || !isApprovedSourceUrl(url, source)) return null;

  const location = node.location;
  const locationRecord = location && typeof location === "object" ? location as Record<string, unknown> : null;
  const coordinates = parseCoordinates(locationRecord?.geo ?? node.geo);
  const description = shorten(typeof node.description === "string" ? node.description : undefined);
  const startsAt = typeof node.startDate === "string" ? node.startDate : undefined;

  return {
    title,
    url,
    description,
    startsAt,
    venue: venueFromLocation(location),
    category: classifyEvent(`${title} ${description ?? ""}`),
    ...coordinates,
  };
}

function structuredEventsFromPage(html: string, pageUrl: string, source: SourceDefinition): SourceScanEvent[] {
  const events: SourceScanEvent[] = [];
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const event = eventFromStructuredNode(record, pageUrl, source);
    if (event) events.push(event);
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(visit);
    if (Array.isArray(record.itemListElement)) record.itemListElement.forEach(visit);
    if (record.item && typeof record.item === "object") visit(record.item);
  }

  for (const script of scripts) {
    try {
      visit(JSON.parse(script[1]));
    } catch {
      // Invalid JSON-LD is common; HTML fallbacks below still run.
    }
  }
  return events;
}

function pageDescription(html: string): string | undefined {
  const match = html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i);
  return shorten(match?.[1]);
}

function pageTitle(html: string): string | undefined {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return shorten(h1?.[1], 180);
}

function linkCandidatesFromPage(html: string, pageUrl: string, source: SourceDefinition): SourceScanEvent[] {
  const candidates: SourceScanEvent[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const title = shorten(match[2], 180);
    const url = canonicalizeUrl(match[1], pageUrl);
    if (!title || !url || !isApprovedSourceUrl(url, source)) continue;
    const searchable = `${title} ${url}`.toLowerCase();
    if (
      title.length < 4 ||
      NAVIGATION_LINK_TITLES.has(title.toLowerCase()) ||
      !EVENT_TERMS.some((term) => searchable.includes(term)) ||
      seen.has(url)
    ) {
      continue;
    }
    seen.add(url);
    candidates.push({ title, url, category: classifyEvent(title) });
    if (candidates.length >= MAX_EVENTS_PER_SOURCE * 2) break;
  }
  return candidates;
}

async function fetchApprovedPage(url: string, source: SourceDefinition): Promise<{ html: string; url: string } | { error: string; blocked: boolean }> {
  const initialUrl = canonicalizeUrl(url, source.activityUrl);
  if (!initialUrl || !isApprovedSourceUrl(initialUrl, source)) {
    return { error: "The requested page is outside this source's approved domain.", blocked: true };
  }
  let requestUrl: string = initialUrl;

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetch(requestUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "marqtplaza.com/1.0 (approved Den Haag event source scanner)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const nextUrl: string | null = location ? canonicalizeUrl(location, requestUrl) : null;
        if (!nextUrl || !isApprovedSourceUrl(nextUrl, source)) {
          return { error: "The source redirected outside its approved domain.", blocked: true };
        }
        requestUrl = nextUrl;
        continue;
      }

      const blocked = response.status === 401 || response.status === 403 || response.status === 429;
      if (!response.ok) return { error: `HTTP ${response.status}`, blocked };
      const length = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(length) && length > MAX_RESPONSE_CHARS) {
        return { error: "The source page was too large to scan safely.", blocked: false };
      }
      const reader = response.body?.getReader();
      if (!reader) return { error: "The source response had no readable body.", blocked: false };
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let html = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > MAX_RESPONSE_CHARS) {
          await reader.cancel();
          return { error: "The source page was too large to scan safely.", blocked: false };
        }
        html += decoder.decode(value, { stream: true });
      }
      return { html: `${html}${decoder.decode()}`, url: requestUrl };
    }
    return { error: "The source exceeded the safe redirect limit.", blocked: true };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Timed out"
      : "Could not reach source";
    return { error: message, blocked: false };
  }
}

function mapCoordinates(event: SourceScanEvent): {
  lat: number;
  lng: number;
  x: number;
  y: number;
  isApproximateLocation: boolean;
} {
  if (
    Number.isFinite(event.lat) &&
    Number.isFinite(event.lng) &&
    event.lat! >= DEN_HAAG_BOUNDS.south &&
    event.lat! <= DEN_HAAG_BOUNDS.north &&
    event.lng! >= DEN_HAAG_BOUNDS.west &&
    event.lng! <= DEN_HAAG_BOUNDS.east
  ) {
    const x = ((event.lng! - DEN_HAAG_BOUNDS.west) / (DEN_HAAG_BOUNDS.east - DEN_HAAG_BOUNDS.west)) * 100;
    const y = ((DEN_HAAG_BOUNDS.north - event.lat!) / (DEN_HAAG_BOUNDS.north - DEN_HAAG_BOUNDS.south)) * 100;
    return {
      lat: event.lat!,
      lng: event.lng!,
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
      isApproximateLocation: false,
    };
  }

  const x = ((DEN_HAAG_CENTER.lng - DEN_HAAG_BOUNDS.west) / (DEN_HAAG_BOUNDS.east - DEN_HAAG_BOUNDS.west)) * 100;
  const y = ((DEN_HAAG_BOUNDS.north - DEN_HAAG_CENTER.lat) / (DEN_HAAG_BOUNDS.north - DEN_HAAG_BOUNDS.south)) * 100;
  return {
    lat: DEN_HAAG_CENTER.lat,
    lng: DEN_HAAG_CENTER.lng,
    x,
    y,
    isApproximateLocation: true,
  };
}

function isPublishableEvent(event: SourceScanEvent): boolean {
  const startsAt = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
  if (!Number.isFinite(startsAt)) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const latestAcceptedDate = new Date(now);
  latestAcceptedDate.setMonth(latestAcceptedDate.getMonth() + 18);
  if (startsAt < today || startsAt > latestAcceptedDate.getTime()) return false;

  if (
    Number.isFinite(event.lat) &&
    Number.isFinite(event.lng) &&
    event.lat! >= DEN_HAAG_BOUNDS.south &&
    event.lat! <= DEN_HAAG_BOUNDS.north &&
    event.lng! >= DEN_HAAG_BOUNDS.west &&
    event.lng! <= DEN_HAAG_BOUNDS.east
  ) {
    return true;
  }
  return /\b(den haag|the hague|scheveningen|kijkduin|loosduinen)\b/i.test(
    `${event.venue ?? ""} ${event.description ?? ""}`,
  );
}

async function persistEvents(source: SourceDefinition, events: SourceScanEvent[]): Promise<Pick<ScanMetrics, "eventsAdded" | "eventsUpdated">> {
  if (events.length === 0) return { eventsAdded: 0, eventsUpdated: 0 };
  const urls = events.map((event) => event.url);
  const existing = await db
    .select({ canonicalUrl: discoveredEventsTable.canonicalUrl })
    .from(discoveredEventsTable)
    .where(inArray(discoveredEventsTable.canonicalUrl, urls));
  const existingUrls = new Set(existing.map((row) => row.canonicalUrl));
  const now = new Date();

  for (const event of events) {
    const coordinates = mapCoordinates(event);
    const details = [
      event.startsAt ? event.startsAt.replace("T", " ").slice(0, 16) : "Date not provided",
      event.venue ?? "Venue not provided",
    ].join(" · ");
    await db.insert(discoveredEventsTable).values({
      locationId: "dhg",
      sourceId: source.id,
      sourceName: source.name,
      canonicalUrl: event.url,
      title: event.title,
      description: event.description ?? `${source.name} activity listing.`,
      startsAt: event.startsAt ?? null,
      venue: event.venue ?? null,
      category: event.category ?? "Entertainment",
      ...coordinates,
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: discoveredEventsTable.canonicalUrl,
      set: {
        sourceId: source.id,
        sourceName: source.name,
        title: event.title,
        description: event.description ?? `${source.name} activity listing.`,
        startsAt: event.startsAt ?? null,
        venue: event.venue ?? null,
        category: event.category ?? "Entertainment",
        ...coordinates,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
  }

  return {
    eventsAdded: events.filter((event) => !existingUrls.has(event.url)).length,
    eventsUpdated: events.filter((event) => existingUrls.has(event.url)).length,
  };
}

async function scanSource(source: SourceDefinition) {
  const metrics = emptyMetrics();
  const queue: CrawlPage[] = [{ url: source.activityUrl, depth: 0 }];
  const visited = new Set<string>();
  const captured = new Map<string, SourceScanEvent>();
  let sourceDenied = false;

  while (queue.length > 0 && visited.size < MAX_PAGES_PER_SOURCE && captured.size < MAX_EVENTS_PER_SOURCE) {
    const next = queue.shift()!;
    const canonicalUrl = canonicalizeUrl(next.url, source.activityUrl);
    if (!canonicalUrl || visited.has(canonicalUrl) || !isApprovedSourceUrl(canonicalUrl, source)) continue;
    visited.add(canonicalUrl);

    const page = await fetchApprovedPage(canonicalUrl, source);
    if ("error" in page) {
      metrics.pagesFailed += 1;
      sourceDenied ||= page.blocked;
      continue;
    }
    metrics.pagesRead += 1;

    const structured = structuredEventsFromPage(page.html, page.url, source);
    const linked = linkCandidatesFromPage(page.html, page.url, source);
    metrics.eventLinksRead += structured.length + linked.length;

    for (const event of structured) {
      if (!captured.has(event.url)) captured.set(event.url, event);
    }

    if (next.depth > 0 && next.fallbackTitle) {
      const url = canonicalizeUrl(page.url, source.activityUrl);
      if (url && !captured.has(url)) {
        captured.set(url, {
          title: pageTitle(page.html) ?? next.fallbackTitle,
          url,
          description: pageDescription(page.html),
          category: classifyEvent(`${next.fallbackTitle} ${pageDescription(page.html) ?? ""}`),
        });
      }
    }

    if (next.depth === 0) {
      for (const event of linked) {
        if (!captured.has(event.url) && queue.length < MAX_DETAIL_PAGES) {
          queue.push({ url: event.url, depth: 1, fallbackTitle: event.title });
        }
      }
    }
  }

  const events = [...captured.values()].slice(0, MAX_EVENTS_PER_SOURCE);
  metrics.eventsCaptured = events.length;
  const publishableEvents = events.filter(isPublishableEvent);
  metrics.eventsSkipped = Math.max(0, metrics.eventLinksRead - events.length) + (events.length - publishableEvents.length);

  if (publishableEvents.length > 0) {
    try {
      Object.assign(metrics, await persistEvents(source, publishableEvents));
    } catch {
      return {
        sourceId: source.id,
        sourceName: source.name,
        scannedUrl: source.activityUrl,
        status: "error" as const,
        events,
        ...metrics,
        message: `Captured ${events.length} event${events.length === 1 ? "" : "s"}, but the publishable events could not be added to the activity list.`,
      };
    }
  }

  const reachedLimit = queue.length > 0 || captured.size >= MAX_EVENTS_PER_SOURCE;
  const status = events.length > 0
    ? (reachedLimit || metrics.pagesFailed > 0 ? "partial" : "found")
    : sourceDenied
      ? "blocked"
      : metrics.pagesFailed > 0
        ? "error"
        : "no_events";

  const message = status === "blocked"
    ? "The source denied automated access."
    : status === "error"
      ? "No source pages could be read."
      : status === "no_events"
        ? "The approved pages were read, but no event pages were detected."
        : `${metrics.eventsCaptured} event${metrics.eventsCaptured === 1 ? "" : "s"} captured; ${metrics.eventsAdded} added and ${metrics.eventsUpdated} updated in the Den Haag activity list.${events.length > publishableEvents.length ? ` ${events.length - publishableEvents.length} captured event${events.length - publishableEvents.length === 1 ? "" : "s"} did not include a verified upcoming date and Den Haag location, so ${events.length - publishableEvents.length === 1 ? "it was" : "they were"} not published.` : ""}${status === "partial" ? " Some pages could not be read or the safe crawl limit was reached." : ""}`;

  return {
    sourceId: source.id,
    sourceName: source.name,
    scannedUrl: source.activityUrl,
    status,
    events,
    ...metrics,
    message,
  };
}

router.post("/scan", async (req, res) => {
  const sourceIds = req.body?.sourceIds;
  if (!Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > DEN_HAAG_SOURCES.length) {
    res.status(400).json({
      scannedAt: new Date().toISOString(),
      scans: [],
      error: `Choose between 1 and ${DEN_HAAG_SOURCES.length} sources.`,
    });
    return;
  }
  if (new Set(sourceIds).size !== sourceIds.length) {
    res.status(400).json({
      scannedAt: new Date().toISOString(),
      scans: [],
      error: "Choose each approved source only once per scan.",
    });
    return;
  }
  if (activeScanRequests >= MAX_ACTIVE_SCAN_REQUESTS) {
    res.status(429).json({
      scannedAt: new Date().toISOString(),
      scans: [],
      error: "The source scanner is busy. Please wait for the current scans to finish.",
    });
    return;
  }

  activeScanRequests += 1;
  try {
    const selectedSources = sourceIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => SOURCE_BY_ID.get(id))
      .filter((source): source is SourceDefinition => Boolean(source));

    if (selectedSources.length !== sourceIds.length) {
      res.status(400).json({
        scannedAt: new Date().toISOString(),
        scans: [],
        error: "One or more selected sources are not in the approved Den Haag source list.",
      });
      return;
    }

    const scans = [];
    for (let index = 0; index < selectedSources.length; index += 2) {
      const batch = selectedSources.slice(index, index + 2);
      scans.push(...await Promise.all(batch.map(scanSource)));
    }

    res.json({ scannedAt: new Date().toISOString(), scans });
  } finally {
    activeScanRequests -= 1;
  }
});

export default router;