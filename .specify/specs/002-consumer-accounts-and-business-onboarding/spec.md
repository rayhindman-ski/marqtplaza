# Feature Specification: Consumer accounts and business onboarding

**Feature Branch**: `002-consumer-accounts-and-business-onboarding`  
**Created**: 2026-09-14  
**Status**: Implemented behind flags; release candidate with verification incomplete as of 2026-09-14 (manual accessibility pass owed, gates Q1–Q8 open — see `convergence.md`)  
**Input**: The archived MarqtPlaza implementation plan (`doc/md/version-v.03.md`,
dated 11 September 2026, status "proposed; documentation only") asked for
complete consumer account and business onboarding journeys with API
enforcement, persistence, real messages, error recovery, accessibility, and
account management. The plan was written against an older product shape and
must be reconciled with the current `artifacts/buurtgids` product before any
implementation starts.

## Context

### Problem

The archived plan describes the product as a campaign-driven weekend guide
(`artifacts/marqtplaza-weekend-guide`, `routes/campaign.ts`,
`schema/campaign.ts`, hashed management tokens, `/weekend-guide/` base path)
with no authentication, no business tables, and no account APIs. None of that
matches the repository today:

| Plan assumption | Current reality (verified 2026-09-14) | Consequence |
| --- | --- | --- |
| Web artifact `artifacts/marqtplaza-weekend-guide`, base `/weekend-guide/` | `artifacts/buurtgids`, preview path `/`, base path from `import.meta.env.BASE_URL`; routes are Dutch slugs (`/onboarding`, `/account/*`, `/bedrijf-aanmelden`, `/bedrijf-claim`, `/mijn-bedrijf`, `/bedrijf/:slug`, `/redactie/bedrijven`, `/sign-in`, `/sign-up`) with language as UI state, not URL prefix | Plan's proposed `/account/register`, `/business/*`, `/review/*` routes are obsolete; new routes must follow the Dutch-slug convention and `basePath` handling |
| "Select and configure authentication" is an open decision | Clerk is the approved provider (constitution IV): `ClerkProvider` in `App.tsx`, `clerkMiddleware` on the API, `getAuth(req).userId` in handlers, session-claim role `admin`/`editor` via `requireEditor` and `useEditorAccess` | Identity provider decision is closed; verification, recovery, and contact-change flows are Clerk-managed |
| Campaign routes (`/preferences`, `/unsubscribe`, deletion, support), campaign email in `lib/campaign-email.ts` | No campaign module, campaign schema, campaign tokens, or email delivery module exists in this repository | Campaign preservation rules do not apply; there is **no** message delivery infrastructure at all, which is a release blocker for lifecycle messages |
| No users, businesses, memberships, claims, reviews tables | `user_registrations` (one row per Clerk user, unique `user_id`), `business_profiles`, `business_claims` (one pending claim per profile, partial unique), `business_members` (unique profile+user, role `owner`), `business_deals`, saved-event tables, community tables | Gaps are narrower: missing local user row, controlled preferences, consent history, profile revisions, publication state, fact checks, audit, outbox, and account requests |
| No account or business APIs | Under `/api`: `GET/PUT /registration`; `GET/POST /business-claims`; `GET/PATCH /business-claims/moderation[/:id]`; `GET /business-profiles/mine`; `PATCH /business-profiles/:id`; `POST/PATCH /business-profiles/:id/deals[/:dealId]`; `GET /business-profiles/public/:slug`; `GET /deals`; `GET/PATCH /deals/moderation[/:id]` | New contracts are additive to an existing business/registration surface, not greenfield |
| Onboarding = optional locale/neighbourhood/interest setup | `OnboardingPage` is a mandatory-field research questionnaire (name, `registrationType`, email, usefulness and referral ratings, desired features) saved through `PUT /registration`; completion is marked in `localStorage` | Current onboarding collects research data, not controlled preferences; a skip-able preference step does not exist and completion is not server-authoritative |
| Reviewer queues, editorial revision review, publication gates | `BusinessModerationView` approves/rejects claims and deals; claim approval atomically sets `isClaimed`, inserts an owner membership, and rejects competing pending claims; owner edits to `business_profiles` become public immediately via `GET /business-profiles/public/:slug` | No draft/approved revision separation, no explicit publication state, no fact-check metadata, no "changes requested"/"disputed"/"withdrawn" claim states, no self-review block |
| Reviewed migration files | `lib/db` only exposes `drizzle-kit push`; no migrations directory | "Additive, reviewed migrations" must be expressed as additive schema changes verified against an isolated database, with an explicit rollback rule of never dropping tables |
| Rollout flags for accounts, intake, publication | No feature-flag mechanism exists in web or API code | Flags must be introduced before any new entry point ships |
| No automated journey tests | API: Node test runner (`tsx --test`) with route tests including `registration.test.ts`; DB integration scripts with isolated databases; web: Playwright e2e in `artifacts/buurtgids/e2e` | New work can extend existing runners; no new test framework is needed |

The problem this feature solves: a resident can sign in but cannot record
controlled preferences, cannot see or change what the product stores about
them, and cannot request deletion in-product; a business representative can
claim a listing but cannot create a new business, cannot see a review reason
or next action, and owner edits go public without editorial review; a reviewer
cannot request changes, cannot record evidence-based authority decisions, and
cannot publish or unpublish deliberately.

### Users and scope

- **Primary user**: resident/visitor (consumer), business representative,
  platform reviewer (existing Clerk `editor`/`admin` role).
- **Product area**: accounts, business directory, moderation.
- **In scope**:
  - Local user provisioning from the trusted Clerk identity.
  - Optional consumer preferences (language, controlled neighbourhoods,
    controlled interests) with a visible summary and server-authoritative
    onboarding completion, alongside the existing research registration.
  - Consumer settings, consent history, and tracked deletion requests.
  - Business lookup, claim with richer states, new business draft, owner
    profile revisions, editorial review, explicit publication, and reviewer
    queues.
  - Lifecycle messages through a durable outbox once a delivery provider is
    approved.
  - Disabled-by-default rollout flags for consumer accounts, business intake,
    and business publication.
- **Out of scope** (deferred, unchanged from the archived plan section 4):
  paid plans, billing, booking, team invitations, self-service ownership
  transfer, bulk multi-business management, personalised feeds, collaborative
  lists, route planning, uploaded identity documents, automated business
  verification, automated publication approval, campaign scaling, and the
  discovery enhancement backlog (#2, #3, #6, #7, #8, #10, #12, #15, #16, #17,
  #20, #21, #22, #23).

### Behaviour that must be preserved

- **Anonymous discovery**: `/`, `/activiteiten/den-haag`, `/nieuws`, `/deals`,
  `/buurt` (read), `/bronnen`, `/bedrijf/:slug` stay reachable without an
  account. No new sign-in prompt on discovery routes.
- **Existing registration**: `GET/PUT /registration`, `OnboardingPage`, and
  `AccountPage` keep working for users who already registered; the
  `user_registrations` table and its OpenAPI contract stay compatible.
- **Existing business behaviour**: `BusinessClaimView` claim submission,
  `MyBusinessWorkspace` profile and deal editing, deal moderation, the public
  profile route, and the atomic claim-approval transaction keep working.
  Current approved owners remain owners.
- **Editor role source**: reviewer privilege stays derived from Clerk session
  claims; it is never set through a public API or client input.
- **Saved events and community**: untouched.

## User scenarios and acceptance

### User Story 1 — Server-authoritative identity and capabilities (Priority: P1)

**As a** signed-in resident or representative  
**I want** the product to recognise me once, derived from my Clerk session  
**So that** every later account or business action is enforced on the server
with my real capabilities.

**Why this priority**: every other story depends on a local user row,
capability summary, and rollout flags. It is also the safest slice: no new
public UI is required to verify it.

**Independent test**: with consumer-account flag off, `GET /api/account/me`
returns 404 (not found, non-disclosing) for everyone; with the flag on, an
authenticated request provisions exactly one local user, repeated calls return
the same user, an unauthenticated request receives 401, and a body containing
`role: "admin"` on any account endpoint is rejected as an unknown field.

**Acceptance scenarios**:

1. **Given** a Clerk-authenticated user with no local row and the consumer
   accounts flag enabled, **when** they call `GET /account/me`, **then** one
   `app_users` row keyed by the Clerk subject is created, and the response
   contains status `active`, locale, onboarding completion `false`,
   capabilities (`isEditor`, `canClaimBusiness`, `canPublishBusiness`), and
   whether an existing research registration exists.
2. **Given** the same user calling `GET /account/me` twice concurrently,
   **when** both requests race, **then** exactly one row exists afterwards.
3. **Given** an unauthenticated request, **when** it calls any `/account/*`
   or owner/reviewer business endpoint, **then** the response is 401 with
   the standard error shape and no user data.
4. **Given** the consumer accounts flag is disabled, **when** any client
   requests `/account/*` or renders the account preference UI, **then** the
   API returns 404 and the web app hides the entry points while the existing
   `/onboarding`, `/account`, and `/mijn-bedrijf` routes continue to work.

### User Story 2 — Optional preferences with a useful first outcome (Priority: P2)

**As a** resident  
**I want** to optionally save my language, neighbourhoods, and interests, or
skip that step  
**So that** I see a truthful summary of what the product knows about me and
return to what I was doing.

**Why this priority**: the first account-specific consumer value; it
distinguishes an account from the research registration and prepares
backlog items #18 and #24 without promising personalisation.

**Independent test**: a new user can complete `/account/voorkeuren`
(preferences) by saving or skipping, refresh, and see the same state; a
skipped step leaves preferences unset and marks onboarding complete on the
server; an allowlisted local return path is honoured and an external URL is
not.

**Acceptance scenarios**:

1. **Given** an active user with no preferences, **when** they open the
   preferences step and choose "skip", **then** `POST /account/onboarding/complete`
   records completion, no preference rows are created, and the summary says
   "no preferences saved" in the current language.
2. **Given** an active user, **when** they save locale `en`, two controlled
   neighbourhood IDs, and one controlled interest ID, **then**
   `PATCH /account/preferences` validates each ID against the controlled
   lists, stores a revision, and the summary lists exactly those choices.
3. **Given** a saved revision `n`, **when** two tabs submit with expected
   version `n`, **then** the second receives 409 and its draft input is kept
   on screen.
4. **Given** a user arrived from `/deals` with `?terug=/deals`, **when** they
   finish, **then** they are returned to `/deals`; **given** `?terug=https://evil.example`,
   **then** they are returned to `/account`.
5. **Given** the existing research registration exists for the user,
   **when** they view `/account`, **then** the registration summary and the
   preference summary are shown as two separate things, and completing
   preferences never writes to `user_registrations`.
6. **Given** any preference screen, **when** the user switches language,
   **then** unsaved form state is retained.

### User Story 3 — Business intake with durable state and truthful status (Priority: P3)

**As a** verified business representative  
**I want** to find my business, claim it or create a private draft, and see
the status and next action  
**So that** my work survives interruptions and I know what the review needs
from me.

**Why this priority**: extends the existing claim path (today: pending →
approved/rejected with a note) into a recoverable, explained process and
adds the missing "new business" path.

**Independent test**: with the business intake flag on, a verified user can
search public matches, submit a claim with an authority declaration and a
reference, withdraw it, create a private draft, refresh and still see the
draft; another user cannot read either record; anonymous users never see a
draft through any public endpoint.

**Acceptance scenarios**:

1. **Given** a verified user, **when** they search `GET /businesses/lookup?q=`
   with a name and locality, **then** at most a bounded number of public
   matches (name, neighbourhood, category, public source URL, whether already
   claimed) are returned; owner contact details and pending claim details are
   never included; requests are rate-limited.
2. **Given** an unclaimed listing, **when** the user submits a claim with
   `authorityDeclaration` and an optional `evidenceReference` (URL or short
   text, no uploads), **then** the claim is `submitted`, the existing
   "one pending claim per profile" rule still holds, and the user is shown a
   receipt with status and "what happens next" in NL and EN.
3. **Given** a submitted claim, **when** the claimant withdraws it, **then**
   status becomes `withdrawn`, the audit row is kept, and the listing becomes
   claimable again.
4. **Given** a reviewer set a claim to `changes_requested` with a reason,
   **when** the claimant opens `/mijn-bedrijf`, **then** the reason and an
   editable evidence field are shown; resubmission requires the current
   version.
5. **Given** no matching listing, **when** the user creates a new business
   draft (public name, category, neighbourhood, authority declaration),
   **then** a `business_profiles` row with `publicationStatus = draft` and an
   owner-candidate claim are created together; duplicate candidates are
   re-checked at submission and shown before the user confirms.
6. **Given** a draft business, **when** anyone calls
   `GET /business-profiles/public/:slug` or `GET /deals`, **then** the draft
   and its deals are not returned.
7. **Given** the business intake flag is disabled, **when** a user opens the
   new lookup/draft routes, **then** they see a localized "not available yet"
   state and the existing `/bedrijf-claim` path continues to work.

### User Story 4 — Reviewer decisions and explicit publication (Priority: P4)

**As a** platform reviewer  
**I want** to decide authority claims and exact profile revisions with
recorded reasons, and publish or unpublish deliberately  
**So that** only reviewed, attributed facts appear publicly and owners
understand decisions.

**Why this priority**: closes the gap where owner edits publish instantly and
where decisions carry no structured reason, evidence reference, or freshness.

**Independent test**: an owner edits a published business; the public
profile remains unchanged until a reviewer approves the exact submitted
revision and publication is enabled; a reviewer cannot decide their own
claim; a decision against a superseded revision is rejected with 409.

**Acceptance scenarios**:

1. **Given** an approved owner, **when** they edit their profile, **then**
   changes are stored as a new `business_profile_revisions` draft and the
   public profile still serves the last approved revision.
2. **Given** a submitted revision `v`, **when** the reviewer approves `v`,
   **then** the approved pointer moves to `v` atomically, the decision and
   reason are recorded in `business_reviews`, and the owner is notified.
3. **Given** the owner submitted `v+1` after the reviewer loaded `v`,
   **when** the reviewer decides `v`, **then** the API returns 409 and the
   queue refreshes.
4. **Given** a reviewer who is also the claimant or an owner of the business,
   **when** they attempt a decision, **then** it is refused with 403 and a
   reason.
5. **Given** an approved revision and the business publication flag enabled,
   **when** the reviewer sets publication to `published`, **then**
   `GET /business-profiles/public/:slug` serves only approved public fields
   plus "checked on" metadata; `suspended`/`unpublished` businesses return
   404 publicly while remaining visible to owner and reviewer with status.
6. **Given** a claim decision of `changes_requested` or `rejected`, **when**
   the claimant reads it, **then** they see the safe reason but never other
   claimants' details or internal notes.
7. **Given** existing already-claimed businesses at rollout, **when** the
   revision model is introduced, **then** each current `business_profiles`
   row is treated as approved revision 1 and remains published, so no
   current public profile disappears.

### User Story 5 — Lifecycle messages and account controls (Priority: P5)

**As an** account holder or owner  
**I want** truthful status messages and working privacy controls  
**So that** I can withdraw consent or request deletion and know what will
happen to businesses I own.

**Why this priority**: required before public rollout (Gate C) but depends
on an approved delivery provider and legal decisions that do not exist yet.

**Independent test**: with a test delivery loader injected, committing a
claim submission also commits an outbox row; a failed send retries with
backoff and never duplicates; a deletion request from a sole owner is
recorded with status `blocked_ownership` and a support route instead of
silently completing.

**Acceptance scenarios**:

1. **Given** a claim submission, **when** the transaction commits, **then**
   a `lifecycle_outbox` row is committed in the same transaction; a provider
   failure leaves the claim intact and the row `failed` with a next retry.
2. **Given** an outbox row, **when** the UI shows message status, **then**
   it says queued / accepted by provider / failed, never "delivered" from a
   submission alone.
3. **Given** an active user, **when** they withdraw marketing consent,
   **then** an append-only `account_consent_events` row is written and no
   earlier row is modified.
4. **Given** a user who is the sole owner of a published business, **when**
   they request deletion, **then** the request is created with
   `blocked_ownership`, the ownership resolution path is explained, and the
   account is not deleted.
5. **Given** a user with no ownership blockers, **when** they confirm
   deletion after Clerk re-authentication, **then** the request is `pending`
   with a visible status; actual erasure follows the approved retention
   policy (release gate) and is not implemented until approved.

## Functional requirements

- **FR-001**: The system MUST derive identity from the Clerk session on every
  request and MUST NOT accept user IDs, roles, or capabilities from request
  bodies or query strings.
- **FR-002**: The system MUST provision at most one local user per Clerk
  subject, idempotently and race-safely (unique constraint plus upsert).
- **FR-003**: The system MUST keep anonymous discovery routes free of new
  authentication prompts.
- **FR-004**: The system MUST keep `GET/PUT /registration`, the existing
  business claim/profile/deal endpoints, and their OpenAPI schemas backward
  compatible; additions are new fields or new operations only.
- **FR-005**: The system MUST store onboarding completion on the server and
  independently of whether any preference exists; the `localStorage` marker
  becomes a cache, not the source of truth.
- **FR-006**: The system MUST validate neighbourhood and interest choices
  against controlled lists served by the API, and MUST NOT infer preferences.
- **FR-007**: The system MUST require an expected version for preference,
  claim, and profile-revision updates and return 409 on mismatch.
- **FR-008**: The system MUST expose feature flags `ACCOUNTS_ENABLED`,
  `BUSINESS_INTAKE_ENABLED`, and `BUSINESS_PUBLICATION_ENABLED` (server) with
  matching `VITE_` read-only mirrors for the web app; all default to off;
  disabled flags return 404 on new endpoints and hide new UI.
- **FR-009**: The system MUST keep the business lookup public-only, bounded,
  and rate-limited.
- **FR-010**: The system MUST model claims with states `submitted`,
  `changes_requested`, `approved`, `rejected`, `disputed`, `withdrawn` while
  continuing to honour the existing `pending`-based unique constraint (map
  `pending` → `submitted` semantics or extend the partial index).
- **FR-011**: The system MUST separate profile draft revisions from the
  approved revision, and public serialisation MUST read only the approved
  revision plus publication status.
- **FR-012**: The system MUST record every reviewer decision with reviewer
  ID, target version, decision, and reason, and MUST refuse self-review.
- **FR-013**: The system MUST commit lifecycle outbox rows in the same
  transaction as the state change they describe.
- **FR-014**: The system MUST write consent changes as append-only events
  with notice version and source.
- **FR-015**: The system MUST NOT persist health, disability, allergy, precise
  live location, birth date, nationality, or phone during onboarding.
- **FR-016**: The system MUST log event codes and internal IDs only; no
  emails, tokens, evidence content, or free-text bodies in logs.
- **FR-017**: All new UI MUST be available in NL and EN with equivalent
  required fields, errors, and statuses, keep form state across language
  switches, and be keyboard/screen-reader completable without map, drag, or
  upload interactions.
- **FR-018**: The system MUST show loading, empty, unauthorized, forbidden,
  conflict, flag-disabled, and provider-failure states explicitly.

## Data and contracts

- **Entities (new, additive)**: `app_users` (Clerk subject, status, locale,
  onboarding completion, timestamps), `consumer_preferences` (user FK,
  revision, controlled neighbourhood/interest IDs), `account_consent_events`
  (append-only), `business_profile_revisions` (profile FK, version, NL/EN
  fields, structured facts, review status), `business_reviews` (target type,
  target ID, target version, reviewer, decision, reason), `fact_checks`
  (revision/field, source URL, checked on, reviewer, status),
  `lifecycle_outbox` (event, recipient ref, template, locale, status,
  attempts, next retry, provider ID), `account_requests` (scope, type,
  status, deadline, resolution).
- **Entities (extended)**: `business_profiles` gains `publicationStatus`
  (`draft|unpublished|published|suspended|archived`, default `published`
  for existing rows), `approvedRevisionId`, `createdByUserId`;
  `business_claims` gains `authorityDeclaration`, `evidenceReference`,
  `version`, `withdrawnAt`, and the new statuses.
- **Relationships**: one `app_users` per Clerk subject; `business_members`
  remains the authorisation source for owners; approval of a claim still
  grants membership atomically; a business always has at most one approved
  revision; deletion requests reference sole-owner blockers.
- **API changes** (all under `/api`, OpenAPI-first): `GET /account/me`,
  `GET /account/options` (controlled lists), `PATCH /account/preferences`,
  `POST /account/onboarding/complete`, `POST /account/consents`,
  `GET /account/consents`, `POST /account/deletion-requests`,
  `GET /account/requests`, `GET /businesses/lookup`, `POST /businesses`
  (draft), `PATCH /business-claims/:id`, `POST /business-claims/:id/submit`,
  `POST /business-claims/:id/withdraw`, `GET/PATCH /business-profiles/:id/revision`,
  `POST /business-profiles/:id/revision/submit`, `GET /review/businesses`,
  `POST /review/claims/:id/decision`, `POST /review/revisions/:id/decision`,
  `POST /review/businesses/:id/publication`. Existing operations gain optional
  response fields only. Standard error shape: `{ code, messageKey, fieldErrors?, correlationId }`
  added alongside the existing `{ error }` string for compatibility.
- **Persistence**: additive Drizzle schema modules; verified with
  `drizzle-kit push` against an isolated integration database; never a
  destructive push in production; rollback = disable flags, keep tables.
- **Generated artifacts**: `pnpm --filter @workspace/api-spec run codegen`
  after each contract change; regenerated React Query client and Zod
  schemas are committed.

## Edge cases and failure states

- Clerk session present but local provisioning fails → 503 with
  correlation ID; no partial user row.
- Flag disabled after data exists → endpoints 404, data retained, UI hides
  entry points and shows status pages for existing claims.
- Controlled list changed after a preference was saved → summary shows the
  stored ID as "no longer available" instead of dropping it silently.
- Lookup provider (existing listings resolution) unavailable → 503 "try
  again", not an empty result (constitution II/V).
- Two claims for one listing → second gets 409 today; with new states, a
  `withdrawn`/`rejected` claim frees the slot while `submitted`/`changes_requested`
  keep it.
- Reviewer loses role mid-session → next request 403; UI redirects like the
  existing review routes.
- Outbox provider not configured → rows stay `queued`, an operator warning
  is logged once, UI shows "message pending"; the flow itself completes.
- Mobile, keyboard-only, reduced motion, and language switch on every new
  screen; error summary focuses the first invalid field.

## Success criteria

- **SC-001**: A new signed-in user can complete or skip preferences and see
  an accurate summary after refresh, in NL and EN, without a repeated prompt.
- **SC-002**: No route or query can return draft business data, another
  user's claim, or another user's preferences (route tests prove 401/403/404).
- **SC-003**: Existing tests (`registration.test.ts`, saved events,
  discovery regression Playwright) still pass unchanged; existing claim
  approval transaction still rejects competing claims.
- **SC-004**: Each phase has focused API route tests plus one Playwright
  journey; typecheck passes; codegen output is current.
- **SC-005**: All three flags default off in development and production
  until the matching release gate is recorded in `convergence.md`.

## Assumptions and open questions

Approvals below are release gates. The implementation must not substitute a
default for any of them.

| ID | Question | Approver | Blocks |
| --- | --- | --- | --- |
| Q1 | Controlled neighbourhood and interest taxonomy for preferences (start from existing `LOCATIONS`/neighbourhood data and category lists?) | Owner | US2 release |
| Q2 | Authority evidence policy: what counts as business-controlled evidence; whether registration numbers are ever required | Owner + reviewer | US3 release |
| Q3 | Named reviewer(s) and support owner, response expectations shown to users (no invented SLA) | Operator | US3/US4 release |
| Q4 | Minimum public fields and NL/EN parity rule for publication | Editorial owner | US4 release |
| Q5 | Message delivery provider and sender identity; test inbox | Operator | US5 release |
| Q6 | Lawful basis wording, notice versions, retention periods, deletion exceptions | Owner + legal | US5 release; consent notice text in US2 |
| Q7 | Whether the research registration (`user_registrations`) stays mandatory on first sign-up or becomes optional once preferences exist | Owner | US2 UX |
| Q8 | Relationship between account deletion and research registration data | Owner + legal | US5 |

## Risks and follow-up

- **Risk**: introducing revisions changes how owner edits reach the public
  page; owners may perceive review as a regression. **Mitigation**: keep
  existing rows published as revision 1; show "under review" status and the
  live version side by side.
- **Risk**: no migration tooling; a schema push with a wrong default could
  unpublish businesses. **Mitigation**: defaults chosen so existing rows are
  `published`/`approved`; rehearse on an isolated database with a copy of
  representative rows.
- **Risk**: no message delivery exists; lifecycle promises could be shown
  without any send. **Mitigation**: outbox first, provider later, UI wording
  limited to "queued".
- **Deferred**: team memberships UI, ownership transfer self-service,
  personalised feed, deal changes beyond publication gating, campaign work.
