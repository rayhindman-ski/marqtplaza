import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

import { createBusinessOnboardingRouter } from "./business-onboarding";

/**
 * v0.5.2 intent endpoint (BENT-002, BENT-003, BOPS-001): stateless, strict,
 * flag-gated. Nothing here needs a database.
 */
let flags = { accounts: true, businessIntake: true, businessPublication: true, consumerRegistration: true, businessOnboarding: true };

const app = express();
app.use(express.json());
app.use("/api", createBusinessOnboardingRouter({ flags: () => flags }));

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

async function post(body: unknown): Promise<{ status: number; body: any }> {
  const result = await fetch(`${baseUrl}/api/business-onboarding/intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: result.status, body: await result.json() };
}

describe("business onboarding intent", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("answers 404 FEATURE_DISABLED while the gate is closed, even for a valid body", async () => {
    flags = { ...flags, businessOnboarding: false };
    try {
      const res = await post({ context: "account_home" });
      assert.equal(res.status, 404);
      assert.equal(res.body.code, "FEATURE_DISABLED");
    } finally {
      flags = { ...flags, businessOnboarding: true };
    }
  });

  it("returns the canonical business-step path carrying only the context", async () => {
    for (const context of ["registration", "account_home", "listing"]) {
      const res = await post({ context });
      assert.equal(res.status, 200, context);
      assert.deepEqual(res.body, { context, returnRef: `/account/bedrijf/toevoegen?context=${context}` });
    }
  });

  it("carries a listing reference as an opaque pair and never anything else", async () => {
    const res = await post({ context: "listing", listingSource: "google_maps", listingId: "ChIJ-abc_123:x" });
    assert.equal(res.status, 200);
    assert.equal(res.body.returnRef, "/account/bedrijf/toevoegen?context=listing&listingSource=google_maps&listingId=ChIJ-abc_123%3Ax");
  });

  it("rejects unknown contexts, half listing references, malformed values and unknown fields", async () => {
    const cases: Array<[unknown, string[]]> = [
      [{ context: "email" }, ["context"]],
      [{}, ["context"]],
      [{ context: "listing", listingId: "abc" }, ["listingSource"]],
      [{ context: "listing", listingSource: "google_maps" }, ["listingId"]],
      [{ context: "listing", listingSource: "Google Maps", listingId: "abc" }, ["listingSource"]],
      [{ context: "listing", listingSource: "google_maps", listingId: "a b" }, ["listingId"]],
      [{ context: "listing", listingSource: "google_maps", listingId: "x".repeat(201) }, ["listingId"]],
      [{ context: "account_home", email: "p@example.com" }, ["email"]],
      [{ context: "account_home", returnRef: "https://evil.example" }, ["returnRef"]],
    ];
    for (const [body, fields] of cases) {
      const res = await post(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.code, "VALIDATION_FAILED");
      assert.deepEqual(res.body.fieldErrors.map((e: { field: string }) => e.field), fields, JSON.stringify(body));
    }
  });
});
