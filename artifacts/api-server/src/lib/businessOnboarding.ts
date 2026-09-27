/**
 * Business onboarding intent (v0.5.2, BENT-002/BENT-003).
 *
 * An intent is nothing more than an allow-listed local return path for the
 * business step. It carries the entry context and, for "is this your
 * business?" entries, the provider listing reference — never personal data
 * or free-form state. Because it is derived, not stored, it can be replayed
 * after verification, sign-in or a reload without repeating any write.
 */
export const BUSINESS_ONBOARDING_PATH = "/account/bedrijf/toevoegen";

export const BUSINESS_ONBOARDING_CONTEXTS = ["registration", "account_home", "listing"] as const;
export type BusinessOnboardingContext = (typeof BUSINESS_ONBOARDING_CONTEXTS)[number];

export const INTENT_FIELDS: ReadonlySet<string> = new Set(["context", "cityId", "listingSource", "listingId"]);

const CITY_ID = /^[a-z]{3}$/;
const LISTING_SOURCE = /^[a-z][a-z0-9_]*$/;
const LISTING_ID = /^[A-Za-z0-9._~:@!$&'()*+,;=%-]+$/;

export type IntentInput = { context?: unknown; cityId?: unknown; listingSource?: unknown; listingId?: unknown };
export type IntentIssue = { field: "context" | "cityId" | "listingSource" | "listingId"; code: string };
export type Intent = { context: BusinessOnboardingContext; returnRef: string };

export function isBusinessOnboardingContext(value: unknown): value is BusinessOnboardingContext {
  return typeof value === "string" && (BUSINESS_ONBOARDING_CONTEXTS as readonly string[]).includes(value);
}

export function buildIntent(input: IntentInput): { ok: true; value: Intent } | { ok: false; issues: IntentIssue[] } {
  const issues: IntentIssue[] = [];
  if (!isBusinessOnboardingContext(input.context)) issues.push({ field: "context", code: "invalid" });

  // A listing reference is the intake's own key: city + provider + provider id, all or none.
  const hasCity = input.cityId !== undefined;
  const hasSource = input.listingSource !== undefined;
  const hasId = input.listingId !== undefined;
  const present = [hasCity, hasSource, hasId].filter(Boolean).length;
  if (present > 0 && present < 3) {
    if (!hasCity) issues.push({ field: "cityId", code: "required_together" });
    if (!hasSource) issues.push({ field: "listingSource", code: "required_together" });
    if (!hasId) issues.push({ field: "listingId", code: "required_together" });
  }
  if (hasCity && (typeof input.cityId !== "string" || !CITY_ID.test(input.cityId))) {
    issues.push({ field: "cityId", code: "invalid" });
  }
  if (hasSource && (typeof input.listingSource !== "string" || input.listingSource.length > 40 || !LISTING_SOURCE.test(input.listingSource))) {
    issues.push({ field: "listingSource", code: "invalid" });
  }
  if (hasId && (typeof input.listingId !== "string" || input.listingId.length > 200 || !LISTING_ID.test(input.listingId))) {
    issues.push({ field: "listingId", code: "invalid" });
  }
  if (issues.length > 0) return { ok: false, issues };

  const context = input.context as BusinessOnboardingContext;
  const params = new URLSearchParams({ context });
  if (hasCity && hasSource && hasId) {
    params.set("cityId", input.cityId as string);
    params.set("listingSource", input.listingSource as string);
    params.set("listingId", input.listingId as string);
  }
  return { ok: true, value: { context, returnRef: `${BUSINESS_ONBOARDING_PATH}?${params.toString()}` } };
}
