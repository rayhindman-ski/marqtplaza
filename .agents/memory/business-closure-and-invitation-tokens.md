---
name: Business closure and invitation tokens
description: Why closure is terminal via closed_at, why invitation tokens are HMAC-derived per outbox row, and why invitation return paths must never carry the token.
---
**Rules**
- Closing a business is the existing publication "unpublish" action taken by the owner: every non-archived status ends `unpublished`, a `business_reviews` row (decision unpublish, reason closed) is written, and `closed_at` is terminal — reviewer publish/suspend, member revision routes and legacy owner PATCH must all check `closed_at`.
- Invitation tokens are derived (HMAC under SESSION_SECRET from invitation id + outbox id), digest-only stored, one digest per outbox row. A same-row retry reproduces the same link; a new outbox row supersedes.
- Return paths (API `sanitizeReturnRef` and web `sanitizeReturnPath`) strip `token`; the browser parks the invitation token in localStorage and re-attaches it on the bare `/account/uitnodiging` page.
- Superseded invitation links deliberately read as `invalid`, not `revoked`.

**Why:** an architect review found a closed business could be republished by a reviewer and edited through the legacy route; allow-listing the token-bearing return path would have persisted the raw token on the registration row; random per-attempt tokens left multiple valid digests per row.

**How to apply:** any new business-owned write route must gate on `closed_at`; any new secret-carrying page must strip its secret from return paths and use a browser-side handoff; membership tests that add rehearsal members must remove *their own* member (find `isSelf` under the invitee), not "the first manager".
