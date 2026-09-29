/**
 * Rollout readiness flags for gated entry points.
 *
 * Every flag defaults to off. Each area is enabled independently by the
 * operator environment once its release gate is recorded in the Spec Kit
 * convergence record; nothing in code may turn one on by default.
 */
export type FeatureFlagName = "accounts" | "businessIntake" | "businessPublication" | "consumerRegistration" | "businessOnboarding" | "lastSearch";

export type FeatureFlags = Readonly<Record<Exclude<FeatureFlagName, "lastSearch">, boolean> & { lastSearch?: boolean }>;

export const FEATURE_FLAG_ENV_VARS: Readonly<Record<FeatureFlagName, string>> = {
  accounts: "ACCOUNTS_ENABLED",
  lastSearch: "LAST_SEARCH_ENABLED",
  businessIntake: "BUSINESS_INTAKE_ENABLED",
  businessPublication: "BUSINESS_PUBLICATION_ENABLED",
  /** v0.5.1 registration foundation; independent of `accounts` so it can stay off on its own. */
  consumerRegistration: "CONSUMER_REGISTRATION_ENABLED",
  /** v0.5.2 business onboarding enrichment; effective only together with `accounts` and `businessIntake`. */
  businessOnboarding: "BUSINESS_ONBOARDING_ENABLED",
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseFlag(value: string | undefined): boolean {
  return value !== undefined && TRUE_VALUES.has(value.trim().toLowerCase());
}

export function readFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): FeatureFlags {
  const accounts = parseFlag(env[FEATURE_FLAG_ENV_VARS.accounts]);
  const businessIntake = parseFlag(env[FEATURE_FLAG_ENV_VARS.businessIntake]);
  return {
    accounts,
    lastSearch: parseFlag(env[FEATURE_FLAG_ENV_VARS.lastSearch]) && accounts,
    businessIntake,
    businessPublication: parseFlag(env[FEATURE_FLAG_ENV_VARS.businessPublication]),
    consumerRegistration: parseFlag(env[FEATURE_FLAG_ENV_VARS.consumerRegistration]),
    // Effective gate: the onboarding enrichment needs a session (accounts) and
    // the intake it enriches (businessIntake); its own switch alone never opens it.
    businessOnboarding: parseFlag(env[FEATURE_FLAG_ENV_VARS.businessOnboarding]) && accounts && businessIntake,
  };
}

let cached: FeatureFlags | null = null;

/** Flags are read once per process so a request never sees a half-applied change. */
export function getFeatureFlags(): FeatureFlags {
  cached ??= readFeatureFlags();
  return cached;
}

export type FeatureFlagSource = () => FeatureFlags;
