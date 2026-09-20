# Tasks: Event Source Evidence

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

- [x] T001 [P] [US1] Define evidence statuses and acceptance fixtures in `spec.md`
- [x] T002 [P] [US1] Add focused route fixtures in `artifacts/api-server/src/routes/listings-query.test.ts`

## Phase 2 — Foundational

- [x] T003 [US1] Add `event_source_statuses` schema and export it from `lib/db/src/schema/index.ts`
- [x] T004 [US1] Add `ListingsResponse.evidence` to `lib/api-spec/openapi.yaml`
- [x] T005 [US1] Regenerate OpenAPI client and schemas with `pnpm --filter @workspace/api-spec codegen`

## Phase 3 — User Story 1 (P1)

**Goal**: [independently valuable outcome]

- [x] T006 [US1] Persist scan status in `artifacts/api-server/src/routes/sources.ts`
- [x] T007 [US1] Build evidence summary and explicit event states in `artifacts/api-server/src/routes/listings.ts`
- [x] T008 [US1] Cover verified, blocked, empty, and unavailable states in `artifacts/api-server/src/routes/listings-query.test.ts`

## Phase 4 — User Story 2 (P2)

**Goal**: [independently valuable outcome]

- [x] T009 [US2] Render evidence, stale, and explicit empty state in `artifacts/buurtgids/src/App.tsx`
- [x] T010 [US2] Add localized evidence copy in `artifacts/buurtgids/src/lib/i18n.ts`

## Phase 5 — Polish and convergence

- [x] T011 [P] [US1] Update accessibility and responsive evidence presentation in `artifacts/buurtgids/src/App.tsx`
- [x] T012 [P] [US1] Update feature convergence notes in `.specify/specs/001-event-source-evidence/convergence.md`
- [x] T013 [US1] Run schema, codegen, typecheck, focused tests, and preview verification
- [x] T014 [US1] Review deviations against constitution and close the spec

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
- [x] OpenAPI outputs are regenerated after contract changes.
- [x] No secrets or unsupported source claims were added.
- [x] Convergence notes are recorded in the feature directory.
