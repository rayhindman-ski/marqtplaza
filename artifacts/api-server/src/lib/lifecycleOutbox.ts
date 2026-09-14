import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  appUsersTable,
  db,
  lifecycleDeliveryAttemptsTable,
  lifecycleOutboxTable,
  type LifecycleOutboxRow,
} from "@workspace/db";

import { logger } from "./logger";

/**
 * Durable, provider-neutral lifecycle messaging.
 *
 * Every application-owned message starts as an outbox row written inside the
 * transaction that changes business or account state (FR-013), so a provider
 * outage can never roll back a decision or lose the intent to tell the user
 * about it. A dispatcher later hands queued rows to an injected delivery
 * loader with bounded retries. When no loader is configured rows simply stay
 * `queued`, which the UI reports truthfully.
 */

type Tx = Pick<typeof db, "insert" | "select" | "update">;

export const LIFECYCLE_EVENT_CODES = [
  "claim.submitted",
  "claim.disputed",
  "claim.approved",
  "claim.rejected",
  "claim.changes_requested",
  "revision.approved",
  "revision.rejected",
  "revision.changes_requested",
  "business.published",
  "business.unpublished",
  "business.suspended",
  "business.closed",
  "account.deletion_received",
  "account.deletion_blocked",
  "account.deletion_in_review",
  "account.deletion_completed",
  "account.deletion_rejected",
  "account.deletion_withdrawn",
] as const;
export type LifecycleEventCode = (typeof LIFECYCLE_EVENT_CODES)[number];

/**
 * Template variables that may be stored with a message. Anything else is
 * dropped before the row is written, so contact data, evidence references,
 * tokens, and reviewer notes can never reach the outbox or a provider.
 */
const PAYLOAD_ALLOW_LIST: ReadonlySet<string> = new Set([
  "businessProfileId",
  "businessName",
  "claimId",
  "revisionVersion",
  "requestId",
  "status",
  "blockerCode",
  "resolutionCode",
]);

export class UnsafePayloadError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Lifecycle payload contains disallowed keys: ${keys.join(", ")}`);
    this.name = "UnsafePayloadError";
  }
}

export type LifecyclePayload = Partial<{
  businessProfileId: number;
  businessName: string;
  claimId: number;
  revisionVersion: number;
  requestId: number;
  status: string;
  blockerCode: string;
  resolutionCode: string;
}>;

/** Returns only allow-listed scalar values; throws when a caller passes anything else. */
export function restrictPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const disallowed = Object.keys(payload).filter((key) => !PAYLOAD_ALLOW_LIST.has(key));
  if (disallowed.length > 0) throw new UnsafePayloadError(disallowed);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new UnsafePayloadError([key]);
    }
    safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return safe;
}

export type EnqueueLifecycleMessageInput = {
  eventCode: LifecycleEventCode;
  /** Clerk subject of the recipient; the local account is provisioned if needed. */
  recipientClerkUserId: string;
  /**
   * Deduplication key. The same key written twice (a retried request, a
   * replayed transition) leaves exactly one row.
   */
  idempotencyKey: string;
  payload?: LifecyclePayload;
  /** Overrides the recipient's account locale. */
  locale?: string;
  maxAttempts?: number;
};

export type EnqueueOutcome = { id: number; created: boolean };

export const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Write one message intent inside the caller's transaction. Returns the
 * existing row id when the idempotency key was already used.
 */
export async function enqueueLifecycleMessage(
  tx: Tx,
  input: EnqueueLifecycleMessageInput,
): Promise<EnqueueOutcome> {
  await tx
    .insert(appUsersTable)
    .values({ clerkUserId: input.recipientClerkUserId })
    .onConflictDoNothing({ target: appUsersTable.clerkUserId });
  const [recipient] = await tx
    .select({ id: appUsersTable.id, locale: appUsersTable.locale })
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, input.recipientClerkUserId))
    .limit(1);
  if (!recipient) throw new Error("Lifecycle message recipient could not be provisioned.");

  const payload = restrictPayload(input.payload ?? {});
  const [inserted] = await tx
    .insert(lifecycleOutboxTable)
    .values({
      eventCode: input.eventCode,
      recipientUserId: recipient.id,
      template: input.eventCode,
      locale: input.locale ?? recipient.locale,
      payload,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    })
    .onConflictDoNothing({ target: lifecycleOutboxTable.idempotencyKey })
    .returning({ id: lifecycleOutboxTable.id });
  if (inserted) return { id: inserted.id, created: true };
  const [existing] = await tx
    .select({ id: lifecycleOutboxTable.id })
    .from(lifecycleOutboxTable)
    .where(eq(lifecycleOutboxTable.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) throw new Error("Lifecycle message row vanished after a duplicate key.");
  return { id: existing.id, created: false };
}

/** Cancel queued messages whose triggering state was reverted; anything already sent is untouched. */
export async function cancelQueuedLifecycleMessages(tx: Tx, idempotencyKeys: string[]): Promise<number> {
  if (idempotencyKeys.length === 0) return 0;
  const rows = await tx
    .update(lifecycleOutboxTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(inArray(lifecycleOutboxTable.idempotencyKey, idempotencyKeys), eq(lifecycleOutboxTable.status, "queued")))
    .returning({ id: lifecycleOutboxTable.id });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** What the dispatcher hands to a provider. Recipient is an internal id only. */
export type OutboundLifecycleMessage = {
  id: number;
  eventCode: string;
  template: string;
  locale: string;
  recipientUserId: number | null;
  recipientClerkUserId: string | null;
  payload: Record<string, unknown>;
  attempt: number;
};

export type DeliveryResult =
  | { kind: "accepted"; providerMessageId?: string }
  | { kind: "transient_failure"; errorCode: string }
  | { kind: "permanent_failure"; errorCode: string }
  /** No provider is configured; the row stays queued without consuming an attempt. */
  | { kind: "not_configured" };

export type LifecycleDeliveryLoader = (message: OutboundLifecycleMessage) => Promise<DeliveryResult>;

let notConfiguredLogged = false;

/** Default loader: logs `lifecycle_provider_not_configured` once and leaves rows queued. */
export const notConfiguredLoader: LifecycleDeliveryLoader = async () => {
  if (!notConfiguredLogged) {
    notConfiguredLogged = true;
    logger.warn(
      { event: "lifecycle_provider_not_configured" },
      "No lifecycle delivery provider is configured; messages stay queued",
    );
  }
  return { kind: "not_configured" };
};

/** Development loader: records acceptance without contacting anyone. Never enable in production. */
export const logOnlyLoader: LifecycleDeliveryLoader = async (message) => {
  logger.info(
    { event: "lifecycle_message.log_only", outboxId: message.id, eventCode: message.eventCode, locale: message.locale },
    "Lifecycle message accepted by log-only provider",
  );
  return { kind: "accepted", providerMessageId: `log-${message.id}-${message.attempt}` };
};

/**
 * Pick the delivery loader from release configuration. Only the log-only
 * provider exists today; a real provider is release gate Q5 and must be added
 * here explicitly, never inferred from an API key being present.
 */
export function resolveLifecycleDeliveryLoader(
  env: Record<string, string | undefined> = process.env,
): { loader: LifecycleDeliveryLoader; configured: boolean; name: string } {
  const provider = env.LIFECYCLE_DELIVERY_PROVIDER?.trim().toLowerCase();
  if (!provider) return { loader: notConfiguredLoader, configured: false, name: "not_configured" };
  if (provider === "log") {
    if (env.NODE_ENV === "production") {
      throw new Error("LIFECYCLE_DELIVERY_PROVIDER=log is a development provider and cannot run in production.");
    }
    return { loader: logOnlyLoader, configured: true, name: "log" };
  }
  throw new Error(`Unknown LIFECYCLE_DELIVERY_PROVIDER "${provider}".`);
}

export type BackoffPolicy = (attempt: number) => number;

/** 1 min, 2 min, 4 min, … capped at 6 hours. */
export const defaultBackoffMs: BackoffPolicy = (attempt) =>
  Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 6 * 60 * 60_000);

export type DispatchOptions = {
  deliver?: LifecycleDeliveryLoader;
  now?: () => Date;
  /** Rows claimed per run. */
  limit?: number;
  backoffMs?: BackoffPolicy;
  /** `sending` rows older than this are considered abandoned and re-queued. */
  staleClaimMs?: number;
};

export type DispatchSummary = {
  claimed: number;
  accepted: number;
  cancelled: number;
  retried: number;
  failed: number;
  skipped: number;
  reclaimed: number;
};

const DEFAULT_STALE_CLAIM_MS = 10 * 60_000;

/**
 * Claim due rows with `FOR UPDATE SKIP LOCKED` so concurrent dispatchers never
 * pick the same message, then call the loader once per row and record the
 * attempt. Each row's outcome is committed independently.
 */
export async function dispatchLifecycleOutbox(options: DispatchOptions = {}): Promise<DispatchSummary> {
  const deliver = options.deliver ?? notConfiguredLoader;
  const now = options.now ?? (() => new Date());
  const limit = options.limit ?? 50;
  const backoff = options.backoffMs ?? defaultBackoffMs;
  const staleClaimMs = options.staleClaimMs ?? DEFAULT_STALE_CLAIM_MS;
  const summary: DispatchSummary = { claimed: 0, accepted: 0, cancelled: 0, retried: 0, failed: 0, skipped: 0, reclaimed: 0 };

  const startedAt = now();
  const staleBefore = new Date(startedAt.getTime() - staleClaimMs);
  const reclaimed = await db
    .update(lifecycleOutboxTable)
    .set({ status: "queued", claimedAt: null })
    .where(and(eq(lifecycleOutboxTable.status, "sending"), lte(lifecycleOutboxTable.claimedAt, staleBefore)))
    .returning({ id: lifecycleOutboxTable.id });
  summary.reclaimed = reclaimed.length;

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: lifecycleOutboxTable.id })
      .from(lifecycleOutboxTable)
      .where(
        and(
          eq(lifecycleOutboxTable.status, "queued"),
          or(isNull(lifecycleOutboxTable.nextRetryAt), lte(lifecycleOutboxTable.nextRetryAt, startedAt)),
        ),
      )
      .orderBy(asc(lifecycleOutboxTable.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [] as LifecycleOutboxRow[];
    return tx
      .update(lifecycleOutboxTable)
      .set({ status: "sending", claimedAt: startedAt })
      .where(
        and(
          inArray(
            lifecycleOutboxTable.id,
            due.map((row) => row.id),
          ),
          eq(lifecycleOutboxTable.status, "queued"),
        ),
      )
      .returning();
  });
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  const recipientIds = [...new Set(claimed.map((row) => row.recipientUserId).filter((id): id is number => id !== null))];
  const recipients = recipientIds.length
    ? await db
        .select({ id: appUsersTable.id, clerkUserId: appUsersTable.clerkUserId })
        .from(appUsersTable)
        .where(inArray(appUsersTable.id, recipientIds))
    : [];
  const clerkIdByRecipient = new Map(recipients.map((row) => [row.id, row.clerkUserId]));

  for (const row of claimed) {
    // A recipient whose application account row is gone can never be
    // addressed; cancel instead of handing an unaddressable message to the provider.
    if (row.recipientUserId === null || !clerkIdByRecipient.has(row.recipientUserId)) {
      await db
        .update(lifecycleOutboxTable)
        .set({ status: "cancelled", claimedAt: null, cancelledAt: now(), lastErrorCode: "recipient_gone", lastErrorAt: now() })
        .where(and(eq(lifecycleOutboxTable.id, row.id), eq(lifecycleOutboxTable.status, "sending")));
      summary.cancelled += 1;
      continue;
    }
    const attempt = row.attempts + 1;
    const attemptStartedAt = now();
    let result: DeliveryResult;
    try {
      result = await deliver({
        id: row.id,
        eventCode: row.eventCode,
        template: row.template,
        locale: row.locale,
        recipientUserId: row.recipientUserId,
        recipientClerkUserId: row.recipientUserId ? (clerkIdByRecipient.get(row.recipientUserId) ?? null) : null,
        payload: row.payload,
        attempt,
      });
    } catch (error) {
      // A throwing provider is a transient failure; the reason stays in the log, never in the row.
      logger.warn({ err: error, event: "lifecycle_dispatch.loader_threw", outboxId: row.id }, "Delivery loader threw");
      result = { kind: "transient_failure", errorCode: "loader_exception" };
    }
    await recordAttempt(row, attempt, attemptStartedAt, result, now(), backoff, summary);
  }
  return summary;
}

async function recordAttempt(
  row: LifecycleOutboxRow,
  attempt: number,
  startedAt: Date,
  result: DeliveryResult,
  finishedAt: Date,
  backoff: BackoffPolicy,
  summary: DispatchSummary,
): Promise<void> {
  if (result.kind === "not_configured") {
    // Give the row back untouched: no attempt consumed, still visibly queued.
    await db
      .update(lifecycleOutboxTable)
      .set({ status: "queued", claimedAt: null })
      .where(and(eq(lifecycleOutboxTable.id, row.id), eq(lifecycleOutboxTable.status, "sending")));
    summary.skipped += 1;
    return;
  }

  await db.transaction(async (tx) => {
    const guard = and(eq(lifecycleOutboxTable.id, row.id), eq(lifecycleOutboxTable.status, "sending"));
    if (result.kind === "accepted") {
      const [updated] = await tx
        .update(lifecycleOutboxTable)
        .set({
          status: "accepted",
          attempts: attempt,
          claimedAt: null,
          nextRetryAt: null,
          providerMessageId: result.providerMessageId ?? null,
          acceptedAt: finishedAt,
        })
        .where(guard)
        .returning({ id: lifecycleOutboxTable.id });
      if (!updated) return;
      await tx.insert(lifecycleDeliveryAttemptsTable).values({
        outboxId: row.id,
        attempt,
        outcome: "accepted",
        providerMessageId: result.providerMessageId ?? null,
        startedAt,
        finishedAt,
      });
      summary.accepted += 1;
      return;
    }
    const exhausted = attempt >= row.maxAttempts;
    const permanent = result.kind === "permanent_failure" || exhausted;
    const [updated] = await tx
      .update(lifecycleOutboxTable)
      .set(
        permanent
          ? {
              status: "failed",
              attempts: attempt,
              claimedAt: null,
              nextRetryAt: null,
              lastErrorCode: result.kind === "permanent_failure" ? result.errorCode : "attempts_exhausted",
              lastErrorAt: finishedAt,
              failedAt: finishedAt,
            }
          : {
              status: "queued",
              attempts: attempt,
              claimedAt: null,
              nextRetryAt: new Date(finishedAt.getTime() + backoff(attempt)),
              lastErrorCode: result.errorCode,
              lastErrorAt: finishedAt,
            },
      )
      .where(guard)
      .returning({ id: lifecycleOutboxTable.id });
    if (!updated) return;
    await tx.insert(lifecycleDeliveryAttemptsTable).values({
      outboxId: row.id,
      attempt,
      outcome: result.kind,
      errorCode: result.errorCode,
      startedAt,
      finishedAt,
    });
    if (permanent) {
      summary.failed += 1;
      logger.warn(
        { event: "lifecycle_dispatch.failed", outboxId: row.id, eventCode: row.eventCode, attempts: attempt, errorCode: result.errorCode },
        "Lifecycle message failed permanently",
      );
    } else {
      summary.retried += 1;
    }
  });
}

// ---------------------------------------------------------------------------
// Provider receipts and support actions
// ---------------------------------------------------------------------------

export type ReceiptOutcome = "delivered" | "already_delivered" | "unknown";

/**
 * Record a provider delivery receipt. Repeated callbacks for the same
 * provider message id are idempotent; receipts for unknown ids are ignored
 * and reported so a misrouted callback cannot mark anything delivered.
 */
export async function recordDeliveryReceipt(
  providerMessageId: string,
  deliveredAt: Date = new Date(),
): Promise<ReceiptOutcome> {
  const [updated] = await db
    .update(lifecycleOutboxTable)
    .set({ status: "delivered", deliveredAt })
    .where(and(eq(lifecycleOutboxTable.providerMessageId, providerMessageId), eq(lifecycleOutboxTable.status, "accepted")))
    .returning({ id: lifecycleOutboxTable.id });
  if (updated) return "delivered";
  const [existing] = await db
    .select({ status: lifecycleOutboxTable.status })
    .from(lifecycleOutboxTable)
    .where(eq(lifecycleOutboxTable.providerMessageId, providerMessageId))
    .limit(1);
  return existing?.status === "delivered" ? "already_delivered" : "unknown";
}

export type ResendOutcome = "queued" | "not_failed" | "not_found";

/** Support action: put a permanently failed message back in the queue with a fresh retry budget. */
export async function requeueFailedLifecycleMessage(id: number): Promise<ResendOutcome> {
  const [updated] = await db
    .update(lifecycleOutboxTable)
    // Attempts stay monotonic (delivery_attempts is append-only and unique per
    // attempt number); a support resend grants a fresh budget on top instead.
    .set({
      status: "queued",
      maxAttempts: sql`${lifecycleOutboxTable.attempts} + ${DEFAULT_MAX_ATTEMPTS}`,
      nextRetryAt: null,
      failedAt: null,
      lastErrorCode: null,
      claimedAt: null,
    })
    .where(and(eq(lifecycleOutboxTable.id, id), eq(lifecycleOutboxTable.status, "failed")))
    .returning({ id: lifecycleOutboxTable.id });
  if (updated) return "queued";
  const [existing] = await db
    .select({ id: lifecycleOutboxTable.id })
    .from(lifecycleOutboxTable)
    .where(eq(lifecycleOutboxTable.id, id))
    .limit(1);
  return existing ? "not_failed" : "not_found";
}

// ---------------------------------------------------------------------------
// Serialisation (safe for the recipient and for support screens)
// ---------------------------------------------------------------------------

/** User-visible view: status and timing only, plus the business name the message is about. */
export function serialiseLifecycleMessage(row: LifecycleOutboxRow) {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    eventCode: row.eventCode,
    status: row.status,
    locale: row.locale,
    businessName: typeof payload.businessName === "string" ? payload.businessName : null,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Support view adds the error code and recipient reference, still never an address or payload. */
export function serialiseLifecycleMessageForSupport(row: LifecycleOutboxRow) {
  return {
    ...serialiseLifecycleMessage(row),
    recipientUserId: row.recipientUserId,
    lastErrorCode: row.lastErrorCode,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  };
}

export async function listLifecycleMessagesForUser(recipientUserId: number, limit = 50) {
  const rows = await db
    .select()
    .from(lifecycleOutboxTable)
    .where(eq(lifecycleOutboxTable.recipientUserId, recipientUserId))
    .orderBy(sql`${lifecycleOutboxTable.createdAt} desc`, sql`${lifecycleOutboxTable.id} desc`)
    .limit(limit);
  return rows.map(serialiseLifecycleMessage);
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export type LifecycleDispatcherHandle = { stop: () => void };

/**
 * Periodic dispatcher. Runs only when a provider is configured; without one
 * there is nothing to do and rows remain visibly queued.
 */
export function startLifecycleDispatcher(
  env: Record<string, string | undefined> = process.env,
): LifecycleDispatcherHandle | null {
  const { loader, configured, name } = resolveLifecycleDeliveryLoader(env);
  if (!configured) {
    void notConfiguredLoader({} as OutboundLifecycleMessage);
    return null;
  }
  const intervalMs = Math.max(5_000, Number(env.LIFECYCLE_DISPATCH_INTERVAL_MS ?? 60_000) || 60_000);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await dispatchLifecycleOutbox({ deliver: loader });
      if (summary.claimed > 0) {
        logger.info({ event: "lifecycle_dispatch.run", provider: name, ...summary }, "Lifecycle outbox dispatched");
      }
    } catch (error) {
      logger.error({ err: error, event: "lifecycle_dispatch.run_failed" }, "Lifecycle outbox dispatch failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  logger.info({ event: "lifecycle_dispatch.started", provider: name, intervalMs }, "Lifecycle dispatcher started");
  return { stop: () => clearInterval(timer) };
}
