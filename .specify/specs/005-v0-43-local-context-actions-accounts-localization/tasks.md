# Tasks: v0.43 local context, actions, accounts, and localization

**Spec**: `spec.md`  
**Plan**: `plan.md`  
**Status**: Implemented; convergence recorded

## Phase 1 — Reconcile and test setup

- [x] T001 [P] [US1] Audit BR-05 against current discovery contracts and tests.
- [x] T002 [P] [US2] Audit BR-10 result/action contracts and tests.
- [x] T003 [P] [US3] Audit BR-11 Clerk, favourites and lifecycle contracts.
- [x] T004 [P] [US4] Audit BR-12 catalogs, routes and parity tests.
- [x] T005 [P] [US1] Add URL-state unit coverage in
  `artifacts/buurtgids/src/lib/discoveryUrlState.test.ts`.
- [x] T006 [P] [US4] Extend catalog/formatting coverage in
  `artifacts/buurtgids/src/lib/i18n.test.ts`.
- [x] T007 [P] [US1-US4] Add release journeys in
  `artifacts/buurtgids/e2e/v043-release.spec.ts`.

## Phase 2 — Shared public state and locale

- [x] T008 [US1] Implement validated public state in
  `artifacts/buurtgids/src/lib/discoveryUrlState.ts`.
- [x] T009 [US1] Add stable URL identifiers for Hague neighbourhoods/categories
  while preserving canonical API labels in `src/lib/data.ts`.
- [x] T010 [US4] Make URL locale authoritative and history-safe in `src/App.tsx`.
- [x] T011 [US4] Add complete semantic resources and formatting helpers in
  `src/lib/i18n.ts`.

## Phase 3 — BR-05 local context

- [x] T012 [US1] Wire validated criteria and canonical URL updates in `src/App.tsx`.
- [x] T013 [US1] Add unsupported-city and optional-map failure recovery.
- [x] T014 [US1] Preserve unaffected criteria and usable list through recovery.

## Phase 4 — BR-10 result-to-action

- [x] T015 [US2] Reconcile filter/card/detail fields with real listing contracts.
- [x] T016 [US2] Gate route/source actions by exact coordinates and safe URLs.
- [x] T017 [US2] Keep partial/provider errors non-destructive and scope-stable.

## Phase 5 — BR-11 account and favourites

- [x] T018 [US3] Tie optional account prompts to verified save/privacy benefits.
- [x] T019 [US3] Preserve sanitized public context through auth detours.
- [x] T020 [US3] Verify and repair owner-isolated save/sign-out/switch/deletion states.

## Phase 6 — BR-12 localization and accessibility

- [x] T021 [US4] Localize route fallback, dynamic errors, actions and account states.
- [x] T022 [US4] Enforce catalog key/placeholder parity and source attribution.
- [x] T023 [US4] Verify document language, focus, keyboard, 320px and 400% reflow.

## Phase 7 — Convergence

- [ ] T024 Run focused unit/API tests and resolve failures. Blocked by the pre-existing
  development database missing lifecycle tables/columns declared in the current schema.
- [x] T025 Run workspace typecheck and production build; resolve failures.
- [x] T026 Run v0.43 plus inherited v0.42/discovery browser suites.
- [x] T027 Inspect EN/NL desktop/mobile screenshots and workflow/browser logs.
- [x] T028 Record exact results and deviations in `convergence.md`.

## Dependencies and execution order

1. T005–T007 establish executable acceptance boundaries.
2. T008–T011 provide state/localization foundations.
3. T012–T023 build four vertical slices on those foundations.
4. T024–T028 converge only after all implementation tasks.

## Definition of done

- [ ] BR-05/10/11/12 selected scenarios pass in both locales.
- [ ] Guest discovery remains complete, local-only, list-first and map-optional.
- [ ] Public URLs contain only validated public criteria.
- [ ] Actions and account benefits match inspected contracts.
- [ ] Favourite state is confirmed only after owner-scoped persistence.
- [ ] Loading, empty, partial, blocked, unauthorized and error states are intentional.
- [ ] Workspace typecheck, build, focused and inherited tests pass.
- [ ] No secrets, invented data/actions or unsupported source claims were added.
- [ ] Convergence evidence and manual-review boundaries are recorded.