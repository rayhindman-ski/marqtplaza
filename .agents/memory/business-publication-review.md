---
name: Business publication review
description: Policy rules for the business profile review/publication layer — what must stay independent, who counts as an interested party, and what the public may see.
---
- Ownership, editorial approval, publication, and fact freshness are separate decisions with separate audit trails. Approving a claim or a revision never publishes; only an explicit publish action does, and new profiles start unpublished while review is live.
- The public sees only an explicitly approved snapshot, never in-progress owner edits. If review is switched off, the plain profile columns become the public truth again (the snapshot is kept, not served).
- A reviewer is an interested party if they created, own, belong to, authored the approved content of, or hold any active claim on the business — and the author exclusion outlives membership. Recheck this inside the deciding transaction, taking the business row lock first (same lock order for claim creation and owner save/submit/discard) so nothing slips between check and commit.
- Owner submissions are immutable: once submitted, a late save or discard must fail rather than rewrite the content a reviewer will judge.
- English copy is never generated from Dutch on the server; per-field fallback is a display concern. Every reviewer/owner surface ships NL and EN copy together.

**Why:** the review flow exists so reviewers cannot accidentally publish private drafts, stale revisions, or their own business, and so public provenance claims stay truthful.

**How to apply:** new business surfaces (hours, deals, team) get their own decision/audit dimension and reuse the shared interested-party and lock-order rules rather than re-deriving them.
