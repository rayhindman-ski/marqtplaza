import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import {
  db,
  listingCorrectionsTable,
  listingCorrectionReviewsTable,
  LISTING_CORRECTION_FIELDS,
  type ListingCorrection,
} from "@workspace/db";
import {
  SubmitListingCorrectionResponse,
  SubmitListingCorrectionBody,
  DecideListingCorrectionBody,
  DecideListingCorrectionResponse,
  GetListingCorrectionQueueResponse,
} from "@workspace/api-zod";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import type { IdentityResolver } from "../lib/permissions";
import { requireAppUser } from "../middlewares/requireAppUser";
import { resolveOfferedListing } from "./business-intake";

const BODY_FIELDS = new Set([
  "listingId",
  "fieldKey",
  "proposedValue",
  "explanation",
  "evidenceUrl",
  "locale",
  "consentNoticeVersion",
]);
const CORRECTION_NOTICE_VERSION = "2026-09-18";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function listingCorrectionDigest(path: Record<string, string>, body: unknown): string {
  return createHash("sha256")
    .update(stableStringify({ path, body }))
    .digest("hex");
}

export class GuestCorrectionRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  take(key: string): { allowed: true } | { allowed: false; retryAfter: number } {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((this.windowMs - (now - recent[0]!)) / 1000)),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }
}

export type ListingCorrectionsRouterOptions = {
  resolveListing?: typeof resolveOfferedListing;
  resolveIdentity?: IdentityResolver;
  rateLimit?: { limit: number; windowMs: number };
  now?: () => number;
  noticeVersion?: string;
};

function requireReviewer(req: Request, res: Response, next: () => void): void {
  if (!req.account?.identity.isEditor) {
    sendApiError(req, res, "FORBIDDEN");
    return;
  }
  next();
}

function serializeReviewItem(row: ListingCorrection) {
  return {
    id: row.id,
    receipt: row.receipt,
    cityId: row.cityId,
    listingSource: row.listingSource,
    listingId: row.listingId,
    fieldKey: row.fieldKey,
    proposedValue: row.proposedValue,
    explanation: row.explanation,
    evidenceUrl: row.evidenceUrl,
    locale: row.locale,
    status: row.status,
    version: row.version,
    reason: row.reviewReason,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function receiptResponse(row: ListingCorrection) {
  return SubmitListingCorrectionResponse.parse({
    receipt: row.receipt,
    status: "pending_review",
    cityId: row.cityId,
    listingSource: row.listingSource,
    listingId: row.listingId,
    fieldKey: row.fieldKey,
    submittedAt: row.createdAt.toISOString(),
  });
}

export function createListingCorrectionsRouter(
  options: ListingCorrectionsRouterOptions = {},
): IRouter {
  const limiter = new GuestCorrectionRateLimiter(
    options.rateLimit?.limit ?? 5,
    options.rateLimit?.windowMs ?? 10 * 60_000,
    options.now ?? Date.now,
  );
  const resolveListing = options.resolveListing ?? resolveOfferedListing;
  const noticeVersion = options.noticeVersion ?? CORRECTION_NOTICE_VERSION;
  const router: IRouter = Router();
  const reviewerGuard = [requireAppUser({ resolveIdentity: options.resolveIdentity }), requireReviewer];

  router.get(
    "/listing-corrections/moderation",
    reviewerGuard,
    async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(listingCorrectionsTable)
      .where(eq(listingCorrectionsTable.status, "pending_review"))
      .orderBy(listingCorrectionsTable.createdAt)
      .limit(100);
      res.json(GetListingCorrectionQueueResponse.parse(rows.map(serializeReviewItem)));
    },
  );

  router.post(
    "/listing-corrections/:correctionId/decision",
    reviewerGuard,
    async (req: Request, res: Response): Promise<void> => {
      const fieldErrors = unknownFieldErrors(req.body, new Set(["decision", "expectedVersion", "reason"]));
      if (fieldErrors.length > 0) {
        sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
        return;
      }
      const parsed = DecideListingCorrectionBody.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: parsed.error.issues.map((issue) => ({
            field: issue.path.map(String).join(".") || "body",
            code: issue.code,
          })),
        });
        return;
      }
      const correctionId = Number.parseInt(String(req.params.correctionId ?? ""), 10);
      if (!Number.isInteger(correctionId) || correctionId < 1) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: [{ field: "correctionId", code: "invalid_integer" }],
        });
        return;
      }
      const now = new Date();
      try {
        const updated = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(listingCorrectionsTable)
            .where(eq(listingCorrectionsTable.id, correctionId))
            .for("update");
          if (!current) return "missing" as const;
          if (current.version !== parsed.data.expectedVersion || current.status !== "pending_review") {
            return { conflict: current.version } as const;
          }
          const [row] = await tx
            .update(listingCorrectionsTable)
            .set({
              status: parsed.data.decision === "approve" ? "approved" : "rejected",
              version: current.version + 1,
              reviewedBy: req.account!.identity.userId,
              reviewedAt: now,
              reviewReason: parsed.data.reason?.trim() || null,
            })
            .where(eq(listingCorrectionsTable.id, correctionId))
            .returning();
          if (!row) return "missing" as const;
          await tx.insert(listingCorrectionReviewsTable).values({
            correctionId: row.id,
            // Record the exact version the reviewer inspected, not the
            // post-decision version, so the audit is an immutable snapshot.
            correctionVersion: current.version,
            reviewerUserId: req.account!.identity.userId,
            decision: parsed.data.decision,
            reason: parsed.data.reason?.trim() || null,
          });
          return row;
        });
        if (updated === "missing") {
          sendApiError(req, res, "NOT_FOUND");
          return;
        }
        if ("conflict" in updated) {
          sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: updated.conflict });
          return;
        }
        res.json(DecideListingCorrectionResponse.parse(serializeReviewItem(updated)));
      } catch (error) {
        req.log?.error?.({ err: error }, "Could not decide listing correction");
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
      }
    },
  );

  router.post(
    "/places/:cityId/:listingSource/corrections",
    async (req: Request, res: Response): Promise<void> => {
      const fieldErrors = unknownFieldErrors(req.body, BODY_FIELDS);
      if (fieldErrors.length > 0) {
        sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
        return;
      }

      const params = req.params as Record<string, string>;
      const rawKey = req.header("idempotency-key")?.trim();
      if (!rawKey || rawKey.length < 8 || rawKey.length > 128) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: [{ field: "Idempotency-Key", code: "required_or_invalid_length" }],
        });
        return;
      }
      const parsed = SubmitListingCorrectionBody.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: parsed.error.issues.map((issue) => ({
            field: issue.path.map(String).join(".") || "body",
            code: issue.code,
          })),
        });
        return;
      }
      const input = parsed.data;
      const correctionTarget = { ...params, listingId: input.listingId };
      if (input.consentNoticeVersion !== noticeVersion) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: [{ field: "consentNoticeVersion", code: "stale_notice_version" }],
        });
        return;
      }
      if (!LISTING_CORRECTION_FIELDS.includes(input.fieldKey)) {
        sendApiError(req, res, "VALIDATION_FAILED", {
          fieldErrors: [{ field: "fieldKey", code: "unsupported_field" }],
        });
        return;
      }
      const digest = listingCorrectionDigest(correctionTarget, input);
      const existing = await db
        .select()
        .from(listingCorrectionsTable)
        .where(eq(listingCorrectionsTable.idempotencyKey, rawKey))
        .limit(1);
      if (existing[0]) {
        if (existing[0].idempotencyDigest !== digest) {
          sendApiError(req, res, "IDEMPOTENCY_CONFLICT");
          return;
        }
        res.status(200).json(receiptResponse(existing[0]));
        return;
      }

      const limited = limiter.take(req.ip || req.socket.remoteAddress || "unknown");
      if (!limited.allowed) {
        res.setHeader("Retry-After", String(limited.retryAfter));
        sendApiError(req, res, "RATE_LIMITED");
        return;
      }

      let listing;
      try {
        listing = await resolveListing(params.cityId, params.listingSource, input.listingId);
      } catch (error) {
        req.log?.warn?.({ err: error }, "Could not resolve listing correction target");
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
        return;
      }
      if (!listing || listing.locationId !== params.cityId || listing.id !== input.listingId || listing.source !== params.listingSource) {
        sendApiError(req, res, "NOT_FOUND");
        return;
      }

      const values = {
        receipt: randomUUID(),
        cityId: params.cityId,
        listingSource: params.listingSource,
        listingId: input.listingId,
        fieldKey: input.fieldKey,
        proposedValue: input.proposedValue.trim(),
        explanation: input.explanation?.trim() || null,
        evidenceUrl: input.evidenceUrl?.trim() || null,
        locale: input.locale,
        consentNoticeVersion: input.consentNoticeVersion,
        status: "pending_review" as const,
        idempotencyKey: rawKey,
        idempotencyDigest: digest,
      };
      try {
        const [created] = await db.insert(listingCorrectionsTable).values(values).returning();
        if (!created) throw new Error("Correction insert returned no row");
        res.status(201).json(receiptResponse(created));
      } catch (error) {
        const raced = await db
          .select()
          .from(listingCorrectionsTable)
          .where(eq(listingCorrectionsTable.idempotencyKey, rawKey))
          .limit(1);
        if (raced[0]) {
          if (raced[0].idempotencyDigest !== digest) {
            sendApiError(req, res, "IDEMPOTENCY_CONFLICT");
            return;
          }
          res.status(200).json(receiptResponse(raced[0]));
          return;
        }
        req.log?.error?.({ err: error }, "Could not persist listing correction");
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
      }
    },
  );
  return router;
}

export default createListingCorrectionsRouter();