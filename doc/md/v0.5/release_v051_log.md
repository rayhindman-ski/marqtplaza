# Release v0.5.1 — Implementation Log

Branch: `feature/v051-add-user-journey`
Specification: [`release_v051.md`](./release_v051.md)
Requirements: [`requirements.md`](./requirements.md)

Each entry records what was done, why, evidence, and the resulting commit when
one exists. Times are Europe/Amsterdam.

## Entries

### 2026-09-23 — Log created, discovery started

- Created this log on branch `feature/v051-add-user-journey` (clean tree,
  branched from `feature/v0431-fix-and-normalize-behavior` at `0f00d01`).
- Next: inspect existing account, lifecycle-outbox, feature-flag, and Clerk
  infrastructure so v0.5.1 reuses approved contracts (release_v051 §9.3, §9.4).

### 2026-09-23 — Discovery findings

Inspected (read-only): `lib/db/src/schema/{accounts,lifecycle,userRegistrations}.ts`,
`artifacts/api-server/src/lib/{lifecycleOutbox,lifecycleEmailProvider,lifecycleTemplates,featureFlags,apiError}.ts`,
`artifacts/api-server/src/routes/{registration,index,health}.ts`,
`artifacts/api-server/src/middlewares/requireFlag.ts`, `lib/api-spec/openapi.yaml`,
`artifacts/buurtgids/src/{App.tsx,lib/featureFlags.ts,lib/i18n.ts,components/account/AccountShell.tsx}`.

Findings that shape the design:

1. The existing `/api/registration` route and `user_registrations` table are the
   separate research/campaign registration (authenticated, Clerk-bound). They
   are **not** consumer registration and will not be touched (REG-010, DATA-002).
2. The lifecycle outbox is the approved transactional delivery path (§9.4). It
   addresses recipients only by `app_users.id` and resolves the address at Clerk
   at dispatch time. A pending registrant has no Clerk user and no `app_users`
   row, so the outbox needs a second recipient kind.
3. The outbox payload allow-list rejects tokens by design, and REG-013 forbids
   storing the raw token. Therefore the raw registration token cannot be queued.
   **Decision:** the token is minted inside the email loader at dispatch time,
   digest persisted transactionally with supersession of earlier tokens, and the
   raw value exists only in the rendered email. A retried send after an
   ambiguous provider response mints a new token; the earlier link then reports
   `superseded`, which is a documented state (REG-014/REG-015).
4. Feature flags are env-driven and cached per process (`ACCOUNTS_ENABLED`
   etc.); disabled routes answer 404 `FEATURE_DISABLED`. v0.5.1 gets its own
   flag `CONSUMER_REGISTRATION_ENABLED` / `VITE_CONSUMER_REGISTRATION_ENABLED`
   so it can stay off independently of the existing `accounts` gate (§3, OPS-006).
5. Rate limiting exists only as an in-memory sliding window inside one route;
   a small reusable limiter will be added for registration/resend (SEC-004/005).
6. Web app: Wouter routes in `App.tsx`, both locales in `src/lib/i18n.ts`,
   `AccountShell`/`AccountUnavailable` layout, generated TanStack hooks from
   `@workspace/api-client-react` after `pnpm --filter @workspace/api-spec codegen`.
7. **Decision (link prefetching):** `GET /consumer-registration/verify` only
   inspects the token state and never consumes it, because mail scanners and
   link previews follow GET links and would burn single-use tokens. Consumption
   is `POST /consumer-registration/verify`, triggered by the consumer's explicit
   "Continue" action on the handoff page. Replaying the POST yields `used`.
8. **Decision (existing accounts):** whether an email already belongs to an
   account is checked through an injectable lookup (default: Clerk user list by
   email). The response is identical either way; no pending registration is
   created for an existing account.

### Plan

1. Schema: `consumer_registrations`, `consumer_registration_tokens`, and a
   nullable `recipient_registration_id` on `lifecycle_outbox`.
2. Feature flag `consumerRegistration` (server + web + readiness contract).
3. OpenAPI: `POST /consumer-registration`, `POST /consumer-registration/resend`,
   `GET|POST /consumer-registration/verify`; regenerate Zod + React client.
4. API: normalization, token/digest helpers, layered rate limiter, service,
   router, outbox recipient extension, dispatch-time link minting, NL/EN template.
5. Tests: isolated-database integration suite covering §12.1–§12.5 API cases.
6. Web: `/account/register`, `/account/register/check-email`,
   `/account/register/complete`; NL/EN copy; flag-gated unavailable state.
7. Verification: typecheck, API suites, web unit tests, existing discovery
   regression suite (§12.7) unchanged.

### 2026-09-23 — Steps 1–5: schema, flag, contract, API, tests

**Schema** (`lib/db/src/schema/consumerRegistrations.ts`, `lifecycle.ts`)
- Added `consumer_registrations` (pending/verified/expired/cancelled; one open
  registration per normalized address via a partial unique index) and
  `consumer_registration_tokens` (SHA-256 digest only, `used_at`,
  `superseded_at`, `expires_at`, originating outbox id).
- Added nullable `lifecycle_outbox.recipient_registration_id`. Both new foreign
  keys are named explicitly because the generated names exceed PostgreSQL's
  63-character limit (known drizzle-kit push hazard).
- No existing table or column was altered or removed (DATA-002).

**Feature flag** — `consumerRegistration` ↔ `CONSUMER_REGISTRATION_ENABLED`
(server) and `VITE_CONSUMER_REGISTRATION_ENABLED` (web); `FeatureReadiness`
gains the field. Existing test fixtures updated for the wider type only.

**Contract** (`lib/api-spec/openapi.yaml`, regenerated Zod + React clients)
- `POST /consumer-registration` → 202 neutral `{status:"accepted", linkLifetimeMinutes}`.
- `POST /consumer-registration/resend` → same neutral shape; 429 on cooldown.
- `GET /consumer-registration/verify?token=` → inspect only (prefetch safe).
- `POST /consumer-registration/verify` → consume; returns
  `{state: valid|expired|used|superseded|invalid, canResend, locale?, expiresAt?}`.
- All four answer 404 `FEATURE_DISABLED` while off; unknown body fields are
  rejected (`UNKNOWN_FIELD`), so a client-supplied password or role never
  reaches the server logic (REG-004).

**API** (`artifacts/api-server/src/lib/consumerRegistration.ts`,
`routes/consumer-registration.ts`, outbox + email provider + templates)
- Conservative normalization: trim/lower-case email (no dot/plus merging),
  NL-default E.164 phone, whitespace-collapsed name, site-relative-only
  `returnRef`.
- Service: submit (re-submit of a pending address becomes a cooldown-guarded
  resend; existing account or verified registration → silent no-op; insert race
  absorbed via unique violation), resend (supersedes earlier tokens immediately,
  queues exactly one replacement, hard per-registration budget), inspect,
  consume (single transaction, `verified` state), expireStale housekeeping.
- Outbox: new recipient kind `recipientRegistrationId`, new
  `enqueueRegistrationLifecycleMessage` (empty payload; token never queued),
  dispatcher no longer cancels registration-addressed rows.
- Email loader: registration recipients are resolved from the pending row at
  dispatch time; the token is minted there (digest persisted, earlier tokens
  superseded) and passed to the template as a render-only variable. Missing
  `CONSUMER_REGISTRATION_LINK_BASE_URL` → transient failure
  `registration_link_not_configured` (mail stays queued, no token minted);
  closed registration → permanent `registration_closed`.
- Template `registration.link` (NL/EN): purpose, link, lifetime, "no account
  yet", unintended-recipient guidance, privacy + support links; no sign-in
  line, no phone, no password. Only http(s) URLs are ever rendered.
- Layered in-memory sliding-window limiter (per network, per address, resend
  cooldown) keyed by digests; windows expire, no permanent block (SEC-005).
- Existence check is injectable; default queries Clerk's user list by exact
  address and fails closed with 503 `DEPENDENCY_UNAVAILABLE` when unreachable.

**Tests**
- New isolated-DB suite `routes/consumer-registration.test.ts` (24 cases:
  §12.1–§12.5, gate, template) via
  `pnpm run test:consumer-registration:integration`
  (`lib/db/scripts/run-consumer-registration-integration.mjs`): **24/24 pass**.
- Existing `test:account-lifecycle:integration` updated for the wider outbound
  message shape and the documented template exception: **22/22 pass**.
- `test:account-foundation`: 26/26 pass. API typecheck clean.

Decision recorded: the initial request endpoint does not apply the resend
cooldown (a double-submit is absorbed silently), only the resend endpoint
does; both share the per-address and per-network hourly budgets.

### 2026-09-23 — Step 6: web screens, dev wiring, live walk-through

**Web (`artifacts/buurtgids`)**
- New pages `ConsumerRegisterPage` (`/account/register`: name, email, phone,
  locale from the app language, optional `returnRef` from `?return=`),
  `ConsumerRegisterCheckEmailPage` (`/account/register/check-email`: neutral
  "check your email" copy, existing-account hint with sign-in link, resend
  form) and `ConsumerRegisterCompletePage` (`/account/register/complete`:
  GET inspect on load, explicit **Continue** button issues the consuming POST;
  states valid / used / expired / superseded / invalid / unavailable / done).
- The token is removed from the address bar with `history.replaceState`
  before the first request; the registered address travels to the check-email
  screen through `sessionStorage`, never through the URL.
- The link's locale (from inspect) sets the app language so the consumer
  lands in the language they registered in.
- Routes registered in `App.tsx` before `/account/voorkeuren`; NL/EN copy
  added as `register` in `accountTranslations` (`lib/i18n.ts`); the i18n
  parity test covers it. Feature flag off → pages render the "not available"
  panel and never call the API.
- No change to any discovery, map, list, filter, card or icon code.

**Dev wiring**
- Development env vars `CONSUMER_REGISTRATION_ENABLED=true` and
  `VITE_CONSUMER_REGISTRATION_ENABLED=true` (development only; production
  stays off per §6). `CONSUMER_REGISTRATION_LINK_BASE_URL` is intentionally
  not set: no delivery provider is configured, so mails stay queued.
- Development database schema pushed (`drizzle-kit push`, applied cleanly:
  `consumer_registrations`, `consumer_registration_tokens`,
  `lifecycle_outbox.recipient_registration_id`). Production schema is applied
  by the Publish flow, not by code.

**Live walk-through (dev API + dev web)**
- POST request → 202 `{status:"accepted", linkLifetimeMinutes:60}`; repeated
  request → identical 202; bogus token → `invalid`; resend → 202.
- Outbox dispatched once with a capturing transport and the dev domain as
  link base: NL mail rendered as specified (link, 60 min, single use, "no
  account yet", ignore-if-unintended, privacy + support links).
- Opening the link: page in Dutch, state `valid`, "Geldig tot 07:41",
  **Doorgaan** button; GET inspect did not consume (second inspect still
  `valid`); POST consume → `valid`, second POST → `used`; reopening the link
  shows "Deze link is al gebruikt". Check-email screen verified visually.
- Observation: a resend issued inside the 60 s cooldown right after the
  first request answers 202 while the service suppresses the send (cooldown
  is measured from `last_sent_at`); a second resend inside the window gets
  429. Both are neutral; no enumeration signal.

### 2026-09-23 — Step 7: review round and hardening

Architect review (full diff) reported the following; all addressed:

1. **Stale send generations could invalidate the delivered link (severe).**
   A retried outbox row re-minted a token and superseded *every* effective
   token, so (a) a provider that deduplicates the retry by idempotency key
   delivered a body whose token was already superseded, and (b) an old queued
   row retried after a resend superseded the newer link.
   Fix: token issuance supersedes only tokens of *other* outbox rows (tokens
   of the same row stay valid); the loader refuses to mint for any row that
   is not the newest send for the registration → permanent failure
   `registration_send_superseded`, no mail. Tests: same-row retry keeps the
   first link valid; stale earlier row fails and exactly one replacement
   mail goes out.
2. **Status/timing oracle (severe).** Pending/verified addresses returned
   before the identity-provider lookup, so an outage answered 202 for
   pending addresses and 503 for others. Fix: the lookup runs first for every
   valid request; the outage now answers 503 uniformly (test added).
3. **Error objects in logs (high).** Full errors could carry SQL parameters
   (address, name, phone). Fix: `safeErrorSummary` logs class + driver code
   only, in the router's fail-closed handler and the account lookup.
4. **Consume race.** The `verified` transition ignored its row count. Fix:
   guarded update (`pending` and not past deadline) must affect one row,
   otherwise the transaction rolls back and the link reports `expired`.
5. **SEC-009 `returnRef`.** Same-origin shape only. Fix: server-side
   allow-list identical to the web `returnPath` list (exact routes and
   `/activiteiten/den-haag/…`, `/nieuws/…`, `/bedrijf/…` segments);
   anything else is dropped. Tests updated.
6. **A11Y.** Failed submit focuses the first invalid field or the form-level
   error; resend error is associated (`aria-invalid`, `aria-describedby`) and
   focus returns to the field, success focuses the notice; the completion
   page moves focus to the outcome region on every state change.
7. **Unhandled route errors.** Express's default handler echoed the failing
   query (including parameters) as an HTML 500. A router-scoped fail-closed
   handler answers `DEPENDENCY_UNAVAILABLE` (test proves no address or query
   text leaks).

**Verification**
- `pnpm run typecheck` (all packages): clean.
- `test:consumer-registration:integration`: **27/27**;
  `test:account-lifecycle:integration`: 22/22; `test:account-foundation`:
  26/26; `test:business-intake`: 14/14.
- Web unit tests (i18n parity etc.): 32/32.
- New Playwright spec `e2e/consumer-registration.spec.ts` (route-mocked API;
  flag enabled in `playwright.config.ts` webServer env): **6/6** — focus and
  error association, neutral 202 → check-email without address in URL,
  inspect-then-explicit-consume with the token stripped from the address
  bar, used/expired/superseded states, no API call without a token.
- Discovery regression (`e2e/discovery-regression.spec.ts`, the
  `map-regression` workflow): **11/11** — unchanged behaviour.
- Pre-existing failures, reproduced identically on base commit `0f00d01`
  before this release's changes: 5 tests in `v042-release.spec.ts` /
  `v043-release.spec.ts`, and `test:business-publication` "flags a re-check
  as due before freshness flips to stale" (date-dependent assertion, 29 vs
  21). Not touched by v0.5.1; listed here so they are not attributed to it.

### 2026-09-23 — Follow-up: language toggle on the sign-in / sign-up screens

Report: the registration form appeared in Dutch although English was
selected, and the flow had no language toggle.

- Verified with a scripted browser run (stored language `en`):
  `/account/register`, `/sign-up` and `/account` → `/sign-in` all render in
  English; switching the homepage selector NL→EN and then following the
  header account link also yields English Clerk cards. The Dutch rendering
  could not be reproduced from a stored English choice; awaiting the exact URL
  from the reporter.
- Confirmed gap: the Clerk `/sign-in` and `/sign-up` pages had no back link
  and no NL/EN toggle (the v0.5.1 `/account/register*` pages already had one
  via `AccountShell`).
- Fix: extracted `LanguageToggle` from `AccountShell` and added an
  `AuthPageFrame` around both Clerk cards with the same back link and toggle.
  The toggle writes the shared stored language; the Clerk provider re-reads it
  and re-localizes the card in place (verified: EN → NL → sign-in link → EN,
  card copy follows each switch).
- Verification: typecheck clean (all packages); `e2e/consumer-registration`
  6/6; `e2e/clerk-verification-recovery`, `e2e/signup-stale-step`,
  `e2e/account-preferences` 14 passed / 3 skipped (unchanged skips).
- No discovery, map, list, filter, card or icon code touched.

### 2026-09-23 — Follow-up: language on the registration screens (root causes)

The reporter's screenshot showed the research registration page
(`/onboarding`, "Registratie afronden"), and the answer "complete
registration" also pointed at `/account/register/complete`. Two causes:

1. **`/account/register/complete` overrode the chosen language.** The v0.5.1
   completion page set the app language to the locale stored in the link on
   every load. Changed: the link locale is now only a fallback when the
   browser has no stored language at all (email opened on another device);
   a language already chosen in this browser always wins
   (`hasStoredLanguage()` in `lib/useAppLanguage.ts`).
2. **`/onboarding` was Dutch-only and had no toggle.** All copy on the
   research registration page was hard-coded Dutch. Moved it into
   `accountTranslations.{nl,en}.onboarding` (35 keys incl. both rating
   scales and the `n of 5` aria-label), the page now reads the shared app
   language and shows the same NL/EN toggle as the other account screens.
   The `/api/registration` contract and payload are unchanged (REG-010).

Verification: typecheck clean; i18n parity 12/12; `e2e/consumer-registration`
6/6, `e2e/account-preferences`, `e2e/account-privacy`: 19 passed in total.
Discovery code untouched.
