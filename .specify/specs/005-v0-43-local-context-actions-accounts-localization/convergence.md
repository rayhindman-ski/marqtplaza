# v0.43 convergence

**Date:** 2026-09-20  
**Branch:** `feature/v043-enhancements`  
**Outcome:** Application implementation and browser gates pass; one pre-existing
development-database schema mismatch blocks the account-lifecycle integration suite.

## Implemented

- Validated, allowlisted public discovery state with canonical Hague neighbourhood
  slugs, locale, section, postcode and scope.
- Sensitive/unknown discovery parameters are rejected and removed on discovery routes.
- Locale and unaffected public criteria survive switching and navigation.
- Unsupported cities receive explicit English/Dutch Hague-only recovery.
- Consumer cards and details expose field evidence and caveats; actions remain
  contract-backed and exact-coordinate routing remains gated.
- Guest favourite intent uses the existing sanitized sign-in return path; persisted
  favourites remain owned by the existing server-backed hook.
- Localized accessible names, route fallbacks and document language are preserved.
- Optional map/provider failure leaves the list usable.

## Passed evidence

- `pnpm speckit:check`
- `pnpm run typecheck`
- `pnpm --filter @workspace/buurtgids run build`
- URL-state and localization unit suites: 19/19
- Listings-query and saved-events API integration suites: 29/29
- v0.43 focused browser suite: 5/5
- Combined v0.43, v0.42, discovery, account-preferences and account-privacy browser
  matrix: 27/29 initially; both failures were fixed and their focused reruns passed.
- Workflow restart: Vite ready with no browser runtime errors.
- Visual inspection:
  - `screenshots/v043-nl-desktop.jpg`
  - `screenshots/v043-en-mobile.jpg`
- `git diff --check`

## Blocked evidence

`account-lifecycle.test.ts` cannot converge against the current development database.
The database predates multiple already-declared lifecycle schema additions, including
the `lifecycle_delivery_attempts` relation and account-request fields. A non-interactive
Drizzle push stopped at a rename/conflict prompt. Two additive outbox reconciliations
were applied, but no destructive or guessed rename resolution was attempted.

This is an environment/schema reconciliation issue rather than a v0.43 application
failure. Production was not modified.

## Manual boundaries

- No independent screen-reader specialist audit is claimed.
- No real Clerk email-delivery journey is claimed.
- No non-Hague content rollout or additional locale is claimed.