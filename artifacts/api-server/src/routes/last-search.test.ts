import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { accountLastSearchTable, appUsersTable, consumerPreferencesTable, db, pool } from "@workspace/db";
import { createAccountRouter } from "./account";
import { getAccountOptions } from "../lib/accountOptions";

const ids = [`last-search-${process.pid}-a`, `last-search-${process.pid}-b`];
const app = express();
app.use(express.json());
app.use(createAccountRouter({
  flags: () => ({ accounts: true, lastSearch: true, businessIntake: false, businessPublication: false, consumerRegistration: false, businessOnboarding: false }),
  resolveIdentity: (req) => {
    const userId = req.header("x-test-user");
    return userId ? { userId, emailVerified: true, isEditor: false } : null;
  },
}));
let server: ReturnType<typeof app.listen>;
let base: string;
const input = {
  cityId: "dhg", neighborhoodIds: [getAccountOptions().neighborhoods[0].id, "dhg:removed"],
  categoryIds: [getAccountOptions().interests[0].id, "category:removed"],
  locale: "nl", sourceScope: "local", presentationMode: "map",
  centerLat: 52.07053, centerLng: 4.30075, zoom: 13,
  query: "2511AB",
};
async function request(method: string, path = "/account/last-search", body?: unknown, user = ids[0]) {
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: (response.status === 204 ? null : await response.json()) as any };
}
before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await db.delete(appUsersTable).where(inArray(appUsersTable.clerkUserId, ids));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

it("requires an app user for all three methods", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) {
    assert.equal((await request(method, undefined, method === "PUT" ? input : undefined, "")).status, 401);
  }
});
it("rejects unknown fields, nested keys, coordinates outside bounds and invalid cities", async () => {
  for (const change of [{ token: "secret" }, { filters: { internal: true } }, { centerLat: 91 }, { cityId: "unknown" }]) {
    assert.equal((await request("PUT", undefined, { ...input, ...change })).status, 400);
  }
});
it("upserts one row, rounds the centre, drops unknown taxonomy IDs, and omits query from summary", async () => {
  const result = await request("PUT", undefined, input);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.neighborhoodIds, [input.neighborhoodIds[0]]);
  assert.deepEqual(result.data.categoryIds, [input.categoryIds[0]]);
  assert.equal(Number(result.data.centerLat).toFixed(3), "52.071");
  assert.equal(result.data.summary.includes("2511AB"), false);
  assert.equal((await request("PUT", undefined, { ...input, query: "2522AA" })).status, 200);
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, ids[0]));
  assert.equal((await db.select().from(accountLastSearchTable).where(eq(accountLastSearchTable.userId, user.id))).length, 1);
});
it("isolates accounts and expires old rows", async () => {
  assert.equal((await request("GET", undefined, undefined, ids[1])).data, null);
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, ids[0]));
  await db.update(accountLastSearchTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(accountLastSearchTable.userId, user.id));
  assert.equal((await request("GET")).data, null);
  assert.equal((await db.select().from(accountLastSearchTable).where(eq(accountLastSearchTable.userId, user.id))).length, 0);
});
it("retention off refuses writes with 204 and clear is authoritative", async () => {
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, ids[0]));
  await db.insert(consumerPreferencesTable).values({ userId: user.id, retainLastSearch: false }).onConflictDoUpdate({ target: consumerPreferencesTable.userId, set: { retainLastSearch: false } });
  assert.equal((await request("PUT", undefined, input)).status, 204);
  assert.equal((await request("GET")).data, null);
  assert.equal((await request("DELETE")).status, 204);
});
it("preferences PATCH exposes the opt-out and deletes previously retained data", async () => {
  const saved = await request("PUT", undefined, input, ids[1]);
  assert.equal(saved.status, 200);
  const patched = await request("PATCH", "/account/preferences", { expectedRevision: 0, retainLastSearch: false }, ids[1]);
  assert.equal(patched.status, 200);
  assert.equal(patched.data.preferences.retainLastSearch, false);
  assert.equal((await request("GET", undefined, undefined, ids[1])).data, null);
  assert.equal((await request("PUT", undefined, input, ids[1])).status, 204);
});