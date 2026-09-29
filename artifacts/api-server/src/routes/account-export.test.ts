import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import { unzipSync } from "fflate";
import { eq, inArray } from "drizzle-orm";
import {
  db, pool, appUsersTable, accountExportsTable, accountRequestsTable,
  accountRequestEventsTable, lifecycleOutboxTable, accountLastSearchTable,
} from "@workspace/db";
import { createAccountExportRouter } from "./account-export";
import { createAccountLifecycleRouter } from "./account-lifecycle";
import { buildAccountBundle, expireAccountExports, prepareAccountExports, type ExportArtifactStore } from "../lib/accountExport";
import type { Identity } from "../lib/permissions";

const run = `${process.pid}-${Date.now()}`;
const clerkIds = [`export-${run}-a`, `export-${run}-b`, `export-${run}-reviewer`];
const bytes = new Map<string, Buffer>();
const store: ExportArtifactStore = {
  save: async (key, value) => { bytes.set(key, value); },
  remove: async key => { bytes.delete(key); },
  load: async key => { const value = bytes.get(key); if (!value) throw Error("Missing artifact"); return value; },
};
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ??= "export-test";
process.env.PRIVATE_OBJECT_DIR ??= `/${process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID}/private`;
const app = express();
app.use(express.json());
const resolveIdentity = (req: express.Request): Identity | null => {
  const userId = req.header("x-user");
  return userId ? { userId, emailVerified: true, isEditor: userId === clerkIds[2] } : null;
};
let enabled = true;
let at = new Date("2026-09-29T07:00:00Z");
app.use("/api", createAccountExportRouter({
  resolveIdentity, flags: () => ({ accounts: true, accountExport: enabled, businessIntake: false, businessPublication: false, consumerRegistration: false, businessOnboarding: false }),
  recentAuth: { claims: req => ({ fva: [req.header("x-stale") ? 20 : 0] }) },
  now: () => at, store,
}));
app.use("/api", createAccountLifecycleRouter({ resolveIdentity, flags: () => ({
  accounts: true, accountExport: enabled, businessIntake: false, businessPublication: false, consumerRegistration: false, businessOnboarding: false,
}) }));
let server: ReturnType<typeof app.listen>;
let base: string;
let userId: number;
async function call(path: string, user = clerkIds[0], method = "GET", headers: Record<string, string> = {}) {
  const res = await fetch(base + path, { method, headers: { "x-user": user, ...headers } });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() as any : await res.text() };
}
before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test port");
  base = `http://127.0.0.1:${address.port}/api`;
  const [user] = await db.insert(appUsersTable).values(clerkIds.map(clerkUserId => ({ clerkUserId, email: `${clerkUserId}@example.test` }))).returning();
  userId = user.id;
});
after(async () => {
  const users = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(inArray(appUsersTable.clerkUserId, clerkIds));
  const ids = users.map(row => row.id);
  const requests = await db.select({ id: accountRequestsTable.id }).from(accountRequestsTable).where(inArray(accountRequestsTable.userId, ids));
  if (requests.length) {
    await db.delete(lifecycleOutboxTable).where(inArray(lifecycleOutboxTable.recipientUserId, ids));
    await db.delete(accountRequestsTable).where(inArray(accountRequestsTable.id, requests.map(row => row.id)));
  }
  await db.delete(appUsersTable).where(inArray(appUsersTable.id, ids));
  server?.close();
  await pool.end();
});

describe("account export", () => {
  it("requires recent authentication and the effective flag", async () => {
    assert.equal((await call("/account/export-requests", clerkIds[0], "POST", { "x-stale": "1" })).status, 401);
    enabled = false;
    assert.equal((await call("/account/export-requests", clerkIds[0], "POST")).status, 503);
    enabled = true;
  });
  it("returns a stable reference, isolates the owner, and builds a private inventory bundle", async () => {
    const first = await call("/account/export-requests", clerkIds[0], "POST");
    assert.equal(first.status, 202);
    assert.deepEqual((await call("/account/export-requests", clerkIds[0], "POST")).body, first.body);
    assert.equal((await call(`/account/export-requests/${first.body.reference}`, clerkIds[1])).status, 404);
    await db.insert(accountLastSearchTable).values({
      userId, cityId: "dhg", query: "2511AB", expiresAt: new Date("2027-01-01"),
    });
    const [other] = await db.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.clerkUserId, clerkIds[1]));
    await db.insert(accountLastSearchTable).values({
      userId: other.id, cityId: "dhg", query: "OTHER_USER_PRIVATE_QUERY", expiresAt: new Date("2027-01-01"),
    });
    await db.insert(lifecycleOutboxTable).values({
      eventCode: "account.product_update", template: "account.product_update",
      recipientUserId: userId, payload: { body: "RENDERED_PRIVATE_BODY", subject: "Secret", token: "CLERK_PROVIDER_PAYLOAD" },
      idempotencyKey: `export-test:${run}`,
    });
    const serialized = JSON.stringify(await buildAccountBundle(userId, clerkIds[0], at));
    assert.match(serialized, /2511AB/);
    assert.doesNotMatch(serialized, new RegExp(clerkIds[1]));
    assert.doesNotMatch(serialized, /OTHER_USER_PRIVATE_QUERY|RENDERED_PRIVATE_BODY|CLERK_PROVIDER_PAYLOAD/);
    assert.doesNotMatch(serialized, /"token"|"payload"|"body"|"password"/i);
    await prepareAccountExports(at, store);
    const status = await call(`/account/export-requests/${first.body.reference}`);
    assert.equal(status.body.status, "available");
    assert.equal(status.body.downloads[0].file, "account-export.zip");
    const saved = bytes.get([...bytes.keys()].find(key => key.endsWith("/bundle.json"))!);
    assert.equal(JSON.parse(saved!.toString()).lastSearch[0].query, "2511AB");
    const archive = bytes.get([...bytes.keys()].find(key => key.endsWith("/account-export.zip"))!);
    assert.deepEqual(Buffer.from(unzipSync(archive!)["bundle.json"]), saved);
    assert.equal((await call(`/account/export-requests/${first.body.reference}/download?file=bundle.json`, clerkIds[1])).status, 404);
    assert.equal((await call(`/account/export-requests/${first.body.reference}/download?file=bundle.json`)).status, 200);
    assert.equal((await call(`/account/export-requests/${first.body.reference}`)).body.status, "downloaded");
    const events = await db.select().from(accountRequestEventsTable).where(eq(accountRequestEventsTable.requestId, first.body.reference));
    assert.deepEqual(events.map(e => e.toStatus), ["requested", "preparing", "available", "downloaded"]);
    at = new Date(at.getTime() + 72 * 60 * 60 * 1000 + 1);
    assert.equal((await call(`/account/export-requests/${first.body.reference}/download?file=bundle.json`)).status, 410);
    assert.equal(bytes.size, 0);
    assert.equal((await call(`/account/export-requests/${first.body.reference}`)).body.status, "expired");
    assert.equal((await call("/account/export-requests", clerkIds[0], "POST")).status, 202);
  });
  it("failed preparation is visible in the reviewer export queue", async () => {
    const pending = await call("/account/export-requests", clerkIds[1], "POST");
    const failing: ExportArtifactStore = { ...store, save: async () => { throw Error("Storage unavailable"); } };
    await prepareAccountExports(at, failing);
    assert.equal((await call(`/account/export-requests/${pending.body.reference}`, clerkIds[1])).body.status, "failed");
    const review = await call("/review/account-requests?type=export", clerkIds[2]);
    assert.equal(review.status, 200);
    assert.equal(review.body.exportRequests.find((row: { reference: number }) => row.reference === pending.body.reference).status, "failed");
    assert.doesNotMatch(JSON.stringify(review.body), /@example\.test/);
  });
  it("fails closed for a closed owner and recovers an expired preparing lease", async () => {
    const [closedRequest] = await db.insert(accountRequestsTable).values({
      userId, scope: "account", type: "export",
    }).returning();
    await db.insert(accountExportsTable).values({ requestId: closedRequest.id });
    await db.update(appUsersTable).set({ closedAt: at }).where(eq(appUsersTable.id, userId));
    const before = bytes.size;
    await prepareAccountExports(at, store);
    const [closed] = await db.select().from(accountExportsTable).where(eq(accountExportsTable.requestId, closedRequest.id));
    assert.equal(closed.status, "failed");
    assert.equal(closed.failureCode, "account_closed");
    assert.equal(bytes.size, before);
    await db.update(appUsersTable).set({ closedAt: null }).where(eq(appUsersTable.id, userId));

    const [crashedRequest] = await db.insert(accountRequestsTable).values({
      userId, scope: "account", type: "export",
    }).returning();
    await db.insert(accountExportsTable).values({
      requestId: crashedRequest.id, status: "preparing", processingClaimToken: "orphan",
      processingClaimedAt: new Date(at.getTime() - 11 * 60_000),
    });
    await prepareAccountExports(at, store);
    const [recovered] = await db.select().from(accountExportsTable).where(eq(accountExportsTable.requestId, crashedRequest.id));
    assert.equal(recovered.status, "available");
    assert.equal(recovered.processingClaimToken, null);
  });
});