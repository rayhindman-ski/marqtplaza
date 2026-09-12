import { runIsolatedDatabaseIntegration } from "./run-isolated-database-integration.mjs";

await runIsolatedDatabaseIntegration({
  databaseName: "buurtplaza_saved_events_test",
  databaseEnvVar: "SAVED_EVENTS_TEST_DATABASE_URL",
  apiScript: "test:saved-events:integration",
});
