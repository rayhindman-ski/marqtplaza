import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowsExternalQueries,
  fetchOpenStreetMapBusinesses,
  normalizeNeighborhoods,
  normalizedListingsKey,
  parseAnonymousId,
  parseBusinessCategories,
  parseListingsMode,
  prepareEventsForMode,
  summarizeEventEvidence,
} from "./listings";

describe("listings query persistence inputs", () => {
  it("marks approved upcoming events as verified evidence", () => {
    const evidence = summarizeEventEvidence({
      language: "en",
      mode: "live",
      listings: [{ sourceName: "Amare", lastSeenAt: "2026-09-11T10:00:00.000Z" }],
      sourceStatuses: [{
        sourceId: "amare",
        sourceName: "Amare",
        status: "found",
        lastScannedAt: new Date("2026-09-11T10:00:00.000Z"),
      }],
      now: new Date("2026-09-11T12:00:00.000Z"),
    });
    assert.equal(evidence.status, "verified");
    assert.match(evidence.message, /verified upcoming event/);
    assert.equal(evidence.sources[0]?.status, "verified");
  });

  it("keeps blocked sources distinct from an intentional empty result", () => {
    const evidence = summarizeEventEvidence({
      language: "nl",
      mode: "live",
      listings: [],
      sourceStatuses: [
        {
          sourceId: "amare",
          sourceName: "Amare",
          status: "blocked",
          lastScannedAt: new Date("2026-09-11T10:00:00.000Z"),
        },
        {
          sourceId: "wijkz",
          sourceName: "Wijkz",
          status: "no_events",
          lastScannedAt: new Date("2026-09-11T10:00:00.000Z"),
        },
      ],
      now: new Date("2026-09-11T12:00:00.000Z"),
    });
    assert.equal(evidence.status, "blocked");
    assert.equal(evidence.sources[0]?.status, "blocked");
    assert.equal(evidence.sources[1]?.status, "empty");
  });

  it("reports a checked source with no eligible events as empty", () => {
    const evidence = summarizeEventEvidence({
      language: "en",
      mode: "live",
      listings: [],
      sourceStatuses: [{
        sourceId: "wijkz",
        sourceName: "Wijkz",
        status: "no_events",
        lastScannedAt: new Date("2026-09-11T10:00:00.000Z"),
      }],
      now: new Date("2026-09-11T12:00:00.000Z"),
    });
    assert.equal(evidence.status, "empty");
    assert.match(evidence.message, /no verified upcoming events/);
  });

  it("marks old stored evidence as stale", () => {
    const evidence = summarizeEventEvidence({
      language: "en",
      mode: "stored_only",
      listings: [{ sourceName: "Amare", lastSeenAt: "2026-09-09T10:00:00.000Z" }],
      sourceStatuses: [{
        sourceId: "amare",
        sourceName: "Amare",
        status: "found",
        lastScannedAt: new Date("2026-09-09T10:00:00.000Z"),
      }],
      now: new Date("2026-09-11T12:00:00.000Z"),
    });
    assert.equal(evidence.status, "stale");
    assert.match(evidence.message, /older than 24 hours/);
  });

  it("reports unavailable evidence when no scan status exists", () => {
    const evidence = summarizeEventEvidence({
      language: "en",
      mode: "live",
      listings: [],
      sourceStatuses: [],
    });
    assert.equal(evidence.status, "unavailable");
  });

  it("defaults to live and only permits stored_only explicitly", () => {
    assert.equal(parseListingsMode(undefined), "live");
    assert.equal(parseListingsMode("live"), "live");
    assert.equal(parseListingsMode("stored_only"), "stored_only");
    assert.equal(parseListingsMode("unexpected"), "live");
  });

  it("never allows external provider work in stored-only mode", () => {
    assert.equal(allowsExternalQueries("live"), true);
    assert.equal(allowsExternalQueries("stored_only"), false);
  });

  it("accepts only bounded anonymous browser identifiers", () => {
    assert.equal(parseAnonymousId(" browser-id-123 "), "browser-id-123");
    assert.equal(parseAnonymousId("short"), undefined);
    assert.equal(parseAnonymousId("x".repeat(101)), undefined);
  });

  it("does not enqueue or call event translation in stored-only mode", async () => {
    const storedEvent = {
      id: 42,
      titleEn: "Stored event",
      descriptionEn: "Already translated and stored.",
    } as Parameters<typeof prepareEventsForMode>[0][number];
    let ensureCalls = 0;
    const prepared = await prepareEventsForMode(
      [storedEvent],
      "en",
      "stored_only",
      async () => {
        ensureCalls += 1;
        throw new Error("stored-only mode must not invoke translation");
      },
    );
    assert.equal(ensureCalls, 0);
    assert.deepEqual(prepared, [storedEvent]);
  });

  it("normalizes scope independently from neighborhood input order and casing", () => {
    const first = normalizeNeighborhoods(" Centrum, Scheveningen,centrum ");
    const second = normalizeNeighborhoods("scheveningen,CENTRUM");
    assert.deepEqual(first.map((value) => value.toLowerCase()), second.map((value) => value.toLowerCase()));
    assert.equal(
      normalizedListingsKey(" DHG ", "businesses", "nl", first),
      normalizedListingsKey("dhg", "businesses", "nl", second),
    );
  });

  it("normalizes supported business subcategories and rejects unknown values", () => {
    assert.deepEqual(
      parseBusinessCategories("Beauty & Personal Care,Unknown,Beauty & Personal Care"),
      ["Beauty & Personal Care"],
    );
  });

  it("filters OSM business categories before applying the provider result cap", () => {
    const retail = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      lat: 52.08,
      lon: 4.32,
      tags: {
        name: `Retail ${index}`,
        shop: "clothes",
        "addr:street": "Laan",
        "addr:housenumber": String(index + 1),
        "addr:postcode": "2593AA",
        "addr:city": "Den Haag",
      },
    }));
    const beauty = {
      id: 999,
      lat: 52.085,
      lon: 4.344,
      tags: {
        name: "Theresiastraat Beauty",
        shop: "beauty",
        "addr:street": "Theresiastraat",
        "addr:housenumber": "226",
        "addr:postcode": "2593AV",
        "addr:city": "Den Haag",
      },
    };
    const listings = fetchOpenStreetMapBusinesses(
      [...retail, beauty],
      "businesses",
      { s: 52.025, w: 4.235, n: 52.125, e: 4.42 },
      ["Beauty & Personal Care"],
    );
    assert.deepEqual(listings.map((listing) => listing.name), ["Theresiastraat Beauty"]);
  });

  it("keeps the closest neighborhood businesses when a targeted category exceeds the cap", () => {
    const distantBeauty = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      lat: 52.04,
      lon: 4.25,
      tags: {
        name: `Distant Beauty ${index}`,
        shop: "beauty",
        "addr:street": "Distant Street",
        "addr:housenumber": String(index + 1),
        "addr:postcode": "2551AA",
        "addr:city": "Den Haag",
      },
    }));
    const nearbyBeauty = {
      id: 999,
      lat: 52.089,
      lon: 4.337,
      tags: {
        name: "Nearby Theresiastraat Beauty",
        shop: "beauty",
        "addr:street": "Theresiastraat",
        "addr:housenumber": "113",
        "addr:postcode": "2593AD",
        "addr:city": "Den Haag",
      },
    };
    const listings = fetchOpenStreetMapBusinesses(
      [...distantBeauty, nearbyBeauty],
      "businesses",
      { s: 52.025, w: 4.235, n: 52.125, e: 4.42 },
      ["Beauty & Personal Care"],
      { lat: 52.089, lng: 4.337 },
    );
    assert.equal(listings.length, 200);
    assert.ok(listings.some((listing) => listing.name === "Nearby Theresiastraat Beauty"));
  });
});