# Tasks: [FEATURE NAME]

**Spec**: [relative path to spec.md]  
**Plan**: [relative path to plan.md]  
**Status**: Not started | In progress | Converged

## Task format

Use `T### [P] [US#] description`:

- `[P]` means the task can run in parallel because it touches different files
  and has no unfinished dependency.
- `[US#]` maps the task to a prioritized user story.
- Every task names an exact file, module, command, or verification boundary.

## Phase 1 — Setup

- [ ] T001 [P] [US1] [Create or update contract/fixture] in `[path]`
- [ ] T002 [P] [US1] [Add focused test] in `[path]`

## Phase 2 — Foundational

- [ ] T003 [US1] [Implement shared type/schema/service boundary] in `[path]`
- [ ] T004 [US1] [Regenerate OpenAPI client and schemas] with `[command]`

## Phase 3 — User Story 1 (P1)

**Goal**: [independently valuable outcome]

- [ ] T005 [US1] [Implement backend behavior] in `[path]`
- [ ] T006 [US1] [Implement frontend behavior] in `[path]`
- [ ] T007 [US1] [Cover acceptance scenarios and failure states] in `[path]`

## Phase 4 — User Story 2 (P2)

**Goal**: [independently valuable outcome]

- [ ] T008 [US2] [Implement behavior] in `[path]`
- [ ] T009 [US2] [Cover acceptance scenarios] in `[path]`

## Phase 5 — Polish and convergence

- [ ] T010 [P] [US1] [Update translations/accessibility/responsive states] in
  `[path]`
- [ ] T011 [P] [US1] [Update documentation and quickstart] in `[path]`
- [ ] T012 [US1] [Run verification commands and record evidence]
- [ ] T013 [US1] [Review deviations against constitution and close the spec]

## Dependencies and execution order

1. T001–T002 can run in parallel.
2. T003–T004 depend on setup.
3. User-story tasks depend on the foundational phase.
4. Polish and convergence depend on all selected stories.

## Definition of done

- [ ] All selected acceptance scenarios pass.
- [ ] Loading, empty, stale, blocked, unauthorized, and error states are
  intentional where applicable.
- [ ] Relevant typecheck and tests pass.
- [ ] OpenAPI outputs are regenerated after contract changes.
- [ ] No secrets or unsupported source claims were added.
- [ ] Convergence notes are recorded in the feature directory.
