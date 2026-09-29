import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq } from "drizzle-orm";
import { accountConsentEventsTable, appUsersTable, db, lifecycleDeliveryAttemptsTable, lifecycleOutboxTable, pool } from "@workspace/db";
import { createAccountRouter } from "./account";
import { dispatchLifecycleOutbox } from "../lib/lifecycleOutbox";
import { hasActiveConsent } from "../lib/consentPurposes";
import { purgeAccountRetention } from "../lib/accountRetention";

const subject = `consent-phase3-${process.pid}-${Date.now()}`;
let enabled = true;
const app = express();
app.use(express.json());
app.use("/api", createAccountRouter({
  resolveIdentity: () => ({ userId: subject, emailVerified: true, isEditor: false }),
  flags: () => ({ accounts: true, consentCenter: enabled, lastSearch: true, accountExport: false, accountDeletion: false,
    businessIntake: false, businessPublication: false, consumerRegistration: false, businessOnboarding: false }),
}));
let server: ReturnType<typeof app.listen>;
let base: string;
async function request(method: string, body?: unknown) {
  const response = await fetch(`${base}/api/account/consents`, {
    method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() as any };
}

describe("consent centre ledger and optional delivery", () => {
  before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    await db.delete(appUsersTable).where(eq(appUsersTable.clerkUserId, subject));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });
  it("catalogue defaults off, independent choices, immutable history with locale and basis", async () => {
    const initial = await request("GET");
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.data.purposes.map((p: any) => p.id), ["product_updates", "research_contact", "marketing_updates"]);
    assert.ok(initial.data.purposes.every((p: any) => p.defaultGranted === false && p.lawfulBasis === "consent" && p.labels.nl && p.labels.en));
    const version = initial.data.currentNoticeVersion;
    const choose = (consentType: string, granted: boolean, locale: string) =>
      request("POST", { consentType, noticeVersion: version, granted, source: "account_settings", locale });
    assert.equal((await choose("unknown", true, "nl")).status, 400);
    assert.equal((await choose("product_updates", true, "fr")).status, 400);
    await choose("product_updates", true, "nl");
    await choose("research_contact", true, "en");
    const withdrawal = await choose("product_updates", false, "en");
    assert.deepEqual(withdrawal.data.current.map((s: any) => [s.consentType, s.granted]),
      [["product_updates", false], ["research_contact", true]]);
    assert.deepEqual(withdrawal.data.history.map((h: any) => h.locale), ["nl", "en", "en"]);
    assert.ok(withdrawal.data.history.every((h: any) => h.purposeLawfulBasis === "consent" && h.noticeVersion === version && !Number.isNaN(Date.parse(h.createdAt))));
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, subject));
    assert.equal(await hasActiveConsent(db, user.id, "product_updates"), false);
    assert.equal(await hasActiveConsent(db, user.id, "research_contact"), true);
    const ledger = await db.select().from(accountConsentEventsTable).where(eq(accountConsentEventsTable.userId, user.id));
    assert.equal(ledger.length, 3);
  });
  it("flag off makes both routes unavailable", async () => {
    enabled = false;
    try {
      assert.equal((await request("GET")).status, 503);
      assert.equal((await request("POST", { consentType: "research_contact" })).status, 503);
    } finally { enabled = true; }
  });
  it("skips a withdrawn optional message at send time and retains transactional mail", async () => {
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, subject));
    const [optional] = await db.insert(lifecycleOutboxTable).values({
      eventCode: "research.survey_invitation", template: "research.survey_invitation",
      recipientUserId: user.id, locale: "en", payload: {}, status: "queued",
    }).returning();
    // The earlier research grant is withdrawn after queueing and before dispatch.
    await request("POST", { consentType: "research_contact", noticeVersion: "draft-2026-09", granted: false, source: "account_settings", locale: "en" });
    let delivered = 0;
    await dispatchLifecycleOutbox({ deliver: async () => { delivered++; return { kind: "accepted" }; } });
    const [row] = await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, optional.id));
    const attempts = await db.select().from(lifecycleDeliveryAttemptsTable).where(eq(lifecycleDeliveryAttemptsTable.outboxId, optional.id));
    assert.equal(delivered, 0);
    assert.equal(row.status, "cancelled");
    assert.equal(attempts[0]?.outcome, "skipped_consent_withdrawn");
    const [transactional] = await db.insert(lifecycleOutboxTable).values({
      eventCode: "account.email_changed", template: "account.email_changed",
      recipientUserId: user.id, locale: "en", payload: {},
    }).returning();
    await dispatchLifecycleOutbox({ deliver: async () => { delivered++; return { kind: "accepted" }; } });
    assert.equal(delivered, 1);
    assert.equal((await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, transactional.id)))[0]?.status, "accepted");
  });
  it("purges only final outbox personal data after 30 days and invokes export hook with the clock", async () => {
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, subject));
    const old = new Date("2025-01-01T00:00:00Z");
    const [final] = await db.insert(lifecycleOutboxTable).values({
      eventCode: "account.email_changed", template: "account.email_changed", recipientUserId: user.id,
      recipientEmail: "test@example.invalid", locale: "nl", payload: { businessName: "Private" }, status: "delivered", createdAt: old,
    }).returning();
    const [pending] = await db.insert(lifecycleOutboxTable).values({
      eventCode: "account.email_changed", template: "account.email_changed", recipientUserId: user.id,
      recipientEmail: "pending@example.invalid", locale: "nl", payload: { businessName: "Pending" }, status: "queued", createdAt: old,
    }).returning();
    const clock = new Date("2025-02-01T00:00:00Z");
    let invoked: Date | null = null;
    await purgeAccountRetention(clock, async (date) => { invoked = date; });
    assert.equal(invoked, clock);
    assert.equal((await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, final.id)))[0]?.recipientEmail, null);
    assert.equal((await db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.id, pending.id)))[0]?.recipientEmail, "pending@example.invalid");
  });
});