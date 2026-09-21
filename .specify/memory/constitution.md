# buurtplaza.nl Constitution

## Product intent

buurtplaza.nl is a hyperlocal guide for discovering trustworthy businesses,
events, food and drink, social-support locations, local news, deals, and
community activity in Dutch neighborhoods. It should feel useful even when
external sources are incomplete or unavailable.

## Core principles

### I. User value is delivered as a vertical slice

Every feature starts with a user journey and a concrete outcome. Prefer a
small, independently testable slice over broad infrastructure without a
demonstrable user benefit. Each prioritized story must be valuable on its own
and must include acceptance scenarios.

### II. Local truth beats invented completeness

Listings, events, news, deals, and map content must preserve source identity,
freshness, and uncertainty. Never invent missing local data, silently merge
unrelated categories, or turn blocked or failed sources into an apparently
successful empty result. Events remain events; they must not fall back to
generic attractions or businesses.

### III. Contracts are the shared language

Backend behavior is defined OpenAPI-first and validated with Zod. Generated
clients and schemas are derived artifacts, not hand-edited sources of truth.
Any contract change must include regeneration and a plan for compatibility,
migration, or an intentional breaking change.

### IV. Privacy, moderation, and ownership are explicit

Authentication uses the approved Clerk integration. Community contributions
are moderated before public display. Business claims resolve against current
listings and protect ownership transitions. Do not add public profiles,
private messaging, credential handling, or client-side authorization shortcuts
without an explicit specification and privacy review.

### V. External integrations fail independently and visibly

Provider failures, quota limits, stale data, and lineage failures must be
represented as distinct states. Stored-only, cached, live-provider, and
fallback behavior must not overwrite one another or hide an error. Outbound
loaders are injected at boundaries so provider behavior can be tested without
reaching real services.

### VI. Accessible, localized, and responsive by default

User-facing work supports Dutch and English where the product surface does.
Routes, labels, errors, dates, and empty states are localized consistently.
Keyboard access, semantic controls, visible focus, readable contrast, reduced
motion, mobile layouts, and the artifact base path are acceptance criteria,
not post-launch polish.

### VII. Small changes preserve operational clarity

Keep the existing pnpm workspace boundaries, generated-client workflow,
separate web/API services, structured server logging, and environment-based
secrets. Prefer the smallest change that satisfies the specification. New
dependencies, schema changes, new providers, or broad refactors require an
explicit rationale in the plan.

### VIII. Approved product behavior is a binding baseline

Feature plans must start from the approved, working product behavior and may not
silently reinterpret or replace it. Responsive, accessibility, privacy, or
testing work may strengthen that baseline but does not authorize a different
product direction. Any change from map-first to list-first, desktop-first to
mobile-first, always-visible to opt-in, or an equivalent behavioral reversal
requires an explicit user requirement recorded in the spec. When a new plan
conflicts with an existing acceptance test, resolve the conflict against the
approved product requirement; do not label the protection “stale” and rewrite
the test merely to make the new plan pass.

Development fixtures, seeded cities, test datasets, provider limits, and
assessment baselines are implementation constraints, not product features.
Never advertise them as customer-facing availability, launch geography, market
positioning, or a permanent product boundary unless the user explicitly defines
that product requirement.

## Required quality gates

Before implementation:

- The spec names the user, the problem, the priority, and independent
  acceptance scenarios.
- Out-of-scope behavior and unresolved assumptions are visible.
- The plan identifies affected API contracts, persistence, integrations,
  localization, accessibility, and fallback states.
- The plan states whether OpenAPI code generation is required.

Before considering a feature complete:

- Acceptance scenarios are covered by focused tests or a documented reason why
  a manual check is the correct boundary.
- Typecheck and relevant package checks pass.
- OpenAPI-generated outputs are regenerated after contract changes.
- Error, empty, loading, stale, and blocked-source states are intentional.
- No secrets, personal data, or unsupported claims were added to the client or
  repository.
- A convergence review records deviations, follow-up work, and evidence.

## Governance

This constitution is the highest-level project guidance for feature work. If
another document conflicts with it, resolve the conflict in the plan and
update the constitution when the rule should apply to future work. A change to
these principles requires a dated rationale, an impact review of active specs,
and an explicit version increment.

**Version**: 1.1.0
**Ratified**: 2026-09-11  
**Last Amended**: 2026-09-21

**Amendment rationale (1.1.0):** An agent-authored release plan introduced a
mobile-first, list-first, opt-in-map direction without a user requirement and
then weakened conflicting map regressions. Principle VIII makes the approved
product baseline binding. Active v0.42 and v0.43 specs and plans were corrected
to restore the desktop map-first contract and explicit neighborhood highlighting.
