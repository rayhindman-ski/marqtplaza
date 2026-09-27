# Release v0.5.2 — Implementation Log

Branch: `feature/v052-business-onboarding-journey` (from `7637d61`)
Specification: [`release_v052.md`](./release_v052.md)
Plan: [`release_v052-implementation-plan.md`](./release_v052-implementation-plan.md)
Prompt log: [`v052-prompt-log.md`](./v052-prompt-log.md)

Each entry records what was done, why, evidence, and the resulting commit when
one exists. Times are Europe/Amsterdam. Same conventions as
[`release_v051_log.md`](./release_v051_log.md).

## Standing constraints (from the user)

- All phases 0–6 run in sequence; stop only for blockers.
- Policy decisions (§15) use **provisional** values: KvK number optional; member
  invitations valid 7 days; no automatic approval of any claim; automatic
  sign-in after password creation. Production enablement requires confirmation.
- No change to map / lists / icons / cards / filters behaviour.
- `/api/registration` and `user_registrations` (research registration) are not
  touched.
- Foreground work only; no publishing suggestions.

## Entries

### 2026-09-27 — Phase 0: dependencies confirmed

Inspected (read-only): Clerk usage in `artifacts/api-server/src/lib/{requireAppUser,clerk*}.ts`,
`artifacts/buurtgids/src/App.tsx` (Clerk provider, sign-in/up pages,
redirect allow-list), feature flags (server `lib/featureFlags.ts`, web
`src/lib/featureFlags.ts`, readiness `/api/readiness`), return-ref allow-lists
(API `consumerRegistration.ts` `sanitizeReturnRef`, web `lib/returnPath.ts`),
claim approval (`lib/claimDecisions.ts`), intake / moderation / publication
routers, lifecycle outbox + templates + notifications, sole-owner helper in
`routes/account-lifecycle.ts`, schema `lib/db/src/schema/businessDirectory.ts`,
i18n parity test.

Findings:

1. **Credentials are owned by Clerk.** The application never receives or
   stores a password. No Clerk user webhook exists in the codebase (only the
   lifecycle *receipt* webhook). `clerkClient` is used for user lookup only.
2. **Password creation after the v0.5.1 link (mechanism decided):** after the
   consumer explicitly consumes the link, the app opens Clerk's standard
   sign-up with the verified address prefilled. Clerk runs its own e-mail
   code verification and password creation; the app never mints Clerk users
   or sign-in tokens server-side. Auto sign-in after password creation is
   Clerk's default (provisional policy value, see above).
3. **Forgot / reset / change password and "sign out everywhere"** are Clerk
   custom flows (`@clerk/react` v6 "future" sign-in API:
   `resetPasswordEmailCode.sendCode / verifyCode / submitPassword`, `finalize`;
   `user.updatePassword`, `user.getSessions` + `session.revoke`). The app
   frames them with its own NL/EN copy and maps provider error *codes* to
   local text; the provider's message text is never shown.
4. **`account.password_changed` notification (deviation from plan §3 Phase 1
   step 3):** without a Clerk webhook there is no server-side change signal to
   enqueue an outbox message on. Clerk sends its own "password changed" e-mail
   to the account address. The outbox template is therefore **not** added in
   this release; the UI copy states that a confirmation e-mail follows.
   Adding a Clerk `user.updated` webhook is out of scope (needs a dashboard
   configuration decision) and is recorded as follow-up debt.
5. `business_claims` already carries relationship, evidence URL, authority
   declaration, evidence reference, version and idempotency columns;
   `business_members` has free-text `role` (default `owner`) and a unique
   `(profile, user)` constraint — Phase 5 builds on these rather than
   replacing them.

Baselines (before any change): `business-intake` 14/0, `business-publication`
25 pass / 2 fail (pre-existing fact-check due-ordering tests; not touched by
this release), `account-lifecycle` 22/0, `account-foundation` 26/0,
`consumer-registration` (isolated DB) 27/0.

### 2026-09-27 — Phase 1: credential lifecycle

**API (handoff, BCRED-001):**

- `POST /consumer-registration/verify` (consume) now returns, once, a
  `handoff` object `{ email, returnRef }` in the `valid` state. `inspect`
  (GET) and replays of an already-consumed token never expose it (tests
  added). `/account/bedrijf/toevoegen` added to the server return-ref
  allow-list. OpenAPI `ConsumerRegistrationHandoff` schema; clients
  regenerated. Isolated suite: 27/0.

**Web:**

- `ConsumerRegisterCompletePage`: after consume, the "Next step: your
  password" panel stores the verified address in **tab-scoped
  `sessionStorage`** (`credentialHandoff.ts`; never the URL, never
  `localStorage`) and opens `/sign-up?terug=<returnRef>`. `SignUpPage`
  prefills Clerk's card from it; the entry is cleared as soon as a session
  exists. Business-intent return refs get the extra "then you add your
  business" line.
- Fixed a v0.5.1 latent defect found while testing: the link locale never
  applied because the language hook persisted its default before the
  "has the browser chosen a language" check ran. The check is now taken
  before mount persistence.
- `ForgotPasswordPage` (`/account/wachtwoord-vergeten` and
  `/account/wachtwoord-herstellen`): neutral response for unknown addresses
  (REC-002), code + new password + confirm + "sign out other devices"
  (default on for reset), field-level errors for wrong / expired code and weak
  or breached passwords, "no reset request active in this browser" state,
  success state that signs the browser in once and returns to the safe
  return path. Signed-in visitors are redirected to the security page.
- `AccountSecurityPage` (`/account/beveiliging`): change password (current
  password required = recent-auth proof), set password when none exists,
  optional sign-out-elsewhere on change, "sign out everywhere else" with a
  live count of other sessions. Requires a session; redirects to sign-in with
  `terug=/account/beveiliging`.
- Sign-in page shows "Forgot password?" under Clerk's card; account home
  links to Security. NL/EN keys under `accountTranslations.security` and new
  `register.doneNext*`; parity test green. New paths in the web return-path
  allow-list.
- Shared `PasswordField` (show/hide, hint + error via `aria-describedby`,
  correct `autocomplete` tokens) and `clerkErrors.ts` (code → local copy;
  offline detection).

**Tests / evidence:**

- `e2e/credential-lifecycle.spec.ts` (new, offline): forgot link and Dutch
  validation, reset "no request" state + language switch, security page
  session gate with return path, sign-up prefill from the handoff and never
  from the URL. 4/4.
- `e2e/consumer-registration.spec.ts`: consumed link → handoff → sign-up URL
  without address or token; address only in `sessionStorage`. 7/7.
- `e2e/clerk-live-signup.spec.ts` extended against the live Clerk dev
  instance: sign-up → change password on the security page → wrong current
  password refused → sign out → forgot (URL never contains the address) →
  wrong code (field error, form state kept) → reset with the test code →
  signed in and returned to the intent → retired password refused at sign-in,
  recovered password accepted; captured provider request log contains no
  password. 1/1 (38.6 s).
- `e2e/account-preferences.spec.ts`, `signup-stale-step.spec.ts`,
  `account-privacy.spec.ts`: 20/20. `usability-regression.spec.ts`: forgot
  and reset screens added to the axe gate (desktop + phone); only the known
  brand-orange contrast debt, budgeted at its measured value (4 / 3 nodes);
  13/13. Workspace typecheck clean.
- Evidence mapping: REG-021–030 (handoff, prefill, no address in URL),
  AUTH-001–014 (sign-in, forgot link, security page, recent-auth),
  REC-001–013 (neutral response, code states, password rules, single sign-in,
  other-session sign-out).

**Not done in this phase (recorded):** `account.password_changed` outbox
template — see Phase 0 finding 4. `clerk-verification-recovery.spec.ts` was
not extended; its states are covered by `signup-stale-step.spec.ts` and the
new suite.

### 2026-09-27 — Phase 2: intent, entry points, `businessOnboarding` flag

**Flag (BOPS-001):** `businessOnboarding` added to server flags
(`BUSINESS_ONBOARDING_ENABLED`), web mirror (`VITE_BUSINESS_ONBOARDING_ENABLED`),
`/api/readiness`, and the Playwright web server env. Both are set **on** in the
development environment only; production stays off (pending user decision, as
for the v0.5.1 flags). Existing unit suites updated for the new flag key.

**API (BENT-002/003):** `POST /business-onboarding/intent` — stateless and
unauthenticated; validates `context ∈ {registration, account_home, listing}`
and an optional `listingSource`/`listingId` pair (both or neither; strict
character sets; unknown fields refused) and answers the canonical local return
path `/account/bedrijf/toevoegen?context=…[&listingSource&listingId]`. Nothing
is stored, so resuming after verification, sign-in or a reload replays no
write. 404 `FEATURE_DISABLED` while the gate is closed. OpenAPI
`BusinessOnboardingIntentInput` / `BusinessOnboardingIntent`; clients
regenerated. `test:business-onboarding` 4/0.

Design note: an intent is *derived*, not persisted. Persisting the context
lands on the claim itself (`business_claims.onboarding_context`) in Phase 3,
when there is a row to attach it to. The v0.5.1 return-ref allow-lists (API
and web) already admit the business-step path with its query string.

**Web (BENT-001/004/005):**

- `ConsumerRegisterPage`: "I represent a business" choice (flag on). Checked
  → `returnRef = /account/bedrijf/toevoegen?context=registration` (only that
  path is sent; no extra field). Preselected when the visitor arrived with the
  business return path; unchecking drops it. Complete page's "then you add
  your business" line now matches the path with its query.
- Sign-up frame: "I represent a business" link → `/sign-up?terug=<business
  step>`; once carried, a status line confirms it.
- Account home: "Business" panel → `?context=account_home`.
- Public business page (`/bedrijf/:slug`), unclaimed only: "Is this your
  business?" → `?context=listing&listingSource=buurtplaza_profile&listingId=<id>`.
  Not on the map hover card (map behaviour unchanged).
- New `BusinessOnboardingIntroPage` at `/account/bedrijf/toevoegen`: requires
  a session (redirects to sign-in with itself, query included, as `terug`);
  asks the server to confirm the intent on open (a malformed listing reference
  is dropped, the context kept); explains the business profile, who sees
  what, and that the personal account stays separate; resume notice for the
  registration context; server 404 → "not open yet" state. The Start button
  currently hands over to the existing lookup (`/bedrijf-zoeken`) with the
  intent as return path; Phase 3 replaces it with the wizard.
- Shared `lib/businessIntent.ts` (ref builder, path check). NL/EN copy under
  `accountTranslations.business`; parity test green.

**Tests / evidence:** new `e2e/business-onboarding.spec.ts` 11/11 (registration
choice and payload, preselect/uncheck, sign-up entry, session gate with query,
account-home path + server confirmation + explanation, resume without repeated
write, listing entry with opaque reference, claimed listing shows nothing,
tampered listing id dropped, closed gate, English). Business-step intro added
to the axe gate (budget 4/4 brand-orange nodes, no other violations).
Regression: consumer-registration 7/7, credential-lifecycle 4/4,
account-preferences + account-privacy + signup-stale-step + business-review +
business-intake + usability 44/44, api `account-foundation` 26/0, workspace
typecheck clean. Dev API: `/api/readiness` reports `businessOnboarding: true`;
intent round-trip verified with curl.

Duration: ≈14:55 – 15:27 CEST.
