import type {
  BusinessCategory,
  Category,
  FoodType,
  Marker,
  SocialMapCategory,
} from './data';

const CATEGORY_COLORS: Record<Category, string> = {
  Museums: '#8b5cf6',
  Tours: '#f36c21',
  Family: '#ec4899',
  Entertainment: '#6366f1',
  Outdoors: '#10b981',
  Markets: '#f59e0b',
  Businesses: '#0ea5e9',
  'Food & Drink': '#b45309',
  'Social map': '#0f766e',
};

const BUSINESS_CATEGORY_COLORS: Record<BusinessCategory, string> = {
  'Retail & Shopping': '#2563eb',
  'Food & Drink': '#b45309',
  'Health & Wellness': '#dc2626',
  'Beauty & Personal Care': '#db2777',
  'Professional Services': '#4f46e5',
  'Finance & Legal': '#0f766e',
  'Home & Repair': '#7c3aed',
  'Automotive & Mobility': '#475569',
  'Education & Childcare': '#0891b2',
  'Hospitality & Travel': '#c2410c',
  'Arts, Culture & Entertainment': '#9333ea',
  'Fitness & Sports': '#16a34a',
};

const FOOD_TYPE_COLORS: Record<FoodType, string> = {
  restaurant: '#c2410c',
  cafe: '#92400e',
  bar: '#7e22ce',
  bakery: '#d97706',
  takeaway: '#e11d48',
  other: '#64748b',
};

const SOCIAL_CATEGORY_COLORS: Record<SocialMapCategory, string> = {
  Geldzaken: '#047857',
  'Gezin en opvoeden': '#db2777',
  Gezondheid: '#dc2626',
  'Heilige plaatsen': '#7c3aed',
  "Hobby's en interesses": '#9333ea',
  Ondersteuning: '#ea580c',
  'Ontmoeten en samenleven': '#0f766e',
  'Sporten en bewegen': '#16a34a',
  'Taal en computer': '#2563eb',
  Vervoer: '#475569',
  'Werk en opleiding': '#4f46e5',
  'Wonen en huishouden': '#b45309',
  'Zorg voor een naaste': '#be123c',
};

export type MapSubcategory = Category | BusinessCategory | FoodType | SocialMapCategory;

export function getSubcategoryColor(subcategory: MapSubcategory): string {
  if (subcategory in FOOD_TYPE_COLORS) return FOOD_TYPE_COLORS[subcategory as FoodType];
  if (subcategory in SOCIAL_CATEGORY_COLORS) return SOCIAL_CATEGORY_COLORS[subcategory as SocialMapCategory];
  if (subcategory in BUSINESS_CATEGORY_COLORS) return BUSINESS_CATEGORY_COLORS[subcategory as BusinessCategory];
  return CATEGORY_COLORS[subcategory as Category] ?? CATEGORY_COLORS.Businesses;
}

export function getMapMarkerColor(
  marker: Pick<Marker, 'category' | 'businessCategory' | 'socialCategory' | 'foodType'>,
): string {
  if (marker.category === 'Food & Drink' && marker.foodType) {
    return FOOD_TYPE_COLORS[marker.foodType];
  }
  if (marker.category === 'Businesses' && marker.businessCategory) {
    return BUSINESS_CATEGORY_COLORS[marker.businessCategory];
  }
  if (marker.category === 'Social map' && marker.socialCategory) {
    return SOCIAL_CATEGORY_COLORS[marker.socialCategory];
  }
  return CATEGORY_COLORS[marker.category] ?? CATEGORY_COLORS.Businesses;
}