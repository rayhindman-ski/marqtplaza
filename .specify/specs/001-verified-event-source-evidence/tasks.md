# Tasks: Verified Event Source Evidence

**Spec**: [relative path to spec.md]  
**Plan**: [relative path to plan.md]  
**Status**: Converged

## Task format

Use `T### [P] [US#] description`:

- `[P]` means the task can run in parallel because it touches different files
  and has no unfinished dependency.
- `[US#]` maps the task to a prioritized user story.
- Every task names an exact file, module, command, or verification boundary.

## Phase 1 — Setup

- [x] T001 [P] [US1] Confirm the existing `SourceScanResult` and `Listing` contracts in `lib/api-spec/openapi.yaml`.
- [x] T002 [P] [US1] Map the approved-source and publication evidence boundaries in `artifacts/api-server/src/routes/sources.ts`.

## Phase 2 — Foundational

- [x] T003 [US1] Verify the shared source identity, event URL, eligibility metrics, status, and timestamp fields across API and web consumers.
- [x] T004 [US1] Confirm OpenAPI regeneration is not required because no contract changed.

## Phase 3 — User Story 1 (P1)

**Goal**: Residents can distinguish verified upcoming events from unpublishable or empty source results.

- [x] T005 [US1] Verify source event extraction and publication checks in `artifacts/api-server/src/routes/sources.ts`.
- [x] T006 [US1] Verify source lineage and explicit empty event behavior in `artifacts/api-server/src/routes/listings.ts` and `artifacts/buurtgids/src/App.tsx`.
- [x] T007 [US1] Cover verified, ineligible, and no-events scenarios with `artifacts/api-server/src/routes/sources.test.ts` and existing discovery query tests.

## Phase 4 — User Story 2 (P2)

**Goal**: Editors can distinguish blocked sources and users are not shown false freshness.

- [x] T008 [US2] Verify blocked/failed source messaging and independent result rendering in `artifacts/buurtgids/src/pages/SourceDirectoryView.tsx`.
- [x] T009 [US2] Cover stale timestamp behavior in `artifacts/buurtgids/src/lib/listingPresentation.test.ts`.

## Phase 5 — Polish and convergence

- [x] T010 [P] [US1] Confirm localized loading, empty, blocked, and error states in `artifacts/buurtgids/src/App.tsx` and `artifacts/buurtgids/src/pages/SourceDirectoryView.tsx`.
- [x] T011 [P] [US1] Record scope, contract decisions, and deferred expiry policy in `convergence.md`.
- [x] T012 [US1] Run focused tests and package typechecks; record evidence in `convergence.md`.
- [x] T013 [US1] Review deviations against the constitution and close the spec.

## Dependencies and execution order

1. T001–T002 can run in parallel.
2. T003–T004 depend on setup.
3. User-story tasks depend on the foundational phase.
4. Polish and convergence depend on all selected stories.

## Definition of done

- [x] All selected acceptance scenarios pass.
- [x] Loading, empty, stale, blocked, unauthorized, and error states are
  intentional where applicable.
- [x] Relevant typecheck and tests pass.
- [x] OpenAPI outputs are unchanged because no contract changed.
- [x] No secrets or unsupported source claims were added.
- [x] Convergence notes are recorded in the feature directory.