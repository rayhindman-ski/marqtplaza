import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { businessMembersTable, businessProfilesTable, db, pool } from "@workspace/db";
import { createBusinessesRouter } from "./businesses";

const suffix = `${process.pid}-${Date.now()}`;
const owner = `message-owner-${suffix}`;
const outsider = `message-outsider-${suffix}`;
const editor = `message-editor-${suffix}`;
const slug = `message-profile-${suffix}`;
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
let id: number;
let server: ReturnType<typeof app.listen>;
let url: string;

const app = express();
app.use(express.json());
app.use("/api", createBusinessesRouter({
  getUserId: (req) => req.header("x-test-user") ?? null,
  requireEditor: (req, res, next) => req.header("x-test-editor") === "1" ? next() : void res.status(403).json({ error: "editor required" }),
  flags: () => ({ accounts: true, businessIntake: true, businessPublication: false, businessOnboarding: false, consumerRegistration: false }),
}));
async function request(path: string, method = "GET", data?: unknown, user = owner, editorRole = false) {
  const response = await fetch(`${url}/api${path}`, {
    method, headers: { "content-type": "application/json", "x-test-user": user, ...(editorRole ? { "x-test-editor": "1" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
const input = (startsOn = yesterday, endsOn = future) => ({
  kind: "announcement", title: "New opening hours", body: "We are open every Saturday.", startsOn, endsOn,
});

describe("business messages", () => {
  before(async () => {
    const [profile] = await db.insert(businessProfilesTable).values({
      slug, cityId: "dhg", listingSource: "openstreetmap", listingId: slug,
      name: "Message Test", isClaimed: true, publicationStatus: "published",
    }).returning();
    id = profile.id;
    await db.insert(businessMembersTable).values({ businessProfileId: id, userId: owner, role: "owner" });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, id));
    await pool.end();
  });

  it("keeps submitted messages private, enforces ownership and editor role, and publishes only current approved windows", async () => {
    assert.equal((await request(`/business-profiles/${id}/messages`, "POST", input(), outsider)).status, 404);
    const created = await request(`/business-profiles/${id}/messages`, "POST", input());
    assert.equal(created.status, 201);
    assert.equal(created.body.status, "pending");
    assert.equal((await request(`/business-profiles/${id}/messages`)).body.length, 1);
    assert.equal((await request(`/messages/moderation/${created.body.id}`, "PATCH", { decision: "approve" }, editor)).status, 403);
    assert.equal((await request(`/messages/moderation/${created.body.id}`, "PATCH", { decision: "approve" }, editor, true)).status, 200);
    // Without the publication snapshot a published profile is unavailable when
    // the publication flag is enabled. This router uses the legacy projection by default.
    let publicProfile = await request(`/business-profiles/public/${slug}`);
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.body.messages.length, 1);
    assert.equal(publicProfile.body.messages[0].title, input().title);
    const withdrawn = await request(`/business-profiles/${id}/messages/${created.body.id}`, "PATCH", { status: "withdrawn" });
    assert.equal(withdrawn.status, 200);
    assert.equal((await request(`/business-profiles/public/${slug}`)).body.messages.length, 0);
    const outsideWindow = await request(`/business-profiles/${id}/messages`, "POST", input(future, future));
    assert.equal(outsideWindow.status, 201);
    assert.equal((await request(`/messages/moderation/${outsideWindow.body.id}`, "PATCH", { decision: "approve" }, editor, true)).status, 200);
    publicProfile = await request(`/business-profiles/public/${slug}`);
    assert.equal(publicProfile.body.messages.length, 0);
  });

  it("limits businesses to five pending or approved messages", async () => {
    for (let i = 0; i < 4; i++) assert.equal((await request(`/business-profiles/${id}/messages`, "POST", { ...input(), title: `Message ${i}` })).status, 201);
    assert.equal((await request(`/business-profiles/${id}/messages`, "POST", input())).status, 409);
  });
});