import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import pino from "pino";
import {
  db,
  discoveredEventsTable,
  externalQueriesTable,
  externalResultsTable,
  eventSourceStatusesTable,
  pool,
  userQueriesTable,
} from "@workspace/db";
import { createListingsRouter, type Listing } from "./listings";
import sourcesRouter from "./sources";

const runId = `listings-query-${process.pid}-${Date.now()}`;
const anonymousIds = [
  `${runId}-query-failure`,
  `${runId}-result-failure`,
  `${runId}-stored`,
  `${runId}-scan-to-listing`,
];
const scanEventUrls = [
  "https://www.getyourguide.com/en-gb/the-hague-l1267/test-community-event",
  "https://www.getyourguide.com/en-gb/the-hague-l1267/online-skills-session",
  "https://www.getyourguide.com/en-gb/the-hague-l1267/past-foreign-event",
];
const scanSourceIds = ["getyourguide", "denhaag-com", "wearetravelers", "flitz-events", "kidsproof"];
const queryTriggerName = "listings_test_fail_google_query";
const queryTriggerFunctionName = "listings_test_reject_google_query";
const resultTriggerName = "listings_test_fail_google_result";
const resultTriggerFunctionName = "listings_test_reject_google_result";
let googleLoaderCalls = 0;
let osmLoaderCalls = 0;
const testLogger = pino({ enabled: false });

const osmListing: Listing = {
  id: "osm-987654321",
  locationId: "dhg",
  category: "Businesses",
  businessCategory: "Retail & Shopping",
  name: "Reliable Local Shop",
  address: "Teststraat 1, 2511 AA Den Haag",
  description: "Local books shop",
  x: 50,
  y: 50,
  details: "Teststraat 1, 2511 AA Den Haag",
  lat: 52.08,
  lng: 4.31,
  source: "openstreetmap",
  sourceName: "OpenStreetMap",
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.log = testLogger;
  next();
});

app.use("/api", createListingsRouter({
  getUserId: () => null,
  googlePlacesEnabled: true,
  loadGooglePlaces: async () => {
    googleLoaderCalls += 1;
    return [{
      ...osmListing,
      id: "google-result-that-cannot-be-saved",
      name: "Unsaved Google Shop",
      source: "google_maps",
      sourceName: "Google Maps",
    }];
  },
  loadOpenStreetMapBusinesses: async () => {
    osmLoaderCalls += 1;
    return [osmListing];
  },
}));
app.use("/api/sources", sourcesRouter);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const originalFetch = globalThis.fetch;

async function cleanTestRows(): Promise<void> {
  const queries = await db.select({ id: userQueriesTable.id })
    .from(userQueriesTable)
    .where(inArray(userQueriesTable.anonymousId, anonymousIds));
  const queryIds = queries.map(({ id }) => id);
  if (queryIds.length > 0) {
    await db.delete(externalResultsTable).where(inArray(externalResultsTable.userQueryId, queryIds));
    await db.delete(externalQueriesTable).where(inArray(externalQueriesTable.userQueryId, queryIds));
    await db.delete(userQueriesTable).where(inArray(userQueriesTable.id, queryIds));
  }
}

async function cleanEventRows(): Promise<void> {
  await db.delete(discoveredEventsTable).where(inArray(discoveredEventsTable.canonicalUrl, scanEventUrls));
  await db.delete(eventSourceStatusesTable).where(inArray(eventSourceStatusesTable.sourceId, scanSourceIds));
}

async function requestListings(anonymousId: string, mode: "live" | "stored_only") {
  const neighborhoods = mode === "stored_only" ? "&neighborhoods=Scheveningen" : "";
  const response = await fetch(
    `${baseUrl}/api/listings?cityId=dhg&section=businesses&language=en&mode=${mode}&anonymousId=${anonymousId}${neighborhoods}`,
  );
  return { status: response.status, body: await response.json() as Record<string, any> };
}

async function requestEventListings() {
  const response = await fetch(
    `${baseUrl}/api/listings?cityId=dhg&section=events&language=en&mode=live&neighborhoods=Scheveningen&anonymousId=${anonymousIds[3]}`,
  );
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe("listings route integration (isolated database integration)", () => {
  before(async () => {
    await cleanTestRows();
    await cleanEventRows();
    await pool.query(`
      create or replace function ${queryTriggerFunctionName}()
      returns trigger language plpgsql as $$
      begin
        if new.provider = 'google_places' then
          raise exception 'forced google query persistence failure';
        end if;
        return new;
      end;
      $$;
    `);
    await pool.query(`drop trigger if exists ${queryTriggerName} on "external-queries"`);
    await pool.query(`
      create trigger ${queryTriggerName}
      before insert on "external-queries"
      for each row execute function ${queryTriggerFunctionName}()
    `);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await pool.query(`drop trigger if exists ${queryTriggerName} on "external-queries"`);
    await pool.query(`drop trigger if exists ${resultTriggerName} on "external-results"`);
    await pool.query(`drop function if exists ${queryTriggerFunctionName}()`);
    await pool.query(`drop function if exists ${resultTriggerFunctionName}()`);
    globalThis.fetch = originalFetch;
    await cleanEventRows();
    await cleanTestRows();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await pool.end();
  });

  it("returns successful provider listings and finalizes the parent query as partial", async () => {
    const result = await requestListings(anonymousIds[0], "live");
    assert.equal(result.status, 200);
    assert.equal(result.body.partial, true);
    assert.deepEqual(result.body.providers, ["openstreetmap"]);
    assert.equal(result.body.listings.some((listing: { name?: string }) =>
      listing.name === "Reliable Local Shop"), true);
    assert.equal(googleLoaderCalls, 0);
    assert.equal(osmLoaderCalls, 1);

    const [query] = await db.select({
      status: userQueriesTable.status,
      completedAt: userQueriesTable.completedAt,
    }).from(userQueriesTable).where(eq(userQueriesTable.id, result.body.queryId));
    assert.equal(query?.status, "partial");
    assert.ok(query?.completedAt);
  });

  it("keeps successful listings when another provider's result cannot be saved", async () => {
    await pool.query(`drop trigger if exists ${queryTriggerName} on "external-queries"`);
    await pool.query(`
      create or replace function ${resultTriggerFunctionName}()
      returns trigger language plpgsql as $$
      begin
        if new.provider = 'google_places' then
          raise exception 'forced google result persistence failure';
        end if;
        return new;
      end;
      $$;
    `);
    await pool.query(`drop trigger if exists ${resultTriggerName} on "external-results"`);
    await pool.query(`
      create trigger ${resultTriggerName}
      before insert on "external-results"
      for each row execute function ${resultTriggerFunctionName}()
    `);

    const result = await requestListings(anonymousIds[1], "live");
    assert.equal(result.status, 200);
    assert.equal(result.body.partial, true);
    assert.deepEqual(result.body.providers, ["openstreetmap"]);
    assert.equal(result.body.listings.some((listing: { name?: string }) =>
      listing.name === "Reliable Local Shop"), true);
    assert.equal(result.body.listings.some((listing: { name?: string }) =>
      listing.name === "Unsaved Google Shop"), false);
    assert.equal(googleLoaderCalls, 1);
    assert.equal(osmLoaderCalls, 2);

    const [query] = await db.select({
      status: userQueriesTable.status,
      completedAt: userQueriesTable.completedAt,
    }).from(userQueriesTable).where(eq(userQueriesTable.id, result.body.queryId));
    assert.equal(query?.status, "partial");
    assert.ok(query?.completedAt);

    const [failedExternalQuery] = await db.select({
      status: externalQueriesTable.status,
      error: externalQueriesTable.error,
      completedAt: externalQueriesTable.completedAt,
    }).from(externalQueriesTable).where(and(
      eq(externalQueriesTable.userQueryId, result.body.queryId),
      eq(externalQueriesTable.provider, "google_places"),
    ));
    assert.equal(failedExternalQuery?.status, "failed");
    assert.ok(failedExternalQuery?.error);
    assert.ok(failedExternalQuery?.completedAt);
  });

  it("never invokes provider loaders for a stored-only cache miss and still returns 200", async () => {
    const googleCallsBefore = googleLoaderCalls;
    const osmCallsBefore = osmLoaderCalls;
    const result = await requestListings(anonymousIds[2], "stored_only");
    assert.equal(result.status, 200);
    assert.equal(result.body.cacheMiss, true);
    assert.equal(result.body.cacheHit, false);
    assert.deepEqual(result.body.listings, []);
    assert.equal(googleLoaderCalls, googleCallsBefore);
    assert.equal(osmLoaderCalls, osmCallsBefore);
  });

  it("publishes only eligible scanned events and preserves source evidence states", async () => {
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const sourceIndex = `
      <html lang="en">
        <script type="application/ld+json">${JSON.stringify([
          {
            "@type": "Event",
            "name": "Scheveningen community workshop",
            "url": scanEventUrls[0],
            "startDate": startsAt,
            "description": "A local workshop for neighbors.",
            "location": {
              "@type": "Place",
              "name": "Buurtcentrum Scheveningen",
              "address": {
                "streetAddress": "Keizerstraat 1",
                "postalCode": "2584 BG",
                "addressLocality": "Den Haag"
              },
              "geo": { "latitude": 52.108, "longitude": 4.28 }
            }
          },
          {
            "@type": "Event",
            "name": "Online skills session",
            "url": scanEventUrls[1],
            "description": "An event without a local venue or date."
          },
          {
            "@type": "Event",
            "name": "Past foreign event",
            "url": scanEventUrls[2],
            "startDate": "2020-01-01T18:00:00Z",
            "location": {
              "@type": "Place",
              "name": "Paris",
              "geo": { "latitude": 48.8566, "longitude": 2.3522 }
            }
          }
        ])}</script>
      </html>
    `;

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      const parsed = new URL(url);
      if (parsed.pathname === "/robots.txt") {
        return new Response("User-agent: *\nAllow: /", {
          headers: { "content-type": "text/plain" },
        });
      }
      if (parsed.pathname === "/en-gb/the-hague-l1267") {
        return new Response(sourceIndex, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (/sitemap(?:_index)?\.xml$/i.test(parsed.pathname)) {
        return new Response("<urlset></urlset>", {
          headers: { "content-type": "application/xml" },
        });
      }
      return new Response("<html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };

    const scanResponse = await fetch(`${baseUrl}/api/sources/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceIds: ["getyourguide"] }),
    });
    const scanBody = await scanResponse.json() as {
      scans: Array<{
        status: string;
        eventsCaptured: number;
        eventsEligible: number;
        eventsAdded: number;
      }>;
    };
    assert.equal(scanResponse.status, 200);
    assert.equal(scanBody.scans[0]?.status, "found");
    assert.equal(scanBody.scans[0]?.eventsCaptured, 3);
    assert.equal(scanBody.scans[0]?.eventsEligible, 1);
    assert.equal(scanBody.scans[0]?.eventsAdded, 3);

    const persistedEvents = await db
      .select({
        canonicalUrl: discoveredEventsTable.canonicalUrl,
        reviewStatus: discoveredEventsTable.reviewStatus,
        reviewReason: discoveredEventsTable.reviewReason,
      })
      .from(discoveredEventsTable)
      .where(inArray(discoveredEventsTable.canonicalUrl, scanEventUrls));
    assert.equal(persistedEvents.length, 3);
    assert.deepEqual(
      persistedEvents.map((event) => event.reviewStatus).sort(),
      ["approved", "pending_review", "pending_review"],
    );
    assert.deepEqual(
      persistedEvents
        .filter((event) => event.reviewStatus === "pending_review")
        .map((event) => event.reviewReason)
        .sort(),
      ["missing_date", "out_of_window"],
    );

    const checkedAt = new Date();
    await db.insert(eventSourceStatusesTable).values([
      {
        sourceId: "denhaag-com",
        sourceName: "DenHaag.com",
        sourceUrl: "https://denhaag.com/en/calendar",
        sourceGroup: "city-agenda",
        status: "partial",
        lastScannedAt: checkedAt,
        message: "Some pages could not be read.",
      },
      {
        sourceId: "wearetravelers",
        sourceName: "We Are Travelers",
        sourceUrl: "https://www.wearetravelers.nl",
        sourceGroup: "city-agenda",
        status: "no_events",
        lastScannedAt: checkedAt,
        message: "No upcoming events found.",
      },
      {
        sourceId: "flitz-events",
        sourceName: "Flitz-Events",
        sourceUrl: "https://flitz-events.nl/teamuitje/den-haag",
        sourceGroup: "city-agenda",
        status: "blocked",
        lastScannedAt: checkedAt,
        message: "The source denied automated access.",
      },
    ]);

    const listingResult = await requestEventListings();
    assert.equal(listingResult.status, 200);
    assert.equal(listingResult.body.listings.length, 1);
    assert.equal(listingResult.body.listings[0]?.name, "Scheveningen community workshop");
    assert.equal(listingResult.body.listings[0]?.source, "source_scan");
    assert.equal(listingResult.body.evidence.status, "verified");

    const evidenceById = new Map(
      listingResult.body.evidence.sources.map((source: { id: string; status: string }) => [source.id, source.status]),
    );
    assert.equal(evidenceById.get("getyourguide"), "verified");
    assert.equal(evidenceById.get("denhaag-com"), "stale");
    assert.equal(evidenceById.get("wearetravelers"), "empty");
    assert.equal(evidenceById.get("flitz-events"), "blocked");
    assert.equal(evidenceById.has("kidsproof"), false);

    await db.update(discoveredEventsTable)
      .set({ reviewStatus: "pending_review" })
      .where(inArray(discoveredEventsTable.canonicalUrl, scanEventUrls));
    await db.delete(eventSourceStatusesTable).where(inArray(eventSourceStatusesTable.sourceId, scanSourceIds));
    const unavailableResult = await requestEventListings();
    assert.equal(unavailableResult.status, 200);
    assert.deepEqual(unavailableResult.body.listings, []);
    assert.equal(unavailableResult.body.evidence.status, "unavailable");
    assert.deepEqual(unavailableResult.body.evidence.sources, []);
  });
});