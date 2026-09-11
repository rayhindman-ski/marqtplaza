# Speckitify proposal for buurtplaza.nl

**Date:** 2026-09-11  
**Status:** Applied as a project-local baseline  
**Reference:** [GitHub Spec Kit](https://github.com/github/spec-kit)

## Executive summary

This project now has a local Spec Kit foundation for Spec-Driven Development.
The goal is to make refinement faster by moving recurring decisions out of
chat-only context and into short, reviewable documents that guide each
implementation slice:

```text
Constitution → Specification → Plan → Tasks → Implement → Converge
```

The foundation is intentionally lightweight. It does not replace the existing
pnpm, OpenAPI, database, testing, or Replit workflows. It adds a common
decision format around them.

## What has been applied

### 1. Project constitution

`.specify/memory/constitution.md` defines the rules that should shape every
future feature:

- user value must be delivered as an independently testable vertical slice;
- local source truth and provenance beat invented completeness;
- OpenAPI, Zod, and generated clients stay synchronized;
- privacy, moderation, and business ownership are explicit;
- external provider failures remain visible and independent;
- Dutch/English localization, accessibility, responsiveness, and base-path
  routing are part of acceptance;
- changes stay small, observable, and consistent with the existing workspace.

This turns important product constraints already present in the project into a
repeatable quality gate instead of relying on someone remembering them.

### 2. Reusable document templates

The following templates are available under `.specify/templates/`:

- `spec-template.md` — problem, users, prioritized scenarios, requirements,
  data/contracts, edge cases, and measurable success criteria;
- `plan-template.md` — constitution check, technical context, affected
  surfaces, research decisions, implementation phases, risks, and
  verification;
- `tasks-template.md` — dependency-aware task IDs, user-story traceability,
  parallel work markers, and definition of done.

### 3. Feature workspace

Feature documents live in `.specify/specs/` using numbered directories such as:

```text
.specify/specs/001-event-source-review/
├── spec.md
├── plan.md
├── tasks.md
└── convergence.md
```

The numbered structure makes related decisions easy to find without mixing
them into source code or losing them in chat history.

### 4. Small scaffolding helpers

These root commands are available:

```bash
pnpm speckit:check
pnpm speckit:new -- "short feature name"
pnpm speckit:plan -- .specify/specs/001-short-feature
```

They only validate or create planning documents. They do not install packages,
change application data, run migrations, or mutate feature code.

## Proposed development approach

### Step 1 — State the outcome

Start with the user problem, not a proposed component or API endpoint. Include
the primary user, why the work matters, what is out of scope, and which story
is the smallest valuable release.

Example prompt:

```text
/speckit.specify Improve how residents understand why a local event is shown
or omitted. Preserve source provenance, distinguish blocked sources from empty
results, and keep the existing event-only behavior.
```

The resulting `spec.md` should describe observable behavior and acceptance
scenarios. It should not prematurely lock the implementation.

### Step 2 — Resolve the implementation shape

Use `plan.md` to decide which packages and contracts change:

- whether the OpenAPI contract changes;
- whether generated React hooks and Zod schemas must be regenerated;
- whether the PostgreSQL schema or migrations change;
- which provider or source boundaries are involved;
- which localized UI states and responsive behavior are required;
- how failure, stale, empty, blocked, and unauthorized states behave.

The constitution check makes hidden project rules visible before code is
written.

### Step 3 — Make work executable

Use `tasks.md` to turn the plan into small tasks with:

- a stable ID;
- a user-story label;
- an exact file, module, or verification boundary;
- dependencies;
- `[P]` markers only where parallel work is safe.

This is where a broad request becomes work that can be implemented in
sequence, paused, reviewed, or delegated without losing intent.

### Step 4 — Implement and converge

During implementation, update the documents when a decision changes. At the
end, compare the actual result with:

1. the user scenarios and acceptance criteria;
2. the technical plan;
3. the constitution;
4. the verification evidence.

The result is not “the code compiled”; it is a clear statement of what was
delivered, what intentionally changed, and what remains deferred.

## Expected improvements

These are expected process improvements, not guaranteed time savings. Measure
them against the current baseline after a few feature cycles.

### Faster refinement

Ambiguities are surfaced in the specification before they become UI or API
work. This should reduce back-and-forth edits caused by missing edge cases,
unclear priorities, or an unspoken definition of “done.”

### More reliable AI implementation

The agent receives the same product rules, contract constraints, fallback
expectations, and acceptance scenarios every time. This should reduce generic
implementations that look complete but violate local data, privacy, event, or
source-lineage rules.

### Better change impact analysis

The plan explicitly names frontend, API, generated-client, database,
integration, localization, and test surfaces. This should make downstream
work visible earlier, especially for OpenAPI changes and provider behavior.

### Smaller, safer releases

Prioritized user stories and task dependencies encourage vertical slices. This
should make it easier to ship a useful P1 without waiting for every secondary
workflow and easier to pause after a verified milestone.

### Faster recovery from changes

Specs and plans preserve intent separately from implementation details. When a
requirement changes, the affected document can be updated before code is
rewritten. This should lower the cost of exploring alternative solutions and
reduce accidental drift.

### Stronger trust and compliance behavior

The constitution makes provenance, moderation, ownership, privacy, blocked
sources, stale data, and external failure states explicit. This should reduce
silent failure modes that are particularly damaging in a local discovery
product.

### More useful review

Reviews can ask whether acceptance scenarios pass and whether the constitution
was respected, rather than reviewing a large diff without the original
reasoning. Convergence notes provide a compact handoff for future work.

## Suggested first feature cycles

Use Spec Kit for changes that cross boundaries or have meaningful product
risk. Good candidates in this project are:

1. event discovery and source-evidence refinement;
2. neighborhood/category result quality and ranking;
3. business claim and owner workspace improvements;
4. community moderation and participation changes;
5. saved-event synchronization and account transitions.

Do not require a full specification for a one-line copy correction or a
mechanical dependency update. The constitution is a guide for useful
discipline, not a reason to add paperwork to trivial edits.

## How this fits the existing project

Spec Kit adds a planning layer; it does not change the runtime architecture:

| Existing project practice | Spec Kit connection |
| --- | --- |
| OpenAPI-first backend contracts | Record contract impact in the plan and regenerate after changes |
| Generated React/Zod clients | Treat generated output as derived and verify it in tasks |
| PostgreSQL/Drizzle | Identify schema, migration, seed, and rollback needs before implementation |
| Clerk authentication | Specify roles and authorization boundaries; do not invent local auth |
| Provider/source lineage | Make source status and fallback behavior acceptance criteria |
| Replit workflows | Put the relevant typecheck, test, and preview checks in the verification plan |
| `.agents/memory/` | Keep durable agent lessons there; keep feature intent in `.specify/specs/` |

## Optional official CLI adoption

The repository currently uses the project-local templates and scripts so the
workflow is available immediately without adding a Python toolchain or
rewriting existing agent configuration. If a team later wants the official
Specify CLI, it can be installed outside the application dependency graph and
pointed at this project after checking its generated files against the local
constitution.

The official command sequence is:

```text
/speckit.constitution
/speckit.specify
/speckit.plan
/speckit.tasks
/speckit.implement
/speckit.converge
```

The local documents are compatible with that conceptual flow, while the
project remains free to use Replit Agent or another supported coding agent.

## Measuring whether it helps

After three to five non-trivial feature cycles, compare against the prior
working style:

- time from request to an implementation-ready plan;
- number of clarification rounds before coding;
- number of files or contracts discovered late;
- percentage of acceptance scenarios covered on first delivery;
- regressions caused by missing fallback, localization, or authorization
  states;
- time to explain or safely resume paused work.

If the documents become a burden, shorten the templates or use Spec Kit only
for cross-cutting and user-visible work. The purpose is faster, clearer
delivery—not more ceremony.
