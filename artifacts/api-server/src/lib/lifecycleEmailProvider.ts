import { createHmac, timingSafeEqual } from "node:crypto";

import { clerkClient } from "@clerk/express";
import { desc, eq } from "drizzle-orm";

import { consumerRegistrationsTable, db, lifecycleOutboxTable } from "@workspace/db";

import { issueRegistrationToken, DEFAULT_CONSUMER_REGISTRATION_POLICY } from "./consumerRegistration";
import { logger } from "./logger";
import type { DeliveryResult, LifecycleDeliveryLoader, OutboundLifecycleMessage } from "./lifecycleOutbox";
import { renderLifecycleEmail, UnknownLifecycleTemplateError } from "./lifecycleTemplates";

/**
 * E-mail delivery for the lifecycle outbox.
 *
 * The outbox row never contains an address. At dispatch time the recipient's
 * current primary e-mail address is looked up at the identity provider, the
 * template is rendered from the allow-listed payload, and the result is handed
 * to a transport. The transport reports the provider's verdict as a
 * `DeliveryResult`; the outbox owns retries and attempt history.
 */

// ---------------------------------------------------------------------------
// Recipient resolution (identity provider, at dispatch time)
// ---------------------------------------------------------------------------

export type ResolvedRecipient = { email: string; locale?: string | null };

export type RecipientResolution =
  | { kind: "found"; recipient: ResolvedRecipient }
  /** The identity provider has no such subject any more; the message can never be delivered. */
  | { kind: "not_found" }
  /** The subject exists but has no verified primary e-mail address. */
  | { kind: "no_address" }
  /** The identity provider could not be reached; retry later. */
  | { kind: "unavailable" };

export type RecipientResolver = (clerkUserId: string) => Promise<RecipientResolution>;

/** Default resolver: the recipient's verified primary e-mail address at Clerk. */
export const clerkRecipientResolver: RecipientResolver = async (clerkUserId) => {
  let user;
  try {
    user = await clerkClient.users.getUser(clerkUserId);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return { kind: "not_found" };
    logger.warn({ err: error, event: "lifecycle_recipient.lookup_failed" }, "Recipient lookup at identity provider failed");
    return { kind: "unavailable" };
  }
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return { kind: "no_address" };
  return { kind: "found", recipient: { email: primary.emailAddress } };
};

// ---------------------------------------------------------------------------
// Registration recipients (pending registration, at dispatch time)
// ---------------------------------------------------------------------------

export type RegistrationRecipientResolution =
  | { kind: "found"; recipient: ResolvedRecipient; templateVars: { registrationUrl: string; linkLifetimeMinutes: number } }
  /** The registration is no longer pending (verified, expired, cancelled, or gone); nothing to send. */
  | { kind: "closed" }
  | { kind: "superseded" }
  /** Link base URL not configured; retry once the operator sets it. */
  | { kind: "not_configured" };

export type RegistrationRecipientResolver = (
  message: Pick<OutboundLifecycleMessage, "id" | "recipientRegistrationId">,
) => Promise<RegistrationRecipientResolution>;

export type RegistrationRecipientResolverOptions = {
  /** Absolute origin of the web app, e.g. `https://buurtplaza.nl`; the link path is fixed. */
  baseUrl: string | null;
  tokenTtlMs?: number;
  now?: () => Date;
};

export const REGISTRATION_LINK_PATH = "/account/register/complete";

export function buildRegistrationLink(baseUrl: string, token: string): string {
  const url = new URL(REGISTRATION_LINK_PATH, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

let registrationLinkNotConfiguredLogged = false;

/**
 * Resolve a pending registration to its address and mint the single-use token
 * for this send. The token is superseded on every later send, so a retried
 * message after an ambiguous provider response leaves exactly one working link.
 */
export function createRegistrationRecipientResolver(
  options: RegistrationRecipientResolverOptions,
): RegistrationRecipientResolver {
  const ttlMs = options.tokenTtlMs ?? DEFAULT_CONSUMER_REGISTRATION_POLICY.tokenTtlMs;
  const now = options.now ?? (() => new Date());
  return async (message) => {
    if (message.recipientRegistrationId === null) return { kind: "closed" };
    if (!options.baseUrl) {
      if (!registrationLinkNotConfiguredLogged) {
        registrationLinkNotConfiguredLogged = true;
        logger.warn(
          { event: "registration_link_base_not_configured" },
          "CONSUMER_REGISTRATION_LINK_BASE_URL is not set; registration emails stay queued",
        );
      }
      return { kind: "not_configured" };
    }
    const at = now();
    return db.transaction(async (tx) => {
      const [registration] = await tx
        .select({
          id: consumerRegistrationsTable.id,
          email: consumerRegistrationsTable.normalizedEmail,
          locale: consumerRegistrationsTable.locale,
          status: consumerRegistrationsTable.status,
          expiresAt: consumerRegistrationsTable.expiresAt,
        })
        .from(consumerRegistrationsTable)
        .where(eq(consumerRegistrationsTable.id, message.recipientRegistrationId as number))
        .limit(1)
        .for("update");
      if (!registration || registration.status !== "pending" || registration.expiresAt.getTime() <= at.getTime()) {
        return { kind: "closed" as const };
      }
      // Only the newest send generation may mint a link. A stale row that is
      // retried after a resend must not supersede the link the consumer was
      // just promised (REG-014: one effective newest link).
      const [newest] = await tx
        .select({ id: lifecycleOutboxTable.id })
        .from(lifecycleOutboxTable)
        .where(eq(lifecycleOutboxTable.recipientRegistrationId, registration.id))
        .orderBy(desc(lifecycleOutboxTable.id))
        .limit(1);
      if (newest && newest.id !== message.id) return { kind: "superseded" as const };
      const issued = await issueRegistrationToken(tx, { registrationId: registration.id, outboxId: message.id, now: at, ttlMs: ttlMs });
      return {
        kind: "found" as const,
        recipient: { email: registration.email, locale: registration.locale },
        templateVars: {
          registrationUrl: buildRegistrationLink(options.baseUrl as string, issued.token),
          linkLifetimeMinutes: Math.round(ttlMs / 60_000),
        },
      };
    });
  };
}

// ---------------------------------------------------------------------------
// Transport contract
// ---------------------------------------------------------------------------

export type OutboundEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  /** Stable across automatic retries of one outbox row; the provider dedupes ambiguous sends with it. */
  idempotencyKey: string;
};

export type EmailTransport = (email: OutboundEmail) => Promise<DeliveryResult>;

export type EmailDeliveryLoaderOptions = {
  senderAddress: string;
  transport: EmailTransport;
  resolveRecipient?: RecipientResolver;
  resolveRegistrationRecipient?: RegistrationRecipientResolver;
  /** Used to build the default registration resolver when none is injected. */
  registrationLinkBaseUrl?: string | null;
};

/**
 * Build a `LifecycleDeliveryLoader` that resolves the recipient, renders the
 * template, and sends through the given transport. Addresses and bodies are
 * never logged; log lines carry row ids and outcome codes only.
 */
export function createEmailDeliveryLoader(options: EmailDeliveryLoaderOptions): LifecycleDeliveryLoader {
  const resolveRecipient = options.resolveRecipient ?? clerkRecipientResolver;
  const resolveRegistrationRecipient =
    options.resolveRegistrationRecipient ??
    createRegistrationRecipientResolver({ baseUrl: options.registrationLinkBaseUrl ?? null });
  return async (message: OutboundLifecycleMessage): Promise<DeliveryResult> => {
    let recipient: ResolvedRecipient;
    let templateVars: Record<string, unknown> = {};
    if (message.recipientRegistrationId !== null) {
      const resolution = await resolveRegistrationRecipient(message);
      if (resolution.kind === "closed") return { kind: "permanent_failure", errorCode: "registration_closed" };
      if (resolution.kind === "superseded") return { kind: "permanent_failure", errorCode: "registration_send_superseded" };
      if (resolution.kind === "not_configured") return { kind: "transient_failure", errorCode: "registration_link_not_configured" };
      recipient = resolution.recipient;
      templateVars = resolution.templateVars;
    } else {
      if (!message.recipientClerkUserId) return { kind: "permanent_failure", errorCode: "recipient_unknown" };
      const resolution = await resolveRecipient(message.recipientClerkUserId);
      if (resolution.kind === "not_found") return { kind: "permanent_failure", errorCode: "recipient_gone" };
      if (resolution.kind === "no_address") return { kind: "permanent_failure", errorCode: "recipient_no_address" };
      if (resolution.kind === "unavailable") return { kind: "transient_failure", errorCode: "identity_provider_unavailable" };
      recipient = resolution.recipient;
    }

    let rendered;
    try {
      // Dispatch-time variables (the registration link) are merged for rendering only; they are never written back to the row.
      rendered = renderLifecycleEmail(message.template, message.locale ?? recipient.locale, { ...message.payload, ...templateVars });
    } catch (error) {
      if (error instanceof UnknownLifecycleTemplateError) {
        return { kind: "permanent_failure", errorCode: "template_unknown" };
      }
      throw error;
    }
    const result = await options.transport({
      to: recipient.email,
      from: options.senderAddress,
      subject: rendered.subject,
      text: rendered.text,
      idempotencyKey: message.dedupeKey,
    });
    logger.info(
      { event: "lifecycle_message.email", outboxId: message.id, eventCode: message.eventCode, locale: rendered.locale, outcome: result.kind },
      "Lifecycle e-mail handed to transport",
    );
    return result;
  };
}

// ---------------------------------------------------------------------------
// Resend transport (https://resend.com/docs/api-reference/emails/send-email)
// ---------------------------------------------------------------------------

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ResendTransportOptions = {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
};

export function createResendTransport(options: ResendTransportOptions): EmailTransport {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(/\/$/, "");
  return async (email) => {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": email.idempotencyKey,
        },
        body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, text: email.text }),
      });
    } catch {
      return { kind: "transient_failure", errorCode: "provider_unreachable" };
    }
    if (response.ok) {
      let id: string | undefined;
      try {
        const body = (await response.json()) as { id?: unknown };
        if (typeof body.id === "string" && body.id.length > 0) id = body.id;
      } catch {
        // An accepted send without a parsable id still counts as accepted; receipts just cannot match it.
      }
      if (!id) {
        logger.warn({ event: "lifecycle_provider.missing_message_id", provider: "resend" }, "Provider accepted without an id");
      }
      return { kind: "accepted", providerMessageId: id };
    }
    const errorCode = `provider_http_${response.status}`;
    if (response.status === 429 || response.status >= 500) return { kind: "transient_failure", errorCode };
    return { kind: "permanent_failure", errorCode };
  };
}

// ---------------------------------------------------------------------------
// Receipt webhook verification (Standard Webhooks / Svix scheme used by Resend)
// ---------------------------------------------------------------------------

export type WebhookHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

export type SignatureVerification =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale_timestamp" | "signature_mismatch" };

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(raw, "base64");
}

/**
 * Verify `svix-id`/`svix-timestamp`/`svix-signature` over the raw body.
 * The signature header may list several versioned signatures; any match passes.
 */
export function verifyWebhookSignature(
  secret: string,
  headers: WebhookHeaders,
  rawBody: Buffer | string,
  now: () => Date = () => new Date(),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): SignatureVerification {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing_headers" };
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp)) return { ok: false, reason: "bad_timestamp" };
  const skew = Math.abs(Math.floor(now().getTime() / 1000) - timestamp);
  if (skew > toleranceSeconds) return { ok: false, reason: "stale_timestamp" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", decodeSecret(secret))
    .update(`${headers.id}.${headers.timestamp}.`)
    .update(body)
    .digest();
  for (const candidate of headers.signature.split(" ")) {
    const [version, value] = candidate.split(",", 2);
    if (version !== "v1" || !value) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

/** Produce the headers a provider would send; used by tests and operator smoke checks. */
export function signWebhookPayload(secret: string, id: string, timestampSeconds: number, rawBody: Buffer | string): WebhookHeaders {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const signature = createHmac("sha256", decodeSecret(secret)).update(`${id}.${timestampSeconds}.`).update(body).digest("base64");
  return { id, timestamp: String(timestampSeconds), signature: `v1,${signature}` };
}

export type ParsedReceipt =
  | { kind: "delivered"; providerMessageId: string; deliveredAt: Date }
  | { kind: "ignored"; eventType: string | null }
  | { kind: "malformed" };

/** Reduce a Resend event to the one fact the outbox cares about: this provider id was delivered. */
export function parseResendReceipt(rawBody: Buffer | string, fallbackNow: () => Date = () => new Date()): ParsedReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    return { kind: "malformed" };
  }
  if (!parsed || typeof parsed !== "object") return { kind: "malformed" };
  const event = parsed as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  const eventType = typeof event.type === "string" ? event.type : null;
  if (eventType !== "email.delivered") return { kind: "ignored", eventType };
  const providerMessageId = event.data?.email_id;
  if (typeof providerMessageId !== "string" || providerMessageId.length === 0) return { kind: "malformed" };
  const createdAt = typeof event.created_at === "string" ? new Date(event.created_at) : null;
  const deliveredAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : fallbackNow();
  return { kind: "delivered", providerMessageId, deliveredAt };
}
