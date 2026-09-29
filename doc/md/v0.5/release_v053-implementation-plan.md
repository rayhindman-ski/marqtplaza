# Release v0.5.3 — Implementation Plan

## 1. Purpose and traceability

This plan implements [`release_v053.md`](./release_v053.md): the 59
requirements of [`requirements.md`](./requirements.md) not claimed by v0.5.1
or v0.5.2. Every ID in `release_v053.md` §5 has, below, an implementation
approach, at least one test reference and an acceptance condition (§5 matrix).

Work runs on branch `feature/v053-consumer-lifecycle-completion`, logged in
`release_v053_log.md` and `v053-prompt-log.md` with the v0.5.2 conventions
(observed times, suite counts, architect findings and their resolution).

Standing constraints (inherited, non-negotiable):

- **Discovery is frozen** (`BUS-011`, `release_v051.md` §7). Map, list, icon,
  card, filter, discovery routes, discovery APIs, cache keys and provider
  behaviour do not change. Last-search capture *reads* existing discovery
  state; restoration *calls* the existing navigation/filter interfaces. The
  `map-regression` and `usability-regression` workflows must pass with
  unchanged expectations after every phase.
- Existing tables are extended additively; nothing is dropped or repurposed.
  Schema changes go through the `doc/md/onboarding-release.md` drizzle-kit
  push rule (rename partial indexes, name long FKs).
- Clerk owns credentials, e-mail addresses, sessions; the app never stores a
  password or provider token.
- Foreground work only; prompts, responses and durations are logged.
- Never publish from the plan; production enablement is a separate recorded
  decision (flag table in the log).

## 2. Starting point (what already exists)

Inventory taken on 2026-09-29 against the current branch. The plan builds on
these rather than creating parallel structures.

| Area | Exists | Gap for v0.5.3 |
|---|---|---|
| Consent | `account_consent_events` (type, notice version, granted, source, time); `GET/POST /account/consents`; `AccountPrivacyPage` | No **locale** on the event, no purpose catalogue with lawful basis, no send-time consent check in outbox consumers, no withdrawal explanation copy (`PRIV-011`–`PRIV-014`). |
| Deletion | `account_requests` (`deletion` / `export` / `suspension_appeal`, statuses received→blocked→in_review→completed/rejected/withdrawn, sole-owner blocker), `account_request_events`, `POST /account/deletion-requests`, withdraw, support review + decision, lifecycle messages resend | No **waiting period / cancellation cutoff** scheduler, no identity-provider deletion step, no per-processor reconciliation, no category report, no tombstone check in token routes (`OFF-007`, `OFF-010`–`OFF-018`). |
| Export | `export` request type reserved in `ACCOUNT_REQUEST_TYPES` | No creation route, no builder, no artifact storage, no expiring download (`OFF-003`–`OFF-006`). |
| Preferences | `consumer_preferences` (neighbourhoods, interests, revision); `PATCH /account/preferences`; locale on `app_users` | No external-search scope, no last-search retention opt-out (`PROF-006`, `SRCH-016`, `SRCH-021`). |
| Search state | `user_queries` (discovery *query jobs* keyed by `user_id` text / anonymous id) | Not a last-search store: wrong grain, holds provider status, no viewport. New table needed (`SRCH-*`). |
| Recent-auth gate | v0.5.2 `requireRecentAuth` on security routes | Reuse for export, e-mail change, deletion confirmation (`OFF-002`). |
| Lifecycle outbox | queue, attempts, templates, provider abstraction, support resend | New templates only. |
| Legal documents | versioned NL/EN Terms + privacy pages | No print/PDF (`PRIV-004`). |
| Account keys | `app_users.id` integer + `clerk_user_id`; `user_registrations` and `business_members` reference **Clerk user id text** | `DATA-001` audit: no e-mail keys found in schema; confirm at Phase 0 with a grep, document. |

## 3. Architecture

### 3.1 Services (additive)

| Service | Location | Responsibility |
|---|---|---|
| Last search | `api-server/src/lib/lastSearch.ts` | Allow-list validation of the state DTO against the live neighbourhood/category catalogues; precision rounding; upsert; clear; retention purge; sanitised summary. |
| Consent catalogue | `api-server/src/lib/consentPurposes.ts` | Static purpose list (id, lawful basis, notice version, NL/EN labels); `hasActiveConsent(userId, purpose)` for outbox consumers. |
| Account export | `api-server/src/lib/accountExport.ts` | Collect per-account data from every in-scope table (inventory-driven), serialise JSON (+CSV per policy), store under App Storage with expiry, state transitions. |
| Deletion orchestrator | extend `account-lifecycle` | Waiting-period scheduler, cutoff, provider deletion (Clerk `users.delete`), per-processor outcome rows, anonymisation, category report, tombstones. |
| E-mail change | `api-server/src/lib/accountEmailChange.ts` | Observe Clerk primary-e-mail change (session claim refresh / webhook), update `app_users.email`, enqueue notifications. |
| Legal documents | `buurtgids/src/lib/legal/` | Print stylesheet; PDF generated client-side from the same versioned source. |

### 3.2 Frontend routes

```text
/account                         quick link "Verder met je laatste zoekopdracht" (SRCH-010)
/account/voorkeuren              + discovery preferences block (PROF-006)
/account/privacy                 consent centre per purpose, rights page links (PRIV-011..015)
/account/privacy/rechten         access / correction / export / deletion / restriction / objection / contact (PRIV-015)
/account/gegevens-export         request, status, expiring download (OFF-003..006)
/account/verwijderen             explanation, confirmation, reauth, status, cancel (OFF-007..010)
/account/e-mail-wijzigen         Clerk e-mail change framed in AuthPageFrame (PROF-004)
/voorwaarden, /privacy           + print / PDF (PRIV-004)
/review/account-requests         + export requests, processor outcomes (OFF-020)
```

Restoration target is the **existing** discovery URL (`/`, `/buurt/...`)
built only from validated public criteria (`SRCH-006`, `SRCH-017`).

### 3.3 Data model

| Table | Change |
|---|---|
| `account_last_search` (new) | `user_id` FK `app_users.id` (unique), `city_id`, `neighborhood_ids jsonb`, `query text` (postcode/query, nullable), `category_ids jsonb`, `filters jsonb` (allow-listed keys), `locale`, `source_scope`, `selected_listing jsonb {source,id}`, `presentation_mode`, `zoom smallint`, `center_lat/center_lng numeric(6,3)`, `scroll_context text`, `captured_at`, `expires_at`. No raw geolocation column exists by design. |
| `account_consent_events` | + `locale text`, + `purpose_lawful_basis text`; `consent_type` values come from the catalogue. |
| `consumer_preferences` | + `external_search_scope text default 'ask'`, + `retain_last_search boolean default true`. |
| `account_requests` | + `cancel_until timestamptz`, + `scheduled_for timestamptz`, + `result_report jsonb` (deleted / anonymised / retained categories). |
| `account_request_processor_outcomes` (new) | request id, processor (`app_db`, `clerk`, `object_storage`, `mail_provider`), status, attempts, last error code, completed at. |
| `account_exports` (new) | request id, format, storage key, size, `available_at`, `expires_at`, `downloaded_at`, status. |
| `app_users` | + `email_change_pending_at` (nullable) for `PROF-004` notifications; + `closed_at` tombstone (nullable) checked by every token route (`OFF-016`). |

### 3.4 API boundary (OpenAPI additions)

```text
GET    /account/last-search              -> summary + state | null
PUT    /account/last-search              (allow-listed body; 204 when retention is off)
DELETE /account/last-search              (SRCH-018; authoritative)
GET    /account/consents                 + purpose catalogue with lawful basis, locale, version
POST   /account/consents                 grant / withdraw per purpose (unchanged shape, + locale)
POST   /account/export-requests          recent-auth; 202 with request reference
GET    /account/export-requests/:id      status + download token lifetime
GET    /account/export-requests/:id/download   signed-in only; expiring
POST   /account/deletion-requests        (existing) + explanation payload, cancel_until
POST   /account/requests/:id/withdraw    (existing) refuses after cutoff -> 409
GET    /account/rights                   static rights routes per locale
GET    /review/account-requests          + type filter, processor outcomes (no e-mail/phone in DTO)
```

All account-only routes sit behind the effective flags
`lastSearch`, `consentCenter`, `accountExport`, `accountDeletion`
(each `own && accounts`); flags off → `503 unavailable` card, public
discovery untouched (`OPS-006`).

## 4. Delivery sequence

Each phase ends with: typecheck clean, the named suites green, a
`release_v053_log.md` entry, commit and push. Architect review after Phases 1,
3 and 5.

### Phase 0 — Policy values and baselines (½ day)

1. Record provisional values for `requirements.md` §15 items 6–11
   (proposal: last-search retention 90 days, centre precision 3 decimals,
   opt-out available; Terms reacceptance on major version only; purposes =
   `product_updates`, `research_contact`; export JSON + CSV, download 72 h;
   deletion waiting period 14 days = cancellation cutoff, retained categories
   = audit + legal-obligation rows; deletion order app-disable → Clerk delete
   → app anonymise → processors). Marked provisional in the log.
2. `DATA-001` audit: grep schema and routes for e-mail-keyed joins; document
   result (expected: none).
3. Baseline counts for `account`, `account-lifecycle`, `registration`,
   `consumer-registration`, `business-membership` suites and the
   `map-regression` / `usability-regression` / `account-regression` workflows.

**Exit:** policy table in the log; baselines recorded; `DATA-001` closed or
a migration ticket opened.

### Phase 1 — Last search and map state (1½ days)

1. Schema `account_last_search`; `lastSearch.ts` with validation against the
   live catalogues (`SRCH-012`, `SRCH-013`), rounding (`SRCH-005`), allow-list
   rejection of unknown keys (`SRCH-002`, `SRCH-007`), retention purge
   (`SRCH-009`).
2. Capture hook in the discovery page: on debounced state change, when signed
   in and `retain_last_search` is on, `PUT /account/last-search` with the
   public criteria already present in the URL plus zoom/centre/selected
   listing. **No change to the discovery components' props, state or
   rendering.**
3. Account-home quick link with sanitised summary (`SRCH-010`, `SRCH-011`);
   restoration navigates to the existing discovery URL, then applies selected
   listing and zoom through the existing map API; stored-only mode, no
   geolocation prompt, no live provider fetch (`SRCH-014`–`SRCH-016`).
4. Clear with confirmation, server-authoritative, then cache drop
   (`SRCH-018`, `SRCH-019`); cache keyed by account id and dropped on sign-out
   (`SRCH-020`).
5. Tests: api `last-search.test.ts` (allow-list, precision, taxonomy drift,
   retention, isolation between two users, retention-off returns 204 without
   write); e2e `last-search.spec.ts` (capture → sign-out → sign-in as another
   user sees nothing → original user restores → clear); `map-regression` and
   `usability-regression` unchanged.

**Exit:** `SRCH-001`–`SRCH-020`, `BUS-005` evidence; architect review.

### Phase 2 — Preferences, e-mail change, legal documents (1 day)

1. `consumer_preferences` extension; preferences page block (`PROF-006`,
   `SRCH-016`, `SRCH-021`).
2. `/account/e-mail-wijzigen` framing Clerk's e-mail change with verification
   (`PROF-004`); app record updates only after Clerk reports the new verified
   primary; templates `account.email_change_requested` (old) and
   `account.email_changed` (old + new) (`PROF-005`); recent-auth gate
   (`OFF-002`).
3. Print stylesheet and PDF for Terms/privacy (`PRIV-004`); rights page
   (`PRIV-015`); copy review for `PRIV-018`.
4. Tests: `account-preferences.spec.ts` extension; live Clerk e-mail change in
   `clerk-live-signup.spec.ts` (testing token + blocked Turnstile per the
   existing recipe); lifecycle test for the two templates; axe on new pages.

**Exit:** `PROF-004`–`PROF-006`, `PRIV-004`, `PRIV-015`, `PRIV-018`.

### Phase 3 — Consent centre and processing inventory (1 day)

1. `consentPurposes.ts` catalogue; `account_consent_events` + locale + basis;
   consent centre with independent toggles, withdrawal explanation
   (`PRIV-011`–`PRIV-014`); `BUS-007` closed by the append-only ledger.
2. Outbox consumers call `hasActiveConsent` at send time for optional
   purposes; withdrawn → attempt outcome `skipped_consent_withdrawn`
   (`PRIV-012`).
3. `doc/md/privacy/processing-inventory.md` covering every table that holds
   personal data, with retention and rights routes (`PRIV-016`); retention
   purges wired for last search, exports, outbox bodies, request events
   (`PRIV-017`).
4. Extend the existing log/telemetry scan to URLs and analytics payloads
   (`PRIV-019`).
5. Tests: api `account-consents.test.ts` (grant/withdraw per purpose, ledger
   immutability, send-time skip); e2e `account-privacy.spec.ts` extension;
   scan assertion in CI.

**Exit:** `PRIV-011`–`PRIV-019`, `BUS-007`; architect review.

### Phase 4 — Export (1 day)

1. `account_exports`; `accountExport.ts` builds the bundle from the inventory
   (profile, preferences, consents, registrations, last search, business
   memberships metadata, request history) — never passwords, tokens, provider
   payloads (`OFF-003`, `OFF-004`).
2. Route set with recent-auth; artifact in App Storage; download only through
   a signed-in, expiring route; e-mail is a notice only (`OFF-005`); explicit
   states requested → preparing → available → downloaded / expired / failed
   (`OFF-006`, `DATA-003`); failed → support queue (`OPS-003`).
3. Support view lists export requests by reference without e-mail/phone
   (`OFF-020`).
4. Tests: api `account-export.test.ts` (ownership isolation, expiry, failed
   state, second request idempotent while one is open); e2e
   `account-export.spec.ts`; content assertion that the bundle contains no
   secret or provider payload.

**Exit:** `OFF-003`–`OFF-006`, `BUS-008` (export part).

### Phase 5 — Deletion lifecycle completion (1½ days)

1. Explanation screen with waiting period, cutoff, retained categories from
   policy (`OFF-007`); final confirmation + reauth (`OFF-008`); idempotent
   request with stable reference (existing, `OFF-009`); withdraw refused after
   `cancel_until` (`OFF-010`).
2. Scheduler: at `scheduled_for`, disable account + revoke Clerk sessions +
   remove credentials (Clerk user delete) in the approved order
   (`OFF-011`, `OFF-012`); per-processor outcome rows and reconciliation
   (`OFF-013`); anonymise app rows, keep audit minimum (`OFF-019`); result
   report by category (`OFF-014`); completion only when every processor row is
   final (`OFF-015`).
3. `closed_at` tombstone checked by consumer-registration, invitation and
   any reset/verify route (`OFF-016`); deleted accounts cannot restore
   preferences or last search (`OFF-017`); same e-mail later = new account
   (`OFF-018`) — verified against Clerk behaviour after user delete.
4. Sole-owner guard retained; `OFF-001` wording audit across the account page.
5. Tests: api `account-lifecycle.test.ts` extension (cutoff, scheduler with
   injected clock and injected Clerk client, processor failure → visible
   state, report accuracy, tombstone refusals); e2e `account-deletion.spec.ts`
   (offline Clerk stub) and one live Clerk delete run in the account
   regression workflow; `BUS-006`, `BUS-010` evidence recorded from the
   v0.5.2 suites plus the new support views.

**Exit:** `OFF-001`–`OFF-020`, `BUS-006`, `BUS-008`, `BUS-010`; architect
review.

### Phase 6 — Hardening and release evidence (½–1 day)

1. Full regression: api suites, `map-regression`, `usability-regression`,
   `account-regression`, remaining e2e; v042/v043 debt unchanged.
2. Threat-model delta for export download and deletion scheduler appended to
   `threat_model.md`.
3. Flag table per environment; §15 provisional values; schema push notes for
   production; log and prompt log finalised; push.

## 5. Requirement implementation matrix

Legend — *Approach*: where it is built; *Test*: suite that proves it;
*Accept*: condition recorded in the log.

### 5.1 Business outcomes

| ID | Approach | Test | Accept |
|---|---|---|---|
| BUS-005 | Phase 1 quick link + restoration | `last-search.spec.ts` | Restored view equals captured public criteria; map suites unchanged |
| BUS-006 | Evidence from v0.5.2 recovery suites, no new code | `clerk-live-signup.spec.ts` recovery steps | Log cites the run; support procedure text reviewed |
| BUS-007 | Consent ledger + versioned legal docs | `account-consents.test.ts` | Every grant/withdraw row has version, locale, time |
| BUS-008 | Profile (existing) + export + consent + deletion | Phases 3–5 suites | All six rights reachable from `/account/privacy/rechten` |
| BUS-010 | Support views keyed by reference, `OPS-004` logging | `account-lifecycle.test.ts` support DTO assertions | No e-mail/phone/token in support DTOs or logs |

### 5.2 Profile and contact

| ID | Approach | Test | Accept |
|---|---|---|---|
| PROF-004 | Clerk e-mail change framed; app follows verified primary | live Clerk run | Old address stays primary until verification |
| PROF-005 | Two outbox templates | lifecycle template test | Old and new addressed correctly, NL/EN |
| PROF-006 | Preferences block | `account-preferences.spec.ts` | Values persist and gate `SRCH-016`/`SRCH-021` |

### 5.3 Last search and map state

| ID | Approach | Test | Accept |
|---|---|---|---|
| SRCH-001 | Route requires app user; anonymous never writes | `last-search.test.ts` | 401 without session |
| SRCH-002 | Zod allow-list, unknown keys rejected | same | 400 on extra key |
| SRCH-003 | Included in export/deletion | export + deletion tests | Present in bundle; gone after deletion |
| SRCH-004 | No geolocation column; capture never reads `navigator.geolocation` | code review + e2e permission spy | No geolocation prompt during capture/restore |
| SRCH-005 | numeric(6,3) rounding | unit test | Stored ≤ 3 decimals |
| SRCH-006 | Restoration URL built from public criteria only | e2e URL assertion | URL contains no lat/lng/account id |
| SRCH-007 | Allow-list | `last-search.test.ts` | Payload/token keys rejected |
| SRCH-008 | Unique per user, upsert | same | Second PUT replaces |
| SRCH-009 | `expires_at` + purge job | same with injected clock | Expired row not returned |
| SRCH-010 | Account home quick link | `last-search.spec.ts` | Visible after sign-in |
| SRCH-011 | Summary omits raw query text | same | Query text absent from summary |
| SRCH-012 | Validate against live catalogues | unit test with removed neighbourhood | Removed id dropped |
| SRCH-013 | Partial restore | same | Remaining criteria restored |
| SRCH-014 | No geolocation call on restore | e2e spy | — |
| SRCH-015 | Stored-only restore | e2e provider request spy | No live provider request |
| SRCH-016 | Scope restored only per preference | e2e | Scope reset when preference is `ask` |
| SRCH-017 | Canonical URL from validated criteria | e2e | — |
| SRCH-018 | Confirm → DELETE → 204 → UI clears | e2e | Row gone server-side |
| SRCH-019 | Query cache invalidation | e2e | Quick link gone without reload |
| SRCH-020 | Cache key includes user id; sign-out clears | e2e two users | Second user never sees first's link |
| SRCH-021 | `retain_last_search` opt-out | api 204 no-write test | No row after opt-out |

### 5.4 Terms, privacy, GDPR

| ID | Approach | Test | Accept |
|---|---|---|---|
| PRIV-004 | Print CSS + PDF | e2e download | NL/EN PDFs carry version + date |
| PRIV-011 | Toggle per purpose | `account-consents.test.ts` | Withdrawing one leaves others |
| PRIV-012 | Send-time check | lifecycle test | Skipped outcome recorded |
| PRIV-013 | Ledger columns | api test | Purpose, version, locale, time on every row |
| PRIV-014 | Copy | i18n parity test | Present in NL and EN |
| PRIV-015 | Rights page | e2e + axe | All routes reachable |
| PRIV-016 | Inventory document | review | Owner sign-off recorded |
| PRIV-017 | Purge jobs | api tests with clock | Rows removed after retention |
| PRIV-018 | Copy audit | grep in CI for "GDPR-compliant"/"AVG-conform" | Zero hits |
| PRIV-019 | Scan extension | CI scan | URLs/analytics clean |

### 5.5 Export and offboarding

| ID | Approach | Test | Accept |
|---|---|---|---|
| OFF-001 | Distinct sections and copy | usability + i18n | Seven actions named distinctly |
| OFF-002 | `requireRecentAuth` on export/revoke/e-mail/deletion | api 401/step-up tests | — |
| OFF-003 | Request bound to session user | isolation test | Other user 404 |
| OFF-004 | JSON (+CSV) | content test | Parses; schema documented |
| OFF-005 | Expiring signed-in download; mail is notice only | api + template test | Mail body has no data, no direct URL token |
| OFF-006 | Explicit states | api test | Every transition recorded in events |
| OFF-007 | Explanation screen | e2e + i18n | Values match policy table |
| OFF-008 | Confirmation + reauth | e2e | — |
| OFF-009 | Existing idempotent request | api test | Same reference on retry |
| OFF-010 | Cutoff | api 409 test | — |
| OFF-011 | Scheduler step 1 | api with injected Clerk | Sessions revoked, user deleted at provider |
| OFF-012 | Order enforced by state machine | api test | Out-of-order transition impossible |
| OFF-013 | Processor outcome rows | api failure injection | Failed processor → request `blocked`, visible |
| OFF-014 | Result report | api test | Categories match inventory |
| OFF-015 | Completion gate | api test | Not `completed` while any processor open |
| OFF-016 | Tombstone in token routes | consumer-registration + membership tests | Links refused after closure |
| OFF-017 | Deleted user reads return 404/410 | api test | — |
| OFF-018 | Verified against Clerk | live run note | New Clerk id, new app user |
| OFF-019 | Anonymisation keeps ids/timestamps/event codes only | api test | No name/e-mail/phone in retained rows |
| OFF-020 | Support view | api DTO test | No unnecessary personal data |

### 5.6 Data

| ID | Approach | Test | Accept |
|---|---|---|---|
| DATA-001 | Phase 0 audit | grep report in log | No e-mail-keyed relation; or migration delivered |

## 6. Acceptance evidence package

`release_v053_log.md` must contain, per phase: what changed and why, suite
results with counts, live Clerk walk-through notes where the provider owns
the step (e-mail change, user deletion), architect findings and resolutions,
the §15 provisional policy table, the flag table per environment, and the
production schema-push notes. `v053-prompt-log.md` records each prompt,
response summary and observed duration.

## 7. Definition of implementation complete

- Every row in §5 has evidence in the log.
- Typecheck clean; all api, unit and e2e suites green; `map-regression`,
  `usability-regression`, `account-regression` unchanged (v042/v043 debt
  noted, not extended).
- Schema applied to development; production push steps documented.
- Architect reviews after Phases 1, 3, 5 resolved.
- New flags off in production until the user records the enablement decision;
  §15 items 6–11 recorded as provisional or approved.
