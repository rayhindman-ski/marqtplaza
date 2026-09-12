import { spawnSync } from "node:child_process";
import pg from "pg";

const workspaceRoot = new URL("../../..", import.meta.url);

/**
 * Provision a disposable database from the configured PostgreSQL admin
 * connection, then run one API integration command against that database.
 *
 * The API command receives only the child database URL. It never receives the
 * admin URL, which prevents an unset test target from falling back to the
 * shared development database.
 */
export async function runIsolatedDatabaseIntegration({
  databaseName,
  databaseEnvVar,
  apiScript,
}) {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      `DATABASE_URL is required to provision the ${databaseName} integration database`,
    );
  }

  let testUrl;
  try {
    testUrl = new URL(adminUrl);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL connection URL to provision an integration database",
    );
  }
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
    ["--filter", "@workspace/api-server", "run", apiScript],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        [databaseEnvVar]: testUrl.toString(),
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}