import { Router, type IRouter } from "express";
import {
  GetSocialMapReviewResponse,
  RunSocialMapReviewResponse,
} from "@workspace/api-zod";
import { requireEditor } from "../middlewares/requireEditor.js";
import {
  getSocialMapReviewReport,
  isSocialMapReviewInProgress,
  runSocialMapReview,
} from "../lib/social-map-review.js";

const router: IRouter = Router();

router.get("/social-map/review", requireEditor, async (_req, res): Promise<void> => {
  res.json(GetSocialMapReviewResponse.parse(await getSocialMapReviewReport()));
});

router.post("/social-map/review", requireEditor, async (req, res): Promise<void> => {
  if (isSocialMapReviewInProgress()) {
    res.status(409).json({ error: "A social-map source review is already in progress." });
    return;
  }

  try {
    const report = await runSocialMapReview();
    req.log.info(
      { successful: report.successful, checks: report.checks.length, snapshotDate: report.snapshotDate },
      "Social-map source review completed",
    );
    res.json(RunSocialMapReviewResponse.parse(report));
  } catch (error) {
    req.log.error({ err: error }, "Social-map source review failed");
    res.status(502).json({
      error: error instanceof Error ? error.message : "The social-map source review failed.",
    });
  }
});

export default router;