import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { and, eq, inArray, or } from "drizzle-orm";
import express from "express";

import {
  appUsersTable,
  businessClaimsTable,
  businessMembersTable,
  businessProfileRevisionsTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  factChecksTable,
  pool,
} from "@workspace/db";

import { createBusinessPublicationRouter } from "./business-publication";
import { createBusinessesRouter } from "./businesses";
import { createBusinessIntakeRouter } from "./business-intake";
import { sql } from "drizzle-orm";
import { BACKFILL_ACTOR_ID, backfillApprovedRevisions } from "../lib/businessRevisionBackfill";
import type { Identity } from "../lib/permissions";

/**
 * Review publication routes: independent ownership / editorial / publication
 * / freshness dimensions, exact-version decisions, self-review refusal, and an
 * approved-only public projection.
 */

const runId = `${process.pid}-${Date.now()}`;
const users = {
  owner: `pub-test-${runId}-owner`,
  other: `pub-test-${runId}-other`,
  claimant: `pub-test-${runId}-claimant`,
  reviewer: `pub-test-${runId}-reviewer`,
  reviewer2: `pub-test-${runId}-reviewer2`,
  unverified: `pub-test-${runId}-unverified`,
  claimantEditor: `pub-test-${runId}-claimant-editor`,
};
const allUserIds = Object.values(users);
const listingId = `pub-test-listing-${runId}`;
const legacyListingId = `pub-test-legacy-${runId}`;
const claimListingId = `pub-test-claim-${runId}`;
const rolloutListingId = `pub-test-rollout-${runId}`;
const slug = `pub-test-${runId}`;
const legacySlug = `pub-legacy-${runId}`;
const claimSlug = `pub-claim-${runId}`;

let flags = { accounts: true, businessIntake: true, businessPublication: true, consumerRegistration: false };
let clock = new Date("2026-09-14T10:00:00.000Z");

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
    flags: () => flags,
  }),
);
app.use(
  "/api",
  createBusinessPublicationRouter({ resolveIdentity: identityFromHeaders, flags: () => flags, now: () => clock }),
);
app.use(
  "/api",
  createBusinessIntakeRouter({
    resolveIdentity: identityFromHeaders,
    flags: () => flags,
    lookupListings: async () => [],
    resolveListing: async (cityId, source, id) =>
      cityId === "dhg" && source === "openstreetmap" && (id === rolloutListingId || id === claimListingId)
        ? {
            id,
            locationId: "dhg",
            name: id === rolloutListingId ? `Rollout Business ${runId}` : `Claimable Business ${runId}`,
            address: "Teststraat 2, Den Haag",
            neighborhood: "Bezuidenhout",
            lat: 52.08,
            lng: 4.33,
            sourceUrl: "https://www.openstreetmap.org/node/2",
            source: "openstreetmap",
          }
        : null,
    lookupRateLimit: { limit: 50, windowMs: 60_000 },
  }),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let profileId = 0;
let legacyProfileId = 0;
let claimProfileId = 0;
let claimId = 0;

async function request(
  path: string,
  init: RequestInit & { userId?: string | null; editor?: boolean } = {},
): Promise<{ status: number; body: any }> {
  const { userId = users.owner, editor = false, headers, ...rest } = init;
  const result = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-user-id": userId } : {}),
      ...(editor ? { "x-test-editor": "1" } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  return { status: result.status, body: await result.json() };
}

const asReviewer = { userId: users.reviewer, editor: true };
const asReviewer2 = { userId: users.reviewer2, editor: true };

function json(body: unknown) {
  return JSON.stringify(body);
}

async function seed(): Promise<void> {
  const [profile] = await db
    .insert(businessProfilesTable)
    .values({
      slug,
      cityId: "dhg",
      listingSource: "openstreetmap",
      listingId,
      name: `Publication Test ${runId}`,
      neighborhood: "Bezuidenhout",
      sourceUrl: "https://www.openstreetmap.org/node/42",
      tagline: "Legacy tagline",
      description: "Legacy description",
      phone: "+31 70 000 0000",
      isClaimed: true,
      claimedAt: new Date(),
      publicationStatus: "published",
    })
    .returning();
  profileId = profile.id;
  await db.insert(businessMembersTable).values({ businessProfileId: profileId, userId: users.owner, role: "owner" });

  const [legacy] = await db
    .insert(businessProfilesTable)
    .values({
      slug: legacySlug,
      cityId: "dhg",
      listingSource: "openstreetmap",
      listingId: legacyListingId,
      name: `Legacy Column Business ${runId}`,
      tagline: "Served from columns",
      isClaimed: true,
      claimedAt: new Date(),
      publicationStatus: "published",
    })
    .returning();
  legacyProfileId = legacy.id;

  const [claimProfile] = await db
    .insert(businessProfilesTable)
    .values({
      slug: claimSlug,
      cityId: "dhg",
      listingSource: "openstreetmap",
      listingId: claimListingId,
      name: `Claimable Business ${runId}`,
      isClaimed: false,
      publicationStatus: "published",
    })
    .returning();
  claimProfileId = claimProfile.id;
  const [claim] = await db
    .insert(businessClaimsTable)
    .values({
      businessProfileId: claimProfileId,
      claimantId: users.claimant,
      contactName: "Claire Claimant",
      contactEmail: "claire@example.com",
      relationship: "Owner",
      authorityDeclaration: "I run this shop daily.",
      evidenceReference: "KvK 12345678",
      status: "submitted",
      version: 3,
    })
    .returning();
  claimId = claim.id;
}

async function cleanup(): Promise<void> {
  const profiles = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(
      or(
        inArray(businessProfilesTable.listingId, [listingId, legacyListingId, claimListingId, rolloutListingId]),
        inArray(businessProfilesTable.createdByUserId, allUserIds),
      ),
    );
  const ids = profiles.map((row) => row.id);
  if (ids.length > 0) {
    const revisions = await db
      .select({ id: businessProfileRevisionsTable.id })
      .from(businessProfileRevisionsTable)
      .where(inArray(businessProfileRevisionsTable.businessProfileId, ids));
    if (revisions.length > 0) {
      await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, revisions.map((r) => r.id)));
    }
    const claims = await db
      .select({ id: businessClaimsTable.id })
      .from(businessClaimsTable)
      .where(inArray(businessClaimsTable.businessProfileId, ids));
    if (claims.length > 0) {
      await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, claims.map((c) => c.id)));
    }
    await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, ids));
    await db.delete(businessProfilesTable).where(inArray(businessProfilesTable.id, ids));
  }
  await db.delete(businessMembersTable).where(inArray(businessMembersTable.userId, allUserIds));
  await db.delete(businessClaimsTable).where(inArray(businessClaimsTable.claimantId, allUserIds));
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUserIds));
}

const draftV1 = {
  nl: { tagline: "Verse broodjes", description: "Bakkerij in Bezuidenhout sinds 1990." },
  en: { tagline: "Fresh rolls" },
  facts: { websiteUrl: "https://example.com", phone: "+31 70 123 4567" },
};

describe("business publication routes", () => {
  before(async () => {
    await cleanup();
    await seed();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await cleanup();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  });

  it("hides every publication route behind the flag", async () => {
    flags = { ...flags, businessPublication: false, consumerRegistration: false };
    for (const [method, path] of [
      ["GET", `/api/business-profiles/${profileId}/revision`],
      ["PATCH", `/api/business-profiles/${profileId}/revision`],
      ["GET", "/api/review/claims"],
      ["GET", "/api/review/revisions"],
      ["GET", "/api/review/businesses"],
      ["POST", `/api/review/businesses/${profileId}/publication`],
    ] as const) {
      const response = await request(path, { method, ...(method === "GET" ? {} : { body: json({}) }), ...asReviewer });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.body.code, "FEATURE_DISABLED");
    }
    flags = { ...flags, businessPublication: true, consumerRegistration: false };
  });

  it("serves the workspace only to members and never to strangers", async () => {
    const anonymous = await request(`/api/business-profiles/${profileId}/revision`, { userId: null });
    assert.equal(anonymous.status, 401);
    const stranger = await request(`/api/business-profiles/${profileId}/revision`, { userId: users.other });
    assert.equal(stranger.status, 404, "non-members cannot tell the business apart from a missing one");
    assert.equal(stranger.body.code, "NOT_FOUND");
    const owner = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(owner.status, 200);
    assert.equal(owner.body.state, "unknown");
    assert.equal(owner.body.latestRevision, null);
    assert.equal(owner.body.approvedRevision, null);
    assert.equal(owner.body.freshness.status, "unverified");
    assert.equal(owner.body.profile.publicationStatus, "published");
  });

  it("creates a draft seeded from legacy columns, edits it in place, and rejects bad input", async () => {
    const unverified = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      userId: users.unverified,
      headers: { "x-test-unverified": "1" },
      body: json({ expectedVersion: 0, nl: { tagline: "x" } }),
    });
    assert.equal(unverified.status, 403);
    assert.equal(unverified.body.code, "EMAIL_UNVERIFIED");

    const unknownField = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 0, nl: { tagline: "x", slogan: "y" }, status: "approved" }),
    });
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.code, "UNKNOWN_FIELD");
    assert.deepEqual(
      unknownField.body.fieldErrors.map((error: { field: string }) => error.field).sort(),
      ["nl.slogan", "status"],
    );

    const badUrl = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 0, facts: { websiteUrl: "javascript:alert(1)" } }),
    });
    assert.equal(badUrl.status, 400);
    assert.equal(badUrl.body.code, "VALIDATION_FAILED");
    assert.deepEqual(badUrl.body.fieldErrors, [{ field: "facts.websiteUrl", code: "invalid_url" }]);
    const badEmail = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 0, facts: { email: "not-an-email" } }),
    });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.code, "VALIDATION_FAILED");
    assert.equal(badEmail.body.fieldErrors[0].field, "facts.email");

    const stale = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 7, ...draftV1 }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "VERSION_CONFLICT");
    assert.equal(stale.body.expectedVersion, 0);

    const created = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 0, nl: { tagline: "  Verse\u0000 broodjes " } }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.state, "draft");
    assert.equal(created.body.latestRevision.version, 1);
    assert.equal(created.body.latestRevision.status, "draft");
    assert.equal(created.body.latestRevision.content.nl.tagline, "Verse broodjes", "control characters stripped");
    assert.equal(created.body.latestRevision.content.nl.description, "Legacy description", "seeded from columns");
    assert.equal(created.body.latestRevision.content.facts.phone, "+31 70 000 0000");
    assert.equal(created.body.latestRevision.content.en.tagline, null, "nothing is invented for English");

    const edited = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 1, ...draftV1 }),
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.latestRevision.version, 1, "a draft is edited in place");
    assert.equal(edited.body.latestRevision.content.nl.description, draftV1.nl.description);
    assert.equal(edited.body.latestRevision.content.facts.phone, "+31 70 123 4567");

    const asMemberOnly = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      userId: users.other,
      body: json({ expectedVersion: 1, nl: { tagline: "hijack" } }),
    });
    assert.equal(asMemberOnly.status, 404, "cross-business access is refused");
  });

  it("keeps drafts private: without an approved snapshot nothing is served, never the mutable columns", async () => {
    const pub = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(pub.status, 404, "no legacy column fallback while publication is on");
    assert.ok(!JSON.stringify(pub.body).includes("Verse broodjes"), "draft text never leaks publicly");
    assert.ok(!JSON.stringify(pub.body).includes("Legacy tagline"));
  });

  it("submits the draft, freezes it, and shows it in the editorial queue with non-sensitive context", async () => {
    const wrongVersion = await request(`/api/business-profiles/${profileId}/revision/submit`, {
      method: "POST",
      body: json({ expectedVersion: 2 }),
    });
    assert.equal(wrongVersion.status, 409);
    assert.equal(wrongVersion.body.expectedVersion, 1);

    const submitted = await request(`/api/business-profiles/${profileId}/revision/submit`, {
      method: "POST",
      body: json({ expectedVersion: 1 }),
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.state, "submitted");
    assert.equal(submitted.body.latestRevision.status, "submitted");
    assert.ok(submitted.body.latestRevision.submittedAt);

    const frozen = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 1, nl: { tagline: "late edit" } }),
    });
    assert.equal(frozen.status, 409, "submitted content is immutable");
    assert.equal(frozen.body.fieldErrors[0].code, "not_editable");

    const notEditor = await request("/api/review/revisions", { userId: users.other });
    assert.equal(notEditor.status, 403);
    assert.equal(notEditor.body.code, "FORBIDDEN");

    const queue = await request("/api/review/revisions?limit=1", asReviewer);
    assert.equal(queue.status, 200);
    const item = queue.body.items.find((entry: any) => entry.profile.id === profileId);
    assert.ok(item, "submitted revision is queued");
    assert.equal(item.revision.version, 1);
    assert.equal(item.approvedRevision, null);
    assert.equal(item.canDecide, true);
    assert.deepEqual(Object.keys(item.profile).sort(), [
      "category",
      "id",
      "isClaimed",
      "listingSource",
      "name",
      "neighborhood",
      "publicationStatus",
      "slug",
      "sourceUrl",
    ]);
    assert.ok(!JSON.stringify(queue.body).includes(users.owner), "author identity is not exposed in the queue");
    assert.equal(typeof queue.body.pageInfo.hasMore, "boolean");
  });

  it("treats an editor with an active claim on a listing-derived business as an interested party", async () => {
    const [claim] = await db
      .insert(businessClaimsTable)
      .values({
        businessProfileId: profileId,
        claimantId: users.claimantEditor,
        contactName: "Eddie Editor",
        contactEmail: "eddie@example.com",
        relationship: "Manager",
        authorityDeclaration: "I also work here.",
        status: "pending",
        version: 1,
      })
      .returning();
    const asClaimantEditor = { userId: users.claimantEditor, editor: true };

    const editorial = await request("/api/review/revisions?limit=50", asClaimantEditor);
    const queued = editorial.body.items.find((entry: any) => entry.profile.id === profileId);
    assert.equal(queued?.canDecide, false, "claimant-editor cannot decide the revision");
    const decision = await request(`/api/review/revisions/${queued.revision.id}/decision`, {
      method: "POST",
      ...asClaimantEditor,
      body: json({ decision: "approve", expectedVersion: 1 }),
    });
    assert.equal(decision.status, 403);
    assert.equal(decision.body.code, "SELF_REVIEW_FORBIDDEN");

    const suspend = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asClaimantEditor,
      body: json({ action: "suspend", expectedRevisionVersion: 0, reason: "I want it gone." }),
    });
    assert.equal(suspend.status, 403);
    assert.equal(suspend.body.code, "SELF_REVIEW_FORBIDDEN");
    const [untouched] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
    assert.equal(untouched.publicationStatus, "published");

    // A withdrawn claim no longer makes the editor an interested party.
    await db.update(businessClaimsTable).set({ status: "withdrawn" }).where(eq(businessClaimsTable.id, claim.id));
    const later = await request("/api/review/revisions?limit=50", asClaimantEditor);
    assert.equal(later.body.items.find((entry: any) => entry.profile.id === profileId)?.canDecide, true);
  });

  it("paginates the authority queue without e-mail addresses and blocks self-review", async () => {
    const queue = await request("/api/review/claims?limit=1", asReviewer);
    assert.equal(queue.status, 200);
    assert.equal(queue.body.items.length <= 1, true);
    let items = [...queue.body.items];
    let cursor = queue.body.pageInfo.nextCursor;
    let guard = 0;
    while (cursor && guard++ < 50) {
      const next = await request(`/api/review/claims?limit=1&cursor=${cursor}`, asReviewer);
      items = items.concat(next.body.items);
      cursor = next.body.pageInfo.nextCursor;
    }
    const item = items.find((entry) => entry.id === claimId);
    assert.ok(item, "submitted claim appears across pages");
    assert.equal(item.version, 3);
    assert.equal(item.authorityDeclaration, "I run this shop daily.");
    assert.equal(item.evidenceReference, "KvK 12345678");
    assert.ok(!("contactEmail" in item), "no e-mail in the queue");
    assert.ok(!JSON.stringify(queue.body).includes("claire@example.com"));

    const asClaimant = await request(`/api/review/claims?limit=50`, { userId: users.claimant, editor: true });
    const own = asClaimant.body.items.find((entry: any) => entry.id === claimId);
    assert.equal(own?.canDecide, false, "claimant-reviewer sees the claim but cannot decide it");

    const selfReview = await request(`/api/review/claims/${claimId}/decision`, {
      method: "POST",
      userId: users.claimant,
      editor: true,
      body: json({ decision: "approve", expectedVersion: 3 }),
    });
    assert.equal(selfReview.status, 403);
    assert.equal(selfReview.body.code, "SELF_REVIEW_FORBIDDEN");
  });

  it("requires a reason for non-approval and returns 409 for stale claim decisions", async () => {
    const noReason = await request(`/api/review/claims/${claimId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "request_changes", expectedVersion: 3 }),
    });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.fieldErrors[0].field, "reason");

    const stale = await request(`/api/review/claims/${claimId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: 2 }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "VERSION_CONFLICT");
    assert.equal(stale.body.expectedVersion, 3);

    const changes = await request(`/api/review/claims/${claimId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "request_changes", expectedVersion: 3, reason: "Please add a KvK extract." }),
    });
    assert.equal(changes.status, 200);
    assert.equal(changes.body.status, "changes_requested");
    assert.equal(changes.body.version, 4);
    assert.equal(changes.body.reviewNote, "Please add a KvK extract.");

    // Claimant resubmits (simulated) and approval grants exactly one owner membership.
    await db.update(businessClaimsTable).set({ status: "submitted", version: 5 }).where(eq(businessClaimsTable.id, claimId));
    const approve = await request(`/api/review/claims/${claimId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: 5 }),
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.status, "approved");
    assert.equal(approve.body.profile.isClaimed, true);
    const members = await db
      .select()
      .from(businessMembersTable)
      .where(eq(businessMembersTable.businessProfileId, claimProfileId));
    assert.equal(members.length, 1);
    assert.equal(members[0].userId, users.claimant);
    assert.equal(members[0].role, "owner");
    const audit = await db
      .select()
      .from(businessReviewsTable)
      .where(eq(businessReviewsTable.targetId, claimId));
    assert.deepEqual(
      audit.filter((row) => row.targetType === "claim").map((row) => [row.decision, row.targetVersion]).sort(),
      [
        ["approve", 5],
        ["request_changes", 3],
      ],
    );
  });

  it("rejects stale or self revision decisions and requires reasons", async () => {
    const workspace = await request(`/api/business-profiles/${profileId}/revision`);
    const revisionId = workspace.body.latestRevision.id;

    const owner = await request(`/api/review/revisions/${revisionId}/decision`, {
      method: "POST",
      userId: users.owner,
      editor: true,
      body: json({ decision: "approve", expectedVersion: 1 }),
    });
    assert.equal(owner.status, 403, "an owner-editor cannot approve their own revision");
    assert.equal(owner.body.code, "SELF_REVIEW_FORBIDDEN");

    const stale = await request(`/api/review/revisions/${revisionId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: 9 }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.expectedVersion, 1);

    const noReason = await request(`/api/review/revisions/${revisionId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "request_changes", expectedVersion: 1 }),
    });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.code, "VALIDATION_FAILED");

    const badCheck = await request(`/api/review/revisions/${revisionId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({
        decision: "approve",
        expectedVersion: 1,
        factChecks: [{ field: "phone", status: "confirmed", sourceUrl: "ftp://nope" }],
      }),
    });
    assert.equal(badCheck.status, 400);
    assert.equal(badCheck.body.fieldErrors[0].field, "factChecks.0.sourceUrl");
  });

  it("requests changes, lets the owner resubmit as a new version, and then approves exactly that version", async () => {
    const workspace = await request(`/api/business-profiles/${profileId}/revision`);
    const v1Id = workspace.body.latestRevision.id;
    const changes = await request(`/api/review/revisions/${v1Id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "request_changes", expectedVersion: 1, reason: "Please add opening hours." }),
    });
    assert.equal(changes.status, 200);
    assert.equal(changes.body.revision.status, "changes_requested");

    const ownerView = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(ownerView.body.state, "changes_requested");
    assert.equal(ownerView.body.latestDecision.decision, "request_changes");
    assert.equal(ownerView.body.latestDecision.reason, "Please add opening hours.");
    assert.ok(!("reviewerUserId" in ownerView.body.latestDecision), "reviewer identity stays private");

    const v2 = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 1, nl: { openingHours: "ma-vr 08:00-18:00" }, en: { openingHours: "Mon-Fri 8am-6pm" } }),
    });
    assert.equal(v2.status, 200);
    assert.equal(v2.body.latestRevision.version, 2, "changes create a new version");
    assert.equal(v2.body.latestRevision.content.nl.description, draftV1.nl.description, "carried over");
    assert.equal(v2.body.latestRevision.content.nl.openingHours, "ma-vr 08:00-18:00");
    const submit = await request(`/api/business-profiles/${profileId}/revision/submit`, {
      method: "POST",
      body: json({ expectedVersion: 2 }),
    });
    assert.equal(submit.status, 200);
    const v2Id = submit.body.latestRevision.id;

    // A reviewer still holding v1 (already decided) cannot act on it.
    const staleV1 = await request(`/api/review/revisions/${v1Id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: 1 }),
    });
    assert.equal(staleV1.status, 409, "decided or superseded versions cannot be approved");

    const approve = await request(`/api/review/revisions/${v2Id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({
        decision: "approve",
        expectedVersion: 2,
        factChecks: [
          { field: "phone", status: "confirmed", sourceUrl: "https://example.com/contact" },
          { field: "websiteUrl", status: "contradicted", note: "Domain is parked." },
          { field: "openingHours", status: "unavailable" },
        ],
      }),
    });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.revision.status, "approved");
    assert.equal(approve.body.approvedRevision.version, 2);

    const after = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(after.body.state, "published", "approved snapshot of an already-published business");
    assert.equal(after.body.approvedRevision.version, 2);
    assert.equal(after.body.latestRevision.version, 2);
    assert.equal(after.body.freshness.status, "fresh");
    assert.equal(after.body.factChecks.length, 3);
    const contradicted = after.body.factChecks.find((check: any) => check.field === "websiteUrl");
    assert.equal(contradicted.note, "Domain is parked.", "owner sees the reviewer note");

    const doubleApprove = await request(`/api/review/revisions/${v2Id}/decision`, {
      method: "POST",
      ...asReviewer2,
      body: json({ decision: "approve", expectedVersion: 2 }),
    });
    assert.equal(doubleApprove.status, 409, "a second stale approval is a conflict, not a duplicate audit row");
  });

  it("serves only the approved snapshot publicly, withholding contradicted fields, with provenance", async () => {
    const pub = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.tagline, "Verse broodjes");
    assert.equal(pub.body.description, draftV1.nl.description);
    assert.equal(pub.body.openingHours, "ma-vr 08:00-18:00");
    assert.equal(pub.body.phone, "+31 70 123 4567");
    assert.equal(pub.body.websiteUrl, null, "contradicted field is withheld");
    assert.equal(pub.body.content.en.tagline, "Fresh rolls");
    assert.equal(pub.body.content.en.description, null, "no invented English");
    assert.equal(pub.body.content.facts.websiteUrl, null);
    assert.equal(pub.body.approvedRevisionVersion, 2);
    assert.equal(pub.body.provenance.approvedVersion, 2);
    assert.equal(pub.body.provenance.listingSource, "openstreetmap");
    assert.equal(pub.body.provenance.sourceUrl, "https://www.openstreetmap.org/node/42");
    assert.equal(pub.body.provenance.freshness.status, "fresh");
    assert.equal(pub.body.provenance.checks.length, 3);
    for (const check of pub.body.provenance.checks) {
      assert.deepEqual(Object.keys(check).sort(), ["checkedOn", "field", "sourceUrl", "status"]);
    }
    const text = JSON.stringify(pub.body);
    assert.ok(!text.includes("Domain is parked"), "reviewer notes never go public");
    assert.ok(!text.includes(users.reviewer), "reviewer identity never goes public");
    assert.ok(!text.includes("Legacy tagline"), "legacy columns are ignored once a snapshot exists");
  });

  it("keeps the published snapshot while a newer draft is edited and after a rejected revision", async () => {
    const v3 = await request(`/api/business-profiles/${profileId}/revision`, {
      method: "PATCH",
      body: json({ expectedVersion: 2, nl: { tagline: "Nog niet goedgekeurd" } }),
    });
    assert.equal(v3.status, 200);
    assert.equal(v3.body.latestRevision.version, 3);
    assert.equal(v3.body.approvedRevision.version, 2, "approved pointer untouched");
    const pub = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(pub.body.tagline, "Verse broodjes");

    const submit = await request(`/api/business-profiles/${profileId}/revision/submit`, {
      method: "POST",
      body: json({ expectedVersion: 3 }),
    });
    const reject = await request(`/api/review/revisions/${submit.body.latestRevision.id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "reject", expectedVersion: 3, reason: "Marketing claims cannot be verified." }),
    });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.approvedRevision.version, 2);
    const afterReject = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(afterReject.body.tagline, "Verse broodjes");
    const owner = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(owner.body.state, "published");
    assert.equal(owner.body.latestDecision.decision, "reject");

    // Legacy owner PATCH goes into a draft revision, never into the public columns.
    const legacyEdit = await request(`/api/business-profiles/${profileId}`, {
      method: "PATCH",
      body: json({ tagline: "Via legacy PATCH" }),
    });
    assert.equal(legacyEdit.status, 200);
    const afterLegacy = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(afterLegacy.body.tagline, "Verse broodjes");
    const draft = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(draft.body.latestRevision.version, 4);
    assert.equal(draft.body.latestRevision.content.nl.tagline, "Via legacy PATCH");
    const discard = await request(`/api/business-profiles/${profileId}/revision/discard`, {
      method: "POST",
      body: json({ expectedVersion: 4 }),
    });
    assert.equal(discard.status, 200);
    assert.equal(discard.body.state, "published");
    assert.equal(discard.body.latestRevision.version, 3, "discarded drafts drop out of the timeline");
  });

  it("suspends, unpublishes, and republishes with an exact snapshot version and full audit", async () => {
    const owner = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      userId: users.owner,
      editor: true,
      body: json({ action: "suspend", expectedRevisionVersion: 2, reason: "x" }),
    });
    assert.equal(owner.status, 403);
    assert.equal(owner.body.code, "SELF_REVIEW_FORBIDDEN");

    const noReason = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "suspend", expectedRevisionVersion: 2 }),
    });
    assert.equal(noReason.status, 400);

    const stale = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "suspend", expectedRevisionVersion: 1, reason: "Complaint received." }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.expectedVersion, 2);

    const suspend = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "suspend", expectedRevisionVersion: 2, reason: "Complaint received." }),
    });
    assert.equal(suspend.status, 200);
    assert.equal(suspend.body.profile.publicationStatus, "suspended");
    assert.equal(suspend.body.latestDecision.decision, "suspend");

    const pub = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(pub.status, 404, "suspended businesses are not public");
    const ownerView = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(ownerView.body.state, "suspended");
    assert.equal(ownerView.body.latestDecision.reason, "Complaint received.");
    assert.equal(ownerView.body.approvedRevision.version, 2, "snapshot preserved");

    const republish = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "publish", expectedRevisionVersion: 2 }),
    });
    assert.equal(republish.status, 200);
    assert.equal(republish.body.profile.publicationStatus, "published");
    const back = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(back.status, 200);
    assert.equal(back.body.tagline, "Verse broodjes", "publication rollback restores exactly the approved snapshot");

    const unpublish = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "unpublish", expectedRevisionVersion: 2, reason: "Owner asked for a pause." }),
    });
    assert.equal(unpublish.status, 200);
    assert.equal(unpublish.body.profile.publicationStatus, "unpublished");
    const gone = await request(`/api/business-profiles/public/${slug}`, { userId: null });
    assert.equal(gone.status, 404);
    const unpublishedOwner = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(unpublishedOwner.body.state, "unpublished");

    const invalid = await request(`/api/review/businesses/${profileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "unpublish", expectedRevisionVersion: 2, reason: "again" }),
    });
    assert.equal(invalid.status, 409, "unpublished -> unpublished is not a transition");

    const audit = await db
      .select()
      .from(businessReviewsTable)
      .where(eq(businessReviewsTable.targetId, profileId));
    assert.deepEqual(
      audit.filter((row) => row.targetType === "publication").map((row) => row.decision),
      ["suspend", "publish", "unpublish"],
    );

    const list = await request("/api/review/businesses?limit=50", asReviewer);
    assert.equal(list.status, 200);
    const item = list.body.items.find((entry: any) => entry.profile.id === profileId);
    assert.equal(item.profile.publicationStatus, "unpublished");
    assert.equal(item.approvedRevision.version, 2);
    assert.equal(item.canDecide, true);
  });

  it("refuses to publish a business without an approved snapshot", async () => {
    await db.update(businessProfilesTable).set({ publicationStatus: "unpublished" }).where(eq(businessProfilesTable.id, legacyProfileId));
    const publish = await request(`/api/review/businesses/${legacyProfileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "publish", expectedRevisionVersion: 0 }),
    });
    assert.equal(publish.status, 409);
    assert.equal(publish.body.fieldErrors[0].field, "approvedRevision");
    await db.update(businessProfilesTable).set({ publicationStatus: "published" }).where(eq(businessProfilesTable.id, legacyProfileId));
  });

  it("flags a re-check as due before freshness flips to stale, without changing the owner state", async () => {
    const before = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(before.body.freshness.status, "fresh");
    assert.equal(before.body.freshness.recheckDue, false, "freshly confirmed facts are not due yet");
    assert.equal(before.body.freshness.recheckWindowDays, 30);
    assert.equal(
      new Date(before.body.freshness.staleOn).getTime(),
      new Date(before.body.freshness.checkedOn).getTime() + 180 * 86_400_000,
      "staleOn is derived from the confirmed check date, never stored",
    );

    // 159 days after the confirmation: still fresh, but inside the 30-day re-check window.
    clock = new Date("2027-02-20T10:00:00.000Z");
    await db.update(businessProfilesTable).set({ publicationStatus: "unpublished" }).where(eq(businessProfilesTable.id, profileId));
    const owner = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(owner.body.freshness.status, "fresh");
    assert.equal(owner.body.freshness.recheckDue, true);
    assert.equal(owner.body.freshness.daysUntilStale, 21);
    assert.equal(owner.body.state, "unpublished", "freshness stays independent from publication status");

    const queue = await request("/api/review/businesses?limit=50", asReviewer);
    assert.equal(queue.status, 200);
    const item = queue.body.items.find((entry: any) => entry.profile.id === profileId);
    assert.equal(item.freshness.recheckDue, true, "reviewers see the same soon-stale flag in the publication queue");
    assert.equal(item.freshness.staleOn, owner.body.freshness.staleOn);
    for (const entry of queue.body.items) {
      if (entry.freshness.checkedOn !== null) continue;
      assert.equal(entry.freshness.status, "unverified");
      assert.equal(entry.freshness.recheckDue, false, "an unverified snapshot never gets an invented check date");
      assert.equal(entry.freshness.staleOn, null);
      assert.equal(entry.freshness.daysUntilStale, null);
    }
    clock = new Date("2026-09-14T10:00:00.000Z");
  });

  it("lets reviewers list soon-expiring fact checks first without touching the default order", async () => {
    // Two extra approved businesses whose newest confirmed check is older than the main profile's
    // (2026-09-14): one due sooner, one already stale. Only confirmed checks may contribute a date,
    // so the "sooner" business also carries a much older *unchecked* row that must be ignored.
    const extra: number[] = [];
    const seedApproved = async (suffix: string, checks: Array<{ status: string; checkedOn: Date | null }>) => {
      const [profile] = await db
        .insert(businessProfilesTable)
        .values({
          slug: `${slug}-${suffix}`,
          cityId: "dhg",
          listingSource: "openstreetmap",
          listingId: `${listingId}-${suffix}`,
          name: `Recheck ${suffix} ${runId}`,
          isClaimed: true,
          claimedAt: new Date(),
          publicationStatus: "published",
          createdByUserId: users.owner,
        })
        .returning();
      const [revision] = await db
        .insert(businessProfileRevisionsTable)
        .values({ businessProfileId: profile.id, version: 1, status: "approved", authorUserId: users.owner, content: {} })
        .returning();
      await db.update(businessProfilesTable).set({ approvedRevisionId: revision.id }).where(eq(businessProfilesTable.id, profile.id));
      await db.insert(factChecksTable).values(
        checks.map((check, index) => ({ revisionId: revision.id, field: index === 0 ? "phone" : "websiteUrl", ...check })),
      );
      extra.push(profile.id);
      return profile.id;
    };
    const soonerId = await seedApproved("sooner", [
      { status: "confirmed", checkedOn: new Date("2026-09-01T10:00:00.000Z") },
      { status: "unchecked", checkedOn: new Date("2025-01-01T10:00:00.000Z") },
    ]);
    const staleId = await seedApproved("stale", [{ status: "confirmed", checkedOn: new Date("2026-06-01T10:00:00.000Z") }]);

    try {
      clock = new Date("2027-02-20T10:00:00.000Z");
      const due = await request("/api/review/businesses?recheckDue=true&limit=50", asReviewer);
      assert.equal(due.status, 200);
      const dueIds = due.body.items.map((entry: any) => entry.profile.id);
      assert.ok(dueIds.includes(soonerId) && dueIds.includes(profileId), "both due businesses are listed");
      assert.ok(!dueIds.includes(staleId), "already-stale snapshots are not 'due', their stale status speaks for itself");
      assert.ok(dueIds.indexOf(soonerId) < dueIds.indexOf(profileId), "soonest staleOn comes first");
      for (const entry of due.body.items) {
        assert.equal(entry.freshness.recheckDue, true, "every item in the due view is actually due");
        assert.equal(entry.freshness.status, "fresh");
      }
      const staleOns = due.body.items.map((entry: any) => new Date(entry.freshness.staleOn).getTime());
      assert.deepEqual(staleOns, [...staleOns].sort((a, b) => a - b), "ordered by staleOn ascending");

      // The cursor is specific to this ordering and never repeats or skips an item.
      const firstPage = await request("/api/review/businesses?recheckDue=true&limit=1", asReviewer);
      assert.equal(firstPage.body.items.length, 1);
      assert.equal(firstPage.body.items[0].profile.id, soonerId);
      assert.equal(firstPage.body.pageInfo.hasMore, true);
      const secondPage = await request(
        `/api/review/businesses?recheckDue=true&limit=50&cursor=${encodeURIComponent(firstPage.body.pageInfo.nextCursor)}`,
        asReviewer,
      );
      assert.equal(secondPage.status, 200);
      assert.deepEqual(secondPage.body.items.map((entry: any) => entry.profile.id), dueIds.slice(1));

      // Explicit false and the default keep the newest-first id ordering and include everything.
      const all = await request("/api/review/businesses?limit=50", asReviewer);
      const allIds = all.body.items.map((entry: any) => entry.profile.id);
      assert.deepEqual(allIds, [...allIds].sort((a, b) => b - a), "default order is unchanged (id descending)");
      assert.ok(allIds.includes(staleId));
      const explicitFalse = await request("/api/review/businesses?recheckDue=false&limit=50", asReviewer);
      assert.deepEqual(explicitFalse.body.items.map((entry: any) => entry.profile.id), allIds);

      const invalid = await request("/api/review/businesses?recheckDue=maybe", asReviewer);
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.fieldErrors[0].field, "recheckDue");
    } finally {
      clock = new Date("2026-09-14T10:00:00.000Z");
      const revisions = await db
        .select({ id: businessProfileRevisionsTable.id })
        .from(businessProfileRevisionsTable)
        .where(inArray(businessProfileRevisionsTable.businessProfileId, extra));
      if (revisions.length > 0) {
        await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, revisions.map((r) => r.id)));
      }
      await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, extra));
      await db.delete(businessProfilesTable).where(inArray(businessProfilesTable.id, extra));
    }
  });

  it("marks freshness as stale honestly after 180 days", async () => {
    clock = new Date("2027-06-01T00:00:00.000Z");
    const owner = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(owner.body.freshness.status, "stale");
    assert.equal(owner.body.freshness.recheckDue, false, "once stale the window has passed; the stale status speaks for itself");
    assert.ok(owner.body.freshness.daysUntilStale < 0);
    await db.update(businessProfilesTable).set({ publicationStatus: "published" }).where(eq(businessProfilesTable.id, profileId));
    const published = await request(`/api/business-profiles/${profileId}/revision`);
    assert.equal(published.body.state, "stale");
    clock = new Date("2026-09-14T10:00:00.000Z");
  });

  it("cannot submit an empty draft", async () => {
    const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, claimProfileId));
    assert.ok(profile);
    const created = await request(`/api/business-profiles/${claimProfileId}/revision`, {
      method: "PATCH",
      userId: users.claimant,
      body: json({ expectedVersion: 0, facts: { phone: "+31 6 1234 5678" } }),
    });
    assert.equal(created.status, 200, "the newly approved owner can edit");
    const submit = await request(`/api/business-profiles/${claimProfileId}/revision/submit`, {
      method: "POST",
      userId: users.claimant,
      body: json({ expectedVersion: 1 }),
    });
    assert.equal(submit.status, 400);
    assert.equal(submit.body.code, "VALIDATION_FAILED");
    const revisions = await db
      .select()
      .from(businessProfileRevisionsTable)
      .where(eq(businessProfileRevisionsTable.businessProfileId, claimProfileId));
    assert.equal(revisions[0].status, "draft");
    const checks = await db.select().from(factChecksTable).where(eq(factChecksTable.revisionId, revisions[0].id));
    assert.equal(checks.length, 0);
  });
  it("backfills column-only profiles into approved v1 idempotently so they can be suspended and republished", async () => {
    const before = await request(`/api/business-profiles/public/${legacySlug}`, { userId: null });
    assert.equal(before.status, 404, "column-only profile is not served while publication is on");

    const first = await backfillApprovedRevisions(() => clock);
    assert.ok(first.migrated >= 1);
    const second = await backfillApprovedRevisions(() => clock);
    assert.equal(second.migrated, 0, "re-running migrates nothing");
    const revisions = await db
      .select()
      .from(businessProfileRevisionsTable)
      .where(eq(businessProfileRevisionsTable.businessProfileId, legacyProfileId));
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].version, 1);
    assert.equal(revisions[0].status, "approved");
    assert.equal(revisions[0].authorUserId, BACKFILL_ACTOR_ID);
    const [main] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
    const [mainApproved] = await db
      .select()
      .from(businessProfileRevisionsTable)
      .where(eq(businessProfileRevisionsTable.id, main.approvedRevisionId!));
    assert.equal(mainApproved.version, 2, "profiles that already have a snapshot are untouched");

    const legacy = await request(`/api/business-profiles/public/${legacySlug}`, { userId: null });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.tagline, "Served from columns");
    assert.equal(legacy.body.content.nl.tagline, "Served from columns");
    assert.equal(legacy.body.provenance.approvedVersion, 1);
    assert.equal(legacy.body.provenance.freshness.status, "unverified");
    assert.ok(!JSON.stringify(legacy.body).includes(BACKFILL_ACTOR_ID));

    const queue = await request("/api/review/businesses?limit=50", asReviewer);
    const item = queue.body.items.find((entry: any) => entry.profile.id === legacyProfileId);
    assert.ok(item, "migrated profile appears in the publication queue");
    assert.equal(item.approvedRevision.version, 1);

    const suspend = await request(`/api/review/businesses/${legacyProfileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "suspend", expectedRevisionVersion: 1, reason: "Complaint." }),
    });
    assert.equal(suspend.status, 200);
    assert.equal((await request(`/api/business-profiles/public/${legacySlug}`, { userId: null })).status, 404);
    const republish = await request(`/api/review/businesses/${legacyProfileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "publish", expectedRevisionVersion: 1 }),
    });
    assert.equal(republish.status, 200, "migrated profiles can be republished from their v1 snapshot");
    const restored = await request(`/api/business-profiles/public/${legacySlug}`, { userId: null });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.tagline, "Served from columns");
    const unpublish = await request(`/api/review/businesses/${legacyProfileId}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "unpublish", expectedRevisionVersion: 1, reason: "Closed." }),
    });
    assert.equal(unpublish.status, 200);
    assert.equal((await request(`/api/business-profiles/public/${legacySlug}`, { userId: null })).status, 404);
  });
  it("keeps a post-rollout listing private through claim approval and editorial approval until an explicit publish", async () => {
    const claimDraft = {
      contactName: "Olivia Owner",
      contactEmail: "olivia@example.com",
      relationship: "Owner",
      authorityDeclaration: "I own this shop and run it every day.",
    };
    const created = await request("/api/businesses", {
      method: "POST",
      userId: users.other,
      body: json({ kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: rolloutListingId }, ...claimDraft }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const [rollout] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.listingId, rolloutListingId));
    assert.equal(rollout.publicationStatus, "draft", "profiles created while publication review is on start unpublished");
    assert.equal((await request(`/api/business-profiles/public/${rollout.slug}`, { userId: null })).status, 404);

    const submitted = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      userId: users.other,
      body: json({ expectedVersion: created.body.version }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const claimApproved = await request(`/api/review/claims/${created.body.id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: submitted.body.version }),
    });
    assert.equal(claimApproved.status, 200, JSON.stringify(claimApproved.body));
    assert.equal(claimApproved.body.profile.publicationStatus, "draft", "ownership approval does not publish");

    const draft = await request(`/api/business-profiles/${rollout.id}/revision`, {
      method: "PATCH",
      userId: users.other,
      body: json({ expectedVersion: 0, nl: { tagline: "Nieuw in de buurt", description: "Net geopend." } }),
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal((await request(`/api/business-profiles/${rollout.id}/revision/submit`, { method: "POST", userId: users.other, body: json({ expectedVersion: 1 }) })).status, 200);
    const revisionId = draft.body.latestRevision.id;
    const approved = await request(`/api/review/revisions/${revisionId}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: 1 }),
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.profile.publicationStatus, "draft", "editorial approval does not publish");
    assert.equal((await request(`/api/business-profiles/public/${rollout.slug}`, { userId: null })).status, 404, "approved but unpublished stays private");

    const publish = await request(`/api/review/businesses/${rollout.id}/publication`, {
      method: "POST",
      ...asReviewer,
      body: json({ action: "publish", expectedRevisionVersion: 1 }),
    });
    assert.equal(publish.status, 200, JSON.stringify(publish.body));
    const pub = await request(`/api/business-profiles/public/${rollout.slug}`, { userId: null });
    assert.equal(pub.status, 200);
    assert.equal(pub.body.content.nl.tagline, "Nieuw in de buurt");
    const audit = await db.select().from(businessReviewsTable).where(eq(businessReviewsTable.targetId, rollout.id));
    assert.deepEqual(audit.filter((row) => row.targetType === "publication").map((row) => row.decision), ["publish"]);
  });

  it("serves the legacy columns again when the flag is rolled back after a backfill", async () => {
    flags = { ...flags, businessPublication: false, consumerRegistration: false };
    try {
      const edit = await request(`/api/business-profiles/${legacyProfileId}`, {
        method: "PATCH",
        userId: users.owner,
        body: json({ tagline: "Edited with publication off" }),
      });
      // Legacy owner PATCH needs membership; grant it for the rollback scenario.
      if (edit.status !== 200) {
        await db.insert(businessMembersTable).values({ businessProfileId: legacyProfileId, userId: users.owner, role: "owner" });
        const retry = await request(`/api/business-profiles/${legacyProfileId}`, { method: "PATCH", userId: users.owner, body: json({ tagline: "Edited with publication off" }) });
        assert.equal(retry.status, 200, JSON.stringify(retry.body));
      }
      await db.update(businessProfilesTable).set({ publicationStatus: "published" }).where(eq(businessProfilesTable.id, legacyProfileId));
      const pub = await request(`/api/business-profiles/public/${legacySlug}`, { userId: null });
      assert.equal(pub.status, 200);
      assert.equal(pub.body.tagline, "Edited with publication off", "columns are the public truth while the flag is off");
      assert.equal(pub.body.content, null);
      assert.equal(pub.body.provenance, null);
      const [row] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, legacyProfileId));
      assert.ok(row.approvedRevisionId, "the snapshot is kept for re-enablement");
    } finally {
      flags = { ...flags, businessPublication: true, consumerRegistration: false };
    }
    const back = await request(`/api/business-profiles/public/${legacySlug}`, { userId: null });
    assert.equal(back.status, 200);
    assert.equal(back.body.tagline, "Served from columns", "re-enabling serves the approved snapshot, not the unreviewed edit");
  });

  it("serialises claim creation and claim decisions on the profile row lock", async () => {
    const claimDraft = {
      contactName: "Eddie Editor",
      contactEmail: "eddie@example.com",
      relationship: "Manager",
      authorityDeclaration: "I manage this shop on behalf of the owner.",
    };
    // A submitted claim whose decision passes every pre-transaction check.
    const pendingClaim = await request("/api/businesses", {
      method: "POST",
      userId: users.claimantEditor,
      body: json({ kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: claimListingId }, ...claimDraft }),
    });
    assert.equal(pendingClaim.status, 201, JSON.stringify(pendingClaim.body));
    const pendingSubmit = await request(`/api/business-claims/${pendingClaim.body.id}/submit`, {
      method: "POST",
      userId: users.claimantEditor,
      body: json({ expectedVersion: pendingClaim.body.version }),
    });
    assert.equal(pendingSubmit.status, 200, JSON.stringify(pendingSubmit.body));

    const settled: string[] = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    // Simulate an in-flight review decision holding the profile lock.
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from business_profiles where id = ${claimProfileId} for update`);
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const create = request("/api/businesses", {
      method: "POST",
      userId: users.reviewer2,
      body: json({ kind: "existing_listing", listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: claimListingId }, ...claimDraft }),
    }).then((r) => { settled.push("create"); return r; });
    const decide = request(`/api/review/claims/${pendingClaim.body.id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "reject", expectedVersion: pendingSubmit.body.version, reason: "Not enough evidence." }),
    }).then((r) => { settled.push("decide"); return r; });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const early = [...settled];
    release();
    await holder;
    const [createResult, decideResult] = await Promise.all([create, decide]);
    assert.deepEqual(early, [], `claim creation and decisions wait for the profile lock: ${JSON.stringify([createResult, decideResult])}`);
    assert.equal(createResult.status, 201, JSON.stringify(createResult.body));
    assert.equal(decideResult.status, 200, JSON.stringify(decideResult.body));
    assert.equal(decideResult.body.status, "rejected");
  });
  it("never lets a concurrent save rewrite a revision that was submitted first", async () => {
    const [rollout] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.listingId, rolloutListingId));
    const draft = await request(`/api/business-profiles/${rollout.id}/revision`, {
      method: "PATCH",
      userId: users.other,
      body: json({ expectedVersion: 1, nl: { tagline: "Voor de race" } }),
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    assert.equal(draft.body.latestRevision.version, 2);

    const settled: string[] = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from business_profiles where id = ${rollout.id} for update`);
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const submit = request(`/api/business-profiles/${rollout.id}/revision/submit`, {
      method: "POST",
      userId: users.other,
      body: json({ expectedVersion: 2 }),
    }).then((r) => { settled.push("submit"); return r; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const save = request(`/api/business-profiles/${rollout.id}/revision`, {
      method: "PATCH",
      userId: users.other,
      body: json({ expectedVersion: 2, nl: { tagline: "Na het indienen" } }),
    }).then((r) => { settled.push("save"); return r; });
    const discard = request(`/api/business-profiles/${rollout.id}/revision/discard`, {
      method: "POST",
      userId: users.other,
      body: json({ expectedVersion: 2 }),
    }).then((r) => { settled.push("discard"); return r; });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const early = [...settled];
    release();
    await holder;
    const [submitResult, saveResult, discardResult] = await Promise.all([submit, save, discard]);
    assert.deepEqual(early, [], "save, submit, and discard all wait for the profile lock");
    assert.equal(submitResult.status, 200, JSON.stringify(submitResult.body));
    assert.equal(saveResult.status, 409, "a save that lost the race cannot touch the submitted revision");
    assert.equal(discardResult.status, 409, "a discard that lost the race is refused");
    const [submitted] = await db
      .select()
      .from(businessProfileRevisionsTable)
      .where(eq(businessProfileRevisionsTable.id, draft.body.latestRevision.id));
    assert.equal(submitted.status, "submitted");
    assert.equal((submitted.content as any).nl.tagline, "Voor de race", "submitted content is exactly what the owner submitted");
  });

  it("keeps the approved snapshot's author out of publication decisions after leaving the business", async () => {
    const [rollout] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.listingId, rolloutListingId));
    await db
      .delete(businessMembersTable)
      .where(and(eq(businessMembersTable.businessProfileId, rollout.id), eq(businessMembersTable.userId, users.other)));
    const asFormerOwner = { userId: users.other, editor: true };
    const queue = await request("/api/review/businesses?limit=50", asFormerOwner);
    const item = queue.body.items.find((entry: any) => entry.profile.id === rollout.id);
    assert.ok(item);
    assert.equal(item.canDecide, false, "author of the approved snapshot is still an interested party");
    const suspend = await request(`/api/review/businesses/${rollout.id}/publication`, {
      method: "POST",
      ...asFormerOwner,
      body: json({ action: "suspend", expectedRevisionVersion: 1, reason: "Trying to suspend my own snapshot." }),
    });
    assert.equal(suspend.status, 403);
    assert.equal(suspend.body.code, "SELF_REVIEW_FORBIDDEN");
    const [unchanged] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, rollout.id));
    assert.equal(unchanged.publicationStatus, "published");
    const other = await request(`/api/review/businesses/${rollout.id}/publication`, {
      method: "POST",
      ...asReviewer2,
      body: json({ action: "suspend", expectedRevisionVersion: 1, reason: "Independent reviewer." }),
    });
    assert.equal(other.status, 200, JSON.stringify(other.body));
  });
  it("keeps the approved snapshot's author out of claim and editorial decisions after leaving the business", async () => {
    const [rollout] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.listingId, rolloutListingId));
    const asFormerOwner = { userId: users.other, editor: true };
    // v2 was submitted in the race test above and is still awaiting an editorial decision.
    const [submittedV2] = await db
      .select()
      .from(businessProfileRevisionsTable)
      .where(and(eq(businessProfileRevisionsTable.businessProfileId, rollout.id), eq(businessProfileRevisionsTable.version, 2)));
    assert.equal(submittedV2.status, "submitted");
    const editorial = await request("/api/review/revisions?limit=50", asFormerOwner);
    const queued = editorial.body.items.find((entry: any) => entry.revision.id === submittedV2.id);
    assert.ok(queued);
    assert.equal(queued.canDecide, false);
    const decide = await request(`/api/review/revisions/${submittedV2.id}/decision`, {
      method: "POST",
      ...asFormerOwner,
      body: json({ decision: "approve", expectedVersion: 2 }),
    });
    assert.equal(decide.status, 403);
    assert.equal(decide.body.code, "SELF_REVIEW_FORBIDDEN");

    const claim = await request("/api/businesses", {
      method: "POST",
      userId: users.claimant,
      body: json({
        kind: "existing_listing",
        listing: { cityId: "dhg", listingSource: "openstreetmap", listingId: rolloutListingId },
        contactName: "Claire Claimant",
        contactEmail: "claire@example.com",
        relationship: "Owner",
        authorityDeclaration: "I took over this shop last month.",
      }),
    });
    assert.equal(claim.status, 201, JSON.stringify(claim.body));
    const submitted = await request(`/api/business-claims/${claim.body.id}/submit`, {
      method: "POST",
      userId: users.claimant,
      body: json({ expectedVersion: claim.body.version }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const authority = await request("/api/review/claims?limit=50", asFormerOwner);
    const queuedClaim = authority.body.items.find((entry: any) => entry.id === claim.body.id);
    assert.ok(queuedClaim);
    assert.equal(queuedClaim.canDecide, false);
    const claimDecision = await request(`/api/review/claims/${claim.body.id}/decision`, {
      method: "POST",
      ...asFormerOwner,
      body: json({ decision: "reject", expectedVersion: submitted.body.version, reason: "Not my successor." }),
    });
    assert.equal(claimDecision.status, 403);
    assert.equal(claimDecision.body.code, "SELF_REVIEW_FORBIDDEN");
    const [unchanged] = await db.select().from(businessClaimsTable).where(eq(businessClaimsTable.id, claim.body.id));
    assert.equal(unchanged.status, submitted.body.status);
  });

  it("serialises a self-reported claim withdrawal against a concurrent reviewer decision without deadlocking", async () => {
    const created = await request("/api/businesses", {
      method: "POST",
      userId: users.claimant,
      body: json({
        kind: "new_business",
        business: { name: `Race Zaak ${runId}`, category: "Retail", neighborhood: "Bezuidenhout" },
        contactName: "Claire Claimant",
        contactEmail: "claire@example.com",
        relationship: "Owner",
        authorityDeclaration: "I founded this business this year.",
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const submitted = await request(`/api/business-claims/${created.body.id}/submit`, {
      method: "POST",
      userId: users.claimant,
      body: json({ expectedVersion: created.body.version }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const profileId = created.body.profile.id as number;

    const settled: string[] = [];
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from business_profiles where id = ${profileId} for update`);
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const withdraw = request(`/api/business-claims/${created.body.id}/withdraw`, {
      method: "POST",
      userId: users.claimant,
      body: json({ expectedVersion: submitted.body.version }),
    }).then((r) => { settled.push("withdraw"); return r; });
    const decide = request(`/api/review/claims/${created.body.id}/decision`, {
      method: "POST",
      ...asReviewer,
      body: json({ decision: "approve", expectedVersion: submitted.body.version }),
    }).then((r) => { settled.push("decide"); return r; });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const early = [...settled];
    release();
    await holder;
    const [withdrawResult, decideResult] = await Promise.all([withdraw, decide]);
    assert.deepEqual(early, [], "withdrawal and decision both wait for the profile lock");
    const statuses = [withdrawResult.status, decideResult.status].sort();
    assert.deepEqual(statuses, [200, 409], `exactly one wins: ${JSON.stringify([withdrawResult.body, decideResult.body])}`);
    const [claim] = await db.select().from(businessClaimsTable).where(eq(businessClaimsTable.id, created.body.id));
    const members = await db.select().from(businessMembersTable).where(eq(businessMembersTable.businessProfileId, profileId));
    const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
    if (withdrawResult.status === 200) {
      assert.equal(claim.status, "withdrawn");
      assert.equal(members.length, 0);
      assert.equal(profile.publicationStatus, "archived");
    } else {
      assert.equal(claim.status, "approved");
      assert.equal(members.length, 1);
      assert.notEqual(profile.publicationStatus, "archived");
    }
  });
  it("keeps profiles at the legacy contract limits live after backfill, in public and in the owner workspace", async () => {
    const wideListingId = `pub-test-wide-${runId}`;
    const wideSlug = `pub-wide-${runId}`;
    const longDescription = "D".repeat(2400);
    const longHours = "H".repeat(600);
    const longPhone = "0".repeat(50);
    const longUrl = `https://example.com/${"p".repeat(700)}`;
    const longEmail = `${"e".repeat(200)}@example.com`;
    const [wide] = await db
      .insert(businessProfilesTable)
      .values({
        slug: wideSlug,
        cityId: "dhg",
        listingSource: "openstreetmap",
        listingId: wideListingId,
        name: `Wide Legacy Business ${runId}`,
        tagline: "T".repeat(160),
        description: longDescription,
        openingHours: longHours,
        phone: longPhone,
        websiteUrl: longUrl,
        email: longEmail,
        isClaimed: true,
        claimedAt: new Date(),
        publicationStatus: "published",
      })
      .returning();
    await db.insert(businessMembersTable).values({ businessProfileId: wide.id, userId: users.owner, role: "owner" });
    try {
      const summary = await backfillApprovedRevisions(() => new Date());
      assert.ok(summary.migrated >= 1, JSON.stringify(summary));

      const pub = await request(`/api/business-profiles/public/${wideSlug}`, { userId: null });
      assert.equal(pub.status, 200, JSON.stringify(pub.body).slice(0, 300));
      assert.equal(pub.body.content.nl.description, longDescription);
      assert.equal(pub.body.content.nl.openingHours, longHours);
      assert.equal(pub.body.content.facts.phone, longPhone);
      assert.equal(pub.body.content.facts.websiteUrl, longUrl);
      assert.equal(pub.body.content.facts.email, longEmail);

      const workspace = await request(`/api/business-profiles/${wide.id}/revision`, { userId: users.owner });
      assert.equal(workspace.status, 200, JSON.stringify(workspace.body).slice(0, 300));
      assert.equal(workspace.body.approvedRevision.content.nl.description, longDescription);

      // A first draft seeded from the approved snapshot keeps the untouched wide values,
      // while new input is still held to the stricter owner-input limits.
      const draft = await request(`/api/business-profiles/${wide.id}/revision`, {
        method: "PATCH",
        userId: users.owner,
        body: json({ expectedVersion: 1, en: { tagline: "Wide but valid" } }),
      });
      assert.equal(draft.status, 200, JSON.stringify(draft.body).slice(0, 300));
      assert.equal(draft.body.latestRevision.content.nl.description, longDescription);
      assert.equal(draft.body.latestRevision.content.facts.phone, longPhone);
      const tooLong = await request(`/api/business-profiles/${wide.id}/revision`, {
        method: "PATCH",
        userId: users.owner,
        body: json({ expectedVersion: 2, nl: { description: "X".repeat(2001) } }),
      });
      assert.equal(tooLong.status, 400);
      assert.equal(tooLong.body.fieldErrors?.[0]?.field, "nl.description");
    } finally {
      await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, wide.id));
    }
  });
});
