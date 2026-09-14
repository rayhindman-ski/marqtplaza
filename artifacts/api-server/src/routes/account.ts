import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import {
  accountConsentEventsTable,
  appUsersTable,
  consumerPreferencesTable,
  db,
  type AccountConsentEvent,
  type AppUser,
  type ConsumerPreferences,
} from "@workspace/db";
import {
  CompleteAccountOnboardingResponse,
  GetAccountConsentsResponse,
  GetAccountMeResponse,
  GetAccountOptionsResponse,
  RecordAccountConsentBody,
  RecordAccountConsentResponse,
  UpdateAccountPreferencesBody,
  UpdateAccountPreferencesResponse,
  type ApiFieldError,
  type ConsentPurpose,
} from "@workspace/api-zod";

import { getAccountOptions, isKnownInterestId, isKnownNeighborhoodId } from "../lib/accountOptions";
import { sendApiError, unknownFieldErrors } from "../lib/apiError";
import { getFeatureFlags, type FeatureFlagSource } from "../lib/featureFlags";
import {
  countBusinessMemberships,
  deriveCapabilities,
  deriveRole,
  type IdentityResolver,
} from "../lib/permissions";
import { requireAppUser, type AccountContext } from "../middlewares/requireAppUser";
import { requireFlag } from "../middlewares/requireFlag";
import { hasUserRegistration } from "./registration";

export type AccountRouterOptions = {
  resolveIdentity?: IdentityResolver;
  flags?: FeatureFlagSource;
};

/** Read-only operations accept no body or query fields at all. */
const NO_FIELDS: ReadonlySet<string> = new Set();
const PREFERENCE_FIELDS: ReadonlySet<string> = new Set([
  "expectedRevision",
  "locale",
  "neighborhoodIds",
  "interestIds",
]);
const CONSENT_FIELDS: ReadonlySet<string> = new Set([
  "consentType",
  "noticeVersion",
  "granted",
  "source",
]);

/**
 * Version of the consent notice text shown to users. Release gate Q6 (legal)
 * replaces this draft value; until then the accounts flag stays off. Clients
 * must echo the version they displayed so a choice is never recorded against
 * text the user has not seen.
 */
export const CONSENT_NOTICE_VERSION = "draft-2026-09";
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = ["marketing_updates", "research_contact"];

function rejectClientFields(
  req: Request,
  res: Response,
  allowedBodyFields: ReadonlySet<string> = NO_FIELDS,
): boolean {
  const fieldErrors = [
    ...unknownFieldErrors(req.body, allowedBodyFields),
    ...unknownFieldErrors(req.query, NO_FIELDS),
  ];
  if (fieldErrors.length === 0) return false;
  sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
  return true;
}

/** Mutations need a verified identity; reads only need an active account. */
function rejectUnverified(req: Request, res: Response): boolean {
  if (req.account!.identity.emailVerified) return false;
  sendApiError(req, res, "EMAIL_UNVERIFIED");
  return true;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function controlledListErrors(
  field: "neighborhoodIds" | "interestIds",
  ids: string[],
  isKnown: (id: string) => boolean,
): ApiFieldError[] {
  return ids
    .filter((id) => !isKnown(id))
    .map((id) => ({ field: `${field}.${id}`, code: "not_in_controlled_list" }));
}

function serialiseConsentEvent(event: AccountConsentEvent) {
  return {
    id: event.id,
    consentType: event.consentType,
    noticeVersion: event.noticeVersion,
    granted: event.granted,
    source: event.source as "onboarding" | "account_settings" | "support" | "system",
    createdAt: event.createdAt.toISOString(),
  };
}

/** Newest history entries returned per response; current state never depends on this page. */
const CONSENT_HISTORY_PAGE = 200;

async function buildAccountConsents(userId: number) {
  // Newest first so the page always contains the entry that was just appended;
  // `current` is derived from the newest row per purpose regardless of the page.
  const newestFirst = await db
    .select()
    .from(accountConsentEventsTable)
    .where(eq(accountConsentEventsTable.userId, userId))
    .orderBy(desc(accountConsentEventsTable.createdAt), desc(accountConsentEventsTable.id))
    .limit(CONSENT_HISTORY_PAGE);
  const latestRows = await db
    .selectDistinctOn([accountConsentEventsTable.consentType])
    .from(accountConsentEventsTable)
    .where(eq(accountConsentEventsTable.userId, userId))
    .orderBy(
      accountConsentEventsTable.consentType,
      desc(accountConsentEventsTable.createdAt),
      desc(accountConsentEventsTable.id),
    );
  const latest = new Map<string, AccountConsentEvent>();
  for (const event of latestRows) latest.set(event.consentType, event);
  const history = [...newestFirst].reverse();
  return {
    currentNoticeVersion: CONSENT_NOTICE_VERSION,
    purposes: [...CONSENT_PURPOSES],
    current: CONSENT_PURPOSES.flatMap((purpose) => {
      const event = latest.get(purpose);
      if (!event) return [];
      return [{
        consentType: purpose,
        granted: event.granted,
        noticeVersion: event.noticeVersion,
        recordedAt: event.createdAt.toISOString(),
      }];
    }),
    history: history.map(serialiseConsentEvent),
  };
}

function serialisePreferences(preferences: ConsumerPreferences | undefined) {
  if (!preferences) return null;
  const options = getAccountOptions();
  const neighborhoodIds = new Set(options.neighborhoods.map((option) => option.id));
  const interestIds = new Set(options.interests.map((option) => option.id));
  return {
    revision: preferences.revision,
    neighborhoodIds: preferences.neighborhoodIds,
    interestIds: preferences.interestIds,
    unresolvedNeighborhoodIds: preferences.neighborhoodIds.filter((id) => !neighborhoodIds.has(id)),
    unresolvedInterestIds: preferences.interestIds.filter((id) => !interestIds.has(id)),
    updatedAt: preferences.updatedAt.toISOString(),
  };
}

export async function buildAccountMe(
  account: AccountContext,
  flags: FeatureFlagSource,
) {
  const user: AppUser = account.user;
  const [businessMembershipCount, hasResearchRegistration, [preferences]] = await Promise.all([
    countBusinessMemberships(account.identity.userId),
    hasUserRegistration(account.identity.userId),
    db
      .select()
      .from(consumerPreferencesTable)
      .where(eq(consumerPreferencesTable.userId, user.id))
      .limit(1),
  ]);
  const capabilityInput = {
    identity: account.identity,
    user,
    businessMembershipCount,
    flags: flags(),
  };
  return {
    id: user.id,
    status: user.status,
    role: deriveRole(capabilityInput),
    locale: user.locale,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    capabilities: deriveCapabilities(capabilityInput),
    hasResearchRegistration,
    businessMembershipCount,
    preferences: serialisePreferences(preferences),
    createdAt: user.createdAt.toISOString(),
  };
}

export function createAccountRouter(options: AccountRouterOptions = {}): IRouter {
  const flags = options.flags ?? getFeatureFlags;
  const router: IRouter = Router();

  router.use("/account", requireFlag("accounts", flags));
  router.use("/account", requireAppUser({ resolveIdentity: options.resolveIdentity }));

  router.get("/account/me", async (req, res): Promise<void> => {
    if (rejectClientFields(req, res)) return;
    const account = req.account!;
    const me = await buildAccountMe(account, flags);
    req.log?.info?.({ event: "account.me", accountId: account.user.id }, "Account summary served");
    res.json(GetAccountMeResponse.parse(me));
  });

  router.get("/account/options", (req, res): void => {
    if (rejectClientFields(req, res)) return;
    res.json(GetAccountOptionsResponse.parse(getAccountOptions()));
  });

  router.patch("/account/preferences", async (req, res): Promise<void> => {
    if (rejectClientFields(req, res, PREFERENCE_FIELDS)) return;
    if (rejectUnverified(req, res)) return;
    const account = req.account!;
    const parsed = UpdateAccountPreferencesBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
        })),
      });
      return;
    }
    const input = parsed.data;
    if (!Number.isInteger(input.expectedRevision)) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: [{ field: "expectedRevision", code: "invalid_type" }],
      });
      return;
    }
    const neighborhoodIds = input.neighborhoodIds ? uniqueIds(input.neighborhoodIds) : undefined;
    const interestIds = input.interestIds ? uniqueIds(input.interestIds) : undefined;

    const outcome = await db.transaction(async (tx) => {
      // Lock the account row first: a preference row may not exist yet, and
      // FOR UPDATE on an absent row would let two first writers both insert.
      await tx
        .select({ id: appUsersTable.id })
        .from(appUsersTable)
        .where(eq(appUsersTable.id, account.user.id))
        .for("update");
      const [current] = await tx
        .select()
        .from(consumerPreferencesTable)
        .where(eq(consumerPreferencesTable.userId, account.user.id))
        .for("update")
        .limit(1);
      const currentRevision = current?.revision ?? 0;
      if (currentRevision !== input.expectedRevision) {
        return { conflict: currentRevision, fieldErrors: [] as ApiFieldError[] };
      }
      // A taxonomy can change after a choice is stored. An unresolved ID may
      // stay in an authoritative replacement list only when it was already
      // stored for this account; newly introduced unknown IDs remain invalid.
      const fieldErrors = [
        ...controlledListErrors(
          "neighborhoodIds",
          neighborhoodIds ?? [],
          (id) => isKnownNeighborhoodId(id) || Boolean(current?.neighborhoodIds.includes(id)),
        ),
        ...controlledListErrors(
          "interestIds",
          interestIds ?? [],
          (id) => isKnownInterestId(id) || Boolean(current?.interestIds.includes(id)),
        ),
      ];
      if (fieldErrors.length > 0) return { conflict: null, fieldErrors };
      if (current) {
        await tx
          .update(consumerPreferencesTable)
          .set({
            revision: current.revision + 1,
            ...(neighborhoodIds ? { neighborhoodIds } : {}),
            ...(interestIds ? { interestIds } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(consumerPreferencesTable.id, current.id),
              eq(consumerPreferencesTable.revision, current.revision),
            ),
          );
      } else {
        await tx.insert(consumerPreferencesTable).values({
          userId: account.user.id,
          revision: 1,
          neighborhoodIds: neighborhoodIds ?? [],
          interestIds: interestIds ?? [],
        });
      }
      if (input.locale && input.locale !== account.user.locale) {
        await tx
          .update(appUsersTable)
          .set({ locale: input.locale, updatedAt: new Date() })
          .where(eq(appUsersTable.id, account.user.id));
      }
      return { conflict: null, fieldErrors: [] as ApiFieldError[] };
    });

    if (outcome.conflict !== null) {
      req.log?.info?.(
        { event: "account.preferences.conflict", accountId: account.user.id },
        "Preference update rejected on stale revision",
      );
      sendApiError(req, res, "VERSION_CONFLICT", { expectedVersion: outcome.conflict });
      return;
    }
    if (outcome.fieldErrors.length > 0) {
      sendApiError(req, res, "VALIDATION_FAILED", { fieldErrors: outcome.fieldErrors });
      return;
    }
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, account.user.id)).limit(1);
    const me = await buildAccountMe({ identity: account.identity, user: user ?? account.user }, flags);
    req.log?.info?.({ event: "account.preferences.saved", accountId: account.user.id }, "Preferences saved");
    res.json(UpdateAccountPreferencesResponse.parse(me));
  });

  router.post("/account/onboarding/complete", async (req, res): Promise<void> => {
    if (rejectClientFields(req, res)) return;
    if (rejectUnverified(req, res)) return;
    const account = req.account!;
    await db
      .update(appUsersTable)
      .set({ onboardingCompletedAt: sql`COALESCE(${appUsersTable.onboardingCompletedAt}, NOW())`, updatedAt: new Date() })
      .where(eq(appUsersTable.id, account.user.id));
    const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.id, account.user.id)).limit(1);
    const me = await buildAccountMe({ identity: account.identity, user: user ?? account.user }, flags);
    req.log?.info?.({ event: "account.onboarding.completed", accountId: account.user.id }, "Onboarding completed");
    res.json(CompleteAccountOnboardingResponse.parse(me));
  });

  router.get("/account/consents", async (req, res): Promise<void> => {
    if (rejectClientFields(req, res)) return;
    res.json(GetAccountConsentsResponse.parse(await buildAccountConsents(req.account!.user.id)));
  });

  router.post("/account/consents", async (req, res): Promise<void> => {
    if (rejectClientFields(req, res, CONSENT_FIELDS)) return;
    if (rejectUnverified(req, res)) return;
    const account = req.account!;
    const parsed = RecordAccountConsentBody.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          code: issue.code,
        })),
      });
      return;
    }
    if (parsed.data.noticeVersion !== CONSENT_NOTICE_VERSION) {
      sendApiError(req, res, "VALIDATION_FAILED", {
        fieldErrors: [{ field: "noticeVersion", code: "stale_notice_version" }],
      });
      return;
    }
    await db.insert(accountConsentEventsTable).values({
      userId: account.user.id,
      consentType: parsed.data.consentType,
      noticeVersion: parsed.data.noticeVersion,
      granted: parsed.data.granted,
      source: parsed.data.source,
    });
    req.log?.info?.(
      {
        event: "account.consent.recorded",
        accountId: account.user.id,
        consentType: parsed.data.consentType,
        granted: parsed.data.granted,
      },
      "Consent entry appended",
    );
    res.json(RecordAccountConsentResponse.parse(await buildAccountConsents(account.user.id)));
  });

  return router;
}

export default createAccountRouter();
