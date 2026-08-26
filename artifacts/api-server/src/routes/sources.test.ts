import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eventMetadata, type SourceDefinition } from "./sources";

const source: SourceDefinition = {
  id: "test-events",
  name: "Test events",
  activityUrl: "https://events.example.test",
  sourceGroup: "city-agenda",
};

describe("event price capture", () => {
  it("keeps a structured exact paid price", () => {
    const metadata = eventMetadata("Concert in Den Haag", source, {
      price: "12.50",
      priceCurrency: "EUR",
    });
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€12,5");
  });

  it("keeps a structured price range", () => {
    const metadata = eventMetadata("Festival in Den Haag", source, {
      lowPrice: 10,
      highPrice: 25,
      priceCurrency: "EUR",
    });
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€10–€25");
  });

  it("combines compatible offer tiers and prefers them over prose", () => {
    const metadata = eventMetadata("Early bird was €5", source, [
      { price: 15, priceCurrency: "EUR" },
      { price: 30, priceCurrency: "EUR" },
    ]);
    assert.equal(metadata.priceType, "paid");
    assert.equal(metadata.priceText, "€15–€30");
  });

  it("does not invent EUR when structured currency is absent or different", () => {
    assert.equal(
      eventMetadata("Ticketed event", source, { price: 12 }).priceText,
      "12",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, { price: 0, priceCurrency: "USD" }).priceText,
      "USD 0",
    );
  });

  it("never merges missing or different currencies into one range", () => {
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10, priceCurrency: "EUR" },
        { price: 20 },
      ]).priceText,
      "€10",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10 },
        { price: 20, priceCurrency: "USD" },
        { price: 30, priceCurrency: "EUR" },
      ]).priceText,
      "USD 20",
    );
    assert.equal(
      eventMetadata("Ticketed event", source, [
        { price: 10, priceCurrency: "USD" },
        { price: 20, priceCurrency: "EUR" },
      ]).priceText,
      "USD 10",
    );
  });

  it("captures free, from-price, and textual ranges", () => {
    assert.deepEqual(
      eventMetadata("Gratis toegang", source).priceText,
      "Gratis",
    );
    assert.equal(
      eventMetadata("Kaarten vanaf € 7,50", source).priceText,
      "vanaf € 7,50",
    );
    assert.equal(
      eventMetadata("Tickets €10 - €20", source).priceText,
      "€10 - €20",
    );
  });
});