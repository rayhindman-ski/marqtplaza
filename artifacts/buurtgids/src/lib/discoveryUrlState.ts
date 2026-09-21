import { LOCATIONS } from './data';

/** Values which are safe to put in a public discovery URL. */
export type DiscoveryLocale = 'nl' | 'en';
export type DiscoveryCity = 'den-haag';
export type DiscoverySection = 'events' | 'businesses' | 'food-drink' | 'social-map';
export type DiscoveryScope = 'local' | 'web';

export interface DiscoveryUrlState {
  locale: DiscoveryLocale;
  city: DiscoveryCity;
  section: DiscoverySection;
  neighborhood?: string;
  postcode?: string;
  scope: DiscoveryScope;
}

export interface DiscoveryUrlParseResult {
  /** The usable state. Invalid individual values are omitted. */
  state: DiscoveryUrlState;
  /** True only when every supplied parameter is allowlisted and valid. */
  valid: boolean;
  errors: readonly DiscoveryUrlError[];
  /** Canonical query string, without a leading question mark. */
  canonical: string;
}

export type DiscoveryUrlErrorCode =
  | 'unknown-parameter'
  | 'duplicate-parameter'
  | 'invalid-locale'
  | 'invalid-city'
  | 'invalid-section'
  | 'invalid-neighborhood'
  | 'invalid-postcode'
  | 'invalid-scope'
  | 'invalid-restore'
  | 'sensitive-parameter';

export interface DiscoveryUrlError {
  code: DiscoveryUrlErrorCode;
  parameter: string;
}

const CITY_ALIASES = new Set(['den-haag', 'den haag', 'the-hague', 'the hague', 'dhg']);
const SECTIONS = new Set<DiscoverySection>(['events', 'businesses', 'food-drink', 'social-map']);
const PARAMS = new Set(['locale', 'city', 'section', 'neighborhood', 'postcode', 'scope', 'restore']);
const SENSITIVE = new Set([
  'token', 'access_token', 'refresh_token', 'session', 'session_id', 'user_id',
  'userid', 'uid', 'return', 'return_to', 'return_path', 'redirect', 'redirect_uri',
  'lat', 'lng', 'latitude', 'longitude', 'coordinates', 'coords',
]);

const hague = LOCATIONS.find((location) => location.id === 'dhg')
  ?? (() => {
    throw new Error('The Hague discovery location is missing');
  })();

/** Stable slugs are derived once from canonical data and never from translated labels. */
function slugify(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const NEIGHBORHOOD_SLUGS = new Map(hague.neighborhoods.map((name) => [slugify(name), name]));
const CANONICAL_NEIGHBORHOODS = new Map(
  hague.neighborhoods.map((name) => [name.toLocaleLowerCase('nl-NL'), name]),
);

export const discoveryNeighborhoodSlugs: Readonly<Record<string, string>> =
  Object.fromEntries(NEIGHBORHOOD_SLUGS);

export function neighborhoodSlug(name: string): string | undefined {
  const canonical = resolveNeighborhood(name);
  return canonical ? slugify(canonical) : undefined;
}

/** Resolves both the public slug and the old display-name query value. */
export function resolveNeighborhood(value: string): string | undefined {
  const input = value.trim();
  return NEIGHBORHOOD_SLUGS.get(slugify(input))
    ?? CANONICAL_NEIGHBORHOODS.get(input.toLocaleLowerCase('nl-NL'));
}

function initialState(): DiscoveryUrlState {
  return { locale: 'en', city: 'den-haag', section: 'events', scope: 'local' };
}

function sourceParams(input: string | URL | URLSearchParams | Readonly<Record<string, string | undefined>>): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (input instanceof URL) return new URLSearchParams(input.search);
  if (typeof input === 'string') {
    const query = input.includes('?') ? input.slice(input.indexOf('?') + 1).split('#', 1)[0] : input.replace(/^\?/, '');
    return new URLSearchParams(query);
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) params.set(key, value);
  return params;
}

function error(errors: DiscoveryUrlError[], code: DiscoveryUrlErrorCode, parameter: string): void {
  errors.push({ code, parameter });
}

export function serializeDiscoveryUrlState(state: DiscoveryUrlState): string {
  const params = new URLSearchParams();
  if (state.locale !== 'en') params.set('locale', state.locale);
  if (state.city !== 'den-haag') params.set('city', state.city);
  if (state.section !== 'events') params.set('section', state.section);
  if (state.neighborhood) {
    const canonical = resolveNeighborhood(state.neighborhood);
    if (canonical) params.set('neighborhood', slugify(canonical));
  }
  if (state.postcode) params.set('postcode', normalizePostcode(state.postcode));
  if (state.scope !== 'local') params.set('scope', state.scope);
  return params.toString();
}

function normalizePostcode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function parseDiscoveryUrlState(input: string | URL | URLSearchParams | Readonly<Record<string, string | undefined>>): DiscoveryUrlParseResult {
  const params = sourceParams(input);
  const state = initialState();
  const errors: DiscoveryUrlError[] = [];
  const duplicateKeys = new Set<string>();

  for (const key of new Set(params.keys())) {
    if (!PARAMS.has(key)) {
      error(errors, SENSITIVE.has(key.toLowerCase()) ? 'sensitive-parameter' : 'unknown-parameter', key);
    } else if (params.getAll(key).length > 1) {
      duplicateKeys.add(key);
      error(errors, 'duplicate-parameter', key);
    }
  }

  const locale = params.get('locale');
  if (locale !== null && !duplicateKeys.has('locale')) locale === 'nl' || locale === 'en'
    ? state.locale = locale : error(errors, 'invalid-locale', 'locale');

  const city = params.get('city');
  if (city !== null && !duplicateKeys.has('city')) CITY_ALIASES.has(city.trim().toLowerCase())
    ? state.city = 'den-haag' : error(errors, 'invalid-city', 'city');

  const section = params.get('section');
  if (section !== null && !duplicateKeys.has('section')) SECTIONS.has(section as DiscoverySection)
    ? state.section = section as DiscoverySection : error(errors, 'invalid-section', 'section');

  const neighborhood = params.get('neighborhood');
  if (neighborhood !== null && !duplicateKeys.has('neighborhood')) {
    const canonical = resolveNeighborhood(neighborhood);
    canonical ? state.neighborhood = canonical : error(errors, 'invalid-neighborhood', 'neighborhood');
  }

  const postcode = params.get('postcode');
  if (postcode !== null && !duplicateKeys.has('postcode')) {
    const normalized = normalizePostcode(postcode);
    const prefix = normalized.slice(0, 4);
    if (/^\d{4}(?:[A-Z]{2})?$/.test(normalized) && hague?.postcodes.includes(prefix)) state.postcode = normalized;
    else error(errors, 'invalid-postcode', 'postcode');
  }

  const scope = params.get('scope');
  if (scope !== null && !duplicateKeys.has('scope')) scope === 'local' || scope === 'web'
    ? state.scope = scope : error(errors, 'invalid-scope', 'scope');

  const restore = params.get('restore');
  if (restore !== null && !duplicateKeys.has('restore') && restore !== '1') {
    error(errors, 'invalid-restore', 'restore');
  }

  return { state, valid: errors.length === 0, errors, canonical: serializeDiscoveryUrlState(state) };
}

export function canonicalizeDiscoveryUrl(input: string | URL | URLSearchParams | Readonly<Record<string, string | undefined>>): string {
  return serializeDiscoveryUrlState(parseDiscoveryUrlState(input).state);
}