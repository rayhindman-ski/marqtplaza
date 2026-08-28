import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const databaseName = "buurtplaza_saved_events_test";
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const adminUrl = process.env.DATABASE_URL;

if (!adminUrl) {
  throw new Error(
    "DATABASE_URL is required to provision the saved-events test database",
  );
}

const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  const existing = await admin.query(
    "select 1 from pg_database where datname = $1",
    [databaseName],
  );
  if (existing.rowCount === 0) {
    await admin.query(`create database "${databaseName}"`);
  }
} finally {
  await admin.end();
}

const result = spawnSync(
  "pnpm",
  ["--filter", "@workspace/api-server", "run", "test:saved-events:integration"],
  {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      SAVED_EVENTS_TEST_DATABASE_URL: testUrl.toString(),
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
