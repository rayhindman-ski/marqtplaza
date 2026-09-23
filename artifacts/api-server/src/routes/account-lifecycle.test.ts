import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { and, eq, inArray, like } from "drizzle-orm";

import {
  accountRequestEventsTable,
  accountRequestsTable,
  appUsersTable,
  businessMembersTable,
  businessProfilesTable,
  businessReviewsTable,
  db,
  lifecycleDeliveryAttemptsTable,
  lifecycleOutboxTable,
  pool,
} from "@workspace/db";

import { createAccountLifecycleRouter } from "./account-lifecycle";
import { createBusinessesRouter } from "./businesses";
import { createSavedEventsRouter } from "./saved-events";
import {
  DEFAULT_MAX_ATTEMPTS,
  dispatchLifecycleOutbox,
  enqueueLifecycleMessage,
  recordDeliveryReceipt,
  LIFECYCLE_EVENT_CODES,
  requeueFailedLifecycleMessage,
  resolveLifecycleDeliveryLoader,
  restrictPayload,
  UnsafePayloadError,
  type DeliveryResult,
  type OutboundLifecycleMessage,
} from "../lib/lifecycleOutbox";
import { applyClaimDecision } from "../lib/claimDecisions";
import {
  createEmailDeliveryLoader,
  createResendTransport,
  parseResendReceipt,
  signWebhookPayload,
  verifyWebhookSignature,
  type OutboundEmail,
  type RecipientResolution,
} from "../lib/lifecycleEmailProvider";
import { renderLifecycleEmail } from "../lib/lifecycleTemplates";
import { createLifecycleReceiptsRouter } from "./lifecycle-receipts";
import { businessClaimsTable } from "@workspace/db";
import type { Identity } from "../lib/permissions";

const runId = `${process.pid}-${Date.now()}`;
const users = {
  requester: `lifecycle-test-${runId}-requester`,
  soleOwner: `lifecycle-test-${runId}-sole-owner`,
  coOwner: `lifecycle-test-${runId}-co-owner`,
  support: `lifecycle-test-${runId}-support`,
  claimant: `lifecycle-test-${runId}-claimant`,
  outbox: `lifecycle-test-${runId}-outbox`,
};
const allUserIds = Object.values(users);
const keyPrefix = `lifecycle-test:${runId}`;

let flags = { accounts: true, businessIntake: true, businessPublication: true, consumerRegistration: false };

function identityFromHeaders(req: express.Request): Identity | null {
  const userId = req.header("x-test-user-id");
  if (!userId) return null;
  return {
    userId,
    emailVerified: req.header("x-test-unverified") !== "1",
    isEditor: req.header("x-test-editor") === "1",
  };
}

const RECEIPT_SECRET = "whsec_" + Buffer.from(`lifecycle-receipt-secret-${runId}`).toString("base64");
const app = express();
app.use("/api", createLifecycleReceiptsRouter({ env: { LIFECYCLE_RECEIPT_WEBHOOK_SECRET: RECEIPT_SECRET } }));
app.use(express.json());
app.use("/api", createAccountLifecycleRouter({ resolveIdentity: identityFromHeaders, flags: () => flags }));
// Legacy account-owned routes share the same subject resolution; the listing
// resolver is injected so claims never call an outbound provider.
const legacyListingId = `lifecycle-legacy-${runId}`;
app.use(
  "/api",
  createBusinessesRouter({
    getUserId: (req) => req.header("x-test-user-id") ?? null,
    flags: () => flags,
    resolveListing: async (cityId, listingSource, listingId) =>
      listingId === legacyListingId
        ? { id: listingId, locationId: cityId, name: `Legacy ${runId}`, source: "openstreetmap", address: undefined, neighborhood: undefined, lat: 52.08, lng: 4.31, sourceUrl: undefined }
        : null,
  }),
);
app.use("/api", createSavedEventsRouter((req) => req.header("x-test-user-id") ?? null));

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const profileIds: number[] = [];

async function request(
  path: string,
  init: RequestInit & { userId?: string | null; editor?: boolean } = {},
): Promise<{ status: number; body: any }> {
  const { userId = users.requester, editor = false, headers, ...rest } = init;
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

const json = (value: unknown) => JSON.stringify(value);
const ALL_SCOPES = ["account_profile", "preferences", "consents", "saved_events", "business_memberships"];

async function createProfile(name: string): Promise<number> {
  const [profile] = await db
    .insert(businessProfilesTable)
    .values({
      slug: `lifecycle-${runId}-${profileIds.length}`,
      cityId: "dhg",
      listingSource: "openstreetmap",
      listingId: `lifecycle-${runId}-${profileIds.length}`,
      name,
      isClaimed: true,
      claimedAt: new Date(),
      publicationStatus: "published",
    })
    .returning({ id: businessProfilesTable.id });
  profileIds.push(profile.id);
  return profile.id;
}

async function cleanup(): Promise<void> {
  await db.delete(lifecycleOutboxTable).where(like(lifecycleOutboxTable.idempotencyKey, `${keyPrefix}%`));
  const testUsers = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUserIds));
  if (testUsers.length > 0) {
    await db.delete(lifecycleOutboxTable).where(inArray(lifecycleOutboxTable.recipientUserId, testUsers.map((u) => u.id)));
  }
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, allUserIds));
  await db.delete(businessMembersTable).where(inArray(businessMembersTable.userId, allUserIds));
  await db.delete(businessClaimsTable).where(inArray(businessClaimsTable.claimantId, allUserIds));
  if (profileIds.length > 0) {
    await db.delete(businessReviewsTable).where(inArray(businessReviewsTable.targetId, profileIds));
    await db.delete(businessProfilesTable).where(inArray(businessProfilesTable.id, profileIds));
  }
}

async function outboxRows(clerkUserId: string) {
  const [user] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, clerkUserId));
  if (!user) return [];
  return db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientUserId, user.id)).orderBy(lifecycleOutboxTable.id);
}

describe("lifecycle outbox", () => {
  before(async () => {
    await cleanup();
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

  it("rejects payloads that could leak contact data, tokens, or reviewer details", () => {
    assert.throws(() => restrictPayload({ email: "x@example.com" }), UnsafePayloadError);
    assert.throws(() => restrictPayload({ token: "abc" }), UnsafePayloadError);
    assert.throws(() => restrictPayload({ reviewNote: "private" }), UnsafePayloadError);
    assert.throws(() => restrictPayload({ businessName: { nested: true } }), UnsafePayloadError);
    assert.deepEqual(restrictPayload({ businessName: "Bakkerij", claimId: 3, status: undefined }), { businessName: "Bakkerij", claimId: 3 });
  });

  it("deduplicates by idempotency key and provisions the recipient in the same transaction", async () => {
    const first = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.submitted",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:dedupe`,
        payload: { claimId: 1, businessName: "Dedupe" },
      }),
    );
    const second = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.submitted",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:dedupe`,
        payload: { claimId: 1, businessName: "Dedupe" },
      }),
    );
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
    const rows = await outboxRows(users.outbox);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, "queued");
  });

  it("rolls the message back together with the state change it belongs to", async () => {
    await assert.rejects(
      db.transaction(async (tx) => {
        await enqueueLifecycleMessage(tx, {
          eventCode: "claim.submitted",
          recipientClerkUserId: users.outbox,
          idempotencyKey: `${keyPrefix}:rolled-back`,
        });
        throw new Error("state change failed");
      }),
    );
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.idempotencyKey, `${keyPrefix}:rolled-back`));
    assert.equal(row, undefined);
  });

  it("leaves rows queued without consuming attempts when no provider is configured", async () => {
    const summary = await dispatchLifecycleOutbox({ limit: 100 });
    assert.ok(summary.claimed >= 1);
    assert.equal(summary.accepted + summary.failed + summary.retried, 0);
    const rows = await outboxRows(users.outbox);
    assert.equal(rows[0]!.status, "queued");
    assert.equal(rows[0]!.attempts, 0);
  });

  it("cancels messages whose recipient account row no longer exists instead of dispatching them", async () => {
    const ghost = `${users.outbox}-ghost`;
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.approved",
        recipientClerkUserId: ghost,
        idempotencyKey: `${keyPrefix}:ghost`,
        payload: { claimId: 1 },
      }),
    );
    await db.delete(appUsersTable).where(eq(appUsersTable.clerkUserId, ghost));
    let delivered = 0;
    const summary = await dispatchLifecycleOutbox({
      deliver: async (message) => {
        if (message.id === id) delivered += 1;
        return { kind: "not_configured" };
      },
      limit: 10_000,
    });
    assert.ok(summary.cancelled >= 1);
    assert.equal(delivered, 0);
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "cancelled");
    assert.equal(row!.lastErrorCode, "recipient_gone");
    assert.equal(row!.attempts, 0);
  });

  it("retries transient failures with backoff, records every attempt, and fails when exhausted", async () => {
    let clock = new Date("2026-09-14T10:00:00.000Z");
    const now = () => clock;
    const results: DeliveryResult[] = [
      { kind: "transient_failure", errorCode: "provider_timeout" },
      { kind: "transient_failure", errorCode: "provider_5xx" },
      { kind: "permanent_failure", errorCode: "address_rejected" },
    ];
    const seen: OutboundLifecycleMessage[] = [];
    const deliver = async (message: OutboundLifecycleMessage): Promise<DeliveryResult> => {
      if (message.id !== id) return { kind: "not_configured" };
      seen.push(message);
      return results.shift()!;
    };
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.rejected",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:retry`,
        maxAttempts: 5,
      }),
    );
    await dispatchLifecycleOutbox({ deliver, now, backoffMs: (attempt) => attempt * 60_000, limit: 100 });
    let [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "queued");
    assert.equal(row!.attempts, 1);
    assert.equal(row!.lastErrorCode, "provider_timeout");
    assert.equal(row!.nextRetryAt!.toISOString(), "2026-09-14T10:01:00.000Z");

    // Not due yet: the dispatcher must skip it.
    clock = new Date("2026-09-14T10:00:30.000Z");
    await dispatchLifecycleOutbox({ deliver, now, limit: 100 });
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.attempts, 1);

    clock = new Date("2026-09-14T10:01:00.000Z");
    await dispatchLifecycleOutbox({ deliver, now, backoffMs: (attempt) => attempt * 60_000, limit: 100 });
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.attempts, 2);
    assert.equal(row!.nextRetryAt!.toISOString(), "2026-09-14T10:03:00.000Z");

    clock = new Date("2026-09-14T10:03:00.000Z");
    await dispatchLifecycleOutbox({ deliver, now, limit: 100 });
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "failed");
    assert.equal(row!.lastErrorCode, "address_rejected");
    assert.ok(row!.failedAt);

    const attempts = await db
      .select()
      .from(lifecycleDeliveryAttemptsTable)
      .where(eq(lifecycleDeliveryAttemptsTable.outboxId, id))
      .orderBy(lifecycleDeliveryAttemptsTable.attempt);
    assert.deepEqual(
      attempts.map((attempt) => [attempt.attempt, attempt.outcome, attempt.errorCode]),
      [
        [1, "transient_failure", "provider_timeout"],
        [2, "transient_failure", "provider_5xx"],
        [3, "permanent_failure", "address_rejected"],
      ],
    );
    // The provider only ever sees internal references, never an address or evidence.
    for (const message of seen) {
      assert.deepEqual(Object.keys(message).sort(), ["attempt", "dedupeKey", "eventCode", "id", "locale", "payload", "recipientClerkUserId", "recipientRegistrationId", "recipientUserId", "template"]);
      assert.equal(message.recipientRegistrationId, null);
    }

    // Support can re-queue a failed message; a second resend of a queued message is refused.
    const resend = await request(`/api/review/lifecycle-messages/${id}/resend`, { method: "POST", userId: users.support, editor: true });
    assert.equal(resend.status, 200, json(resend.body));
    assert.equal(resend.body.status, "queued");
    // Attempt numbering stays monotonic; the resend grants a fresh budget instead of resetting history.
    assert.equal(resend.body.attempts, 3);
    assert.equal(resend.body.maxAttempts, 3 + DEFAULT_MAX_ATTEMPTS);
    const again = await request(`/api/review/lifecycle-messages/${id}/resend`, { method: "POST", userId: users.support, editor: true });
    assert.equal(again.status, 409);
    const forbidden = await request(`/api/review/lifecycle-messages/${id}/resend`, { method: "POST", userId: users.requester });
    assert.equal(forbidden.status, 403);

    // The resent row is actually delivered on the next dispatch and keeps its full attempt history.
    results.push({ kind: "accepted", providerMessageId: `${keyPrefix}:resend-receipt` });
    clock = new Date("2026-09-14T10:10:00.000Z");
    const afterResend = await dispatchLifecycleOutbox({ deliver, now, limit: 100 });
    assert.equal(afterResend.accepted, 1, json(afterResend));
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "accepted");
    assert.equal(row!.attempts, 4);
    assert.equal(row!.lastErrorCode, null);
    const history = await db
      .select()
      .from(lifecycleDeliveryAttemptsTable)
      .where(eq(lifecycleDeliveryAttemptsTable.outboxId, id))
      .orderBy(lifecycleDeliveryAttemptsTable.attempt);
    assert.deepEqual(
      history.map((attempt) => [attempt.attempt, attempt.outcome]),
      [[1, "transient_failure"], [2, "transient_failure"], [3, "permanent_failure"], [4, "accepted"]],
    );
    assert.equal(await recordDeliveryReceipt(`${keyPrefix}:resend-receipt`, now()), "delivered");
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "delivered");
  });

  it("exhausts the retry budget as failed even when every failure is transient", async () => {
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.approved",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:exhaust`,
        maxAttempts: 2,
      }),
    );
    let clock = new Date("2026-09-14T12:00:00.000Z");
    const deliver = async (message: OutboundLifecycleMessage): Promise<DeliveryResult> =>
      message.id === id ? { kind: "transient_failure", errorCode: "provider_timeout" } : { kind: "not_configured" };
    await dispatchLifecycleOutbox({ deliver, now: () => clock, backoffMs: () => 1000, limit: 100 });
    clock = new Date("2026-09-14T12:00:01.000Z");
    await dispatchLifecycleOutbox({ deliver, now: () => clock, limit: 100 });
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "failed");
    assert.equal(row!.lastErrorCode, "attempts_exhausted");
    assert.equal(row!.attempts, 2);
  });

  it("marks accepted messages delivered once per provider receipt and ignores unknown receipts", async () => {
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "business.published",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:receipt`,
      }),
    );
    const providerMessageId = `${keyPrefix}:provider:1`;
    await dispatchLifecycleOutbox({
      deliver: async (message) => (message.id === id ? { kind: "accepted", providerMessageId } : { kind: "not_configured" }),
      limit: 100,
    });
    let [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "accepted");
    assert.ok(row!.acceptedAt);
    assert.equal(row!.deliveredAt, null);

    assert.equal(await recordDeliveryReceipt(providerMessageId), "delivered");
    assert.equal(await recordDeliveryReceipt(providerMessageId), "already_delivered");
    assert.equal(await recordDeliveryReceipt(`${keyPrefix}:provider:unknown`), "unknown");
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "delivered");

    // A second dispatcher run never touches an accepted/delivered row again.
    const summary = await dispatchLifecycleOutbox({
      deliver: async (message) => (message.id === id ? { kind: "accepted" } : { kind: "not_configured" }),
      limit: 100,
    });
    const touched = await db.select().from(lifecycleDeliveryAttemptsTable).where(eq(lifecycleDeliveryAttemptsTable.outboxId, id));
    assert.equal(touched.length, 1);
    assert.ok(summary.claimed >= 0);
  });

  it("does not let concurrent dispatchers deliver the same row twice", async () => {
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "business.unpublished",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:concurrent`,
      }),
    );
    let calls = 0;
    const deliver = async (message: OutboundLifecycleMessage): Promise<DeliveryResult> => {
      if (message.id !== id) return { kind: "not_configured" };
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { kind: "accepted", providerMessageId: `${keyPrefix}:concurrent:${calls}` };
    };
    await Promise.all([dispatchLifecycleOutbox({ deliver, limit: 100 }), dispatchLifecycleOutbox({ deliver, limit: 100 })]);
    const attempts = await db.select().from(lifecycleDeliveryAttemptsTable).where(eq(lifecycleDeliveryAttemptsTable.outboxId, id));
    assert.equal(attempts.length, 1);
  });

  it("exposes message status to the recipient without payload, address, or error details", async () => {
    const response = await request("/api/account/messages", { userId: users.outbox });
    assert.equal(response.status, 200, json(response.body));
    assert.ok(response.body.messages.length >= 4);
    const statuses = new Set(response.body.messages.map((message: { status: string }) => message.status));
    assert.ok(statuses.has("delivered"));
    assert.ok(statuses.has("queued"));
    for (const message of response.body.messages) {
      assert.equal("payload" in message, false);
      assert.equal("lastErrorCode" in message, false);
      assert.equal("recipientUserId" in message, false);
    }
    const support = await request("/api/review/lifecycle-messages?status=failed", { userId: users.support, editor: true });
    assert.equal(support.status, 200);
    assert.ok(support.body.messages.every((message: { status: string }) => message.status === "failed"));
    assert.ok(support.body.messages.some((message: { lastErrorCode: string }) => message.lastErrorCode === "attempts_exhausted"));
  });

  it("queues claimant messages inside claim decisions and keeps reviewer notes out of them", async () => {
    const profileId = await createProfile(`Claimed ${runId}`);
    const [claim] = await db
      .insert(businessClaimsTable)
      .values({ businessProfileId: profileId, claimantId: users.claimant, contactName: "Test", contactEmail: "test@example.com", relationship: "owner", status: "submitted", version: 1 })
      .returning();
    await applyClaimDecision({
      claimId: claim!.id,
      reviewerId: users.support,
      decision: "request_changes",
      reason: "Private reviewer note that must never be mailed",
      expectedVersion: 1,
    });
    const rows = await outboxRows(users.claimant);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.eventCode, "claim.changes_requested");
    assert.equal(rows[0]!.status, "queued");
    assert.equal(JSON.stringify(rows[0]!.payload).includes("Private reviewer note"), false);
    assert.equal(rows[0]!.payload.claimId, claim!.id);
  });
  // ------------------------------------------------------- deletion requests ---

  it("requires the accounts gate, verification, and every scope acknowledgement", async () => {
    flags = { ...flags, accounts: false };
    const gated = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(gated.status, 404);
    flags = { ...flags, accounts: true };

    const unverified = await request("/api/account/deletion-requests", {
      method: "POST",
      headers: { "x-test-unverified": "1" },
      body: json({ acknowledgedScopes: ALL_SCOPES }),
    });
    assert.equal(unverified.status, 403);
    assert.equal(unverified.body.code, "EMAIL_UNVERIFIED");

    const partial = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ["account_profile"] }) });
    assert.equal(partial.status, 400);
    assert.equal(partial.body.code, "VALIDATION_FAILED");
    assert.ok(partial.body.fieldErrors.some((error: { field: string }) => error.field === "acknowledgedScopes.business_memberships"));

    const unknownScope = await request("/api/account/deletion-requests", {
      method: "POST",
      body: json({ acknowledgedScopes: [...ALL_SCOPES, "research_registration"] }),
    });
    assert.equal(unknownScope.status, 400, "the research registration is a separate scope and cannot be folded into account deletion");

    const extraField = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ALL_SCOPES, reason: "x" }) });
    assert.equal(extraField.status, 400);
    assert.equal(extraField.body.code, "UNKNOWN_FIELD");
  });

  it("records, tracks, and withdraws a deletion request with its messages committed alongside", async () => {
    const created = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(created.status, 201, json(created.body));
    assert.equal(created.body.status, "received");
    assert.equal(created.body.blocker, null);
    assert.equal(created.body.deadlineAt, null, "no deadline may be invented before release configuration approves one");
    assert.equal("resolutionNote" in created.body, false);
    assert.equal("resolvedByUserId" in created.body, false);

    const duplicate = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, "IDEMPOTENCY_CONFLICT");

    const list = await request("/api/account/requests");
    assert.equal(list.status, 200);
    assert.equal(list.body.requests.length, 1);
    assert.equal(list.body.requests[0].id, created.body.id);

    const messages = await outboxRows(users.requester);
    assert.deepEqual(messages.map((row) => row.eventCode), ["account.deletion_received"]);
    assert.equal(messages[0]!.payload.requestId, created.body.id);

    const stale = await request(`/api/account/requests/${created.body.id}/withdraw`, { method: "POST", body: json({ expectedVersion: 99 }) });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.expectedVersion, created.body.version);

    const withdrawn = await request(`/api/account/requests/${created.body.id}/withdraw`, {
      method: "POST",
      body: json({ expectedVersion: created.body.version }),
    });
    assert.equal(withdrawn.status, 200, json(withdrawn.body));
    assert.equal(withdrawn.body.status, "withdrawn");
    assert.ok(withdrawn.body.withdrawnAt);

    const again = await request(`/api/account/requests/${created.body.id}/withdraw`, {
      method: "POST",
      body: json({ expectedVersion: withdrawn.body.version }),
    });
    assert.equal(again.status, 409);

    const others = await request(`/api/account/requests/${created.body.id}/withdraw`, {
      method: "POST",
      userId: users.coOwner,
      body: json({ expectedVersion: withdrawn.body.version }),
    });
    assert.equal(others.status, 404, "another user's request must be invisible");

    const events = await db.select().from(accountRequestEventsTable).where(eq(accountRequestEventsTable.requestId, created.body.id));
    assert.deepEqual(events.map((event) => [event.fromStatus, event.toStatus, event.actor]), [
      [null, "received", "requester"],
      ["received", "withdrawn", "requester"],
    ]);

    // A withdrawn request frees the slot for a new one.
    const fresh = await request("/api/account/deletion-requests", { method: "POST", body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(fresh.status, 201);
  });

  it("blocks sole owners and routes them through an audited support decision without deleting history", async () => {
    const soleProfileId = await createProfile(`Sole ${runId}`);
    const sharedProfileId = await createProfile(`Shared ${runId}`);
    await db.insert(businessMembersTable).values([
      { businessProfileId: soleProfileId, userId: users.soleOwner, role: "owner" },
      { businessProfileId: sharedProfileId, userId: users.soleOwner, role: "owner" },
      { businessProfileId: sharedProfileId, userId: users.coOwner, role: "owner" },
    ]);
    const [claim] = await db
      .insert(businessClaimsTable)
      .values({ businessProfileId: soleProfileId, claimantId: users.soleOwner, contactName: "Test", contactEmail: "test@example.com", relationship: "owner", status: "approved", version: 2 })
      .returning();

    const created = await request("/api/account/deletion-requests", { method: "POST", userId: users.soleOwner, body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(created.status, 201, json(created.body));
    assert.equal(created.body.status, "blocked");
    assert.equal(created.body.blocker.code, "blocked_ownership");
    assert.deepEqual(
      created.body.blocker.businesses.map((business: { businessProfileId: number; resolved: boolean }) => [business.businessProfileId, business.resolved]),
      [[soleProfileId, false]],
      "only the sole-owned business blocks; the shared one has another owner",
    );
    const blockedMessages = await outboxRows(users.soleOwner);
    assert.deepEqual(blockedMessages.map((row) => row.eventCode), ["account.deletion_blocked"]);

    const requestId = created.body.id as number;
    const decide = (body: unknown, userId = users.support) =>
      request(`/api/review/account-requests/${requestId}/decision`, { method: "POST", userId, editor: true, body: json(body) });

    // Requester cannot act as support on their own request; a plain user cannot at all.
    const self = await decide({ expectedVersion: 1, decision: "start_review" }, users.soleOwner);
    assert.equal(self.status, 403);
    assert.equal(self.body.code, "SELF_REVIEW_FORBIDDEN");
    const plain = await request(`/api/review/account-requests/${requestId}/decision`, { method: "POST", userId: users.coOwner, body: json({ expectedVersion: 1, decision: "start_review" }) });
    assert.equal(plain.status, 403);

    // Completing while blocked is refused, and so is a resolution for a business that is not blocking.
    const early = await decide({ expectedVersion: 1, decision: "complete" });
    assert.equal(early.status, 400);
    const wrongBusiness = await decide({ expectedVersion: 1, decision: "resolve_blocker", resolutionCode: "business_closed", businessProfileId: sharedProfileId });
    assert.equal(wrongBusiness.status, 400);
    assert.equal(wrongBusiness.body.fieldErrors[0].code, "not_blocking");
    const noOtherOwner = await decide({ expectedVersion: 1, decision: "resolve_blocker", resolutionCode: "ownership_transferred", businessProfileId: soleProfileId });
    assert.equal(noOtherOwner.status, 400);
    assert.equal(noOtherOwner.body.fieldErrors[0].code, "no_other_owner");

    const queue = await request("/api/review/account-requests", { userId: users.support, editor: true });
    assert.equal(queue.status, 200);
    assert.ok(queue.body.requests.some((row: { id: number; status: string }) => row.id === requestId && row.status === "blocked"));

    const unpublished = await decide({
      expectedVersion: 1,
      decision: "resolve_blocker",
      resolutionCode: "business_unpublished",
      businessProfileId: soleProfileId,
      note: "Owner confirmed by phone",
    });
    assert.equal(unpublished.status, 200, json(unpublished.body));
    assert.equal(unpublished.body.status, "received", "the last blocker resolved returns the request to the support queue");
    assert.equal(unpublished.body.blocker.businesses[0].resolved, true);
    assert.equal(unpublished.body.blocker.businesses[0].publicationStatus, "unpublished");

    const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, soleProfileId));
    assert.equal(profile!.publicationStatus, "unpublished");
    const [claimStill] = await db.select().from(businessClaimsTable).where(eq(businessClaimsTable.id, claim!.id));
    assert.ok(claimStill, "claims are never deleted by a support resolution");
    const memberships = await db
      .select()
      .from(businessMembersTable)
      .where(and(eq(businessMembersTable.businessProfileId, soleProfileId), eq(businessMembersTable.userId, users.soleOwner)));
    assert.equal(memberships.length, 1, "memberships stay until the approved erasure step");
    const reviews = await db
      .select()
      .from(businessReviewsTable)
      .where(and(eq(businessReviewsTable.targetType, "publication"), eq(businessReviewsTable.targetId, soleProfileId)));
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]!.reasonCode, "business_unpublished");

    const ownerMessages = await outboxRows(users.soleOwner);
    assert.deepEqual(
      ownerMessages.map((row) => row.eventCode),
      ["account.deletion_blocked", "business.unpublished", "account.deletion_received"],
    );

    // The requester sees status and blockers but never the support note or handler.
    const mine = await request("/api/account/requests", { userId: users.soleOwner });
    const view = mine.body.requests.find((row: { id: number }) => row.id === requestId);
    assert.equal(view.status, "received");
    assert.equal(JSON.stringify(view).includes("Owner confirmed by phone"), false);
    assert.equal(JSON.stringify(view).includes(users.support), false);

    const started = await decide({ expectedVersion: unpublished.body.version, decision: "start_review" });
    assert.equal(started.status, 200, json(started.body));
    assert.equal(started.body.status, "in_review");

    const withdrawLate = await request(`/api/account/requests/${requestId}/withdraw`, {
      method: "POST",
      userId: users.soleOwner,
      body: json({ expectedVersion: started.body.version }),
    });
    assert.equal(withdrawLate.status, 409, "requests in review can no longer be withdrawn by the requester");

    const staleComplete = await decide({ expectedVersion: 1, decision: "complete" });
    assert.equal(staleComplete.status, 409);

    const completed = await decide({ expectedVersion: started.body.version, decision: "complete", note: "Retention step pending approval" });
    assert.equal(completed.status, 200, json(completed.body));
    assert.equal(completed.body.status, "completed");
    assert.equal(completed.body.resolutionCode, "account_deleted");
    assert.equal(completed.body.resolutionNote, "Retention step pending approval");
    assert.equal(completed.body.events.length, 4);

    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, users.soleOwner));
    assert.equal(user!.status, "deleted");
    const afterwards = await request("/api/account/requests", { userId: users.soleOwner });
    assert.equal(afterwards.status, 403);
    assert.equal(afterwards.body.code, "ACCOUNT_DELETED");
    // Retained saved data and memberships are no longer reachable through legacy routes either.
    const savedEvents = await request("/api/saved-events", { userId: users.soleOwner });
    assert.equal(savedEvents.status, 403);
    assert.equal(savedEvents.body.code, "ACCOUNT_DELETED");
    const savedSync = await request("/api/saved-events/sync", { method: "POST", userId: users.soleOwner, body: json({ events: [] }) });
    assert.equal(savedSync.status, 403);
    const legacyClaims = await request("/api/business-claims", { userId: users.soleOwner });
    assert.equal(legacyClaims.status, 403);
    assert.equal(legacyClaims.body.code, "ACCOUNT_DELETED");
    const legacyProfiles = await request("/api/business-profiles/mine", { userId: users.soleOwner });
    assert.equal(legacyProfiles.status, 403, "owned profiles are not served to a deleted account");

    const finalMessages = await outboxRows(users.soleOwner);
    assert.equal(finalMessages.at(-1)!.eventCode, "account.deletion_completed");
    const [requestRow] = await db.select().from(accountRequestsTable).where(eq(accountRequestsTable.id, requestId));
    assert.equal(requestRow!.resolvedByUserId, users.support);
  });

  it("queues the claimant confirmation inside the legacy claim submission transaction", async () => {
    const created = await request("/api/business-claims", {
      method: "POST",
      userId: users.claimant,
      body: json({
        listing: { cityId: "dhg", listingId: legacyListingId, listingSource: "openstreetmap", name: `Legacy ${runId}` },
        contactName: "Legacy Claimant",
        contactEmail: "legacy@example.com",
        relationship: "owner",
      }),
    });
    assert.equal(created.status, 201, json(created.body));
    const [claim] = await db
      .select()
      .from(businessClaimsTable)
      .where(and(eq(businessClaimsTable.claimantId, users.claimant), eq(businessClaimsTable.businessProfileId, created.body.businessProfileId ?? created.body.profile?.id ?? -1)));
    const [profileRow] = await db
      .select({ id: businessProfilesTable.id })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.listingId, legacyListingId));
    profileIds.push(profileRow!.id);
    const rows = await db
      .select()
      .from(lifecycleOutboxTable)
      .where(and(eq(lifecycleOutboxTable.eventCode, "claim.submitted"), like(lifecycleOutboxTable.idempotencyKey, `claim:%:v1:%`)));
    const claimRows = await db.select().from(businessClaimsTable).where(eq(businessClaimsTable.businessProfileId, profileRow!.id));
    assert.equal(claimRows.length, 1);
    const mine = rows.find((row) => row.idempotencyKey === `claim:${claimRows[0]!.id}:v1:${claimRows[0]!.status}`);
    assert.ok(mine, "legacy claim submission enqueued claim.submitted in the same transaction");
    assert.equal(mine!.status, "queued");
    assert.deepEqual(Object.keys(mine!.payload ?? {}).sort(), ["businessName", "businessProfileId", "claimId", "status"]);
    void claim;
    // A rejected listing produces neither a claim nor a message.
    const rejected = await request("/api/business-claims", {
      method: "POST",
      userId: users.claimant,
      body: json({
        listing: { cityId: "dhg", listingId: `${legacyListingId}-missing`, listingSource: "openstreetmap", name: "Missing" },
        contactName: "Legacy Claimant",
        contactEmail: "legacy@example.com",
        relationship: "owner",
      }),
    });
    assert.equal(rejected.status, 400);
  });

  it("keeps a business closed through support out of the live-ownership check", async () => {
    const profileId = await createProfile(`Closable ${runId}`);
    await db.insert(businessMembersTable).values({ businessProfileId: profileId, userId: users.coOwner, role: "owner" });
    const created = await request("/api/account/deletion-requests", { method: "POST", userId: users.coOwner, body: json({ acknowledgedScopes: ALL_SCOPES }) });
    assert.equal(created.status, 201, json(created.body));
    assert.equal(created.body.status, "blocked");
    const closed = await request(`/api/review/account-requests/${created.body.id}/decision`, {
      method: "POST",
      userId: users.support,
      editor: true,
      body: json({ expectedVersion: 1, decision: "resolve_blocker", resolutionCode: "business_closed", businessProfileId: profileId }),
    });
    assert.equal(closed.status, 200, json(closed.body));
    assert.equal(closed.body.status, "received");
    const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId));
    assert.equal(profile!.publicationStatus, "archived");
    const messages = await outboxRows(users.coOwner);
    assert.ok(messages.some((row) => row.eventCode === "business.closed"));
  });

  // --- e-mail delivery -----------------------------------------------------
  const FORBIDDEN = ["reviewer", "token", "@", "http://", "https://"];

  it("renders NL and EN copy for every event from the allow-listed payload only", () => {
    const payload = { businessName: `Bakkerij ${runId}`, requestId: 42, claimId: 7, status: "approved", blockerCode: "sole_owner" };
    for (const eventCode of LIFECYCLE_EVENT_CODES) {
      // The registration link mail is the documented exception (it carries a dispatch-time link);
      // it is covered by the consumer-registration suite.
      if (eventCode === "registration.link") continue;
      const nl = renderLifecycleEmail(eventCode, "nl", payload);
      const en = renderLifecycleEmail(eventCode, "en-GB", payload);
      assert.equal(nl.locale, "nl");
      assert.equal(en.locale, "en");
      assert.notEqual(nl.subject, en.subject, eventCode);
      assert.ok(nl.subject.length > 0 && nl.text.length > 0, eventCode);
      for (const rendered of [nl, en]) {
        for (const word of FORBIDDEN) {
          assert.ok(!rendered.subject.toLowerCase().includes(word), `${eventCode} subject contains ${word}`);
          assert.ok(!rendered.text.toLowerCase().includes(word), `${eventCode} body contains ${word}`);
        }
      }
      if (eventCode.startsWith("account.")) {
        assert.ok(nl.text.includes("42") && en.text.includes("42"), eventCode);
      } else {
        assert.ok(nl.subject.includes(payload.businessName) && en.subject.includes(payload.businessName), eventCode);
      }
    }
    // Unknown locales fall back to Dutch; injected control characters never reach a header.
    const fallback = renderLifecycleEmail("business.published", "de", { businessName: "Evil\r\nBcc: x" });
    assert.equal(fallback.locale, "nl");
    assert.ok(!fallback.subject.includes("\n"));
    assert.throws(() => renderLifecycleEmail("nope.event", "nl", {}), /No lifecycle template/);
  });

  it("resolves the address at dispatch time and never stores it in the outbox", async () => {
    const sent: OutboundEmail[] = [];
    const lookups: string[] = [];
    const address = `${runId}@example.test`;
    const deliver = createEmailDeliveryLoader({
      senderAddress: "noreply@buurtplaza.nl",
      resolveRecipient: async (clerkUserId) => {
        lookups.push(clerkUserId);
        return { kind: "found", recipient: { email: address } };
      },
      transport: async (email) => {
        sent.push(email);
        return { kind: "accepted", providerMessageId: `${keyPrefix}:email:${email.idempotencyKey}` };
      },
    });
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "claim.approved",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:email-dispatch`,
        payload: { businessName: `Slagerij ${runId}` },
        locale: "en",
      }),
    );
    await dispatchLifecycleOutbox({
      deliver: async (message) => (message.id === id ? deliver(message) : { kind: "not_configured" }),
      limit: 100,
    });
    assert.deepEqual(lookups, [users.outbox]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, address);
    assert.equal(sent[0]!.from, "noreply@buurtplaza.nl");
    assert.equal(sent[0]!.subject, `Your claim for Slagerij ${runId} has been approved`);
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "accepted");
    assert.equal(row!.providerMessageId, `${keyPrefix}:email:lifecycle-${id}-g${DEFAULT_MAX_ATTEMPTS}`);
    assert.ok(!JSON.stringify(row).includes(address), "outbox row must not contain the address");
    const attempts = await db.select().from(lifecycleDeliveryAttemptsTable).where(eq(lifecycleDeliveryAttemptsTable.outboxId, id));
    assert.ok(!JSON.stringify(attempts).includes(address));
  });

  it("keeps the provider idempotency key stable across automatic retries so an ambiguous send is never duplicated", async () => {
    // Attempt 1: the provider accepts remotely, but the response is lost locally (transient network failure).
    // Attempt 2 must present the same idempotency key so the provider can deduplicate.
    let clock = new Date("2026-09-14T14:00:00.000Z");
    const now = () => clock;
    const keys: string[] = [];
    let call = 0;
    const deliver = createEmailDeliveryLoader({
      senderAddress: "noreply@buurtplaza.nl",
      resolveRecipient: async () => ({ kind: "found", recipient: { email: `${runId}-retry@example.test` } }),
      transport: async (email) => {
        keys.push(email.idempotencyKey);
        call += 1;
        return call === 1
          ? { kind: "transient_failure", errorCode: "provider_unreachable" }
          : { kind: "accepted", providerMessageId: `${keyPrefix}:email:stable` };
      },
    });
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "account.deletion_received",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:email-stable-key`,
        payload: { requestId: 9 },
      }),
    );
    const only = async (message: OutboundLifecycleMessage): Promise<DeliveryResult> =>
      message.id === id ? deliver(message) : { kind: "not_configured" };
    await dispatchLifecycleOutbox({ deliver: only, now, limit: 100 });
    clock = new Date(clock.getTime() + 2 * 60_000);
    await dispatchLifecycleOutbox({ deliver: only, now, limit: 100 });
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(keys[0], `lifecycle-${id}-g${DEFAULT_MAX_ATTEMPTS}`);
    let [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "accepted");
    assert.equal(row!.attempts, 2);

    // Only an explicit support resend of a failed row rotates the key, because that action is meant to send again.
    const { id: failedId } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, {
        eventCode: "account.deletion_received",
        recipientClerkUserId: users.outbox,
        idempotencyKey: `${keyPrefix}:email-resend-key`,
        payload: { requestId: 10 },
        maxAttempts: 1,
      }),
    );
    const failedKeys: string[] = [];
    const failing = async (message: OutboundLifecycleMessage): Promise<DeliveryResult> => {
      if (message.id !== failedId) return { kind: "not_configured" };
      failedKeys.push(message.dedupeKey);
      return { kind: "permanent_failure", errorCode: "provider_http_422" };
    };
    await dispatchLifecycleOutbox({ deliver: failing, now, limit: 100 });
    [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, failedId));
    assert.equal(row!.status, "failed");
    assert.equal(await requeueFailedLifecycleMessage(failedId), "queued");
    await dispatchLifecycleOutbox({ deliver: failing, now, limit: 100 });
    assert.equal(failedKeys.length, 2);
    assert.notEqual(failedKeys[0], failedKeys[1]);
    assert.equal(failedKeys[0], `lifecycle-${failedId}-g1`);
    assert.equal(failedKeys[1], `lifecycle-${failedId}-g${1 + DEFAULT_MAX_ATTEMPTS}`);
  });

  it("maps recipient and provider outcomes onto the delivery contract", async () => {
    const message: OutboundLifecycleMessage = {
      id: 1, eventCode: "claim.approved", template: "claim.approved", locale: "nl",
      recipientUserId: 1, recipientClerkUserId: "user_x", recipientRegistrationId: null, payload: {}, attempt: 1, dedupeKey: "lifecycle-1-g5",
    };
    const withRecipient = (resolution: RecipientResolution, transportResult: DeliveryResult = { kind: "accepted" }) =>
      createEmailDeliveryLoader({
        senderAddress: "noreply@buurtplaza.nl",
        resolveRecipient: async () => resolution,
        transport: async () => transportResult,
      })(message);
    assert.deepEqual(await withRecipient({ kind: "not_found" }), { kind: "permanent_failure", errorCode: "recipient_gone" });
    assert.deepEqual(await withRecipient({ kind: "no_address" }), { kind: "permanent_failure", errorCode: "recipient_no_address" });
    assert.deepEqual(await withRecipient({ kind: "unavailable" }), { kind: "transient_failure", errorCode: "identity_provider_unavailable" });
    assert.deepEqual(
      await withRecipient({ kind: "found", recipient: { email: "a@example.test" } }, { kind: "transient_failure", errorCode: "provider_http_503" }),
      { kind: "transient_failure", errorCode: "provider_http_503" },
    );
    assert.deepEqual(
      await createEmailDeliveryLoader({ senderAddress: "x@y", resolveRecipient: async () => ({ kind: "found", recipient: { email: "a@b" } }), transport: async () => ({ kind: "accepted" }) })({ ...message, template: "unknown.template" }),
      { kind: "permanent_failure", errorCode: "template_unknown" },
    );

    // Resend transport: 2xx → accepted with id; 429/5xx → transient; other 4xx → permanent; network → transient.
    const calls: { url: string; init: RequestInit }[] = [];
    const respond = (status: number, body: unknown) => async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const email: OutboundEmail = { to: "a@example.test", from: "noreply@buurtplaza.nl", subject: "S", text: "T", idempotencyKey: "lifecycle-1-1" };
    assert.deepEqual(await createResendTransport({ apiKey: "re_test", fetch: respond(200, { id: "msg_1" }) })(email), { kind: "accepted", providerMessageId: "msg_1" });
    assert.equal(calls[0]!.url, "https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["idempotency-key"], "lifecycle-1-1");
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { from: email.from, to: [email.to], subject: "S", text: "T" });
    assert.deepEqual(await createResendTransport({ apiKey: "re_test", fetch: respond(429, {}) })(email), { kind: "transient_failure", errorCode: "provider_http_429" });
    assert.deepEqual(await createResendTransport({ apiKey: "re_test", fetch: respond(500, {}) })(email), { kind: "transient_failure", errorCode: "provider_http_500" });
    assert.deepEqual(await createResendTransport({ apiKey: "re_test", fetch: respond(422, {}) })(email), { kind: "permanent_failure", errorCode: "provider_http_422" });
    assert.deepEqual(
      await createResendTransport({ apiKey: "re_test", fetch: async () => { throw new Error("ECONNRESET"); } })(email),
      { kind: "transient_failure", errorCode: "provider_unreachable" },
    );
  });

  it("selects a real provider only by explicit configuration and refuses incomplete configuration", () => {
    assert.equal(resolveLifecycleDeliveryLoader({}).configured, false);
    assert.equal(resolveLifecycleDeliveryLoader({ RESEND_API_KEY: "re_test" }).configured, false);
    assert.throws(() => resolveLifecycleDeliveryLoader({ LIFECYCLE_DELIVERY_PROVIDER: "resend" }), /RESEND_API_KEY/);
    assert.throws(() => resolveLifecycleDeliveryLoader({ LIFECYCLE_DELIVERY_PROVIDER: "resend", RESEND_API_KEY: "re_test" }), /LIFECYCLE_SENDER_ADDRESS/);
    assert.throws(
      () => resolveLifecycleDeliveryLoader({ LIFECYCLE_DELIVERY_PROVIDER: "resend", RESEND_API_KEY: "re_test", LIFECYCLE_SENDER_ADDRESS: "noreply@buurtplaza.nl" }),
      /LIFECYCLE_RECEIPT_WEBHOOK_SECRET/,
    );
    const fake = async (): Promise<DeliveryResult> => ({ kind: "accepted" });
    const resolved = resolveLifecycleDeliveryLoader(
      { LIFECYCLE_DELIVERY_PROVIDER: "resend", RESEND_API_KEY: "re_test", LIFECYCLE_SENDER_ADDRESS: "noreply@buurtplaza.nl", LIFECYCLE_RECEIPT_WEBHOOK_SECRET: RECEIPT_SECRET, NODE_ENV: "production" },
      { email: (config) => { assert.equal(config.senderAddress, "noreply@buurtplaza.nl"); return fake; } },
    );
    assert.equal(resolved.name, "resend");
    assert.equal(resolved.loader, fake);
  });

  it("marks messages delivered from a signed receipt exactly once and rejects unsigned or stale callbacks", async () => {
    const { id } = await db.transaction((tx) =>
      enqueueLifecycleMessage(tx, { eventCode: "revision.approved", recipientClerkUserId: users.outbox, idempotencyKey: `${keyPrefix}:webhook` }),
    );
    const providerMessageId = `${keyPrefix}:provider:webhook`;
    await dispatchLifecycleOutbox({
      deliver: async (message) => (message.id === id ? { kind: "accepted", providerMessageId } : { kind: "not_configured" }),
      limit: 100,
    });
    const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-14T12:00:00.000Z", data: { email_id: providerMessageId } });
    const post = async (payload: string, headers: Record<string, string | undefined>) => {
      const cleaned = Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== undefined)) as Record<string, string>;
      const result = await fetch(`${baseUrl}/api/lifecycle/delivery-receipts/resend`, { method: "POST", headers: { "content-type": "application/json", ...cleaned }, body: payload });
      return { status: result.status, body: await result.json() };
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sign = (payload: string, id = `msg_${runId}`, ts = nowSeconds) => {
      const h = signWebhookPayload(RECEIPT_SECRET, id, ts, payload);
      return { "svix-id": h.id, "svix-timestamp": h.timestamp, "svix-signature": h.signature };
    };

    assert.equal((await post(body, {})).status, 401);
    assert.equal((await post(body, sign(body, "other", nowSeconds - 3600))).status, 401);
    const tampered = sign(body);
    assert.equal((await post(body.replace(providerMessageId, "msg_other"), tampered)).status, 401);
    assert.equal((await post(body, { ...sign(body), "svix-signature": "v1,AAAA" })).status, 401);

    const first = await post(body, sign(body));
    assert.deepEqual(first, { status: 200, body: { outcome: "delivered" } });
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, id));
    assert.equal(row!.status, "delivered");
    assert.equal(row!.deliveredAt?.toISOString(), "2026-09-14T12:00:00.000Z");

    const replay = await post(body, sign(body));
    assert.deepEqual(replay, { status: 200, body: { outcome: "already_delivered" } });
    const unknown = JSON.stringify({ type: "email.delivered", data: { email_id: `${keyPrefix}:provider:none` } });
    assert.deepEqual(await post(unknown, sign(unknown)), { status: 200, body: { outcome: "unknown" } });
    const bounced = JSON.stringify({ type: "email.bounced", data: { email_id: providerMessageId } });
    assert.deepEqual(await post(bounced, sign(bounced)), { status: 200, body: { outcome: "ignored", eventType: "email.bounced" } });
    assert.equal((await post("not json", sign("not json"))).status, 400);
    assert.equal(parseResendReceipt("{}").kind, "ignored");
    assert.equal(verifyWebhookSignature("whsec_" + Buffer.from("x").toString("base64"), { id: "a", timestamp: "b", signature: "v1,x" }, "").ok, false);

    // Without a configured secret the endpoint does not exist.
    const dark = express();
    dark.use("/api", createLifecycleReceiptsRouter({ env: {} }));
    const darkServer = dark.listen(0);
    try {
      const port = (darkServer.address() as AddressInfo).port;
      const result = await fetch(`http://127.0.0.1:${port}/api/lifecycle/delivery-receipts/resend`, { method: "POST", headers: sign(body), body });
      assert.equal(result.status, 404);
    } finally {
      darkServer.close();
    }
  });
});
