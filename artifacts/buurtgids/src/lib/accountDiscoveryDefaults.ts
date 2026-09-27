import type { ConsumerPreferences } from '@workspace/api-client-react';
import { BUSINESS_CATEGORIES, FOOD_TYPES, type BusinessCategory, type FoodType } from './data';
import { resolveNeighborhood } from './discoveryUrlState';

/**
 * Translates a signed-in visitor's saved preferences into the discovery
 * filters that should be pre-selected when they open the map without an
 * explicit scope in the URL.
 *
 * Neighborhood ids are `dhg:<slug>` and interest ids `category:<slug>`, the
 * controlled ids minted by the account options endpoint. Ids that no longer
 * resolve are ignored rather than guessed.
 */
export type DiscoverySection = 'events' | 'businesses' | 'food-drink' | 'social-map';

export type AccountDiscoveryDefaults = {
  neighborhoods: string[];
  sections: DiscoverySection[];
  subcategories: Array<BusinessCategory | FoodType>;
};

// Mirrors the server-side option id slug so ids can be resolved without a
// second round trip to the options endpoint.
export function slugifyOptionId(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const CATEGORY_BY_SLUG = new Map<string, BusinessCategory>(
  BUSINESS_CATEGORIES.map((category) => [slugifyOptionId(category), category]),
);

export function accountDiscoveryDefaults(
  preferences: Pick<ConsumerPreferences, 'neighborhoodIds' | 'interestIds'> | null | undefined,
): AccountDiscoveryDefaults | null {
  if (!preferences) return null;

  const neighborhoods = Array.from(new Set(
    preferences.neighborhoodIds
      .filter((id) => id.startsWith('dhg:'))
      .map((id) => resolveNeighborhood(id.slice('dhg:'.length)))
      .filter((name): name is string => Boolean(name)),
  ));

  const categories = Array.from(new Set(
    preferences.interestIds
      .filter((id) => id.startsWith('category:'))
      .map((id) => CATEGORY_BY_SLUG.get(id.slice('category:'.length)))
      .filter((category): category is BusinessCategory => Boolean(category)),
  ));

  const sections: DiscoverySection[] = [];
  const subcategories: Array<BusinessCategory | FoodType> = [];
  const businessCategories = categories.filter((category) => category !== 'Food & Drink');
  if (businessCategories.length > 0) {
    sections.push('businesses');
    subcategories.push(...businessCategories);
  }
  if (categories.includes('Food & Drink')) {
    sections.push('food-drink');
    subcategories.push(...FOOD_TYPES);
  }

  if (neighborhoods.length === 0 && sections.length === 0) return null;
  return { neighborhoods, sections, subcategories };
}
