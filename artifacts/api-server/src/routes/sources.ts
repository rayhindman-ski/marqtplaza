import { Router } from "express";
import { inArray, sql } from "drizzle-orm";
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

type CrawlPageType = "index" | "detail" | "sitemap" | "robots";

type CrawlPage = {
  url: string;
  depth: number;
  type: CrawlPageType;
  fallbackTitle?: string;
};

type RobotsRule = {
  path: string;
  allow: boolean;
};

type ScanMetrics = {
  eventLinksRead: number;
  eventsCaptured: number;
  eventsEligible: number;
  eventsMissingDate: number;
  eventsOutOfWindow: number;
  eventsMissingLocality: number;
  pagesRead: number;
  pagesFailed: number;
  eventsAdded: number;
  eventsUpdated: number;
  eventsSkipped: number;
  pagesSkipped: number;
  indexPagesRead: number;
  detailPagesRead: number;
  sitemapsRead: number;
  robotsPagesSkipped: number;
  crawlLimitReached: boolean;
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
  "optreden", "performance", "what's on", "things to do", "film", "comedy",
  "dance", "jazz", "music", "lecture", "lezing", "cabaret",
];
const NAVIGATION_LINK_TITLES = new Set([
  "nederlands", "english", "frans", "deutsch", "skip filters", "skip to content",
  "excursions & activities", "activities", "agenda", "calendar", "events",
  "directly to content", "shopping", "food, drinks & nightlife", "museums & attractions",
  "highlights of the hague", "sport and outdoor", "cycling routes", "walking routes",
  "top 10 must-sees", "royal the hague", "the hague's districts", "the hague & sustainability",
]);
const MAX_PAGES_PER_SOURCE = 100;
const MAX_INDEX_PAGES = 24;
const MAX_DETAIL_PAGES = 68;
const MAX_SITEMAP_PAGES = 8;
const MAX_EVENTS_PER_SOURCE = 240;
const MAX_LINKS_PER_PAGE = 600;
const MAX_SITEMAP_URLS = 300;
const MAX_RESPONSE_CHARS = 700_000;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 3;
const MAX_ACTIVE_SCAN_REQUESTS = 2;
const CRAWLER_USER_AGENT = "marqtplaza.com/1.0";
const DEN_HAAG_CENTER = { lat: 52.0705, lng: 4.3007 };
const DEN_HAAG_BOUNDS = { south: 52.05, west: 4.26, north: 52.11, east: 4.36 };
let activeScanRequests = 0;

function emptyMetrics(): ScanMetrics {
  return {
    eventLinksRead: 0,
    eventsCaptured: 0,
    eventsEligible: 0,
    eventsMissingDate: 0,
    eventsOutOfWindow: 0,
    eventsMissingLocality: 0,
    pagesRead: 0,
    pagesFailed: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
    pagesSkipped: 0,
    indexPagesRead: 0,
    detailPagesRead: 0,
    sitemapsRead: 0,
    robotsPagesSkipped: 0,
    crawlLimitReached: false,
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
    return new URL(url).origin === new URL(source.activityUrl).origin;
  } catch {
    return false;
  }
}

function parseRobotsRules(text: string): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current = { agents: [] as string[], rules: [] as RobotsRule[] };

  function finishGroup() {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], rules: [] };
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (directive === "user-agent") {
      if (current.rules.length > 0) finishGroup();
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if ((directive === "allow" || directive === "disallow") && current.agents.length > 0) {
      current.rules.push({ path: value, allow: directive === "allow" });
    }
  }
  finishGroup();

  const crawler = CRAWLER_USER_AGENT.toLowerCase();
  const exactGroups = groups.filter((group) => group.agents.some((agent) => agent !== "*" && crawler.startsWith(agent)));
  const applicable = exactGroups.length > 0
    ? exactGroups
    : groups.filter((group) => group.agents.includes("*"));
  return applicable.flatMap((group) => group.rules);
}

function robotsPathMatches(rulePath: string, targetPath: string): boolean {
  if (!rulePath) return false;
  const endAnchored = rulePath.endsWith("$");
  const expression = rulePath
    .replace(/\$$/, "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${expression}${endAnchored ? "$" : ""}`).test(targetPath);
}

function isAllowedByRobots(url: string, rules: RobotsRule[]): boolean {
  if (rules.length === 0) return true;
  const parsed = new URL(url);
  const targetPath = `${parsed.pathname}${parsed.search}`;
  const matches = rules
    .filter((rule) => robotsPathMatches(rule.path, targetPath))
    .sort((left, right) => right.path.length - left.path.length || Number(right.allow) - Number(left.allow));
  return matches[0]?.allow ?? true;
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

const DUTCH_MONTHS: Record<string, string> = {
  januari: "01", februari: "02", maart: "03", april: "04", mei: "05", juni: "06",
  juli: "07", augustus: "08", september: "09", oktober: "10", november: "11", december: "12",
  jan: "01", feb: "02", mrt: "03", apr: "04", jun: "06", jul: "07", aug: "08",
  sep: "09", sept: "09", okt: "10", nov: "11", dec: "12",
};
const ENGLISH_MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08",
  sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};
const MONTHS: Record<string, string> = { ...DUTCH_MONTHS, ...ENGLISH_MONTHS };

function normalizedDate(
  year: string,
  month: string,
  day: string,
  time?: RegExpMatchArray | null,
): string | undefined {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const calendarDate = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (
    calendarDate.getUTCFullYear() !== numericYear
    || calendarDate.getUTCMonth() !== numericMonth - 1
    || calendarDate.getUTCDate() !== numericDay
  ) {
    return undefined;
  }
  const base = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return time ? `${base}T${time[1].padStart(2, "0")}:${time[2]}:00` : base;
}

function normalizeDateValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = stripMarkup(value).replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const time = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const iso = clean.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s]([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\.\d+)?(?:[+\-]\d{2}:?\d{2}|Z)?)?\b/);
  if (iso) {
    return normalizedDate(iso[1], iso[2], iso[3], iso[4] && iso[5] ? [iso[0], iso[4], iso[5]] : time);
  }

  const numericDayFirst = clean.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (numericDayFirst) {
    return normalizedDate(numericDayFirst[3], numericDayFirst[2], numericDayFirst[1], time);
  }

  const dayFirst = clean.match(/\b(\d{1,2})(?:\s*(?:-|t\/m|tot)\s*\d{1,2})?\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})\b/i);
  const monthFirst = clean.match(/\b([A-Za-zÀ-ÿ]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  const named = dayFirst ?? monthFirst;
  if (!named) return undefined;
  const day = dayFirst ? named[1] : named[2];
  const monthName = (dayFirst ? named[2] : named[1]).replace(/\.$/, "");
  const year = named[3];
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return undefined;
  return normalizedDate(year, month, day, time);
}

function firstDateValue(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeDateValue(value);
  if (Array.isArray(value)) {
    return value.map(firstDateValue).find((date): date is string => Boolean(date));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstDateValue(record.startDate);
  }
  return undefined;
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
  const hasEventType = types.some((type) => String(type).toLowerCase() === "event");
  const hasEventFields = typeof node.name === "string" && typeof node.url === "string" && typeof node.startDate === "string";
  if (!hasEventType && !hasEventFields) return null;

  const title = shorten(typeof node.name === "string" ? node.name : "", 180);
  const url = [
    typeof node.url === "string" ? canonicalizeUrl(node.url, pageUrl) : null,
    typeof node["@id"] === "string" ? canonicalizeUrl(node["@id"], pageUrl) : null,
    canonicalizeUrl(pageUrl, pageUrl),
  ].find((candidate): candidate is string => Boolean(candidate && isApprovedSourceUrl(candidate, source)));
  if (!title || !url) return null;

  const location = node.location;
  const locationRecord = location && typeof location === "object" ? location as Record<string, unknown> : null;
  const coordinates = parseCoordinates(locationRecord?.geo ?? node.geo);
  const description = shorten(typeof node.description === "string" ? node.description : undefined);
  const schedule = node.eventSchedule && typeof node.eventSchedule === "object"
    ? node.eventSchedule as Record<string, unknown>
    : undefined;
  const startsAt = firstDateValue(node.startDate) ?? firstDateValue(schedule?.startDate);

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
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  const visited = new Set<unknown>();

  function visit(value: unknown, depth = 0) {
    if (depth > 8 || visited.has(value)) return;
    if (Array.isArray(value)) {
      visited.add(value);
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    const event = eventFromStructuredNode(record, pageUrl, source);
    if (event) events.push(event);
    Object.values(record).forEach((child) => {
      if (child && typeof child === "object") visit(child, depth + 1);
    });
  }

  for (const script of scripts) {
    const attributes = script[1];
    const isJson = /type=["']application\/(?:ld\+json|json)["']/i.test(attributes)
      || /\bid=["'](?:__NEXT_DATA__|__NUXT_DATA__)["']/i.test(attributes);
    if (!isJson) continue;
    try {
      visit(JSON.parse(script[2]));
    } catch {
      // Invalid embedded data is common; HTML fallbacks below still run.
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
  const meta = html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/i);
  return shorten(h1?.[1] ?? meta?.[1], 180);
}

function pageDate(html: string): string | undefined {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/gi)) {
    const datetime = match[1].match(/\bdatetime=["']([^"']+)["']/i);
    candidates.push(datetime?.[1] ?? match[2]);
  }
  for (const match of html.matchAll(/<(?:meta|div|span|p)\b([^>]*)>/gi)) {
    const attributes = match[1];
    const isStartDate = /\b(?:itemprop|property|name)=["'][^"']*(?:startdate|start-date|event-start)[^"']*["']|\bdata-(?:start-?date|event-start)\s*=/i.test(attributes);
    if (!isStartDate) continue;
    const value = attributes.match(/\b(?:datetime|content|value|data-start-date|data-event-start)=["']([^"']+)["']/i);
    if (value?.[1]) candidates.push(value[1]);
  }
  return candidates.map(normalizeDateValue).find((date): date is string => Boolean(date));
}

function pageVenue(html: string): string | undefined {
  const address = html.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i)
    ?? html.match(/<(?:div|span|p)\b[^>]*(?:itemprop=["'](?:location|venue)["']|class=["'][^"']*(?:venue|location)[^"']*)[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i);
  return shorten(address?.[1] ?? address?.[2], 180);
}

function linkCandidatesFromPage(
  html: string,
  pageUrl: string,
  source: SourceDefinition,
): { candidates: SourceScanEvent[]; indexLinks: CrawlPage[]; sitemapLinks: CrawlPage[]; linksExamined: number } {
  const candidates: SourceScanEvent[] = [];
  const indexLinks: CrawlPage[] = [];
  const sitemapLinks: CrawlPage[] = [];
  const seen = new Set<string>();
  let linksExamined = 0;
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    if (linksExamined >= MAX_LINKS_PER_PAGE) break;
    linksExamined += 1;
    const isNextRel = /\brel=["'][^"']*\bnext\b[^"']*["']/i.test(match[0]);
    const title = shorten(match[2], 180) ?? (isNextRel ? "Next page" : undefined);
    const url = canonicalizeUrl(match[1], pageUrl);
    if (!title || !url || !isApprovedSourceUrl(url, source)) continue;
    const searchable = `${title} ${url}`.toLowerCase();
    const pagination = /\b(next|previous|older|newer|volgende|vorige|meer|page|pagina)\b/i.test(`${title} ${url}`)
      || /(?:[?&](?:page|pagina)=\d+|\/(?:page|pagina)\/\d+)\b/i.test(url);
    const sitemap = /sitemap(?:[-_]index)?\.xml/i.test(url);
    if (sitemap && !seen.has(url)) {
      seen.add(url);
      sitemapLinks.push({ url, depth: 0, type: "sitemap" });
      continue;
    }
    if (pagination && !NAVIGATION_LINK_TITLES.has(title.toLowerCase()) && !seen.has(url)) {
      seen.add(url);
      indexLinks.push({ url, depth: 0, type: "index" });
      continue;
    }
    const likelyDetail = EVENT_TERMS.some((term) => searchable.includes(term))
      || /\/(?:agenda|calendar|events?|activity|activiteiten|uitagenda|programma)(?:\/|$)/i.test(url)
      || /\b20\d{2}(?:[-/]\d{1,2}){0,2}\b/.test(url)
      || /\b(?:event|event-item|calendar-item|activity-card)\b/i.test(match[0]);
    if (!likelyDetail || title.length < 4 || NAVIGATION_LINK_TITLES.has(title.toLowerCase()) || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ title, url, category: classifyEvent(title) });
    if (candidates.length >= MAX_EVENTS_PER_SOURCE) break;
  }
  return { candidates, indexLinks, sitemapLinks, linksExamined };
}

function sitemapUrlsFromPage(html: string, pageUrl: string, source: SourceDefinition): string[] {
  if (!/sitemap|<urlset|<sitemapindex/i.test(html) && !/robots\.txt$/i.test(pageUrl)) return [];
  const urls: string[] = [];
  for (const match of html.matchAll(/^sitemap:\s*(\S+)\s*$/gim)) {
    const url = canonicalizeUrl(match[1], pageUrl);
    if (url && isApprovedSourceUrl(url, source) && !urls.includes(url)) urls.push(url);
  }
  for (const match of html.matchAll(/<(?:loc|sitemap:\s*loc)\b[^>]*>([\s\S]*?)<\/(?:loc|sitemap:\s*loc)>/gi)) {
    const url = canonicalizeUrl(stripMarkup(match[1]), pageUrl);
    if (url && isApprovedSourceUrl(url, source) && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls.slice(0, MAX_SITEMAP_URLS);
}

function isRelevantSitemapUrl(url: string): boolean {
  return /sitemap(?:[-_]index)?\.xml(?:\?|$)/i.test(url)
    || /\/(?:agenda|calendar|events?|event|activity|activiteiten|uitagenda|programma)(?:\/|$)/i.test(url)
    || /\b20\d{2}(?:[-/]\d{1,2}){0,2}\b/.test(url);
}

function htmlEventFromPage(
  html: string,
  pageUrl: string,
  source: SourceDefinition,
  fallbackTitle?: string,
): SourceScanEvent | null {
  const title = pageTitle(html) ?? fallbackTitle;
  if (!title) return null;
  const description = pageDescription(html);
  return {
    title,
    url: pageUrl,
    description,
    startsAt: pageDate(html),
    venue: pageVenue(html),
    category: classifyEvent(`${title} ${description ?? ""}`),
  };
}

function sitemapPriority(url: string): number {
  const value = url.toLowerCase();
  let score = 0;
  if (/\b(20\d{2}|agenda|calendar|event|events|activity|activiteiten|uitagenda|programma)\b/.test(value)) score += 3;
  if (/sitemap/.test(value)) score -= 2;
  return score;
}

async function fetchApprovedPage(
  url: string,
  source: SourceDefinition,
  robotsRules: RobotsRule[] = [],
  skipRobotsCheck = false,
): Promise<{ html: string; url: string } | { error: string; blocked: boolean; robotsDisallowed?: boolean }> {
  const initialUrl = canonicalizeUrl(url, source.activityUrl);
  if (!initialUrl || !isApprovedSourceUrl(initialUrl, source)) {
    return { error: "The requested page is outside this source's approved domain.", blocked: true };
  }
  if (!skipRobotsCheck && !isAllowedByRobots(initialUrl, robotsRules)) {
    return { error: "The source's robots.txt policy disallows this page.", blocked: false, robotsDisallowed: true };
  }
  let requestUrl: string = initialUrl;

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!skipRobotsCheck && !isAllowedByRobots(requestUrl, robotsRules)) {
        return { error: "The source's robots.txt policy disallows this page.", blocked: false, robotsDisallowed: true };
      }
      const response = await fetch(requestUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": `${CRAWLER_USER_AGENT} (approved Den Haag event source scanner)`,
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
        if (!skipRobotsCheck && !isAllowedByRobots(nextUrl, robotsRules)) {
          return { error: "The source redirected to a robots.txt-protected page.", blocked: false, robotsDisallowed: true };
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

type PublicationStatus = "eligible" | "missing_date" | "out_of_window" | "missing_locality";

function publicationStatus(event: SourceScanEvent): PublicationStatus {
  const startsAt = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
  if (!Number.isFinite(startsAt)) return "missing_date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const latestAcceptedDate = new Date(now);
  latestAcceptedDate.setMonth(latestAcceptedDate.getMonth() + 18);
  if (startsAt < today || startsAt > latestAcceptedDate.getTime()) return "out_of_window";

  if (
    Number.isFinite(event.lat) &&
    Number.isFinite(event.lng) &&
    event.lat! >= DEN_HAAG_BOUNDS.south &&
    event.lat! <= DEN_HAAG_BOUNDS.north &&
    event.lng! >= DEN_HAAG_BOUNDS.west &&
    event.lng! <= DEN_HAAG_BOUNDS.east
  ) {
    return "eligible";
  }
  return /\b(den haag|the hague|scheveningen|kijkduin|loosduinen)\b/i.test(
    `${event.venue ?? ""} ${event.description ?? ""}`,
  ) ? "eligible" : "missing_locality";
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
        description: event.description ? sql`excluded.description` : sql`${discoveredEventsTable.description}`,
        startsAt: event.startsAt ? sql`excluded.starts_at` : sql`${discoveredEventsTable.startsAt}`,
        venue: event.venue ? sql`excluded.venue` : sql`${discoveredEventsTable.venue}`,
        category: event.category ?? "Entertainment",
        lat: coordinates.isApproximateLocation ? sql`${discoveredEventsTable.lat}` : sql`excluded.lat`,
        lng: coordinates.isApproximateLocation ? sql`${discoveredEventsTable.lng}` : sql`excluded.lng`,
        x: coordinates.isApproximateLocation ? sql`${discoveredEventsTable.x}` : sql`excluded.x`,
        y: coordinates.isApproximateLocation ? sql`${discoveredEventsTable.y}` : sql`excluded.y`,
        isApproximateLocation: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.isApproximateLocation}`
          : false,
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
  const sourceOrigin = new URL(source.activityUrl).origin;
  const queue: CrawlPage[] = [];
  const queued = new Set<string>();
  const visited = new Set<string>();
  const captured = new Map<string, SourceScanEvent>();
  let robotsRules: RobotsRule[] = [];
  let sourceDenied = false;

  function enqueue(page: CrawlPage) {
    const url = canonicalizeUrl(page.url, source.activityUrl);
    if (!url || visited.has(url) || queued.has(url) || !isApprovedSourceUrl(url, source)) return;
    if (page.type !== "robots" && !isAllowedByRobots(url, robotsRules)) {
      metrics.robotsPagesSkipped += 1;
      return;
    }
    queued.add(url);
    queue.push({ ...page, url });
  }

  function enqueueSitemapUrls(urls: string[]) {
    for (const url of urls.sort((left, right) => sitemapPriority(right) - sitemapPriority(left))) {
      const isSitemap = /sitemap|\.xml(?:\?|$)/i.test(url);
      if (!isRelevantSitemapUrl(url)) continue;
      enqueue({ url, depth: 0, type: isSitemap ? "sitemap" : "detail" });
    }
  }

  const robotsUrl = `${sourceOrigin}/robots.txt`;
  const robotsPage = await fetchApprovedPage(robotsUrl, source, [], true);
  let robotsSitemaps: string[] = [];
  if ("error" in robotsPage) {
    if (robotsPage.blocked) {
      metrics.pagesFailed += 1;
      sourceDenied = true;
    }
  } else {
    metrics.pagesRead += 1;
    robotsRules = parseRobotsRules(robotsPage.html);
    robotsSitemaps = sitemapUrlsFromPage(robotsPage.html, robotsPage.url, source);
  }

  if (!sourceDenied) {
    enqueue({ url: source.activityUrl, depth: 0, type: "index" });
    enqueue({ url: `${sourceOrigin}/sitemap.xml`, depth: 0, type: "sitemap" });
    enqueue({ url: `${sourceOrigin}/sitemap_index.xml`, depth: 0, type: "sitemap" });
    enqueueSitemapUrls(robotsSitemaps);
  }

  while (queue.length > 0 && visited.size < MAX_PAGES_PER_SOURCE) {
    const next = queue.shift()!;
    queued.delete(next.url);
    const canonicalUrl = canonicalizeUrl(next.url, source.activityUrl);
    if (!canonicalUrl || visited.has(canonicalUrl) || !isApprovedSourceUrl(canonicalUrl, source)) continue;
    if (next.type === "index" && metrics.indexPagesRead >= MAX_INDEX_PAGES) {
      metrics.pagesSkipped += 1;
      metrics.crawlLimitReached = true;
      continue;
    }
    if (next.type === "detail" && metrics.detailPagesRead >= MAX_DETAIL_PAGES) {
      metrics.pagesSkipped += 1;
      metrics.crawlLimitReached = true;
      continue;
    }
    if (next.type === "sitemap" && metrics.sitemapsRead >= MAX_SITEMAP_PAGES) {
      metrics.pagesSkipped += 1;
      metrics.crawlLimitReached = true;
      continue;
    }
    visited.add(canonicalUrl);

    const page = await fetchApprovedPage(canonicalUrl, source, robotsRules);
    if ("error" in page) {
      if (page.robotsDisallowed) {
        metrics.robotsPagesSkipped += 1;
        continue;
      }
      metrics.pagesFailed += 1;
      sourceDenied ||= page.blocked;
      continue;
    }
    metrics.pagesRead += 1;
    if (next.type === "index") metrics.indexPagesRead += 1;
    if (next.type === "detail") metrics.detailPagesRead += 1;
    if (next.type === "sitemap") metrics.sitemapsRead += 1;

    const structured = structuredEventsFromPage(page.html, page.url, source);
    const linked = linkCandidatesFromPage(page.html, page.url, source);
    metrics.eventLinksRead += linked.linksExamined;

    for (const event of structured) {
      const existing = captured.get(event.url);
      captured.set(event.url, {
        ...existing,
        ...event,
        startsAt: event.startsAt ?? existing?.startsAt,
        venue: event.venue ?? existing?.venue,
        description: event.description ?? existing?.description,
      });
    }

    if (next.type === "detail") {
      const extracted = htmlEventFromPage(page.html, page.url, source, next.fallbackTitle);
      if (extracted) {
        const existing = captured.get(extracted.url);
        captured.set(extracted.url, {
          ...extracted,
          ...existing,
          startsAt: existing?.startsAt ?? extracted.startsAt,
          venue: existing?.venue ?? extracted.venue,
          description: existing?.description ?? extracted.description,
        });
      }
    }

    if (next.type === "sitemap") {
      enqueueSitemapUrls(sitemapUrlsFromPage(page.html, page.url, source));
    }
    if (next.type === "index") {
      for (const indexPage of linked.indexLinks) enqueue(indexPage);
      for (const sitemapPage of linked.sitemapLinks) enqueue(sitemapPage);
      for (const event of linked.candidates) {
        if (!captured.has(event.url)) captured.set(event.url, event);
        enqueue({ url: event.url, depth: next.depth + 1, type: "detail", fallbackTitle: event.title });
      }
    }
  }

  if (visited.size >= MAX_PAGES_PER_SOURCE && queue.length > 0) {
    metrics.pagesSkipped += queue.length;
  }

  const events = [...captured.values()].slice(0, MAX_EVENTS_PER_SOURCE);
  metrics.eventsCaptured = events.length;
  const publishableEvents: SourceScanEvent[] = [];
  for (const event of events) {
    const status = publicationStatus(event);
    if (status === "eligible") {
      metrics.eventsEligible += 1;
      publishableEvents.push(event);
    } else if (status === "missing_date") {
      metrics.eventsMissingDate += 1;
    } else if (status === "out_of_window") {
      metrics.eventsOutOfWindow += 1;
    } else {
      metrics.eventsMissingLocality += 1;
    }
  }
  metrics.eventsSkipped = events.length - publishableEvents.length;
  metrics.crawlLimitReached ||= queue.length > 0 || visited.size >= MAX_PAGES_PER_SOURCE || captured.size >= MAX_EVENTS_PER_SOURCE;

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

  const reachedLimit = metrics.crawlLimitReached;
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
        : `${metrics.eventsCaptured} event${metrics.eventsCaptured === 1 ? "" : "s"} captured from ${metrics.indexPagesRead} calendar/index page${metrics.indexPagesRead === 1 ? "" : "s"} and ${metrics.detailPagesRead} detail page${metrics.detailPagesRead === 1 ? "" : "s"}; ${metrics.eventsEligible} eligible, ${metrics.eventsAdded} added, and ${metrics.eventsUpdated} updated in the Den Haag activity list.${events.length > publishableEvents.length ? ` ${metrics.eventsMissingDate} lacked a date, ${metrics.eventsOutOfWindow} were outside the upcoming window, and ${metrics.eventsMissingLocality} lacked verified Den Haag evidence.` : ""}${status === "partial" ? " Some pages could not be read or a safe crawl limit was reached." : ""}`;

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