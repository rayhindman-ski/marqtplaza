import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { discoveredEventsTable } from "@workspace/db/schema";
import { requireEditor } from "../middlewares/requireEditor";
import { queueMissingEventTranslations } from "../lib/event-localization.js";

const router = Router();

export type SourceDefinition = {
  id: string;
  name: string;
  activityUrl: string;
  sourceGroup: "city-agenda" | "culture" | "community" | "meals";
};

type EventCategory = "Museums" | "Tours" | "Family" | "Entertainment" | "Outdoors" | "Markets";
type ActivityKind = "community" | "culture" | "learning" | "movement" | "meal" | "family" | "market" | "outdoor" | "entertainment";
type PriceType = "free" | "low-cost" | "paid" | "unknown";
type MealType = "community-meal" | "food-support";
type PublicationReason = "missing_date" | "out_of_window" | "missing_locality" | "foreign_location";
export type EventContentLanguage = "nl" | "en" | "de" | "unknown";

export type SourceScanEvent = {
  title: string;
  url: string;
  sourceEventId?: string;
  context?: string;
  description?: string;
  sourceLanguage?: EventContentLanguage;
  titleNl?: string;
  descriptionNl?: string;
  titleEn?: string;
  descriptionEn?: string;
  startsAt?: string;
  isCancelled?: boolean;
  openingTimes?: string;
  venue?: string;
  category?: EventCategory;
  organizer?: string;
  sourceGroup?: SourceDefinition["sourceGroup"];
  activityKind?: ActivityKind;
  priceType?: PriceType;
  priceText?: string;
  mealType?: MealType;
  audience?: string;
  neighborhood?: string;
  recurrenceText?: string;
  isIndoor?: boolean;
  lat?: number;
  lng?: number;
  reviewReason?: PublicationReason;
};

type ParsedPrice = Pick<SourceScanEvent, "priceType" | "priceText">;
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
  eventsForeignLocation: number;
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
  { id: "getyourguide", name: "GetYourGuide", activityUrl: "https://www.getyourguide.com/en-gb/the-hague-l1267/", sourceGroup: "city-agenda" },
  { id: "denhaag-com", name: "DenHaag.com", activityUrl: "https://denhaag.com/en/calendar", sourceGroup: "city-agenda" },
  { id: "wearetravelers", name: "We Are Travelers", activityUrl: "https://www.wearetravelers.nl", sourceGroup: "city-agenda" },
  { id: "flitz-events", name: "Flitz-Events", activityUrl: "https://flitz-events.nl/teamuitje/den-haag", sourceGroup: "city-agenda" },
  { id: "tripadvisor", name: "Tripadvisor", activityUrl: "https://www.tripadvisor.nl/Attractions-g188633-Activities-The_Hague_South_Holland_Province.html", sourceGroup: "city-agenda" },
  { id: "kidsproof", name: "Kidsproof Den Haag", activityUrl: "https://www.kidsproof.nl/denhaag/uitjes/uitagenda/", sourceGroup: "city-agenda" },
  { id: "reisroutes", name: "Reisroutes", activityUrl: "https://www.reisroutes.nl/stadswandelingen/den-haag/", sourceGroup: "city-agenda" },
  { id: "follow-my-footprints", name: "Follow my footprints", activityUrl: "https://www.followmyfootprints.nl/category/nederland/den-haag/", sourceGroup: "city-agenda" },
  { id: "dagjeweg", name: "DagjeWeg.NL", activityUrl: "https://www.dagjeweg.nl/dagjeuit/den-haag/stedentrips", sourceGroup: "city-agenda" },
  { id: "eventbrite", name: "Eventbrite", activityUrl: "https://www.eventbrite.nl/d/netherlands--the-hague/events/", sourceGroup: "city-agenda" },
  { id: "fijnuit", name: "FijnUit", activityUrl: "https://www.fijnuit.nl/den-haag", sourceGroup: "city-agenda" },
  { id: "wattedoenin", name: "Wat te doen in", activityUrl: "https://www.wattedoenin.nl/wat-te-doen-in/den-haag/", sourceGroup: "city-agenda" },
  { id: "travel-around-with-me", name: "Travel Around With Me", activityUrl: "https://www.travelaroundwithme.com/gratis-doen-den-haag/", sourceGroup: "city-agenda" },
  { id: "yellowbrick", name: "Yellowbrick", activityUrl: "https://yellowbrick.nl/blog/wat-te-doen-in-den-haag-tips-and-uitagenda/", sourceGroup: "city-agenda" },
  { id: "wannado", name: "Wannado", activityUrl: "https://wannado.nl/wat-te-doen/den-haag/categorie/activiteiten-uitjes", sourceGroup: "city-agenda" },
  { id: "see-the-hague", name: "seeTheHague", activityUrl: "https://seethehague.nl/activiteiten-in-den-haag/", sourceGroup: "city-agenda" },
  { id: "stappen-in-den-haag", name: "Stappen in Den Haag", activityUrl: "https://stappenindenhaag.nl/de-uitagenda-van-den-haag/", sourceGroup: "city-agenda" },
  { id: "weekends-in", name: "Weekends in", activityUrl: "https://week-endsin.com/the-hague/activities/", sourceGroup: "city-agenda" },
  { id: "mooiste-stedentrips", name: "Mooiste Stedentrips", activityUrl: "https://mooistestedentrips.nl/mini-break-in-nederland-den-haag/", sourceGroup: "city-agenda" },
  { id: "1001activiteiten", name: "1001activiteiten", activityUrl: "https://www.1001activiteiten.nl/provincie-zuid-holland/den-haag", sourceGroup: "city-agenda" },
  { id: "uitjes-nl", name: "Uitjes.nl", activityUrl: "https://uitjes.nl/den-haag-uitjes/", sourceGroup: "city-agenda" },
  { id: "enter-the-hague", name: "Enter The Hague", activityUrl: "https://www.enterthehague.com/the-hague-free-walking-tour", sourceGroup: "city-agenda" },
  { id: "cultuurschakel", name: "CultuurSchakel", activityUrl: "https://www.cultuurschakel.nl/vrije-tijd/cultuur-proeven/", sourceGroup: "culture" },
  { id: "lekkerweg", name: "Lekkerweg Tips", activityUrl: "https://www.lekkerwegtips.nl/wat-te-doen-in-den-haag/", sourceGroup: "city-agenda" },
  { id: "just-peace", name: "Just Peace", activityUrl: "https://www.justpeacethehague.org/en/", sourceGroup: "community" },
  { id: "amare", name: "Amare", activityUrl: "https://www.amare.nl/nl/agenda", sourceGroup: "culture" },
  { id: "wijkz", name: "Wijkz", activityUrl: "https://wijkz.nl/activiteiten/", sourceGroup: "community" },
  { id: "de-mussen", name: "De Mussen", activityUrl: "https://www.demussen.nl/activiteiten/", sourceGroup: "community" },
  { id: "participatiekeuken", name: "Participatiekeuken", activityUrl: "https://www.participatiekeuken.nl/vredesdiners", sourceGroup: "meals" },
];

const SOURCE_BY_ID = new Map(DEN_HAAG_SOURCES.map((source) => [source.id, source]));
const EVENT_TERMS = [
  "agenda", "calendar", "event", "events", "activit", "uitje", "uitagenda",
  "festival", "concert", "workshop", "markt", "market", "theater", "theatre",
  "tentoonstelling", "expositie", "exhibition", "expo", "tour", "show",
  "optreden", "performance", "what's on", "things to do", "film", "comedy",
  "dance", "jazz", "music", "lecture", "lezing", "cabaret", "ontmoeten",
  "samen eten", "maaltijd", "diner", "inloop", "buurtactiviteit", "participatie",
  "taalcafé", "koffieochtend", "bewegen", "vrijwilliger",
];
const NAVIGATION_LINK_TITLES = new Set([
  "nederlands", "english", "frans", "deutsch", "skip filters", "skip to content",
  "excursions & activities", "activities", "agenda", "calendar", "events",
  "directly to content", "shopping", "food, drinks & nightlife", "museums & attractions",
  "highlights of the hague", "sport and outdoor", "cycling routes", "walking routes",
  "top 10 must-sees", "royal the hague", "the hague's districts", "the hague & sustainability",
  "onze organisatie", "wat wij doen", "onze partners", "nieuws", "algemene voorwaarden",
  "privacy statement", "privacy policy", "inschrijven", "aanmelden", "contact", "vacatures",
  "horeca aanschuiftafel", "kom ook helpen",
]);
const MAX_PAGES_PER_SOURCE = 100;
const MAX_INDEX_PAGES = 24;
const MAX_DETAIL_PAGES = 68;
const MAX_SITEMAP_PAGES = 8;
const MAX_EVENTS_PER_SOURCE = 240;
const MAX_LINKS_PER_PAGE = 600;
const MAX_SITEMAP_URLS = 300;
const MAX_LOCALITY_RESCUES_PER_SOURCE = 48;
const LOCALITY_RESCUE_CONCURRENCY = 3;
const MAX_RESPONSE_CHARS = 760_000;
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
    eventsForeignLocation: 0,
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

function formatPriceAmount(raw: string, currency = "€"): string {
  const normalized = raw.trim().replace(/\s+/g, "").replace(".", ",");
  return `${currency}${normalized}`;
}
function shorten(value: string | undefined, maxLength = 440): string | undefined {
  if (!value) return undefined;
  const clean = stripMarkup(value).replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

export function detectEventContentLanguage(html: string, url: string): EventContentLanguage {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/(?:nl|nederlands)(?:\/|$)/.test(path)) return "nl";
  if (/\/(?:en|en-gb|english)(?:\/|$)/.test(path)) return "en";
  if (/\/(?:de|de-de|deutsch)(?:\/|$)/.test(path)) return "de";
  const htmlLanguage = html.match(/<html\b[^>]*\blang=["']?([a-z]{2})(?:-[a-z]{2})?["'\s>]/i)?.[1]?.toLowerCase();
  return htmlLanguage === "nl" || htmlLanguage === "en" || htmlLanguage === "de"
    ? htmlLanguage
    : "unknown";
}

function withLocalizedEventCopy(
  event: SourceScanEvent,
  language: EventContentLanguage,
): SourceScanEvent {
  return {
    ...event,
    sourceLanguage: language,
    titleNl: language === "nl" ? event.title : event.titleNl,
    descriptionNl: language === "nl" ? event.description : event.descriptionNl,
    titleEn: language === "en" ? event.title : event.titleEn,
    descriptionEn: language === "en" ? event.description : event.descriptionEn,
  };
}

function isCancellationText(value: string | undefined): boolean {
  const text = value?.trim() ?? "";
  const cancellation = "(?:cancelled|canceled|geannuleerd|afgelast|abgesagt|annulé)";
  const eventNoun = "(?:event|evenement|activiteit|concert|voorstelling|workshop|bijeenkomst)";
  return new RegExp(`^${cancellation}(?:\\s*[:\\-–—]|$)`, "i").test(text)
    || new RegExp(`\\b(?:this|the|dit|deze|het)\\s+${eventNoun}\\s+(?:is|has\\s+been|wordt)\\s+${cancellation}\\b`, "i").test(text)
    || new RegExp(`\\b${eventNoun}\\s+(?:is\\s+)?${cancellation}\\b`, "i").test(text)
    || /\b(?:gaat\s+niet(?:\s+meer)?\s+door|will\s+not\s+take\s+place)\b/i.test(text);
}

function isCancelledEvent(...values: Array<string | undefined>): boolean {
  return values.some((value) => isCancellationText(value));
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

function organizerName(value: unknown): string | undefined {
  if (typeof value === "string") return shorten(value, 160);
  if (Array.isArray(value)) {
    return value.map(organizerName).find((name): name is string => Boolean(name));
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return organizerName(record.name);
}

export function eventMetadata(
  evidence: string,
  source: SourceDefinition,
  offerValue?: unknown,
): Pick<SourceScanEvent, "sourceGroup" | "activityKind" | "priceType" | "priceText" | "mealType" | "audience" | "neighborhood" | "recurrenceText"> {
  const clean = stripMarkup(evidence).replace(/\s+/g, " ").trim();
  const text = clean.toLowerCase();
  const offers = (Array.isArray(offerValue) ? offerValue : [offerValue])
    .filter((offer): offer is Record<string, unknown> => Boolean(offer) && typeof offer === "object");
  const parseAmount = (value: unknown): number | undefined => {
    const amount = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.replace(",", "."))
        : Number.NaN;
    return Number.isFinite(amount) ? amount : undefined;
  };
  const firstCurrency = offers
    .map((offer) => typeof offer.priceCurrency === "string" ? offer.priceCurrency.trim().toUpperCase() : "")
    .find(Boolean) ?? "";
  const compatibleOffers = offers.filter((offer) => {
    const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency.trim().toUpperCase() : "";
    return currency === firstCurrency;
  });
  const structuredAmounts = compatibleOffers.flatMap((offer) => {
    const exact = parseAmount(offer.price);
    if (exact !== undefined) return [exact];
    return [parseAmount(offer.lowPrice), parseAmount(offer.highPrice)]
      .filter((amount): amount is number => amount !== undefined);
  });
  const visiblePrice = parseVisibleEventPrice(clean);
  const currencyLabel = firstCurrency === "EUR" ? "€" : firstCurrency ? `${firstCurrency} ` : "";
  const formatAmount = (amount: number): string => {
    return `${currencyLabel}${amount.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}`;
  };
  const structuredMin = structuredAmounts.length > 0 ? Math.min(...structuredAmounts) : undefined;
  const structuredMax = structuredAmounts.length > 0 ? Math.max(...structuredAmounts) : undefined;
  const structuredPrice = structuredMin === undefined || structuredMax === undefined
    ? undefined
    : structuredMin === structuredMax
      ? formatAmount(structuredMin)
      : `${formatAmount(structuredMin)}–${formatAmount(structuredMax).replace(currencyLabel, "")}`;
  const hasMeal = /\b(samen eten|maaltijd|diner|lunch|ontbijt|buurtmaaltijd|eet(?:-|\s)?café|food support|voedselhulp)\b/i.test(clean);
  const mealType: MealType | undefined = hasMeal
    ? /\b(voedselhulp|voedselbank|food support|uitgifte)\b/i.test(clean) ? "food-support" : "community-meal"
    : undefined;
  const priceType: PriceType = structuredMax === 0
    ? "free"
    : /\b(laag(?:e)?\s+(?:prijs|tarief|bijdrage)|low[- ]cost|betaalbare?\s+(?:prijs|bijdrage)|eigen bijdrage)\b/i.test(clean)
      ? "low-cost"
      : structuredMax !== undefined && structuredMax > 0
        ? "paid"
          : visiblePrice.priceType ?? "unknown";
  const activityKind: ActivityKind | undefined = mealType
    ? "meal"
    : /\b(workshop|cursus|lezing|taalcafé|training|learning|learn)\b/i.test(text)
      ? "learning"
      : /\b(sport|bewegen|yoga|wandelen|dance|dans)\b/i.test(text)
        ? "movement"
        : /\b(ontmoet|inloop|participatie|buurt|vrijwillig|community|social)\b/i.test(text)
          ? "community"
          : /\b(concert|theater|muziek|film|cabaret|performance)\b/i.test(text)
            ? "entertainment"
            : /\b(kunst|cultuur|tentoonstelling|expo|museum)\b/i.test(text)
              ? "culture"
              : /\b(markt|market)\b/i.test(text)
                ? "market"
                : /\b(strand|park|outdoor|buiten|natuur)\b/i.test(text)
                  ? "outdoor"
                  : /\b(kind|gezin|family|children)\b/i.test(text)
                    ? "family"
                    : undefined;
  const audiencePatterns: Array<[RegExp, string]> = [
    [/\b(senioren|ouderen|55\+|65\+)\b/i, "senioren"],
    [/\b(jongeren|young people|16[-–]27)\b/i, "jongeren"],
    [/\b(kinderen|kids|children|gezinnen|families)\b/i, "gezinnen"],
    [/\b(nieuwkomers|newcomers|vluchtelingen|refugees)\b/i, "nieuwkomers"],
  ];
  const audience = audiencePatterns.find(([pattern]) => pattern.test(clean))?.[1];
  const neighborhood = [
    "Scheveningen", "Kijkduin", "Loosduinen", "Laak", "Laakkwartier", "Schilderswijk",
    "Segbroek", "Escamp", "Haagse Hout", "Ypenburg", "Leidschenveen", "Centrum",
  ].find((candidate) => new RegExp(`\\b${candidate.replace(" ", "\\s+")}\\b`, "i").test(clean));
  const recurrence = clean.match(/\b(?:elke|iedere|every)\s+(?:week|weekend|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|month|maand)\b[^.]{0,70}/i)?.[0];

  return {
    sourceGroup: source.sourceGroup,
    activityKind,
    priceType,
    priceText: structuredPrice ?? visiblePrice.priceText,
    mealType,
    audience,
    neighborhood,
    recurrenceText: recurrence ? shorten(recurrence, 140) : undefined,
  };
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
          (address as Record<string, unknown>).postalCode,
          (address as Record<string, unknown>).addressLocality,
        ].filter((part): part is string => typeof part === "string").join(", ")
      : "";
  return shorten([name, addressText].filter(Boolean).join(" · "), 180);
}

function openingTimesFromStructuredNode(node: Record<string, unknown>, schedule?: Record<string, unknown>): string | undefined {
  const values = [node.openingHours, node.openingHoursSpecification, schedule?.openingHours]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => {
      if (typeof value === "string") return value;
      if (!value || typeof value !== "object") return "";
      const record = value as Record<string, unknown>;
      const day = Array.isArray(record.dayOfWeek) ? record.dayOfWeek.join(", ") : String(record.dayOfWeek ?? "");
      const opens = typeof record.opens === "string" ? record.opens : "";
      const closes = typeof record.closes === "string" ? record.closes : "";
      return [day, opens && closes ? `${opens}-${closes}` : opens || closes].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  return values.length > 0 ? values.join(" · ").slice(0, 240) : undefined;
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
  const iso = clean.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s]([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\.\d+)?([+\-]\d{2}:?\d{2}|Z)?)?\b/);
  if (iso) {
    if (iso[6]) {
      const timestamp = new Date(iso[0]);
      if (!Number.isNaN(timestamp.getTime())) return formatAmsterdamDateTime(timestamp);
    }
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

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
}

export function structuredIndoorStatus(
  eventNode: Record<string, unknown>,
  locationNode?: Record<string, unknown> | null,
): boolean | undefined {
  for (const value of [
    eventNode.isIndoor,
    eventNode.indoor,
    locationNode?.isIndoor,
    locationNode?.indoor,
  ]) {
    const explicit = booleanValue(value);
    if (explicit !== undefined) return explicit;
  }

  const rawLocationTypes = locationNode?.["@type"];
  const locationTypes = Array.isArray(rawLocationTypes) ? rawLocationTypes : [rawLocationTypes];
  if (locationTypes.some((value) => /(?:^|[/#:])IndoorVenue$/i.test(String(value)))) return true;

  const additionalTypes = Array.isArray(locationNode?.additionalType)
    ? locationNode.additionalType
    : [locationNode?.additionalType];
  if (additionalTypes.some((value) => /(?:^|[/#:])IndoorVenue$/i.test(String(value)))) return true;

  const rawFeatures = locationNode?.amenityFeature;
  const features = Array.isArray(rawFeatures) ? rawFeatures : [rawFeatures];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as Record<string, unknown>;
    if (!/^(?:indoor|indoors|binnen)$/i.test(String(record.name ?? "").trim())) continue;
    const explicit = booleanValue(record.value);
    if (explicit !== undefined) return explicit;
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
  const status = typeof node.eventStatus === "string"
    ? node.eventStatus
    : typeof node.status === "string"
      ? node.status
      : undefined;
  const schedule = node.eventSchedule && typeof node.eventSchedule === "object"
    ? node.eventSchedule as Record<string, unknown>
    : undefined;
  const startsAt = firstDateValue(node.startDate) ?? firstDateValue(schedule?.startDate);
  const metadata = eventMetadata(
    `${title} ${description ?? ""}`,
    source,
    node.offers,
  );

  return {
    title,
    url,
    description,
    startsAt,
    isCancelled: isCancelledEvent(title, description, status) || status?.toLowerCase().endsWith("eventcancelled") === true,
    openingTimes: openingTimesFromStructuredNode(node, schedule),
    venue: venueFromLocation(location),
    category: classifyEvent(`${title} ${description ?? ""}`),
    organizer: organizerName(node.organizer ?? node.publisher),
    isIndoor: structuredIndoorStatus(node, locationRecord),
    ...metadata,
    ...coordinates,
  };
}

export function structuredEventsFromPage(html: string, pageUrl: string, source: SourceDefinition): SourceScanEvent[] {
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

function formatAmsterdamDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const partValue = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${partValue("year")}-${partValue("month")}-${partValue("day")}T${partValue("hour")}:${partValue("minute")}:00`;
}

function calendarDateTime(year: string, month: string, day: string, hour: string, minute: string, isUtc: boolean): string {
  return isUtc
    ? formatAmsterdamDateTime(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))))
    : `${year}-${month}-${day}T${hour}:${minute}:00`;
}

function pageDate(html: string): string | undefined {
  const candidates: string[] = [];
  for (const match of html.matchAll(/data:text\/calendar[^,]*,([A-Za-z0-9+/=]+)/gi)) {
    try {
      const calendar = Buffer.from(match[1], "base64").toString("utf8");
      const start = calendar.match(/^DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:\d{2})?(Z?)/m);
      if (start) candidates.push(calendarDateTime(start[1], start[2], start[3], start[4], start[5], start[6] === "Z"));
    } catch {
      // A malformed calendar link should not make the page unusable.
    }
  }
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

function pageCalendarField(html: string, field: "UID" | "LOCATION"): string | undefined {
  for (const match of html.matchAll(/data:text\/calendar[^,]*,([A-Za-z0-9+/=]+)/gi)) {
    try {
      const calendar = Buffer.from(match[1], "base64").toString("utf8");
      const value = calendar.match(new RegExp(`^${field}:(.+)$`, "m"))?.[1]?.trim();
      if (value) return value.slice(0, 240);
    } catch {
      // A malformed calendar link should not make the page unusable.
    }
  }
  return undefined;
}

function calendarEventFromText(
  calendar: string,
  pageUrl: string,
  source: SourceDefinition,
): SourceScanEvent | null {
  const event = calendar.match(/BEGIN:VEVENT\s*([\s\S]*?)END:VEVENT/i)?.[1];
  if (!event) return null;
  const value = (field: string) => event
    .match(new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, "mi"))?.[1]
    ?.replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .trim();
  const title = shorten(value("SUMMARY"), 180);
  const rawStart = value("DTSTART");
  if (!title || !rawStart) return null;
  const start = rawStart.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z?))?$/);
  const startsAt = start
    ? start[3] && start[4]
      ? calendarDateTime(start[1], start[2], start[3], start[4], start[5], start[6] === "Z")
      : normalizedDate(start[1], start[2], start[3])
    : normalizeDateValue(rawStart);
  const rawEnd = value("DTEND");
  const end = rawEnd?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z?))?$/);
  const openingTimes = start?.[3] && start?.[4] && end?.[4] && end?.[5]
    ? `${start[4]}:${start[5]}-${end[4]}:${end[5]}`
    : undefined;
  const description = shorten(value("DESCRIPTION"));
  const venue = shorten(value("LOCATION"), 180);
  const status = value("STATUS");
  const metadata = eventMetadata(`${title} ${description ?? ""}`, source);
  return withLocalizedEventCopy({
    title,
    url: pageUrl,
    sourceEventId: value("UID"),
    description,
    startsAt,
    isCancelled: isCancelledEvent(title, description, status) || status?.toLowerCase() === "cancelled",
    openingTimes,
    venue,
    category: classifyEvent(`${title} ${description ?? ""}`),
    ...metadata,
  }, detectEventContentLanguage(calendar, pageUrl));
}

function pageVenue(html: string): string | undefined {
  const eventLocation = html.match(/<(?:div|span|p)\b[^>]*class=["'][^"']*playlist-item__location__link[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i);
  const address = html.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i)
    ?? html.match(/<(?:div|span|p)\b[^>]*(?:itemprop=["'](?:location|venue)["']|class=["'][^"']*(?:venue|location)[^"']*)[^>]*>([\s\S]*?)<\/(?:div|span|p)>/i);
  const detectedVenue = shorten(eventLocation?.[1] ?? address?.[1] ?? address?.[2], 180);
  return detectedVenue && !/^(walking|spazieren)$/i.test(detectedVenue)
    ? detectedVenue
    : pageCalendarField(html, "LOCATION") ?? detectedVenue;
}

function preferredVenue(...values: Array<string | undefined>): string | undefined {
  const present = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  const usable = present.filter((value) => !/^(walking|spazieren)$/i.test(value));
  if (usable.length === 0) return present[0];
  const score = (value: string) => {
    const hasHaagEvidence = /\b(den haag|the hague|scheveningen|kijkduin|loosduinen|leyweg|strandslag\s*8|kneuterdijk|elandstraat\s*47|25\d{2}[a-z]{2})\b/i.test(value);
    return (hasHaagEvidence ? 1_000 : 0) + Math.min(value.length, 240);
  };
  return usable.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best);
}

function pageOpeningTimes(html: string): string | undefined {
  const values = [
    ...html.matchAll(/<(?:meta|time|div|span|p)\b([^>]*)>/gi),
  ].map((match) => {
    const attributes = match[1];
    if (!/(opening|hours|opening-hours|event-time|start-time)/i.test(attributes)) return "";
    return attributes.match(/\b(?:content|datetime|data-opening-hours|data-event-time|data-start-time)=["']([^"']+)["']/i)?.[1] ?? "";
  }).filter(Boolean);
  const calendarTimes: string[] = [];
  for (const match of html.matchAll(/data:text\/calendar[^,]*,([A-Za-z0-9+/=]+)/gi)) {
    try {
      const calendar = Buffer.from(match[1], "base64").toString("utf8");
      const start = calendar.match(/^DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:\d{2})?(Z?)/m);
      const end = calendar.match(/^DTEND(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:\d{2})?(Z?)/m);
      if (start && end) {
        const localStart = calendarDateTime(start[1], start[2], start[3], start[4], start[5], start[6] === "Z");
        const localEnd = calendarDateTime(end[1], end[2], end[3], end[4], end[5], end[6] === "Z");
        calendarTimes.push(`${localStart.slice(11, 16)}-${localEnd.slice(11, 16)}`);
      }
    } catch {
      // A malformed calendar link should not make the page unusable.
    }
  }
  const result = calendarTimes.length > 0 ? calendarTimes : values;
  return result.length > 0 ? [...new Set(result)].join(" · ").slice(0, 240) : undefined;
}

function linkCandidatesFromPage(
  html: string,
  pageUrl: string,
  source: SourceDefinition,
): {
  candidates: SourceScanEvent[];
  indexLinks: CrawlPage[];
  sitemapLinks: CrawlPage[];
  calendarLinks: CrawlPage[];
  linksExamined: number;
} {
  const candidates: SourceScanEvent[] = [];
  const indexLinks: CrawlPage[] = [];
  const sitemapLinks: CrawlPage[] = [];
  const calendarLinks: CrawlPage[] = [];
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
    if (/\.ics(?:\?|$)/i.test(url) && !seen.has(url)) {
      seen.add(url);
      calendarLinks.push({ url, depth: 0, type: "detail", fallbackTitle: title });
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
    candidates.push({
      title,
      url,
      isCancelled: isCancellationText(title),
      category: classifyEvent(title),
    });
    if (candidates.length >= MAX_EVENTS_PER_SOURCE) break;
  }
  return { candidates, indexLinks, sitemapLinks, calendarLinks, linksExamined };
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
  const calendarEvent = calendarEventFromText(html, pageUrl, source);
  if (calendarEvent) return calendarEvent;
  const title = pageTitle(html) ?? fallbackTitle;
  if (!title) return null;
  const description = pageDescription(html);
  const priceEvidence = eventPriceEvidenceFromHtml(html);
  const baseMetadata = eventMetadata(`${title} ${description ?? ""}`, source);
  const dedicatedPrice = priceEvidence.dedicated
    ? parseVisibleEventPrice(priceEvidence.dedicated)
    : { priceType: "unknown" as const };
  const boundedPrice = priceEvidence.bounded
    ? parseVisibleEventPrice(priceEvidence.bounded)
    : { priceType: "unknown" as const };
  const reliablePrice = dedicatedPrice.priceType !== "unknown"
    ? dedicatedPrice
    : boundedPrice.priceType !== "unknown"
      ? boundedPrice
      : baseMetadata;
  const metadata = {
    ...baseMetadata,
    priceType: reliablePrice.priceType,
    priceText: reliablePrice.priceText,
  };
  return withLocalizedEventCopy({
    title,
    url: pageUrl,
    sourceEventId: pageCalendarField(html, "UID"),
    description,
    startsAt: pageDate(html),
    isCancelled: isCancelledEvent(title, description),
    openingTimes: pageOpeningTimes(html),
    venue: pageVenue(html),
    category: classifyEvent(`${title} ${description ?? ""}`),
    ...metadata,
  }, detectEventContentLanguage(html, pageUrl));
}

export function deduplicateSourceEvents(events: SourceScanEvent[]): SourceScanEvent[] {
  const winners = new Map<string, SourceScanEvent>();
  const withoutCalendarId: SourceScanEvent[] = [];
  const preference = (event: SourceScanEvent) => {
    const language = /\/en\//.test(event.url) ? 2 : /\/nl\//.test(event.url) ? 1 : 0;
    return language * 10 + Number(Boolean(event.venue)) + Number(Boolean(event.startsAt));
  };

  for (const event of events) {
    if (!event.sourceEventId) {
      withoutCalendarId.push(event);
      continue;
    }
    const existing = winners.get(event.sourceEventId);
    if (!existing) {
      winners.set(event.sourceEventId, event);
      continue;
    }
    const preferred = preference(event) > preference(existing) ? event : existing;
    const alternate = preferred === event ? existing : event;
    winners.set(event.sourceEventId, {
      ...preferred,
      isCancelled: Boolean(preferred.isCancelled || alternate.isCancelled),
      titleNl: preferred.titleNl ?? alternate.titleNl,
      descriptionNl: preferred.descriptionNl ?? alternate.descriptionNl,
      titleEn: preferred.titleEn ?? alternate.titleEn,
      descriptionEn: preferred.descriptionEn ?? alternate.descriptionEn,
    });
  }
  return [...withoutCalendarId, ...winners.values()];
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

type PublicationStatus = "eligible" | PublicationReason;

function isForeignLocation(event: SourceScanEvent): boolean {
  const evidence = `${event.title} ${event.venue ?? ""} ${event.description ?? ""}`;
  if (/\b(abroad|foreign|buitenland|belg(?:ium|ië)|germany|duitsland|france|frankrijk|spain|spanje|united kingdom|england|london|paris|brussels|brussel|antwerp|antwerpen|berlin|barcelona|rome|new york)\b/i.test(evidence)) {
    return true;
  }
  if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return false;
  return event.lat! < 50.7 || event.lat! > 53.6 || event.lng! < 3.2 || event.lng! > 7.3;
}

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
  const evidence = `${event.title} ${event.venue ?? ""} ${event.description ?? ""}`;
  if (/\b(den haag|the hague|scheveningen|kijkduin|loosduinen|leyweg|haagse markt|the hague market|strandslag\s*8|kneuterdijk|ultramarijn|elandstraat\s*47|25\d{2}\s?[a-z]{2})\b/i.test(evidence)) {
    return "eligible";
  }
  return isForeignLocation(event) ? "foreign_location" : "missing_locality";
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
    const publicationStatusForEvent = publicationStatus(event);
    const reviewStatus = publicationStatusForEvent === "eligible" ? "approved" : "pending_review";
    await db.insert(discoveredEventsTable).values({
      locationId: "dhg",
      sourceId: source.id,
      sourceName: source.name,
      canonicalUrl: event.url,
      title: event.title,
      description: event.description ?? `${source.name} activity listing.`,
      sourceLanguage: event.sourceLanguage ?? "unknown",
      titleNl: event.titleNl ?? null,
      descriptionNl: event.descriptionNl ?? null,
      titleEn: event.titleEn ?? null,
      descriptionEn: event.descriptionEn ?? null,
      startsAt: event.startsAt ?? null,
      isCancelled: event.isCancelled ?? false,
      openingTimes: event.openingTimes ?? null,
      venue: event.venue ?? null,
      category: event.category ?? "Entertainment",
      sourceGroup: event.sourceGroup ?? source.sourceGroup,
      organizer: event.organizer ?? null,
      activityKind: event.activityKind ?? null,
      priceType: event.priceType ?? "unknown",
      priceText: event.priceText ?? null,
      mealType: event.mealType ?? null,
      audience: event.audience ?? null,
      neighborhood: event.neighborhood ?? null,
      recurrenceText: event.recurrenceText ?? null,
      isIndoor: event.isIndoor ?? null,
      ...coordinates,
      reviewStatus,
      reviewReason: publicationStatusForEvent === "eligible" ? null : publicationStatusForEvent,
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: discoveredEventsTable.canonicalUrl,
      set: {
        sourceId: source.id,
        sourceName: source.name,
        title: event.title,
        description: event.description ? sql`excluded.description` : sql`${discoveredEventsTable.description}`,
        sourceLanguage: event.sourceLanguage ?? "unknown",
        titleNl: event.titleNl ? sql`excluded.title_nl` : sql`${discoveredEventsTable.titleNl}`,
        descriptionNl: event.descriptionNl ? sql`excluded.description_nl` : sql`${discoveredEventsTable.descriptionNl}`,
        titleEn: event.titleEn ? sql`excluded.title_en` : sql`${discoveredEventsTable.titleEn}`,
        descriptionEn: event.descriptionEn ? sql`excluded.description_en` : sql`${discoveredEventsTable.descriptionEn}`,
        startsAt: event.startsAt ? sql`excluded.starts_at` : sql`${discoveredEventsTable.startsAt}`,
        isCancelled: event.isCancelled !== undefined
          ? sql`excluded.is_cancelled`
          : sql`${discoveredEventsTable.isCancelled}`,
        openingTimes: event.openingTimes ? sql`excluded.opening_times` : sql`${discoveredEventsTable.openingTimes}`,
        venue: event.venue ? sql`excluded.venue` : sql`${discoveredEventsTable.venue}`,
        category: event.category ?? "Entertainment",
        sourceGroup: event.sourceGroup ?? source.sourceGroup,
        organizer: event.organizer ? sql`excluded.organizer` : sql`${discoveredEventsTable.organizer}`,
        activityKind: event.activityKind ? sql`excluded.activity_kind` : sql`${discoveredEventsTable.activityKind}`,
        priceType: event.priceType && event.priceType !== "unknown"
          ? sql`excluded.price_type`
          : sql`${discoveredEventsTable.priceType}`,
        priceText: event.priceText ? sql`excluded.price_text` : sql`${discoveredEventsTable.priceText}`,
        mealType: event.mealType ? sql`excluded.meal_type` : sql`${discoveredEventsTable.mealType}`,
        audience: event.audience ? sql`excluded.audience` : sql`${discoveredEventsTable.audience}`,
        neighborhood: event.neighborhood ? sql`excluded.neighborhood` : sql`${discoveredEventsTable.neighborhood}`,
        recurrenceText: event.recurrenceText ? sql`excluded.recurrence_text` : sql`${discoveredEventsTable.recurrenceText}`,
        isIndoor: event.isIndoor !== undefined ? sql`excluded.is_indoor` : sql`${discoveredEventsTable.isIndoor}`,
        lat: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.lat}`
          : sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN excluded.lat ELSE ${discoveredEventsTable.lat} END`,
        lng: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.lng}`
          : sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN excluded.lng ELSE ${discoveredEventsTable.lng} END`,
        x: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.x}`
          : sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN excluded.x ELSE ${discoveredEventsTable.x} END`,
        y: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.y}`
          : sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN excluded.y ELSE ${discoveredEventsTable.y} END`,
        isApproximateLocation: coordinates.isApproximateLocation
          ? sql`${discoveredEventsTable.isApproximateLocation}`
          : sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN false ELSE ${discoveredEventsTable.isApproximateLocation} END`,
        reviewStatus: sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN ${reviewStatus} ELSE ${discoveredEventsTable.reviewStatus} END`,
        reviewReason: sql`CASE WHEN ${discoveredEventsTable.reviewedAt} IS NULL THEN ${publicationStatusForEvent === "eligible" ? null : publicationStatusForEvent} ELSE ${discoveredEventsTable.reviewReason} END`,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
  }

  const persistedEvents = await db
    .select()
    .from(discoveredEventsTable)
    .where(inArray(discoveredEventsTable.canonicalUrl, urls));
  queueMissingEventTranslations(persistedEvents, "nl");
  queueMissingEventTranslations(persistedEvents, "en");

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

    const pageLanguage = detectEventContentLanguage(page.html, page.url);
    const structured = structuredEventsFromPage(page.html, page.url, source)
      .map((event) => withLocalizedEventCopy(event, pageLanguage));
    const linked = linkCandidatesFromPage(page.html, page.url, source);
    metrics.eventLinksRead += linked.linksExamined;

    for (const event of structured) {
      const existing = captured.get(event.url);
      captured.set(event.url, {
        ...existing,
        ...event,
        startsAt: event.startsAt ?? existing?.startsAt,
        isCancelled: Boolean(event.isCancelled || existing?.isCancelled),
        openingTimes: event.openingTimes ?? existing?.openingTimes,
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
          startsAt: extracted.startsAt ?? existing?.startsAt,
          isCancelled: Boolean(extracted.isCancelled || existing?.isCancelled),
          openingTimes: extracted.openingTimes ?? existing?.openingTimes,
          venue: preferredVenue(extracted.venue, existing?.venue),
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
      for (const calendarPage of linked.calendarLinks) enqueue(calendarPage);
      for (const event of linked.candidates) {
        if (!captured.has(event.url)) captured.set(event.url, event);
        enqueue({ url: event.url, depth: next.depth + 1, type: "detail", fallbackTitle: event.title });
      }
    }
  }

  if (visited.size >= MAX_PAGES_PER_SOURCE && queue.length > 0) {
    metrics.pagesSkipped += queue.length;
  }

  let events = [...captured.values()].slice(0, MAX_EVENTS_PER_SOURCE);
  const rescueIndexes = events
    .map((event, index) => ({ event, index }))
    .map(({ event, index }) => ({ event, index, status: publicationStatus(event) }))
    .filter(({ status }) => status === "missing_locality" || status === "missing_date")
    .sort((left, right) => (left.status === "missing_locality" ? -1 : 1) - (right.status === "missing_locality" ? -1 : 1))
    .slice(0, MAX_LOCALITY_RESCUES_PER_SOURCE)
    .map(({ index }) => index);
  for (let batchStart = 0; batchStart < rescueIndexes.length; batchStart += LOCALITY_RESCUE_CONCURRENCY) {
    await Promise.all(rescueIndexes.slice(batchStart, batchStart + LOCALITY_RESCUE_CONCURRENCY).map(async (index) => {
      const event = events[index];
      const detail = await fetchApprovedPage(event.url, source, robotsRules);
      if ("error" in detail) {
        if (!detail.robotsDisallowed) metrics.pagesFailed += 1;
        return;
      }
      metrics.pagesRead += 1;
      metrics.detailPagesRead += 1;
      const structured = structuredEventsFromPage(detail.html, detail.url, source)
        .find((candidate) => candidate.url === event.url);
      const extracted = htmlEventFromPage(detail.html, detail.url, source, event.title);
       const enriched = structured ?? extracted;
      if (!enriched) return;
      events[index] = {
        ...event,
        ...enriched,
        title: event.title || enriched.title,
        url: event.url,
        sourceEventId: extracted?.sourceEventId ?? structured?.sourceEventId ?? event.sourceEventId,
        startsAt: extracted?.startsAt ?? structured?.startsAt ?? event.startsAt,
        isCancelled: Boolean(extracted?.isCancelled || structured?.isCancelled || event.isCancelled),
        openingTimes: extracted?.openingTimes ?? structured?.openingTimes ?? event.openingTimes,
        venue: preferredVenue(extracted?.venue, structured?.venue, event.venue),
        description: enriched.description ?? event.description,
        organizer: enriched.organizer ?? event.organizer,
        sourceGroup: enriched.sourceGroup ?? event.sourceGroup,
        activityKind: enriched.activityKind ?? event.activityKind,
         priceType: structured?.priceType !== "unknown"
           ? structured?.priceType
           : extracted?.priceType !== "unknown"
             ? extracted?.priceType
             : event.priceType,
         priceText: structured?.priceText ?? extracted?.priceText ?? event.priceText,
        mealType: enriched.mealType ?? event.mealType,
        audience: enriched.audience ?? event.audience,
        neighborhood: enriched.neighborhood ?? event.neighborhood,
        recurrenceText: enriched.recurrenceText ?? event.recurrenceText,
        lat: enriched.lat ?? event.lat,
        lng: enriched.lng ?? event.lng,
      };
    }));
  }
  events = deduplicateSourceEvents(events);
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
    } else if (status === "missing_locality") {
      metrics.eventsMissingLocality += 1;
    } else {
      metrics.eventsForeignLocation += 1;
    }
  }
  metrics.eventsSkipped = events.length - publishableEvents.length;
  metrics.crawlLimitReached ||= queue.length > 0 || visited.size >= MAX_PAGES_PER_SOURCE || captured.size >= MAX_EVENTS_PER_SOURCE;

  if (events.length > 0) {
    try {
      Object.assign(metrics, await persistEvents(source, events));
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
        : `${metrics.eventsCaptured} event${metrics.eventsCaptured === 1 ? "" : "s"} captured from ${metrics.indexPagesRead} calendar/index page${metrics.indexPagesRead === 1 ? "" : "s"} and ${metrics.detailPagesRead} detail page${metrics.detailPagesRead === 1 ? "" : "s"}; ${metrics.eventsEligible} eligible, ${metrics.eventsAdded} added, and ${metrics.eventsUpdated} updated in the Den Haag activity list.${events.length > publishableEvents.length ? ` ${metrics.eventsMissingDate} lacked a date, ${metrics.eventsOutOfWindow} were outside the upcoming window, ${metrics.eventsMissingLocality} lacked verified Den Haag evidence, and ${metrics.eventsForeignLocation} had a foreign location.` : ""}${status === "partial" ? " Some pages could not be read or a safe crawl limit was reached." : ""}`;

  return {
    sourceId: source.id,
    sourceName: source.name,
    scannedUrl: source.activityUrl,
    status,
    events: events.map((event) => {
      const reason = publicationStatus(event);
      return { ...event, reviewReason: reason === "eligible" ? undefined : reason };
    }),
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

function parseReviewId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isFutureReviewDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return false;
  const timestamp = Date.parse(value.length === 10 ? `${value}T23:59:59` : value);
  if (!Number.isFinite(timestamp)) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const latest = new Date(now);
  latest.setMonth(latest.getMonth() + 18);
  return timestamp >= today && timestamp <= latest.getTime();
}

function isValidHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function reviewItem(event: typeof discoveredEventsTable.$inferSelect) {
  return {
    id: event.id,
    title: event.title,
    sourceName: event.sourceName,
    sourceUrl: event.canonicalUrl,
    description: event.description,
    startsAt: event.startsAt,
    venue: event.venue,
    category: event.category,
    sourceGroup: event.sourceGroup,
    organizer: event.organizer,
    activityKind: event.activityKind,
    priceType: event.priceType,
    priceText: event.priceText,
    mealType: event.mealType,
    audience: event.audience,
    neighborhood: event.neighborhood,
    recurrenceText: event.recurrenceText,
    lat: event.lat,
    lng: event.lng,
    status: event.reviewStatus,
    reason: event.reviewReason,
    evidenceUrl: event.reviewEvidenceUrl,
    firstSeenAt: event.firstSeenAt.toISOString(),
    lastSeenAt: event.lastSeenAt.toISOString(),
    reviewedAt: event.reviewedAt?.toISOString() ?? null,
  };
}

router.get("/review", requireEditor, async (req, res) => {
  const requestedStatus = String(req.query.status ?? "all");
  const statuses = requestedStatus === "open"
    ? ["pending_review"]
    : requestedStatus === "rejected"
      ? ["rejected"]
      : ["pending_review", "rejected"];
  const events = await db
    .select()
    .from(discoveredEventsTable)
    .where(and(
      eq(discoveredEventsTable.locationId, "dhg"),
      inArray(discoveredEventsTable.reviewStatus, statuses),
    ))
    .orderBy(
      asc(discoveredEventsTable.reviewStatus),
      desc(discoveredEventsTable.lastSeenAt),
      asc(discoveredEventsTable.title),
    );
  res.json({
    items: events.map(reviewItem),
    counts: {
      pending: events.filter((event) => event.reviewStatus === "pending_review").length,
      rejected: events.filter((event) => event.reviewStatus === "rejected").length,
    },
  });
});

router.patch("/review/:id", requireEditor, async (req, res) => {
  const id = parseReviewId(req.params.id);
  const decision = req.body?.decision;
  if (!id || (decision !== "approve" && decision !== "reject")) {
    res.status(400).json({ error: "A valid event id and approve/reject decision are required." });
    return;
  }

  const [existing] = await db
    .select()
    .from(discoveredEventsTable)
    .where(and(eq(discoveredEventsTable.id, id), eq(discoveredEventsTable.locationId, "dhg")))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Review candidate not found." });
    return;
  }
  if (existing.reviewStatus !== "pending_review") {
    res.status(409).json({ error: "Only candidates awaiting review can be decided." });
    return;
  }

  const evidenceUrl = typeof req.body?.evidenceUrl === "string" ? req.body.evidenceUrl.trim() : "";
  if (decision === "reject") {
    const [updated] = await db.update(discoveredEventsTable)
      .set({
        reviewStatus: "rejected",
        reviewReason: "manual_rejection",
        reviewEvidenceUrl: isValidHttpUrl(evidenceUrl) ? evidenceUrl : null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(discoveredEventsTable.id, id),
        eq(discoveredEventsTable.locationId, "dhg"),
        eq(discoveredEventsTable.reviewStatus, "pending_review"),
      ))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "This candidate has already received an editorial decision." });
      return;
    }
    res.json({ item: reviewItem(updated) });
    return;
  }

  const startsAt = typeof req.body?.startsAt === "string" ? req.body.startsAt.trim() : "";
  const venue = typeof req.body?.venue === "string" ? req.body.venue.trim() : "";
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (
    !isFutureReviewDate(startsAt)
    || !venue
    || !Number.isFinite(lat)
    || !Number.isFinite(lng)
    || lat < DEN_HAAG_BOUNDS.south || lat > DEN_HAAG_BOUNDS.north
    || lng < DEN_HAAG_BOUNDS.west || lng > DEN_HAAG_BOUNDS.east
    || !isValidHttpUrl(evidenceUrl)
  ) {
    res.status(400).json({
      error: "Approval requires a future date within 18 months, a Hague venue, Hague coordinates, and an HTTP(S) evidence link.",
    });
    return;
  }

  const x = ((lng - DEN_HAAG_BOUNDS.west) / (DEN_HAAG_BOUNDS.east - DEN_HAAG_BOUNDS.west)) * 100;
  const y = ((DEN_HAAG_BOUNDS.north - lat) / (DEN_HAAG_BOUNDS.north - DEN_HAAG_BOUNDS.south)) * 100;
  const [updated] = await db.update(discoveredEventsTable)
    .set({
      startsAt,
      venue,
      lat,
      lng,
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
      isApproximateLocation: false,
      reviewStatus: "approved",
      reviewReason: null,
      reviewEvidenceUrl: evidenceUrl,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(discoveredEventsTable.id, id),
      eq(discoveredEventsTable.locationId, "dhg"),
      eq(discoveredEventsTable.reviewStatus, "pending_review"),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "This candidate has already received an editorial decision." });
    return;
  }
  res.json({ item: reviewItem(updated) });
});

export default router;

function removeHtmlSections(html: string, tagNames: string): string {
  return html.replace(new RegExp(`<(${tagNames})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi"), " ");
}

export function eventPriceEvidenceFromHtml(html: string): { dedicated?: string; bounded?: string } {
  const safe = removeHtmlSections(html, "script|style|noscript|template|svg|nav|footer|aside");
  const withoutRecommendations = safe.replace(
    /<(section|div)\b[^>]*(?:id|class)=["'][^"']*(?:recommend|related|suggest|also-like|other-events|more-events)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  const eventContent = withoutRecommendations.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? withoutRecommendations.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? "";
  const dedicated: string[] = [];
  for (const match of eventContent.matchAll(
    /<(?:div|span|p|li|dd)\b[^>]*(?:itemprop=["']price["']|(?:id|class)=["'][^"']*(?:price|pricing|ticket-price|admission)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|span|p|li|dd)>/gi,
  )) {
    const value = stripMarkup(match[1]);
    if (value) dedicated.push(value);
    if (dedicated.length >= 8) break;
  }
  for (const match of eventContent.matchAll(
    /<(?:dt|th|strong|b)\b[^>]*>\s*(?:price|prijs|cost|kosten|admission|toegang)\s*:?\s*<\/(?:dt|th|strong|b)>\s*<(?:dd|td|span|p|div)\b[^>]*>([\s\S]*?)<\/(?:dd|td|span|p|div)>/gi,
  )) {
    const value = stripMarkup(match[1]);
    if (value) dedicated.push(value);
    if (dedicated.length >= 8) break;
  }
  return {
    dedicated: dedicated.length > 0 ? dedicated.join(" · ").slice(0, 1_200) : undefined,
    bounded: eventContent ? stripMarkup(eventContent).slice(0, 8_000) : undefined,
  };
}

export function parseVisibleEventPrice(evidence: string): ParsedPrice {
  const clean = stripMarkup(evidence).replace(/\s+/g, " ").trim();
  if (!clean) return { priceType: "unknown" };

  const amount = String.raw`\d+(?:[,.]\d{1,2})?`;
  const range = clean.match(new RegExp(
    String.raw`€\s*(${amount})\s*(?:-|–|—|−|tot|to)\s*(?:€\s*)?(${amount})`,
    "i",
  ));
  if (range) {
    return {
      priceType: "paid",
      priceText: `${formatPriceAmount(range[1])}–${formatPriceAmount(range[2], "")}`,
    };
  }

  const from = clean.match(new RegExp(String.raw`\b(vanaf|from)\s*:?\s*€\s*(${amount})`, "i"));
  if (from) {
    const label = from[1].toLowerCase() === "vanaf" ? "Vanaf" : "From";
    return { priceType: "paid", priceText: `${label} ${formatPriceAmount(from[2])}` };
  }

  const exact = clean.match(new RegExp(String.raw`€\s*(${amount})`, "i"));
  if (exact) return { priceType: "paid", priceText: formatPriceAmount(exact[1]) };
  if (/\b(?:gratis|free(?:\s+admission|\s+entry)?)\b/i.test(clean)) {
    return { priceType: "free", priceText: /\bgratis\b/i.test(clean) ? "Gratis" : "Free" };
  }
  return { priceType: "unknown" };
}
