# Tasks: v0.42 proposition, navigation, and mobile discovery

**Spec**: `.specify/specs/004-v0-42-proposition-navigation-mobile/spec.md`  
**Plan**: `.specify/specs/004-v0-42-proposition-navigation-mobile/plan.md`  
**Status**: Not started

Task format: `T### [P] [US#] description`. `[P]` means no unfinished dependency
and disjoint files. Every task names a concrete file, command, or evidence
boundary. No task may claim acceptance until its executable evidence exists.

## Phase 0 — Baseline and contract reconciliation

- [ ] T001 [P] [US1] Record v0.41 baseline evidence and inherited gates in `convergence.md`: list-first, local-only, WCAG, trust, privacy, polygon, cluster, detail-return, and lazy-map regressions.
- [ ] T002 [P] [US1] Inventory current routes, header controls, breakpoints, DOM order, map/tile/import requests, geolocation, URL keys, locale keys, account return paths, and failure states in `artifacts/buurtgids/src/App.tsx`, `src/components/GoogleMapView.tsx`, `src/lib/returnPath.ts`, `src/lib/i18n.ts`.
- [ ] T003 [P] [US1] Reconcile the proposed public state with existing Wouter routes/query parameters; document accepted keys, bounds, normalization, duplicate policy, invalid recovery, and sensitive exclusions in `plan.md`.
- [ ] T004 [P] [US1] Confirm existing listings/account/weather OpenAPI contracts express v0.42 behavior; if unchanged, record “no backend/OpenAPI/schema/codegen changes” and add no generated artifacts.
- [ ] T005 [P] [US1] Add deterministic browser fixtures for local/web groups, empty/error, slow response, blocked map, permission denial, and alternate availability in `artifacts/buurtgids/e2e/v042-release.spec.ts`.

## Phase 1 — Shared public state and proposition (US1)

- [ ] T006 [US1] Implement typed allow-listed public discovery state/parser/serializer in `artifacts/buurtgids/src/lib/publicDiscoveryState.ts`; exclude coordinates, account/session IDs, tokens, preferences, and ephemeral menu/focus state.
- [ ] T007 [US1] Add unit tests for valid round trips, bounds, normalization, unknown/duplicate/malformed values, safe defaults, sensitive-value exclusion, and history semantics in `src/lib/publicDiscoveryState.test.ts`.
- [ ] T008 [US1] Add bilingual proposition, current availability, benefits, scope, source/evidence limitation, loading, empty, error, and retry strings in `src/lib/i18n.ts`; include parity tests.
- [ ] T009 [US1] Implement reusable semantic proposition/benefit/availability surface in `src/components/DiscoveryProposition.tsx` (or the inspected equivalent), with one `h1`, one primary action, keyboard disclosure, focus return, and no unsupported claims.
- [ ] T010 [US1] Integrate proposition and availability into homepage and condensed discovery context in `src/App.tsx`; preserve Hague as availability, not product identity.
- [ ] T011 [US1] Make local-only fresh scope explicit and retain explicit Include web results opt-in/source grouping in `src/App.tsx`; preserve existing v0.41 session compatibility.
- [ ] T012 [US1] Connect validated public state to search/navigation/history in `src/App.tsx`; retain criteria through empty/error/retry and do not trigger map/location.
- [ ] T013 [US1] Add BR-01-TC-01–TC-12 and TC-15 browser/integration/content coverage in `e2e/v042-release.spec.ts` and focused unit tests.

## Phase 2 — Shared labelled navigation (US2)

- [ ] T014 [US2] Define typed navigation item model and destination/current-page matchers in `src/components/navigationModel.ts` (or the inspected shared module), including audience visibility and translation keys.
- [ ] T015 [US2] Add navigation model unit tests for route/current matching, desktop/mobile parity, labels, locale keys, and account visibility.
- [ ] T016 [US2] Implement semantic global header/nav, skip link, labelled desktop destinations, language control, account-purpose entry, `aria-current`, and visible focus in `src/components/GlobalNavigation.tsx`/`App.tsx`.
- [ ] T017 [US2] Replace consumer-facing “UserRole user” with approved EN/NL account-purpose copy without changing authorization logic.
- [ ] T018 [US2] Implement mobile menu disclosure with open/close/Escape/outside behavior, scroll safety, focus containment where modal, trigger focus restoration, and no history pollution.
- [ ] T019 [US2] Align destination route, document title, one descriptive `h1`, loading/error/recovery navigation, and current state across covered screens.
- [ ] T020 [US2] Preserve safe `terug` account paths and discovery criteria through sign-in cancel/success; extend `src/lib/returnPath.test.ts` only if route allow-list changes.
- [ ] T021 [US2] Add BR-02-TC-01–TC-16 desktop/mobile, keyboard, locale, URL-security, route, and accessibility coverage in `e2e/v042-release.spec.ts` and existing account specs.

## Phase 3 — Mobile-first discovery (US3)

- [ ] T022 [US3] Refactor homepage/discovery DOM and CSS to mobile-first single-column order in `src/App.tsx` and `src/index.css`; verify 320px, 390×844, landscape, safe area, long Dutch labels, reduced motion, and no page overflow.
- [ ] T023 [US3] Implement accessible progressive filter disclosure/sheet with draft/apply/cancel, clear heading, close/back, result status, history update, retry, and focus restoration in `src/App.tsx` or extracted `MobileFilterSheet.tsx`.
- [ ] T024 [US3] Preserve essential result card/detail facts, source/date/status unknowns, map-independent detail entry, and existing detail snapshot/back state on mobile.
- [ ] T025 [US3] Verify/gate dynamic map import, SDK, tile, and map-data requests behind Show map; add accessible loading/error and Show list/list fallback without changing cluster camera behavior.
- [ ] T026 [US3] Verify Use my location purpose, single permission request, denied/timeout/manual-neighborhood recovery, retry, and no URL coordinate/private persistence.
- [ ] T027 [US3] Preserve criteria across list/map, Back/Forward, retry, detail, account cancel/success, and latest-request-wins behavior; add cancellation/debounce test if current hooks need it.
- [ ] T028 [US3] Add BR-09-TC-01–TC-14 responsive, network, failure, permission, guest/account, locale, focus, and map-blocked coverage in `e2e/v042-release.spec.ts`.
- [ ] T029 [US3] Extend existing `discovery-regression.spec.ts`, `account-preferences.spec.ts`, and saved-event/detail regressions to prove v0.41 behavior remains intact.

## Phase 4 — Convergence and evidence

- [ ] T030 [P] [US1] Add prohibited-claim/content parity checks and verify all new EN/NL keys in `src/lib/i18n.test.ts` or a dedicated content test.
- [ ] T031 [P] [US2] Run accessibility tree/keyboard checks and document screen-reader/manual boundaries; capture BR-02 screenshots only from implemented states.
- [ ] T032 [P] [US3] Run responsive matrix at 320px, 390×844, 844×390, desktop, 200–400% zoom equivalent, reduced motion, and map-blocked states; capture labelled BR-09 evidence.
- [ ] T033 [US1] Run `pnpm run typecheck`, package typechecks, focused unit/API/web tests, focused v0.42 Playwright, inherited Playwright, and `git diff --check`; fix defects before convergence.
- [ ] T034 [US1] Inspect network logs and copied URLs for eager map/location, coordinates, private preferences, account IDs, tokens, raw queries, and stale responses.
- [ ] T035 [US1] Complete `.specify/specs/004-v0-42-proposition-navigation-mobile/convergence.md` with AC/TC evidence, deviations, manual boundaries, exclusions, rollback, screenshots, and exact commands.
- [ ] T036 [US1] Review diff for accidental OpenAPI/generated/schema changes, secrets, unsupported claims, unrelated files, and v0.41 regressions; commit/push only after all gates are green.

## Dependencies and execution order

1. T001–T005 are baseline/setup; T001, T002, T004, and T005 may run in parallel.
2. T006–T008 establish public state/content contracts before integration.
3. T009–T013 deliver independently testable proposition behavior.
4. T014–T021 may begin after route/state inventory, with T016–T020 depending on
   the navigation model and approved copy.
5. T022–T029 depend on state/navigation decisions and preserve v0.41 tests.
6. T030–T034 run in parallel only after implementation stabilizes; T033 must
   complete before T035–T036.

## Definition of done

- [ ] BR-01 AC-01–12 and TC-01–15 have executable evidence or an explicit manual boundary.
- [ ] BR-02 AC-01–12 and TC-01–16 have executable evidence or an explicit manual boundary.
- [ ] BR-09 AC-01–14 and TC-01–14 have executable evidence or an explicit manual boundary.
- [ ] All inherited v0.41 list/scope/accessibility/trust/privacy/map/detail regressions pass.
- [ ] Loading, empty, stale, blocked, permission-denied, unauthorized, and error states are intentional.
- [ ] No backend/OpenAPI/schema/codegen change was made unless justified, generated, and tested.
- [ ] EN/NL parity, WCAG semantics, URL privacy, 320px/400% reflow, and map/location opt-in are verified.
- [ ] Typecheck and relevant tests pass; convergence evidence is recorded.