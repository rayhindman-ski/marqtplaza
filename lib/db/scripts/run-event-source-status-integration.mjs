import { runIsolatedDatabaseIntegration } from "./run-isolated-database-integration.mjs";

await runIsolatedDatabaseIntegration({
  databaseName: "buurtplaza_event_source_status_test",
  databaseEnvVar: "EVENT_SOURCE_STATUS_TEST_DATABASE_URL",
  apiScript: "test:event-source-status:integration",
});