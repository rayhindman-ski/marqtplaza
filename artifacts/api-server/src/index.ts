import app from "./app";
import { logger } from "./lib/logger";
import { ensureSocialMapReviewStorage, startSocialMapReviewScheduler } from "./lib/social-map-review";
import { ensureNewsSourceStatusStorage, startNewsSourceScheduler } from "./routes/news";
import { ensureEventSourceStatusStorage, startEventSourceScheduler } from "./routes/sources";
import { startNeighborhoodDiscoveryScheduler } from "./lib/neighborhood-discovery-refresh";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  await ensureNewsSourceStatusStorage();
  await ensureEventSourceStatusStorage();
  await ensureSocialMapReviewStorage();
  startNewsSourceScheduler();
  startEventSourceScheduler();
  startSocialMapReviewScheduler();
  startNeighborhoodDiscoveryScheduler();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer().catch((err: unknown) => {
  logger.error({ err }, "Could not provision scheduled source storage");
  process.exit(1);
});
