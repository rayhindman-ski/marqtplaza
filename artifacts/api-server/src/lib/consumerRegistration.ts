import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import {
  consumerRegistrationTokensTable,
  consumerRegistrationsTable,
  db,
  type ConsumerRegistration,
} from "@workspace/db";

import { enqueueRegistrationLifecycleMessage } from "./lifecycleOutbox";
import { logger } from "./logger";

/**
 * Consumer registration foundation (release v0.5.1).
 *
 * Everything here operates on *pending registrations*: no account, session,
 * or credential is created. The raw registration token is minted at dispatch
 * time by the email loader (see `issueRegistrationToken`) so it never sits in
 * the outbox; only its SHA-256 digest is persisted (REG-012, REG-013).
 */

type Tx = Pick<typeof db, "insert" | "select" | "update" | "delete">;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export type ConsumerRegistrationPolicy = Readonly<{
  /** How long a single registration link works. */
  tokenTtlMs: number;
  /** How long a pending registration may wait for a verified link before it expires. */
  registrationTtlMs: number;
  /** Replacement emails permitted per registration (initial send excluded). */
  maxResends: number;
  /** Minimum gap between sends for the same address; enforced identically for unknown addresses. */
  resendCooldownMs: number;
  /** Requests (submit + resend) per address per hour. */
  perEmailPerHour: number;
  /** Requests (submit + resend) per network origin per hour. */
  perNetworkPerHour: number;
  /** Link inspections/consumptions per network origin per ten minutes. */
  verifyPerNetworkPerTenMinutes: number;
}>;

/**
 * Defaults pending the open policy decisions in requirements.md §15 (items 3
 * and 6). They are deliberately conservative and can be tightened per release
 * without a code change through the service options.
 */
export const DEFAULT_CONSUMER_REGISTRATION_POLICY: ConsumerRegistrationPolicy = {
  tokenTtlMs: 60 * 60_000,
  registrationTtlMs: 7 * 24 * 60 * 60_000,
  maxResends: 5,
  resendCooldownMs: 60_000,
  perEmailPerHour: 6,
  perNetworkPerHour: 30,
  verifyPerNetworkPerTenMinutes: 60,
};

// ---------------------------------------------------------------------------
// Normalization and validation (REG-006, REG-007)
// ---------------------------------------------------------------------------

export type FieldIssue = { field: "name" | "email" | "phone" | "locale" | "returnRef"; code: string };

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const EMAIL_PATTERN = /^[^\s@"'<>(),;:\\[\]]+@[^\s@"'<>(),;:\\[\]]+\.[A-Za-z0-9-]{2,}$/;

/** Trim, collapse whitespace, strip control characters. Never alters letters. */
export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/**
 * Conservative address normalization: trim and lower-case only. Dots, plus
 * tags, and sub-addresses are kept, so two distinct mailboxes are never merged.
 * Lower-casing matches the identity provider's own comparison rule.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.normalize("NFC").replace(CONTROL_CHARS, "").trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain || local.length > 64 || domain.startsWith("-") || domain.includes("..")) return null;
  return trimmed;
}

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Country-aware phone normalization to E.164 without a heavy library:
 *   "+31 6 1234 5678", "0031612345678", "06-12345678" -> "+31612345678"
 * Other countries must be entered in international form. The value is contact
 * data only; nothing here treats it as an SMS sign-in factor (REG-005).
 */
export function normalizePhone(raw: string, defaultCountryCode = "31"): string | null {
  let value = raw.normalize("NFC").replace(CONTROL_CHARS, "").trim();
  if (value.length === 0) return null;
  const hasPlus = value.startsWith("+");
  value = value.replace(/[\s().-]/g, "");
  if (hasPlus) value = `+${value.slice(1).replace(/\D/g, "")}`;
  else if (/^00\d+$/.test(value)) value = `+${value.slice(2)}`;
  else if (/^0\d+$/.test(value)) value = `+${defaultCountryCode}${value.slice(1)}`;
  else if (/^\d+$/.test(value)) value = `+${defaultCountryCode}${value}`;
  else return null;
  return E164.test(value) ? value : null;
}

/**
 * Internal return destinations (SEC-009). Mirrors the web app's `returnPath`
 * allow-list: only known discovery/account routes, never a scheme, host,
 * protocol-relative URL, or an arbitrary path the app does not serve.
 */
const RETURN_REF_EXACT_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/account",
  "/account/voorkeuren",
  "/onboarding",
  "/activiteiten/den-haag",
  "/buurt",
  "/bronnen",
  "/nieuws",
  "/deals",
  "/bedrijf-aanmelden",
  "/bedrijf-zoeken",
  "/bedrijf-nieuw",
  "/bedrijf-claim",
  "/mijn-bedrijf",
]);
const RETURN_REF_PREFIX_PATHS = ["/activiteiten/den-haag/", "/nieuws/", "/bedrijf/"] as const;
const RETURN_REF_SEGMENT = /^[A-Za-z0-9._~:@!$&'()*+,;=%-]+$/;

function isAllowedReturnPathname(pathname: string): boolean {
  if (RETURN_REF_EXACT_PATHS.has(pathname)) return true;
  return RETURN_REF_PREFIX_PATHS.some((prefix) => {
    if (!pathname.startsWith(prefix)) return false;
    const rest = pathname.slice(prefix.length);
    return rest.length > 0 && rest.length <= 200 && RETURN_REF_SEGMENT.test(rest);
  });
}

export function sanitizeReturnRef(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://internal.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://internal.invalid") return null;
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!isAllowedReturnPathname(pathname)) return null;
  return `${pathname}${parsed.search}${parsed.hash}`;
}

export type RegistrationInput = { name: string; email: string; phone: string; locale: string; returnRef?: string | null };
export type NormalizedRegistration = { name: string; email: string; phone: string; locale: "nl" | "en"; returnRef: string | null };

export function normalizeRegistrationInput(
  input: RegistrationInput,
): { ok: true; value: NormalizedRegistration } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const name = normalizeName(input.name ?? "");
  if (name.length === 0) issues.push({ field: "name", code: "required" });
  else if (name.length > 120) issues.push({ field: "name", code: "too_long" });
  const email = normalizeEmail(input.email ?? "");
  if (!email) issues.push({ field: "email", code: (input.email ?? "").trim() ? "invalid" : "required" });
  const phone = normalizePhone(input.phone ?? "");
  if (!phone) issues.push({ field: "phone", code: (input.phone ?? "").trim() ? "invalid" : "required" });
  const locale = input.locale === "en" ? "en" : input.locale === "nl" ? "nl" : null;
  if (!locale) issues.push({ field: "locale", code: "invalid" });
  if (issues.length > 0 || !email || !phone || !locale) return { ok: false, issues };
  return { ok: true, value: { name, email, phone, locale, returnRef: sanitizeReturnRef(input.returnRef) } };
}

// ---------------------------------------------------------------------------
// Tokens (REG-012 – REG-014)
// ---------------------------------------------------------------------------

/** 256 bits of randomness, URL-safe, no padding. */
export function generateRegistrationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestRegistrationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Supersede every effective token of a registration and issue a new one in
 * the caller's transaction. Returns the raw token exactly once; only the
 * digest is stored.
 */
/**
 * Mint a token for one outbox row. Tokens of *other* rows (earlier
 * generations) are superseded; tokens already minted for this same row stay
 * valid because a provider may deduplicate a retried send by its idempotency
 * key and deliver the first body — that link must keep working.
 */
export async function issueRegistrationToken(
  tx: Tx,
  input: { registrationId: number; outboxId: number | null; now: Date; ttlMs: number },
): Promise<{ token: string; expiresAt: Date }> {
  await supersedeEffectiveTokens(tx, input.registrationId, input.now, input.outboxId);
  const token = generateRegistrationToken();
  const expiresAt = new Date(input.now.getTime() + input.ttlMs);
  await tx.insert(consumerRegistrationTokensTable).values({
    registrationId: input.registrationId,
    tokenDigest: digestRegistrationToken(token),
    outboxId: input.outboxId,
    expiresAt,
  });
  return { token, expiresAt };
}

async function supersedeEffectiveTokens(tx: Tx, registrationId: number, now: Date, exceptOutboxId: number | null = null): Promise<number> {
  const rows = await tx
    .update(consumerRegistrationTokensTable)
    .set({ supersededAt: now })
    .where(
      and(
        eq(consumerRegistrationTokensTable.registrationId, registrationId),
        isNull(consumerRegistrationTokensTable.usedAt),
        isNull(consumerRegistrationTokensTable.supersededAt),
        exceptOutboxId === null ? undefined : ne(consumerRegistrationTokensTable.outboxId, exceptOutboxId),
      ),
    )
    .returning({ id: consumerRegistrationTokensTable.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Rate limiting (SEC-004, SEC-005)
// ---------------------------------------------------------------------------

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * In-memory sliding window. Windows expire on their own, so a shared network
 * is throttled temporarily but never blocked permanently (SEC-005). Keys are
 * digests, never raw addresses, so a heap dump does not expose contact data.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxKeys = 20_000) {}

  check(rawKey: string, limit: number, windowMs: number, now: number): RateLimitDecision {
    const key = createHash("sha256").update(rawKey).digest("base64url");
    const since = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= limit) {
      const oldest = recent[0] ?? now;
      return { allowed: false, retryAfterMs: Math.max(1_000, oldest + windowMs - now) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.evict(since);
    return { allowed: true };
  }

  private evict(since: number): void {
    for (const [key, times] of this.hits) {
      const kept = times.filter((at) => at > since);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class RegistrationClosedError extends Error {
  constructor() {
    super("Registration closed during consumption.");
    this.name = "RegistrationClosedError";
  }
}

/** Safe error summary for logs: class and driver code only, never the message (it can carry SQL parameters). */
export function safeErrorSummary(error: unknown): { name: string; code?: string } {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? { name, code } : { name };
}

export class AccountLookupUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Account lookup is unavailable.");
    this.name = "AccountLookupUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Reports whether an *active account* already uses the address. Throws `AccountLookupUnavailableError` when it cannot tell. */
export type AccountExistsLookup = (normalizedEmail: string) => Promise<boolean>;

export type ConsumerRegistrationServiceOptions = {
  accountExists: AccountExistsLookup;
  policy?: Partial<ConsumerRegistrationPolicy>;
  now?: () => Date;
};

export type SubmitOutcome =
  | { kind: "created"; registrationId: number }
  | { kind: "resent"; registrationId: number }
  | { kind: "suppressed"; reason: "cooldown" | "resend_budget" | "already_verified" | "account_exists" | "race" };

export type ResendOutcome =
  | { kind: "resent"; registrationId: number }
  | { kind: "suppressed"; reason: "unknown" | "cooldown" | "resend_budget" | "already_verified" };

export type LinkState =
  | { state: "valid"; registrationId: number; locale: "nl" | "en"; expiresAt: Date }
  | { state: "expired" | "used" | "superseded" | "invalid"; locale?: "nl" | "en" };

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: string })?.code;
  const nested = (error as { cause?: { code?: string } })?.cause?.code;
  return direct === UNIQUE_VIOLATION || nested === UNIQUE_VIOLATION;
}

function idempotencyKeyFor(registrationId: number, sequence: number): string {
  return `consumer-registration:${registrationId}:send:${sequence}`;
}

export function createConsumerRegistrationService(options: ConsumerRegistrationServiceOptions) {
  const policy: ConsumerRegistrationPolicy = { ...DEFAULT_CONSUMER_REGISTRATION_POLICY, ...options.policy };
  const now = options.now ?? (() => new Date());

  async function loadOpenRegistration(tx: Tx, normalizedEmail: string): Promise<ConsumerRegistration | undefined> {
    const [row] = await tx
      .select()
      .from(consumerRegistrationsTable)
      .where(
        and(
          eq(consumerRegistrationsTable.normalizedEmail, normalizedEmail),
          inArray(consumerRegistrationsTable.status, ["pending", "verified"]),
        ),
      )
      .limit(1)
      .for("update");
    return row;
  }

  /**
   * Queue one replacement message for a pending registration. Earlier tokens
   * are superseded immediately so an old link stops working even before the
   * dispatcher mints the new one.
   */
  async function queueSend(tx: Tx, registration: ConsumerRegistration, at: Date): Promise<"resent" | "cooldown" | "resend_budget"> {
    if (registration.lastSentAt && at.getTime() - registration.lastSentAt.getTime() < policy.resendCooldownMs) return "cooldown";
    if (registration.resendCount >= policy.maxResends) return "resend_budget";
    const sequence = registration.resendCount + 2; // sequence 1 was the initial send
    await supersedeEffectiveTokens(tx, registration.id, at);
    await enqueueRegistrationLifecycleMessage(tx, {
      registrationId: registration.id,
      locale: registration.locale,
      idempotencyKey: idempotencyKeyFor(registration.id, sequence),
    });
    await tx
      .update(consumerRegistrationsTable)
      .set({ resendCount: registration.resendCount + 1, lastSentAt: at })
      .where(eq(consumerRegistrationsTable.id, registration.id));
    return "resent";
  }

  return {
    policy,

    /** Neutral by construction: every branch resolves; the caller answers 202 for all of them. */
    async submit(value: NormalizedRegistration): Promise<SubmitOutcome> {
      const at = now();
      // The identity-provider lookup runs for *every* valid request, before the
      // registration state is consulted, so new, pending, and existing addresses
      // share one dependency path and one timing class; an outage answers 503
      // for all of them (REG-008, §12.5.1).
      let accountExists: boolean;
      try {
        accountExists = await options.accountExists(value.email);
      } catch (error) {
        throw error instanceof AccountLookupUnavailableError ? error : new AccountLookupUnavailableError(error);
      }

      const existing = await db.transaction(async (tx) => {
        const open = await loadOpenRegistration(tx, value.email);
        if (!open) return null;
        if (open.status === "verified") return { kind: "suppressed", reason: "already_verified" } as const;
        const sent = await queueSend(tx, open, at);
        return sent === "resent"
          ? ({ kind: "resent", registrationId: open.id } as const)
          : ({ kind: "suppressed", reason: sent } as const);
      });
      if (existing) return existing;

      if (accountExists) {
        logger.info({ event: "consumer_registration.suppressed", reason: "account_exists" }, "Registration request suppressed");
        return { kind: "suppressed", reason: "account_exists" };
      }

      try {
        return await db.transaction(async (tx) => {
          const [registration] = await tx
            .insert(consumerRegistrationsTable)
            .values({
              normalizedEmail: value.email,
              name: value.name,
              normalizedPhone: value.phone,
              locale: value.locale,
              returnRef: value.returnRef,
              expiresAt: new Date(at.getTime() + policy.registrationTtlMs),
              lastSentAt: at,
            })
            .returning();
          if (!registration) throw new Error("Pending registration insert returned no row.");
          await enqueueRegistrationLifecycleMessage(tx, {
            registrationId: registration.id,
            locale: value.locale,
            idempotencyKey: idempotencyKeyFor(registration.id, 1),
          });
          logger.info({ event: "consumer_registration.created", registrationId: registration.id }, "Pending registration created");
          return { kind: "created", registrationId: registration.id } as const;
        });
      } catch (error) {
        // Two simultaneous first requests for one address: the partial unique
        // index lets exactly one through; the other is indistinguishable from a
        // repeat request and is suppressed.
        if (isUniqueViolation(error)) return { kind: "suppressed", reason: "race" };
        throw error;
      }
    },

    async resend(normalizedEmail: string): Promise<ResendOutcome> {
      const at = now();
      return db.transaction(async (tx) => {
        const open = await loadOpenRegistration(tx, normalizedEmail);
        if (!open) return { kind: "suppressed", reason: "unknown" };
        if (open.status === "verified") return { kind: "suppressed", reason: "already_verified" };
        if (open.expiresAt.getTime() <= at.getTime()) return { kind: "suppressed", reason: "unknown" };
        const sent = await queueSend(tx, open, at);
        return sent === "resent" ? { kind: "resent", registrationId: open.id } : { kind: "suppressed", reason: sent };
      });
    },

    /** Safe inspection: reports the state and never changes it (link prefetch safe). */
    async inspect(token: string): Promise<LinkState> {
      if (!TOKEN_SHAPE.test(token)) return { state: "invalid" };
      const at = now();
      const found = await loadTokenWithRegistration(db, digestRegistrationToken(token));
      return classify(found, at);
    },

    /** Consume the newest valid token and move the registration to `verified` atomically. */
    async consume(token: string): Promise<LinkState> {
      if (!TOKEN_SHAPE.test(token)) return { state: "invalid" };
      const at = now();
      const digest = digestRegistrationToken(token);
      try {
        return await db.transaction(async (tx) => {
        const found = await loadTokenWithRegistration(tx, digest, true);
        const current = classify(found, at);
        if (current.state !== "valid" || !found) return current;
        const [used] = await tx
          .update(consumerRegistrationTokensTable)
          .set({ usedAt: at })
          .where(
            and(
              eq(consumerRegistrationTokensTable.id, found.token.id),
              isNull(consumerRegistrationTokensTable.usedAt),
              isNull(consumerRegistrationTokensTable.supersededAt),
              gt(consumerRegistrationTokensTable.expiresAt, at),
            ),
          )
          .returning({ id: consumerRegistrationTokensTable.id });
        if (!used) return { state: "used", locale: current.locale };
        const [verified] = await tx
          .update(consumerRegistrationsTable)
          .set({ status: "verified", verifiedAt: at })
          .where(
            and(
              eq(consumerRegistrationsTable.id, found.registration.id),
              eq(consumerRegistrationsTable.status, "pending"),
              gt(consumerRegistrationsTable.expiresAt, at),
            ),
          )
          .returning({ id: consumerRegistrationsTable.id });
        if (!verified) {
          // The registration expired or was cancelled between the read and this
          // write. Nothing may be consumed for a closed registration.
          throw new RegistrationClosedError();
        }
        logger.info({ event: "consumer_registration.verified", registrationId: found.registration.id }, "Registration link consumed");
        return current;
        });
      } catch (error) {
        if (error instanceof RegistrationClosedError) return { state: "expired" };
        throw error;
      }
    },

    /** Housekeeping: pending registrations past their deadline become `expired`; their tokens stop working through the join. */
    async expireStale(): Promise<number> {
      const at = now();
      const rows = await db
        .update(consumerRegistrationsTable)
        .set({ status: "expired" })
        .where(and(eq(consumerRegistrationsTable.status, "pending"), lt(consumerRegistrationsTable.expiresAt, at)))
        .returning({ id: consumerRegistrationsTable.id });
      if (rows.length > 0) logger.info({ event: "consumer_registration.expired", count: rows.length }, "Pending registrations expired");
      return rows.length;
    },
  };
}

export type ConsumerRegistrationService = ReturnType<typeof createConsumerRegistrationService>;

type TokenWithRegistration = {
  token: { id: number; expiresAt: Date; usedAt: Date | null; supersededAt: Date | null };
  registration: { id: number; status: string; locale: string; expiresAt: Date };
};

async function loadTokenWithRegistration(tx: Tx, digest: string, lock = false): Promise<TokenWithRegistration | null> {
  const query = tx
    .select({
      tokenId: consumerRegistrationTokensTable.id,
      tokenExpiresAt: consumerRegistrationTokensTable.expiresAt,
      usedAt: consumerRegistrationTokensTable.usedAt,
      supersededAt: consumerRegistrationTokensTable.supersededAt,
      registrationId: consumerRegistrationsTable.id,
      status: consumerRegistrationsTable.status,
      locale: consumerRegistrationsTable.locale,
      registrationExpiresAt: consumerRegistrationsTable.expiresAt,
    })
    .from(consumerRegistrationTokensTable)
    .innerJoin(consumerRegistrationsTable, eq(consumerRegistrationsTable.id, consumerRegistrationTokensTable.registrationId))
    .where(eq(consumerRegistrationTokensTable.tokenDigest, digest))
    .limit(1);
  const [row] = lock ? await query.for("update", { of: consumerRegistrationTokensTable }) : await query;
  if (!row) return null;
  return {
    token: { id: row.tokenId, expiresAt: row.tokenExpiresAt, usedAt: row.usedAt, supersededAt: row.supersededAt },
    registration: { id: row.registrationId, status: row.status, locale: row.locale, expiresAt: row.registrationExpiresAt },
  };
}

function classify(found: TokenWithRegistration | null, at: Date): LinkState {
  if (!found) return { state: "invalid" };
  const locale = found.registration.locale === "en" ? "en" : "nl";
  if (found.token.usedAt) return { state: "used", locale };
  if (found.token.supersededAt) return { state: "superseded", locale };
  if (found.registration.status === "cancelled") return { state: "invalid", locale };
  if (found.registration.status !== "pending") return { state: "used", locale };
  if (found.token.expiresAt.getTime() <= at.getTime() || found.registration.expiresAt.getTime() <= at.getTime()) {
    return { state: "expired", locale };
  }
  return { state: "valid", registrationId: found.registration.id, locale, expiresAt: found.token.expiresAt };
}

/** Whether a link state offers the resend journey (REG-016). */
export function canResendFrom(state: LinkState["state"]): boolean {
  return state === "expired" || state === "invalid" || state === "superseded";
}
