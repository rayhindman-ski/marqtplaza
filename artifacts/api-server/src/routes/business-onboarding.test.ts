import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { inArray } from "drizzle-orm";

import { appUsersTable, db } from "@workspace/db";

import type { Identity } from "../lib/permissions";
import { createBusinessOnboardingRouter } from "./business-onboarding";

/**
 * v0.5.2 intent endpoint (BENT-002, BENT-003, BOPS-001): stateless, strict,
 * flag-gated, and only for verified active accounts. The account middleware
 * provisions the local user row, so this suite needs the database.
 */
let flags = { accounts: true, businessIntake: true, businessPublication: true, consumerRegistration: true, businessOnboarding: true };
const USER = "user_onboarding_intent_e2e";

function identityFromHeaders(req: express.Request): Identity | null {
  const userId = req.header("x-test-user-id");
  if (!userId) return null;
  return { userId, emailVerified: req.header("x-test-unverified") !== "1", isEditor: false };
}

const app = express();
app.use(express.json());
app.use("/api", createBusinessOnboardingRouter({ flags: () => flags, resolveIdentity: identityFromHeaders }));

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

async function post(body: unknown, headers: Record<string, string> = { "x-test-user-id": USER }): Promise<{ status: number; body: any }> {
  const result = await fetch(`${baseUrl}/api/business-onboarding/intent`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
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
    await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, [USER]));
  });

  it("answers 404 before revealing anything about the session while the gate is closed", async () => {
    flags = { ...flags, businessOnboarding: false };
    try {
      const res = await post({ context: "account_home" }, {});
      assert.equal(res.status, 404);
      assert.equal(res.body.code, "FEATURE_DISABLED");
    } finally {
      flags = { ...flags, businessOnboarding: true };
    }
  });

  it("requires a verified account: 401 without a session, 403 when unverified", async () => {
    const anonymous = await post({ context: "account_home" }, {});
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, "AUTH_REQUIRED");
    const unverified = await post({ context: "account_home" }, { "x-test-user-id": USER, "x-test-unverified": "1" });
    assert.equal(unverified.status, 403);
    assert.equal(unverified.body.code, "EMAIL_UNVERIFIED");
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

  it("carries a listing reference as the intake's listing key and never anything else", async () => {
    const res = await post({ context: "listing", cityId: "dhg", listingSource: "google_maps", listingId: "ChIJ-abc_123:x" });
    assert.equal(res.status, 200);
    assert.equal(res.body.returnRef, "/account/bedrijf/toevoegen?context=listing&cityId=dhg&listingSource=google_maps&listingId=ChIJ-abc_123%3Ax");
  });

  it("rejects unknown contexts, half listing references, malformed values and unknown fields", async () => {
    const cases: Array<[unknown, string[]]> = [
      [{ context: "email" }, ["context"]],
      [{}, ["context"]],
      [{ context: "listing", listingId: "abc" }, ["cityId", "listingSource"]],
      [{ context: "listing", cityId: "dhg", listingSource: "google_maps" }, ["listingId"]],
      [{ context: "listing", listingSource: "google_maps", listingId: "abc" }, ["cityId"]],
      [{ context: "listing", cityId: "DHG", listingSource: "google_maps", listingId: "abc" }, ["cityId"]],
      [{ context: "listing", cityId: "dhg", listingSource: "Google Maps", listingId: "abc" }, ["listingSource"]],
      [{ context: "listing", cityId: "dhg", listingSource: "google_maps", listingId: "a b" }, ["listingId"]],
      [{ context: "listing", cityId: "dhg", listingSource: "google_maps", listingId: "x".repeat(201) }, ["listingId"]],
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
