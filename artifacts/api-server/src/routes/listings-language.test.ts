import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiscoveredEvent } from "@workspace/db";

import { localizedEventDetails, parseEventLanguage } from "./listings";
import { selectEventsWithLocalizedCopy } from "../lib/event-localization";

const event = {
  startsAt: "2026-08-26T10:00:00",
  openingTimes: "10:00–18:00",
  venue: null,
  isApproximateLocation: true,
} as Parameters<typeof localizedEventDetails>[0];

describe("event listings language", () => {
  it("only accepts supported user languages", () => {
    assert.equal(parseEventLanguage("en"), "en");
    assert.equal(parseEventLanguage("nl"), "nl");
    assert.equal(parseEventLanguage("de"), null);
    assert.equal(parseEventLanguage(undefined), null);
  });

  it("localizes generated event details", () => {
    const english = localizedEventDetails(event, "en");
    assert.match(english, /Opening times/);
    assert.match(english, /Venue not provided/);
    assert.match(english, /The Hague city centre/);

    const dutch = localizedEventDetails(event, "nl");
    assert.match(dutch, /Openingstijden/);
    assert.match(dutch, /Locatie niet beschikbaar/);
    assert.match(dutch, /centrum van Den Haag/);
  });

  it("does not expose generic source-language schedule or route labels", () => {
    const rawSourceCopy = {
      ...event,
      openingTimes: "Jeden Mittwoch von 10:00 bis 18:00 Uhr",
      venue: "walking",
    } as Parameters<typeof localizedEventDetails>[0];
    const english = localizedEventDetails(rawSourceCopy, "en");
    assert.doesNotMatch(english, /Jeden|walking/);
    assert.match(english, /See event page/);
    assert.match(english, /Venue not provided/);
  });

  it("never publishes placeholder cards when more than 32 events still need translation", () => {
    const events = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      title: `Bron-evenement ${index + 1}`,
      description: `Bronbeschrijving ${index + 1}`,
      titleEn: index < 7 ? `Event ${index + 1}` : null,
      descriptionEn: index < 7 ? `Description ${index + 1}` : null,
    })) as DiscoveredEvent[];
    const publishable = selectEventsWithLocalizedCopy(events, "en");
    assert.equal(publishable.length, 7);
    assert.ok(publishable.every((item) => item.titleEn && item.descriptionEn));
    assert.ok(publishable.every((item) => item.titleEn !== "Local event"));
  });
});