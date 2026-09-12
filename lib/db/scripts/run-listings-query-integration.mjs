import { runIsolatedDatabaseIntegration } from "./run-isolated-database-integration.mjs";

await runIsolatedDatabaseIntegration({
  databaseName: "buurtplaza_listings_query_test",
  databaseEnvVar: "LISTINGS_TEST_DATABASE_URL",
  apiScript: "test:listings-query:integration",
});