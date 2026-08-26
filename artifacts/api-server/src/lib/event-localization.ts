import { eq } from "drizzle-orm";
import { db, discoveredEventsTable, type DiscoveredEvent } from "@workspace/db";
import { logger } from "./logger.js";

export type EventLanguage = "nl" | "en";

type TranslationResult = {
  id: number;
  title: string;
  description: string;
};

const translationFlights = new Map<string, Promise<Map<number, TranslationResult>>>();
const translationBackoffUntil = new Map<string, number>();
const TRANSLATION_BACKOFF_MS = 5 * 60 * 1000;
const TRANSLATION_BUDGET_WINDOW_MS = 10 * 60 * 1000;
const TRANSLATION_BUDGET_MAX_ATTEMPTS = 8;
let translationBudgetWindowStartedAt = 0;
let translationBudgetAttempts = 0;

function reserveTranslationAttempt(): boolean {
  const now = Date.now();
  if (now - translationBudgetWindowStartedAt >= TRANSLATION_BUDGET_WINDOW_MS) {
    translationBudgetWindowStartedAt = now;
    translationBudgetAttempts = 0;
  }
  if (translationBudgetAttempts >= TRANSLATION_BUDGET_MAX_ATTEMPTS) return false;
  translationBudgetAttempts += 1;
  return true;
}

function localizedCopy(event: DiscoveredEvent, language: EventLanguage) {
  return language === "nl"
    ? { title: event.titleNl, description: event.descriptionNl }
    : { title: event.titleEn, description: event.descriptionEn };
}

function cleanTranslation(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.slice(0, maxLength);
}

async function translateChunk(
  events: DiscoveredEvent[],
  language: EventLanguage,
): Promise<Map<number, TranslationResult>> {
  if (!reserveTranslationAttempt()) {
    logger.warn("Event translation attempt budget exhausted; returning safe event copy");
    return new Map();
  }
  let openai: typeof import("@workspace/integrations-openai-ai-server").openai;
  try {
    ({ openai } = await import("@workspace/integrations-openai-ai-server"));
  } catch (error) {
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
    }, "OpenAI integration unavailable; returning safe event copy");
    return new Map();
  }
  const target = language === "nl" ? "Dutch" : "English";
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    response_format: { type: "json_object" },
    max_completion_tokens: 5000,
    messages: [
      {
        role: "system",
        content: `Translate event card copy into ${target}. Return JSON only as {"translations":[{"id":number,"title":string,"description":string}]}. Translate generic event names naturally (for example Bauernmarkt means farmers' market). Preserve brand names, venue names, organizer names, addresses, dates, prices and URLs exactly. Never return German unless it is a proper name.`,
      },
      {
        role: "user",
        content: JSON.stringify(events.map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          sourceLanguage: event.sourceLanguage,
          sourceName: event.sourceName,
          venue: event.venue,
          organizer: event.organizer,
        }))),
      },
    ],
  }, { signal: AbortSignal.timeout(8_000) });
  const content = response.choices[0]?.message.content;
  if (!content) return new Map();
  const parsed = JSON.parse(content) as { translations?: unknown };
  if (!Array.isArray(parsed.translations)) return new Map();
  const results = new Map<number, TranslationResult>();
  const requestedIds = new Set(events.map((event) => event.id));
  for (const candidate of parsed.translations) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = Number(record.id);
    const title = cleanTranslation(record.title, 220);
    const description = cleanTranslation(record.description, 520);
    if (requestedIds.has(id) && Number.isInteger(id) && title && description) {
      results.set(id, { id, title, description });
    }
  }
  return results;
}

async function translateMissingEvents(
  events: DiscoveredEvent[],
  language: EventLanguage,
): Promise<Map<number, TranslationResult>> {
  const key = `${language}:${events.map((event) => event.id).sort((left, right) => left - right).join(",")}`;
  if ((translationBackoffUntil.get(key) ?? 0) > Date.now()) return new Map();
  const existingFlight = translationFlights.get(key);
  if (existingFlight) return existingFlight;

  const flight = (async () => {
    const translated = new Map<number, TranslationResult>();
    for (let offset = 0; offset < events.length; offset += 16) {
      const chunk = events.slice(offset, offset + 16);
      try {
        const chunkResults = await translateChunk(chunk, language);
        for (const [id, result] of chunkResults) translated.set(id, result);
      } catch (error) {
        logger.warn({
          err: error instanceof Error ? error.message : String(error),
          language,
          count: chunk.length,
        }, "Event translation batch failed; using localized safe copy");
      }
    }
    if (translated.size === 0) {
      translationBackoffUntil.set(key, Date.now() + TRANSLATION_BACKOFF_MS);
    } else {
      translationBackoffUntil.delete(key);
    }
    return translated;
  })().finally(() => {
    translationFlights.delete(key);
  });
  translationFlights.set(key, flight);
  return flight;
}

export async function ensureLocalizedEventCopy(
  events: DiscoveredEvent[],
  language: EventLanguage,
): Promise<DiscoveredEvent[]> {
  const missing = events.filter((event) => {
    const copy = localizedCopy(event, language);
    return !copy.title || !copy.description;
  });
  if (missing.length > 0) queueMissingEventTranslations(missing, language);
  return selectEventsWithLocalizedCopy(events, language);
}

export function selectEventsWithLocalizedCopy(
  events: DiscoveredEvent[],
  language: EventLanguage,
): DiscoveredEvent[] {
  return events.filter((event) => {
    const copy = localizedCopy(event, language);
    return Boolean(copy.title && copy.description);
  });
}

export function eventCopyForLanguage(event: DiscoveredEvent, language: EventLanguage) {
  const copy = localizedCopy(event, language);
  if (!copy.title || !copy.description) {
    throw new Error(`Event ${event.id} has no complete ${language} copy`);
  }
  return {
    title: copy.title,
    description: copy.description,
  };
}

export function queueMissingEventTranslations(
  events: DiscoveredEvent[],
  language: EventLanguage,
): void {
  const missing = events.filter((event) => {
    const copy = localizedCopy(event, language);
    return !copy.title || !copy.description;
  });
  if (missing.length === 0) return;
  void translateMissingEvents(missing, language)
    .then(async (translated) => {
      await Promise.all(missing.map(async (event) => {
        const result = translated.get(event.id);
        if (!result) return;
        const set = language === "nl"
          ? { titleNl: result.title, descriptionNl: result.description, updatedAt: new Date() }
          : { titleEn: result.title, descriptionEn: result.description, updatedAt: new Date() };
        await db.update(discoveredEventsTable)
          .set(set)
          .where(eq(discoveredEventsTable.id, event.id));
      }));
    })
    .catch((error) => {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        language,
        count: missing.length,
      }, "Background event translation failed");
    });
}