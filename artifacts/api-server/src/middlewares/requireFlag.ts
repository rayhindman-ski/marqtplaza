import type { NextFunction, Request, RequestHandler, Response } from "express";

import { sendApiError } from "../lib/apiError";
import { getFeatureFlags, type FeatureFlagName, type FeatureFlagSource } from "../lib/featureFlags";

/**
 * Gate an entry point behind a rollout flag. A disabled flag answers 404 with
 * the standard error shape so the surface does not disclose unreleased work.
 */
export function requireFlag(
  flag: FeatureFlagName,
  source: FeatureFlagSource = getFeatureFlags,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!source()[flag]) {
      sendApiError(req, res, "FEATURE_DISABLED");
      return;
    }
    next();
  };
}
