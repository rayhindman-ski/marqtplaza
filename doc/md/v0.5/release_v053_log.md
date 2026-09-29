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

## Phases 2–3 review remediation (2026-09-29 06:42–06:47 UTC, observed `date`)

**Architect findings addressed.** Recent-authentication no longer treats JWT
`iat` (token refresh) as an authentication event. The guard checks Clerk
`fva[0]` age against 10 minutes; a present negative/invalid/stale `fva`
fails closed. Only when absent, it loads the Clerk backend session by `sid`
and checks its creation time; missing `sid`, unavailable session or stale
session gives `401 RECENT_AUTH_REQUIRED`. Clock, claims and session loader
remain injectable. Deletion-request *creation* now uses this guard, while
status and withdrawal do not; the privacy UI displays the shared step-up
prompt after the error.

Legal-document PDF now downloads through jsPDF from the same versioned NL/EN
draft source as print, including draft banner, version, unset effective date
and sections, with simple page breaks. Print remains a separate action.
The browser spec asserts the PDF download name and `%PDF-` signature;
**browser tests were written, not run by this worker**. Added an actual
`account.product_update` NL/EN template and enqueue helper, with caller-supplied
reviewed subject/body, bounded/validated outbox variables and an explicit
`product_updates` send-time purpose map. Integration tests queue through the
helper: never granted → final skip, grant → provider acceptance, withdrawal →
final skip. No invented marketing content.

**Verified.** API suites: `recentAuth.test.ts` 3/3, `account.test.ts`
17/17, `account-lifecycle.test.ts` 22/22, `account-consents.test.ts` 4/4.
Root `pnpm run typecheck` clean. No browser launched; no commit.

**Approval and Phase 6 checklist.** The privacy processing inventory and
NL/EN legal text remain **approval pending by the user**; production/content
acceptance depends on that approval, not on the presence of draft files or a
working PDF. A live Clerk e-mail-change walk-through (old primary stays until
verification; then old/new notifications and new verified primary) is
**deferred to Phase 6** and must be recorded there. Owner must run
`e2e/legal-documents.spec.ts` and the account privacy browser regression.

## Phase 4 — Account export (2026-09-29 06:48–06:59 UTC, observed `date`)

**Implemented.** Provisioned private Replit App Storage with the storage skill;
added `account_exports` and applied an additive `drizzle-kit push` from
`lib/db` (named request FK; no partial-index WHERE diffs). An account's
recent-authenticated export POST is idempotent while the export remains open.
The scheduler picks requested records, records each state transition in
`account_request_events`, writes an inventory-driven, deterministic JSON
bundle, CSV per array and a ZIP of all those files to private App Storage,
then queues the NL/EN `account.export_ready` notice (reference only, no data
or token URL). `fflate` was already in the workspace dependency graph, so
the ZIP is provided in addition to individual files. Signed-in owner-only
downloads expire after 72 hours; expiry removes objects and transitions the
audit; failures become visible to support. Export-specific reviewer results
expose only reference, status and timestamps. The requester screen has
distinct export/deletion copy, NL/EN states, recent-auth step-up and an
unavailable card. The rights and privacy pages link to the export route.
Format and inventory entry are documented under `doc/md/privacy/`.
OpenAPI is the contract and codegen was run; generated client hooks power
the screen.

**Verified.** `account-export.test.ts` 3/3 and touched
`account-lifecycle.test.ts` 22/22; root `pnpm run typecheck` clean. Browser
spec `e2e/account-export.spec.ts` (NL/EN, status, download, step-up, axe)
was written **but not run** (owner to run). No browser was launched, no
workflow restarted, and no commit made.

**Deviations/notes.** App Storage was provisioned, so no `bytea` fallback.
Orval emits a Zod path-params symbol with the same name as its generated
query-params type for the download operation; an explicit export in
`lib/api-zod/src/index.ts` resolves that codegen collision. Individual
JSON/CSV files remain available alongside the archive. The inventory and
retention policy remain provisionally subject to product-owner approval.

### Phase 4 — owner verification (2026-09-29)

- Owner fixes: the export page's axe check is scoped to the page's own
  content (`account-export-content`) like the sibling specs — the shell's
  language toggle is the known pre-existing contrast debt; the request button
  uses the secondary variant so the page's own content has no contrast
  violation.
- e2e: account-export 2/2, account-rights + account-privacy green (7 total in
  the combined run); typecheck clean.

## Phase 5 — Deletion lifecycle completion (2026-09-29 07:00–07:18 UTC, observed `date`)

**Implemented.** Additive `drizzle-kit push` from `lib/db`: `account_requests`
gets `scheduled_for`, `cancel_until`, `result_report`; a named-FK processor
outcomes table tracks Clerk, app DB, object storage and mail; `app_users.closed_at`
is a tombstone. No existing partial-index WHERE was diffed. OpenAPI policy,
report, processor/status DTOs and the policy endpoint were code-generated.
With the effective `ACCOUNT_DELETION_ENABLED` flag, new requests schedule
execution in 14 days and repeat POST returns the same reference; cancellation
at/after the cutoff returns 409. With it off, the existing deletion request
and support review path continue. The new NL/EN deletion page reads
inventory categories and cutoff copy from the API, requires acknowledgements
plus final confirmation, shows step-up on recent-auth 401 and displays status,
date and cancellation. The privacy page links to it only when enabled.
Account privacy copy now lists distinct sign-out, all-session revocation,
consent withdrawal, preference/last-search clearing, export and deletion
labels in both languages (parity spec).

The existing retention scheduler invokes the injected-clock, injected-Clerk,
injected-storage processor while the flag is on. It fences the account,
revokes active sessions, deletes Clerk identity, anonymises local rows and
retained request events, removes search/preferences/saved rows and export
objects, queues a one-time completion message to the execution-time address,
then completes only when all processor outcomes are final. Failed stages
become `blocked` with code-only errors, are visible in reviewer processor
rows, and reconcile on retry without rerunning completed stages; illegal
transitions throw. Reviewer notes are removed from the flagged support DTO;
the new flagged DTO does not return business names. The Clerk subject
remains as a unique closed-row tombstone (no e-mail); a different Clerk
subject provisions a different app row. Pending registration tokens for
that e-mail are superseded and their contact row anonymised. The identity
guard rejects a closed subject for account, preferences, search, export and
business invitation routes. The completion notice's address exists only
in its queued outbox row until delivery/retention purge.

**Verified (foreground, observed by `date`, 07:18 UTC).** API suites:
`account-lifecycle` 24/24; `account-export` 3/3;
`consumer-registration` 28/28; `business-membership` 14/14;
`account` 17/17; `registration` 3/3 (89/89 total).
Root `pnpm run typecheck` clean. Wrote but **did not run** browser specs
`e2e/account-deletion.spec.ts` (policy, NL/EN, confirmation, recent-auth,
status, cutoff, cancel, page-scoped axe) and
`e2e/account-offboarding-labels.spec.ts` (seven labels, both locales).
Owner must run these; no browser or workflow was launched; no commit.

**BUS-006 evidence.** The v0.5.2 `clerk-live-signup.spec.ts` recovery steps
cover returning through account verification/sign-in, while
`account-lifecycle.test.ts` verifies support decision and deletion blocker
resolution. No new recovery mechanism was added. The requested *live*
Clerk-delete walk-through and architect review remain for the owner.

**Deviations / approvals.** The test-only business-membership fixture had
no Clerk middleware and initially failed its deletion scenario when the
existing recent-auth guard called `getAuth`; injecting recent-auth claims
fixed it (final 14/14). The approved temporary address snapshot is held in
the completion outbox until its send/final-state purge, not directly passed
to a synchronous provider. Other inventory categories (public
contributions, third-party copies, legal-obligation records) remain
case-by-case pending owner approval; the result report reports only the
categories this orchestrator handles plus legally retained categories.
The inventory and legal wording remain provisional.

### Phase 5 — browser feedback remediation (2026-09-29 07:20–07:23 UTC, observed `date`)

Owner reported `account-offboarding-labels` and `account-preferences` passing;
five browser failures remained in `account-deletion` and legacy
`account-privacy`. Restored the same reusable `RequestsPanel` on the privacy
page, retaining its acknowledgement, sole-owner and unverified test IDs
while the dedicated route uses that component's full policy/confirmation
mode. Replaced raw inventory table codes in requester *and reviewer* report
UI with paired NL/EN category labels; unknown codes display a safe generic
label rather than a raw id. The deletion spec explicitly selects NL before
asserting Dutch copy (app-wide default language is EN), checks both
languages and no raw table ids. Withdrawal now updates the request cache
from the mutation result before the authoritative refetch, avoiding a
stale received status. Added label-catalogue parity assertions.
Root typecheck clean; **no browser launched**. Owner should rerun
`e2e/account-deletion.spec.ts`, `e2e/account-privacy.spec.ts` and
`e2e/account-offboarding-labels.spec.ts`.

### Phase 5 — owner verification (2026-09-29)

- Owner fixes to the new spec only: the request stub used a trailing `**`
  glob, which misses `/requests/:id/withdraw` (known Playwright quirk in this
  workspace) — replaced by a regex route; axe scoped to
  `account-deletion-panel` (shell eyebrow/language toggle are pre-existing
  contrast debt).
- e2e: account-deletion 3/3; account-offboarding-labels, account-privacy,
  account-rights green (9 total in the combined run); usability-regression
  21/21 (PW_PORT=22580); typecheck clean.

### Phases 4–5 review remediation (2026-09-29 07:36 UTC, observed `date`)

- Final membership-locked sole-owner guard rechecks every due deletion,
  including support-reopened requests; blocked ownership records a new event
  and prevents Clerk/app execution. Deletion and export workers use durable
  10-minute claim tokens with stale-lease recovery; Clerk 404 means already
  deleted. Export workers fail closed with `account_closed` if the account
  closed before build or before publication (user-row lock).
- Clerk verified primary e-mail is snapshotted before deletion, used for
  pending registration/invitation revocation and the completion outbox notice,
  and cleared after completion. Mail processor stays pending until confirmed
  delivery or skips with no e-mail. Expanded subject-linked anonymisation,
  author attribution for new business messages, inventory and NL/EN category
  descriptions. Pre-attribution messages cannot be assigned to an author
  retrospectively; manual case review remains required.
- Unified support redaction on list/decision responses, strips contact/token
  patterns from free-form notes and suppresses raw retention exceptions.
  Closed subjects are rejected from legacy registration and community
  posting/editor paths. Added regression tests for sole-owner reopening,
  concurrent ticks, absent Clerk user, null-local-email delivery, crashed
  export lease, closed-account export, and closed registration.
- Additive DB columns applied with explicit SQL. Schema preflight reports
  only the known numeric-spacing false positive for last-search center
  coordinates. Six requested suites passed: lifecycle 25/25, export 4/4,
  consumer registration 28/28, business membership 14/14, registration 4/4,
  account 17/17. Root typecheck clean. No browser run or commit.
- **Phase 6 evidence remains open:** live Clerk user-delete/revoke walk-through
  (including the final delivery/reconciliation path) must be recorded by
  the owner; simulated tests are not live-provider proof.
- 07:40 UTC (observed `date`): final post-remediation rerun of the six suites
  92/92 and root typecheck clean; `git diff --check` clean.
- 07:41 UTC (observed `date`): extended scrub to linked reviewer/fact-check,
  deal and listing-correction references; reran all six suites 92/92 and
  root typecheck successfully. No browser, no commit.
- 07:43 UTC (observed `date`): closed-account guard also applied to the
  authenticated discovery-query attribution path. Final six suites 92/92,
  typecheck and diff check clean.

## Phase 6 — Live identity-provider evidence (2026-09-29 07:58 UTC, observed `date`)

- **OFF-011 / OFF-012:** Opt-in `accountDeletion.live.test.ts` ran against the
  real development Clerk backend client and an isolated disposable database.
  A newly created verified test identity had its deletion request made due;
  the orchestrator deleted the Clerk user (subsequent `getUser` returned 404),
  left no active sessions, anonymised and closed the app row, and completed all
  four processor outcomes. Injected storage and mail delivery (including a
  delivery receipt) allowed the request to complete with its category report.
- **OFF-018:** A second Clerk user created with the *same* e-mail received a
  different Clerk ID; the normal app provisioning function created a new
  active row instead of reattaching the closed tombstone. Both test identities
  were subject to finally-block provider cleanup.
- Observed command from `artifacts/api-server`:
  `CLERK_LIVE=1 pnpm exec tsx --test src/lib/accountDeletion.live.test.ts`;
  **1/1 passed**, 0 failed, 0 skipped (2026-09-29 07:58:35 UTC; 4.7 seconds).
  Root typecheck and `git diff --check` clean. No browser launched, no commit.
- **PROF-004:** Live e-mail change was **not** exercised. Its coverage remains
  the offline provider stub and backend-verified e-mail read, not live-provider
  e-mail-change evidence.

## Phase 6 — Hardening and release evidence (2026-09-29, closed 10:00 CEST)

**Full regression (owner-run).**

- API: all 27 suites run. Green except pre-existing debt unchanged from the
  baseline: `business-publication` 26/28 (2 freshness failures, pre-existing)
  and `listings-query.integration` 2/4 (fails identically on the v0.5.2
  baseline commit; outbound network). `permissions.test.ts` updated for the
  four new flags (8/8).
- e2e (all files except the v042/v043 release specs, which are known debt):
  discovery-regression 11/11 and usability-regression 21/21 with unchanged
  expectations; account-*, business-*, consumer-registration,
  credential-lifecycle, clerk-verification-recovery, saved-events-sync,
  signup-stale-step, last-search, legal-documents — all green in four
  batches (42 + 21 + 24 + 9). Live Clerk sign-up 1/1 against the running
  dev server (account-regression workflow set).
- Live identity-provider deletion evidence: see the section above
  (`accountDeletion.live.test.ts`, 1/1).
- Threat-model delta: `doc/md/privacy/threat-model-v053.md`.

**Flag table.**

| Flag | development | production |
|---|---|---|
| `LAST_SEARCH_ENABLED` / `VITE_…` | true | **unset (off)** |
| `CONSENT_CENTER_ENABLED` / `VITE_…` | true | **unset (off)** |
| `ACCOUNT_EXPORT_ENABLED` / `VITE_…` | true | **unset (off)** |
| `ACCOUNT_DELETION_ENABLED` / `VITE_…` | true | **unset (off)** |

Production enablement is a separate recorded decision by the user; nothing
was published.

**Production schema push notes.** Additive only: `account_last_search`,
`account_exports`, `account_request_processor_outcomes`; new nullable columns
on `account_consent_events`, `consumer_preferences`, `account_requests`,
`app_users` (`closed_at`, e-mail-change marker, claim columns). Run the
`doc/md/onboarding-release.md` push procedure; the preflight's numeric-format
warning is the known false positive.

**Open items for the user (acceptance prerequisites, not code gaps).**

1. Approve or replace the draft Terms/privacy text and set an effective date
   (`PRIV-004`; also `PRIV-001`–`PRIV-003` from v0.5.2).
2. Approve `doc/md/privacy/processing-inventory.md` (`PRIV-016`).
3. Confirm or change the provisional §15 values (Phase 0 table).
4. Decide production flag enablement.
5. `PROF-004`: live e-mail-change walk-through not performed (offline stub +
   backend-verified read only).
