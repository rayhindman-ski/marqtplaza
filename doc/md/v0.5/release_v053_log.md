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

## Phase 2 — preferences and account privacy (2026-09-29 06:00–06:12 UTC, observed `date`)

Additive columns: consumer preferences external-search scope (`ask` default),
app user e-mail and pending-change timestamp, outbox recipient-address snapshot
for security notices to the former/new address. Development `drizzle-kit push`
reported changes applied. Preflight reported the existing numeric(6,3) vs
numeric(6, 3) formatting false positive; no destructive schema operation was
requested. OpenAPI source and generated clients updated; root typecheck clean.

Preferences now save scope with retention in a grouped search block; the
existing last-search restoration continues to force local scope unless
explicitly expanded in a future phase. Shared server recent-auth gate checks
Clerk's signed session `iat` against an injectable 10-minute clock and returns
401 `RECENT_AUTH_REQUIRED` otherwise. E-mail change start and confirm never
accept client-supplied e-mail addresses: the server reads Clerk's verified
primary, requires recent auth, records the pending old address, and
transactionally queues NL/EN notifications to the correct old/new addresses
after verification. Provider UI starts verification with Clerk and promotes
the primary address only after code verification. The UI offers a sign-in
return path for API step-up failure (Clerk's useReverification hook only
handles Clerk API failures, not app API errors).

Privacy rights navigation lists seven rights and includes an unavailable
export screen; NL/EN copy parity and an i18n prohibited-claims assertion added.
Static e2e checks were authored for rights and e-mail-change framing.

**Suite evidence:** API account routes **17/17**, lifecycle outbox **22/22**,
recent-auth unit **1/1**, web i18n **13/13**;
root typecheck clean. Browser suites were not run by this subagent (owner
handles browser/app runs); no browser pass, print action, or live Clerk
walk-through is claimed. No commits.
The already-running preview returned an HTTP error for the rights route;
this subagent did not start a server (browser verification belongs to owner).

**Open deviation at initial handoff:** No versioned Terms or privacy document
or effective date existed in the web artifact. The e-mail-change e2e initially
proved framing only; provider-owned verification still requires a live Clerk
run. The outbox's
recipient-address snapshot is necessary to deliver security notices to
the former address after Clerk switches primary; it must follow normal
outbox-retention purge policy in Phase 3.

**Follow-up 2026-09-29 06:13–06:16 UTC (observed `date`).** PRIV-004
mechanism delivered: `/voorwaarden` and `/privacy` with English aliases
`/terms` and `/privacy-notice`, all rendered from a single versioned source
module. The `draft-2026-09` version matches the API consent notice version;
effective date is `null`. The visible draft warning, version and unset
effective date appear in the printed header. Print CSS hides navigation and
controls while retaining the header; “Download als PDF” calls `window.print()`
without introducing a dependency. Account and registration legal links added
without changing discovery UI. E2e for four legal routes and an injected
`window.print` spy, plus API-401 recent-auth prompt regression, added.
Root typecheck clean; i18n **13/13**. **Content remains DRAFT**, not approved; final
acceptance requires user-supplied approved NL/EN text and effective date.
PRIV-001–003 (claimed by v0.5.2) also depend on that approval. Browser suites
were not run by this subagent under the owner-only app execution policy;
their pass status is unclaimed. No commit.

### Phase 2 — owner verification (2026-09-29, after the worker pass)

- Fixes applied by the owning agent: return-path allow-lists (web
  `returnPath.ts` and API `consumerRegistration.ts`) extended with the new
  account routes so the recent-auth prompt keeps `?terug=`; `AuthPageFrame`
  now accepts the page-owned language so the toggle and the page stay in sync;
  the new Terms link on the registration page uses foreground colour so the
  usability contrast budget is unchanged.
- e2e: account-email-change 3/3, account-rights, legal-documents,
  account-preferences, account-privacy — 23/23 combined; usability-regression
  21/21 (PW_PORT=22580); api account + consumer-registration 44/44; typecheck
  clean.
- Observed once: intermittent axe colour-contrast report on the account
  preferences "failed save" test when run in a large combined batch (active
  language-toggle button, pre-existing element); 4/4 green when repeated in
  isolation. Not changed; watch in Phase 6.

## Phase 3 — consent centre and processing inventory (2026-09-29 06:26–06:34 UTC, observed `date`)

**Changed.** Added a static NL/EN catalogue for `product_updates` and
`research_contact` (consent, default off), retaining existing
`marketing_updates` ledger values as an explicitly labelled legacy purpose.
The append-only ledger now stores nullable locale and lawful-basis columns for
old-row compatibility; account GET includes catalogue metadata, per-purpose
current state and history, while POST requires a validated locale, catalogue
purpose and current notice version. Both routes use the effective
`consentCenter` gate (503 when accounts are active but consent centre is
disabled). The canonical consent UI lives on `/account/privacy`, with a link
from account home, independent choices, bilingual withdrawal explanation and
an unavailable card. Optional outbox templates are explicitly mapped to
purposes and checked immediately before provider dispatch; withdrawn choices
create a final `skipped_consent_withdrawn` attempt. Transactional/security mail
is not gated. There is no existing survey-invitation template: the future
`research.survey_invitation` mapping is explicit and tested with a queued row.

The processing inventory is a draft covering personal-data tables, routes,
processors and provisional retention; owner/region/basis approval remains
pending. The hourly scheduler retains last-search expiry, scrubs payload and
recipient-email snapshots from *final* outbox rows after 30 days, and accepts
an injected Phase 4 export-expiry hook. Request events remain immutable audit
rows; their future anonymisation belongs to Phase 5, and no arbitrary deletion
period was fabricated. A static CI test scans GET query parameters for
sensitive names (with reviewed existing registration-token and listings
coordinate exceptions), and asserts no web analytics/telemetry emitters exist.
OpenAPI regenerated and additive `drizzle-kit push` applied to development.

**Suite results.** `account.test.ts` 17/17,
`account-consents.test.ts` 4/4, `privacy-scan.test.ts` 2/2,
`account-lifecycle.test.ts` 22/22; root `pnpm run typecheck` clean.
Browser spec extended: `account-privacy.spec.ts` (consent independence,
NL/EN, axe). Browser not launched by this worker; owner must run it and the
frozen map/usability/account regressions. No commit.

**Deviations / review.** The preflight reports an already-documented
`numeric(6,3)` versus `numeric(6, 3)` formatting false-positive for last
search; direct non-force `pnpm run push` succeeded with additive columns only.
Existing `marketing_updates` remains a separate legacy purpose rather than
silently rewriting old decisions. Exact processor hosting regions, legal
bases, audit duration and inventory approval await the product owner. Export
expiry cannot execute until Phase 4 registers its hook. Phase 3 architect
review remains for the owner.

**Owner browser follow-up (2026-09-29 06:37 UTC, observed `date`).** Owner
reported 27/29 browser checks passing. Restored a read-only consent state
summary on account home, preserving `consent-state-*` test IDs while linking
mutations to the canonical privacy centre; adjusted the existing browser
fixture/expectation for the new catalogue and required locale. Fixed contrast
on the two privacy-panel eyebrows and consent eyebrow by using
`text-foreground`. Root typecheck clean. Browser rerun remains with owner.
