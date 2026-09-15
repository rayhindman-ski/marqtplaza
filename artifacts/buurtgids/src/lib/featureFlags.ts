/**
 * Client mirrors of the server rollout flags. They only decide whether an
 * entry point is rendered; the API enforces the real gate and answers 404
 * while an area is disabled. All flags default to off.
 */
export type FeatureFlags = Readonly<{
  accounts: boolean;
  businessIntake: boolean;
  businessPublication: boolean;
}>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function parseFlag(value: unknown): boolean {
  return typeof value === "string" && TRUE_VALUES.has(value.trim().toLowerCase());
}

export function readFeatureFlags(env: Record<string, unknown> = import.meta.env): FeatureFlags {
  return {
    accounts: parseFlag(env.VITE_ACCOUNTS_ENABLED),
    businessIntake: parseFlag(env.VITE_BUSINESS_INTAKE_ENABLED),
    businessPublication: parseFlag(env.VITE_BUSINESS_PUBLICATION_ENABLED),
  };
}

export const featureFlags: FeatureFlags = readFeatureFlags();
