---
name: Recent-authentication gate
description: How step-up/recent-auth is proven for sensitive account actions (export, e-mail change, deletion).
---
Use Clerk's `fva` session claim (minutes since first-factor verification, `fva[0]`; -1 = never) with a 10-minute threshold; when `fva` is absent, fall back to the backend session `createdAt` via `sid`; fail closed with `RECENT_AUTH_REQUIRED`.

**Why:** JWT `iat` is token issuance, not authentication time — a refreshed token makes an old session look fresh (architect finding, v0.5.3).

**How to apply:** any new OFF-002-style mutation reuses `requireRecentAuth` with injected clock + session loader in tests; the web shows the shared RecentAuthPrompt with a `?terug=` return path, which means the route must be in both return-path allow-lists (web `returnPath.ts` and API `consumerRegistration.ts`).
