/**
 * Rollout readiness flags for gated entry points.
 *
 * Every flag defaults to off. Each area is enabled independently by the
 * operator environment once its release gate is recorded in the Spec Kit
 * convergence record; nothing in code may turn one on by default.
 */
export type FeatureFlagName = "accounts" | "businessIntake" | "businessPublication" | "consumerRegistration";

export type FeatureFlags = Readonly<Record<FeatureFlagName, boolean>>;

export const FEATURE_FLAG_ENV_VARS: Readonly<Record<FeatureFlagName, string>> = {
  accounts: "ACCOUNTS_ENABLED",
  businessIntake: "BUSINESS_INTAKE_ENABLED",
  businessPublication: "BUSINESS_PUBLICATION_ENABLED",
  /** v0.5.1 registration foundation; independent of `accounts` so it can stay off on its own. */
  consumerRegistration: "CONSUMER_REGISTRATION_ENABLED",
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseFlag(value: string | undefined): boolean {
  return value !== undefined && TRUE_VALUES.has(value.trim().toLowerCase());
}

export function readFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): FeatureFlags {
  return {
    accounts: parseFlag(env[FEATURE_FLAG_ENV_VARS.accounts]),
    businessIntake: parseFlag(env[FEATURE_FLAG_ENV_VARS.businessIntake]),
    businessPublication: parseFlag(env[FEATURE_FLAG_ENV_VARS.businessPublication]),
    consumerRegistration: parseFlag(env[FEATURE_FLAG_ENV_VARS.consumerRegistration]),
  };
}

let cached: FeatureFlags | null = null;

/** Flags are read once per process so a request never sees a half-applied change. */
export function getFeatureFlags(): FeatureFlags {
  cached ??= readFeatureFlags();
  return cached;
}

export type FeatureFlagSource = () => FeatureFlags;
