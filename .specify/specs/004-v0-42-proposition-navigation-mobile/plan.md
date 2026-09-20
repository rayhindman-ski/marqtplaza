# Implementation Plan: v0.42 proposition, navigation, and mobile discovery

**Spec**: `.specify/specs/004-v0-42-proposition-navigation-mobile/spec.md`  
**Source**: `doc/md/v0.4/release/release_v0.42.md`  
**Status**: Ready for implementation  
**Date**: 2026-09-20

## Summary

Deliver v0.42 as three coordinated vertical slices: proposition and scope
clarity (BR-01), a shared labelled navigation model (BR-02), and a mobile-first
discovery journey (BR-09). Start from the accepted v0.41 list-first, local-only,
privacy, trust, accessibility, and lazy-map contracts. Prefer existing routes,
components, translations, return-path helpers, and generated clients. This plan
assumes no backend, OpenAPI, or schema change; stop and re-plan if inspection
proves an existing contract cannot express validated public state.

## Constitution check

| Principle | How this plan complies | Evidence |
|---|---|---|
| User value is vertical | Each BR is independently testable: understand, navigate, discover on mobile. | US1–US3 and focused E2E suites. |
| Local truth | Hague is labelled current availability; no global coverage or trust claims are invented. | Copy fixture and prohibited-claim tests. |
| Contracts shared | Existing API/client contracts are reused; any change is OpenAPI-first and regenerated. | Contract audit task T004. |
| Privacy/ownership explicit | Safe return paths remain; no public private state; favorites/account boundaries unchanged. | URL/security and account E2E tasks. |
| Integrations fail independently | Map/location/search errors have distinct list-preserving recovery. | Failure matrix and blocked-provider tests. |
| Accessible/localized/responsive | Semantic landmarks, focus, EN/NL parity, 320px/400%/landscape coverage are required. | Accessibility and responsive tasks. |
| Operational clarity | No new dependency, provider, flag, schema, or root workflow; existing packages remain. | Architecture decision AD-01. |

## Technical context and current-code baseline

- **Web**: `artifacts/buurtgids`; `src/App.tsx` currently contains home,
  discovery, detail, header/nav, route state, and many translations.
- **Shared UI**: `src/components/GoogleMapView.tsx`, `SchematicMap.tsx`, and
  existing shadcn components; inspect before extracting.
- **Localization**: `src/lib/i18n.ts`; add EN/NL keys atomically and keep tests
  passing.
- **Routing**: Wouter routes in `App.tsx`; `src/lib/returnPath.ts` is the safe
  account return boundary. Existing detail routes and discovery query parameters
  must remain compatible.
- **API**: `artifacts/api-server` listings/account/weather contracts and
  `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`; no change planned.
- **Persistence**: no v0.42 schema/migration/seed change.
- **Tests**: `artifacts/buurtgids/e2e/discovery-regression.spec.ts`,
  account/business/saved event E2E files, `src/lib/*.test.ts`, API tests.
- **Runtime**: map provider and tiles are already guarded in parts of the
  discovery flow; prove request order rather than assuming it.

## Affected files/surfaces

### Planned frontend surfaces

- `artifacts/buurtgids/src/App.tsx`: semantic proposition, current availability,
  shared route-state parser/serializer integration, results context, discovery
  mobile disclosures, navigation and detail/account context.
- `artifacts/buurtgids/src/lib/i18n.ts`: all new EN/NL proposition, navigation,
  filter, status, recovery, map/location, and availability strings.
- `artifacts/buurtgids/src/lib/returnPath.ts`: only if current allow-list cannot
  preserve the existing validated discovery routes; add tests before changes.
- `artifacts/buurtgids/src/components/GoogleMapView.tsx`: explicit-load/failure
  presentation only if audit finds a gap; do not alter cluster camera behavior.
- New extracted components are allowed only when they reduce coupling: e.g.
  `GlobalNavigation.tsx`, `DiscoveryProposition.tsx`, `MobileFilterSheet.tsx`,
  `publicDiscoveryState.ts`. Each must have a focused test boundary.
- `artifacts/buurtgids/src/index.css` and relevant component styles: mobile-first
  DOM/layout, safe areas, focus, reduced motion, target size, and overflow.

### Planned test surfaces

- `artifacts/buurtgids/e2e/v042-release.spec.ts` (or split by BR): acceptance
  journeys, request blocking, URL/history, navigation, mobile, locale, failure.
- `artifacts/buurtgids/src/lib/publicDiscoveryState.test.ts`,
  `navigationModel.test.ts`, and content/claim parity tests where extracted.
- Existing `discovery-regression.spec.ts`, `account-preferences.spec.ts`, and
  `returnPath.test.ts`: preserve and extend rather than duplicate.
- No API test or generated file unless contract inspection forces a change.

## Architecture decisions and research

| ID | Finding | Decision | Rationale |
|---|---|---|---|
| AD-01 | Release proposes APIs but current app has listings hooks and route state. | Reconcile first; no API/OpenAPI/schema change by default. | Avoid speculative backend and preserve v0.41 contracts. |
| AD-02 | Homepage/discovery and header are coupled in `App.tsx`; map provider has sensitive lifecycle. | Extract only stable, independently testable UI/state boundaries. | Reduce drift without broad rewrite. |
| AD-03 | No analytics implementation was found in current web source. | Do not add telemetry; document manual privacy boundary unless approved mechanism appears. | No unapproved collection or dependency. |
| AD-04 | Detail returns via restore snapshot and route; public state must not rely on hidden state. | Preserve existing behavior, add validated URL/history state where safe. | Shared links and browser Back must work across tabs. |
| AD-05 | Existing local-only scope is session-backed and list-first; map can fallback. | Make scope visible and explicit while retaining old storage compatibility. | Meets BR-01/04 without silently changing provider behavior. |
| AD-06 | “UserRole user” is an internal role string. | Replace consumer copy with account-purpose label and keep role only for authorization logic. | Meets BR-02-AC-03 without changing permissions. |

## Phased implementation

### Phase 0 — Baseline and contract reconciliation

1. Record v0.41 acceptance commands/results and inventory all current route,
   nav, breakpoint, locale, map, location, account, and failure behavior.
2. Define the typed public discovery-state model and invalid-value policy. Verify
   exact existing routes/query keys and return-path compatibility.
3. Confirm no API/OpenAPI/schema work is needed; if not, mark codegen N/A.
4. Add deterministic fixtures for local/web groups, empty/error/map failure,
   permission denied, EN/NL strings, and a non-production alternate availability.

### Phase 1 — Shared proposition and public state

1. Add reusable semantic proposition/availability/benefits content in EN/NL.
2. Render local-only scope and an accessible scope explanation; keep local/web
   groups visibly distinct.
3. Implement allow-listed, bounded public state parsing/serialization and
   meaningful history updates without coordinates/private data.
4. Preserve list-first and explicit map/location activation; add request assertions.
5. Cover BR-01 AC-01–11 and BR-09 AC-05–08 with unit/integration/E2E tests.

### Phase 2 — Navigation hierarchy

1. Define one typed navigation model and destination/current-match rules.
2. Render semantic desktop and mobile header variants from that model, with skip
   link, visible labels, language, account-purpose entry, and current state.
3. Add mobile menu disclosure with Escape/outside/close behavior and trigger focus
   restoration; ensure it does not create URL history entries.
4. Reconcile document titles and one descriptive `h1` for all covered routes,
   including detail, account, search, and error/recovery states.
5. Verify safe account cancel/success return and EN/NL criteria preservation.
6. Cover BR-02 AC-01–12 and inherited account/navigation regressions.

### Phase 3 — Mobile-first discovery

1. Reorder/resize home and discovery DOM for one-column task order at 320px.
2. Add progressive filter disclosure with draft/apply/cancel semantics and
   focus/status restoration; keep desktop controls equivalent.
3. Ensure result cards/details expose essential facts first and do not require
   map pins; retain detail snapshot behavior and safe Back.
4. Add explicit pre-map explanation/loading/failure and Show list/list fallback.
5. Keep Use my location purpose, denial/timeout recovery, manual neighborhoods,
   and no repeated prompting.
6. Test keyboard, touch, reduced motion, safe area, virtual keyboard, 200–400%
   zoom, portrait/landscape, map blocked, slow/error/empty paths.
7. Cover BR-09 AC-01–14 and rerun inherited v0.41 tests.

### Phase 4 — Convergence and evidence

1. Run unit, typecheck, API package tests, web tests, focused Playwright, full
   relevant Playwright, and build checks.
2. Capture only implemented-state screenshots at required EN/NL viewports;
   label build/locale/viewport/state and never use screenshots as behavioral proof.
3. Review all criteria against this spec, record deviations and any manual
   accessibility boundaries in `convergence.md`.
4. Inspect diff for secrets, unsupported claims, coordinate/private URL leakage,
   generated artifacts, unrelated files, and accidental API/schema changes.
5. Commit/push the branch; publish only after release go/no-go criteria pass.

## Test matrix

| Area | Coverage |
|---|---|
| Proposition | Fresh EN/NL, explanation open/close/focus, availability fixture, prohibited claims, local/web opt-in. |
| URL/state | valid round trip, unknown/duplicate/overlong/malformed values, sensitive-value exclusion, Back/Forward, detail/account return. |
| Navigation | desktop/mobile destination parity, labels/accessibility names, current state, titles/h1/routes, menu keyboard/touch/Escape/focus. |
| Discovery | guest search/browse, empty/error/loading/retry, stale/cancel latest response, cards/detail, map/list. |
| Map/location | provider/tile/data blocked before Show map, map success/failure, list fallback, geolocation only after Use my location, denial/timeout/manual browse. |
| Responsive | 320px, 390×844, 844×390, desktop, 200–400% zoom, long Dutch labels, safe area, reduced motion, keyboard. |
| Account | guest favorites explanation, sign-in cancel/success safe return, no account/token data in URL. |
| Regression | existing discovery, cluster/no-recenter, neighborhood polygon, saved events, account preferences, return path, source/freshness/trust tests. |

## Risks and rollback

- **Overbroad release** — keep each BR independently gated and exclude v0.43.
- **Navigation drift** — one typed model and desktop/mobile parity test.
- **URL/privacy leak** — parser allow-list, property tests, URL scans, safe
  `returnPath.ts`; never put coordinates or account/session state in URLs.
- **Map eager load/regression** — request interception before/after explicit
  action and blocked-provider list fallback.
- **Focus/reflow regressions** — keyboard tests, mobile snapshots, 320px/400%
  checks, and manual screen-reader boundary documented.
- **Copy claims** — bilingual content review and prohibited-term fixture.
- **Stale async response** — request identity/cancellation test; latest criteria
  owns the rendered response.
- **Rollback** — revert presentation/navigation commits; no data migration or
  provider change exists. Preserve v0.41 routes/state contracts and disable any
  existing feature control if present.

## Verification commands

```text
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/buurtgids run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/buurtgids run test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(command -v chromium) pnpm --dir artifacts/buurtgids exec playwright test --config playwright.config.ts e2e/v042-release.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(command -v chromium) pnpm --dir artifacts/buurtgids exec playwright test --config playwright.config.ts e2e/discovery-regression.spec.ts e2e/account-preferences.spec.ts
git diff --check
```

Do not run API integration tests against a shared production/development
database; use the repository's disposable database command and existing
`LISTINGS_TEST_DATABASE_URL` rules when integration coverage is required.