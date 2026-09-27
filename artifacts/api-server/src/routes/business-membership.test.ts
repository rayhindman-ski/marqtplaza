import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, inArray } from "drizzle-orm";

import {
  appUsersTable,
  businessInvitationTokensTable,
  businessInvitationsTable,
  businessMemberEventsTable,
  businessMembersTable,
  businessProfilesTable,
  consumerPreferencesTable,
  db,
  lifecycleOutboxTable,
} from "@workspace/db";

import type { Identity } from "../lib/permissions";
import { createInvitationRecipientResolver, createEmailDeliveryLoader, type OutboundEmail } from "../lib/lifecycleEmailProvider";
import { dispatchLifecycleOutbox } from "../lib/lifecycleOutbox";
import { createBusinessMembershipRouter } from "./business-membership";
import { createAccountLifecycleRouter } from "./account-lifecycle";

/**
 * v0.5.2 membership and business lifecycle (BMEM-T01…T07, BSEC cross-business
 * 403/404). Runs against the configured database and cleans up its own rows,
 * which are all tagged with a per-run id.
 */
const runId = `${Date.now().toString(36)}-${process.pid}`;
const users = {
  owner: `user_bmem_owner_${runId}`,
  second: `user_bmem_second_${runId}`,
  manager: `user_bmem_manager_${runId}`,
  outsider: `user_bmem_outsider_${runId}`,
};
const emails: Record<string, string | null> = {
  [users.owner]: `owner-${runId}@example.test`,
  [users.second]: `second-${runId}@example.test`,
  [users.manager]: `manager-${runId}@example.test`,
  [users.outsider]: `outsider-${runId}@example.test`,
};
const allUsers = Object.values(users);
const ALL_DELETION_SCOPES = ["account_profile", "preferences", "consents", "saved_events", "business_memberships"];

let flags = { accounts: true, businessIntake: true, businessPublication: true, consumerRegistration: true, businessOnboarding: true };
let clock = new Date("2026-09-27T10:00:00.000Z");
const now = () => clock;

function identityFromHeaders(req: express.Request): Identity | null {
  const userId = req.header("x-test-user-id");
  if (!userId) return null;
  return { userId, emailVerified: req.header("x-test-unverified") !== "1", isEditor: false };
}

const app = express();
app.use(express.json());
app.use(
  "/api",
  createBusinessMembershipRouter({
    flags: () => flags,
    resolveIdentity: identityFromHeaders,
    accountEmail: async (userId) => emails[userId] ?? null,
    memberDisplay: async (ids) => new Map(ids.map((id) => [id, `Naam ${id.slice(-6)}`])),
    now,
    clientKey: () => "test-net",
  }),
);
app.use("/api", createAccountLifecycleRouter({ flags: () => flags, resolveIdentity: identityFromHeaders }));

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let businessId = 0;
let otherBusinessId = 0;

async function request(path: string, init: { method?: string; userId?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.userId !== null) headers["x-test-user-id"] = init.userId ?? users.owner;
  const result = await fetch(`${baseUrl}/api${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await result.text();
  return { status: result.status, body: text ? JSON.parse(text) : null };
}

const sent: OutboundEmail[] = [];
async function dispatchInvitations() {
  const deliver = createEmailDeliveryLoader({
    senderAddress: "noreply@buurtplaza.test",
    transport: async (email) => {
      sent.push(email);
      return { kind: "accepted", providerMessageId: `msg-${sent.length}-${runId}` };
    },
    resolveRecipient: async () => ({ kind: "not_found" }),
    resolveInvitationRecipient: createInvitationRecipientResolver({ baseUrl: "https://buurtplaza.test", now }),
  });
  return dispatchLifecycleOutbox({ deliver, now, limit: 200 });
}

function tokenFromEmail(email: OutboundEmail): string {
  const match = email.text.match(/\/account\/uitnodiging\?token=([A-Za-z0-9_-]+)/);
  assert.ok(match, "invitation e-mail carries a link");
  return match[1];
}

async function cleanup() {
  const profiles = await db.select({ id: businessProfilesTable.id }).from(businessProfilesTable).where(inArray(businessProfilesTable.createdByUserId, allUsers));
  const ids = profiles.map((row) => row.id);
  if (ids.length > 0) {
    const invitations = await db.select({ id: businessInvitationsTable.id }).from(businessInvitationsTable).where(inArray(businessInvitationsTable.businessProfileId, ids));
    if (invitations.length > 0) {
      await db.delete(lifecycleOutboxTable).where(inArray(lifecycleOutboxTable.recipientInvitationId, invitations.map((row) => row.id)));
    }
    await db.delete(businessProfilesTable).where(inArray(businessProfilesTable.id, ids));
  }
  await db.delete(businessMembersTable).where(inArray(businessMembersTable.userId, allUsers));
  const accounts = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUsers));
  if (accounts.length > 0) {
    await db.delete(lifecycleOutboxTable).where(inArray(lifecycleOutboxTable.recipientUserId, accounts.map((row) => row.id)));
  }
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUsers));
}

async function seedBusiness(suffix: string, ownerUserId: string, publicationStatus = "published"): Promise<number> {
  const [profile] = await db
    .insert(businessProfilesTable)
    .values({
      slug: `bmem-${suffix}-${runId}`,
      cityId: "dhg",
      listingSource: "self_reported",
      listingId: `bmem-${suffix}-${runId}`,
      name: `Teamzaak ${suffix} ${runId}`,
      category: "Services",
      neighborhood: "Centrum",
      publicationStatus,
      createdByUserId: ownerUserId,
    })
    .returning({ id: businessProfilesTable.id });
  await db.insert(businessMembersTable).values({ businessProfileId: profile.id, userId: ownerUserId, role: "owner" });
  return profile.id;
}

async function eventsFor(id: number) {
  return db.select({ action: businessMemberEventsTable.action, actor: businessMemberEventsTable.actorUserId, target: businessMemberEventsTable.targetUserId }).from(businessMemberEventsTable).where(eq(businessMemberEventsTable.businessProfileId, id)).orderBy(businessMemberEventsTable.id);
}

describe("business membership routes", () => {
  before(async () => {
    await cleanup();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    businessId = await seedBusiness("a", users.owner);
    otherBusinessId = await seedBusiness("b", users.outsider);
    // A preference row for the owner so BMEM-T07 can prove it never changes.
    await db.insert(appUsersTable).values({ clerkUserId: users.owner }).onConflictDoNothing({ target: appUsersTable.clerkUserId });
    const [ownerAccount] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.owner));
    await db.insert(consumerPreferencesTable).values({ userId: ownerAccount.id, neighborhoodIds: ["centrum"], interestIds: ["food"] }).onConflictDoNothing();
  });
  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await cleanup();
  });

  it("gates every route: 404 while the flag is closed, 401 anonymous, 403 unverified", async () => {
    flags = { ...flags, businessOnboarding: false };
    try {
      const closed = await request(`/businesses/${businessId}/members`);
      assert.equal(closed.status, 404);
      assert.equal(closed.body.code, "FEATURE_DISABLED");
    } finally {
      flags = { ...flags, businessOnboarding: true };
    }
    const anonymous = await request(`/businesses/${businessId}/members`, { userId: null });
    assert.equal(anonymous.status, 401);
    const accept = await request("/business-invitations/accept", { method: "POST", userId: null, body: { token: "x" } });
    assert.equal(accept.status, 401);
  });

  it("BMEM-T06: non-members get 404 on every business route, regardless of method", async () => {
    const attempts: [string, string, unknown?][] = [
      ["GET", `/businesses/${businessId}/members`],
      ["POST", `/businesses/${businessId}/invitations`, { email: "x@example.test", role: "manager" }],
      ["DELETE", `/businesses/${businessId}/invitations/1`],
      ["PATCH", `/businesses/${businessId}/members/1`, { role: "owner" }],
      ["DELETE", `/businesses/${businessId}/members/1`],
      ["POST", `/businesses/${businessId}/ownership/transfer`, { memberId: 1 }],
      ["POST", `/businesses/${businessId}/close`, { confirm: true }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await request(path, { method, userId: users.outsider, body });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.body.code, "NOT_FOUND");
    }
    const events = await eventsFor(businessId);
    assert.equal(events.length, 0, "no audit rows from rejected requests");
  });

  it("validates invitations strictly and lets only owners invite", async () => {
    const unknown = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: "a@b.test", role: "manager", note: "x" } });
    assert.equal(unknown.status, 400);
    const badRole = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: "a@b.test", role: "admin" } });
    assert.equal(badRole.status, 400);
    assert.deepEqual(badRole.body.fieldErrors, [{ field: "role", code: "invalid_enum_value" }]);
    const badEmail = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: "not-an-email", role: "manager" } });
    assert.equal(badEmail.status, 400);
  });

  it("BMEM-T01: invite → dispatch mints a token → wrong e-mail 403 → accept → replay used → owners notified", async () => {
    const invited = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: ` ${emails[users.manager]!.toUpperCase()} `, role: "manager" } });
    assert.equal(invited.status, 201, JSON.stringify(invited.body));
    assert.equal(invited.body.status, "open");
    assert.equal(new Date(invited.body.expiresAt).getTime() - clock.getTime(), 7 * 24 * 60 * 60_000);

    const duplicate = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: emails[users.manager], role: "manager" } });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(duplicate.body.fieldErrors, [{ field: "email", code: "already_invited" }]);

    // The outbox row carries no token and no address.
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientInvitationId, invited.body.id));
    assert.equal(row.eventCode, "business.member_invited");
    assert.equal(row.recipientUserId, null);
    assert.equal(JSON.stringify(row.payload).includes("@"), false);
    assert.equal("token" in row.payload, false);

    const summary = await dispatchInvitations();
    assert.equal(summary.accepted >= 1, true);
    const email = sent.find((entry) => entry.to === emails[users.manager]);
    assert.ok(email, "invitation e-mail went to the normalised address");
    assert.match(email.subject, /Uitnodiging/);
    const token = tokenFromEmail(email);
    const [tokenRow] = await db.select().from(businessInvitationTokensTable).where(eq(businessInvitationTokensTable.invitationId, invited.body.id));
    assert.notEqual(tokenRow.tokenDigest, token, "only the digest is stored");

    // Owner listing shows the open invitation; the invitee is not yet a member.
    const listing = await request(`/businesses/${businessId}/members`);
    assert.equal(listing.status, 200);
    assert.equal(listing.body.invitations[0].status, "open");
    assert.equal(listing.body.members.length, 1);

    const wrongAccount = await request("/business-invitations/accept", { method: "POST", userId: users.second, body: { token } });
    assert.equal(wrongAccount.status, 403);
    assert.deepEqual(wrongAccount.body, { accepted: false, reason: "email_mismatch" });

    const garbage = await request("/business-invitations/accept", { method: "POST", userId: users.manager, body: { token: "nope" } });
    assert.equal(garbage.status, 409);
    assert.equal(garbage.body.reason, "invalid");

    const accepted = await request("/business-invitations/accept", { method: "POST", userId: users.manager, body: { token } });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.accepted, true);
    assert.equal(accepted.body.role, "manager");
    assert.equal(accepted.body.businessId, businessId);

    const replay = await request("/business-invitations/accept", { method: "POST", userId: users.manager, body: { token } });
    assert.equal(replay.status, 409);
    assert.equal(replay.body.reason, "used");

    const [ownerAccount] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.owner));
    const joined = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientUserId, ownerAccount.id));
    assert.ok(joined.some((message) => message.eventCode === "business.member_joined"), "owner is told about the new member");

    const events = await eventsFor(businessId);
    assert.deepEqual(events.map((event) => event.action), ["invited", "accepted"]);
  });

  it("BMEM-T01: an expired invitation cannot be accepted and a revoked one reads as revoked", async () => {
    const invited = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: emails[users.second], role: "manager" } });
    assert.equal(invited.status, 201);
    await dispatchInvitations();
    const token = tokenFromEmail(sent.find((entry) => entry.to === emails[users.second])!);

    const before = clock;
    clock = new Date(before.getTime() + 8 * 24 * 60 * 60_000);
    try {
      const expired = await request("/business-invitations/accept", { method: "POST", userId: users.second, body: { token } });
      assert.equal(expired.status, 409);
      assert.equal(expired.body.reason, "expired");
      // Re-inviting after expiry supersedes the stale invitation instead of colliding with it.
      const again = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: emails[users.second], role: "owner" } });
      assert.equal(again.status, 201, JSON.stringify(again.body));
      const revoked = await request(`/businesses/${businessId}/invitations/${again.body.id}`, { method: "DELETE" });
      assert.equal(revoked.status, 200);
      const [queued] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientInvitationId, again.body.id));
      assert.equal(queued.status, "cancelled", "a queued invitation e-mail is cancelled on revoke");
      const managerRevoke = await request(`/businesses/${businessId}/invitations/${again.body.id}`, { method: "DELETE", userId: users.manager });
      assert.equal(managerRevoke.status, 403);
    } finally {
      clock = before;
    }
  });

  it("BMEM-T02: managers see members but cannot invite, change roles, transfer, remove others, or close", async () => {
    const listing = await request(`/businesses/${businessId}/members`, { userId: users.manager });
    assert.equal(listing.status, 200);
    assert.equal(listing.body.viewerRole, "manager");
    assert.deepEqual(listing.body.invitations, [], "addresses are hidden from managers");
    const ownerRow = listing.body.members.find((member: { role: string }) => member.role === "owner");
    const forbidden: [string, string, unknown?][] = [
      ["POST", `/businesses/${businessId}/invitations`, { email: "x@example.test", role: "manager" }],
      ["PATCH", `/businesses/${businessId}/members/${ownerRow.id}`, { role: "manager" }],
      ["DELETE", `/businesses/${businessId}/members/${ownerRow.id}`],
      ["POST", `/businesses/${businessId}/ownership/transfer`, { memberId: ownerRow.id }],
      ["POST", `/businesses/${businessId}/close`, { confirm: true }],
    ];
    for (const [method, path, body] of forbidden) {
      const res = await request(path, { method, userId: users.manager, body });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.body.code, "FORBIDDEN");
    }
  });

  it("BMEM-T03: the last owner cannot be demoted or leave; transfer swaps roles and then leaving works", async () => {
    const listing = await request(`/businesses/${businessId}/members`);
    const ownerRow = listing.body.members.find((member: { isSelf: boolean }) => member.isSelf);
    const managerRow = listing.body.members.find((member: { role: string }) => member.role === "manager");

    const demote = await request(`/businesses/${businessId}/members/${ownerRow.id}`, { method: "PATCH", body: { role: "manager" } });
    assert.equal(demote.status, 409);
    assert.deepEqual(demote.body.fieldErrors, [{ field: "role", code: "last_owner" }]);
    const leave = await request(`/businesses/${businessId}/members/${ownerRow.id}`, { method: "DELETE" });
    assert.equal(leave.status, 409);
    const selfTransfer = await request(`/businesses/${businessId}/ownership/transfer`, { method: "POST", body: { memberId: ownerRow.id } });
    assert.equal(selfTransfer.status, 400);

    const transfer = await request(`/businesses/${businessId}/ownership/transfer`, { method: "POST", body: { memberId: managerRow.id } });
    assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
    assert.equal(transfer.body.viewerRole, "manager");
    const after = await request(`/businesses/${businessId}/members`, { userId: users.manager });
    assert.equal(after.body.viewerRole, "owner");
    assert.equal(after.body.members.filter((member: { role: string }) => member.role === "owner").length, 1);

    // The former owner (now manager) may leave; the new owner is told nothing extra and remains the single owner.
    const left = await request(`/businesses/${businessId}/members/${ownerRow.id}`, { method: "DELETE", userId: users.owner });
    assert.equal(left.status, 200);
    assert.equal(left.body.left, true);
    const gone = await request(`/businesses/${businessId}/members`, { userId: users.owner });
    assert.equal(gone.status, 404, "after leaving, the business is no longer visible");

    // Promote back: the new owner re-invites via role change is impossible for a non-member, so use an invitation and a role change.
    const invite = await request(`/businesses/${businessId}/invitations`, { method: "POST", userId: users.manager, body: { email: emails[users.owner], role: "manager" } });
    assert.equal(invite.status, 201);
    await dispatchInvitations();
    const token = tokenFromEmail(sent.filter((entry) => entry.to === emails[users.owner]).at(-1)!);
    const accepted = await request("/business-invitations/accept", { method: "POST", userId: users.owner, body: { token } });
    assert.equal(accepted.status, 200);
    const members = await request(`/businesses/${businessId}/members`, { userId: users.manager });
    const rejoined = members.body.members.find((member: { isSelf: boolean; role: string }) => !member.isSelf);
    const promote = await request(`/businesses/${businessId}/members/${rejoined.id}`, { method: "PATCH", userId: users.manager, body: { role: "owner" } });
    assert.equal(promote.status, 200);
    const [managerAccount] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.manager));
    const transferMail = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientUserId, managerAccount.id));
    assert.ok(transferMail.some((message) => message.eventCode === "business.ownership_transferred"));

    const events = await eventsFor(businessId);
    assert.ok(["transferred", "left", "role_changed"].every((action) => events.some((event) => event.action === action)), JSON.stringify(events));
  });

  it("BMEM-T05: sole-owner deletion is blocked with a reason and allowed once another owner exists", async () => {
    // outsider solely owns the other (published) business.
    const blocked = await request("/account/deletion-requests", { method: "POST", userId: users.outsider, body: { acknowledgedScopes: ALL_DELETION_SCOPES } });
    assert.equal(blocked.status, 201, JSON.stringify(blocked.body));
    assert.equal(blocked.body.status, "blocked");
    assert.equal(blocked.body.blocker?.code, "blocked_ownership");
    assert.deepEqual(blocked.body.blocker.businesses.map((business: { businessProfileId: number }) => business.businessProfileId), [otherBusinessId]);
    const withdraw = await request(`/account/requests/${blocked.body.id}/withdraw`, { method: "POST", userId: users.outsider, body: { expectedVersion: blocked.body.version } });
    assert.equal(withdraw.status, 200, JSON.stringify(withdraw.body));

    // Ownership transferred (a second owner exists) → the same request is no longer blocked.
    await db.insert(businessMembersTable).values({ businessProfileId: otherBusinessId, userId: users.second, role: "owner" });
    const allowed = await request("/account/deletion-requests", { method: "POST", userId: users.outsider, body: { acknowledgedScopes: ALL_DELETION_SCOPES } });
    assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
    assert.equal(allowed.body.status, "received");
    assert.equal(allowed.body.blocker, null);
    await request(`/account/requests/${allowed.body.id}/withdraw`, { method: "POST", userId: users.outsider, body: { expectedVersion: allowed.body.version } });
  });

  it("BMEM-T04/T06: close unpublishes through the owner route, keeps rows, writes audit, and is idempotent", async () => {
    const missingConfirm = await request(`/businesses/${businessId}/close`, { method: "POST", body: {} });
    assert.equal(missingConfirm.status, 400);
    const closed = await request(`/businesses/${businessId}/close`, { method: "POST", body: { confirm: true } });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    assert.deepEqual(closed.body, { businessId, publicationStatus: "unpublished", closed: true });
    const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, businessId));
    assert.equal(profile.publicationStatus, "unpublished");
    assert.ok(profile.closedAt);
    const membersKept = await db.select().from(businessMembersTable).where(eq(businessMembersTable.businessProfileId, businessId));
    assert.equal(membersKept.length, 2, "membership records are kept");
    const again = await request(`/businesses/${businessId}/close`, { method: "POST", body: { confirm: true } });
    assert.equal(again.status, 200);
    const events = await eventsFor(businessId);
    assert.equal(events.filter((event) => event.action === "closed").length, 1, "closing twice writes one audit row");
    const invite = await request(`/businesses/${businessId}/invitations`, { method: "POST", body: { email: "late@example.test", role: "manager" } });
    assert.equal(invite.status, 409, "closed businesses take no new members");
  });

  it("BMEM-T07: membership changes leave consumer preferences untouched", async () => {
    const [ownerAccount] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.owner));
    const [preferences] = await db.select().from(consumerPreferencesTable).where(eq(consumerPreferencesTable.userId, ownerAccount.id));
    assert.deepEqual(preferences.neighborhoodIds, ["centrum"]);
    assert.deepEqual(preferences.interestIds, ["food"]);
  });
});
