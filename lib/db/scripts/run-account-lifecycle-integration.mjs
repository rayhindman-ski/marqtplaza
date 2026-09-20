import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import pg from "pg";

const workspaceRoot = new URL("../../..", import.meta.url);
const adminUrl = process.env.DATABASE_URL;

if (!adminUrl) {
  throw new Error(
    "DATABASE_URL is required to provision an isolated account lifecycle integration database",
  );
}

const databaseName = `buurtplaza_account_lifecycle_${randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: adminUrl });

await admin.connect();
try {
  await admin.query(`create database "${databaseName}"`);

  const result = spawnSync(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "test:account-lifecycle:integration"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ACCOUNT_LIFECYCLE_TEST_DATABASE_URL: testUrl.toString(),
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Account lifecycle integration test failed with exit code ${result.status}`);
  }
} finally {
  await admin.query(
    "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
    [databaseName],
  );
  await admin.query(`drop database if exists "${databaseName}"`);
  await admin.end();
}