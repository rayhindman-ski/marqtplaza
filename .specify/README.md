# Spec Kit for buurtplaza.nl

This directory contains the project-local conventions for Spec-Driven
Development (SDD). It is intentionally kept in the repository so every
future feature starts from the same product principles and produces the same
decision trail.

## Workflow

Use the following sequence for a meaningful feature, behavior change, or
cross-cutting refactor:

1. **Constitution** — check the governing principles in
   `memory/constitution.md`.
2. **Specify** — create a feature directory in `specs/` and write `spec.md`
   using `templates/spec-template.md`.
3. **Plan** — write `plan.md` using `templates/plan-template.md`. Resolve
   unknowns before implementation.
4. **Tasks** — write `tasks.md` using `templates/tasks-template.md`. Tasks
   must map back to user stories and be independently verifiable where
   possible.
5. **Implement** — execute tasks in dependency order. Keep the spec, plan,
   and tasks current when the decision changes.
6. **Converge** — compare the delivered behavior with the spec, constitution,
   and acceptance scenarios. Record any intentional deviation.

With the official Specify CLI, these phases correspond to:

```text
/speckit.constitution
/speckit.specify
/speckit.plan
/speckit.tasks
/speckit.implement
/speckit.converge
```

When using Replit Agent without the CLI, use the same names as prompts and
point the agent at the relevant files in this directory.

## Local commands

```bash
pnpm speckit:check
pnpm speckit:new -- "short feature name"
pnpm speckit:plan -- .specify/specs/001-short-feature
```

The scaffold scripts do not install dependencies or change application code.
They only create and validate planning documents.

## Directory contract

```text
.specify/
├── memory/constitution.md       # project principles and quality gates
├── scripts/                     # small, dependency-free helpers
├── specs/                       # one directory per feature or change
└── templates/                   # spec, plan, and task document templates
```

Feature directories use a three-digit sequence and a short kebab-case name,
for example `.specify/specs/001-event-source-review/`.
