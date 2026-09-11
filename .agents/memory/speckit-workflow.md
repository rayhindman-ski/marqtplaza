---
name: Spec Kit workflow
description: Project-local Spec-Driven Development rules and where feature intent is recorded.
---

The repository uses a lightweight, project-local Spec Kit workflow under
`.specify/`: constitution, feature specification, implementation plan, tasks,
implementation, and convergence. The constitution adapts Spec Kit to
buurtplaza's source-provenance, OpenAPI, privacy, moderation, integration
failure, localization, and accessibility constraints.

**Why:** These product invariants are easy to lose when work starts from an
ad-hoc prompt, while the existing runtime and generated-client conventions
already need cross-cutting decisions to be explicit.

**How to apply:** For non-trivial feature work, create a numbered feature
directory with `pnpm speckit:new -- "short name"`, complete the spec and plan
before implementation, then record convergence evidence. Do not add this
process to trivial copy or dependency-only changes. Generated task templates
may wrap placeholder lines, so replace the scaffold with the exact completed
task list when context-based patching cannot match the wrapped text.