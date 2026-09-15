import { NEIGHBORHOOD_BOUNDARIES } from "@workspace/geo";
import { BusinessCategory, type AccountOption, type AccountOptions } from "@workspace/api-zod";

/**
 * Controlled option lists for consumer preferences.
 *
 * This is the provisional taxonomy derived from data the product already
 * serves (official Den Haag neighbourhood boundaries and the normalized
 * business categories). Release gate Q1 decides the final taxonomy; until it
 * is recorded the accounts flag stays off, so nothing here reaches users.
 * Stored IDs are validated against these lists and are never inferred.
 */
export const ACCOUNT_OPTIONS_TAXONOMY_VERSION = "provisional-2026-09";

const CATEGORY_LABELS_NL: Record<BusinessCategory, string> = {
  "Retail & Shopping": "Winkelen & retail",
  "Food & Drink": "Horeca",
  "Health & Wellness": "Gezondheid & welzijn",
  "Beauty & Personal Care": "Beauty & persoonlijke verzorging",
  "Professional Services": "Professionele diensten",
  "Finance & Legal": "Financiën & juridisch",
  "Home & Repair": "Wonen & reparatie",
  "Automotive & Mobility": "Auto & mobiliteit",
  "Education & Childcare": "Onderwijs & kinderopvang",
  "Hospitality & Travel": "Gastvrijheid & reizen",
  "Arts, Culture & Entertainment": "Kunst, cultuur & entertainment",
  "Fitness & Sports": "Fitness & sport",
};

export function slugifyOptionId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function neighborhoodOptions(): AccountOption[] {
  return Object.keys(NEIGHBORHOOD_BOUNDARIES)
    .sort((a, b) => a.localeCompare(b, "nl"))
    .map((name) => ({
      id: `dhg:${slugifyOptionId(name)}`,
      label: { nl: name, en: name },
    }));
}

function interestOptions(): AccountOption[] {
  return Object.values(BusinessCategory).map((category) => ({
    id: `category:${slugifyOptionId(category)}`,
    label: { nl: CATEGORY_LABELS_NL[category], en: category },
  }));
}

/** Anything that yields the current controlled option lists. */
export type AccountOptionsSource = () => AccountOptions;

let cached: AccountOptions | null = null;

export function getAccountOptions(): AccountOptions {
  cached ??= {
    taxonomyVersion: ACCOUNT_OPTIONS_TAXONOMY_VERSION,
    neighborhoods: neighborhoodOptions(),
    interests: interestOptions(),
  };
  return cached;
}

export function isKnownNeighborhoodId(id: string): boolean {
  return getAccountOptions().neighborhoods.some((option) => option.id === id);
}

export function isKnownInterestId(id: string): boolean {
  return getAccountOptions().interests.some((option) => option.id === id);
}
