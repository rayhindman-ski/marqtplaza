---
name: Business intake integrity rules
description: Durable architectural rules for the flag-gated business intake, claim review, listing resolution, and idempotent creation.
---
- Gate intake routes per-route, mounted after the legacy router. **Why:** legacy editor moderation shares the `/business-claims` prefix; a prefix gate hides the queue while the flag is off. **How to apply:** keep a flag-off test on a neighbouring legacy route.
- Reviewer decisions carry the claim version the reviewer saw and apply conditionally on it; audit rows record that reviewed version. Editors who belong to the business may not decide its claims (re-check inside the transaction). **Why:** stale or self-interested review must never grant ownership.
- New-business submissions re-check public duplicates and require explicit confirmation; "one open claim per profile" alone is not accepted as duplicate handling.
- Resolve offered listings trusted-first: published profile row → stored provider results → live provider. **Why:** live Google Places resolution is disabled, so a live-only resolver makes offered Google listings unclaimable. Keep one test on the production resolver chain.
- Idempotent creation: store the exact raw key (unique per claimant) and the payload digest in separate columns; on the unique-index loser, re-read and replay or 409. Drizzle wraps pg errors — check `error.cause` for `23505`.
- Workspace claim cards render status labels independent of the feature flag; only gated actions depend on it.
- OpenAPI descriptions containing backticks must be quoted YAML strings.
