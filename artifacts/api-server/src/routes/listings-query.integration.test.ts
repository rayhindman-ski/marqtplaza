import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import pino from "pino";
import {
  db,
  externalQueriesTable,
  externalResultsTable,
  pool,
  userQueriesTable,
} from "@workspace/db";
import { createListingsRouter, type Listing } from "./listings";

const runId = `listings-query-${process.pid}-${Date.now()}`;
const anonymousIds = [`${runId}-query-failure`, `${runId}-result-failure`, `${runId}-stored`];
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

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

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

async function requestListings(anonymousId: string, mode: "live" | "stored_only") {
  const neighborhoods = mode === "stored_only" ? "&neighborhoods=Scheveningen" : "";
  const response = await fetch(
    `${baseUrl}/api/listings?cityId=dhg&section=businesses&language=en&mode=${mode}&anonymousId=${anonymousId}${neighborhoods}`,
  );
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe("listings route provider failure isolation (isolated database integration)", () => {
  before(async () => {
    await cleanTestRows();
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
    assert.match(failedExternalQuery?.error ?? "", /forced google result persistence failure/);
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
});