# Release v0.5.3 — Implementation Log

Branch `feature/v053-baseline-functionality`. Plan:
[`release_v053-implementation-plan.md`](./release_v053-implementation-plan.md).
Scope: [`release_v053.md`](./release_v053.md). Prompt record:
[`v053-prompt-log.md`](./v053-prompt-log.md).

## Phase 0 — Policy values and baselines (2026-09-29 07:21 → 07:25 CEST)

**Provisional policy values (`requirements.md` §15, items 6–11).** Chosen by
the assistant to unblock implementation; each is a product decision the user
can overrule, and none is gate approval.

| §15 | Value (provisional) | Applies to |
|---|---|---|
| 6 | Last search kept 90 days from capture; centre stored at 3 decimals (≈100 m); consumer can switch retention off | `SRCH-005`, `SRCH-009`, `SRCH-021` |
| 7 | Re-acceptance of Terms only on a major version change; minor versions notify | `BUS-007`, `PRIV-017` |
| 8 | Optional purposes: `product_updates` (consent), `research_contact` (consent); both unselected by default | `PRIV-011`–`PRIV-016` |
| 9 | Export as JSON bundle (+ CSV per table); download valid 72 h; signed-in only | `OFF-004`, `OFF-005` |
| 10 | Deletion executes after 14 days; cancellation possible until execution; retained: audit events (ids, codes, timestamps) and legal-obligation rows, anonymised | `OFF-007`, `OFF-010`, `OFF-014`, `OFF-018` |
| 11 | Order: app disable + session revocation → identity-provider user delete → app anonymisation → processor reconciliation → completion report | `OFF-011`, `OFF-012` |

**Baselines.** api: account 16/16, account-lifecycle 22/22, registration 3/3,
consumer-registration 27/27, business-membership 13/13. Map/usability/account
workflows as recorded at the end of v0.5.2.

**`DATA-001` audit.** Schema grep: the only e-mail-based indexes are
`business_invitations_open_email_unique` and
`consumer_registrations_one_open_per_email_unique`, both dedupe indexes on
*pending* rows, not relational keys. All relations use `app_users.id` or the
identity-provider user id. Closed without migration.

**Deviation from plan.** No shared recent-authentication gate exists in the
API (the v0.5.2 security page relies on the identity provider's own step-up).
Phase 2 adds one (`requireRecentAuth`, based on the session's last
authentication age from the identity-provider claims, default 10 minutes) and
Phases 4–5 reuse it.
