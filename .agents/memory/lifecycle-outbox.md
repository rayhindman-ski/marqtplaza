---
name: Lifecycle outbox and deletion requests
description: Durable decisions for application-owned notifications and account deletion requests.
---
- Enqueue notifications inside the same transaction as the business/account state change, never after commit.
  **Why:** provider failure must not roll back a transition, and a crash between commit and enqueue would lose the intent.
  **How to apply:** any new lifecycle transition passes its `tx` to the notify helpers.
- Dedupe keys come from immutable identifiers (review-row id, claim id + version + status), never timestamps or free text.
- Outbox payloads are a scalar allow-list of business identifiers; contact data, evidence, reviewer notes, and tokens are rejected at enqueue.
- Delivery attempt numbering is monotonic for the life of a row. A support resend extends the retry budget; it never resets `attempts`, because attempt history is append-only and unique per attempt number.
- Delivery is release configuration: with no provider configured rows stay `queued` without consuming attempts; the log loader is dev-only.
- Sole-owner deletion blocking only counts `published`/`suspended` businesses, so support's "unpublish" resolution clears the blocker; drafts never block.
- Retention periods, deadlines, and erasure are open operator gates: UI copy must not promise timelines, and completing a request is a soft state only.
- Suspended/deleted application accounts must be refused on every authenticated account-owned route (saved events, business memberships, claims), not only under `/account`.
  **Why:** the Clerk session stays valid after a support-completed deletion and retained data would otherwise remain reachable.
- Messages whose recipient account row no longer exists are cancelled (`recipient_gone`) rather than dispatched.
- Real delivery is chosen only by an explicit provider name plus complete config (key, approved sender, receipt secret); startup must fail on partial config rather than fall back.
  **Why:** gate Q5 requires an operator-approved sender identity; an API key lying around must never start sending.
- The provider idempotency key must stay identical across automatic retries of one row and change only on an explicit support resend.
  **Why:** a send can be accepted remotely while the response is lost locally; a per-attempt key would make the retry a duplicate e-mail for sensitive claim/deletion notices.
