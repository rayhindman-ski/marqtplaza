import { Router, type IRouter } from "express";
import { GetReadinessResponse, HealthCheckResponse } from "@workspace/api-zod";

import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";

export function createHealthRouter(flags: FeatureFlagSource = getFeatureFlags): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", (_req, res) => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  });

  router.get("/readiness", (_req, res) => {
    res.json(GetReadinessResponse.parse(flags()));
  });

  return router;
}

export default createHealthRouter();
