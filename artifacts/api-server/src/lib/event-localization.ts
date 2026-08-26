import { eq } from "drizzle-orm";
import { db, discoveredEventsTable, type DiscoveredEvent } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger.js";

export type EventLanguage = "nl" | "en";

type TranslationResult = {
  id: number;
  title: string;
  description: string;
};

function localizedCopy(event: DiscoveredEvent, language: EventLanguage) {
  return language === "nl"
    ? { title: event.titleNl, description: event.descriptionNl }
    : { title: event.titleEn, description: event.descriptionEn };
}

function safeFallback(language: EventLanguage, sourceName: string) {
  return language === "nl"
    ? {
        title: "Lokaal evenement",
        description: `Bekijk de evenementpagina van ${sourceName} voor de volledige informatie.`,
      }
    : {
        title: "Local event",
        description: `View the ${sourceName} event page for full information.`,
      };
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
  const target = language === "nl" ? "Dutch" : "English";
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    response_format: { type: "json_object" },
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
  });
  const content = response.choices[0]?.message.content;
  if (!content) return new Map();
  const parsed = JSON.parse(content) as { translations?: unknown };
  if (!Array.isArray(parsed.translations)) return new Map();
  const results = new Map<number, TranslationResult>();
  for (const candidate of parsed.translations) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = Number(record.id);
    const title = cleanTranslation(record.title, 220);
    const description = cleanTranslation(record.description, 520);
    if (Number.isInteger(id) && title && description) {
      results.set(id, { id, title, description });
    }
  }
  return results;
}

export async function ensureLocalizedEventCopy(
  events: DiscoveredEvent[],
  language: EventLanguage,
): Promise<DiscoveredEvent[]> {
  const missing = events.filter((event) => {
    const copy = localizedCopy(event, language);
    return !copy.title || !copy.description;
  });
  if (missing.length === 0) return events;

  const translated = new Map<number, TranslationResult>();
  for (let offset = 0; offset < missing.length; offset += 16) {
    const chunk = missing.slice(offset, offset + 16);
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

  return Promise.all(events.map(async (event) => {
    const existing = localizedCopy(event, language);
    if (existing.title && existing.description) return event;
    const result = translated.get(event.id) ?? {
      id: event.id,
      ...safeFallback(language, event.sourceName),
    };
    const set = language === "nl"
      ? { titleNl: result.title, descriptionNl: result.description, updatedAt: new Date() }
      : { titleEn: result.title, descriptionEn: result.description, updatedAt: new Date() };
    await db.update(discoveredEventsTable)
      .set(set)
      .where(eq(discoveredEventsTable.id, event.id));
    return { ...event, ...set };
  }));
}

export function eventCopyForLanguage(event: DiscoveredEvent, language: EventLanguage) {
  const copy = localizedCopy(event, language);
  return {
    title: copy.title ?? safeFallback(language, event.sourceName).title,
    description: copy.description ?? safeFallback(language, event.sourceName).description,
  };
}