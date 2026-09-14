---
name: Onboarding spec baseline
description: Which document is authoritative for consumer-account and business-onboarding work, and why the archived plan must not be followed literally.
---

For consumer accounts, business intake, review/publication, and lifecycle
work, the authoritative intent lives in
`.specify/specs/002-consumer-accounts-and-business-onboarding/`. The archived
`doc/md/version-v.03.md` is a verbatim historical proposal.

**Why:** The archived plan was written for an older product shape (campaign
weekend guide, no auth, no business tables, `/weekend-guide/` base). The
repository already has Clerk, research registration, claims, owner profiles,
deals, and editor moderation, and uses Dutch-slug routes with language as UI
state. Following the archived paths or "select an auth provider" steps would
duplicate existing surfaces.

**How to apply:** Start from the spec's reconciliation table and gate list.
Keep new entry points behind disabled-by-default flags; treat owner/legal/
operator questions (Q1–Q8 in convergence.md) as gates, not defaults. Existing
`business_profiles` rows must stay published when revisions are introduced.
