import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import {
  normalizedListingsKey,
  parseBusinessCategories,
  refreshNeighborhoodDiscoveryScope,
  type NeighborhoodRefreshScope,
} from "../routes/listings.js";

const REFRESH_CADENCE_MS = 12 * 60 * 60 * 1_000;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1_000;
const MAX_SCOPES_PER_RUN = 20;
let schedulerStarted = false;
let refreshRun: Promise<void> | undefined;

interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

interface RefreshClaim {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
}

type Query = (text: string, values?: unknown[]) => Promise<QueryResult>;
type Connect = () => Promise<RefreshClaim>;

const query: Query = async (text, values) => {
  const result = await pool.query(text, values);
  return { rows: result.rows };
};

const connect: Connect = async () => {
  const client = await pool.connect();
  return {
    query: async (text, values) => {
      const result = await client.query(text, values);
      return { rows: result.rows };
    },
    release: () => client.release(),
  };
};

export function selectEligibleRefreshScopes(
  rows: Array<{
    cityId: string;
    section: string;
    language: string;
    neighborhoods: unknown;
    normalizedKey: string;
  }>,
): NeighborhoodRefreshScope[] {
  const scopes = new Map<string, NeighborhoodRefreshScope>();
  for (const row of rows) {
    if (scopes.has(row.normalizedKey)) continue;
    if (row.section !== "businesses" && row.section !== "food-drink") continue;
    if (row.language !== "nl" && row.language !== "en") continue;
    const neighborhoods = Array.isArray(row.neighborhoods)
      ? row.neighborhoods.filter((value): value is string => typeof value === "string")
      : [];
    let normalizedKey = row.normalizedKey;
    try {
      const keyFields = JSON.parse(row.normalizedKey) as { businessCategories?: unknown };
      normalizedKey = normalizedListingsKey(
        row.cityId,
        row.section as "businesses" | "food-drink",
        row.language as "nl" | "en",
        neighborhoods,
        row.section === "businesses" ? parseBusinessCategories(keyFields.businessCategories) : [],
      );
    } catch {
      // Keep test and legacy rows unchanged; refreshNeighborhoodDiscoveryScope validates them.
    }
    scopes.set(normalizedKey, {
      cityId: row.cityId,
      section: row.section,
      language: row.language,
      neighborhoods,
      normalizedKey,
    });
  }
  return [...scopes.values()];
}

export async function loadEligibleRefreshScopes(
  cutoff: Date,
  executeQuery: Query = query,
): Promise<NeighborhoodRefreshScope[]> {
  const result = await executeQuery(`
    select
      latest.city_id as "cityId",
      latest.section,
      latest.language,
      latest.neighborhoods,
      latest.normalized_key as "normalizedKey"
    from (
      select distinct on (normalized_key)
        city_id, section, language, neighborhoods, normalized_key, created_at
      from "user-queries"
      where mode = 'live'
        and status in ('succeeded', 'partial')
        and city_id = 'dhg'
        and section in ('businesses', 'food-drink')
      order by normalized_key, created_at desc
    ) latest
    where latest.created_at < $1
    order by latest.created_at asc
    limit $2
  `, [cutoff, MAX_SCOPES_PER_RUN]);
  return selectEligibleRefreshScopes(result.rows.map((row) => ({
    cityId: String(row["cityId"] ?? ""),
    section: String(row["section"] ?? ""),
    language: String(row["language"] ?? ""),
    neighborhoods: row["neighborhoods"],
    normalizedKey: String(row["normalizedKey"] ?? ""),
  })));
}

export async function refreshEligibleScopes(
  scopes: NeighborhoodRefreshScope[],
  cutoff: Date,
  acquireConnection: Connect = connect,
  refreshScope: typeof refreshNeighborhoodDiscoveryScope = refreshNeighborhoodDiscoveryScope,
): Promise<void> {
  for (const scope of scopes) {
    const claim = await acquireConnection();
    try {
      const lock = await claim.query(
        "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
        [`buurtplaza:discovery:${scope.normalizedKey}`],
      );
      if (lock.rows[0]?.["acquired"] !== true) continue;
      const fresh = await claim.query(`
        select 1
        from "user-queries"
        where normalized_key = $1
          and mode = 'live'
          and status in ('succeeded', 'partial')
          and created_at >= $2
        limit 1
      `, [scope.normalizedKey, cutoff]);
      if (fresh.rows.length > 0) continue;
      try {
        const result = await refreshScope(scope);
        logger.info({ normalizedKey: scope.normalizedKey, ...result }, "Neighborhood discovery scope refreshed");
      } catch (error) {
        logger.warn({ err: error, normalizedKey: scope.normalizedKey }, "Neighborhood discovery scope refresh failed");
      }
    } finally {
      try {
        await claim.query(
          "select pg_advisory_unlock(hashtextextended($1, 0))",
          [`buurtplaza:discovery:${scope.normalizedKey}`],
        );
      } finally {
        claim.release();
      }
    }
  }
}

export async function runNeighborhoodDiscoveryRefresh(): Promise<void> {
  if (refreshRun) return refreshRun;
  refreshRun = (async () => {
    const cutoff = new Date(Date.now() - REFRESH_CADENCE_MS);
    const scopes = await loadEligibleRefreshScopes(cutoff);
    await refreshEligibleScopes(scopes, cutoff);
  })().finally(() => {
    refreshRun = undefined;
  });
  return refreshRun;
}

export async function runScheduledNeighborhoodDiscoveryRefresh(
  run: () => Promise<void> = runNeighborhoodDiscoveryRefresh,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.warn({ err: error }, "Neighborhood discovery scheduler run failed");
  }
}

export function startNeighborhoodDiscoveryScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const timer = setInterval(() => {
    void runScheduledNeighborhoodDiscoveryRefresh();
  }, SCHEDULER_INTERVAL_MS);
  timer.unref();
  void runScheduledNeighborhoodDiscoveryRefresh();
}