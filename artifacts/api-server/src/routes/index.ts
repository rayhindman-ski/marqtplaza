import { Router, type IRouter } from "express";
import healthRouter from "./health";
import captureRouter from "./capture";
import listingsRouter from "./listings";
import sourcesRouter from "./sources";
import newsRouter from "./news";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/capture", captureRouter);
router.use(listingsRouter);
router.use("/sources", sourcesRouter);
router.use(newsRouter);

export default router;
