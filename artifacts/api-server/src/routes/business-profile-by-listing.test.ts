import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { businessProfilesTable, db, pool } from "@workspace/db";
import { createBusinessesRouter } from "./businesses";

const listingId = `by-listing-test-${process.pid}-${Date.now()}`;
const listingSource = "openstreetmap";
const slug = listingId;
const app = express();
app.use("/api", createBusinessesRouter({
  flags: () => ({
    accounts: false,
    businessIntake: false,
    businessPublication: false,
    consumerRegistration: false,
    businessOnboarding: false,
  }),
}));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let profileId: number;

async function lookup(source = listingSource, id = listingId) {
  const response = await fetch(`${baseUrl}/api/business-profiles/by-listing?cityId=dhg&listingSource=${encodeURIComponent(source)}&listingId=${encodeURIComponent(id)}`);
  return { status: response.status, body: await response.json() };
}

describe("GET /business-profiles/by-listing", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const [profile] = await db.insert(businessProfilesTable).values({
      slug,
      cityId: "dhg",
      listingSource,
      listingId,
      name: "Test business",
      isClaimed: true,
      publicationStatus: "published",
    }).returning({ id: businessProfilesTable.id });
    profileId = profile.id;
  });

  after(async () => {
    if (profileId) await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  it("returns only slug and name for a claimed published listing", async () => {
    assert.deepEqual(await lookup(), {
      status: 200,
      body: { match: { slug, name: "Test business" } },
    });
    assert.deepEqual(await lookup(listingSource, `${listingId}-unknown`), { status: 200, body: { match: null } });
  });

  it("hides unclaimed, draft, and closed listings", async () => {
    for (const changes of [
      { isClaimed: false, publicationStatus: "published", closedAt: null },
      { isClaimed: true, publicationStatus: "draft", closedAt: null },
      { isClaimed: true, publicationStatus: "published", closedAt: new Date() },
    ]) {
      await db.update(businessProfilesTable).set(changes).where(eq(businessProfilesTable.id, profileId));
      assert.deepEqual(await lookup(), { status: 200, body: { match: null } });
    }
  });

  it("rejects missing listing parameters", async () => {
    for (const query of ["", "?listingSource=openstreetmap", "?listingId=123", "?listingSource=%20&listingId=123"]) {
      const response = await fetch(`${baseUrl}/api/business-profiles/by-listing${query}`);
      assert.equal(response.status, 400);
    }
  });
});