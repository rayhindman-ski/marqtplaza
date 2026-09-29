import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { accountExportsTable, accountRequestEventsTable, accountRequestsTable, appUsersTable, db } from "@workspace/db";
import { requireAppUser } from "../middlewares/requireAppUser";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import { requireRecentAuth, type RecentAuthOptions } from "../lib/recentAuth";
import { downloadAccountExport, expireAccountExports, type ExportArtifactStore } from "../lib/accountExport";
import type { IdentityResolver } from "../lib/permissions";
import { sendApiError } from "../lib/apiError";

export type AccountExportRouterOptions = {
  flags?: FeatureFlagSource;
  resolveIdentity?: IdentityResolver;
  recentAuth?: RecentAuthOptions;
  now?: () => Date;
  store?: ExportArtifactStore;
};

const isId = (id: string): number | null => {
  const value = Number(id);
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(value) ? value : null;
};

export function createAccountExportRouter(options: AccountExportRouterOptions = {}): IRouter {
  const router: IRouter = Router();
  const now = options.now ?? (() => new Date());
  const guarded = [
    (req: Request, res: Response, next: () => void) => {
      if (!(options.flags ?? getFeatureFlags)().accountExport) {
        res.status(503).json({ code: "FEATURE_DISABLED", error: "Account export unavailable" });
        return;
      }
      next();
    },
    requireAppUser({ resolveIdentity: options.resolveIdentity, requireVerified: true }),
  ];
  const own = async (id: number, userId: number) => {
    const [row] = await db.select({ request: accountRequestsTable, artifact: accountExportsTable })
      .from(accountExportsTable).innerJoin(accountRequestsTable, eq(accountRequestsTable.id, accountExportsTable.requestId))
      .where(and(eq(accountRequestsTable.id, id), eq(accountRequestsTable.userId, userId), eq(accountRequestsTable.type, "export"))).limit(1);
    return row;
  };
  const serialise = (row: NonNullable<Awaited<ReturnType<typeof own>>>) => ({
    reference: row.request.id,
    status: row.artifact.status,
    requestedAt: row.request.createdAt.toISOString(),
    availableAt: row.artifact.availableAt?.toISOString() ?? null,
    expiresAt: row.artifact.expiresAt?.toISOString() ?? null,
    downloadedAt: row.artifact.downloadedAt?.toISOString() ?? null,
    downloads: row.artifact.expiresAt && row.artifact.expiresAt > now() &&
      (row.artifact.status === "available" || row.artifact.status === "downloaded")
      ? row.artifact.files.map(file => ({
        file: file.name, size: file.size,
        url: `/api/account/export-requests/${row.request.id}/download?file=${encodeURIComponent(file.name)}`,
      })) : [],
  });

  router.post("/account/export-requests", [...guarded, requireRecentAuth(options.recentAuth)], async (req: Request, res: Response) => {
    if (Object.keys(req.body ?? {}).length || Object.keys(req.query).length) return void sendApiError(req, res, "UNKNOWN_FIELD");
    await expireAccountExports(now(), options.store);
    const userId = req.account!.user.id;
    const result = await db.transaction(async tx => {
      await tx.select({ id: appUsersTable.id }).from(appUsersTable).where(eq(appUsersTable.id, userId)).for("update");
      const open = await tx.select({ requestId: accountExportsTable.requestId, status: accountExportsTable.status, expiresAt: accountExportsTable.expiresAt })
        .from(accountExportsTable).innerJoin(accountRequestsTable, eq(accountRequestsTable.id, accountExportsTable.requestId))
        .where(and(eq(accountRequestsTable.userId, userId), inArray(accountExportsTable.status, ["requested", "preparing", "available", "downloaded"])))
        .orderBy(desc(accountExportsTable.requestId)).limit(1);
      if (open[0] && (open[0].status === "requested" || open[0].status === "preparing" ||
        (open[0].expiresAt !== null && open[0].expiresAt > now())))
        return { reference: open[0].requestId, status: open[0].status };
      const [request] = await tx.insert(accountRequestsTable).values({ userId, scope: "account", type: "export", status: "received" }).returning();
      await tx.insert(accountExportsTable).values({ requestId: request.id, status: "requested" });
      await tx.insert(accountRequestEventsTable).values({ requestId: request.id, fromStatus: null, toStatus: "requested", actor: "requester", createdAt: now() });
      return { reference: request.id, status: "requested" };
    });
    res.status(202).json(result);
  });

  router.get("/account/export-requests", guarded, async (req: Request, res: Response) => {
    const rows = await db.select({ request: accountRequestsTable, artifact: accountExportsTable })
      .from(accountExportsTable).innerJoin(accountRequestsTable, eq(accountRequestsTable.id, accountExportsTable.requestId))
      .where(eq(accountRequestsTable.userId, req.account!.user.id)).orderBy(desc(accountRequestsTable.id)).limit(50);
    res.json({ requests: rows.map(serialise) });
  });
  router.get("/account/export-requests/:id", guarded, async (req: Request, res: Response) => {
    const id = isId(req.params.id as string);
    const row = id && await own(id, req.account!.user.id);
    if (!row) return void sendApiError(req, res, "NOT_FOUND");
    res.json(serialise(row));
  });
  router.get("/account/export-requests/:id/download", guarded, async (req: Request, res: Response) => {
    const id = isId(req.params.id as string);
    const row = id && await own(id, req.account!.user.id);
    if (!row) return void sendApiError(req, res, "NOT_FOUND");
    if (row.artifact.status === "expired" || row.artifact.expiresAt && row.artifact.expiresAt <= now()) {
      await expireAccountExports(now(), options.store);
      return void res.status(410).json({ code: "EXPORT_EXPIRED", error: "Export expired" });
    }
    if (row.artifact.status !== "available" && row.artifact.status !== "downloaded") return void sendApiError(req, res, "NOT_FOUND");
    const file = typeof req.query.file === "string" ? row.artifact.files.find(item => item.name === req.query.file) : null;
    if (!file) return void sendApiError(req, res, "NOT_FOUND");
    const bytes = await downloadAccountExport(file.key, options.store);
    if (row.artifact.status === "available") await db.transaction(async tx => {
      const [updated] = await tx.update(accountExportsTable).set({ status: "downloaded", downloadedAt: now() })
        .where(and(eq(accountExportsTable.id, row.artifact.id), eq(accountExportsTable.status, "available"))).returning();
      if (updated) await tx.insert(accountRequestEventsTable).values({
        requestId: row.request.id, fromStatus: "available", toStatus: "downloaded", actor: "system", createdAt: now(),
      });
    });
    res.setHeader("Content-Type", file.name.endsWith(".zip") ? "application/zip" : file.name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    res.send(bytes);
  });
  return router;
}

export default createAccountExportRouter();