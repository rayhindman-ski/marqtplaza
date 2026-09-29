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

## Phase 1 — Last search (2026-09-29 07:24 → 07:32 CEST; observed via `date` in UTC)

**Changed.** Added an additive `account_last_search` table with a named FK,
unique user key, 90-day expiry and three-decimal centre; an opt-out column on
`consumer_preferences`; account-authenticated GET/PUT/DELETE behind the
effective `LAST_SEARCH_ENABLED && ACCOUNTS_ENABLED` gate. Bodies reject unknown
fields, live taxonomy IDs are revalidated on write and read, and opt-out
deletes stored context and refuses writes (204). OpenAPI was updated before
codegen. A debounced, signed-in-only side-effect reads the discovery URL and
existing selected map context without changing discovery component contracts.
The account quick link uses catalogue labels rather than raw query text; clear
requires confirmation and removes the user-keyed cache. Development schema:
`push-preflight` passed and `drizzle-kit push` applied changes.

**Suite counts.** `last-search.test.ts`: 6/6; unchanged `account.test.ts`:
16/16 (run independently; combined execution against the shared database
collided). Root `pnpm run typecheck`: clean. Browser suites
`last-search.spec.ts`, `discovery-regression.spec.ts` and
`usability-regression.spec.ts` were not run by this subagent: the owning agent
handles application/browser runs. No browser pass claimed.

**Deviation / follow-up.** No supported existing navigation API re-applies
selected listing or zoom across account→discovery routes without using
browser-local restore state; restoration is limited to validated public URL
criteria and forces stored-only local scope. The new expiry purge is invoked
on GET/PUT; a periodic scheduler is not yet installed. Existing development
flags are configured in `.replit`, not a `.env`; direct edits to `.replit`
were rejected by the environment's validation policy, so the owning agent
must add `LAST_SEARCH_ENABLED` and `VITE_LAST_SEARCH_ENABLED` there via the
validated replacement tool before development UI verification. The Playwright
web-server command explicitly enables the VITE mirror.

**Follow-up verification (2026-09-29 07:38 CEST, observed via `date`
05:38 UTC).** The owner enabled both development flags and ran the unchanged
discovery regression suite: 11/11. The first browser run of
`last-search.spec.ts` failed because its mock server omitted the weather
response; this is test setup, not a discovery regression. Added the same
weather/listings/map network stubs used by frozen discovery tests plus the
account consent response needed by account home. Rerun:
`last-search.spec.ts` 1/1, unchanged `usability-regression.spec.ts` 21/21
with `PW_PORT=22580`, and root typecheck clean. No frozen discovery
components or expectations changed.

## Phase 1 review remediation (2026-09-29 07:41 → 07:51 CEST; observed `date` 05:41:37 → 05:51:08 UTC)

**Review findings resolved.** PUT now locks `app_users` and rechecks retention
inside the same transaction as its upsert; preferences PATCH uses that same
lock to disable retention and delete the row atomically; DELETE locks it too.
An interleaving API test holds a PUT after the lock while opt-out waits, then
verifies the final row is absent and subsequent PUT returns 204. Periodic
last-search expiry runs from the server scheduler even without account API
traffic, with a no-traffic purge test. Free-text query is trimmed, max 64,
Unicode letter/digit/space/hyphen/comma/period-only; listing source/id and
scroll context use allow-lists. The generated Zod regex cannot apply Unicode
flags, so the Unicode regex is enforced in the route after OpenAPI max-length
validation rather than in generated Zod.

Restoration now uses the discovery URL serializer for locale, section,
postcode and the canonical first neighbourhood; the existing `restore=1`
discovery-state mechanism carries **all** validated neighbourhoods,
categories, open-now filter and available viewport context, without putting
coordinates or an account identifier in the URL. An account-scoped one-shot
marker suppresses immediate capture on arrival until a discovery-state
change. Capture reads the effective UI language; a provider-level cache
guard clears account/last-search queries on sign-out or user switch, not just
the Account button. Browser test uses the sign-out button and checks that
restore makes no live provider or geolocation calls.

**Results after remediation.** API `last-search.test.ts` **9/9**, browser
`last-search.spec.ts` **1/1**, unchanged `discovery-regression.spec.ts`
**11/11**, unchanged `usability-regression.spec.ts` **21/21**
(`PW_PORT=22580`), root typecheck clean. No commits.

**Explicit limits.** The frozen public discovery URL supports one
neighbourhood and has no slots for selected listing, presentation mode,
arbitrary category ids, viewport or web scope without live fetch. The
existing restore-state mechanism carries multiple neighbourhoods, supported
categories/filter and viewport; selected listing and presentation mode cannot
be applied without changing frozen discovery state/interfaces. To ensure
stored-only restore the effective scope is local, even if the original search
used web scope; users can re-opt into live providers explicitly. Development
push-preflight flagged an existing numeric(6,3) vs numeric(6, 3) formatting
discrepancy as a type change; `drizzle-kit push` was run separately and
reported changes applied (the additive `section` column), with no
drop/retype intended. Inspect its production plan before production push.

**Final post-review verification (observed 2026-09-29 05:54:40 UTC /
07:54:40 CEST).** Preference updates now also refresh the user-keyed account
cache used by capture, so opt-out stops client PUT attempts without waiting
for a refetch. After that final change, API **9/9**; combined new/frozen
discovery browser suites **12/12** (new 1, frozen 11); frozen usability
**21/21** on port 22580; root typecheck clean.

**Clear race fence and final rerun (observed 2026-09-29 05:58:44 UTC /
07:58:44 CEST).** A second additive `app_users.last_search_cleared_at`
column fences any PUT *received before* DELETE but forced to wait for the
same account row lock: DELETE records the server-side clear instant inside
its transaction, and the delayed PUT returns 204. A deterministic
interleaving test holds DELETE under lock while PUT arrives, then verifies
the row remains absent (a fresh post-clear PUT can save again). Development
`drizzle-kit push` reported changes applied. Final runs after this change:
API **10/10**, new + frozen discovery browser **12/12**, frozen usability
**21/21** with port 22580, root typecheck clean. No commit.
