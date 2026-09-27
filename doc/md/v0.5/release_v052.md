# Release v0.5.2 — Business Onboarding Enrichment

## 1. Release purpose

Release v0.5.2 extends the consumer onboarding programme so that a person who
represents a business can, in addition to their personal profile, create and
maintain a **business profile** from the same account:

> A registered person can declare that they act for a business, add that
> business's profile (new or existing listing), verify their authority to
> represent it, and manage the profile, its members and its credentials
> through the same secure account lifecycle used for consumers.

The release also closes the supporting account capabilities that v0.5.1
deferred and that a business user cannot do without: password creation,
sign-in, password recovery/reset, and password change, all through the
approved identity provider.

Public exposure remains behind feature flags until the acceptance evidence in
§14 is approved.

## 2. Source documents

- [`requirements.md`](./requirements.md) — consumer onboarding/offboarding
  requirement catalogue (IDs `BUS-`, `REG-`, `AUTH-`, `REC-`, `PROF-`,
  `PRIV-`, `OFF-`, `SEC-`, `A11Y-`, `L10N-`, `DATA-`, `OPS-`).
- [`release_v051.md`](./release_v051.md) — secure registration foundation.
- [`release_v051_log.md`](./release_v051_log.md) — what v0.5.1 actually shipped.
- [`release_v052-implementation-plan.md`](./release_v052-implementation-plan.md)
  — the implementation plan for this release.

The requirement catalogue in `requirements.md` remains authoritative for every
consumer requirement it defines. This document **adds** business-onboarding
requirements (§8) with their own IDs; it does not restate or change consumer
requirements. If documents conflict, approved requirements and legal/privacy
decisions take precedence over this release summary.

## 3. Release classification

| Field | Value |
|---|---|
| Release | v0.5.2 |
| Unit of work | Business profile onboarding on top of the personal account, plus credential lifecycle (create / sign in / recover / change) |
| Delivery type | Vertical slice, independently testable, flag-gated |
| Public availability | Disabled behind `accounts`, `consumerRegistration`, `businessIntake` and the new `businessOnboarding` flag |
| Personal account | Required; a business profile is always attached to exactly one verified person's account |
| Discovery changes | Prohibited (see §7) |

## 4. Starting point (what already exists)

v0.5.2 builds on infrastructure that is already in the codebase and must be
reused rather than duplicated:

| Capability | Existing component | Reuse in v0.5.2 |
|---|---|---|
| Identity, password, email verification, session | Clerk (`/sign-in`, `/sign-up`, `AuthPageFrame`, `clerkLocalization.ts`) | Sole credential store; password recovery and change are Clerk flows surfaced with app framing and NL/EN parity |
| Personal account | `app_users`, `consumer_preferences`, `account_consent_events`; `/api/account/*` | The person's profile the business profile hangs off |
| Pending registration by email link | `consumer_registrations`, `consumer_registration_tokens`, `/api/consumer-registration/*`, `/account/register*` | Entry point; gains a "I represent a business" intent that survives the handoff |
| Business directory | `business_profiles`, `business_claims`, `business_members`, `business_profile_revisions`, `business_reviews`, `business_fact_checks` | Source of truth for the business profile, ownership and review |
| Business intake and claims | `/api/businesses`, `/api/business-claims/*`; pages `/bedrijf-zoeken`, `/bedrijf-claim`, `/bedrijf-nieuw`, `/mijn-bedrijf` | The claim/intake flow becomes a step inside onboarding instead of a separate destination |
| Publication review | `/api/business-profiles/:id/revision*`, `/api/review/*`; `BusinessReviewPanel`, `BusinessModerationView` | Unchanged; onboarding submits into the same queue |
| Lifecycle delivery | `lifecycle_outbox`, `lifecycleTemplates.ts` (`claim.*`, `business.*`, `registration.link`) | New templates for business onboarding and credential events |
| Feature flags | `accounts`, `businessIntake`, `businessPublication`, `consumerRegistration` | New `businessOnboarding` flag, fail-closed |

## 5. Business-user journey

### 5.1 Entry

1. From the header ("Create account"), the registration page, the account
   home, or a listing's "Is this your business?" action, the person can
   choose **"I represent a business"**.
2. Choosing it never skips personal registration: the person is registered and
   verified exactly as a consumer (v0.5.1 flow or Clerk sign-up), with the
   business intent kept as an opaque, allowlisted return reference.
3. A signed-in consumer can add a business profile later from account home
   ("Add my business").

### 5.2 Credential creation and sign-in (supporting functionality)

1. After the registration link is verified, the person creates a password
   through the identity provider (minimum length, breached-password check,
   confirmation, show/hide, password-manager support, rules announced ahead).
2. The application never receives, stores, logs or inspects the password.
3. On success the person is signed in once (policy decision recorded in §15)
   and returned to the business step if that was the intent.
4. Sign-in offers "Forgot password?", registration, privacy, Terms and a safe
   back route; errors are generic; return destinations are allowlisted.

### 5.3 Password recovery, reset and change

1. "Forgot password?" asks only for the email and answers neutrally.
2. The identity provider sends a single-use, expiring reset credential; the
   reset page applies the same password rules as registration and shows
   invalid / expired / used / superseded / offline / server-error states.
3. A successful reset invalidates the reset credential, revokes other sessions
   per policy, and sends a "password changed" notification.
4. A signed-in person can change the password from the account security page
   after recent authentication; a notification is sent.
5. Support never handles passwords; loss of the verified email follows the
   separately approved identity-verification procedure (REC-012).

### 5.4 Business profile — find or create

1. The onboarding step searches the existing directory first (name, postcode,
   address, website) so a listed business is **claimed**, not duplicated.
2. If the business is not listed, the person creates it: legal/trade name,
   address, neighbourhood (derived, not typed), category and subcategory from
   the existing taxonomy, contact email/phone/website, opening hours,
   short description (NL and/or EN).
3. Every field states its purpose and whether it becomes public.
4. The person declares their relationship to the business (owner, manager,
   authorised representative) and confirms authority to represent it.
5. Optional evidence (KvK number, domain of the business email, uploaded
   document reference) can be supplied; what is mandatory is a policy
   decision (§15).

### 5.5 Business verification

1. The claim/new-business submission enters the existing review queue as a
   claim (`business_claims`) with the onboarding context attached.
2. Automatic checks that are cheap and privacy-safe run first: business-email
   domain matches website domain, KvK format, duplicate detection against
   `business_profiles` (name + postcode + address).
3. Reviewers see the automated signals and decide approve / request changes /
   reject / dispute with the existing decision API; self-review remains
   impossible.
4. Approval creates the `business_members` owner row; the person's account
   home now shows a **Business** section next to the personal profile.
5. Every decision produces a lifecycle email (existing `claim.*` templates,
   extended with onboarding wording) and an in-app status.

### 5.6 Managing the business profile

1. `/mijn-bedrijf` becomes the business workspace reachable from account home:
   profile revision (existing `business_profile_revisions`), publication
   status, members, deals (existing), and notifications.
2. Members: the owner can invite an additional manager by email; the invitee
   must have (or create) a verified personal account and accept the invite;
   roles are `owner` and `manager`; the last owner cannot be removed.
3. The person's personal profile and preferences stay separate: a business
   role never changes the consumer discovery defaults or preferences.
4. Leaving a business, transferring ownership, and closing a business profile
   are explicit, audited actions; account deletion (existing lifecycle) is
   blocked while the person is the sole owner of a published business, with a
   clear explanation and the transfer/close routes offered.

### 5.7 Return to discovery

At the end of every branch (business submitted, saved as draft, cancelled)
the person is returned to the safe initiating context; the business listing,
once published, is visible through the unchanged discovery surfaces.

## 6. Included scope

- "I represent a business" intent on registration, sign-up and account home,
  carried as an allowlisted return reference through verification.
- Password creation, sign-in, forgot/reset password, password change, session
  revocation after reset, security notifications — all via the identity
  provider with app framing and NL/EN parity.
- Business onboarding step: find-or-create, profile fields, relationship and
  authority declaration, optional evidence.
- Automated privacy-safe verification signals and reviewer decision surface.
- Owner membership on approval; business section on account home.
- Business workspace: members (invite/accept/remove/role), ownership transfer,
  leave, close.
- Lifecycle templates: `business.onboarding_received`, `business.member_invited`,
  `business.member_accepted`, `business.ownership_transferred`,
  `account.password_changed`, `account.password_reset_requested` (provider
  mail where the provider owns the credential).
- Account-deletion guard for sole owners.
- Feature flag `businessOnboarding` / `VITE_BUSINESS_ONBOARDING_ENABLED`,
  fail-closed API gates, safe unavailable state.
- Dutch and English parity, accessibility (WCAG 2.2 AA), privacy-safe logging.
- Regression evidence for discovery non-regression.

## 7. Explicitly excluded scope

- Any change to map, list, icon, card, filter, discovery route, discovery API,
  cache key or provider behaviour (§7 of `release_v051.md` applies verbatim).
- Paid plans, invoicing, or payment collection for businesses.
- Automated KvK/Chamber-of-Commerce API verification (manual reviewer check in
  this release; API integration is a later decision).
- Document upload storage (this release records a reference/description only).
- Organisation-level SSO, multi-factor authentication, passkeys, social login.
- Business analytics dashboards.
- Data export and account deletion changes beyond the sole-owner guard.
- Editing publication-review rules or the reviewer queue ordering.

## 8. Business onboarding requirements

Keywords as in `requirements.md`: **Must** = release requirement; **Should** =
expected unless an approved exception exists. IDs are new and do not collide
with the consumer catalogue.

### 8.1 Business outcomes

| ID | Requirement | Priority |
|---|---|---|
| BBUS-001 | A business profile must always belong to at least one verified personal account; there is no business-only login. | Must |
| BBUS-002 | Adding a business must never weaken, replace or bypass personal registration, email verification, legal acknowledgement or credential creation. | Must |
| BBUS-003 | An existing listing must be claimed rather than duplicated; a new business must be created only when no match is confirmed. | Must |
| BBUS-004 | Only a person whose authority has been reviewed and approved may edit or represent a business profile. | Must |
| BBUS-005 | Personal profile data and business profile data must be stored, displayed and exported as distinct records with distinct purposes. | Must |
| BBUS-006 | The business onboarding flow must be fully available in Dutch and English with semantic parity. | Must |
| BBUS-007 | Business onboarding must not alter any existing discovery behaviour (BUS-011 applies). | Must |
| BBUS-008 | A business user must be able to recover access to their account (password) without support staff handling credentials. | Must |

### 8.2 Entry and intent

| ID | Requirement | Priority |
|---|---|---|
| BENT-001 | Offer "I represent a business" on the registration page, the identity-provider sign-up frame, account home and listing detail actions. | Must |
| BENT-002 | Carry the business intent only as an opaque allowlisted return reference; never as free-form URL state or personal data. | Must |
| BENT-003 | Resume the business step after verification, sign-in or a page reload without replaying any write. | Must |
| BENT-004 | Allow a signed-in consumer to start business onboarding at any later time from account home. | Must |
| BENT-005 | Explain before data entry what a business profile is, who will see it, and that the personal account stays separate. | Must |

### 8.3 Credential lifecycle (create, sign in, recover, change)

| ID | Requirement | Priority |
|---|---|---|
| BCRED-001 | Create the password through the identity provider only, after the registration link is verified (REG-021 to REG-024 apply). | Must |
| BCRED-002 | Provide sign-in with verified email and password, generic errors, allowlisted return destinations and cancel/back routes (AUTH-001 to AUTH-008 apply). | Must |
| BCRED-003 | Provide Forgot password from sign-in with a neutral response, rate limits, single-use expiring reset credential and explicit reset states (REC-001 to REC-008 apply). | Must |
| BCRED-004 | Provide password change from the account security page after recent authentication, with a security notification (AUTH-014, REC-010). | Must |
| BCRED-005 | Revoke other sessions after password reset, and offer "sign out everywhere" after recent authentication (REC-009, AUTH-013). | Must |
| BCRED-006 | Never accept, log, persist or forward a password value through application code or logs (REG-024, SEC-012). | Must |
| BCRED-007 | Present identity-provider screens inside the app frame with the shared NL/EN toggle and no mixed-language fallback (L10N-003). | Must |
| BCRED-008 | Explain session expiry and allow re-authentication without losing the business draft or the public context (AUTH-009). | Must |

### 8.4 Business profile capture

| ID | Requirement | Priority |
|---|---|---|
| BPROF-001 | Search the existing directory (name, postcode, address, website) before allowing a new business to be created. | Must |
| BPROF-002 | Present likely duplicates with enough public detail to recognise them and a "this is my business" action that starts a claim. | Must |
| BPROF-003 | Capture for a new business: trade name, address, category and subcategory from the existing taxonomy, contact email, and at least one of phone or website. | Must |
| BPROF-004 | Derive neighbourhood and coordinates from the address server-side; never accept client-supplied coordinates as authoritative. | Must |
| BPROF-005 | Mark every non-required field optional and state, per field, whether the value becomes public. | Must |
| BPROF-006 | Capture the claimant's relationship (owner / manager / authorised representative) and an explicit authority declaration with timestamp and version. | Must |
| BPROF-007 | Accept optional evidence: KvK number (format-validated), business email domain, document reference/description. | Should |
| BPROF-008 | Validate on client and server, associate errors with fields, keep non-secret values after recoverable errors (REG-006 pattern). | Must |
| BPROF-009 | Save the business step as a draft that survives reload, sign-out and sign-in of the same account; drafts are private to the claimant. | Must |
| BPROF-010 | Reject unknown payload fields so that role, status, membership or review decisions can never be set by the client. | Must |
| BPROF-011 | Use the existing `business_profiles` / `business_claims` records; never create a parallel business table. | Must |

### 8.5 Verification and review

| ID | Requirement | Priority |
|---|---|---|
| BVER-001 | Submission enters the existing claim review queue with onboarding context attached; the same decision API and audit records are used. | Must |
| BVER-002 | Run automated privacy-safe signals before review: email-domain/website-domain match, KvK format, duplicate score. Signals inform, never decide. | Must |
| BVER-003 | Reviewers must not be able to decide claims for businesses they created, are members of, or have claimed (existing no-self-review rule). | Must |
| BVER-004 | Every decision (approve, request changes, reject, dispute) produces an in-app status and a lifecycle email in the claimant's locale. | Must |
| BVER-005 | Approval creates exactly one owner membership transactionally; retried approvals are idempotent. | Must |
| BVER-006 | A rejected or disputed claim leaves the existing listing and any other approved owner untouched. | Must |
| BVER-007 | Reviewers see evidence as supplied and the automated signals, but never the claimant's password, tokens, or unrelated personal preferences. | Must |
| BVER-008 | A business created during onboarding is not public until it passes the existing publication review (`businessPublication`). | Must |

### 8.6 Business membership and lifecycle

| ID | Requirement | Priority |
|---|---|---|
| BMEM-001 | Roles are `owner` and `manager`; only owners can invite, change roles, transfer ownership or close the business. | Must |
| BMEM-002 | Invitations are by email, single-use, expiring, digest-stored, and accepted only by a signed-in verified account whose email matches. | Must |
| BMEM-003 | The last owner cannot leave or be demoted; ownership must be transferred first. | Must |
| BMEM-004 | Leaving, removal, role change, transfer and closure are audited with actor, target, time and reason code. | Must |
| BMEM-005 | Account deletion is blocked with an explanation while the person is the sole owner of a business that is published or under review; transfer and closure routes are offered. | Must |
| BMEM-006 | Closing a business unpublishes it through the existing publication action and keeps records per retention policy. | Must |
| BMEM-007 | Business membership never changes consumer preferences, saved neighbourhoods, interests or discovery defaults. | Must |

### 8.7 Security, privacy, accessibility, operations (deltas)

| ID | Requirement | Priority |
|---|---|---|
| BSEC-001 | All new routes require Clerk-authenticated, email-verified, active app users; reviewer routes additionally require the editor role. | Must |
| BSEC-002 | Authorisation is enforced per business: a member of business A can never read or write business B's drafts, members or invitations. | Must |
| BSEC-003 | Invitation and reset links are single-use and expire; replay reports `used`; digests only are stored (SEC-008). | Must |
| BSEC-004 | Layered rate limits on invitation, claim submission and evidence updates; no permanent block by IP (SEC-004, SEC-005). | Must |
| BSEC-005 | Logs use event codes and record identifiers; never business email, KvK number, phone, address or token values (OPS-004). | Must |
| BPRIV-001 | Each business field's public/private status is shown before submission and honoured in the public snapshot. | Must |
| BPRIV-002 | Evidence (KvK, documents) is visible only to reviewers and the claimant; it is never published or exported to other members. | Must |
| BPRIV-003 | The personal data export includes the person's memberships and their own claims, not other members' data. | Must |
| BA11Y-001 | The onboarding step, member management, sign-in, reset and password-change screens meet WCAG 2.2 AA, keyboard-only operation, focus management and 320px reflow (A11Y-001 to A11Y-007). | Must |
| BL10N-001 | Every new string, error, email and reviewer label exists in NL and EN; the parity test covers them. | Must |
| BOPS-001 | Feature flag `businessOnboarding` fails closed (404 `FEATURE_DISABLED`) for all new routes and hides entry points; public discovery is unaffected. | Must |
| BOPS-002 | Lifecycle messages for business onboarding use the outbox: idempotent, retryable, observable; provider acceptance is not delivery. | Must |
| BOPS-003 | Rollback disables the flag and preserves claims, memberships, invitations, outbox and audit rows; no table or column is dropped. | Must |

### 8.8 Coverage of consumer requirements claimed by v0.5.2

In addition to the new IDs above, v0.5.2 claims delivery of these consumer
requirements from `requirements.md` (they were deferred by v0.5.1):

- `REG-017` through `REG-030` (full registration form, password, activation,
  confirmation, return, post-activation choices)
- `AUTH-001` through `AUTH-014`
- `REC-001` through `REC-013`
- `PROF-001` through `PROF-003`, `PROF-007`, `PROF-008`
- `PRIV-001`, `PRIV-002`, `PRIV-003`, `PRIV-005` through `PRIV-010`
- `SEC-002`, `SEC-003`, `SEC-010`, `SEC-011`
- `A11Y-007`

`SRCH-*`, `OFF-*` beyond the sole-owner guard, and `PRIV-011` onward remain in
the v0.5 programme for later releases.

## 9. Proposed technical components

### 9.1 Frontend (`artifacts/buurtgids`)

```text
/account/register                         + "I represent a business" choice
/account/register/complete                → password step (Clerk) → business step
/sign-in, /sign-up                        Clerk in AuthPageFrame; forgot-password
/account/wachtwoord-vergeten              forgot password (Clerk flow, app frame)
/account/wachtwoord-herstellen            reset states
/account/beveiliging                      password change, sign out everywhere
/account                                  "Business" section when member
/account/bedrijf/toevoegen                onboarding step (find-or-create, wizard)
/mijn-bedrijf                             workspace (existing) + Members tab
/mijn-bedrijf/:id/leden                   invite / roles / transfer / leave
/mijn-bedrijf/:id/sluiten                 close business
```

All copy in `accountTranslations` (NL/EN) covered by the parity test.

### 9.2 API (`artifacts/api-server`)

```text
POST   /api/business-onboarding/intent              record intent as return ref (no PII)
GET    /api/businesses/lookup                       existing (reused)
POST   /api/businesses                              existing (reused: existing listing or new + draft claim)
PATCH  /api/business-claims/:id                     existing (reused, + relationship/authority/evidence fields)
POST   /api/business-claims/:id/submit              existing (reused, + automated signals stored)
GET    /api/business-claims/:id/signals             reviewer: automated verification signals
GET    /api/businesses/:id/members                  members list (member only)
POST   /api/businesses/:id/invitations              owner: invite by email
POST   /api/business-invitations/accept             invitee: accept with token
DELETE /api/businesses/:id/members/:memberId        owner: remove; self: leave
PATCH  /api/businesses/:id/members/:memberId        owner: role change
POST   /api/businesses/:id/ownership/transfer       owner → owner
POST   /api/businesses/:id/close                    owner: close (unpublish via existing action)
GET    /api/account/me                              existing (+ businesses[] summary)
```

Password create / sign-in / reset / change are identity-provider operations;
the API only receives Clerk webhooks or session claims already supported and
enqueues notification messages through the outbox.

### 9.3 Data (`lib/db`)

```text
business_claims            + relationship, authority_declared_at, authority_version,
                             evidence_kvk (format-checked), evidence_domain,
                             evidence_reference, onboarding_context (enum), signals (json)
business_members           + role check constraint (owner|manager), invited_by, joined_at
business_invitations       NEW: id, business_profile_id, normalized_email, role,
                             token_digest, invited_by, expires_at, accepted_at,
                             revoked_at, accepted_by_app_user_id
business_member_events     NEW append-only audit: business_profile_id, actor, target,
                             action (invited|accepted|removed|left|role_changed|
                             transferred|closed), reason_code, created_at
lifecycle_outbox           reused; new template keys
```

No existing column is removed or repurposed; FKs are named explicitly (63-char
limit); partial unique indexes: one active invitation per (business, email).

### 9.4 Lifecycle delivery

New templates in `lifecycleTemplates.ts` (NL/EN):
`business.onboarding_received`, `business.member_invited`,
`business.member_accepted`, `business.member_removed`,
`business.ownership_transferred`, `business.closed_by_owner`,
`account.password_changed`. Password reset and verification emails remain
identity-provider mails; their sender/branding is configured there.

### 9.5 Feature flag

`businessOnboarding` ↔ `BUSINESS_ONBOARDING_ENABLED` (server) /
`VITE_BUSINESS_ONBOARDING_ENABLED` (web). Requires `accounts` and
`businessIntake` to be on; readiness contract reports all three.

## 10. Security controls

- Clerk remains the only credential and session authority (SEC-002).
- Every new route: `requireFlag('businessOnboarding')` + `requireAppUser`
  (verified email, active status) + per-business membership check.
- Invitation tokens: 32 bytes random, SHA-256 digest stored, 7-day expiry
  (policy), single-use, email must match the accepting account.
- Unknown-field rejection on every write schema (role/status/decision cannot
  be injected).
- Rate limits reuse the layered in-memory limiter from v0.5.1 (per account,
  per business, per network).
- No self-review; reviewer decisions versioned against the claim version.
- Logs: event codes + ids; `safeErrorSummary` for failures.
- Threat-model delta reviewed before flag enablement in production.

## 11. Privacy controls

- Field-level public/private disclosure before submission.
- Evidence restricted to claimant + reviewers; never in public snapshots,
  exports of other members, or analytics.
- Personal account data and business data kept in separate records with
  separate purposes; the processing inventory is extended accordingly.
- Invitation emails contain the business name and inviter's display name
  only (policy decision on inviter name in §15).
- Business closure and member removal keep only what retention policy allows.

## 12. Concrete test cases

### 12.1 Entry and intent

1. Choose "I represent a business" on `/account/register`; complete
   verification; land on the business step. Reload mid-way; the step resumes.
2. Same via Clerk `/sign-up` and via account home for an existing consumer.
3. Intent reference tampered or external → dropped; consumer flow continues.
4. Feature flag off → entry points hidden; API answers 404 `FEATURE_DISABLED`;
   consumer registration and discovery unaffected.

### 12.2 Credential lifecycle

1. Create password after link verification: rules announced, weak/breached
   rejected, mismatch rejected, success signs in once, returns to intent.
2. Sign-in: wrong password and unknown email produce identical generic errors
   and timing class; allowlisted return honoured; external return dropped.
3. Forgot password: eligible and ineligible addresses receive the same
   response; reset link valid / used / expired states; reset applies rules;
   other sessions revoked; "password changed" notification queued.
4. Change password from `/account/beveiliging` requires recent auth; old
   sessions revoked on request; notification queued.
5. Scan application logs, DB rows and outbox payloads: no password, no reset
   token.
6. NL and EN parity of every Clerk screen in the app frame; no English
   fallback in NL (existing `clerkLocalization` override test extended).

### 12.3 Business profile capture

1. Lookup finds an existing listing by name+postcode; "this is my business"
   opens a claim, no new `business_profiles` row.
2. No match → create: required fields enforced client and server; neighbourhood
   and coordinates derived server-side; client-supplied coordinates ignored.
3. Optional fields blank → accepted; unknown fields → `UNKNOWN_FIELD`.
4. KvK malformed → field error; valid format → stored as evidence.
5. Draft persists across reload and sign-out/sign-in; another account cannot
   read it (403/404).
6. Relationship and authority declaration recorded with version and time.

### 12.4 Verification and review

1. Submission appears in the reviewer queue with onboarding context and
   automated signals (domain match true/false, KvK format ok, duplicate
   score).
2. Reviewer who is a member/creator/claimant of that business → decision
   rejected (existing rule).
3. Approve → exactly one owner membership; retry the approval → idempotent.
4. Request changes → claimant edits and resubmits; version increments; a
   decision against a stale version is rejected.
5. Reject / dispute → existing listing and other owners untouched; email in
   claimant locale.
6. New business remains unpublished until publication review approves.

### 12.5 Membership and lifecycle

1. Owner invites email X; X without account → register → accept succeeds;
   account with different email → accept rejected; token replay → `used`;
   expired → `expired`.
2. Manager cannot invite, change roles, transfer or close (403).
3. Last owner cannot leave/demote; transfer then leave succeeds.
4. Close business → unpublished through existing action; audit rows present.
5. Sole owner of a published business requests account deletion → blocked
   with explanation; after transfer the deletion request proceeds.
6. Member of business A cannot read/write business B (403), including
   invitations and member lists.
7. Business membership leaves `consumer_preferences` and discovery defaults
   unchanged (assert `/api/account/me` preferences identical before/after).

### 12.6 Delivery, security, privacy

1. Every new template renders NL/EN with no token except the invitation link,
   no phone, no KvK.
2. Outbox retry: same row retried keeps the first invitation token valid; a
   stale earlier row after a re-invite fails permanently (pattern from v0.5.1).
3. Rate limits on invitations and submissions; shared network not permanently
   blocked.
4. Log scan: no email, KvK, address, phone, token in logs or error payloads.
5. Rollback rehearsal: flag off, rows preserved, no duplicate sends on re-enable.

### 12.7 Accessibility and localization

1. Keyboard-only completion of business step, member management, sign-in,
   reset, password change.
2. Focus after validation errors, step transitions, invite sent, decision
   banners.
3. axe (WCAG 2.1 A/AA + best practice) on every new screen at 1280×900 and
   390×844; only the documented brand-orange contrast debt tolerated.
4. 320px reflow and 400% zoom on the business step.
5. i18n parity test covers all new keys; no mixed-language strings.

### 12.8 Discovery non-regression

Run `map-regression`, `usability-regression`, `account-regression` and the
business intake/review/moderation suites without changed expectations. Any
diff in map, list, icon, card, filter, route, request, response, cache or
provider behaviour fails the release.

## 13. Acceptance criteria

v0.5.2 is accepted when:

1. A new person can register, verify, create a password, sign in, and reach
   the business step from every entry point, in NL and EN.
2. Forgot/reset/change password work through the identity provider with the
   specified states and notifications; no password or reset token ever
   appears in application persistence or logs.
3. An existing listing is claimed, a new business is created only when no
   match is confirmed, and coordinates/neighbourhood are server-derived.
4. Claims carry relationship, authority declaration and evidence; reviewers
   see automated signals; self-review is impossible; approval is idempotent
   and yields one owner membership.
5. Members, invitations, role changes, transfer, leave and close behave as
   specified and are audited; the last-owner and sole-owner guards hold.
6. Cross-business authorisation is enforced on every route.
7. Business membership never alters consumer preferences or discovery
   defaults.
8. Feature flag fails closed; public discovery and consumer registration are
   unaffected when it is off.
9. All new copy has NL/EN parity; accessibility gates pass.
10. Existing map, list, icon, card, filter, intake, review, moderation and
    account suites pass without changed expectations.
11. Product, privacy, legal, security, accessibility, engineering, QA,
    support and operations approve the evidence.

## 14. Public-release boundary

`businessOnboarding` stays off in production until §13 evidence is approved,
the policy decisions in §15 are recorded, and the identity-provider
production instance has password policy, reset email branding and session
revocation configured and verified.

## 15. Open policy decisions

1. Which evidence is mandatory for a claim (KvK number, business-email
   domain, document) and per relationship type.
2. Whether approval may be automatic when email domain matches the website
   domain of an existing listing.
3. Invitation expiry (proposed 7 days) and maximum outstanding invitations.
4. Whether the inviter's display name appears in invitation emails.
5. Password policy parameters at the identity provider (min length, breach
   check on/off, session revocation on reset).
6. Automatic sign-in after password creation (yes proposed, once).
7. Retention of closed businesses, withdrawn claims and evidence.
8. Recovery procedure when the verified email is lost (REC-012) — shared with
   the consumer programme.

## 16. Definition of done

- Every requirement in §8 and every consumer requirement claimed in §8.8 has
  implementation and test evidence in `release_v052_log.md`.
- Schema changes applied by named migration; rollback rehearsed.
- Lifecycle delivery idempotent and observable for the new templates.
- Security, privacy, accessibility and localization gates pass.
- No discovery behaviour changed.
- Flag off in production; enablement is a separate recorded decision.
