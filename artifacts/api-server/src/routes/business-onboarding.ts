import { Router, type IRouter } from "express";

import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import { buildIntent, INTENT_FIELDS } from "../lib/businessOnboarding";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { requireFlag } from "../middlewares/requireFlag";

export type BusinessOnboardingRouterOptions = {
  flags?: FeatureFlagSource;
};

/**
 * v0.5.2 business onboarding surface. Every route is behind the
 * `businessOnboarding` gate (BOPS-001) and answers 404 while it is closed.
 */
export function createBusinessOnboardingRouter(options: BusinessOnboardingRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const flags = options.flags ?? getFeatureFlags;

  router.use("/business-onboarding", requireFlag("businessOnboarding", flags));

  router.post("/business-onboarding/intent", (req, res): void => {
    const unknown = unknownFieldErrors(req.body, INTENT_FIELDS);
    if (unknown.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: unknown });
      return;
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const built = buildIntent(body);
    if (!built.ok) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: built.issues });
      return;
    }
    res.json(built.value);
  });

  return router;
}

export default createBusinessOnboardingRouter();
