# Release v0.5.2 — Implementation Plan

## 1. Purpose and traceability

This plan implements [`release_v052.md`](./release_v052.md) (business
onboarding enrichment and credential lifecycle) on top of the consumer
programme defined in [`requirements.md`](./requirements.md) and the delivered
foundation in [`release_v051_log.md`](./release_v051_log.md).

Every requirement in `release_v052.md` §8 and every consumer requirement
claimed in §8.8 has, below, an implementation approach, at least one test
reference and an acceptance condition. Work is executed on branch
`feature/v052-business-onboarding`, logged in `release_v052_log.md` and
`v052-prompt-log.md` with the same conventions as v0.5.1.

Standing constraints (inherited, non-negotiable):

- No change to map, list, icon, card, filter, discovery route, discovery API,
  cache key or provider behaviour. Map, usability and account regression
  workflows must pass without changed expectations after every phase.
- `/api/registration` and `user_registrations` (research registration) are
  not touched.
- Existing tables are extended additively; nothing is dropped or repurposed.
- Foreground work only; prompts, responses and durations are logged.

## 2. Architecture

### 2.1 Identity boundary (unchanged)

Clerk owns passwords, email verification, sessions, reset and revocation.
The application:

- frames Clerk components (`AuthPageFrame`, `clerkLocalization.ts`) and adds
  routes for forgot/reset/change password that mount Clerk's flows;
- reads session claims through `clerkMiddleware` + `requireAppUser`;
- enqueues its own notifications (`account.password_changed`) when Clerk
  reports the change (session claim / webhook already configured in
  `clerkProxyMiddleware`, to be confirmed in Phase 0);
- never receives a password.

### 2.2 Services (additive)

| Service | Location | Responsibility |
|---|---|---|
| Onboarding intent | `api-server/src/lib/businessOnboardingIntent.ts` | Allow-listed return-ref encode/validate for the business intent (reuses the v0.5.1 `returnRef` allow-list). |
| Business membership | `api-server/src/lib/businessMembership.ts` | Members, roles, invitations (token digest, expiry, single-use), transfer, leave, close; all writes transactional; audit rows. |
| Verification signals | `api-server/src/lib/businessSignals.ts` | Pure functions: domain match, KvK format, duplicate score against `business_profiles`. Stored on the claim at submit. |
| Claim enrichment | existing `businessIntake` service | Add relationship/authority/evidence fields and `onboarding_context`. |
| Deletion guard | existing `account-lifecycle` service | Block deletion for sole owners of published/under-review businesses. |
| Lifecycle templates | `lifecycleTemplates.ts` | New NL/EN templates (release_v052 §9.4). |

### 2.3 Frontend routes

```text
/account/register                     + business intent choice (ConsumerRegisterPage)
/account/register/complete            → after consume: Clerk password step → intent return
/sign-in, /sign-up                    existing; "Forgot password?" surfaced
/account/wachtwoord-vergeten          ForgotPasswordPage (Clerk flow in AuthPageFrame)
/account/wachtwoord-herstellen        ResetPasswordPage (states)
/account/beveiliging                  AccountSecurityPage (change password, sign out everywhere)
/account                              AccountPage + BusinessSection (memberships)
/account/bedrijf/toevoegen            BusinessOnboardingWizard (find → create/claim → authority → review)
/mijn-bedrijf                         MyBusinessWorkspace + Members tab
/mijn-bedrijf/:id/leden               BusinessMembersPage
/mijn-bedrijf/:id/sluiten             BusinessClosePage
```

The wizard reuses `BusinessLookupPage` and `BusinessClaimView` internals as
steps rather than duplicating forms.

### 2.4 Data model

Migrations (drizzle, named FKs/indexes, additive only):

```text
business_claims
  + relationship            text  check in (owner, manager, representative)
  + authority_declared_at   timestamptz
  + authority_version       text
  + evidence_kvk            text        -- format-checked, reviewer/claimant only
  + evidence_domain         text
  + evidence_reference      text
  + onboarding_context      text  check in (registration, account_home, listing, legacy)
  + signals                 jsonb       -- {domainMatch, kvkFormatOk, duplicateScore, computedAt}

business_members
  + role check (owner|manager)   -- existing column, add constraint
  + invited_by_app_user_id  uuid null
  + joined_at               timestamptz default now()

business_invitations (new)
  id, business_profile_id FK, normalized_email, role, token_digest unique,
  invited_by_app_user_id FK, expires_at, accepted_at, revoked_at,
  accepted_by_app_user_id FK null, created_at
  partial unique (business_profile_id, normalized_email) where accepted_at is null and revoked_at is null

business_member_events (new, append-only)
  id, business_profile_id FK, actor_app_user_id FK, target_app_user_id FK null,
  action check in (invited, accepted, revoked, removed, left, role_changed, transferred, closed),
  reason_code text null, created_at
```

Known hazards (from memory of earlier releases): drizzle-kit push misses
partial-index WHERE changes and re-applies over-long FK names → name every
index and FK; reconcile schema drift interactively, never guess.

### 2.5 API boundary

OpenAPI (`lib/api-spec/openapi.yaml`) additions, then `pnpm --filter
@workspace/api-spec codegen` and regenerate the React client before judging
typecheck. Counts use `number`; email validation uses a regex pattern (Zod 3
client). Boolean flags are parsed from the raw query, not Orval coercion.

```text
POST   /business-onboarding/intent
GET    /business-claims/:id/signals            (reviewer)
GET    /businesses/:id/members
POST   /businesses/:id/invitations
POST   /business-invitations/accept
DELETE /businesses/:id/members/:memberId
PATCH  /businesses/:id/members/:memberId
POST   /businesses/:id/ownership/transfer
POST   /businesses/:id/close
GET    /account/me                              + businesses[] {id, name, role, status}
PATCH  /business-claims/:id                     + relationship, authority, evidence
```

All gated by `requireFlag('businessOnboarding')` (and the existing
`businessIntake` where the route already exists) + `requireAppUser({verified:
true})` + a `requireBusinessRole(role)` middleware.

## 3. Delivery sequence

Each phase ends with: typecheck clean, the named suites green, an entry in
`release_v052_log.md`, commit and push. Architect review after Phases 2, 4
and 6.

### Phase 0 — Confirm dependencies (½ day)

1. Confirm Clerk development instance supports: password sign-up after the
   v0.5.1 link handoff (ticket/sign-in token or standard sign-up with the
   verified email prefilled), forgot-password flow, `sessions.revoke`,
   password-changed signal. Record the mechanism in the log.
2. Decide provisional values for the §15 policy decisions (mark as
   provisional; production enablement requires confirmation).
3. Read the current `business-intake`, `business-publication`,
   `account-lifecycle` suites to establish baselines (they must stay green).

**Exit:** mechanism for password creation after link verification documented;
baseline suite counts recorded.

### Phase 1 — Credential lifecycle (1–1½ days)

1. `/account/register/complete` → after `POST /consumer-registration/verify`
   returns `valid`, hand off to Clerk password creation with the verified
   email; return to the intent target once.
2. `ForgotPasswordPage`, `ResetPasswordPage`, `AccountSecurityPage` with
   Clerk flows inside `AccountShell`/`AuthPageFrame`; NL/EN keys; sign-in
   shows "Forgot password?".
3. Outbox template `account.password_changed`; enqueue on the provider's
   change signal.
4. Tests: extend `clerk-live-signup.spec.ts` (password create → sign in →
   forgot → reset), `clerk-verification-recovery.spec.ts` (states),
   `account-preferences.spec.ts` (security page, recent-auth gate),
   i18n parity; log-scan assertion for password/token absence.

**Exit:** REG-021–REG-030, AUTH-001–014, REC-001–013 evidence; account suite
green.

### Phase 2 — Intent and entry points (½ day)

1. Business intent choice on `/account/register`, sign-up frame, account
   home and listing detail ("Is this your business?" → existing claim route
   with intent).
2. `POST /business-onboarding/intent` + allow-listed return ref; resume after
   verification / sign-in / reload.
3. Flag `businessOnboarding` (server + web + readiness).
4. Tests: `business-onboarding.spec.ts` (new) entry paths; API test for
   intent validation and flag gate.

**Exit:** BENT-001–005, BOPS-001 evidence.

### Phase 3 — Business profile capture (1–1½ days)

1. Wizard `/account/bedrijf/toevoegen`: lookup step (reuse
   `/businesses/lookup`), claim-or-create step (reuse `POST /businesses`),
   authority step (relationship, declaration, evidence), review step.
2. Claim schema extension; server derives neighbourhood/coordinates;
   unknown-field rejection; draft persistence via existing claim draft.
3. Tests: API `business-intake.test.ts` extended (new fields, coordinate
   override ignored, draft isolation, unknown fields); e2e wizard happy path,
   duplicate found → claim, validation errors + focus.

**Exit:** BPROF-001–011 evidence; intake suite green.

### Phase 4 — Verification signals and review surface (1 day)

1. `businessSignals.ts` computed at submit; stored on the claim; exposed via
   `GET /business-claims/:id/signals` to reviewers.
2. `BusinessReviewPanel` shows relationship, authority, evidence and signals;
   decisions unchanged (existing versioned decision API).
3. Approval path: assert single owner membership, idempotent retry.
4. Lifecycle template `business.onboarding_received`; existing `claim.*`
   templates gain onboarding wording.
5. Tests: unit tests for signals; API review tests (no-self-review, stale
   version, idempotent approval); e2e `business-review.spec.ts` extended.

**Exit:** BVER-001–008 evidence; review/moderation suites green.

### Phase 5 — Membership and business lifecycle (1½ days)

1. `businessMembership.ts` + tables + routes; `requireBusinessRole`.
2. Invitations: token mint (digest stored), outbox `business.member_invited`,
   accept route with email match, expiry/used/superseded states, revoke.
3. Role change, transfer, leave, remove, close (close calls existing
   unpublish action); audit events; templates.
4. Deletion guard in `account-lifecycle` for sole owners.
5. Account home Business section; Members page; Close page.
6. Tests: isolated-DB `business-membership.test.ts` (all guards, cross-business
   403, token lifecycle, outbox retry pattern), e2e members flow, deletion
   guard e2e in `account-privacy.spec.ts`.

**Exit:** BMEM-001–007, BSEC-001–005, BPRIV-001–003 evidence.

### Phase 6 — Hardening and release evidence (1 day)

1. axe + rule checks for every new screen added to
   `usability-regression.spec.ts` (desktop + phone); reflow/zoom check.
2. Log scan (`safeErrorSummary`), rate limits, rollback rehearsal (flag off,
   rows preserved, no duplicate sends on re-enable).
3. Full regression: map, usability, account, intake, review, moderation,
   API integration suites; typecheck.
4. Architect review; fix severe issues; final log entries; convergence
   record with the flag state per environment.

**Exit:** release_v052 §13 evidence complete; flag remains off in production.

Total estimate: 6–7 working days of foreground implementation.

## 4. Test catalogue

IDs are referenced in §5. Locations: API integration suites run against a
fresh disposable DB per suite (`lib/db/scripts/run-*.mjs`); e2e suites run in
the existing Playwright workflows with `PW_PORT` isolation.

### 4.1 Entry and credentials

| ID | Test | Location |
|---|---|---|
| BENT-T01 | Intent chosen on register → verify → password → business step; reload resumes | `e2e/business-onboarding.spec.ts` |
| BENT-T02 | Intent from Clerk sign-up and from account home | `e2e/business-onboarding.spec.ts` |
| BENT-T03 | Tampered/external intent ref dropped | `api: business-onboarding.test.ts` |
| BENT-T04 | Flag off → entry hidden, API 404, discovery + consumer registration unaffected | `e2e/business-onboarding.spec.ts`, api |
| BCRED-T01 | Password creation rules, mismatch, breached, success + single sign-in | `e2e/clerk-live-signup.spec.ts` |
| BCRED-T02 | Sign-in generic errors, allowlisted return, external dropped | `e2e/account-preferences.spec.ts` |
| BCRED-T03 | Forgot/reset neutral response and states | `e2e/clerk-verification-recovery.spec.ts` |
| BCRED-T04 | Change password requires recent auth; notification queued | `e2e/account-preferences.spec.ts`, api outbox test |
| BCRED-T05 | Log/DB/outbox scan: no password, no reset token | api test helper `assertNoSecretsInLogs` |
| BCRED-T06 | NL/EN parity of Clerk screens in app frame | `e2e/signup-stale-step.spec.ts`, i18n parity |

### 4.2 Business profile capture

| ID | Test | Location |
|---|---|---|
| BPROF-T01 | Lookup match → claim, no new profile row | api `business-intake.test.ts` |
| BPROF-T02 | Create: required fields, server-derived geo, client coords ignored | api |
| BPROF-T03 | Optional blank ok; unknown field → `UNKNOWN_FIELD` | api |
| BPROF-T04 | KvK format validation | unit `businessSignals.test.ts`, api |
| BPROF-T05 | Draft persists, isolated per account | api, e2e |
| BPROF-T06 | Authority declaration recorded with version/time | api |
| BPROF-T07 | Wizard keyboard/focus/validation | e2e, usability |

### 4.3 Verification and review

| ID | Test | Location |
|---|---|---|
| BVER-T01 | Queue shows context + signals | e2e `business-review.spec.ts` |
| BVER-T02 | No self-review | api `business-intake.test.ts` (existing, extended) |
| BVER-T03 | Approve → one owner; idempotent retry | api |
| BVER-T04 | Stale version decision rejected | api (existing) |
| BVER-T05 | Reject/dispute leaves listing/owners untouched; locale email | api |
| BVER-T06 | New business unpublished until publication review | api `business-publication.test.ts` |

### 4.4 Membership and lifecycle

| ID | Test | Location |
|---|---|---|
| BMEM-T01 | Invite → register → accept; wrong email rejected; replay `used`; expired | api `business-membership.test.ts`, e2e |
| BMEM-T02 | Manager forbidden from owner actions | api |
| BMEM-T03 | Last owner guard; transfer then leave | api |
| BMEM-T04 | Close → unpublished; audit rows | api |
| BMEM-T05 | Sole owner deletion blocked; allowed after transfer | api `account-lifecycle.test.ts`, e2e `account-privacy.spec.ts` |
| BMEM-T06 | Cross-business 403 on every route | api |
| BMEM-T07 | Preferences/discovery defaults unchanged by membership | api + e2e `account-regression` |

### 4.5 Delivery, security, privacy, a11y, ops

| ID | Test | Location |
|---|---|---|
| BOPS-T01 | Templates NL/EN, no prohibited data | api template tests |
| BOPS-T02 | Outbox retry keeps same-row token, stale row fails | api |
| BSEC-T01 | Rate limits; no permanent IP block | api |
| BSEC-T02 | Log scan no PII/tokens | api helper |
| BOPS-T03 | Rollback rehearsal | manual, logged |
| BA11Y-T01 | axe + rule checks new screens desktop/phone | `e2e/usability-regression.spec.ts` |
| BA11Y-T02 | 320px reflow / 400% zoom business step | e2e |
| BL10N-T01 | i18n parity incl. new keys | `src/lib/i18n.test.ts` |
| NONREG-T01 | map, usability, account, intake, review, moderation suites unchanged | workflows |

## 5. Requirement implementation matrix

### 5.1 Business outcomes

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BBUS-001 | `business_members.app_user_id` FK not null; no business-only auth path | BMEM-T06 | No route accepts business credentials |
| BBUS-002 | Intent is a return ref; personal flow unchanged | BENT-T01, BCRED-T01 | Business path cannot skip a personal step |
| BBUS-003 | Lookup step mandatory before create; duplicate score | BPROF-T01, BVER-T01 | Match → claim, not create |
| BBUS-004 | `requireBusinessRole` on every write; membership only via approval/accept | BMEM-T02, BMEM-T06 | Unauthorised edits 403 |
| BBUS-005 | Separate tables, separate `/account/me` sections, separate export sections | BMEM-T07, BPRIV | Records distinct |
| BBUS-006 | All keys in `accountTranslations`, parity test | BL10N-T01 | Parity test green |
| BBUS-007 | No discovery file touched; suites unchanged | NONREG-T01 | Suites green, no expectation change |
| BBUS-008 | Clerk forgot/reset in app frame | BCRED-T03 | Recovery without support |

### 5.2 Entry and intent

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BENT-001 | Choice UI in register page, sign-up frame, account home, listing action | BENT-T01, T02 | Visible at all four |
| BENT-002 | `businessOnboardingIntent.ts` allow-list | BENT-T03 | Tampered ref dropped |
| BENT-003 | Ref stored in sessionStorage + server intent record; idempotent resume | BENT-T01 | Reload resumes, no duplicate write |
| BENT-004 | "Add my business" on account home | BENT-T02 | Signed-in consumer reaches wizard |
| BENT-005 | Explanation panel before step 1 | BENT-T01, BA11Y-T01 | Copy present NL/EN |

### 5.3 Credential lifecycle

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BCRED-001 | Clerk password step after consume | BCRED-T01 | Password only at provider |
| BCRED-002 | Existing sign-in + return allow-list | BCRED-T02 | Generic errors, safe return |
| BCRED-003 | Forgot/Reset pages with Clerk flow | BCRED-T03 | All states present |
| BCRED-004 | Security page, recent-auth gate, outbox notification | BCRED-T04 | Notification queued once |
| BCRED-005 | Clerk session revocation; "sign out everywhere" | BCRED-T04 | Other sessions invalid |
| BCRED-006 | No password field in any API schema; log scan | BCRED-T05 | Scan clean |
| BCRED-007 | `clerkLocalization` overrides + toggle | BCRED-T06 | No English fallback in NL |
| BCRED-008 | Draft saved server-side; expiry banner + re-auth return | BPROF-T05 | Draft intact after re-auth |

### 5.4 Business profile capture

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BPROF-001 | Lookup step reuses `/businesses/lookup` | BPROF-T01 | Match presented first |
| BPROF-002 | Match cards with public detail + claim action | BPROF-T01 | Claim created, no profile row |
| BPROF-003 | Zod schema on `POST /businesses`; taxonomy ids only | BPROF-T02 | Invalid taxonomy rejected |
| BPROF-004 | Geocode + neighbourhood derivation server-side | BPROF-T02 | Client coords ignored |
| BPROF-005 | Field meta (optional/public) in form config | BPROF-T07 | Visible per field |
| BPROF-006 | New claim columns; version constant | BPROF-T06 | Stored with version/time |
| BPROF-007 | Evidence fields; KvK regex `^\d{8}$` | BPROF-T04 | Format enforced |
| BPROF-008 | Shared validation module client/server; focus mgmt | BPROF-T07 | Parity, focus |
| BPROF-009 | Existing draft claim per claimant/profile | BPROF-T05 | Isolated, persistent |
| BPROF-010 | `.strict()` schemas | BPROF-T03 | `UNKNOWN_FIELD` |
| BPROF-011 | Extend existing tables only | migration review | No new business table |

### 5.5 Verification and review

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BVER-001 | Submit → existing queue + `onboarding_context` | BVER-T01 | Appears in queue |
| BVER-002 | `businessSignals.ts` at submit | BVER-T01, BPROF-T04 | Signals stored, advisory |
| BVER-003 | Existing interested-party exclusion | BVER-T02 | 403 for self-review |
| BVER-004 | Existing decision API + templates | BVER-T05 | Email in locale |
| BVER-005 | Approval transaction + unique (profile, user) | BVER-T03 | One owner, idempotent |
| BVER-006 | Reject path touches claim only | BVER-T05 | Listing untouched |
| BVER-007 | Reviewer DTO excludes personal prefs | BVER-T01 | DTO reviewed |
| BVER-008 | Existing publication gate | BVER-T06 | Unpublished until approved |

### 5.6 Membership and lifecycle

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BMEM-001 | Role constraint; `requireBusinessRole('owner')` | BMEM-T02 | Manager 403 |
| BMEM-002 | `business_invitations` token digest, expiry, email match | BMEM-T01 | States correct |
| BMEM-003 | Last-owner guard in transaction | BMEM-T03 | Guard holds under retry |
| BMEM-004 | `business_member_events` rows | BMEM-T04 | Audit rows present |
| BMEM-005 | Deletion guard in lifecycle service | BMEM-T05 | Blocked with reason, unblocked after transfer |
| BMEM-006 | Close → existing unpublish action | BMEM-T04 | Unpublished, records kept |
| BMEM-007 | No write path touches `consumer_preferences` | BMEM-T07 | Preferences identical |

### 5.7 Security, privacy, a11y, ops

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BSEC-001 | Middleware chain on every new route | BMEM-T06 | Unauthenticated 401, unverified 403 |
| BSEC-002 | Membership check by business id in every handler | BMEM-T06 | Cross-business 403 |
| BSEC-003 | Digest-only tokens, single-use | BMEM-T01 | Replay `used` |
| BSEC-004 | Layered limiter reuse | BSEC-T01 | 429 without permanent block |
| BSEC-005 | Event codes + `safeErrorSummary` | BSEC-T02 | Scan clean |
| BPRIV-001 | Public snapshot excludes private fields | BVER-T06 | Snapshot reviewed |
| BPRIV-002 | Evidence in reviewer/claimant DTOs only | BVER-T07, BMEM-T06 | Not in member DTO |
| BPRIV-003 | Export section limited to own memberships/claims | export test | No other members' data |
| BA11Y-001 | axe + rule checks; focus mgmt | BA11Y-T01, T02 | No serious/critical |
| BL10N-001 | Parity test | BL10N-T01 | Green |
| BOPS-001 | `requireFlag('businessOnboarding')`; entry points hidden | BENT-T04 | 404 when off |
| BOPS-002 | Outbox templates | BOPS-T01, T02 | Idempotent retries |
| BOPS-003 | Rollback rehearsal | BOPS-T03 | Rows preserved |

### 5.8 Consumer requirements claimed (release_v052 §8.8)

| Range | Delivered by | Tests |
|---|---|---|
| REG-017–REG-030 | Phase 1 (password step after consume, activation via Clerk + `app_users`, return, post-activation choices) | BCRED-T01, BENT-T01 |
| AUTH-001–AUTH-014 | Phase 1 (sign-in framing, return allow-list, expiry handling, sign-out everywhere, notifications) | BCRED-T02, T04 |
| REC-001–REC-013 | Phase 1 (forgot/reset, revocation, notification, audit) | BCRED-T03, T05 |
| PROF-001–003, 007, 008 | Existing account pages + security page | BCRED-T04 |
| PRIV-001–003, 005–010 | Existing consent events + legal presentation at password step | account suites |
| SEC-002, 003, 010, 011 | Clerk + recent-auth gates | BCRED-T04 |
| A11Y-007 | Password-manager semantics on Clerk screens | BA11Y-T01 |

## 6. Acceptance evidence package

`release_v052_log.md` must contain, per phase: what changed, why, suite
results with counts, live walk-through notes, and architect-review findings
with their resolution. `v052-prompt-log.md` records each prompt, response
summary and duration. The final entry records flag state per environment and
the provisional policy values used, so production enablement is a separate,
traceable decision.

## 7. Definition of implementation complete

- Every row in §5 has evidence in the log.
- Typecheck clean across the workspace; all API integration, unit and e2e
  suites green; map/usability/account regressions unchanged.
- Migrations applied to development by named migration; rollback rehearsed.
- Architect review issues resolved.
- `businessOnboarding` off in production; §15 policy decisions recorded as
  provisional or approved.
