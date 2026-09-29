import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { clerkClient } from "@clerk/express";
import { eq, inArray } from "drizzle-orm";
import {
  accountRequestProcessorOutcomesTable, accountRequestsTable, appUsersTable,
  db, lifecycleOutboxTable, pool,
} from "@workspace/db";
import { provisionAppUser } from "../middlewares/requireAppUser";
import { DELETION_POLICY, executeAccountDeletions } from "./accountDeletion";
import { dispatchLifecycleOutbox, recordDeliveryReceipt } from "./lifecycleOutbox";

const LIVE = process.env.CLERK_LIVE === "1";

it("live Clerk deletion, reconciliation and same-address reprovisioning (OFF-011/012/018)", { skip: !LIVE, timeout: 120_000 }, async () => {
  // Never run identity deletion against a production provider or a shared app DB.
  if (!process.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"))
    throw new Error("Live deletion requires a development Clerk instance.");
  if (!process.env.CLERK_SECRET_KEY)
    throw new Error("Live deletion requires CLERK_SECRET_KEY.");
  if (!/^account_deletion_live_[a-z0-9_]+$/.test(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1)))
    throw new Error("Live deletion requires a disposable account_deletion_live_* database.");

  const email = `buurtplaza.e2e.${randomUUID()}+clerk_test@example.com`;
  const password = `Bp!${randomUUID()}-Zeehelden`;
  let originalId: string | undefined;
  let replacementId: string | undefined;
  let originalAppId: number | undefined;
  let replacementAppId: number | undefined;
  try {
    const original = await clerkClient.users.createUser({
      emailAddress: [email], emailAddressIdentificationStatus: ["verified"],
      password, skipLegalChecks: true,
    });
    originalId = original.id;
    const primary = await clerkClient.users.getUser(original.id);
    assert.ok(primary.emailAddresses.some(address =>
      address.id === primary.primaryEmailAddressId && address.verification?.status === "verified"),
      "Clerk must return a verified primary e-mail");

    const appUser = await provisionAppUser(original.id);
    originalAppId = appUser.id;
    const [request] = await db.insert(accountRequestsTable).values({
      userId: appUser.id, scope: "account", type: "deletion", status: "received",
      acknowledgedScopes: ["account_profile", "preferences", "consents", "saved_events", "business_memberships"],
      scheduledFor: new Date(Date.now() - 60_000),
      cancelUntil: new Date(Date.now() - 60_000),
    }).returning();
    const store = {
      save: async () => {}, load: async () => Buffer.alloc(0), remove: async () => {},
    };
    await executeAccountDeletions(new Date(), clerkClient, store);
    const [notice] = await db.select().from(lifecycleOutboxTable)
      .where(eq(lifecycleOutboxTable.idempotencyKey, `account-deletion:${request.id}:completed`));
    assert.ok(notice, "verified Clerk e-mail must produce a completion notice");
    // Injected mail provider accepts the outbox message; its delivery receipt
    // is the proof needed to finish, rather than a mere accepted send.
    const providerMessageId = `live-deletion-${randomUUID()}`;
    const dispatched = await dispatchLifecycleOutbox({
      deliver: async message => {
        assert.equal(message.eventCode, "account.deletion_completed");
        return { kind: "accepted", providerMessageId };
      },
    });
    assert.equal(dispatched.accepted, 1);
    assert.equal(await recordDeliveryReceipt(providerMessageId), "delivered");
    await executeAccountDeletions(new Date(Date.now() + 1000), clerkClient, store);

    await assert.rejects(() => clerkClient.users.getUser(original.id), (error: unknown) =>
      typeof error === "object" && error !== null &&
      ((error as { status?: number }).status === 404 || (error as { statusCode?: number }).statusCode === 404),
    );
    const sessions = await clerkClient.sessions.getSessionList({ userId: original.id, limit: 100, status: "active" });
    assert.equal(sessions.data.length, 0, "no active sessions after identity deletion");
    const [closed] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, appUser.id));
    assert.equal(closed.status, "deleted");
    assert.equal(closed.email, null);
    assert.ok(closed.closedAt);
    const outcomes = await db.select().from(accountRequestProcessorOutcomesTable)
      .where(eq(accountRequestProcessorOutcomesTable.requestId, request.id));
    assert.deepEqual(new Set(outcomes.map(row => row.processor)), new Set(["clerk", "app_db", "object_storage", "mail_provider"]));
    assert.ok(outcomes.every(row => row.status === "done"));
    const [completed] = await db.select().from(accountRequestsTable).where(eq(accountRequestsTable.id, request.id));
    assert.equal(completed.status, "completed");
    assert.deepEqual(completed.resultReport, DELETION_POLICY.categories);
    assert.equal(completed.deletionEmailSnapshot, null);

    const replacement = await clerkClient.users.createUser({
      emailAddress: [email], emailAddressIdentificationStatus: ["verified"],
      password: `Bp!${randomUUID()}-Zeehelden`, skipLegalChecks: true,
    });
    replacementId = replacement.id;
    assert.notEqual(replacement.id, original.id);
    const newAppUser = await provisionAppUser(replacement.id);
    replacementAppId = newAppUser.id;
    assert.notEqual(newAppUser.id, appUser.id);
    assert.equal(newAppUser.status, "active");
    assert.equal(newAppUser.closedAt, null);
    const [tombstone] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, appUser.id));
    assert.equal(tombstone.clerkUserId, original.id);
    assert.ok(tombstone.closedAt);
  } finally {
    // Cleanup is required even if a provider assertion or a processor fails.
    try {
      try {
        if (replacementId) await clerkClient.users.deleteUser(replacementId);
      } finally {
        if (originalId) {
          try { await clerkClient.users.deleteUser(originalId); }
          catch (error) {
            const status = (error as { status?: number; statusCode?: number }).status ??
              (error as { statusCode?: number }).statusCode;
            if (status !== 404) throw error;
          }
        }
      }
    } finally {
      const ids = [originalAppId, replacementAppId].filter((id): id is number => id !== undefined);
      if (ids.length) {
        await db.delete(lifecycleOutboxTable).where(inArray(lifecycleOutboxTable.recipientUserId, ids));
        await db.delete(accountRequestsTable).where(inArray(accountRequestsTable.userId, ids));
        await db.delete(appUsersTable).where(inArray(appUsersTable.id, ids));
      }
      await pool.end();
    }
  }
});