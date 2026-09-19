import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";

import {
  GuestCorrectionRateLimiter,
  createListingCorrectionsRouter,
  listingCorrectionDigest,
} from "./listing-corrections";

test("correction digests are stable across object key order and change with payload", () => {
  const path = { cityId: "dhg", listingSource: "openstreetmap", listingId: "node/1" };
  const first = listingCorrectionDigest(path, {
    fieldKey: "address",
    proposedValue: "Nieuwe straat 1",
    locale: "nl",
  });
  const reordered = listingCorrectionDigest(path, {
    locale: "nl",
    proposedValue: "Nieuwe straat 1",
    fieldKey: "address",
  });
  const changed = listingCorrectionDigest(path, {
    fieldKey: "address",
    proposedValue: "Andere straat 2",
    locale: "nl",
  });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("guest correction limiter returns a retry-after duration", () => {
  let now = 1_000;
  const limiter = new GuestCorrectionRateLimiter(1, 60_000, () => now);
  assert.deepEqual(limiter.take("guest"), { allowed: true });
  const blocked = limiter.take("guest");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.retryAfter, 60);
  now += 60_000;
  assert.deepEqual(limiter.take("guest"), { allowed: true });
});

test("guest endpoint rejects missing idempotency before resolving or writing a listing", async () => {
  const app = express();
  app.use(express.json());
  app.use(createListingCorrectionsRouter({
    resolveListing: async () => {
      throw new Error("resolver must not run for invalid headers");
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/places/dhg/openstreetmap/corrections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: "address",
          proposedValue: "Nieuwe straat 1",
          locale: "nl",
          consentNoticeVersion: "2026-09-18",
        }),
      },
    );
    assert.equal(response.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});