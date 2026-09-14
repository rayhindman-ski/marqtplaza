import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, inArray } from "drizzle-orm";

import {
  accountConsentEventsTable,
  appUsersTable,
  businessMembersTable,
  consumerPreferencesTable,
  businessProfilesTable,
  db,
  pool,
  userRegistrationsTable,
} from "@workspace/db";

import { createAccountRouter } from "./account";
import { createRegistrationRouter } from "./registration";
import { createHealthRouter } from "./health";
import type { Identity } from "../lib/permissions";

const runId = `${process.pid}-${Date.now()}`;
const users = {
  plain: `account-test-${runId}-plain`,
  editor: `account-test-${runId}-editor`,
  unverified: `account-test-${runId}-unverified`,
  suspended: `account-test-${runId}-suspended`,
  member: `account-test-${runId}-member`,
  racer: `account-test-${runId}-racer`,
  skipper: `account-test-${runId}-skipper`,
  saver: `account-test-${runId}-saver`,
  other: `account-test-${runId}-other`,
  firstwriters: `account-test-${runId}-firstwriters`,
  ledger: `account-test-${runId}-ledger`,
};
const allUserIds = Object.values(users);

let flags = { accounts: true, businessIntake: false, businessPublication: false };

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
app.use("/api", createHealthRouter(() => flags));
app.use("/api", createRegistrationRouter((req) => req.header("x-test-user-id")));
app.use("/api", createAccountRouter({ resolveIdentity: identityFromHeaders, flags: () => flags }));

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let profileId: number | null = null;

async function request(
  path: string,
  init: RequestInit & { userId?: string | null } = {},
): Promise<{ status: number; body: any }> {
  const { userId = users.plain, headers, ...rest } = init;
  const result = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-test-user-id": userId } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  return { status: result.status, body: await result.json() };
}

async function cleanup(): Promise<void> {
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUserIds));
  await db.delete(userRegistrationsTable).where(inArray(userRegistrationsTable.userId, allUserIds));
  await db.delete(businessMembersTable).where(inArray(businessMembersTable.userId, allUserIds));
  if (profileId !== null) {
    await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
  }
}

describe("account routes", () => {
  before(async () => {
    await cleanup();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await cleanup();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  });

  it("reports readiness gates and hides account routes while accounts are disabled", async () => {
    flags = { accounts: false, businessIntake: false, businessPublication: false };
    const readiness = await request("/api/readiness", { userId: null });
    assert.equal(readiness.status, 200);
    assert.deepEqual(readiness.body, flags);

    const me = await request("/api/account/me");
    assert.equal(me.status, 404);
    assert.equal(me.body.code, "FEATURE_DISABLED");
    assert.equal(typeof me.body.correlationId, "string");

    const options = await request("/api/account/options");
    assert.equal(options.status, 404);

    const [row] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.plain));
    assert.equal(row, undefined, "a disabled gate must not provision accounts");
    flags = { accounts: true, businessIntake: false, businessPublication: false };
  });

  it("requires authentication with the stable error shape", async () => {
    const me = await request("/api/account/me", { userId: null });
    assert.equal(me.status, 401);
    assert.equal(me.body.code, "AUTH_REQUIRED");
    assert.equal(me.body.messageKey, "errors.auth_required");
  });

  it("provisions one local account per identity, idempotently and under concurrency", async () => {
    const first = await request("/api/account/me");
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "active");
    assert.equal(first.body.role, "user");
    assert.equal(first.body.locale, "nl");
    assert.equal(first.body.onboardingCompleted, false);
    assert.equal(first.body.preferences, null);
    assert.equal(first.body.hasResearchRegistration, false);
    assert.equal(first.body.capabilities.canClaimBusiness, false, "intake gate is off");

    const second = await request("/api/account/me");
    assert.equal(second.body.id, first.body.id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => request("/api/account/me", { userId: users.racer })),
    );
    assert.ok(results.every((result) => result.status === 200));
    const ids = new Set(results.map((result) => result.body.id));
    assert.equal(ids.size, 1);
    const rows = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.racer));
    assert.equal(rows.length, 1);
  });

  it("keeps the research registration separate from the account", async () => {
    const saved = await request("/api/registration", {
      method: "PUT",
      body: JSON.stringify({
        name: "Account Tester",
        registrationType: "consumer",
        email: "account-tester@example.test",
        usefulnessRating: 4,
        referralLikelihood: 4,
        desiredFeatures: "Buurtactiviteiten.",
      }),
    });
    assert.ok(saved.status < 300, `registration should save, got ${saved.status}`);
    const me = await request("/api/account/me");
    assert.equal(me.body.hasResearchRegistration, true);
    assert.equal(me.body.onboardingCompleted, false, "registration never completes account onboarding");
  });

  it("derives roles server-side and rejects client-submitted role fields", async () => {
    const editor = await request("/api/account/me", { headers: { "x-test-editor": "1" }, userId: users.editor });
    assert.equal(editor.body.role, "reviewer");
    assert.equal(editor.body.capabilities.isEditor, true);
    assert.equal(editor.body.capabilities.canReview, true);
    assert.equal(editor.body.capabilities.canPublishBusiness, false, "publication gate is off");

    const unverified = await request("/api/account/me", {
      headers: { "x-test-unverified": "1" },
      userId: users.unverified,
    });
    assert.equal(unverified.status, 200);
    assert.equal(unverified.body.role, "unverified");
    assert.equal(unverified.body.capabilities.isVerified, false);

    const forged = await request("/api/account/me?role=admin");
    assert.equal(forged.status, 400);
    assert.equal(forged.body.code, "UNKNOWN_FIELD");
    assert.deepEqual(forged.body.fieldErrors, [{ field: "role", code: "unknown" }]);

    const still = await request("/api/account/me");
    assert.equal(still.body.role, "user");
  });

  it("recognises business membership from the membership table only", async () => {
    const [profile] = await db
      .insert(businessProfilesTable)
      .values({
        slug: `account-test-${runId}`,
        cityId: "dhg",
        listingSource: "test",
        listingId: `account-test-${runId}`,
        name: "Account Test Business",
      })
      .returning({ id: businessProfilesTable.id });
    profileId = profile!.id;
    await db.insert(businessMembersTable).values({
      businessProfileId: profileId,
      userId: users.member,
      role: "owner",
    });

    const member = await request("/api/account/me", { userId: users.member });
    assert.equal(member.body.role, "business_member");
    assert.equal(member.body.businessMembershipCount, 1);
    assert.equal(member.body.capabilities.isBusinessMember, true);
  });

  it("refuses suspended accounts without exposing account data", async () => {
    await request("/api/account/me", { userId: users.suspended });
    await db
      .update(appUsersTable)
      .set({ status: "suspended", suspendedAt: new Date(), suspensionReasonCode: "test" })
      .where(eq(appUsersTable.clerkUserId, users.suspended));

    const me = await request("/api/account/me", { userId: users.suspended });
    assert.equal(me.status, 403);
    assert.equal(me.body.code, "ACCOUNT_SUSPENDED");
    assert.equal(me.body.id, undefined);
  });

  it("serves the controlled option lists", async () => {
    const options = await request("/api/account/options");
    assert.equal(options.status, 200);
    assert.ok(options.body.neighborhoods.length > 10);
    assert.ok(options.body.interests.some((option: any) => option.id === "category:food-and-drink"));
    assert.equal(typeof options.body.taxonomyVersion, "string");
    assert.ok(options.body.neighborhoods.every((option: any) => option.label.nl && option.label.en));
  });
  it("marks onboarding complete on skip without creating preference rows", async () => {
    const skipped = await request("/api/account/onboarding/complete", { method: "POST", userId: users.skipper });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.body.onboardingCompleted, true);
    assert.equal(skipped.body.preferences, null);
    const firstCompletedAt = skipped.body.onboardingCompletedAt;

    const again = await request("/api/account/onboarding/complete", { method: "POST", userId: users.skipper });
    assert.equal(again.body.onboardingCompletedAt, firstCompletedAt, "completion is idempotent");

    const rows = await db
      .select()
      .from(consumerPreferencesTable)
      .where(eq(consumerPreferencesTable.userId, skipped.body.id));
    assert.equal(rows.length, 0);
    const [registration] = await db
      .select()
      .from(userRegistrationsTable)
      .where(eq(userRegistrationsTable.userId, users.skipper));
    assert.equal(registration, undefined, "skip never creates a research registration");
    const consents = await request("/api/account/consents", { userId: users.skipper });
    assert.equal(consents.status, 200);
    assert.deepEqual(consents.body.current, [], "account creation grants no consent");
  });

  it("saves controlled preferences with optimistic revisions and rejects unknown IDs", async () => {
    const options = await request("/api/account/options", { userId: users.saver });
    const [hood1, hood2] = options.body.neighborhoods.map((option: any) => option.id);
    const interest = "category:food-and-drink";

    const invalid = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.saver,
      body: JSON.stringify({ expectedRevision: 0, neighborhoodIds: ["dhg:nowhere"], interestIds: [interest] }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "VALIDATION_FAILED");
    assert.deepEqual(invalid.body.fieldErrors, [
      { field: "neighborhoodIds.dhg:nowhere", code: "not_in_controlled_list" },
    ]);

    const forged = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.saver,
      body: JSON.stringify({ expectedRevision: 0, role: "admin" }),
    });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.code, "UNKNOWN_FIELD");

    const saved = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.saver,
      body: JSON.stringify({
        expectedRevision: 0,
        locale: "en",
        neighborhoodIds: [hood1, hood2, hood1],
        interestIds: [interest],
      }),
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.locale, "en");
    assert.equal(saved.body.preferences.revision, 1);
    assert.deepEqual(saved.body.preferences.neighborhoodIds, [hood1, hood2]);
    assert.deepEqual(saved.body.preferences.interestIds, [interest]);
    assert.equal(saved.body.onboardingCompleted, false, "saving preferences does not complete onboarding by itself");

    const stale = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.saver,
      body: JSON.stringify({ expectedRevision: 0, interestIds: [] }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, "VERSION_CONFLICT");
    assert.equal(stale.body.expectedVersion, 1);

    const partial = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.saver,
      body: JSON.stringify({ expectedRevision: 1, interestIds: [] }),
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.preferences.revision, 2);
    assert.deepEqual(partial.body.preferences.neighborhoodIds, [hood1, hood2], "omitted fields stay unchanged");
    assert.deepEqual(partial.body.preferences.interestIds, [], "empty arrays clear a list");
    assert.equal(partial.body.locale, "en", "locale persists on the account");

    const [registration] = await db
      .select()
      .from(userRegistrationsTable)
      .where(eq(userRegistrationsTable.userId, users.saver));
    assert.equal(registration, undefined, "preferences never touch user_registrations");

    const other = await request("/api/account/me", { userId: users.other });
    assert.equal(other.body.preferences, null, "another user's preferences are not readable");
    const otherStale = await request("/api/account/preferences", {
      method: "PATCH",
      userId: users.other,
      body: JSON.stringify({ expectedRevision: 2, interestIds: [interest] }),
    });
    assert.equal(otherStale.status, 409, "revisions are scoped per account");
    assert.equal(otherStale.body.expectedVersion, 0);
  });

  it("refuses preference and consent writes from unverified identities", async () => {
    const write = await request("/api/account/preferences", {
      method: "PATCH",
      headers: { "x-test-unverified": "1" },
      userId: users.unverified,
      body: JSON.stringify({ expectedRevision: 0, interestIds: [] }),
    });
    assert.equal(write.status, 403);
    assert.equal(write.body.code, "EMAIL_UNVERIFIED");
    const read = await request("/api/account/consents", {
      headers: { "x-test-unverified": "1" },
      userId: users.unverified,
    });
    assert.equal(read.status, 200, "reads stay available so the client can explain the next step");
  });

  it("records purpose-specific consents append-only against the current notice version", async () => {
    const before = await request("/api/account/consents", { userId: users.saver });
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.purposes, ["marketing_updates", "research_contact"]);
    assert.deepEqual(before.body.current, []);
    const noticeVersion = before.body.currentNoticeVersion;

    const stale = await request("/api/account/consents", {
      method: "POST",
      userId: users.saver,
      body: JSON.stringify({ consentType: "marketing_updates", noticeVersion: "old", granted: true, source: "account_settings" }),
    });
    assert.equal(stale.status, 400);
    assert.deepEqual(stale.body.fieldErrors, [{ field: "noticeVersion", code: "stale_notice_version" }]);

    const system = await request("/api/account/consents", {
      method: "POST",
      userId: users.saver,
      body: JSON.stringify({ consentType: "marketing_updates", noticeVersion, granted: true, source: "system" }),
    });
    assert.equal(system.status, 400, "clients cannot claim system or support sources");

    const granted = await request("/api/account/consents", {
      method: "POST",
      userId: users.saver,
      body: JSON.stringify({ consentType: "marketing_updates", noticeVersion, granted: true, source: "account_settings" }),
    });
    assert.equal(granted.status, 200);
    assert.deepEqual(
      granted.body.current.map((state: any) => [state.consentType, state.granted]),
      [["marketing_updates", true]],
    );

    const withdrawn = await request("/api/account/consents", {
      method: "POST",
      userId: users.saver,
      body: JSON.stringify({ consentType: "marketing_updates", noticeVersion, granted: false, source: "account_settings" }),
    });
    assert.equal(withdrawn.body.current[0].granted, false);
    assert.equal(withdrawn.body.history.length, 2, "ledger entries are appended, never replaced");
    assert.equal(withdrawn.body.current.length, 1, "the other purpose was never asked");

    const [account] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.saver));
    const ledger = await db
      .select()
      .from(accountConsentEventsTable)
      .where(eq(accountConsentEventsTable.userId, account!.id));
    assert.equal(ledger.length, 2);
    const otherConsents = await request("/api/account/consents", { userId: users.other });
    assert.deepEqual(otherConsents.body.history, [], "consent history is private to the account");
  });
  it("lets exactly one concurrent first writer create preferences and answers the rest with 409", async () => {
    await request("/api/account/me", { userId: users.firstwriters });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request("/api/account/preferences", {
          method: "PATCH",
          userId: users.firstwriters,
          body: JSON.stringify({ expectedRevision: 0, interestIds: index % 2 ? ["category:food-and-drink"] : [] }),
        })),
    );
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.body)));
    assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.code === "VERSION_CONFLICT" && r.body.expectedVersion === 1));
    const [account] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.firstwriters));
    const rows = await db.select().from(consumerPreferencesTable).where(eq(consumerPreferencesTable.userId, account!.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.revision, 1);
  });

  it("derives the current consent state from the newest entry even beyond the history page", async () => {
    const me = await request("/api/account/me", { userId: users.ledger });
    const base = Date.now() - 400_000;
    await db.insert(accountConsentEventsTable).values(
      Array.from({ length: 205 }, (_, index) => ({
        userId: me.body.id,
        consentType: "marketing_updates",
        noticeVersion: "draft-2026-09",
        granted: index % 2 === 0,
        source: "account_settings",
        createdAt: new Date(base + index * 1000),
      })),
    );
    const noticeVersion = (await request("/api/account/consents", { userId: users.ledger })).body.currentNoticeVersion;
    const withdrawn = await request("/api/account/consents", {
      method: "POST",
      userId: users.ledger,
      body: JSON.stringify({ consentType: "marketing_updates", noticeVersion, granted: false, source: "account_settings" }),
    });
    assert.equal(withdrawn.status, 200);
    assert.deepEqual(withdrawn.body.current.map((s: any) => [s.consentType, s.granted]), [["marketing_updates", false]]);
    assert.equal(withdrawn.body.history.length, 200, "history is a bounded page");
    assert.equal(withdrawn.body.history.at(-1).granted, false, "the page ends with the newest entry");
    const research = await request("/api/account/consents", {
      method: "POST",
      userId: users.ledger,
      body: JSON.stringify({ consentType: "research_contact", noticeVersion, granted: true, source: "account_settings" }),
    });
    assert.deepEqual(
      research.body.current.map((s: any) => [s.consentType, s.granted]),
      [["marketing_updates", false], ["research_contact", true]],
    );
  });
});
