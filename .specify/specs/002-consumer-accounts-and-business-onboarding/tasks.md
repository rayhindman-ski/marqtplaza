# Tasks: Consumer accounts and business onboarding

**Spec**: ./spec.md  
**Plan**: ./plan.md  
**Status**: Not started

## Task format

Use `T### [P] [US#] description`:

- `[P]` means the task can run in parallel because it touches different files
  and has no unfinished dependency.
- `[US#]` maps the task to a prioritized user story.
- Every task names an exact file, module, command, or verification boundary.
- Tasks marked **GATE** need a recorded approval in `convergence.md` before
  the matching flag may be enabled; they never block implementation behind
  the flag.

## Phase 1 — Setup

- [ ] T001 [P] [US1] Add `ApiError` schema, `FeatureFlags` schema, and `GET /account/me` + `GET /account/options` operations to `lib/api-spec/openapi.yaml`; run `pnpm --filter @workspace/api-spec run codegen` and commit output
- [ ] T002 [P] [US1] Create `artifacts/api-server/src/lib/featureFlags.ts` reading `ACCOUNTS_ENABLED`, `BUSINESS_INTAKE_ENABLED`, `BUSINESS_PUBLICATION_ENABLED` (default false) with `src/lib/featureFlags.test.ts`
- [ ] T003 [P] [US1] Create `artifacts/api-server/src/middlewares/requireFlag.ts` returning 404 `ApiError` when a flag is off, and `src/lib/apiError.ts` (code, messageKey, fieldErrors, correlationId) with tests
- [ ] T004 [P] [US1] Create `artifacts/buurtgids/src/lib/featureFlags.ts` reading `VITE_ACCOUNTS_ENABLED`, `VITE_BUSINESS_INTAKE_ENABLED`, `VITE_BUSINESS_PUBLICATION_ENABLED`
- [ ] T005 [US1] Record baseline evidence in `convergence.md`: current route matrix, `pnpm run typecheck`, existing API route tests, and Playwright regression all green before changes

## Phase 2 — Foundational (US1)

- [ ] T006 [US1] Create `lib/db/src/schema/accounts.ts` (`app_users` unique on `clerk_user_id`; `consumer_preferences` with `revision`; `account_consent_events` append-only) and export from `lib/db/src/schema/index.ts`
- [ ] T007 [US1] Rehearse the additive push with `node lib/db/scripts/run-isolated-database-integration.mjs -- pnpm --filter @workspace/db run push`; record the SQL diff in `convergence.md`
- [ ] T008 [US1] Create `artifacts/api-server/src/middlewares/requireAppUser.ts` with idempotent `INSERT … ON CONFLICT DO NOTHING` + select provisioning from `getAuth(req).userId`, injectable resolver like `createRegistrationRouter`
- [ ] T009 [US1] Create `artifacts/api-server/src/lib/permissions.ts` (`isEditor(claims)`, `isOwner(tx, profileId, userId)`, `assertNotSelfReview`) reused by later routes; unit tests
- [ ] T010 [US1] Create `artifacts/api-server/src/routes/account.ts` with `GET /account/me` (status, locale, onboardingCompleted, capabilities, hasResearchRegistration via `hasUserRegistration`) and `GET /account/options` (controlled neighbourhood/interest lists); mount in `src/routes/index.ts` behind `requireFlag('accounts')`
- [ ] T011 [US1] Write `artifacts/api-server/src/routes/account.test.ts`: 401 unauthenticated, 404 when flag off, one row after concurrent provisioning, unknown body fields rejected, no role elevation from body
- [ ] T012 [US1] Extend `artifacts/buurtgids/src/pages/AccountPage.tsx` to show the capability summary when the accounts flag is on; keep the existing research registration status and Clerk `UserProfile` unchanged
- [ ] T013 [US1] Add NL/EN keys for account status, capabilities, and "not available yet" to `artifacts/buurtgids/src/lib/i18n.ts`
- [ ] T014 [US1] **GATE Q7** Owner decides whether the research registration stays mandatory at first sign-up; record in `convergence.md`

## Phase 3 — User Story 2 (P2) — Optional preferences

**Goal**: a signed-in resident saves or skips controlled preferences, sees an accurate summary after refresh, and returns to an allowlisted local path.

- [x] T015 [US2] Add `PATCH /account/preferences` (expectedRevision), `POST /account/onboarding/complete`, `POST /account/consents`, `GET /account/consents` to `openapi.yaml`; codegen
- [x] T016 [US2] Implement handlers in `routes/account.ts`: controlled-ID validation against `GET /account/options` source, 409 on revision mismatch, completion independent of preferences, append-only consent write with notice version
- [x] T017 [US2] Create `artifacts/buurtgids/src/lib/returnPath.ts` (allowlist of local base-relative paths; default `/account`) with `returnPath.test.ts`
- [x] T018 [US2] Create `artifacts/buurtgids/src/pages/AccountPreferencesPage.tsx` (checkbox groups, save/skip, conflict keeps draft, language switch retains state, summary view) and register `/account/voorkeuren` in `App.tsx`
- [x] T019 [US2] Update `artifacts/buurtgids/src/pages/OnboardingPage.tsx` so the `localStorage` completion marker is a cache of the server state and the preference step is offered after registration when the flag is on
- [x] T020 [US2] Write `routes/account.test.ts` cases: skip creates no preference rows, invalid ID → 400 `VALIDATION_FAILED` (shared error contract; spec said 422), stale revision → 409, preferences never touch `user_registrations`, another user's preferences unreadable
- [x] T021 [US2] Write `artifacts/buurtgids/e2e/account-preferences.spec.ts`: save, refresh, skip, return path, external URL rejected, NL/EN parity
- [ ] T022 [US2] **GATE Q1/Q6** (still open on 2026-09-14; development flag on for preview only) Owner approves controlled taxonomy; legal approves consent notice text and version; record in `convergence.md`

## Phase 4 — User Story 3 (P3) — Business intake

**Goal**: a verified representative finds a business, claims it or creates a private draft, and always sees status and next action.

- [x] T023 [US3] Extend `lib/db/src/schema/businessDirectory.ts`: `business_claims` gains `authority_declaration`, `evidence_reference`, `version`, `withdrawn_at`, statuses `changes_requested|disputed|withdrawn`; partial unique index covers open statuses; `business_profiles` gains `publication_status` (default `published`), `created_by_user_id`; rehearse push (T007 command)
- [x] T024 [US3] Add `GET /businesses/lookup`, `POST /businesses` (draft), `PATCH /business-claims/:id`, `POST /business-claims/:id/submit`, `POST /business-claims/:id/withdraw` to `openapi.yaml`; add optional `version`, `nextAction`, `publicationStatus` fields to existing claim/profile schemas; codegen
- [x] T025 [US3] Create `artifacts/api-server/src/routes/business-intake.ts`: public-only lookup serialiser (allowlisted fields), per-user in-memory rate limit, transactional draft profile + owner-candidate claim, duplicate re-check on submit, withdraw keeps audit; mount behind `requireFlag('businessIntake')`
- [x] T026 [US3] Update `artifacts/api-server/src/routes/businesses.ts` public profile and `GET /deals` to exclude `publication_status <> 'published'`; keep existing claim creation working when the flag is off
- [x] T027 [US3] Create `artifacts/buurtgids/src/pages/BusinessLookupPage.tsx` (`/bedrijf-zoeken`) and `BusinessDraftPage.tsx` (`/bedrijf-nieuw`) with modal sign-in preserving URL, duplicate confirmation, receipt with next steps; register routes in `App.tsx`
- [x] T028 [US3] Extend `artifacts/buurtgids/src/pages/MyBusinessWorkspace.tsx` with claim status, reviewer reason, editable evidence on `changes_requested`, withdraw action, version-aware resubmit
- [x] T029 [US3] Update `artifacts/buurtgids/src/pages/BusinessOnboardingPage.tsx` links to the lookup route when the flag is on; unchanged otherwise
- [x] T030 [US3] Write `artifacts/api-server/src/routes/business-intake.test.ts`: lookup omits contact/claim data, 429 on burst, draft invisible via public routes, cross-user 404, withdraw frees the slot, two open claims → 409
- [x] T031 [US3] Write `artifacts/buurtgids/e2e/business-intake.spec.ts`: lookup → claim → withdraw → new draft → refresh persists → anonymous cannot see draft
- [ ] T032 [US3] **GATE Q2/Q3** Reviewer approves evidence policy; operator names reviewer and support owner; record in `convergence.md`

## Phase 5 — User Story 4 (P4) — Review and publication

**Goal**: reviewers decide exact revisions with reasons; only approved, published data is public; existing published profiles stay live.

- [ ] T033 [US4] Create `lib/db/src/schema/businessReview.ts` (`business_profile_revisions` unique on profile+version, `business_reviews`, `fact_checks`) and add `approved_revision_id` to `business_profiles`; backfill revision 1 from current columns for every existing profile in the same push step; rehearse and record
- [ ] T034 [US4] Add `GET/PATCH /business-profiles/:id/revision`, `POST /business-profiles/:id/revision/submit`, `GET /review/businesses`, `POST /review/claims/:id/decision`, `POST /review/revisions/:id/decision`, `POST /review/businesses/:id/publication` to `openapi.yaml`; codegen
- [ ] T035 [US4] Create `artifacts/api-server/src/routes/business-review.ts`: paginated queues, decision on exact version (409 if superseded), self-review 403 via `permissions.ts`, atomic approve → move `approved_revision_id`, publication transitions gated by `requireFlag('businessPublication')`
- [ ] T036 [US4] Update `routes/businesses.ts`: public serialiser reads the approved revision and publication status; owner `PATCH /business-profiles/:id` writes a draft revision when the publication flag is on and behaves as today when off
- [ ] T037 [US4] Extend claim decision in `routes/businesses.ts` to accept `changes_requested`/`disputed` with a required reason while keeping the existing atomic owner grant and competitor rejection
- [ ] T038 [US4] Create `artifacts/buurtgids/src/pages/BusinessRevisionPage.tsx` (`/mijn-bedrijf/:id/profiel`, live vs under-review, submit) and `BusinessReviewDetailView.tsx` (`/redactie/bedrijven/:id`, evidence reference, decision form, disabled self-review); extend `BusinessModerationView.tsx` with authority/editorial/publication tabs; register routes
- [ ] T039 [US4] Update `artifacts/buurtgids/src/pages/BusinessProfileView.tsx` to show "checked on" metadata when present and a 404 state for unpublished businesses
- [ ] T040 [US4] Write `artifacts/api-server/src/routes/business-review.test.ts`: stale decision 409, self-review 403, public field allowlist, suspended → public 404 but owner visible, backfilled revision 1 keeps profile public
- [ ] T041 [US4] Write `artifacts/buurtgids/e2e/business-review.spec.ts`: owner edit → public unchanged → reviewer approves → public updated → suspend → public 404
- [ ] T042 [US4] **GATE Q4** Editorial owner approves minimum public fields and NL/EN parity rule; record in `convergence.md`

## Phase 6 — User Story 5 (P5) — Lifecycle messages and account controls

**Goal**: state changes queue truthful messages durably; consent and deletion controls work with visible status and ownership blockers.

- [ ] T043 [US5] Create `lib/db/src/schema/lifecycle.ts` (`lifecycle_outbox` unique on event+recipient+template, `account_requests`) and export; rehearse push
- [ ] T044 [US5] Create `artifacts/api-server/src/lib/lifecycleOutbox.ts`: `enqueue(tx, event)` used inside existing transactions in `business-intake.ts`, `business-review.ts`, `businesses.ts`; `dispatch(deliver)` with injected loader, bounded retries with backoff, default loader logs `lifecycle_provider_not_configured` once and leaves rows `queued`
- [ ] T045 [US5] Add `POST /account/deletion-requests`, `GET /account/requests`, message status fields to `openapi.yaml`; codegen
- [ ] T046 [US5] Create `artifacts/api-server/src/routes/account-lifecycle.ts`: deletion request with sole-owner check (`blocked_ownership`), Clerk re-authentication requirement documented at contract level, request status listing
- [ ] T047 [US5] Create `artifacts/buurtgids/src/pages/AccountPrivacyPage.tsx` (`/account/privacy`): consent withdrawal, deletion scope explanation, request status, message status wording limited to queued/accepted/failed; register route
- [ ] T048 [US5] Write `artifacts/api-server/src/routes/account-lifecycle.test.ts` and `src/lib/lifecycleOutbox.test.ts`: same-transaction commit, provider failure keeps state and marks `failed` with next retry, no duplicate on retry, sole-owner deletion blocked, consent events append-only
- [ ] T049 [US5] **GATE Q5/Q6/Q8** Operator approves delivery provider and test inbox; legal approves retention periods, deletion exceptions, and registration-data handling; record in `convergence.md`. Actual erasure job is not implemented before this gate

## Phase 7 — Polish and convergence

- [ ] T050 [P] [US1] Audit all new screens for keyboard completion, focus management, error summary, reduced motion, mobile viewport; fix in the page files
- [ ] T051 [P] [US1] Audit NL/EN parity of every new key in `src/lib/i18n.ts`; language switch retains form state on every new page
- [ ] T052 [P] [US1] Document flags, routes, and gates in `replit.md` and `doc/md/` (link `version-v.03.md` as the archived source plan)
- [ ] T053 [US1] Run the full verification plan from `plan.md` and record outputs in `convergence.md`
- [ ] T054 [US1] Review deviations against the constitution; list open gates and the flag state per environment; close or park the spec

## Dependencies and execution order

1. T001–T004 run in parallel; T005 before any schema change.
2. T006–T013 depend on Phase 1; T007 must pass before T008–T011 are merged.
3. Phase 3 (T015–T021) depends on T006–T011.
4. Phase 4 (T023–T031) depends on T008–T009 and may run in parallel with Phase 3 after T011.
5. Phase 5 (T033–T041) depends on Phase 4.
6. Phase 6 (T043–T048) depends on T008 and the transactions from Phases 4–5; T044 can start after T025.
7. Phase 7 depends on all selected stories. GATE tasks (T014, T022, T032, T042, T049) run in parallel with implementation and gate only the flag, never the code.

## Definition of done

- [ ] All selected acceptance scenarios pass.
- [ ] Loading, empty, stale, blocked, unauthorized, forbidden, conflict, flag-disabled, and provider-failure states are intentional where applicable.
- [ ] Relevant typecheck and tests pass, including the pre-existing registration, saved-events, and discovery regression suites.
- [ ] OpenAPI outputs are regenerated after contract changes.
- [ ] No secrets, personal data, or unsupported claims were added; logs carry event codes and IDs only.
- [ ] All three rollout flags remain off in every environment until the matching gate is recorded.
- [ ] Convergence notes are recorded in the feature directory.
