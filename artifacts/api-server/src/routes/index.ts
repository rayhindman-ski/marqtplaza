import { Router, type IRouter } from "express";
import healthRouter from "./health";
import captureRouter from "./capture";
import listingsRouter from "./listings";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/capture", captureRouter);
router.use(listingsRouter);

export default router;
