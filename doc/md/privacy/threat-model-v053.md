# Threat model delta — v0.5.3 (export download, deletion scheduler, last search)

Scope: the new account-only surfaces of v0.5.3. Discovery is unchanged.

| Asset | Threat | Control | Evidence |
|---|---|---|---|
| Export artifact (private App Storage) | Another signed-in user or an anonymous caller downloads it | Owner check on every export route (404 for others), signed-in only, 410 after 72 h expiry, artifact deleted on expiry; no direct URL in the notice mail | `account-export.test.ts`, `account-export.spec.ts` |
| Export content | Bundle leaks tokens, provider payloads, other users' rows | Inventory-driven projections; test scans the serialised bundle for `token`, outbox bodies, Clerk payloads, foreign user ids | `account-export.test.ts` |
| Export / deletion request creation | Session hijack triggers a sensitive action | Recent authentication (Clerk `fva`, fallback session `createdAt`, 10 min, fail closed) | `recentAuth.test.ts`, lifecycle tests |
| Deletion execution | Double execution by concurrent scheduler ticks; crash mid-way | Durable per-request claim with lease and stale recovery; Clerk 404 treated as done; processor outcome rows; completion only when all processors final | lifecycle tests (concurrent ticks, retry after Clerk delete) |
| Deletion execution | Deleting the sole owner of a live business | Sole-owner guard at creation **and** immediately before execution | lifecycle tests |
| Closed account | Old links/tokens or a still-valid session reach account data | `closed_at` tombstone in auth middleware and every token route; export fails closed for closed accounts | consumer-registration, business-membership, registration suites |
| Support screens | Reviewer sees e-mail/phone/tokens | Single redaction path for list and decision DTOs; note redaction; sanitised scheduler logs | lifecycle DTO tests, privacy scan |
| Last search | Cross-account leakage on a shared browser; private data in URLs | Per-user query keys dropped on sign-out; server-side ownership; restore URL built from public criteria only; no geolocation or live provider call on restore | `last-search.test.ts`, `last-search.spec.ts` |
| Consent | Optional mail after withdrawal | Send-time consent check in the outbox dispatcher; transactional templates never gated | `account-consents.test.ts` |

Residual risks: legal text and processing inventory are drafts awaiting the
owner's approval; PROF-004 has offline-stub evidence only; anonymisation of
historical business messages without author attribution needs a manual case
review.
