import { Storage } from "@google-cloud/storage";
import { zipSync } from "fflate";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  db, appUsersTable, consumerPreferencesTable, accountConsentEventsTable,
  userRegistrationsTable, accountLastSearchTable, businessMembersTable,
  accountRequestsTable, accountRequestEventsTable, lifecycleOutboxTable,
  accountExportsTable,
} from "@workspace/db";
import { notifyUser } from "./lifecycleNotifications";

const storage = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token", type: "external_account",
    credential_source: { url: "http://127.0.0.1:1106/credential", format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
const privatePrefix = () => {
  const parts = (process.env.PRIVATE_OBJECT_DIR ?? "").replace(/^\/|\/$/g, "").split("/");
  if (parts[0] !== process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) throw new Error("Private App Storage bucket mismatch");
  return parts.slice(1).join("/");
};
const bucket = () => {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || !process.env.PRIVATE_OBJECT_DIR)
    throw new Error("Private App Storage is not configured");
  return storage.bucket(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID);
};
const keyFor = (userId: number, requestId: number, name: string) =>
  `${privatePrefix()}/account-exports/${userId}/${requestId}/${name}`;
export const EXPORT_LIFETIME_MS = 72 * 60 * 60 * 1000;
export type ExportArtifactStore = {
  save: (key: string, bytes: Buffer, contentType: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  load: (key: string) => Promise<Buffer>;
};
export const appStorage: ExportArtifactStore = {
  save: async (key, bytes, contentType) => {
    await bucket().file(key).save(bytes, { resumable: false, contentType });
  },
  remove: async key => { await bucket().file(key).delete({ ignoreNotFound: true }); },
  load: async key => (await bucket().file(key).download())[0],
};

/** Explicit projections prevent future token/provider/body columns from leaking into exports. */
export async function buildAccountBundle(userId: number, clerkUserId: string, at: Date) {
  const [profile] = await db.select({
    id: appUsersTable.id, email: appUsersTable.email, locale: appUsersTable.locale,
    status: appUsersTable.status, createdAt: appUsersTable.createdAt,
  }).from(appUsersTable).where(eq(appUsersTable.id, userId));
  if (!profile) throw new Error("Export owner no longer exists");
  const preferences = await db.select().from(consumerPreferencesTable).where(eq(consumerPreferencesTable.userId, userId));
  const consents = await db.select().from(accountConsentEventsTable).where(eq(accountConsentEventsTable.userId, userId)).orderBy(asc(accountConsentEventsTable.id));
  const registrations = await db.select({
    id: userRegistrationsTable.id, name: userRegistrationsTable.name,
    email: userRegistrationsTable.email, registrationType: userRegistrationsTable.registrationType,
    usefulnessRating: userRegistrationsTable.usefulnessRating, referralLikelihood: userRegistrationsTable.referralLikelihood,
    desiredFeatures: userRegistrationsTable.desiredFeatures, createdAt: userRegistrationsTable.createdAt,
  }).from(userRegistrationsTable).where(eq(userRegistrationsTable.userId, clerkUserId));
  const lastSearch = await db.select().from(accountLastSearchTable).where(eq(accountLastSearchTable.userId, userId));
  const memberships = await db.select({
    businessId: businessMembersTable.businessProfileId, role: businessMembersTable.role,
    since: businessMembersTable.createdAt,
  }).from(businessMembersTable).where(eq(businessMembersTable.userId, clerkUserId)).orderBy(asc(businessMembersTable.id));
  const requests = await db.select({
    id: accountRequestsTable.id, type: accountRequestsTable.type,
    status: accountRequestsTable.status, createdAt: accountRequestsTable.createdAt,
    resolvedAt: accountRequestsTable.resolvedAt,
  }).from(accountRequestsTable).where(eq(accountRequestsTable.userId, userId)).orderBy(asc(accountRequestsTable.id));
  const events = requests.length ? await db.select({
    requestId: accountRequestEventsTable.requestId, fromStatus: accountRequestEventsTable.fromStatus,
    toStatus: accountRequestEventsTable.toStatus, actor: accountRequestEventsTable.actor,
    createdAt: accountRequestEventsTable.createdAt,
  }).from(accountRequestEventsTable).where(inArray(accountRequestEventsTable.requestId, requests.map(r => r.id))).orderBy(asc(accountRequestEventsTable.id)) : [];
  const messages = await db.select({
    template: lifecycleOutboxTable.template, sentAt: lifecycleOutboxTable.createdAt,
    status: lifecycleOutboxTable.status,
  }).from(lifecycleOutboxTable).where(eq(lifecycleOutboxTable.recipientUserId, userId)).orderBy(asc(lifecycleOutboxTable.id));
  return {
    schemaVersion: "1", generatedAt: at.toISOString(),
    profile, preferences, consents, registrations, lastSearch, memberships, requests, events, messages,
  };
}

function csv(rows: readonly Record<string, unknown>[]): string {
  if (!rows.length) return "\uFEFF";
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => `"${String(value == null ? "" : typeof value === "object" ? JSON.stringify(value) : value).replace(/"/g, '""')}"`;
  return "\uFEFF" + [columns.join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\r\n") + "\r\n";
}

export async function transitionExport(requestId: number, from: string, to: string, at: Date) {
  return db.transaction(async tx => {
    const [row] = await tx.update(accountExportsTable).set({
      status: to,
      ...(to === "available" ? { availableAt: at, expiresAt: new Date(at.getTime() + EXPORT_LIFETIME_MS) } : {}),
      ...(to === "downloaded" ? { downloadedAt: at } : {}),
    }).where(and(eq(accountExportsTable.requestId, requestId), eq(accountExportsTable.status, from))).returning();
    if (row) await tx.insert(accountRequestEventsTable).values({
      requestId, fromStatus: from, toStatus: to, actor: "system", createdAt: at,
    });
    return row;
  });
}

export async function prepareAccountExports(at = new Date(), store: ExportArtifactStore = appStorage): Promise<void> {
  const pending = await db.select({ requestId: accountExportsTable.requestId, userId: accountRequestsTable.userId, clerkId: appUsersTable.clerkUserId })
    .from(accountExportsTable)
    .innerJoin(accountRequestsTable, eq(accountExportsTable.requestId, accountRequestsTable.id))
    .innerJoin(appUsersTable, eq(accountRequestsTable.userId, appUsersTable.id))
    .where(eq(accountExportsTable.status, "requested")).orderBy(asc(accountExportsTable.requestId)).limit(20);
  for (const item of pending) {
    if (!await transitionExport(item.requestId, "requested", "preparing", at)) continue;
    const uploaded: string[] = [];
    try {
      const bundle = await buildAccountBundle(item.userId, item.clerkId, at);
      const files = Object.entries(bundle).filter(([, value]) => Array.isArray(value)).map(([name, value]) =>
        ({ name: `${name}.csv`, bytes: Buffer.from(csv(value as Record<string, unknown>[]), "utf8") }));
      files.unshift({ name: "bundle.json", bytes: Buffer.from(JSON.stringify(bundle, null, 2), "utf8") });
      files.unshift({ name: "account-export.zip", bytes: Buffer.from(zipSync(
        Object.fromEntries(files.map(file => [file.name, new Uint8Array(file.bytes)])), { level: 6 },
      )) });
      const stored: { name: string; key: string; size: number }[] = [];
      for (const file of files) {
        const key = keyFor(item.userId, item.requestId, file.name);
        await store.save(key, file.bytes, file.name.endsWith(".zip") ? "application/zip" : file.name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/json");
        uploaded.push(key);
        stored.push({ name: file.name, key, size: file.bytes.length });
      }
      await db.transaction(async tx => {
        const [updated] = await tx.update(accountExportsTable).set({
          status: "available", files: stored, storageKey: stored[0].key,
          size: stored.reduce((total, file) => total + file.size, 0),
          availableAt: at, expiresAt: new Date(at.getTime() + EXPORT_LIFETIME_MS),
        }).where(and(eq(accountExportsTable.requestId, item.requestId), eq(accountExportsTable.status, "preparing"))).returning();
        if (!updated) throw new Error("Export preparation lost its claim");
        await tx.insert(accountRequestEventsTable).values({ requestId: item.requestId, fromStatus: "preparing", toStatus: "available", actor: "system", createdAt: at });
        await notifyUser(tx, { clerkUserId: item.clerkId, eventCode: "account.export_ready", idempotencyKey: `account-export:${item.requestId}:ready`, payload: { requestId: item.requestId } });
      });
    } catch (error) {
      await Promise.allSettled(uploaded.map(key => store.remove(key)));
      await transitionExport(item.requestId, "preparing", "failed", at);
      await db.update(accountRequestsTable).set({ status: "rejected", resolvedAt: at })
        .where(eq(accountRequestsTable.id, item.requestId));
    }
  }
}

export async function expireAccountExports(at = new Date(), store: ExportArtifactStore = appStorage): Promise<void> {
  const rows = await db.select().from(accountExportsTable).where(and(inArray(accountExportsTable.status, ["available", "downloaded"]), lte(accountExportsTable.expiresAt, at)));
  for (const row of rows) {
    for (const file of row.files) await store.remove(file.key);
    const oldStatus = row.status;
    await db.transaction(async tx => {
      const [updated] = await tx.update(accountExportsTable).set({ status: "expired", files: [], storageKey: null })
        .where(and(eq(accountExportsTable.id, row.id), eq(accountExportsTable.status, oldStatus))).returning();
      if (updated) await tx.insert(accountRequestEventsTable).values({
        requestId: row.requestId, fromStatus: oldStatus, toStatus: "expired", actor: "system", createdAt: at,
      });
      if (updated) await tx.update(accountRequestsTable).set({ status: "completed", resolvedAt: at })
        .where(eq(accountRequestsTable.id, row.requestId));
    });
  }
}

export async function downloadAccountExport(key: string, store: ExportArtifactStore = appStorage): Promise<Buffer> {
  return store.load(key);
}