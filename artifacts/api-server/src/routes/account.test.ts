import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, inArray } from "drizzle-orm";

import {
  appUsersTable,
  businessMembersTable,
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
});
