import { Router, type IRouter } from "express";
import healthRouter from "./health";
import captureRouter from "./capture";
import listingsRouter from "./listings";
import sourcesRouter from "./sources";
import newsRouter from "./news";
import socialMapReviewRouter from "./social-map-review";
import weatherRouter from "./weather";
import communityPostsRouter from "./community-posts";
import businessesRouter from "./businesses";
import savedEventsRouter from "./saved-events";
import registrationRouter from "./registration";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/capture", captureRouter);
router.use(listingsRouter);
router.use("/sources", sourcesRouter);
router.use(newsRouter);
router.use(socialMapReviewRouter);
router.use(weatherRouter);
router.use(communityPostsRouter);
router.use(businessesRouter);
router.use(savedEventsRouter);
router.use(registrationRouter);

export default router;
