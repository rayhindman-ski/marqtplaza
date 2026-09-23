import { clerkClient } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";

import {
  ConsumeConsumerRegistrationLinkBody,
  ConsumeConsumerRegistrationLinkResponse,
  InspectConsumerRegistrationLinkQueryParams,
  InspectConsumerRegistrationLinkResponse,
  RequestConsumerRegistrationBody,
  RequestConsumerRegistrationResponse,
  ResendConsumerRegistrationBody,
  ResendConsumerRegistrationResponse,
} from "@workspace/api-zod";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import {
  AccountLookupUnavailableError,
  canResendFrom,
  createConsumerRegistrationService,
  normalizeEmail,
  normalizeRegistrationInput,
  SlidingWindowLimiter,
  type AccountExistsLookup,
  type ConsumerRegistrationService,
  type LinkState,
} from "../lib/consumerRegistration";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { logger } from "../lib/logger";
import { requireFlag } from "../middlewares/requireFlag";

/**
 * Consumer registration foundation (v0.5.1). Public and unauthenticated; the
 * whole surface is gated by `CONSUMER_REGISTRATION_ENABLED` and answers 404
 * `FEATURE_DISABLED` while off. Every response is neutral about whether an
 * address already has an account or a pending registration (REG-008).
 */

const REQUEST_FIELDS: ReadonlySet<string> = new Set(["name", "email", "phone", "locale", "returnRef"]);
const RESEND_FIELDS: ReadonlySet<string> = new Set(["email", "locale"]);
const VERIFY_FIELDS: ReadonlySet<string> = new Set(["token"]);

/** Default existence check: the identity provider's user list filtered by exact address. */
export const clerkAccountExists: AccountExistsLookup = async (normalizedEmail) => {
  try {
    const page = await clerkClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 1 });
    return page.totalCount > 0 || page.data.length > 0;
  } catch (error) {
    logger.warn({ err: error, event: "consumer_registration.account_lookup_failed" }, "Account lookup at identity provider failed");
    throw new AccountLookupUnavailableError(error);
  }
};

export type ConsumerRegistrationRouterOptions = {
  flags?: FeatureFlagSource;
  service?: ConsumerRegistrationService;
  accountExists?: AccountExistsLookup;
  limiter?: SlidingWindowLimiter;
  now?: () => Date;
  /** Network origin key for the layered limiter; defaults to the proxy-aware request IP. */
  clientKey?: (req: Request) => string;
};

function defaultClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function fieldErrorsFromZod(error: { issues: { path: PropertyKey[]; code: string }[] }) {
  return error.issues.map((issue) => ({ field: issue.path.join(".") || "body", code: issue.code }));
}

function respondRateLimited(req: Request, res: Response, retryAfterMs: number): void {
  res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  sendApiError(req, res, "RATE_LIMITED");
}

function linkStateResponse(state: LinkState) {
  return {
    state: state.state,
    canResend: canResendFrom(state.state),
    ...(state.locale ? { locale: state.locale } : {}),
    ...(state.state === "valid" ? { expiresAt: state.expiresAt } : {}),
  };
}

export function createConsumerRegistrationRouter(options: ConsumerRegistrationRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const flags = options.flags ?? getFeatureFlags;
  const now = options.now ?? (() => new Date());
  const service =
    options.service ??
    createConsumerRegistrationService({ accountExists: options.accountExists ?? clerkAccountExists, now });
  const limiter = options.limiter ?? new SlidingWindowLimiter();
  const clientKey = options.clientKey ?? defaultClientKey;
  const { policy } = service;
  const HOUR = 60 * 60_000;
  const TEN_MINUTES = 10 * 60_000;

  router.use("/consumer-registration", requireFlag("consumerRegistration", flags));

  /**
   * Per-network first, then per-address; both windows expire on their own
   * (SEC-004, SEC-005). The resend cooldown is enforced here, in memory, so a
   * known and an unknown address get the same 429 (REG-008). A repeated first
   * request is not an error for the consumer: it is absorbed by the service.
   */
  function throttleRequest(req: Request, res: Response, email: string, options: { cooldown: boolean }): boolean {
    const at = now().getTime();
    const network = limiter.check(`net:${clientKey(req)}`, policy.perNetworkPerHour, HOUR, at);
    if (!network.allowed) {
      respondRateLimited(req, res, network.retryAfterMs);
      return true;
    }
    if (options.cooldown) {
      const cooldown = limiter.check(`cooldown:${email}`, 1, policy.resendCooldownMs, at);
      if (!cooldown.allowed) {
        respondRateLimited(req, res, cooldown.retryAfterMs);
        return true;
      }
    }
    const budget = limiter.check(`email:${email}`, policy.perEmailPerHour, HOUR, at);
    if (!budget.allowed) {
      respondRateLimited(req, res, budget.retryAfterMs);
      return true;
    }
    return false;
  }

  router.post("/consumer-registration", async (req, res): Promise<void> => {
    const unknown = unknownFieldErrors(req.body, REQUEST_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors: unknown });
      return;
    }
    const parsed = RequestConsumerRegistrationBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: fieldErrorsFromZod(parsed.error) });
      return;
    }
    const normalized = normalizeRegistrationInput(parsed.data);
    if (!normalized.ok) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: normalized.issues });
      return;
    }
    if (throttleRequest(req, res, normalized.value.email, { cooldown: false })) return;

    try {
      await service.expireStale();
      const outcome = await service.submit(normalized.value);
      logger.info(
        { event: "consumer_registration.request", outcome: outcome.kind, reason: "reason" in outcome ? outcome.reason : undefined },
        "Consumer registration request handled",
      );
    } catch (error) {
      if (error instanceof AccountLookupUnavailableError) {
        sendApiError(req, res, "DEPENDENCY_UNAVAILABLE");
        return;
      }
      throw error;
    }
    res.status(202).json(
      RequestConsumerRegistrationResponse.parse({
        status: "accepted",
        linkLifetimeMinutes: Math.round(policy.tokenTtlMs / 60_000),
      }),
    );
  });

  router.post("/consumer-registration/resend", async (req, res): Promise<void> => {
    const unknown = unknownFieldErrors(req.body, RESEND_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors: unknown });
      return;
    }
    const parsed = ResendConsumerRegistrationBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: fieldErrorsFromZod(parsed.error) });
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    if (!email) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: [{ field: "email", code: "invalid" }] });
      return;
    }
    if (throttleRequest(req, res, email, { cooldown: true })) return;

    const outcome = await service.resend(email);
    logger.info(
      { event: "consumer_registration.resend", outcome: outcome.kind, reason: "reason" in outcome ? outcome.reason : undefined },
      "Consumer registration resend handled",
    );
    res.status(202).json(
      ResendConsumerRegistrationResponse.parse({
        status: "accepted",
        linkLifetimeMinutes: Math.round(policy.tokenTtlMs / 60_000),
      }),
    );
  });

  function throttleVerify(req: Request, res: Response): boolean {
    const decision = limiter.check(`verify:${clientKey(req)}`, policy.verifyPerNetworkPerTenMinutes, TEN_MINUTES, now().getTime());
    if (decision.allowed) return false;
    respondRateLimited(req, res, decision.retryAfterMs);
    return true;
  }

  router.get("/consumer-registration/verify", async (req, res): Promise<void> => {
    const parsed = InspectConsumerRegistrationLinkQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.setHeader("Cache-Control", "no-store");
      res.json(InspectConsumerRegistrationLinkResponse.parse({ state: "invalid", canResend: true }));
      return;
    }
    if (throttleVerify(req, res)) return;
    const state = await service.inspect(parsed.data.token);
    res.setHeader("Cache-Control", "no-store");
    res.json(InspectConsumerRegistrationLinkResponse.parse(linkStateResponse(state)));
  });

  router.post("/consumer-registration/verify", async (req, res): Promise<void> => {
    const unknown = unknownFieldErrors(req.body, VERIFY_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors: unknown });
      return;
    }
    const parsed = ConsumeConsumerRegistrationLinkBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: fieldErrorsFromZod(parsed.error) });
      return;
    }
    if (throttleVerify(req, res)) return;
    const state = await service.consume(parsed.data.token);
    res.setHeader("Cache-Control", "no-store");
    res.json(ConsumeConsumerRegistrationLinkResponse.parse(linkStateResponse(state)));
  });

  return router;
}

export default createConsumerRegistrationRouter();
