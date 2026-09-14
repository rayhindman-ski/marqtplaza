import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { consumerPreferencesTable, db, type AppUser, type ConsumerPreferences } from "@workspace/db";
import { GetAccountMeResponse, GetAccountOptionsResponse } from "@workspace/api-zod";

import { getAccountOptions } from "../lib/accountOptions";
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

function rejectClientFields(req: Request, res: Response): boolean {
  const fieldErrors = [
    ...unknownFieldErrors(req.body, NO_FIELDS),
    ...unknownFieldErrors(req.query, NO_FIELDS),
  ];
  if (fieldErrors.length === 0) return false;
  sendApiError(req, res, "UNKNOWN_FIELD", { fieldErrors });
  return true;
}

function serialisePreferences(preferences: ConsumerPreferences | undefined) {
  if (!preferences) return null;
  return {
    revision: preferences.revision,
    neighborhoodIds: preferences.neighborhoodIds,
    interestIds: preferences.interestIds,
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

  return router;
}

export default createAccountRouter();
