import { RETURN_PATH_PARAM, sanitizeReturnPath } from './returnPath';

/**
 * Business-onboarding intent (BENT-002): only ever an allow-listed local path
 * carrying the entry context and, from a listing, the intake's listing key
 * (city, provider, opaque provider id).
 * Mirrors the server's `buildIntent`; the business step asks the server to
 * confirm the reference before anything is written.
 */
export const BUSINESS_ONBOARDING_PATH = '/account/bedrijf/toevoegen';
export type BusinessIntentContext = 'registration' | 'account_home' | 'listing';

export type BusinessIntentListing = { cityId: string; source: string; id: string };

export function businessIntentRef(context: BusinessIntentContext, listing?: BusinessIntentListing): string {
  const params = new URLSearchParams({ context });
  if (listing) {
    params.set('cityId', listing.cityId);
    params.set('listingSource', listing.source);
    params.set('listingId', listing.id);
  }
  return `${BUSINESS_ONBOARDING_PATH}?${params.toString()}`;
}

/** True when a `terug` value (or a plain path) already targets the business step. */
export function isBusinessIntentPath(candidate: string | null | undefined): boolean {
  const safe = sanitizeReturnPath(candidate);
  return Boolean(safe && safe.split('?')[0] === BUSINESS_ONBOARDING_PATH);
}

export function searchCarriesBusinessIntent(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return isBusinessIntentPath(params.get(RETURN_PATH_PARAM));
}

/**
 * The onboarding journey (BPROF-001…011) runs across the existing intake
 * pages. The entry context travels as `context` on those pages so the draft
 * records where the journey began; nothing else about the intake changes
 * when the parameter is absent.
 */
export const JOURNEY_CONTEXT_PARAM = 'context';
const CONTEXT_VALUES: ReadonlySet<string> = new Set(['registration', 'account_home', 'listing']);

export function isBusinessIntentContext(value: string | null | undefined): value is BusinessIntentContext {
  return typeof value === 'string' && CONTEXT_VALUES.has(value);
}

export function journeyContextFromSearch(search: string): BusinessIntentContext | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const value = params.get(JOURNEY_CONTEXT_PARAM);
  return isBusinessIntentContext(value) ? value : null;
}

/** Carry the journey context and return path onto the next intake page. */
export function withJourney(params: URLSearchParams, context: BusinessIntentContext | null, returnPath: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (context) next.set(JOURNEY_CONTEXT_PARAM, context);
  if (returnPath) next.set(RETURN_PATH_PARAM, returnPath);
  return next;
}
