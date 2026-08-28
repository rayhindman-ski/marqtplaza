---
name: Saved-event sync ownership
description: Durable account-isolation and conflict rules for syncing browser-saved events.
---

Signed-in saved-event state must not be mirrored into the anonymous browser collection. Treat browser events as consumable migration input, key hydration to the actual account identity, and send later changes as individual operations rather than resending the whole device snapshot. Preserve account deletions as tombstones so old browser data cannot recreate them.

**Why:** A boolean signed-in flag does not protect direct account switches, and full-state uploads from a stale device can resurrect events removed elsewhere. Retaining signed-in data in anonymous storage can also expose or migrate one account's events into another account.

**How to apply:** Any future saved-event sync change must preserve identity-aware hydration, mutation queuing during hydration, operation-only updates, server-side ownership checks, and migration-aware deletion tombstones.