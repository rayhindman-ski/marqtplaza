import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { ApiError, ApiErrorCode, ApiFieldError } from "@workspace/api-zod";

/**
 * Stable, safe error envelope for account and lifecycle operations.
 *
 * Existing routes keep their `{ error: string }` responses; new operations use
 * this shape so clients can localize by `messageKey` and operators can find
 * the matching log line by `correlationId`. Never put personal data, provider
 * details, or free text from the request into this envelope.
 */

export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  AUTH_REQUIRED: 401,
  EMAIL_UNVERIFIED: 403,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_DELETED: 403,
  FORBIDDEN: 403,
  SELF_REVIEW_FORBIDDEN: 403,
  NOT_FOUND: 404,
  FEATURE_DISABLED: 404,
  VALIDATION_FAILED: 400,
  UNKNOWN_FIELD: 400,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVISIONING_UNAVAILABLE: 503,
  DEPENDENCY_UNAVAILABLE: 503,
};

export const API_ERROR_MESSAGE_KEY: Readonly<Record<ApiErrorCode, string>> = {
  AUTH_REQUIRED: "errors.auth_required",
  EMAIL_UNVERIFIED: "errors.email_unverified",
  ACCOUNT_SUSPENDED: "errors.account_suspended",
  ACCOUNT_DELETED: "errors.account_deleted",
  FORBIDDEN: "errors.forbidden",
  SELF_REVIEW_FORBIDDEN: "errors.self_review_forbidden",
  NOT_FOUND: "errors.not_found",
  FEATURE_DISABLED: "errors.feature_disabled",
  VALIDATION_FAILED: "errors.validation_failed",
  UNKNOWN_FIELD: "errors.unknown_field",
  VERSION_CONFLICT: "errors.version_conflict",
  IDEMPOTENCY_CONFLICT: "errors.idempotency_conflict",
  RATE_LIMITED: "errors.rate_limited",
  PROVISIONING_UNAVAILABLE: "errors.provisioning_unavailable",
  DEPENDENCY_UNAVAILABLE: "errors.dependency_unavailable",
};

export function correlationIdFor(req: Pick<Request, "id"> | undefined): string {
  const id = req?.id;
  if (typeof id === "string" && id) return id;
  if (typeof id === "number") return String(id);
  return randomUUID();
}

export function buildApiError(
  code: ApiErrorCode,
  correlationId: string,
  extra: { fieldErrors?: ApiFieldError[]; expectedVersion?: number } = {},
): ApiError {
  return {
    code,
    messageKey: API_ERROR_MESSAGE_KEY[code],
    correlationId,
    ...(extra.fieldErrors?.length ? { fieldErrors: extra.fieldErrors } : {}),
    ...(extra.expectedVersion !== undefined ? { expectedVersion: extra.expectedVersion } : {}),
  };
}

export function sendApiError(
  req: Pick<Request, "id">,
  res: Response,
  code: ApiErrorCode,
  extra: { fieldErrors?: ApiFieldError[]; expectedVersion?: number } = {},
): void {
  res.status(API_ERROR_STATUS[code]).json(buildApiError(code, correlationIdFor(req), extra));
}

/**
 * Reject bodies or queries that carry fields the operation does not accept.
 * This is how client-submitted `role`, `userId`, or `capabilities` are
 * refused instead of silently ignored (FR-001).
 */
export function unknownFieldErrors(
  payload: unknown,
  allowed: ReadonlySet<string>,
): ApiFieldError[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.keys(payload)
    .filter((key) => !allowed.has(key))
    .map((field) => ({ field, code: "unknown" }));
}
