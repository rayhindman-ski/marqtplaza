import { clerkClient } from "@clerk/express";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db, accountRequestsTable, accountRequestEventsTable, accountRequestProcessorOutcomesTable,
  appUsersTable, consumerPreferencesTable, accountLastSearchTable, userRegistrationsTable,
  businessMembersTable, accountExportsTable, lifecycleOutboxTable,
  consumerRegistrationsTable, consumerRegistrationTokensTable,
  savedEventSnapshotsTable, savedEventAlertsTable, savedEventTombstonesTable,
} from "@workspace/db";
import { appStorage, type ExportArtifactStore } from "./accountExport";
import { enqueueLifecycleMessage } from "./lifecycleOutbox";

export const DELETION_WAIT_MS = 14 * 86_400_000;
/** Shared, inventory-derived policy served to both locales. Never duplicate these values in UI copy. */
export const DELETION_POLICY = {
  waitingDays: 14,
  cutoff: "execution",
  order: ["app_disable", "clerk_sessions", "clerk_user", "app_anonymisation", "processors"] as const,
  categories: {
    deleted: ["consumer_preferences", "account_last_search", "saved_event_snapshots", "saved_event_alerts", "saved_event_tombstones", "business_members", "account_export_artifacts"],
    anonymised: ["app_users", "consumer_registrations", "user_registrations", "account_requests", "account_request_events", "account_exports", "lifecycle_outbox"],
    retained: ["account_consent_events", "legal_obligation_rows"],
  },
  labels: {
    nl: { waiting: "Je verzoek wordt na 14 dagen uitgevoerd. Je kunt tot het begin van de uitvoering annuleren.", retained: "Bewijs van toestemming, verzoekaudit en wettelijk verplichte gegevens blijven alleen in minimale, geanonimiseerde vorm bewaard." },
    en: { waiting: "Your request is executed after 14 days. You can cancel until execution begins.", retained: "Consent evidence, request audit and legally required records are retained only in minimal, anonymised form." },
  },
};

export type DeletionClerk = {
  sessions: { getSessionList: (params: { userId: string; limit: number; status: "active" }) => Promise<{ data: { id: string }[] }>; revokeSession: (id: string) => Promise<unknown> };
  users: { deleteUser: (id: string) => Promise<unknown> };
};
const processors = ["clerk", "app_db", "object_storage", "mail_provider"] as const;
const transitions: Record<string, readonly string[]> = {
  received: ["in_progress"], in_review: ["in_progress"], in_progress: ["blocked", "completed"],
  blocked: ["in_progress"], completed: [], rejected: [], withdrawn: [],
};
export function assertDeletionTransition(from: string, to: string): void {
  if (!transitions[from]?.includes(to)) throw new Error(`Invalid deletion transition ${from} -> ${to}`);
}

async function transition(id: number, from: string, to: string, at: Date) {
  assertDeletionTransition(from, to);
  const [updated] = await db.transaction(async tx => {
    const [row] = await tx.update(accountRequestsTable).set({
      status: to, version: sql`${accountRequestsTable.version} + 1`,
      ...(to === "completed" ? { resolvedAt: at, resolutionCode: "account_deleted" } : {}),
    }).where(and(eq(accountRequestsTable.id, id), eq(accountRequestsTable.status, from))).returning();
    if (row) await tx.insert(accountRequestEventsTable).values({ requestId: id, fromStatus: from, toStatus: to, actor: "system", createdAt: at });
    return [row];
  });
  return updated;
}

export async function executeAccountDeletions(
  at: Date = new Date(),
  clerk: DeletionClerk = clerkClient as unknown as DeletionClerk,
  store: ExportArtifactStore = appStorage,
): Promise<void> {
  const due = await db.select({ request: accountRequestsTable, user: appUsersTable })
    .from(accountRequestsTable).innerJoin(appUsersTable, eq(accountRequestsTable.userId, appUsersTable.id))
    .where(and(eq(accountRequestsTable.type, "deletion"), lte(accountRequestsTable.scheduledFor, at),
      inArray(accountRequestsTable.status, ["received", "in_review", "in_progress", "blocked"])))
    .orderBy(asc(accountRequestsTable.id)).limit(20);
  for (const { request, user } of due) {
    // An unresolved sole-owner blocker is not a retryable processor failure.
    if (request.blockerCode === "blocked_ownership" && request.status === "blocked") {
      const [attempt] = await db.select({ id: accountRequestProcessorOutcomesTable.id })
        .from(accountRequestProcessorOutcomesTable).where(eq(accountRequestProcessorOutcomesTable.requestId, request.id)).limit(1);
      if (!attempt) continue;
    }
    let state = request.status;
    if (state !== "in_progress") {
      const claimed = await transition(request.id, state, "in_progress", at);
      if (!claimed) continue;
      state = "in_progress";
    }
    await db.update(appUsersTable).set({ status: "deleted", closedAt: at }).where(and(eq(appUsersTable.id, user.id), eq(appUsersTable.status, "active")));
    for (const processor of processors) await db.insert(accountRequestProcessorOutcomesTable)
      .values({ requestId: request.id, processor }).onConflictDoNothing();

    const run = async (processor: typeof processors[number], action: () => Promise<void>) => {
      const [outcome] = await db.select().from(accountRequestProcessorOutcomesTable).where(and(
        eq(accountRequestProcessorOutcomesTable.requestId, request.id), eq(accountRequestProcessorOutcomesTable.processor, processor)));
      if (outcome.status === "done" || outcome.status === "skipped") return true;
      try {
        await action();
        await db.update(accountRequestProcessorOutcomesTable).set({ status: "done", attempts: outcome.attempts + 1, lastErrorCode: null, completedAt: at })
          .where(eq(accountRequestProcessorOutcomesTable.id, outcome.id));
        return true;
      } catch {
        // Never log provider errors: they can contain addresses, tokens or response bodies.
        await db.update(accountRequestProcessorOutcomesTable).set({ status: "failed", attempts: outcome.attempts + 1, lastErrorCode: `${processor}_failed` })
          .where(eq(accountRequestProcessorOutcomesTable.id, outcome.id));
        await transition(request.id, state, "blocked", at);
        return false;
      }
    };
    if (!await run("clerk", async () => {
      // A page can contain 100 sessions. Re-list until no active sessions remain.
      for (;;) {
        const page = await clerk.sessions.getSessionList({ userId: user.clerkUserId, limit: 100, status: "active" });
        if (!page.data.length) break;
        for (const session of page.data) await clerk.sessions.revokeSession(session.id);
      }
      await clerk.users.deleteUser(user.clerkUserId);
    })) continue;
    if (!await run("app_db", async () => {
      await db.transaction(async tx => {
        // Keep the unique Clerk subject on the tombstone; a different Clerk id creates a new row.
        await tx.update(appUsersTable).set({ email: null, locale: "nl", emailChangePendingAt: null, status: "deleted", closedAt: at })
          .where(eq(appUsersTable.id, user.id));
        await tx.delete(consumerPreferencesTable).where(eq(consumerPreferencesTable.userId, user.id));
        await tx.delete(accountLastSearchTable).where(eq(accountLastSearchTable.userId, user.id));
        await tx.delete(savedEventSnapshotsTable).where(eq(savedEventSnapshotsTable.userId, user.clerkUserId));
        await tx.delete(savedEventAlertsTable).where(eq(savedEventAlertsTable.userId, user.clerkUserId));
        await tx.delete(savedEventTombstonesTable).where(eq(savedEventTombstonesTable.userId, user.clerkUserId));
        if (user.email) {
          const pending = await tx.select({ id: consumerRegistrationsTable.id }).from(consumerRegistrationsTable)
            .where(eq(consumerRegistrationsTable.normalizedEmail, user.email.toLowerCase()));
          if (pending.length) {
            await tx.update(consumerRegistrationTokensTable).set({ supersededAt: at })
              .where(inArray(consumerRegistrationTokensTable.registrationId, pending.map(row => row.id)));
            await tx.update(consumerRegistrationsTable).set({
              status: "cancelled", name: "", normalizedPhone: "", normalizedEmail: `closed:${user.id}`,
              returnRef: null, cancelledAt: at,
            }).where(inArray(consumerRegistrationsTable.id, pending.map(row => row.id)));
          }
        }
        await tx.update(userRegistrationsTable).set({ name: "", email: "", desiredFeatures: null })
          .where(eq(userRegistrationsTable.userId, user.clerkUserId));
        await tx.delete(businessMembersTable).where(eq(businessMembersTable.userId, user.clerkUserId));
        const owned = await tx.select({ id: accountRequestsTable.id }).from(accountRequestsTable).where(eq(accountRequestsTable.userId, user.id));
        if (owned.length) {
          const ids = owned.map(row => row.id);
          await tx.update(accountRequestsTable).set({ resolutionNote: null, resolvedByUserId: null })
            .where(inArray(accountRequestsTable.id, ids));
          await tx.update(accountRequestEventsTable).set({ note: null, actorUserId: null })
            .where(inArray(accountRequestEventsTable.requestId, ids));
        }
        await tx.update(lifecycleOutboxTable).set({ recipientEmail: null, payload: {} })
          .where(eq(lifecycleOutboxTable.recipientUserId, user.id));
        if (user.email) await enqueueLifecycleMessage(tx, {
          recipientClerkUserId: user.clerkUserId, recipientEmail: user.email,
          locale: user.locale,
          eventCode: "account.deletion_completed", idempotencyKey: `account-deletion:${request.id}:completed`,
          payload: { requestId: request.id },
        });
      });
    })) continue;
    if (!await run("object_storage", async () => {
      const exports = await db.select().from(accountExportsTable).innerJoin(accountRequestsTable, eq(accountExportsTable.requestId, accountRequestsTable.id))
        .where(eq(accountRequestsTable.userId, user.id));
      for (const entry of exports) {
        for (const file of entry.account_exports.files) await store.remove(file.key);
        await db.update(accountExportsTable).set({ files: [], storageKey: null, status: "expired" }).where(eq(accountExportsTable.id, entry.account_exports.id));
      }
    })) continue;
    if (!await run("mail_provider", async () => {
      // The app-db transaction durably queued the one-time address snapshot.
      // It remains only in that pending notice until delivery/retention purge.
      const [notice] = await db.select({ id: lifecycleOutboxTable.id }).from(lifecycleOutboxTable)
        .where(eq(lifecycleOutboxTable.idempotencyKey, `account-deletion:${request.id}:completed`));
      if (user.email && !notice) throw new Error("Completion notice missing");
    })) continue;
    const outcomes = await db.select().from(accountRequestProcessorOutcomesTable).where(eq(accountRequestProcessorOutcomesTable.requestId, request.id));
    if (outcomes.length === processors.length && outcomes.every(row => row.status === "done" || row.status === "skipped")) {
      await db.update(accountRequestsTable).set({ resultReport: DELETION_POLICY.categories }).where(eq(accountRequestsTable.id, request.id));
      await transition(request.id, state, "completed", at);
    }
  }
}