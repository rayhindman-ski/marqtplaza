import { and, eq, lt, sql } from "drizzle-orm";
import { db, lifecycleOutboxTable } from "@workspace/db";
import { purgeExpiredLastSearch } from "./lastSearch";
import { logger } from "./logger";

const DAY_MS = 86_400_000;
/** Export implementation (Phase 4) registers its expiry action here. */
export type ExportExpiryHook = (now: Date) => Promise<void>;

export async function purgeAccountRetention(now = new Date(), expireExports?: ExportExpiryHook): Promise<void> {
  await purgeExpiredLastSearch(now);
  // Never scrub a pending delivery; remove personal body/recipient only once final.
  await db.update(lifecycleOutboxTable).set({ payload: {}, recipientEmail: null })
    .where(and(
      lt(lifecycleOutboxTable.createdAt, new Date(now.getTime() - 30 * DAY_MS)),
      sql`${lifecycleOutboxTable.status} IN ('accepted', 'delivered', 'failed', 'cancelled')`,
      sql`(${lifecycleOutboxTable.recipientEmail} IS NOT NULL OR ${lifecycleOutboxTable.payload} <> '{}'::jsonb)`,
    ));
  await expireExports?.(now);
}

export function startAccountRetentionScheduler(
  intervalMs = 60 * 60_000,
  expireExports?: ExportExpiryHook,
): { stop: () => void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await purgeAccountRetention(new Date(), expireExports); }
    catch (error) { logger.error({ err: error, event: "account.retention.purge_failed" }, "Account retention purge failed"); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  return { stop: () => clearInterval(timer) };
}