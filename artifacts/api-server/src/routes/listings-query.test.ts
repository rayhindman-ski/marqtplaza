import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowsExternalQueries,
  fetchOpenStreetMapBusinesses,
  findStoredListingInRows,
  listingSnapshotRows,
  filterEventsByNeighborhoods,
  filterListingsByBusinessCategories,
  foodTypeForGooglePrimaryType,
  foodTypeForOsmTags,
  loadStoredBusinessResults,
  normalizeNeighborhoods,
  normalizedListingsKey,
  parseAnonymousId,
  parseBusinessCategories,
  parseListingsMode,
  prepareEventsForMode,
  summarizeEventEvidence,
} from "./listings";

describe("listings query persistence inputs", () => {
  it("classifies Google Food & Drink types without guessing cuisine", () => {
    assert.equal(foodTypeForGooglePrimaryType("italian_restaurant"), "restaurant");
    assert.equal(foodTypeForGooglePrimaryType("coffee_shop"), "cafe");
    assert.equal(foodTypeForGooglePrimaryType("wine_bar"), "bar");
    assert.equal(foodTypeForGooglePrimaryType("bakery"), "bakery");
    assert.equal(foodTypeForGooglePrimaryType("meal_takeaway"), "takeaway");
    assert.equal(foodTypeForGooglePrimaryType("food"), "other");
    assert.equal(foodTypeForGooglePrimaryType(undefined), "other");
  });

  it("classifies OSM Food & Drink tags with a stable fallback", () => {
    assert.equal(foodTypeForOsmTags({ amenity: "restaurant", cuisine: "thai" }), "restaurant");
    assert.equal(foodTypeForOsmTags({ amenity: "cafe" }), "cafe");
    assert.equal(foodTypeForOsmTags({ amenity: "pub" }), "bar");
    assert.equal(foodTypeForOsmTags({ amenity: "cafe;bar" }), "cafe");
    assert.equal(foodTypeForOsmTags({ shop: "bakery" }), "bakery");
    assert.equal(foodTypeForOsmTags({ shop: "pastry" }), "bakery");
    assert.equal(foodTypeForOsmTags({ shop: "ice_cream" }), "bakery");
    assert.equal(foodTypeForOsmTags({ amenity: "fast_food" }), "takeaway");
    assert.equal(foodTypeForOsmTags({ shop: "deli" }), "other");
  });

  it("preserves website and social links from OpenStreetMap tags", () => {
    const listings = fetchOpenStreetMapBusinesses(
      [{
        id: 42,
        type: "way",
        lat: 52.075,
        lon: 4.312,
        tags: {
          name: "Linked bakery",
          shop: "bakery",
          "addr:city": "Den Haag",
          "contact:website": "www.example.com",
          "contact:facebook": "linked.bakery",
          instagram: "@linkedbakery",
        },
      }],
      "food-drink",
      { s: 52.025, w: 4.235, n: 52.125, e: 4.42 },
      [],
    );

    assert.equal(listings[0]?.officialUrl, "https://www.example.com");
    assert.equal(listings[0]?.facebookUrl, "https://www.facebook.com/linked.bakery");
    assert.equal(listings[0]?.instagramUrl, "https://www.instagram.com/linkedbakery");
    assert.equal(listings[0]?.sourcePageUrl, "https://www.openstreetmap.org/way/42");
  });

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

  it("selects Google and OSM listing IDs from a bounded newest-first stored row set", () => {
    const rows = [
      { payload: [{ id: "google-place-1", source: "google_maps", name: "Google shop" }] },
      { payload: [{ id: "osm-node-2", source: "openstreetmap", name: "OSM cafe" }] },
    ];
    assert.equal(findStoredListingInRows(rows, "google-place-1")?.name, "Google shop");
    assert.equal(findStoredListingInRows(rows, "osm-node-2")?.name, "OSM cafe");
    assert.equal(findStoredListingInRows(rows, "missing"), null);
  });

  it("normalizes one deduplicated lookup row per listing without changing its payload", () => {
    const fetchedAt = new Date("2026-09-20T12:00:00.000Z");
    const older = { id: "osm-node-2", source: "openstreetmap", name: "Old name" };
    const newest = { id: "osm-node-2", source: "openstreetmap", name: "New name" };
    const rows = listingSnapshotRows(
      42,
      JSON.stringify({ cityId: "dhg", section: "businesses", language: "nl" }),
      [older, newest],
      fetchedAt,
    );

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      externalResultId: 42,
      cityId: "dhg",
      section: "businesses",
      listingId: "osm-node-2",
      listing: newest,
      fetchedAt,
    });
    assert.deepEqual(listingSnapshotRows(42, "not-json", [newest], fetchedAt), []);
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

  it("shares a listings key for equivalent neighborhood whitespace and casing", () => {
    assert.equal(
      normalizedListingsKey("dhg", "businesses", "nl", ["Laak Centraal", "Centrum"]),
      normalizedListingsKey(" DHG ", "businesses", "nl", ["  laak   centraal  ", " centrum "]),
    );
  });

  it("merges individually stored neighborhood results when a combined scope is absent", async () => {
    const neighborhoods = ["Centrum", "Stationsbuurt", "Bezuidenhout"];
    const storedByKey = new Map(neighborhoods.map((neighborhood) => [
      normalizedListingsKey("dhg", "businesses", "en", [neighborhood], []),
      new Map([["openstreetmap", [{
        id: `osm-${neighborhood.toLowerCase()}`,
        locationId: "dhg",
        category: "Businesses",
        businessCategory: "Retail & Shopping",
        name: `${neighborhood} shop`,
        description: "Stored neighborhood listing",
        details: neighborhood,
        x: 50,
        y: 50,
        lat: 52.08,
        lng: 4.31,
        source: "openstreetmap",
        sourceName: "OpenStreetMap",
      }]]]),
    ]));
    const combinedKey = normalizedListingsKey("dhg", "businesses", "en", neighborhoods, []);

    const result = await loadStoredBusinessResults(
      combinedKey,
      ["openstreetmap"],
      {
        cityId: "dhg",
        section: "businesses",
        language: "en",
        neighborhoods,
        businessCategories: [],
      },
      async (key, providers) => {
        const stored = storedByKey.get(key);
        return new Map(
          [...(stored ?? new Map())].filter(([provider]) => providers.includes(provider)),
        );
      },
    );

    assert.deepEqual(
      result.get("openstreetmap")?.map((listing) => listing.id).sort(),
      ["osm-bezuidenhout", "osm-centrum", "osm-stationsbuurt"],
    );
  });

  it("preserves a checked-empty combined scope instead of reviving member caches", async () => {
    const neighborhoods = ["Centrum", "Stationsbuurt"];
    const combinedKey = normalizedListingsKey("dhg", "businesses", "en", neighborhoods, []);
    let lookupCount = 0;

    const result = await loadStoredBusinessResults(
      combinedKey,
      ["openstreetmap"],
      {
        cityId: "dhg",
        section: "businesses",
        language: "en",
        neighborhoods,
        businessCategories: [],
      },
      async () => {
        lookupCount += 1;
        return new Map([["openstreetmap", []]]);
      },
    );

    assert.deepEqual(result.get("openstreetmap"), []);
    assert.equal(lookupCount, 1);
  });

  it("matches event neighborhoods without formatting-sensitive exclusions", () => {
    const events = [
      { id: 1, neighborhood: "  Laak   Centraal  " },
      { id: 2, neighborhood: "  Centrum  " },
      { id: 3, neighborhood: undefined },
    ] as Parameters<typeof filterEventsByNeighborhoods>[0];

    const filtered = filterEventsByNeighborhoods(events, [" laak centraal "]);

    assert.deepEqual(filtered.map((event) => event.id), [1, 3]);
  });

  it("keeps only genuinely unassigned events available for coordinate filtering", () => {
    const events = [
      { id: 1, neighborhood: undefined },
      { id: 2, neighborhood: "" },
      { id: 3, neighborhood: "   " },
      { id: 4, neighborhood: ",,," },
      { id: 5, neighborhood: ", , " },
      { id: 6, neighborhood: "Centrum" },
      { id: 7, neighborhood: "Scheveningen" },
    ] as Parameters<typeof filterEventsByNeighborhoods>[0];

    const filtered = filterEventsByNeighborhoods(events, ["centrum"]);

    assert.deepEqual(filtered.map((event) => event.id), [1, 2, 3, 6]);
  });

  it("normalizes supported business subcategories and rejects unknown values", () => {
    assert.deepEqual(
      parseBusinessCategories("Beauty & Personal Care,Unknown,Beauty & Personal Care"),
      ["Beauty & Personal Care"],
    );
  });

  it("keeps business subcategories whose names contain a comma", () => {
    assert.deepEqual(parseBusinessCategories("Arts, Culture & Entertainment"), ["Arts, Culture & Entertainment"]);
    assert.deepEqual(
      parseBusinessCategories("Retail & Shopping,Arts, Culture & Entertainment,Fitness & Sports"),
      ["Arts, Culture & Entertainment", "Fitness & Sports", "Retail & Shopping"],
    );
    assert.deepEqual(parseBusinessCategories("Arts,Bogus,Retail &amp; Shopping"), ["Retail & Shopping"]);
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
describe("stored business subcategory narrowing", () => {
  const listings = [
    { id: "a", businessCategory: "Retail & Shopping" },
    { id: "b", businessCategory: "Arts, Culture & Entertainment" },
    { id: "c", businessCategory: "Home & Repair" },
    { id: "d" },
  ] as Parameters<typeof filterListingsByBusinessCategories>[0];

  it("returns every listing when no subcategory is selected", () => {
    assert.equal(filterListingsByBusinessCategories(listings, []).length, 4);
  });

  it("keeps only listings in the selected subcategories, including comma-containing names", () => {
    const narrowed = filterListingsByBusinessCategories(listings, ["Arts, Culture & Entertainment", "Retail & Shopping"]);
    assert.deepEqual(narrowed.map((listing) => listing.id), ["a", "b"]);
  });

  it("drops listings without a business category when a subset is selected", () => {
    assert.deepEqual(filterListingsByBusinessCategories(listings, ["Home & Repair"]).map((l) => l.id), ["c"]);
  });
});
