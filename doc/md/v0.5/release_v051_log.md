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
