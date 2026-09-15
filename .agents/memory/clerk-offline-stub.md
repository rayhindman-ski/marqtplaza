---
name: Clerk offline Frontend API stub
description: How to drive real Clerk components in the default Playwright suite without a live Clerk instance.
---
Stub the Clerk Frontend API host with a single regex `page.route`: answer `/v1/environment` (note: clerk-js sends it as **POST**, not GET) with a recorded environment payload that has `user_settings.sign_up.captcha_enabled=false`, `/v1/client` with a hand-built client, `/v1/dev_browser` with any id, and abort `challenges.cloudflare.com`. Only the `/npm/@clerk/...` bundles (clerk-js plus several lazy clerk-ui chunks) must come from the CDN; cache them under `node_modules/.cache` so re-runs are network-free.

**Why:** No local copy of clerk-js exists in the workspace, so the hook-based test auth cannot exercise Clerk's own screens. A stubbed client with `sign_up: null` vs. a `sign_up_attempt` with an id is enough to drive the stale verification-step guard without any Clerk network state.

**How to apply:** See `e2e/signup-stale-step.spec.ts` and `e2e/fixtures/clerk-environment.json`. If Clerk changes its environment schema, re-record the fixture from `https://<fapi>/v1/environment` and disable captcha again.
