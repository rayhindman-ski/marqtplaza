import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localizedEventDetails, parseEventLanguage } from "./listings";

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
});