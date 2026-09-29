import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  db, accountRequestsTable, accountRequestEventsTable, accountRequestProcessorOutcomesTable,
  appUsersTable, consumerPreferencesTable, accountLastSearchTable, userRegistrationsTable,
  businessMembersTable, accountExportsTable, lifecycleOutboxTable,
  consumerRegistrationsTable, consumerRegistrationTokensTable,
  savedEventSnapshotsTable, savedEventAlertsTable, savedEventTombstonesTable,
  businessClaimsTable, businessInvitationsTable, businessInvitationTokensTable, businessMemberEventsTable,
  businessMessagesTable, businessProfileRevisionsTable, communityPostsTable, communityPostParticipationTable,
  businessReviewsTable, dealsTable, factChecksTable, listingCorrectionsTable, listingCorrectionReviewsTable,
} from "@workspace/db";
import { appStorage, type ExportArtifactStore } from "./accountExport";
import { enqueueLifecycleMessage } from "./lifecycleOutbox";
import { findSoleOwnedBusinesses } from "./soleOwnership";

export const DELETION_WAIT_MS = 14 * 86_400_000;
/** Shared, inventory-derived policy served to both locales. Never duplicate these values in UI copy. */
export const DELETION_POLICY = {
  waitingDays: 14,
  cutoff: "execution",
  order: ["app_disable", "clerk_sessions", "clerk_user", "app_anonymisation", "processors"] as const,
  categories: {
    deleted: ["consumer_preferences", "account_last_search", "saved_event_snapshots", "saved_event_alerts", "saved_event_tombstones", "business_members", "community_post_participation", "account_export_artifacts"],
    anonymised: ["app_users", "consumer_registrations", "user_registrations", "business_claims", "business_invitations", "business_member_events", "business_profile_revisions", "business_reviews", "business_fact_checks", "business_deals", "listing_corrections", "listing_correction_reviews", "business_messages", "community_posts", "account_requests", "account_request_events", "account_exports", "lifecycle_outbox"],
    retained: ["account_consent_events", "legal_obligation_rows"],
  },
  labels: {
    nl: { waiting: "Je verzoek wordt na 14 dagen uitgevoerd. Je kunt tot het begin van de uitvoering annuleren.", retained: "Bewijs van toestemming, verzoekaudit en wettelijk verplichte gegevens blijven alleen in minimale, geanonimiseerde vorm bewaard." },
    en: { waiting: "Your request is executed after 14 days. You can cancel until execution begins.", retained: "Consent evidence, request audit and legally required records are retained only in minimal, anonymised form." },
  },
};

export type DeletionClerk = {
  sessions: { getSessionList: (params: { userId: string; limit: number; status: "active" }) => Promise<{ data: { id: string }[] }>; revokeSession: (id: string) => Promise<unknown> };
  users: {
    getUser: (id: string) => Promise<{ primaryEmailAddressId?: string | null; emailAddresses: { id: string; emailAddress: string; verification?: { status?: string } | null }[] }>;
    deleteUser: (id: string) => Promise<unknown>;
  };
};
const CLAIM_LEASE_MS = 10 * 60_000;
function isMissingClerkUser(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const response = error as { status?: number; statusCode?: number; errors?: { code?: string }[] };
  return response.status === 404 || response.statusCode === 404 || response.errors?.some(item => item.code === "resource_not_found") === true;
}
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
      ...(to === "completed" ? { resolvedAt: at, resolutionCode: "account_deleted", deletionEmailSnapshot: null } : {}),
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
    const claimToken = randomUUID();
    const claimed = await db.transaction(async tx => {
      const [row] = await tx.update(accountRequestsTable)
        .set({ processingClaimToken: claimToken, processingClaimedAt: at })
        .where(and(eq(accountRequestsTable.id, request.id), eq(accountRequestsTable.status, request.status),
          or(isNull(accountRequestsTable.processingClaimToken), lt(accountRequestsTable.processingClaimedAt, new Date(at.getTime() - CLAIM_LEASE_MS)))))
        .returning();
      if (!row) return false;
      const soleOwned = await findSoleOwnedBusinesses(tx, user.clerkUserId);
      if (soleOwned.length) {
        if (row.status !== "blocked" || row.blockerCode !== "blocked_ownership") {
          await tx.update(accountRequestsTable).set({
            status: "blocked", blockerCode: "blocked_ownership",
            blockerDetails: { businessProfileIds: soleOwned.map(business => business.id) },
            version: sql`${accountRequestsTable.version} + 1`,
          }).where(eq(accountRequestsTable.id, row.id));
          await tx.insert(accountRequestEventsTable).values({
            requestId: row.id, fromStatus: row.status, toStatus: "blocked", actor: "system",
            resolutionCode: "blocked_ownership", createdAt: at,
          });
        }
        await tx.update(accountRequestsTable).set({ processingClaimToken: null, processingClaimedAt: null }).where(eq(accountRequestsTable.id, row.id));
        return false;
      }
      return true;
    });
    if (!claimed) continue;
    try {
    let state = request.status;
    if (state !== "in_progress") {
      const started = await transition(request.id, state, "in_progress", at);
      if (!started) continue;
      state = "in_progress";
    }
    // Persist the verified address before Clerk deletion so a crashed worker
    // can resume without either the Clerk profile or a local app_users.email.
    let email = request.deletionEmailSnapshot;
    if (!email) {
      try {
        const profile = await clerk.users.getUser(user.clerkUserId);
        const verified = profile.emailAddresses.find(address =>
          address.id === profile.primaryEmailAddressId && address.verification?.status === "verified");
        email = verified?.emailAddress.trim().toLowerCase() ?? null;
        if (email) await db.update(accountRequestsTable).set({ deletionEmailSnapshot: email }).where(eq(accountRequestsTable.id, request.id));
      } catch (error) {
        if (!isMissingClerkUser(error)) throw error;
      }
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
      } catch (cause) {
        // Never log provider errors: they can contain addresses, tokens or response bodies.
        const dbCause = cause && typeof cause === "object" && "cause" in cause ? cause.cause : cause;
        const dbCode = processor === "app_db" && dbCause && typeof dbCause === "object" && "code" in dbCause &&
          typeof dbCause.code === "string" && /^[A-Z0-9]{5}$/.test(dbCause.code) ? `_${dbCause.code}` : "";
        await db.update(accountRequestProcessorOutcomesTable).set({ status: "failed", attempts: outcome.attempts + 1, lastErrorCode: `${processor}_failed${dbCode}` })
          .where(eq(accountRequestProcessorOutcomesTable.id, outcome.id));
        await transition(request.id, state, "blocked", at);
        return false;
      }
    };
    if (!await run("clerk", async () => {
      // A page can contain 100 sessions. Re-list until no active sessions remain.
      for (;;) {
        let page;
        try { page = await clerk.sessions.getSessionList({ userId: user.clerkUserId, limit: 100, status: "active" }); }
        catch (error) { if (isMissingClerkUser(error)) break; throw error; }
        if (!page.data.length) break;
        for (const session of page.data) {
          try { await clerk.sessions.revokeSession(session.id); }
          catch (error) { if (!isMissingClerkUser(error)) throw error; }
        }
      }
      try { await clerk.users.deleteUser(user.clerkUserId); }
      catch (error) { if (!isMissingClerkUser(error)) throw error; }
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
        if (email) {
          const pending = await tx.select({ id: consumerRegistrationsTable.id }).from(consumerRegistrationsTable)
            .where(eq(consumerRegistrationsTable.normalizedEmail, email));
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
        const subject = `closed:${user.id}`;
        await tx.update(businessClaimsTable).set({
          claimantId: subject, contactName: "", contactEmail: "", relationship: "",
          evidenceUrl: null, message: null, reviewNote: null, authorityDeclaration: null,
          evidenceReference: null, evidenceKvk: null, evidenceDomain: null, signals: null,
          idempotencyKey: null, idempotencyDigest: null,
        }).where(or(eq(businessClaimsTable.claimantId, user.clerkUserId),
          ...(email ? [eq(businessClaimsTable.contactEmail, email)] : [])));
        await tx.update(businessClaimsTable).set({ reviewedBy: subject, reviewNote: null })
          .where(eq(businessClaimsTable.reviewedBy, user.clerkUserId));
        const invitations = await tx.select({ id: businessInvitationsTable.id }).from(businessInvitationsTable)
          .where(or(eq(businessInvitationsTable.invitedByUserId, user.clerkUserId),
            eq(businessInvitationsTable.acceptedByUserId, user.clerkUserId),
            ...(email ? [eq(businessInvitationsTable.normalizedEmail, email)] : [])));
        if (invitations.length) {
          await tx.update(businessInvitationTokensTable).set({ supersededAt: at })
            .where(inArray(businessInvitationTokensTable.invitationId, invitations.map(row => row.id)));
          await tx.update(businessInvitationsTable).set({
            normalizedEmail: sql`'closed:' || ${user.id}::text || ':' || ${businessInvitationsTable.id}::text`,
            invitedByUserId: subject, acceptedByUserId: null, revokedAt: at,
          }).where(inArray(businessInvitationsTable.id, invitations.map(row => row.id)));
        }
        await tx.update(businessMemberEventsTable).set({ actorUserId: subject })
          .where(eq(businessMemberEventsTable.actorUserId, user.clerkUserId));
        await tx.update(businessMemberEventsTable).set({ targetUserId: subject })
          .where(eq(businessMemberEventsTable.targetUserId, user.clerkUserId));
        await tx.update(businessProfileRevisionsTable).set({ authorUserId: subject, content: {} })
          .where(eq(businessProfileRevisionsTable.authorUserId, user.clerkUserId));
        await tx.update(businessReviewsTable).set({ reviewerUserId: subject, reason: null })
          .where(eq(businessReviewsTable.reviewerUserId, user.clerkUserId));
        await tx.update(factChecksTable).set({ reviewerUserId: subject, note: null })
          .where(eq(factChecksTable.reviewerUserId, user.clerkUserId));
        await tx.update(listingCorrectionsTable).set({ reviewedBy: subject, reviewReason: null })
          .where(eq(listingCorrectionsTable.reviewedBy, user.clerkUserId));
        await tx.update(listingCorrectionReviewsTable).set({ reviewerUserId: subject, reason: null })
          .where(eq(listingCorrectionReviewsTable.reviewerUserId, user.clerkUserId));
        await tx.update(dealsTable).set({ reviewedBy: subject, reviewNote: null })
          .where(eq(dealsTable.reviewedBy, user.clerkUserId));
        await tx.update(businessMembersTable).set({ invitedByUserId: null })
          .where(eq(businessMembersTable.invitedByUserId, user.clerkUserId));
        await tx.delete(communityPostParticipationTable).where(eq(communityPostParticipationTable.userId, user.clerkUserId));
        await tx.update(communityPostsTable).set({
          authorId: subject, title: "[removed]", body: "[removed]", reviewNote: null, reviewedBy: null,
        }).where(eq(communityPostsTable.authorId, user.clerkUserId));
        await tx.update(communityPostsTable).set({ reviewedBy: null, reviewNote: null })
          .where(eq(communityPostsTable.reviewedBy, user.clerkUserId));
        await tx.update(businessMessagesTable).set({
          authorUserId: subject, title: "[removed]", body: "[removed]", reviewNote: null,
        }).where(eq(businessMessagesTable.authorUserId, user.clerkUserId));
        await tx.update(businessMessagesTable).set({ reviewedBy: null, reviewNote: null })
          .where(eq(businessMessagesTable.reviewedBy, user.clerkUserId));
        // Historical messages created before author attribution cannot safely
        // be assigned to an owner merely from business membership.
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
        if (email) await enqueueLifecycleMessage(tx, {
          recipientClerkUserId: user.clerkUserId, recipientEmail: email,
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
    const [mailOutcome] = await db.select().from(accountRequestProcessorOutcomesTable).where(and(
      eq(accountRequestProcessorOutcomesTable.requestId, request.id), eq(accountRequestProcessorOutcomesTable.processor, "mail_provider")));
    if (mailOutcome.status !== "done" && mailOutcome.status !== "skipped") {
      const [notice] = await db.select({ status: lifecycleOutboxTable.status }).from(lifecycleOutboxTable)
        .where(eq(lifecycleOutboxTable.idempotencyKey, `account-deletion:${request.id}:completed`));
      if (!email || notice?.status === "delivered") {
        await db.update(accountRequestProcessorOutcomesTable).set({
          status: email ? "done" : "skipped", attempts: mailOutcome.attempts + 1, lastErrorCode: null, completedAt: at,
        }).where(eq(accountRequestProcessorOutcomesTable.id, mailOutcome.id));
      } else if (!notice || notice.status === "failed" || notice.status === "cancelled") {
        await db.update(accountRequestProcessorOutcomesTable).set({
          status: "failed", attempts: mailOutcome.attempts + 1, lastErrorCode: "mail_provider_failed",
        }).where(eq(accountRequestProcessorOutcomesTable.id, mailOutcome.id));
        await transition(request.id, state, "blocked", at);
        continue;
      } else continue; // queued/accepted is not proof of delivery
    }
    const outcomes = await db.select().from(accountRequestProcessorOutcomesTable).where(eq(accountRequestProcessorOutcomesTable.requestId, request.id));
    if (outcomes.length === processors.length && outcomes.every(row => row.status === "done" || row.status === "skipped")) {
      await db.update(accountRequestsTable).set({ resultReport: DELETION_POLICY.categories }).where(eq(accountRequestsTable.id, request.id));
      await transition(request.id, state, "completed", at);
    }
    } finally {
      await db.update(accountRequestsTable).set({ processingClaimToken: null, processingClaimedAt: null })
        .where(and(eq(accountRequestsTable.id, request.id), eq(accountRequestsTable.processingClaimToken, claimToken)));
    }
  }
}