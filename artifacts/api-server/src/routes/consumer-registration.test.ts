import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { eq, like } from "drizzle-orm";

import {
  consumerRegistrationTokensTable,
  consumerRegistrationsTable,
  db,
  lifecycleOutboxTable,
  pool,
} from "@workspace/db";

import { createConsumerRegistrationRouter } from "./consumer-registration";
import {
  AccountLookupUnavailableError,
  createConsumerRegistrationService,
  digestRegistrationToken,
  normalizeEmail,
  normalizePhone,
  sanitizeReturnRef,
  SlidingWindowLimiter,
} from "../lib/consumerRegistration";
import { dispatchLifecycleOutbox, restrictPayload, UnsafePayloadError } from "../lib/lifecycleOutbox";
import {
  buildRegistrationLink,
  createEmailDeliveryLoader,
  createRegistrationRecipientResolver,
  type OutboundEmail,
} from "../lib/lifecycleEmailProvider";
import { renderLifecycleEmail } from "../lib/lifecycleTemplates";

/**
 * Consumer registration foundation (v0.5.1) — API cases from release_v051 §12.1–§12.5.
 * Runs against an isolated database (see lib/db/scripts/run-consumer-registration-integration.mjs).
 */

const runId = `${process.pid}-${Date.now()}`;
const domain = `v051-${runId}.example`;
const mail = (local: string) => `${local}@${domain}`;

let clock = new Date("2026-09-23T10:00:00.000Z");
const now = () => clock;
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

let flags = { accounts: false, businessIntake: false, businessPublication: false, consumerRegistration: true };
const existingAccounts = new Set<string>([mail("existing")]);
let lookupUnavailable = false;

const policy = {
  tokenTtlMs: 30 * 60_000,
  registrationTtlMs: 2 * 60 * 60_000,
  maxResends: 2,
  resendCooldownMs: 60_000,
  perEmailPerHour: 10,
  perNetworkPerHour: 40,
  verifyPerNetworkPerTenMinutes: 100,
};

const service = createConsumerRegistrationService({
  now,
  policy,
  accountExists: async (email) => {
    if (lookupUnavailable) throw new AccountLookupUnavailableError();
    return existingAccounts.has(email);
  },
});

const app = express();
app.use(express.json());
app.use(
  "/api",
  createConsumerRegistrationRouter({
    flags: () => flags,
    service,
    now,
    limiter: new SlidingWindowLimiter(),
    clientKey: (req) => req.header("x-test-client") ?? "client-default",
  }),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";

async function request(path: string, init: RequestInit & { client?: string } = {}) {
  const { client, headers, ...rest } = init;
  const result = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", "x-test-client": client ?? `client-${runId}`, ...(headers as Record<string, string> | undefined) },
  });
  return { status: result.status, body: await result.json(), headers: result.headers };
}
const json = (value: unknown) => JSON.stringify(value);
const validBody = (email: string, extra: Record<string, unknown> = {}) => ({
  name: "  Test   Persoon ",
  email,
  phone: "06-1234 5678",
  locale: "nl",
  ...extra,
});

// Fake transport: captures rendered mail so tests can read the link the way a consumer would.
const sentMail: OutboundEmail[] = [];
const loader = createEmailDeliveryLoader({
  senderAddress: "noreply@buurtplaza.nl",
  transport: async (message) => {
    sentMail.push(message);
    return { kind: "accepted", providerMessageId: `msg-${sentMail.length}` };
  },
  resolveRecipient: async () => ({ kind: "not_found" }),
  resolveRegistrationRecipient: createRegistrationRecipientResolver({
    baseUrl: "https://buurtplaza.test",
    tokenTtlMs: policy.tokenTtlMs,
    now,
  }),
});
const dispatch = () => dispatchLifecycleOutbox({ deliver: loader, now });
const tokenFromMail = (email: OutboundEmail): string => {
  const match = email.text.match(/token=([A-Za-z0-9_-]+)/);
  assert.ok(match, "registration email must carry a link with a token");
  return match![1]!;
};
const registrationFor = async (email: string) =>
  (await db.select().from(consumerRegistrationsTable).where(eq(consumerRegistrationsTable.normalizedEmail, email)))[0];
const outboxFor = async (registrationId: number) =>
  db.select().from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientRegistrationId, registrationId));

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  await db.delete(consumerRegistrationsTable).where(like(consumerRegistrationsTable.normalizedEmail, `%@${domain}`));
  await db.delete(lifecycleOutboxTable).where(like(lifecycleOutboxTable.idempotencyKey, "consumer-registration:%"));
  server.close();
  await pool.end();
});

describe("normalization helpers (REG-006, REG-007)", () => {
  it("normalizes email conservatively and never merges distinct mailboxes", () => {
    assert.equal(normalizeEmail("  Jan.De+tag@Example.NL "), "jan.de+tag@example.nl");
    assert.notEqual(normalizeEmail("jan.de@example.nl"), normalizeEmail("jande@example.nl"));
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail("a@b"), null);
    assert.equal(normalizeEmail("a b@example.nl"), null);
  });
  it("normalizes Dutch phone numbers to E.164 and rejects junk", () => {
    assert.equal(normalizePhone("06-1234 5678"), "+31612345678");
    assert.equal(normalizePhone("+31 (0)6 12345678".replace("(0)", "")), "+31612345678");
    assert.equal(normalizePhone("0031612345678"), "+31612345678");
    assert.equal(normalizePhone("+49 30 123456"), "+4930123456");
    assert.equal(normalizePhone("abc"), null);
    assert.equal(normalizePhone("12"), null);
  });
  it("accepts only site-relative return references", () => {
    assert.equal(sanitizeReturnRef("/activiteiten?buurt=zeeheldenkwartier"), "/activiteiten?buurt=zeeheldenkwartier");
    assert.equal(sanitizeReturnRef("https://evil.example/"), null);
    assert.equal(sanitizeReturnRef("//evil.example/"), null);
    assert.equal(sanitizeReturnRef("/\\evil.example"), null);
    assert.equal(sanitizeReturnRef("javascript:alert(1)"), null);
    assert.equal(sanitizeReturnRef(undefined), null);
  });
  it("keeps tokens out of the outbox payload allow-list", () => {
    assert.throws(() => restrictPayload({ registrationUrl: "https://x", token: "abc" }), UnsafePayloadError);
  });
});

describe("feature gate (OPS-006)", () => {
  it("answers 404 FEATURE_DISABLED on every route while the flag is off", async () => {
    flags = { ...flags, consumerRegistration: false };
    try {
      for (const [method, path, body] of [
        ["POST", "/consumer-registration", validBody(mail("gated"))],
        ["POST", "/consumer-registration/resend", { email: mail("gated"), locale: "nl" }],
        ["GET", "/consumer-registration/verify?token=abc", undefined],
        ["POST", "/consumer-registration/verify", { token: "abc" }],
      ] as const) {
        const response = await request(path, { method, body: body ? json(body) : undefined });
        assert.equal(response.status, 404, `${method} ${path}`);
        assert.equal(response.body.code, "FEATURE_DISABLED");
      }
      assert.equal(await registrationFor(mail("gated")), undefined);
    } finally {
      flags = { ...flags, consumerRegistration: true };
    }
  });
});

describe("registration request (§12.1)", () => {
  it("rejects invalid input with field errors and creates nothing", async () => {
    const response = await request("/consumer-registration", {
      method: "POST",
      body: json({ name: "", email: "nope", phone: "12", locale: "nl" }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_FAILED");
    const fields = response.body.fieldErrors.map((error: { field: string }) => error.field);
    assert.ok(fields.includes("name") && fields.includes("phone"), JSON.stringify(fields));

    // Shape-valid but semantically invalid values are caught by normalization, not by length checks.
    const semantic = await request("/consumer-registration", {
      method: "POST",
      body: json({ name: "Iemand", email: "nobody-at-example", phone: "abcdefgh", locale: "nl" }),
    });
    assert.equal(semantic.status, 400);
    assert.deepEqual(
      semantic.body.fieldErrors.map((error: { field: string; code: string }) => `${error.field}:${error.code}`).sort(),
      ["email:invalid", "phone:invalid"],
    );
  });

  it("refuses unknown fields such as a client-supplied password or role", async () => {
    const response = await request("/consumer-registration", {
      method: "POST",
      body: json(validBody(mail("unknown"), { password: "hunter2", role: "editor" })),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "UNKNOWN_FIELD");
    assert.equal(await registrationFor(mail("unknown")), undefined);
  });

  it("creates exactly one pending registration and one queued email; no account, no token in the row", async () => {
    const email = mail("first");
    const response = await request("/consumer-registration", {
      method: "POST",
      body: json(validBody(email, { returnRef: "/activiteiten?buurt=x" })),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { status: "accepted", linkLifetimeMinutes: 30 });

    const registration = await registrationFor(email);
    assert.ok(registration);
    assert.equal(registration.status, "pending");
    assert.equal(registration.name, "Test Persoon");
    assert.equal(registration.normalizedPhone, "+31612345678");
    assert.equal(registration.returnRef, "/activiteiten?buurt=x");
    assert.equal(registration.resendCount, 0);

    const queued = await outboxFor(registration.id);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]!.eventCode, "registration.link");
    assert.equal(queued[0]!.recipientUserId, null);
    assert.deepEqual(queued[0]!.payload, {});
    assert.equal(queued[0]!.status, "queued");
    const tokens = await db.select().from(consumerRegistrationTokensTable).where(eq(consumerRegistrationTokensTable.registrationId, registration.id));
    assert.equal(tokens.length, 0, "no token exists until the email is dispatched");
  });

  it("answers identically for an address that already has an account, without creating anything (REG-008)", async () => {
    const response = await request("/consumer-registration", { method: "POST", body: json(validBody(mail("existing"))) });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { status: "accepted", linkLifetimeMinutes: 30 });
    assert.equal(await registrationFor(mail("existing")), undefined);
  });

  it("answers identically for a repeated pending address and does not create a second registration", async () => {
    const email = mail("first");
    const response = await request("/consumer-registration", { method: "POST", body: json(validBody(email)) });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { status: "accepted", linkLifetimeMinutes: 30 });
    const rows = await db.select().from(consumerRegistrationsTable).where(eq(consumerRegistrationsTable.normalizedEmail, email));
    assert.equal(rows.length, 1);
  });

  it("fails closed with 503 when the account lookup is unavailable", async () => {
    lookupUnavailable = true;
    try {
      const response = await request("/consumer-registration", { method: "POST", body: json(validBody(mail("unavailable"))) });
      assert.equal(response.status, 503);
      assert.equal(response.body.code, "DEPENDENCY_UNAVAILABLE");
      assert.equal(await registrationFor(mail("unavailable")), undefined);
    } finally {
      lookupUnavailable = false;
    }
  });
});

describe("delivery and link states (§12.2, §12.3)", () => {
  let firstToken = "";

  it("mints the token at dispatch time, stores only its digest, and renders NL copy without phone or password", async () => {
    const registration = (await registrationFor(mail("first")))!;
    const summary = await dispatch();
    assert.equal(summary.accepted >= 1, true);
    const email = sentMail.find((m) => m.to === mail("first"));
    assert.ok(email);
    assert.equal(email!.subject, "Bevestig je e-mailadres voor buurtplaza.nl");
    assert.match(email!.text, /30 minuten/);
    assert.match(email!.text, /Privacyverklaring/);
    assert.match(email!.text, /Heb je dit niet aangevraagd/);
    assert.doesNotMatch(email!.text, /\+31612345678|wachtwoord|password/i);
    firstToken = tokenFromMail(email!);
    assert.equal(email!.text.includes("token=" + firstToken), true);

    const tokens = await db.select().from(consumerRegistrationTokensTable).where(eq(consumerRegistrationTokensTable.registrationId, registration.id));
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]!.tokenDigest, digestRegistrationToken(firstToken));
    assert.equal(tokens[0]!.tokenDigest.includes(firstToken), false);
    const [row] = await outboxFor(registration.id);
    assert.equal(row!.status, "accepted");
    assert.equal(JSON.stringify(row!.payload).includes(firstToken), false);
  });

  it("GET verify reports valid without consuming; POST verify consumes; replay reports used", async () => {
    const inspect = await request(`/consumer-registration/verify?token=${firstToken}`);
    assert.equal(inspect.status, 200);
    assert.equal(inspect.body.state, "valid");
    assert.equal(inspect.body.canResend, false);
    assert.equal(inspect.body.locale, "nl");
    assert.equal(inspect.headers.get("cache-control"), "no-store");

    const again = await request(`/consumer-registration/verify?token=${firstToken}`);
    assert.equal(again.body.state, "valid", "inspection must not burn the link (prefetch safety)");

    const consume = await request("/consumer-registration/verify", { method: "POST", body: json({ token: firstToken }) });
    assert.equal(consume.status, 200);
    assert.equal(consume.body.state, "valid");

    const registration = (await registrationFor(mail("first")))!;
    assert.equal(registration.status, "verified");
    assert.ok(registration.verifiedAt);

    const replay = await request("/consumer-registration/verify", { method: "POST", body: json({ token: firstToken }) });
    assert.equal(replay.body.state, "used");
    assert.equal(replay.body.canResend, false);
    const replayGet = await request(`/consumer-registration/verify?token=${firstToken}`);
    assert.equal(replayGet.body.state, "used");
  });

  it("reports invalid for unknown or malformed tokens", async () => {
    const unknown = await request(`/consumer-registration/verify?token=${"A".repeat(43)}`);
    assert.deepEqual(unknown.body, { state: "invalid", canResend: true });
    const malformed = await request(`/consumer-registration/verify?token=${encodeURIComponent("bad token!")}`);
    assert.equal(malformed.body.state, "invalid");
    const consumeUnknown = await request("/consumer-registration/verify", { method: "POST", body: json({ token: "B".repeat(43) }) });
    assert.equal(consumeUnknown.body.state, "invalid");
  });

  it("reports expired once the token lifetime has passed", async () => {
    const email = mail("expiring");
    await request("/consumer-registration", { method: "POST", body: json(validBody(email)) });
    await dispatch();
    const token = tokenFromMail(sentMail.find((m) => m.to === email)!);
    advance(policy.tokenTtlMs + 1_000);
    const inspect = await request(`/consumer-registration/verify?token=${token}`);
    assert.equal(inspect.body.state, "expired");
    assert.equal(inspect.body.canResend, true);
    const consume = await request("/consumer-registration/verify", { method: "POST", body: json({ token }) });
    assert.equal(consume.body.state, "expired");
    assert.equal((await registrationFor(email))!.status, "pending");
  });

  it("cancels the email as closed when the registration is no longer pending at dispatch time", async () => {
    const email = mail("closed");
    await request("/consumer-registration", { method: "POST", body: json(validBody(email)) });
    const registration = (await registrationFor(email))!;
    await db.update(consumerRegistrationsTable).set({ status: "cancelled", cancelledAt: now() }).where(eq(consumerRegistrationsTable.id, registration.id));
    await dispatch();
    const [row] = await outboxFor(registration.id);
    assert.equal(row!.status, "failed");
    assert.equal(row!.lastErrorCode, "registration_closed");
    assert.equal(sentMail.some((m) => m.to === email), false);
  });
});

describe("resend (§12.3, REG-016)", () => {
  const email = mail("resend");
  let firstToken = "";

  it("supersedes the earlier link and queues exactly one replacement after the cooldown", async () => {
    await request("/consumer-registration", { method: "POST", body: json(validBody(email)) });
    await dispatch();
    firstToken = tokenFromMail(sentMail.find((m) => m.to === email)!);

    advance(policy.resendCooldownMs + 1_000);
    const response = await request("/consumer-registration/resend", { method: "POST", body: json({ email: `  ${email.toUpperCase()} `, locale: "nl" }) });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { status: "accepted", linkLifetimeMinutes: 30 });

    const superseded = await request(`/consumer-registration/verify?token=${firstToken}`);
    assert.equal(superseded.body.state, "superseded", "earlier link stops working as soon as the resend is accepted");
    assert.equal(superseded.body.canResend, true);

    const registration = (await registrationFor(email))!;
    assert.equal(registration.resendCount, 1);
    assert.equal((await outboxFor(registration.id)).length, 2);

    await dispatch();
    const newest = sentMail.filter((m) => m.to === email).at(-1)!;
    const newToken = tokenFromMail(newest);
    assert.notEqual(newToken, firstToken);
    assert.equal((await request(`/consumer-registration/verify?token=${newToken}`)).body.state, "valid");
    const consumeOld = await request("/consumer-registration/verify", { method: "POST", body: json({ token: firstToken }) });
    assert.equal(consumeOld.body.state, "superseded");
  });

  it("applies the cooldown identically to known and unknown addresses (429, no leak)", async () => {
    const known = await request("/consumer-registration/resend", { method: "POST", body: json({ email, locale: "nl" }) });
    assert.equal(known.status, 429);
    assert.equal(known.body.code, "RATE_LIMITED");
    assert.ok(known.headers.get("retry-after"));

    const unknownEmail = mail("never-registered");
    const unknownFirst = await request("/consumer-registration/resend", { method: "POST", body: json({ email: unknownEmail, locale: "nl" }) });
    assert.equal(unknownFirst.status, 202);
    assert.deepEqual(unknownFirst.body, known.status === 429 ? { status: "accepted", linkLifetimeMinutes: 30 } : unknownFirst.body);
    const unknownSecond = await request("/consumer-registration/resend", { method: "POST", body: json({ email: unknownEmail, locale: "nl" }) });
    assert.equal(unknownSecond.status, 429);
    assert.equal(unknownSecond.body.code, known.body.code);
    assert.equal(await registrationFor(unknownEmail), undefined);
  });

  it("stops queuing once the resend budget is exhausted, still answering neutrally", async () => {
    advance(policy.resendCooldownMs + 1_000);
    assert.equal((await request("/consumer-registration/resend", { method: "POST", body: json({ email, locale: "nl" }) })).status, 202);
    advance(policy.resendCooldownMs + 1_000);
    assert.equal((await request("/consumer-registration/resend", { method: "POST", body: json({ email, locale: "nl" }) })).status, 202);
    const registration = (await registrationFor(email))!;
    assert.equal(registration.resendCount, policy.maxResends);
    assert.equal((await outboxFor(registration.id)).length, 1 + policy.maxResends);
  });
});

describe("abuse limits (§12.4, SEC-004, SEC-005)", () => {
  it("throttles a noisy network origin temporarily without affecting another origin", async () => {
    const client = `noisy-${runId}`;
    let limited: Awaited<ReturnType<typeof request>> | null = null;
    for (let i = 0; i < policy.perNetworkPerHour + 1; i += 1) {
      const response = await request("/consumer-registration/resend", {
        method: "POST",
        client,
        body: json({ email: mail(`noise-${i}`), locale: "nl" }),
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    assert.ok(limited, "the per-network window must eventually answer 429");
    assert.equal(limited!.body.code, "RATE_LIMITED");

    const other = await request("/consumer-registration/resend", { method: "POST", client: `quiet-${runId}`, body: json({ email: mail("quiet"), locale: "nl" }) });
    assert.equal(other.status, 202);

    advance(60 * 60_000 + 1_000);
    const recovered = await request("/consumer-registration/resend", { method: "POST", client, body: json({ email: mail("noise-after"), locale: "nl" }) });
    assert.equal(recovered.status, 202, "no permanent block for a shared network");
  });
});

describe("template and link rendering (§4.3, REG-011)", () => {
  it("renders accessible NL and EN registration copy with expiry and unintended-recipient guidance", () => {
    const vars = { registrationUrl: "https://buurtplaza.nl/account/register/complete?token=abc", linkLifetimeMinutes: 60 };
    const nl = renderLifecycleEmail("registration.link", "nl", vars);
    const en = renderLifecycleEmail("registration.link", "en", vars);
    for (const rendered of [nl, en]) {
      assert.match(rendered.text, /token=abc/);
      assert.match(rendered.text, /60/);
      assert.doesNotMatch(rendered.text, /Log in op|Sign in at/);
    }
    assert.match(en.text, /Did you not request this/);
    assert.match(en.text, /Privacy notice/);
    assert.match(nl.text, /Hulp nodig/);
  });
  it("never renders a non-http(s) link", () => {
    const rendered = renderLifecycleEmail("registration.link", "en", { registrationUrl: "javascript:alert(1)", linkLifetimeMinutes: 60 });
    assert.doesNotMatch(rendered.text, /javascript:/);
    assert.match(rendered.text, /link missing/);
  });
  it("builds the fixed handoff path under the configured origin", () => {
    assert.equal(buildRegistrationLink("https://buurtplaza.nl", "t0k"), "https://buurtplaza.nl/account/register/complete?token=t0k");
    assert.equal(buildRegistrationLink("https://buurtplaza.nl/", "t0k"), "https://buurtplaza.nl/account/register/complete?token=t0k");
  });
  it("holds registration mail as a transient failure while the link origin is unconfigured", async () => {
    const email = mail("unconfigured");
    await request("/consumer-registration", { method: "POST", body: json(validBody(email)) });
    const registration = (await registrationFor(email))!;
    const unconfigured = createEmailDeliveryLoader({
      senderAddress: "noreply@buurtplaza.nl",
      transport: async () => ({ kind: "accepted" }),
      resolveRecipient: async () => ({ kind: "not_found" }),
      registrationLinkBaseUrl: null,
    });
    const summary = await dispatchLifecycleOutbox({ deliver: unconfigured, now });
    assert.equal(summary.retried >= 1, true);
    const [row] = await outboxFor(registration.id);
    assert.equal(row!.status, "queued");
    assert.equal(row!.lastErrorCode, "registration_link_not_configured");
    const tokens = await db.select().from(consumerRegistrationTokensTable).where(eq(consumerRegistrationTokensTable.registrationId, registration.id));
    assert.equal(tokens.length, 0, "no token is minted when no email can be built");
  });
});
