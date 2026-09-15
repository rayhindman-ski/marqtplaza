/**
 * Safe return destinations for the account journey.
 *
 * Sign-in, sign-up, verification, and the onboarding step carry a `terug`
 * query parameter so a user can resume what they were doing. Only local,
 * base-relative paths from this allowlist are honoured; anything else falls
 * back to the account page. Protocol-relative URLs, absolute URLs, and
 * unknown paths are rejected rather than partially sanitised.
 */
export const RETURN_PATH_PARAM = 'terug';
export const DEFAULT_RETURN_PATH = '/account';

const EXACT_PATHS = new Set([
  '/',
  '/account',
  '/account/voorkeuren',
  '/onboarding',
  '/activiteiten/den-haag',
  '/buurt',
  '/bronnen',
  '/nieuws',
  '/deals',
  '/bedrijf-aanmelden',
  '/bedrijf-zoeken',
  '/bedrijf-nieuw',
  '/bedrijf-claim',
  '/mijn-bedrijf',
]);

const PREFIX_PATHS = ['/activiteiten/den-haag/', '/nieuws/', '/bedrijf/'];

const SEGMENT = /^[A-Za-z0-9._~:@!$&'()*+,;=%-]+$/;

function stripBase(pathname: string, basePath: string): string | null {
  const base = basePath.replace(/\/$/, '');
  if (!base) return pathname;
  if (pathname === base) return '/';
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return null;
}

function isAllowedPathname(pathname: string): boolean {
  if (EXACT_PATHS.has(pathname)) return true;
  return PREFIX_PATHS.some((prefix) => {
    if (!pathname.startsWith(prefix)) return false;
    const rest = pathname.slice(prefix.length);
    return rest.length > 0 && rest.length <= 200 && SEGMENT.test(rest);
  });
}

/**
 * Returns a base-relative local path (without the artifact base path) when the
 * candidate is safe, otherwise `null`.
 */
export function sanitizeReturnPath(candidate: unknown, basePath = ''): string | null {
  if (typeof candidate !== 'string') return null;
  const value = candidate;
  if (!value || value.length > 512) return null;
  if (/[\u0000-\u001f\s]/.test(value)) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://buurtplaza.invalid');
  } catch {
    return null;
  }
  if (parsed.origin !== 'https://buurtplaza.invalid') return null;

  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const local = stripBase(pathname, basePath) ?? (basePath ? null : pathname);
  if (!local || !isAllowedPathname(local)) return null;

  return `${local}${parsed.search}${parsed.hash}`;
}

/** Resolves the effective return path for a search string, defaulting to the account page. */
export function resolveReturnPath(search: string, basePath = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return sanitizeReturnPath(params.get(RETURN_PATH_PARAM), basePath) ?? DEFAULT_RETURN_PATH;
}

/** Appends a `terug` parameter to a local path when the return target is safe. */
export function withReturnPath(path: string, returnPath: string | null | undefined): string {
  const safe = sanitizeReturnPath(returnPath);
  if (!safe || safe === DEFAULT_RETURN_PATH) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}${RETURN_PATH_PARAM}=${encodeURIComponent(safe)}`;
}

const AUTH_STEP_PREFIXES = ['/sign-in', '/sign-up'];

/**
 * Keeps `terug` on Clerk's internal navigations. The hosted sign-in and
 * sign-up components move between their own steps (for example
 * `/sign-up/verify-email-address`) with a bare path, which would otherwise
 * drop the return destination before the redirect target is computed.
 */
export function carryReturnPath(to: string, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  const safe = sanitizeReturnPath(params.get(RETURN_PATH_PARAM));
  if (!safe || safe === DEFAULT_RETURN_PATH) return to;

  const hashIndex = to.indexOf('#');
  const hash = hashIndex === -1 ? '' : to.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? to : to.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1));

  const isAuthStep = AUTH_STEP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isAuthStep || query.has(RETURN_PATH_PARAM)) return to;

  query.set(RETURN_PATH_PARAM, safe);
  return `${pathname}?${query.toString()}${hash}`;
}
