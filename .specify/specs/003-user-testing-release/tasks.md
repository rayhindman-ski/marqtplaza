# Tasks: User Testing Release

**Spec**: `.specify/specs/003-user-testing-release/spec.md`  
**Plan**: `.specify/specs/003-user-testing-release/plan.md`  
**Status**: Complete

## Phase 1 — Contract and provider mapping

- [x] T001 [US3] Add optional Food & Drink type to `lib/api-spec/openapi.yaml`.
- [x] T002 [US3] Map Google and OSM provider evidence in `artifacts/api-server/src/routes/listings.ts`.
- [x] T003 [US3] Regenerate API clients with `pnpm --filter @workspace/api-spec run codegen`.
- [x] T004 [US3] Cover mapping and filtering in focused API tests.

## Phase 2 — Result access and recovery

- [x] T005 [US1] Reveal cluster members from `artifacts/buurtgids/src/components/GoogleMapView.tsx`.
- [x] T006 [US1] Make `MarkerCard` an accessible collapsed disclosure in `artifacts/buurtgids/src/App.tsx`.
- [x] T007 [US2] Add persisted live retry for stored-only cache misses in `artifacts/buurtgids/src/App.tsx`.
- [x] T008 [US3] Add localized Food & Drink subtype filtering in `artifacts/buurtgids/src/App.tsx`.
- [x] T009 [US3] Replace implied recency with unknown-date copy in the news feed and article detail.

## Phase 3 — Verification and release

- [x] T010 Cover cluster, disclosure, cache retry, filters, dates, and prices in regression tests.
- [x] T011 Run typecheck, API/web tests, and production build.
- [x] T012 Inspect the running preview and logs.
- [x] T013 Record convergence evidence and close the spec.
- [x] T014 Commit/push `feature/speckit-v1` and create the GitHub release.

## Definition of done

- [x] All acceptance scenarios pass.
- [x] Loading, empty, unknown, and provider failure states are intentional.
- [x] OpenAPI outputs are regenerated.
- [x] No unverified event/social claims or unsupported source data are added.
- [x] GitHub release notes distinguish shipped fixes from deferred source coverage.