import { Router } from "express";

const router = Router();

type SourceDefinition = {
  id: string;
  name: string;
  activityUrl: string;
};

type SourceScanEvent = {
  title: string;
  url: string;
  context?: string;
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
  "festival", "concert", "workshop", "markt", "theater", "tentoonstelling",
  "expositie", "expo", "tour", "show", "what's on", "things to do",
];
const NAVIGATION_LINK_TITLES = new Set([
  "nederlands", "english", "frans", "deutsch", "skip filters", "skip to content",
  "excursions & activities", "activities", "agenda", "calendar", "events",
]);

function stripMarkup(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
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

function extractEventLinks(html: string, baseUrl: string): SourceScanEvent[] {
  const page = html
    .slice(0, 600_000)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const events: SourceScanEvent[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of page.matchAll(anchorPattern)) {
    const title = stripMarkup(match[2]);
    const searchable = `${title} ${match[1]}`.toLowerCase();
    if (title.length < 4 || title.length > 180 || !EVENT_TERMS.some((term) => searchable.includes(term))) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(match[1], baseUrl);
    } catch {
      continue;
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      seen.has(url.href) ||
      url.hash ||
      NAVIGATION_LINK_TITLES.has(title.toLowerCase()) ||
      url.href.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")
    ) {
      continue;
    }
    seen.add(url.href);
    events.push({ title, url: url.href });
    if (events.length >= 12) break;
  }

  return events;
}

async function scanSource(source: SourceDefinition) {
  try {
    const response = await fetch(source.activityUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "marqtplaza.com/1.0 (Den Haag activity source scanner)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const blocked = response.status === 401 || response.status === 403 || response.status === 429;
      return {
        sourceId: source.id,
        sourceName: source.name,
        scannedUrl: source.activityUrl,
        status: blocked ? "blocked" : "error",
        events: [] as SourceScanEvent[],
        message: blocked
          ? `The source denied automated access (HTTP ${response.status}).`
          : `The source returned HTTP ${response.status}.`,
      };
    }

    const events = extractEventLinks(await response.text(), source.activityUrl);
    return {
      sourceId: source.id,
      sourceName: source.name,
      scannedUrl: source.activityUrl,
      status: events.length > 0 ? "found" : "no_events",
      events,
      message: events.length > 0
        ? `${events.length} event link${events.length === 1 ? "" : "s"} found.`
        : "The page loaded, but no event-like links were detected.",
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The source took too long to respond."
      : "The source could not be reached from the scanner.";
    return {
      sourceId: source.id,
      sourceName: source.name,
      scannedUrl: source.activityUrl,
      status: "error",
      events: [] as SourceScanEvent[],
      message,
    };
  }
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
  for (let index = 0; index < selectedSources.length; index += 4) {
    const batch = selectedSources.slice(index, index + 4);
    scans.push(...await Promise.all(batch.map(scanSource)));
  }

  res.json({ scannedAt: new Date().toISOString(), scans });
});

export default router;