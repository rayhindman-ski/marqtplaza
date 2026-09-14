# Convergence: Consumer accounts and business onboarding

**Date**: 2026-09-14  
**Status**: In progress — US1 foundation and US2 consumer preferences implemented; all release gates still open, production flags off

This record is created with the specification so that release gates, flag
state, and baseline evidence are tracked from the first day. Update it at the
end of every phase in `tasks.md`.

## Source and reconciliation

- Source plan archived verbatim at `doc/md/version-v.03.md` (MarqtPlaza,
  11 September 2026, "proposed implementation plan; documentation only").
  It remains a proposal and is not an implementation or release approval.
- Reconciliation with the current repository is recorded in `spec.md`
  ("Context → Problem" table). Summary of obsolete assumptions:
  - artifact/base path/route names (`marqtplaza-weekend-guide`,
    `/weekend-guide/`, `/account/register`, `/business/*`, `/review/*`);
  - authentication as an open decision (Clerk is approved and wired);
  - campaign module, campaign tokens, and campaign email as existing code
    (none exist here);
  - absence of business/registration tables and APIs (they exist);
  - reviewed migration files (only `drizzle-kit push` exists).
- Still-valid policy input from the archived plan: MVP boundaries and
  deferrals (§4), privacy/accessibility rules (§9), enhancement dependency
  mapping (§10), release gates and rollout order (§13), decision register
  (§14).

## Existing behaviour frozen as the baseline

| Surface | Must keep working | Evidence to re-run |
| --- | --- | --- |
| Anonymous discovery | `/`, `/activiteiten/den-haag`, `/nieuws`, `/deals`, `/buurt`, `/bronnen`, `/bedrijf/:slug` without sign-in | `e2e/discovery-regression.spec.ts` |
| Research registration | `GET/PUT /api/registration`, `OnboardingPage`, `AccountPage` | `src/routes/registration.test.ts` |
| Business claims | `POST /api/business-claims` resolves the current listing; one pending claim per profile; approval grants owner atomically and rejects competitors | new `business-intake.test.ts` must include the existing scenarios |
| Owner workspace | `/mijn-bedrijf` profile and deal editing; deal moderation | manual + route tests |
| Reviewer access | Clerk session-claim role `admin`/`editor` via `requireEditor` and `useEditorAccess` | existing review route guards |
| Saved events, community | untouched | `saved-events.test.ts`, `e2e/saved-events-sync.spec.ts` |

## Rollout flags

| Flag (API / web mirror) | Default | Enables | Gate |
| --- | --- | --- | --- |
| `ACCOUNTS_ENABLED` / `VITE_ACCOUNTS_ENABLED` | off | `/api/account/*`, `/account/voorkeuren`, `/account/privacy` | Q1, Q6, Q7 recorded below |
| `BUSINESS_INTAKE_ENABLED` / `VITE_BUSINESS_INTAKE_ENABLED` | off | lookup, new drafts, claim lifecycle actions | Q2, Q3 |
| `BUSINESS_PUBLICATION_ENABLED` / `VITE_BUSINESS_PUBLICATION_ENABLED` | off | revision review, explicit publication, owner edits become drafts | Q4 |
| Lifecycle dispatch (provider loader configured) | not configured | real message sending | Q5, Q6, Q8 |

Current state per environment (2026-09-14): `ACCOUNTS_ENABLED` /
`VITE_ACCOUNTS_ENABLED` are **on in development only** so the consumer journey
can be previewed and verified against the real API; production stays off until
Q1, Q6, and Q7 are recorded. Business intake, publication, and lifecycle
dispatch remain off everywhere.

## Release gates (approvals required; no defaults invented)

| ID | Decision | Approver | Status | Recorded on |
| --- | --- | --- | --- | --- |
| Q1 | Controlled neighbourhood and interest taxonomy | Owner | Open | — |
| Q2 | Business authority evidence policy; whether registration numbers are ever required | Owner + reviewer | Open | — |
| Q3 | Named reviewer(s) and support owner; user-facing response expectations | Operator | Open | — |
| Q4 | Minimum public profile fields and NL/EN parity rule | Editorial owner | Open | — |
| Q5 | Message delivery provider, sender identity, test inbox | Operator | Open | — |
| Q6 | Lawful basis wording, notice versions, retention periods, deletion exceptions | Owner + legal | Open | — |
| Q7 | Research registration mandatory at first sign-up, or optional once preferences exist | Owner | Open | — |
| Q8 | Handling of research registration data on account deletion | Owner + legal | Open | — |

Closed decisions (technical, recorded in `plan.md`): Clerk as identity
provider; additive `app_users` keyed by Clerk subject; reviewer role from
session claims; Dutch-slug routes; env-based flags returning 404; claim
`pending` kept as the open-claim alias; existing profiles backfilled as
approved revision 1 and `published`; outbox before provider; Node test
runner + Playwright.

## Release blockers known today

1. No message delivery provider or module exists (blocks US5 rollout, not
   its implementation behind the outbox).
2. No migration tooling beyond `drizzle-kit push`; every schema change needs
   an isolated-database rehearsal and a production backup.
3. ~~No feature-flag mechanism exists; it is the first implementation task.~~
   Done 2026-09-14: `ACCOUNTS_ENABLED`, `BUSINESS_INTAKE_ENABLED`,
   `BUSINESS_PUBLICATION_ENABLED` (server) and `VITE_*` mirrors (web), all
   default off; `GET /api/readiness` reports them; gated routes answer 404
   `FEATURE_DISABLED`.
4. Reviewer, support owner, legal wording, and retention periods are
   unassigned (Q3, Q6).

## Acceptance evidence

| Scenario | Implementation evidence | Verification |
| --- | --- | --- |
| US1 identity and capabilities | Foundation landed 2026-09-14: additive `app_users`/`consumer_preferences`/`account_consent_events`, `business_profile_revisions`/`business_reviews`/`business_fact_checks`, `lifecycle_outbox`/`account_requests`; additive columns on `business_profiles` (`publication_status` default `published`, `approved_revision_id`, `created_by_user_id`) and `business_claims` (`authority_declaration`, `evidence_reference`, `version`, `withdrawn_at`); open-claim partial unique index renamed to `business_claims_one_open_claim_per_profile_unique` covering `pending, submitted, changes_requested, disputed`. Server: `lib/featureFlags.ts`, `lib/apiError.ts`, `lib/permissions.ts` (Clerk-derived identity, editor role, capabilities, self-review guard), `middlewares/requireFlag.ts`, `middlewares/requireAppUser.ts` (INSERT … ON CONFLICT DO NOTHING + read), `routes/account.ts` (`GET /account/me`, `GET /account/options`), `GET /readiness`. Contract: `ApiError`, `FeatureReadiness`, `AccountMe`, `AccountCapabilities`, `ConsumerPreferences`, `ConsentEvent`, `AccountOptions`, `PublicationStatus`, `BusinessRevisionStatus`/`BusinessRevisionSummary`, `ReviewDecisionRecord`, `AccountRequest`, `LifecycleMessageStatus`, `PageInfo`, `Idempotency-Key`/cursor parameters, `VersionConflict` response; `ClaimStatus` extended additively. No UI, no backfill, flags off. | `pnpm --filter @workspace/api-server run test:account-foundation` → 18 pass, 0 fail (provisioning idempotent under 8 concurrent first calls; 401/403/404 error shape; forged `role` query rejected as `UNKNOWN_FIELD`; suspended account refused; registration kept separate; editor/business-member roles server-derived). `pnpm run typecheck` clean. Live dev server: `/api/readiness` → all false, `/api/account/me` → 404 `FEATURE_DISABLED`. |
| US2 preferences | Implemented 2026-09-14: `PATCH /account/preferences` (expectedRevision, controlled-ID validation → 400 `VALIDATION_FAILED` with `not_in_controlled_list`, 409 `VERSION_CONFLICT` with `expectedVersion`, omitted fields unchanged / empty arrays clear, locale on `app_users`), `POST /account/onboarding/complete` (idempotent, skip creates no preference row), `GET`/`POST /account/consents` (append-only ledger, purposes `marketing_updates` and `research_contact`, client must echo the current notice version `draft-2026-09`, `support`/`system` sources rejected from clients, writes require a verified identity). Web: `/account/voorkeuren` (checkbox groups from `/account/options`, save/skip/cancel, draft kept in session storage across refresh, conflict keeps draft and reloads revision, error summary receives focus, NL/EN switch keeps the draft), `AccountPage` with preference summary, per-purpose consent controls, explicit account / research registration / saved data / consent scopes, `returnPath.ts` allowlist (`terug`), Clerk sign-in/sign-up redirects derive from the sanitised return path, `OnboardingPage` marker mirrors server state and points to the separate preference step. Account creation still writes no registration, subscription, or consent. | `pnpm --filter @workspace/api-server run test:account-foundation` → 24 pass, 0 fail (incl. six concurrent revision-0 writers → one 200, five 409; consent `current` derived from the newest row beyond a 200-entry history page). `tsx --test src/lib/returnPath.test.ts` → 5 pass. `playwright test` → 20 pass (8 new in `e2e/account-preferences.spec.ts`: anonymous discovery prompt-free, signed-out redirect with safe `terug`, save + language switch + refresh + resume, skip with external URL rejected, stale revision conflict, failed save keeps input and focuses the error, account page scopes and consent recording, disabled gate state; discovery and saved-events regressions unchanged). `pnpm run typecheck` clean. Live dev: `/api/readiness` → accounts true, unauthenticated `PATCH /api/account/preferences` → 401 `AUTH_REQUIRED`. Gates: Q1 taxonomy still `provisional-2026-09`; Q6 consent notice is a draft version; Q7 unresolved — the research registration remains a separate, voluntary step and sign-up lands on the optional preference step only while the flag is on. |
| US3 intake | Implemented 2026-09-14 behind `businessIntake` (`BUSINESS_INTAKE_ENABLED` / `VITE_BUSINESS_INTAKE_ENABLED`; enabled in development only — not gate approval). Schema (additive): `business_claims.idempotency_key` + `(claimant_id, idempotency_key)` partial unique index, one-draft-per-claimant-per-business partial unique index, `draft` claim status (private, holds no open slot), `business_profiles.category`, `self_reported` listing source. API: `GET /businesses/lookup` (verified-account-only via `requireVerified`, allowlisted public fields, 8-result cap with `truncated`, per-account 30/min → 429, loader failure → 503), `POST /businesses` (existing listing re-resolved server-side and browser facts rejected as `UNKNOWN_FIELD`; new business creates a `draft` profile that is never public; `Idempotency-Key` replay → 200, same key different body → 409), `GET`/`PATCH /business-claims/{id}` (owner-only, otherwise 404; `expectedVersion` → 409 `VERSION_CONFLICT`; facts editable only for self-reported drafts), `POST …/submit` (new-business drafts are re-checked against public listings and published profiles first: candidates → 409 `DUPLICATE_CANDIDATES` with the public matches until the representative claims one instead or confirms with `confirmNoDuplicate`; then → `submitted`, or `disputed` when the business already has an owner; another open claim → 409), `POST …/withdraw` (archives a self-reported draft profile). Legacy `routes/businesses.ts` now shares serialisers, excludes non-published profiles from `/business-profiles/public/:slug` and `/deals`, and its moderation decision accepts `approve`/`reject`/`request_changes` on `pending|submitted|disputed`, refuses self-review, refuses approval when another owner exists (no dual ownership), creates exactly one owner membership + `business_reviews` audit row + rejects competing open claims in one transaction. Web: `/bedrijf-zoeken` (lookup), `/bedrijf-nieuw` (claim/new draft, resume via `?claim=<id>`, receipt, withdraw, changes-requested edit + resubmit), `MyBusinessWorkspace` status/reason/next action/withdraw, onboarding CTA and map claim link route to the lookup when the flag is on; moderation view gained "request changes" and shows the private declaration/evidence to editors only. Legacy `/bedrijf-claim` + `POST /business-claims` unchanged when the flag is off. | `pnpm --filter @workspace/api-server run test:business-intake` → 14 pass (profile-kind lookup matches resolve from the trusted published profile row — aged-out Google and published self-reported profiles both claimable; an editor who is a member of the business gets 403 on every claim decision, re-checked inside the transaction; claim decisions are bound to the reviewed `expectedVersion` — missing → 400, stale → 409 and no ownership; `business_reviews.targetVersion` records the reviewed version; the raw Idempotency-Key is stored exactly (unique per claimant) with the payload sha256 in a separate column: concurrent same-key/same-payload requests replay the winner (200), concurrent same-key/different-payload requests leave exactly one claim and 409 for the rest, and `key:other` is a distinct key; production lookup+resolver chain claims a stored `google_maps` listing from `external-results` without a live provider call, unknown identity stays 400; flag-off 404 without shadowing moderation; 401/403 unverified/400/`UNKNOWN_FIELD` on lookup; duplicate re-check at new-business submission blocks with public candidates, leaves the draft untouched, submits after explicit confirmation, skips when no candidates, 503 when the check fails; deal moderation refuses `request_changes`; public-only lookup fields; 503; 429 burst; unverified 403; mass assignment; idempotent replay/conflict; cross-user 404; stale version 409; fact redefinition refused; submit blocks a second open claim; withdraw frees the slot; request_changes → edit → resubmit → approve creates one owner + audit rows; later claim becomes `disputed`, approval refused 409, rejection reason visible without competing evidence; new-business draft invisible via public profile and lookup, archived on withdraw). `test:account-foundation` → 14 pass unchanged. `playwright test` → 24 pass (`src/lib/claimPresentation.test.ts` proves every persisted claim status renders its own truthful label with gated actions hidden when the intake flag is rolled back; 4 new in `e2e/business-intake.spec.ts`: lookup → identity-only claim → refresh resumes → submit receipt → withdraw; private new-business draft with duplicate-candidate panel → cancel keeps draft → confirm submits; anonymous claim URL redirects before any fetch; keyboard-only lookup). `pnpm run typecheck` clean. Live dev: `/api/readiness` → businessIntake true, anonymous `/api/businesses/lookup` → 401. Gate T032 (Q2/Q3 evidence policy, reviewer and support owner) remains open. |
| US4 review and publication | — | — |
| US5 lifecycle | — | — |

## Verification commands

See `plan.md` → Verification plan.

Baseline (2026-09-14, before the foundation change): `pnpm run typecheck`
clean; `tsx --test src/routes/registration.test.ts` 2 pass.

Schema push rehearsal (2026-09-14): development schema cloned with
`pg_dump --schema-only` into the disposable database
`buurtplaza_schema_rehearsal`; `drizzle-kit push --verbose` against it produced
only `CREATE TABLE` (8 new tables), `ADD COLUMN` (7 nullable or defaulted
columns), `DROP INDEX business_claims_one_pending_per_profile_unique` +
`CREATE UNIQUE INDEX business_claims_one_open_claim_per_profile_unique`, new
FKs and indexes. No `DROP TABLE`, no `DROP COLUMN`, no type change. A second
push reported "No changes detected" (idempotent). The same push was then
applied to the development database. Two lessons for the next schema change:
drizzle-kit push does not detect a changed `WHERE` clause on an existing
partial index (rename the index instead), and FK names longer than 63
characters get truncated by PostgreSQL and are recreated on every push
(name them explicitly with `foreignKey({ name })`).

## Deviations and follow-up

- Deferred, unchanged from the archived plan: billing, booking, team
  invitations, self-service ownership transfer, personalised feeds,
  collaborative lists, route planning, document uploads, automated
  verification/publication, campaign scaling, discovery backlog items #2,
  #3, #6, #7, #8, #10, #12, #15, #16, #17, #20, #21, #22, #23.
- Follow-up candidates outside this feature: adopting migration files
  instead of schema push; shared-store rate limiting for multi-instance
  deployments; automated erasure job after Q6/Q8.
