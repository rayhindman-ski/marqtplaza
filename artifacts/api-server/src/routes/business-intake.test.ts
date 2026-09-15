import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";

import {
  appUsersTable,
  businessClaimsTable,
  businessMembersTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  externalQueriesTable,
  externalResultsTable,
  pool,
  userQueriesTable,
} from "@workspace/db";

import {
  createBusinessIntakeRouter,
  lookupStoredListings,
  resolveOfferedListing,
  type LookupListing,
} from "./business-intake";
import { createBusinessesRouter } from "./businesses";
import type { Identity } from "../lib/permissions";

const runId = `${process.pid}-${Date.now()}`;
const users = {
  alice: `intake-test-${runId}-alice`,
  bob: `intake-test-${runId}-bob`,
  unverified: `intake-test-${runId}-unverified`,
  editor: `intake-test-${runId}-editor`,
  ownerEditor: `intake-test-${runId}-owner-editor`,
  bursty: `intake-test-${runId}-bursty`,
};
const allUserIds = Object.values(users);
const listingId = `intake-test-listing-${runId}`;
const otherListingId = `intake-test-listing-b-${runId}`;
const storedGoogleListingId = `intake-test-google-${runId}`;
const agedGoogleListingId = `intake-test-google-aged-${runId}`;
const publishedSelfReportedListingId = `intake-test-selfrep-${runId}`;
let storedUserQueryId: number | null = null;

let flags = { accounts: true, businessIntake: true, businessPublication: false };
let lookupShouldFail = false;

const listings: LookupListing[] = [
  {
    id: listingId,
    locationId: "dhg",
    name: `Bakkerij Intake ${runId}`,
    address: "Teststraat 1, Den Haag",
    neighborhood: "Bezuidenhout",
    lat: 52.08,
    lng: 4.33,
    sourceUrl: "https://www.openstreetmap.org/node/1",
    source: "openstreetmap",
    businessCategory: "Food & Drink",
  },
  {
    id: otherListingId,
    locationId: "dhg",
    name: `Bakkerij Tweede ${runId}`,
    neighborhood: "Centrum",
    lat: 52.07,
    lng: 4.31,
    source: "openstreetmap",
  },
];

function identityFromHeaders(req: express.Request): Identity | null {
  const userId = req.header("x-test-user-id");
  if (!userId) return null;
  return {
    userId,
    emailVerified: req.header("x-test-unverified") !== "1",
    isEditor: req.header("x-test-editor") === "1",
  };
}

const app = express();
app.use(express.json());
app.use(
  "/api",
  createBusinessesRouter({
    getUserId: (req) => req.header("x-test-user-id") ?? null,
    requireEditor: (req, res, next) => {
      if (req.header("x-test-editor") !== "1") {
        res.status(403).json({ error: "editor required" });
        return;
      }
      next();
    },
  }),
);
app.use(
  "/api",
  createBusinessIntakeRouter({
    resolveIdentity: identityFromHeaders,
    flags: () => flags,
    lookupListings: async (query) => {
      if (lookupShouldFail) throw new Error("stored results unavailable");
      return listings.filter((listing) => listing.name.toLowerCase().includes(query));
    },
    resolveListing: async (cityId, source, id) => {
      const match = listings.find((listing) => listing.id === id && listing.source === source);
      return cityId === "dhg" && match ? match : null;
    },
    lookupRateLimit: { limit: 5, windowMs: 60_000 },
  }),
);

// Same routes with the PRODUCTION lookup + resolver chain (stored provider results).
const productionApp = express();
productionApp.use(express.json());
productionApp.use(
  "/api",
  createBusinessIntakeRouter({
    resolveIdentity: identityFromHeaders,
    flags: () => flags,
    lookupListings: lookupStoredListings,
    resolveListing: resolveOfferedListing,
    lookupRateLimit: { limit: 50, windowMs: 60_000 },
  }),
);

let server: ReturnType<typeof app.listen>;
let productionServer: ReturnType<typeof productionApp.listen>;
let baseUrl = "";
let productionBaseUrl = "";

async function request(
  path: string,
  init: RequestInit & { userId?: string | null; base?: string } = {},
): Promise<{ status: number; body: any }> {
  const { userId = users.alice, headers, base = baseUrl, ...rest } = init;
  const result = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-user-id": userId } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  return { status: result.status, body: await result.json() };
}

const baseDraft = {
  contactName: "Alice Tester",
  contactEmail: "alice@example.com",
  relationship: "Owner",
  authorityDeclaration: "I am the registered owner of this bakery and manage it daily.",
};

async function seedStoredGoogleListing(): Promise<void> {
  const normalizedKey = `{"cityId":"dhg","section":"businesses","language":"nl","neighborhoods":[]}`;
  const [userQuery] = await db
    .insert(userQueriesTable)
    .values({ cityId: "dhg", section: "businesses", language: "nl", normalizedKey, status: "succeeded", anonymousId: `intake-test-${runId}` })
    .returning({ id: userQueriesTable.id });
  storedUserQueryId = userQuery.id;
  const [externalQuery] = await db
    .insert(externalQueriesTable)
    .values({ userQueryId: userQuery.id, provider: "google_places", normalizedKey, requestPayload: {}, status: "succeeded" })
    .returning({ id: externalQueriesTable.id });
  await db.insert(externalResultsTable).values({
    externalQueryId: externalQuery.id,
    userQueryId: userQuery.id,
    provider: "google_places",
    normalizedKey,
    payload: [
      {
        id: storedGoogleListingId,
        locationId: "dhg",
        name: `Kapsalon Stored ${runId}`,
        address: "Laan van NOI 1, Den Haag",
        neighborhood: "Bezuidenhout",
        lat: 52.08,
        lng: 4.33,
        source: "google_maps",
        sourceUrl: "https://maps.google.com/?cid=1",
        businessCategory: "Services",
      },
    ],
    resultCount: 1,
  });
}

async function cleanup(): Promise<void> {
  if (storedUserQueryId !== null) {
    await db.delete(userQueriesTable).where(eq(userQueriesTable.id, storedUserQueryId));
    storedUserQueryId = null;
  }
  const profiles = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(inArray(businessProfilesTable.listingId, [
      listingId, otherListingId, storedGoogleListingId, agedGoogleListingId, publishedSelfReportedListingId,
    ]));
  const created = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(inArray(businessProfilesTable.createdByUserId, allUserIds));
  const ids = [...new Set([...profiles, ...created].map((row) => row.id))];
  if (ids.length > 0) {
    const claims = await db
      .select({ id: businessClaimsTable.id })
      .from(businessClaimsTable)
      .where(inArray(businessClaimsTable.businessProfileId, ids));
    if (claims.length > 0) {
      await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, claims.map((claim) => claim.id)));
    }
    await db.delete(businessProfilesTable).where(inArray(businessProfilesTable.id, ids));
  }
  await db.delete(businessMembersTable).where(inArray(businessMembersTable.userId, allUserIds));
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUserIds));
}

describe("business intake routes", () => {
  before(async () => {
    await cleanup();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    await new Promise<void>((resolve) => {
      productionServer = productionApp.listen(0, "127.0.0.1", () => resolve());
    });
    productionBaseUrl = `http://127.0.0.1:${(productionServer.address() as AddressInfo).port}`;
    await seedStoredGoogleListing();
  });

  after(async () => {
    await cleanup();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => productionServer.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  });

  it("hides every intake route behind the flag without breaking legacy claim routes", async () => {
    flags = { ...flags, businessIntake: false };
    const lookup = await request(`/api/businesses/lookup?q=bakkerij`);
    assert.equal(lookup.status, 404);
    assert.equal(lookup.body.code, "FEATURE_DISABLED");
    const create = await request("/api/businesses", { method: "POST", body: JSON.stringify({}) });
    assert.equal(create.status, 404);
    const legacy = await request("/api/business-claims");
    assert.equal(legacy.status, 200, "legacy claim list keeps working while the gate is off");
    assert.deepEqual(legacy.body, []);
    const moderation = await request("/api/business-claims/moderation", { headers: { "x-test-editor": "1" } });
    assert.equal(moderation.status, 200, "moderation queue is not shadowed by the intake gate");
    flags = { ...flags, businessIntake: true };
  });

  it("requires a signed-in account for lookup and answers with the stable error shape", async () => {
    const anonymous = await request(`/api/businesses/lookup?q=bakkerij`, { userId: null });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, "AUTH_REQUIRED");
    const unverified = await request(`/api/businesses/lookup?q=bakkerij`, {
      userId: users.unverified,
      headers: { "x-test-unverified": "1" },
    });
    assert.equal(unverified.status, 403, "lookup is verified-account-only");
    assert.equal(unverified.body.code, "EMAIL_UNVERIFIED");
    const tooShort = await request(`/api/businesses/lookup?q=b`);
    assert.equal(tooShort.status, 400);
    assert.equal(tooShort.body.code, "VALIDATION_FAILED");
    const unknown = await request(`/api/businesses/lookup?q=bakkerij&claimantId=x`);
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.code, "UNKNOWN_FIELD");
  });

  it("returns bounded public-only matches", async () => {
    const lookup = await request(`/api/businesses/lookup?q=Bakkerij%20Intake`);
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.truncated, false);
    assert.equal(lookup.body.matches.length, 1);
    const [match] = lookup.body.matches;
    assert.deepEqual(Object.keys(match).sort(), [
      "category",
      "cityId",
      "isClaimed",
      "kind",
      "listingId",
      "listingSource",
      "name",
      "neighborhood",
      "sourceUrl",
    ]);
    assert.equal(match.kind, "listing");
    assert.equal(match.listingId, listingId);
    assert.equal(match.isClaimed, false);
    const serialised = JSON.stringify(lookup.body);
    assert.ok(!serialised.includes("contact"), "no contact data in lookup");
    assert.ok(!serialised.includes("claimant"), "no claimant data in lookup");
  });

  it("answers 503 when the listing source cannot be read instead of an empty list", async () => {
    lookupShouldFail = true;
    const lookup = await request(`/api/businesses/lookup?q=bakkerij`, { userId: users.bob });
    lookupShouldFail = false;
    assert.equal(lookup.status, 503);
    assert.equal(lookup.body.code, "DEPENDENCY_UNAVAILABLE");
  });

  it("rate limits lookup bursts per account", async () => {
    let limited = 0;
    for (let index = 0; index < 8; index += 1) {
      const result = await request(`/api/businesses/lookup?q=bakkerij`, { userId: users.bursty });
      if (result.status === 429) {
        limited += 1;
        assert.equal(result.body.code, "RATE_LIMITED");
      }
    }
    assert.equal(limited, 3);
    const other = await request(`/api/businesses/lookup?q=bakkerij`);
    assert.equal(other.status, 200, "another account keeps its own budget");
  });

  it("rejects unverified accounts and unknown fields on draft creation", async () => {
    const unverified = await request("/api/businesses", {
      method: "POST",
      userId: users.unverified,
      headers: { "x-test-unverified": "1" },
      body: JSON.stringify({ kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId }, ...baseDraft }),
    });
    assert.equal(unverified.status, 403);
    assert.equal(unverified.body.code, "EMAIL_UNVERIFIED");

    const massAssignment = await request("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        kind: "existing_listing",
        listing: { cityId: "dhg", listingSource: "openstreetmap", listingId, name: "Renamed" },
        status: "approved",
        ...baseDraft,
      }),
    });
    assert.equal(massAssignment.status, 400);
    assert.equal(massAssignment.body.code, "UNKNOWN_FIELD");
    const fields = massAssignment.body.fieldErrors.map((error: { field: string }) => error.field).sort();
    assert.deepEqual(fields, ["listing.name", "status"]);

    const unknownListing = await request("/api/businesses", {
      method: "POST",
      body: JSON.stringify({ kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: "nope" }, ...baseDraft }),
    });
    assert.equal(unknownListing.status, 400);
    assert.equal(unknownListing.body.code, "VALIDATION_FAILED");
  });

  it("creates, resumes, edits, submits, and withdraws an existing-listing claim with server-resolved facts", async () => {
    const idempotencyKey = `intake-${runId}-existing`;
    const payload = { kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId }, ...baseDraft };
    const created = await request("/api/businesses", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, "draft");
    assert.equal(created.body.nextAction, "submit");
    assert.equal(created.body.kind, "existing_listing");
    assert.equal(created.body.version, 1);
    assert.equal(created.body.profile.name, `Bakkerij Intake ${runId}`, "facts come from the resolved listing");
    assert.equal(created.body.profile.publicationStatus, "published");
    const claimId: number = created.body.id;

    const replay = await request("/api/businesses", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.id, claimId, "same key returns the original draft");

    const mismatch = await request("/api/businesses", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({ ...payload, relationship: "Manager" }),
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.code, "IDEMPOTENCY_CONFLICT");

    const duplicate = await request("/api/businesses", { method: "POST", body: JSON.stringify(payload) });
    assert.equal(duplicate.status, 409, "one draft per claimant and business");

    const resumed = await request(`/api/business-claims/${claimId}`);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.status, "draft");

    const crossUser = await request(`/api/business-claims/${claimId}`, { userId: users.bob });
    assert.equal(crossUser.status, 404, "other users cannot see the draft");
    const crossPatch = await request(`/api/business-claims/${claimId}`, {
      method: "PATCH",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1, message: "mine now" }),
    });
    assert.equal(crossPatch.status, 404);

    const stale = await request(`/api/business-claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 7, evidenceReference: "https://example.com/kvk" }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "VERSION_CONFLICT");
    assert.equal(stale.body.expectedVersion, 1);

    const renamed = await request(`/api/business-claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 1, business: { name: "Renamed", category: "Food", neighborhood: "Centrum" } }),
    });
    assert.equal(renamed.status, 409, "existing-listing facts cannot be redefined by the claimant");

    const edited = await request(`/api/business-claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 1, evidenceReference: "https://example.com/kvk" }),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.version, 2);
    assert.equal(edited.body.evidenceReference, "https://example.com/kvk");

    const submitted = await request(`/api/business-claims/${claimId}/submit`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.status, "submitted");
    assert.equal(submitted.body.nextAction, "wait_for_review");
    assert.equal(submitted.body.version, 3);

    const editAfterSubmit = await request(`/api/business-claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 3, message: "late edit" }),
    });
    assert.equal(editAfterSubmit.status, 409);

    // Bob can draft, but submission is blocked while Alice's claim is under review.
    const bobDraft = await request("/api/businesses", { method: "POST", userId: users.bob, body: JSON.stringify(payload) });
    assert.equal(bobDraft.status, 201);
    const bobSubmit = await request(`/api/business-claims/${bobDraft.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(bobSubmit.status, 409);
    assert.equal(bobSubmit.body.code, "IDEMPOTENCY_CONFLICT");
    assert.equal(bobSubmit.body.fieldErrors[0].code, "claim_in_review");

    const withdrawn = await request(`/api/business-claims/${claimId}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.status, "withdrawn");
    assert.equal(typeof withdrawn.body.withdrawnAt, "string");
    assert.equal(withdrawn.body.nextAction, "none");

    const withdrawAgain = await request(`/api/business-claims/${claimId}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 4 }),
    });
    assert.equal(withdrawAgain.status, 409);

    const bobResubmit = await request(`/api/business-claims/${bobDraft.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(bobResubmit.status, 200, "withdrawal frees the slot");
    assert.equal(bobResubmit.body.status, "submitted");

    // Reviewer flow: changes requested → claimant edits and resubmits → approval creates one owner.
    const selfReview = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.bob,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve", expectedVersion: bobResubmit.body.version }),
    });
    assert.equal(selfReview.status, 403);

    const missingVersion = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(missingVersion.status, 400, "claim decisions must name the reviewed version");

    const reviewedVersion = bobResubmit.body.version;
    const changes = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "request_changes", reviewNote: "Please add your KvK number.", expectedVersion: reviewedVersion }),
    });
    assert.equal(changes.status, 200, JSON.stringify(changes.body));
    assert.equal(changes.body.status, "changes_requested");

    // A second reviewer's stale tab (same version) can no longer approve the old evidence.
    const staleApprove = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve", expectedVersion: reviewedVersion }),
    });
    assert.equal(staleApprove.status, 409, JSON.stringify(staleApprove.body));

    const bobView = await request(`/api/business-claims/${bobDraft.body.id}`, { userId: users.bob });
    assert.equal(bobView.body.nextAction, "provide_changes");
    assert.equal(bobView.body.reviewNote, "Please add your KvK number.");
    const bobEdit = await request(`/api/business-claims/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: bobView.body.version, evidenceReference: "KvK 12345678" }),
    });
    assert.equal(bobEdit.status, 200);
    const bobFinal = await request(`/api/business-claims/${bobDraft.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: bobEdit.body.version }),
    });
    assert.equal(bobFinal.status, 200);
    assert.equal(bobFinal.body.status, "submitted");

    // The stale reviewer tab still shows the pre-edit version: rejected, ownership not granted.
    const staleAfterEdit = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve", expectedVersion: reviewedVersion }),
    });
    assert.equal(staleAfterEdit.status, 409);
    assert.equal(staleAfterEdit.body.expectedVersion, bobFinal.body.version);
    const noOwnerYet = await db
      .select()
      .from(businessMembersTable)
      .where(eq(businessMembersTable.businessProfileId, bobFinal.body.businessProfileId));
    assert.equal(noOwnerYet.length, 0, "a stale decision never grants ownership");

    const approved = await request(`/api/business-claims/moderation/${bobDraft.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve", expectedVersion: bobFinal.body.version }),
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, "approved");
    assert.equal(approved.body.profile.isClaimed, true);
    const owners = await db
      .select()
      .from(businessMembersTable)
      .where(eq(businessMembersTable.businessProfileId, approved.body.businessProfileId));
    assert.equal(owners.length, 1);
    assert.equal(owners[0].userId, users.bob);
    assert.equal(owners[0].role, "owner");
    const audit = await db.select().from(businessReviewsTable).where(eq(businessReviewsTable.targetId, bobDraft.body.id));
    assert.deepEqual(audit.map((row) => row.decision).sort(), ["approve", "request_changes"]);
    assert.deepEqual(
      audit.map((row) => [row.decision, row.targetVersion]).sort(),
      [["approve", bobFinal.body.version], ["request_changes", reviewedVersion]],
      "audit rows record the version whose evidence was reviewed, not the version the decision created",
    );

    // A later competing claim becomes disputed and cannot be approved while an owner exists.
    const aliceAgain = await request("/api/businesses", { method: "POST", body: JSON.stringify(payload) });
    assert.equal(aliceAgain.status, 201);
    const disputed = await request(`/api/business-claims/${aliceAgain.body.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(disputed.status, 200);
    assert.equal(disputed.body.status, "disputed");
    const approveDisputed = await request(`/api/business-claims/moderation/${aliceAgain.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "approve", expectedVersion: disputed.body.version }),
    });
    assert.equal(approveDisputed.status, 409, "no dual ownership");
    const rejectDisputed = await request(`/api/business-claims/moderation/${aliceAgain.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "reject", reviewNote: "Ownership is already verified for another representative.", expectedVersion: disputed.body.version }),
    });
    assert.equal(rejectDisputed.status, 200);
    const aliceList = await request("/api/business-claims");
    const rejected = aliceList.body.find((claim: { id: number }) => claim.id === aliceAgain.body.id);
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.reviewNote, "Ownership is already verified for another representative.");
    assert.ok(!JSON.stringify(aliceList.body).includes("KvK 12345678"), "competing claimant evidence is never exposed");
  });

  it("keeps new-business drafts private until publication and archives them on withdrawal", async () => {
    const created = await request("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Nieuwe Zaak ${runId}`, category: "Retail", neighborhood: "Bezuidenhout", websiteUrl: "https://nieuwezaak.example" },
        ...baseDraft,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.kind, "new_business");
    assert.equal(created.body.profile.publicationStatus, "draft");
    assert.equal(created.body.profile.category, "Retail");
    const slug: string = created.body.profile.slug;

    const publicProfile = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(publicProfile.status, 404, "drafts are not public");
    const lookup = await request(`/api/businesses/lookup?q=Nieuwe%20Zaak`, { userId: users.bob });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.matches.length, 0, "drafts are not discoverable by other users");

    const badUrl = await request(`/api/business-claims/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 1, business: { name: "X Y", category: "Retail", neighborhood: "Centrum", websiteUrl: "javascript:alert(1)" } }),
    });
    assert.equal(badUrl.status, 400);

    const edited = await request(`/api/business-claims/${created.body.id}`, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 1, business: { name: `Nieuwe Zaak ${runId} BV`, category: "Retail", neighborhood: "Centrum" } }),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.profile.name, `Nieuwe Zaak ${runId} BV`);
    assert.equal(edited.body.profile.neighborhood, "Centrum");

    const submitted = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, "submitted");
    assert.equal(submitted.body.profile.publicationStatus, "draft", "submission never publishes");

    const withdrawn = await request(`/api/business-claims/${created.body.id}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.profile.publicationStatus, "archived");
  });

  it("re-checks new-business submissions for duplicates and requires explicit confirmation", async () => {
    const created = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Bakkerij Intake ${runId}`, category: "Bakery", neighborhood: "Bezuidenhout" },
        ...baseDraft,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const blocked = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal(blocked.body.code, "DUPLICATE_CANDIDATES");
    assert.ok(blocked.body.duplicateCandidates.length >= 1);
    const names = blocked.body.duplicateCandidates.map((match: { name: string }) => match.name);
    assert.ok(names.includes(`Bakkerij Intake ${runId}`), "the equivalent public listing is shown");
    assert.ok(
      !blocked.body.duplicateCandidates.some((match: { listingSource: string }) => match.listingSource === "self_reported"),
      "the draft itself is never a candidate",
    );
    assert.ok(!JSON.stringify(blocked.body).includes("contact"), "candidates stay public-only");

    const stillDraft = await request(`/api/business-claims/${created.body.id}`, { userId: users.bob });
    assert.equal(stillDraft.body.status, "draft", "a blocked submission changes nothing");
    assert.equal(stillDraft.body.version, 1);

    // Cancelling is simply not confirming: the draft can be withdrawn instead.
    const confirmed = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1, confirmNoDuplicate: true }),
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.status, "submitted");

    const unknownName = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Unieke Zaak ${runId}`, category: "Retail", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    assert.equal(unknownName.status, 201);
    const direct = await request(`/api/business-claims/${unknownName.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(direct.status, 200, "no candidates means no confirmation step");

    lookupShouldFail = true;
    const third = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Bakkerij Derde ${runId}`, category: "Bakery", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    const unavailable = await request(`/api/business-claims/${third.body.id}/submit`, {
      method: "POST",
      userId: users.bob,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    lookupShouldFail = false;
    assert.equal(unavailable.status, 503, "a broken duplicate check never silently submits");
  });

  it("refuses request_changes on deal moderation", async () => {
    const result = await request(`/api/deals/moderation/1`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "request_changes", reviewNote: "x" }),
    });
    assert.equal(result.status, 400);
  });

  it("claims a stored google_maps listing through the production lookup and resolver chain", async () => {
    const lookup = await request(`/api/businesses/lookup?q=Kapsalon%20Stored`, { base: productionBaseUrl });
    assert.equal(lookup.status, 200, JSON.stringify(lookup.body));
    const match = lookup.body.matches.find((entry: { listingId: string }) => entry.listingId === storedGoogleListingId);
    assert.ok(match, "stored provider results are offered by lookup");
    assert.equal(match.listingSource, "google_maps");

    const created = await request("/api/businesses", {
      method: "POST",
      base: productionBaseUrl,
      body: JSON.stringify({
        kind: "existing_listing",
        listing: { cityId: match.cityId, listingSource: match.listingSource, listingId: match.listingId },
        ...baseDraft,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.profile.name, `Kapsalon Stored ${runId}`, "facts resolved from the stored listing, no live provider call");
    assert.equal(created.body.kind, "existing_listing");

    const unknown = await request("/api/businesses", {
      method: "POST",
      base: productionBaseUrl,
      body: JSON.stringify({
        kind: "existing_listing",
        listing: { cityId: "dhg", listingSource: "google_maps", listingId: "never-stored" },
        ...baseDraft,
      }),
    });
    assert.equal(unknown.status, 400, "an unknown identity is still not claimable");
  });

  it("replays the winner for concurrent same-key creation and keeps wildcard keys distinct", async () => {
    const key = `race_%_${runId}`;
    const body = JSON.stringify({
      kind: "new_business",
      business: { name: `Race Zaak ${runId}`, category: "Retail", neighborhood: "Centrum" },
      ...baseDraft,
    });
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request("/api/businesses", { method: "POST", userId: users.bob, headers: { "Idempotency-Key": key }, body }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 200, 200, 201], JSON.stringify(responses.map((r) => r.body)));
    const ids = new Set(responses.map((response) => response.body.id));
    assert.equal(ids.size, 1, "every caller sees the same claim");

    // `%` in the key must not match a different key for the same claimant.
    const sibling = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      headers: { "Idempotency-Key": `race_x_${runId}` },
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Andere Zaak ${runId}`, category: "Retail", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    assert.equal(sibling.status, 201, JSON.stringify(sibling.body));
    assert.notEqual(sibling.body.id, [...ids][0]);

    const reused = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Race Zaak Anders ${runId}`, category: "Retail", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    assert.equal(reused.status, 409, "same key with other input is a conflict, never a silent replay");

    // Concurrent same-key requests with DIFFERENT payloads: exactly one claim wins; the rest are conflicts.
    const raceKey = `race_diff_${runId}`;
    const mixed = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        request("/api/businesses", {
          method: "POST",
          userId: users.bob,
          headers: { "Idempotency-Key": raceKey },
          body: JSON.stringify({
            kind: "new_business",
            business: { name: `Race Variant ${index} ${runId}`, category: "Retail", neighborhood: "Centrum" },
            ...baseDraft,
          }),
        }),
      ),
    );
    const winners = mixed.filter((response) => response.status === 201);
    assert.equal(winners.length, 1, JSON.stringify(mixed.map((r) => [r.status, r.body.code ?? r.body.id])));
    for (const response of mixed) {
      if (response.status === 201) continue;
      assert.equal(response.status, 409);
      assert.equal(response.body.code, "IDEMPOTENCY_CONFLICT");
    }
    const variantClaims = await db
      .select({ id: businessClaimsTable.id })
      .from(businessClaimsTable)
      .where(and(eq(businessClaimsTable.claimantId, users.bob), eq(businessClaimsTable.idempotencyKey, raceKey)));
    assert.equal(variantClaims.length, 1, "the unique index covers the exact raw key");

    // A key that is a colon-prefixed extension of another key is a distinct key.
    const extended = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      headers: { "Idempotency-Key": `${raceKey}:other` },
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Extended Key Zaak ${runId}`, category: "Retail", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    assert.equal(extended.status, 201, JSON.stringify(extended.body));
    const shortReplay = await request("/api/businesses", {
      method: "POST",
      userId: users.bob,
      headers: { "Idempotency-Key": raceKey },
      body: JSON.stringify({
        kind: "new_business",
        business: { name: `Race Variant ${mixed.findIndex((r) => r.status === 201)} ${runId}`, category: "Retail", neighborhood: "Centrum" },
        ...baseDraft,
      }),
    });
    assert.equal(shortReplay.status, 200, "the shorter key still replays its own winner, not the extended key");
    assert.equal(shortReplay.body.id, winners[0].body.id);
  });

  it("resolves every profile-kind lookup match from its trusted published profile", async () => {
    // A Google-backed profile whose provider results aged out of the stored window,
    // and a published self-reported profile: neither exists in external-results.
    const seeded = await db.insert(businessProfilesTable).values([
      {
        slug: `aged-google-${runId}`,
        cityId: "dhg",
        listingSource: "google_maps",
        listingId: agedGoogleListingId,
        name: `Aged Google Zaak ${runId}`,
        category: "Retail",
        neighborhood: "Centrum",
        publicationStatus: "published",
      },
      {
        slug: `published-selfrep-${runId}`,
        cityId: "dhg",
        listingSource: "self_reported",
        listingId: publishedSelfReportedListingId,
        name: `Published Selfrep Zaak ${runId}`,
        category: "Services",
        neighborhood: "Centrum",
        publicationStatus: "published",
      },
    ]).returning({ id: businessProfilesTable.id, listingId: businessProfilesTable.listingId });
    const profileIdByListing = new Map(seeded.map((row) => [row.listingId, row.id]));
    for (const [needle, source, id] of [
      ["Aged%20Google%20Zaak", "google_maps", agedGoogleListingId],
      ["Published%20Selfrep%20Zaak", "self_reported", publishedSelfReportedListingId],
    ] as const) {
      const lookup = await request(`/api/businesses/lookup?q=${needle}`, { base: productionBaseUrl });
      assert.equal(lookup.status, 200);
      const match = lookup.body.matches.find((entry: { listingId: string }) => entry.listingId === id);
      assert.ok(match, `${source} profile is offered by lookup`);
      assert.equal(match.kind, "profile");
      const created = await request("/api/businesses", {
        method: "POST",
        base: productionBaseUrl,
        userId: users.alice,
        body: JSON.stringify({
          kind: "existing_listing",
          listing: { cityId: match.cityId, listingSource: match.listingSource, listingId: match.listingId },
          ...baseDraft,
        }),
      });
      assert.equal(created.status, 201, `${source}: ${JSON.stringify(created.body)}`);
      assert.equal(created.body.businessProfileId, profileIdByListing.get(id), "the claim attaches to the trusted profile row");
      assert.equal(created.body.profile.name, match.name);
    }
  });

  it("refuses claim decisions by an editor who already belongs to the business", async () => {
    const created = await request("/api/businesses", {
      method: "POST",
      userId: users.alice,
      body: JSON.stringify({
        kind: "existing_listing",
        listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: otherListingId },
        ...baseDraft,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await db.insert(businessMembersTable).values({
      businessProfileId: created.body.businessProfileId,
      userId: users.ownerEditor,
      role: "owner",
    });
    const submitted = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      userId: users.alice,
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, "disputed");

    for (const decision of ["reject", "request_changes"] as const) {
      const result = await request(`/api/business-claims/moderation/${created.body.id}`, {
        method: "PATCH",
        userId: users.ownerEditor,
        headers: { "x-test-editor": "1" },
        body: JSON.stringify({ decision, reviewNote: "Not yours.", expectedVersion: submitted.body.version }),
      });
      assert.equal(result.status, 403, `${decision}: ${JSON.stringify(result.body)}`);
    }
    const unchanged = await request(`/api/business-claims/${created.body.id}`, { userId: users.alice });
    assert.equal(unchanged.body.status, "disputed", "the owning editor's decision never lands");
    assert.equal(unchanged.body.version, submitted.body.version);

    const neutral = await request(`/api/business-claims/moderation/${created.body.id}`, {
      method: "PATCH",
      userId: users.editor,
      headers: { "x-test-editor": "1" },
      body: JSON.stringify({ decision: "reject", reviewNote: "Ownership already verified.", expectedVersion: submitted.body.version }),
    });
    assert.equal(neutral.status, 200, JSON.stringify(neutral.body));
  });
});
