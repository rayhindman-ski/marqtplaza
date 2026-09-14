# Convergence: Consumer accounts and business onboarding

**Date**: 2026-09-14  
**Status**: Specified — no implementation started

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

Current state per environment: development off, production off (nothing
implemented yet).

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
| US2 preferences | — | — |
| US3 intake | — | — |
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
