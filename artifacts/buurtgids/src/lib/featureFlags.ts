/**
 * Client mirrors of the server rollout flags. They only decide whether an
 * entry point is rendered; the API enforces the real gate and answers 404
 * while an area is disabled. All flags default to off.
 */
export type FeatureFlags = Readonly<{
  accounts: boolean;
  lastSearch: boolean;
  consentCenter: boolean;
  accountExport: boolean;
  accountDeletion: boolean;
  businessIntake: boolean;
  businessPublication: boolean;
  consumerRegistration: boolean;
  businessOnboarding: boolean;
}>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseFlag(value: unknown): boolean {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

export function readFeatureFlags(env: Record<string, unknown> = import.meta.env): FeatureFlags {
  const accounts = parseFlag(env.VITE_ACCOUNTS_ENABLED);
  const businessIntake = parseFlag(env.VITE_BUSINESS_INTAKE_ENABLED);
  return {
    accounts,
    lastSearch: parseFlag(env.VITE_LAST_SEARCH_ENABLED) && accounts,
    consentCenter: parseFlag(env.VITE_CONSENT_CENTER_ENABLED) && accounts,
    accountExport: parseFlag(env.VITE_ACCOUNT_EXPORT_ENABLED) && accounts,
    accountDeletion: parseFlag(env.VITE_ACCOUNT_DELETION_ENABLED) && accounts,
    businessIntake,
    businessPublication: parseFlag(env.VITE_BUSINESS_PUBLICATION_ENABLED),
    consumerRegistration: parseFlag(env.VITE_CONSUMER_REGISTRATION_ENABLED),
    // Mirrors the server's effective gate: needs accounts and business intake too.
    businessOnboarding: parseFlag(env.VITE_BUSINESS_ONBOARDING_ENABLED) && accounts && businessIntake,
  };
}

export const featureFlags: FeatureFlags = readFeatureFlags();
