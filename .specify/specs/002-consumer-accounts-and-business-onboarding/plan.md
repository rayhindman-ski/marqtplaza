# Implementation Plan: Consumer accounts and business onboarding

**Spec**: ./spec.md  
**Status**: Ready for tasks  
**Date**: 2026-09-14

## Summary

Extend the existing Clerk-backed `artifacts/buurtgids` + `artifacts/api-server`
surfaces additively. Introduce a local user row and capability summary first,
then optional consumer preferences, then richer business intake, then
revision-based editorial review with explicit publication, then lifecycle
messaging and account controls. Every phase ships behind a disabled-by-default
flag, keeps all current routes and tables working, and is OpenAPI-first with
regenerated clients. Decisions that need owner, legal, reviewer, or operator
approval are release gates recorded in `convergence.md`, never defaults in
code. This plan supersedes sections 2, 5, 6, 8, and 11 of the archived
`doc/md/version-v.03.md`; sections 4, 9, 10, 13, and 14 of that document
remain valid policy input.

## Constitution check

| Principle | How this plan complies | Evidence or exception |
| --- | --- | --- |
| User value is a vertical slice | Five prioritised stories, each independently testable; P1 is usable through API tests alone, P2 gives the first visible consumer outcome | spec.md user stories |
| Local truth beats invented completeness | Lookup failures return 503 not empty; preferences are never inferred; unknown facts stay unknown; public profile serves only approved revision with checked-on metadata | FR-006, FR-011, edge cases |
| Contracts are the shared language | All new endpoints defined in `lib/api-spec/openapi.yaml` before handlers; codegen after every change; error shape added additively | Technical context, Phase 1 |
| Privacy, moderation, and ownership are explicit | Clerk only; `business_members` stays the authorisation source; reviewer role from session claims; self-review blocked; consent append-only; no sensitive attributes collected | FR-001, FR-012, FR-014, FR-015 |
| External integrations fail independently | Message provider injected as a loader at route construction; outbox state distinct from business state; provider absence is a visible queued state | US5, memory: provider-integration-tests |
| Accessible, localized, and responsive by default | Dutch route slugs, `translations[language]`, NL/EN parity, keyboard completion, base path via `import.meta.env.BASE_URL` | FR-017, UX section |
| Small changes preserve operational clarity | No new framework; Node test runner + Playwright; additive Drizzle modules; flags via env; structured pino logging with event codes | Technical context |

## Technical context

- **Web package**: `artifacts/buurtgids` (Vite, Wouter with `base={basePath}`,
  React Query, Clerk React, `translations` in `src/lib/i18n.ts`).
- **API package**: `artifacts/api-server` (Express, `clerkMiddleware`,
  `getAuth(req)`, `requireEditor`, routers mounted in `src/routes/index.ts`).
- **Shared libraries**: `lib/api-spec` (OpenAPI + Orval codegen to
  `@workspace/api-client-react` and `@workspace/api-zod`), `lib/db`
  (Drizzle schema in `src/schema/*.ts`, `drizzle-kit push`, isolated
  integration DB scripts).
- **Persistence**: additive schema modules `accounts.ts`, extension of
  `businessDirectory.ts`, new `businessReview.ts`, `lifecycle.ts`; no
  migrations directory exists, so each phase includes an isolated-database
  push rehearsal and documents defaults for existing rows.
- **Integrations**: Clerk (approved). Message delivery provider: **none
  exists**; gate Q5. Existing listing resolution (`resolveClaimableBusinessListing`)
  is reused for lookup.
- **Testing**: API route tests with `tsx --test` and injected resolvers
  (pattern from `createRegistrationRouter(resolveUserId)`); DB integration
  via `lib/db/scripts/run-isolated-database-integration.mjs` wrappers;
  Playwright journeys in `artifacts/buurtgids/e2e` using the existing
  dev-only test-auth hook pattern.
- **OpenAPI/codegen**: Required in every phase that adds or changes an
  operation.

## Affected surfaces

### Files and modules

Existing (change additively):

- `lib/api-spec/openapi.yaml` — new `/account/*`, `/businesses/lookup`,
  `/businesses`, claim lifecycle, revision, `/review/*` operations; new
  `ApiError` schema; optional fields on existing business responses.
- `lib/db/src/schema/businessDirectory.ts` — publication status, approved
  revision pointer, creator, claim authority/evidence/version/new statuses.
- `lib/db/src/schema/index.ts` — export new modules.
- `artifacts/api-server/src/routes/index.ts` — mount new routers.
- `artifacts/api-server/src/routes/businesses.ts` — read approved revision
  in public serialisation; owner PATCH writes a draft revision when the
  publication flag is on (unchanged behaviour when off); lookup and draft
  creation.
- `artifacts/api-server/src/routes/registration.ts` — unchanged contract;
  `GET /account/me` reports whether a registration exists.
- `artifacts/buurtgids/src/App.tsx` — new routes `/account/voorkeuren`,
  `/account/privacy`, `/bedrijf-zoeken`, `/bedrijf-nieuw`,
  `/mijn-bedrijf/:id/profiel`, `/redactie/bedrijven/:id`; flag-aware nav.
- `artifacts/buurtgids/src/pages/AccountPage.tsx`, `OnboardingPage.tsx`,
  `MyBusinessWorkspace.tsx`, `BusinessModerationView.tsx`,
  `BusinessClaimView.tsx`, `BusinessProfileView.tsx` — extend, do not
  replace.
- `artifacts/buurtgids/src/lib/i18n.ts` — NL/EN keys for every new state.

New:

- `lib/db/src/schema/accounts.ts`, `businessReview.ts`, `lifecycle.ts`.
- `artifacts/api-server/src/lib/featureFlags.ts`,
  `src/lib/apiError.ts`, `src/lib/permissions.ts`,
  `src/lib/lifecycleOutbox.ts` (with injected delivery loader).
- `artifacts/api-server/src/middlewares/requireFlag.ts`,
  `src/middlewares/requireAppUser.ts`.
- `artifacts/api-server/src/routes/account.ts`, `business-intake.ts`,
  `business-review.ts`, `account-lifecycle.ts` and matching `*.test.ts`.
- `artifacts/buurtgids/src/lib/featureFlags.ts`, `src/lib/returnPath.ts`,
  `src/pages/AccountPreferencesPage.tsx`, `AccountPrivacyPage.tsx`,
  `BusinessLookupPage.tsx`, `BusinessDraftPage.tsx`,
  `BusinessRevisionPage.tsx`, `BusinessReviewDetailView.tsx`.
- `artifacts/buurtgids/e2e/account-preferences.spec.ts`,
  `business-intake.spec.ts`, `business-review.spec.ts`.
- `.specify/specs/002-.../convergence.md` — gate records.

### API and data model

- Contract: all additions; existing operation shapes gain optional fields
  only (`publicationStatus`, `approvedRevisionVersion`, `nextAction`,
  `version`). Existing `{ error: string }` responses remain; new operations
  return `ApiError` `{ code, messageKey, fieldErrors?, correlationId }`.
- Compatibility: `business_profiles.publicationStatus` defaults to
  `published` and `approvedRevisionId` is backfilled with a synthetic
  revision 1 built from current columns in the same push step, so no public
  profile disappears. `business_claims.status = 'pending'` keeps meaning
  "awaiting review" (alias of `submitted`) so the partial unique index and
  existing moderation queue keep working; new statuses are added, none
  removed.
- Rollback: turn flags off; keep tables; never drop or truncate; a revision
  rollback re-points `approvedRevisionId` to the previous approved revision.
- Migration safety: because only `drizzle-kit push` exists, each schema
  change is rehearsed with the isolated integration database script and the
  resulting SQL diff is reviewed before any production push; production
  pushes happen only with a fresh database backup and flags off.

### UX and content

- Routes follow the current Dutch-slug convention with language as UI
  state; all links built from `basePath`.
- States per screen: loading, empty, flag disabled, unauthenticated (modal
  sign-in preserving current URL, as `BusinessClaimView` does), forbidden,
  version conflict (keep draft input), provider failure, success with next
  action.
- Preferences step uses checkbox groups from API-served controlled lists;
  no map or drag; language switch retains state.
- Reviewer detail shows evidence reference, decision form with required
  reason, target version, and disabled self-review with explanation.
- Public profile shows "checked on" date when fact checks exist; nothing
  when they do not.

## Research and decisions

| Question | Finding | Decision | Why |
| --- | --- | --- | --- |
| Identity provider | Clerk already wired end to end; constitution IV names it | Closed: Clerk. No local password store; verification/recovery are Clerk-managed | Avoid duplicate identity, keep approved integration |
| Local user table vs. Clerk-only | Existing tables key on Clerk `userId` text; no local status/locale/onboarding store | Add `app_users` keyed by Clerk subject; existing tables keep `userId` text columns (no FK rewrite) | Additive, no data migration of existing rows |
| Reviewer role source | Session claim `metadata.role`/`public_metadata.role` = `admin`/`editor` | Keep; add `permissions.ts` helper reused by all new routes | Never elevate from client data |
| Existing onboarding questionnaire | Mandatory research form saved via `PUT /registration`, completion in `localStorage` | Preserve as "research registration"; add separate optional preference step with server-side completion | Two purposes, two records; gate Q7 decides ordering |
| Campaign preservation rules in the archived plan | No campaign code, tokens, or email exists in this repo | Drop campaign-specific rules; keep the principle that consent purposes stay independent | Rules referenced nonexistent modules |
| Feature flags | None exist | Env flags read once at startup on API (`ACCOUNTS_ENABLED`, `BUSINESS_INTAKE_ENABLED`, `BUSINESS_PUBLICATION_ENABLED`) and `VITE_*` mirrors on web; `requireFlag` returns 404 | Smallest mechanism; 404 is non-disclosing |
| Routes | Plan proposed `/account/register`, `/business/*`, `/review/*` | Use Dutch slugs consistent with `/bedrijf-*`, `/mijn-bedrijf`, `/redactie/*`; `/sign-in`, `/sign-up` stay as Clerk routes | Matches current localisation convention |
| Owner edits publish instantly today | `PATCH /business-profiles/:id` writes public columns | When publication flag is on, PATCH writes a draft revision; when off, behaviour unchanged | Backward compatible until Gate D |
| Claim states | `pending/approved/rejected` + partial unique on pending | Add `changes_requested`, `disputed`, `withdrawn`; extend partial index to `status IN ('pending','changes_requested','disputed')` | Keeps one-open-claim invariant |
| Migrations | Only `drizzle-kit push` | Rehearse pushes on isolated DB, review SQL, document defaults; add follow-up to adopt migration files if the owner wants | No new tooling in this feature |
| Message delivery | Nothing exists | Outbox table and injected `deliverMessage` loader; default loader logs `provider_not_configured` once and leaves rows `queued` | Provider is gate Q5; state must not lie |
| Error shape | Existing `{ error }` string everywhere | New operations use `ApiError`; existing keep string; web shows `messageKey` translations | Compatibility with generated client consumers |
| Test framework | Node test runner + Playwright already used | Reuse; inject `resolveUserId`/loaders like `createRegistrationRouter` | Memory: provider-integration-tests |
| Rate limiting for lookup | No limiter in API today | Small in-memory per-user token bucket in `business-intake.ts`; document that multi-instance deployments need a shared store | Bounded scope, visible limitation |

## Implementation phases

Phase numbering maps to the downstream project tasks already queued
(identity foundation → consumer journey → business intake → review and
publication → lifecycle controls → convergence).

### Phase 1 — Setup

- [ ] Add `ApiError`, flag, and `/account/me` contracts to `openapi.yaml`; run codegen.
- [ ] Add `featureFlags.ts`, `requireFlag.ts`, `apiError.ts` with unit tests.
- [ ] Record baseline evidence: current route matrix, existing tests green.

### Phase 2 — Foundation (US1)

- [ ] `accounts.ts` schema (`app_users`, `consumer_preferences`, `account_consent_events`) and export.
- [ ] `requireAppUser.ts` idempotent provisioning; `permissions.ts`.
- [ ] `routes/account.ts` `GET /account/me`, `GET /account/options`; tests for 401, 404-when-disabled, race-safe provisioning, unknown-field rejection.
- [ ] Web `featureFlags.ts`; `AccountPage` shows capability summary when flag on.

### Phase 3 — User Story 2 (P2) consumer preferences

- [ ] Contracts and codegen for preferences, onboarding completion, consents.
- [ ] Handlers with version checks and controlled-ID validation.
- [ ] `AccountPreferencesPage.tsx`, `returnPath.ts` allowlist, i18n keys.
- [ ] Route tests + `account-preferences.spec.ts`.

### Phase 4 — User Story 3 (P3) business intake

- [ ] Schema extension for claims and draft businesses; isolated push rehearsal.
- [ ] Contracts and codegen for lookup, draft creation, claim update/submit/withdraw.
- [ ] `business-intake.ts` with rate limit, public-only serialisation, transactional draft+claim.
- [ ] `BusinessLookupPage.tsx`, `BusinessDraftPage.tsx`; `MyBusinessWorkspace` status and next action.
- [ ] Route tests for cross-user isolation and draft privacy + `business-intake.spec.ts`.

### Phase 5 — User Story 4 (P4) review and publication

- [ ] `businessReview.ts` schema (revisions, reviews, fact checks); backfill revision 1; publication status defaults.
- [ ] Contracts and codegen for revision read/write/submit, review queues, decisions, publication.
- [ ] `business-review.ts`, revision-aware public serialisation in `businesses.ts`, self-review refusal.
- [ ] `BusinessRevisionPage.tsx`, `BusinessReviewDetailView.tsx`, `BusinessModerationView` queue tabs.
- [ ] Route tests for stale decision 409, self-review 403, public field allowlist + `business-review.spec.ts`.

### Phase 6 — User Story 5 (P5) lifecycle

- [ ] `lifecycle.ts` schema (outbox, account requests); outbox writer with injected loader.
- [ ] Contracts and codegen for consents list, deletion requests, request status.
- [ ] `account-lifecycle.ts` with sole-owner blocker check; `AccountPrivacyPage.tsx`.
- [ ] Tests: same-transaction outbox commit, retry/backoff without duplication, blocked deletion.

### Phase 7 — Convergence

- [ ] Compare implementation with spec and acceptance scenarios.
- [ ] Verify constitution gates; record deviations.
- [ ] Record gate Q1–Q8 approvals or leave flags off; update `convergence.md`.

## Risks and rollback

- **Risk**: a schema push with wrong defaults unpublishes businesses —
  **Mitigation**: defaults `published`/approved revision 1, rehearsal on
  isolated DB, backup before production push.
- **Risk**: owners confused by review of edits — **Mitigation**: flag off
  until Gate D; side-by-side live/under-review status.
- **Risk**: lookup exposes contact data — **Mitigation**: explicit public
  serialiser with allowlisted fields and a test asserting absent fields.
- **Risk**: lifecycle promises without delivery — **Mitigation**: UI wording
  limited to queued/accepted/failed; provider gate.
- **Risk**: in-memory rate limiter ineffective across instances —
  **Mitigation**: documented; bounded result size is the second line.
- **Rollback**: set flags off (new endpoints 404, UI hidden); keep all
  tables and rows; re-point approved revision if needed; never drop tables
  or erase claims, requests, or consent events.

## Verification plan

```text
# contracts
pnpm --filter @workspace/api-spec run codegen
git diff --exit-code lib/api-client-react lib/api-zod   # regenerated output committed

# static
pnpm run typecheck

# API route tests (per phase, add files as created)
pnpm --filter @workspace/api-server exec tsx --test \
  src/routes/registration.test.ts \
  src/routes/account.test.ts \
  src/routes/business-intake.test.ts \
  src/routes/business-review.test.ts \
  src/routes/account-lifecycle.test.ts

# schema rehearsal on an isolated database
node lib/db/scripts/run-isolated-database-integration.mjs -- pnpm --filter @workspace/db run push

# browser journeys (existing regression + new)
PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(command -v chromium) \
  pnpm --filter @workspace/buurtgids exec playwright test \
  e2e/discovery-regression.spec.ts e2e/saved-events-sync.spec.ts \
  e2e/account-preferences.spec.ts e2e/business-intake.spec.ts e2e/business-review.spec.ts

# manual per changed screen
- keyboard-only completion, screen-reader labels, error focus
- NL/EN parity and form state retained on language switch
- mobile viewport, reduced motion
- flag off: new routes show unavailable state; existing routes unchanged
```
