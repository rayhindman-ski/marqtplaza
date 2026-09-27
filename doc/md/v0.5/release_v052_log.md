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

**API (BENT-002/003):** `POST /business-onboarding/intent` — stateless;
validates `context ∈ {registration, account_home, listing}` and an optional
listing key `cityId`/`listingSource`/`listingId` (all or none; strict
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
  Not on the map hover card (map behaviour unchanged). The public profile now
  exposes `listingSource`/`listingId` (provider identifiers, not personal
  data) so the entry carries the intake's real listing key.
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

**Architect review (after Phase 2) — findings and resolution (15:28 – 15:40):**

1. *Gate not composite.* Fixed: `businessOnboarding` is now an effective flag
   (`own switch && accounts && businessIntake`) on the server, in the web
   mirror and therefore in `/api/readiness`; unit-tested
   (`featureFlags.test.ts`).
2. *Intent route unauthenticated.* Fixed: the gate is checked first (404 for
   everyone while closed), then `requireAppUser({ requireVerified: true })`
   → 401 anonymous, 403 unverified/suspended/deleted. The intro page is
   already session-gated, and the registration entry never calls the
   endpoint, so nothing user-facing changed. Suite now needs the database
   (account row provisioning); 7/7.
3. *Listing entry lost its target.* Fixed: the listing reference is the
   intake's listing key (`cityId`, `listingSource`, `listingId`, from the
   public profile); a confirmed listing intent's Start hands over to the
   existing `/bedrijf-nieuw?kind=existing_listing&…` step, other contexts
   to the lookup. Reference is still shape-checked only; the Phase 3 wizard
   resolves and re-verifies the listing server-side (as before, never a
   proof of ownership).
4. *Stale confirmation on intent change.* Fixed: every intent transition
   clears the previous confirmation before asking again; e2e race test added
   (pushState to a new context while the answer is pending).
5. *Return allow-list drift.* `/account/beveiliging` added to the server
   registration allow-list; server unit test now mirrors the web list for
   the v0.5.1/v0.5.2 destinations.
6. *Hook order in `ConsumerRegisterPage`.* Hooks moved above the
   flag-off early return.

Re-verified: business-onboarding e2e 13/13; usability, account, business and
credential suites 55/55; api business-onboarding 7/0, account-foundation
26/0, business-intake 14/0; workspace typecheck clean; dev API anonymous
intent → 401, readiness `businessOnboarding: true`.

### 2026-09-27 — Phase 3: business profile capture (journey + authority)

**Approach.** The plan's wizard is realised across the existing intake pages
rather than as a new form stack (plan §2.3: "reuses `BusinessLookupPage` and
`BusinessClaimView` internals as steps"). The intro page is step 1
("Uitleg"), `/bedrijf-zoeken` is step 2 ("Bedrijf zoeken"), `/bedrijf-nieuw`
is step 3 ("Gegevens en bevoegdheid") and its receipt is step 4
("Controle"). A `context` query parameter and the allow-listed `terug`
return path travel from step to step; without them the intake behaves
exactly as in v0.5.0/v0.5.1 (no step indicator, no context field sent).

**Schema (BPROF-006/007/011, BVER-001 groundwork) — additive on
`business_claims`:** `relationship_kind` (check owner|manager|representative),
`authority_declared_at`, `authority_version`, `evidence_kvk` (check
`^[0-9]{8}$`), `evidence_domain`, `onboarding_context` (check
registration|account_home|listing|legacy), `signals` jsonb (filled in
Phase 4). All constraints named; applied to development with `drizzle-kit
push` (no drift reported). `relationship` (free text) is kept: it remains
the claimant's own wording; the structured kind sits beside it.

**API (BPROF-003/006/007/010):** `BusinessIntakeDraftInput` and
`BusinessClaimUpdateInput` accept `relationshipKind`, `evidenceKvk`,
`evidenceDomain`; the draft input additionally accepts `onboardingContext`
(client values only — `legacy` is server-side and refused; the context is
fixed at creation, so it is an unknown field on PATCH). Unknown-field
rejection lists extended. Submitting stamps `authorityDeclaredAt = now()`
and `authorityVersion = "2026-09-v052"` — submission *is* the declaration.
`BusinessClaim` (claimant/reviewer DTO) returns the new fields; the public
profile payload is untouched (evidence never leaves the private DTO).
Clients regenerated. Server-derived geography and the existing
client-coordinate rejection are unchanged (BPROF-004 was already enforced
by `rejectClientFields`).

**Web (BPROF-001/002/005/008/009):**

- `BusinessJourneySteps` indicator (4 steps, `aria-current="step"`), shown
  only when a journey context is present. Current step uses the dark
  foreground pill, not brand orange, so the contrast budget is unchanged.
- Intro page Start → `/bedrijf-zoeken?context=…&terug=<intent>`; a confirmed
  listing intent → `/bedrijf-nieuw?kind=existing_listing&…&context=listing&terug=<intent>`.
- Lookup page forwards `context` + `terug` on every claim/new-business link.
- Draft page: role select (owner / manager / representative) with the free
  relationship field now optional (the role label is sent as `relationship`
  when left empty), KvK (8 digits, client + server checked), domain (host
  only, lower-cased), declaration notice above the actions, `onboardingContext`
  sent once on creation, the journey parameters kept across the
  create→edit URL replace, and a "Back to your account" link on the receipt
  that follows the allow-listed return path.
- NL/EN copy under `businessIntakeTranslations`; parity test 12/12.

**Tests / evidence:**

- api `test:business-intake` 15/0 (new: stores the v0.5.2 fields, refuses a
  7-digit KvK and the `legacy` context, refuses context rewrite on PATCH,
  partial updates keep untouched evidence, submit stamps declaration time and
  version, public profile still 404 for a draft).
- e2e `business-intake.spec.ts` 7/7 (new: journey lookup → details →
  receipt with context/role/evidence payload and return link; no-context
  intake unchanged), `business-onboarding.spec.ts` 13/13 (Start hrefs now
  carry `context`), `usability-regression` 15/15 (budget unchanged 4/4),
  `business-review`, `consumer-registration`, `account-preferences` green.
- Workspace typecheck clean.

**Not done in this phase (recorded):** the v0.5.1 draft claim already
provides BPROF-009 persistence per claimant/profile — no new draft store was
added. Reviewer surface for the new fields and the signals column are
Phase 4.

Duration: ≈18:06 – 18:35 CEST.

### 2026-09-27 — Phase 4: verification signals and review surface

**Signals (BVER-002/003):** `lib/businessSignals.ts` — pure, versioned
(`version: 1`), computed inside the submit transaction from the claimant's
evidence and what the directory already holds: `domainMatch`
(match/mismatch/unknown; hosts normalised, `www.` and subdomains tolerated),
`kvkFormatOk` (true/false/null when absent), `duplicateScore` (token
Jaccard against the same public look-alike search that drives the
duplicate gate, excluding the claimed listing itself) with up to three
candidate names, and `computedAt`. No external service is called. When the
look-alike search is unavailable an existing-listing claim still submits
(signals are advisory); a new-business submission keeps its 503 unless the
claimant already confirmed no duplicate. Unit tests 4/4.

**Reviewer surface (BVER-001/004):** `AuthorityQueueItem` now carries
`relationshipKind`, `authorityDeclaredAt`, `authorityVersion`, `evidenceKvk`,
`evidenceDomain`, `onboardingContext` (pre-journey rows read as `legacy`)
and `signals` (nullable). Deviation from the plan, recorded: no separate
`GET /business-claims/:id/signals` — the reviewer already loads the queue
item and the signals belong to the same reviewer-only DTO, so a second
round trip would add surface without adding a boundary. The claimant DTO
does not carry signals (asserted in the intake test). `BusinessReviewPanel`
shows role + wording, declaration date/version, origin, KvK/domain, and a
"Signalen (advies, geen besluit)" block; legacy claims say "Geen signalen".

**Approval idempotency (BVER-005):** `POST /review/claims/:id/decision` with
`approve` against an already-approved claim replays the committed result
(200, current claim) only when the audit row shows the *same reviewer*
approved the *same reviewed version*; any other reviewer or version still
gets 409. Membership stays at exactly one owner (existing unique index +
`onConflictDoNothing`). Test extended in `business-publication.test.ts`.

**Lifecycle (BVER-006):** new event `business.onboarding_received` (NL/EN)
used at submit when the claim carries an onboarding context; claims without
a context keep `claim.submitted` unchanged. Idempotency key unchanged
(`claim:<id>:v<version>:submitted`), so re-enable/retry cannot double-send.

**Evidence:** api `test:business-intake` 15/0 (signals stored, outbox event
code, claimant DTO without signals); `test:business-publication` 25 pass /
2 fail — the two failures are the pre-existing freshness tests, untouched
since Phase 0; account-lifecycle 22/22 (template registry still complete);
e2e `business-moderation` 9/9 with the new reviewer assertions;
`usability-regression` 15/15; workspace typecheck clean.

Duration: ≈18:36 – 18:43 CEST.

## Architect review after Phase 4 — findings and remediation (2026-09-27, 18:44 – 19:01 CEST)

The review (Phases 3–4, git diff + spec) returned FAIL with two severe and
four moderate findings. All six are fixed in this entry; nothing was
deferred.

1. **Severe — BPROF-003/004 not enforced for a new business.** The capture
   accepted any free-text category, no address, no phone/website, and took
   the neighbourhood from the client. Fix: `lib/businessFacts.ts`. Category
   must be one of the directory's `BusinessCategory` values; for *Food &
   Drink* the food type is the subcategory. Drafts stay partial (BPROF-009)
   but `POST /business-claims/:id/submit` now requires an address with a
   Dutch postcode, a subcategory where the category has them, and a phone
   number or website — returned as `fieldErrors` the form maps onto fields.
   Geography is derived server-side at submit: stored listings at the same
   postcode (and house number when present) give coordinates → official
   polygon → neighbourhood (`address_match`); otherwise a declared official
   neighbourhood is kept but marked `declared_official`; otherwise the
   submit is refused (`unknown_neighborhood`). No external geocoder (no
   network in this environment); the basis is stored on the profile
   (`geography_basis`) and shown to the reviewer. New DB columns:
   `business_profiles.subcategory`, `business_profiles.geography_basis`.
2. **Severe — BPROF-001 lookup matched name only.** `lookup` and the
   duplicate re-check now also match postcode, address fragment and
   website host (URL queries are reduced to the host; bare postcodes are
   normalised to `1234 AB`). Applies to stored listings and published
   profiles alike.
3. **Moderate — self-asserted domain signal.** Signals gained
   `emailDomainMatch` (contact e-mail domain vs website; public mailbox
   providers read as *unknown*), `websiteSelfReported` (true for a new
   business, so a match corroborates nothing — the panel says so) and
   `geographyBasis`. Signals version stays 1 (never shipped).
4. **Moderate — role pre-selected.** The form no longer defaults to
   *owner*: the role is an explicit choice (empty option, validation
   message), and hydration keeps legacy relationship wording unless it
   merely echoed a role label.
5. **Moderate — "claim this listing instead" lost the journey.** The link
   now carries `context`, `terug` and the e2e auth opt-in.
6. **Moderate — legacy moderation endpoint without replay.**
   `PATCH /business-claims/moderation/:id` applies the same same-reviewer,
   same-version approval replay as the review router.

**Form (BPROF-005):** every field carries an *openbaar* / *niet openbaar*
marker; category, food type and neighbourhood are selects from the
directory's taxonomy and the official Hague neighbourhoods; address help
names the postcode; phone added.

**Evidence:** api `test:business-intake` 15/0 (submit-time field errors,
address-derived neighbourhood overruling the declared one, declared-official
fallback, new signal fields); `businessFacts` unit 3/3; `businessSignals`
unit 5/5; `test:business-publication` 25 pass / 2 pre-existing freshness
failures; account-lifecycle 22/22; e2e `business-intake` 7/7,
`business-onboarding` 13/13, `business-moderation` 9/9,
`usability-regression` 15/15; i18n parity 15/15; workspace typecheck clean;
API server restarted cleanly.

### 2026-09-27 — Phase 5: business membership (BMEM-001 … BMEM-006)

**Window:** 19:02 – 19:36 CEST.

**Schema (push-only, dev DB):** `business_invitations` (email, role,
status open/accepted/revoked/expired, `expires_at`, invited_by, accepted_by,
version), `business_invitation_tokens` (digest-only; token minted at
dispatch), `business_member_events` (audit trail: invited, accepted,
revoked, role_changed, transferred, removed, left, closed), and
`business_profiles.closed_at`. Named FKs/indexes per the drizzle-kit push
limits already on record. Actor columns hold the Clerk user id as text —
a deliberate deviation from the plan's uuid because the account tables key
on that id; recorded here so the choice is not "corrected" later.

**API (`routes/business-membership.ts`, `lib/businessMembership.ts`):**
`GET /businesses/:id/members` (members + open invitations for owners
only), `POST …/invitations` (owner; one open invitation per address;
7-day expiry per the provisional policy; queues
`business.member_invited` through the lifecycle outbox — the only
lifecycle mail besides `registration.link` that carries a link),
`DELETE …/invitations/:invitationId`, `POST /business-invitations/accept`
(signed-in + verified e-mail; `email_mismatch` → 403, other refusals → 409
`{accepted:false, reason}`; token digest compared, single-use),
`PATCH/DELETE …/members/:memberId` (role change, remove, leave — the
last-owner guard refuses with `last_owner`), `POST …/ownership/transfer`
(atomic swap owner→manager), `POST …/close` (owner only, explicit
`confirm:true`, unpublishes, stamps `closed_at`, revokes open invitations,
queues `business.closed` to every member). Account deletion keeps the
existing sole-owner blocker. `GET /account/me` now returns `businesses[]`
(id, name, slug, role, status).

**Web:** account home lists businesses with role and status and links to
the team page; `/account/bedrijf/:id/team` (invite, revoke, role change,
transfer, remove, leave — buttons hidden by role, every server refusal
shown verbatim), `/account/bedrijf/:id/sluiten` (one explicit tick before
the close request), `/account/uitnodiging?token=` (token stays in the URL
and is only sent on the accept click; signed-out visitors get sign-in /
register links that return here). Return-path allowlist extended with the
three routes. NL/EN copy in parity.

**Deviations / notes:** invitation e-mail added to the lifecycle "carries a
link" exception list in the lifecycle test; account page tolerates a
missing `businesses` array from older mocks instead of crashing. The
usability gate records the brand-orange contrast debt for the three new
screens (6/2/3 nodes) under the standing budget rule — no other colour
pair fails.

**Evidence:** api `test:business-membership` 10/10, `test:business-intake`
15/15, account-lifecycle 22/22; e2e `business-membership` 4/4,
`usability-regression` 21/21, `business-onboarding` + `account-preferences`
+ `account-privacy` + `business-moderation` green; returnPath unit 7/7;
i18n parity 12/12; workspace typecheck clean; API server restarted cleanly.

### 2026-09-27 — Phase 6: hardening and release evidence

**Window:** 19:37 – 20:15 CEST.

**Rate limits (BSEC):** already present from Phase 5 and re-checked: sliding
window on invitations per account per hour and on accept attempts per
network per ten minutes; no permanent blocks, no addresses in the limiter
keys. **Log scan:** every membership log line goes through `safeErrorSummary`
or carries only event codes, outbox ids and locales; no address, token or
link is logged (grep over `business-membership.ts`, `businessMembership.ts`,
`lifecycleEmailProvider.ts`).

**Rollback rehearsal (BOPS-T03, automated):** with one invitation already sent
and a second one still queued, the flag goes off → every membership route
answers 404 `FEATURE_DISABLED`; the outbox keeps draining (the queued mail
goes out exactly once, the sent one is not re-sent); invitation and token rows
are preserved; flag on again → nothing is sent twice and the original link
still accepts.

**Architect review (Phases 5–6) — three rounds, final verdict PASS.** First
round FAIL with three severe and four moderate findings; all fixed:

1. *Closure was reversible.* A reviewer could republish a closed business and
   the legacy owner PATCH still edited it. Fix: `closed_at` is terminal —
   member/owner revision routes return 404, the reviewer publication
   transition refuses with `invalid_transition`, the legacy owner edit route
   treats the business as not owned. Second round added: closing now *is* the
   existing publication action for every non-archived status (drafts end
   `unpublished` too) and writes the same `business_reviews` row
   (`unpublish` / reason `closed`, taken by the owner) inside the closing
   transaction.
2. *Registering from an invitation lost the invitation.* The server
   return-ref allow-list refused `/account/uitnodiging`, and simply allowing
   the token-bearing URL would have persisted the raw token on the
   registration row. Fix: both allow-lists (API + web) admit the page and
   **strip the `token` parameter**; the browser parks the token
   (`lib/invitationHandoff.ts`, `localStorage` because e-mail registration
   finishes in a new tab; 7-day cap; cleared on accept or a terminal
   refusal) and the invitation page re-attaches it when opened without a URL
   token. The token therefore never travels through sign-in redirects,
   registration rows or referrers.
3. *Retries minted a new token each time.* Fix: the token is derived
   (HMAC-SHA256 under `SESSION_SECRET`) from the invitation and outbox row,
   so a transient-failure retry of the same row reproduces the identical link
   with a single stored digest; a re-invite (new outbox row) derives a new
   token and supersedes the old. Missing secret → mail stays queued
   (`invitation_token_secret_not_configured`, logged once).
4. Moderate: close cancels queued invitation mails and supersedes unused
   tokens (as explicit revoke already did); removed/transferred audit rows
   carry reason codes; the membership gate now runs before body validation
   on the four `:id` write routes (outsiders get 404, never 400).

**Full regression (after the fixes):** api `business-membership` 13/13 (new:
BOPS-T02 same-link retry + supersede, BOPS-T03 rollback with a queued
message, closure of a draft + review row + republish/edit refusals, return-ref
token stripping), `business-intake` 15/15, `business-onboarding` 7/7,
`account-foundation` 26/26, `account-lifecycle` 22/22, `consumer-registration`
27/27, `events-quota` 28/28, `business-publication` 25 pass / 2 fail (the two
pre-existing fact-check freshness tests, unchanged since Phase 0). e2e:
map-regression 11/11; usability-regression 21/21 (budgets unchanged);
account-regression (live Clerk) 25/25 on the second run — the first run had a
single failure in `account-preferences` that did not reproduce and is noted
as flaky-once, not hidden; business-membership 5/5 (new full journey:
invitation → e-mail registration → password step → back → accept);
business-onboarding 13/13, business-intake 7/7, business-review,
business-moderation, consumer-registration, credential-lifecycle,
clerk-verification-recovery, account-support, account-privacy,
signup-stale-step, saved-events-sync all green. Web unit (returnPath, i18n)
green; workspace typecheck clean; API server restarted cleanly.

**Pre-existing, not touched (recorded):** `v042-release.spec.ts` and
`v043-release.spec.ts` fail identically on the branch base `cd44cc9` (main)
— strict-mode locator collisions in the map/list surfaces. Under the standing
"no map/list/card/filter change" constraint they are left as they are and
listed as debt, not as v0.5.2 evidence.

**Convergence record — flag state per environment (2026-09-27):**

| Flag | Development | Production |
| --- | --- | --- |
| `BUSINESS_ONBOARDING_ENABLED` / `VITE_BUSINESS_ONBOARDING_ENABLED` | on (preview only) | **off** — stays off per §14 until §13 item 11 approvals and §15 policy values are recorded by the user |
| `CONSUMER_REGISTRATION_ENABLED` (v0.5.1) | on | off |
| `ACCOUNTS_ENABLED`, `BUSINESS_INTAKE_ENABLED`, `BUSINESS_PUBLICATION_ENABLED` | on | off |
| `LIFECYCLE_DELIVERY_PROVIDER`, `CONSUMER_REGISTRATION_LINK_BASE_URL` | unset (tests inject a transport) | unset |
| `SESSION_SECRET` (now also derives invitation tokens) | set | must be set before the flag goes on |

`businessOnboarding` is an effective flag (`own switch && accounts &&
businessIntake`), so it fails closed whenever either dependency is off. A
development flag is never gate evidence (same rule as the 002 convergence
record). Provisional policy values remain provisional: KvK optional,
invitations 7 days, no automatic approval, auto sign-in after password
creation.

**§13 status:** 1–10 have automated or live-Clerk evidence in this log
(items 2 and 8 additionally via the rollback rehearsal and log scan); item 11
(stakeholder approval) is owed by the user. Manual owed checks, unchanged
from 002: keyboard-only completion with a screen reader, real identities in a
deployed environment.

**Debt carried forward:** `account.password_changed` template (no Clerk
`user.updated` webhook); brand-orange AA recolour (budgeted per screen);
WeatherCard throws when `/api/weather` lacks `current`; the two publication
freshness tests; v042/v043 locator collisions.
