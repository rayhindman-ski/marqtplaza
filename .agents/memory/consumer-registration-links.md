---
name: Consumer registration links
description: Rules for pre-account registration links minted at outbox dispatch; enumeration-safe request path; fail-closed error envelope.
---

**Rules**
- Tokens are minted in the email loader at dispatch, only the digest is stored. Only the *newest* outbox row for a registration may mint; a stale row fails permanently (`registration_send_superseded`). Minting supersedes tokens of other rows but keeps tokens of the same row valid.
- The identity-provider existence lookup runs first for *every* valid submit, before registration state is read.
- Consumer-facing registration routes carry a router-scoped error handler that answers `DEPENDENCY_UNAVAILABLE` and logs only `{name, code}` of the error.
- Server-side `returnRef` uses the same route allow-list as the web `returnPath` helper.

**Why:** A provider may deduplicate a retried send by idempotency key and deliver the *first* body, so re-minting on retry would ship a dead link; an old queued row retried after a resend would otherwise supersede the newer link. Reading registration state before the lookup made an outage a status oracle (202 for pending vs 503 for others). Express 5's default handler echoes failed SQL including parameters (addresses) as HTML; the app has no global error middleware.

**How to apply:** Any new pre-account link flow (invites, magic links) should reuse the same generation guard, uniform dependency path, and fail-closed handler. Resend inside the cooldown right after the first request is a silent 202 (cooldown measured from `last_sent_at`), which is intentional.
