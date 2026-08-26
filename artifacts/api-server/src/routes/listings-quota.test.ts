import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";

import { db, pool, providerUsageTable } from "@workspace/db";
import { reserveProviderRequest, resetProviderUsage } from "./listings";

const provider = `google_places_test_${process.pid}`;

afterEach(async () => {
  await db.delete(providerUsageTable).where(eq(providerUsageTable.provider, provider));
});

after(async () => {
  await pool.end();
});

describe("persistent provider request allowance", () => {
  it("atomically stops concurrent reservations at exactly 100", async () => {
    const reservations = await Promise.all(
      Array.from({ length: 125 }, () => reserveProviderRequest(provider, 100)),
    );
    assert.equal(reservations.filter((value) => value !== null).length, 100);
    assert.equal(reservations.filter((value) => value === null).length, 25);
    assert.equal(Math.max(...reservations.filter((value): value is number => value !== null)), 100);

    const [stored] = await db
      .select()
      .from(providerUsageTable)
      .where(eq(providerUsageTable.provider, provider));
    assert.equal(stored.requestCount, 100);
  });

  it("only becomes available again after an explicit reset", async () => {
    await Promise.all(
      Array.from({ length: 2 }, () => reserveProviderRequest(provider, 2)),
    );
    assert.equal(await reserveProviderRequest(provider, 2), null);

    await resetProviderUsage(provider);
    assert.equal(await reserveProviderRequest(provider, 2), 1);
  });
});