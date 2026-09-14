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
| US4 review and publication | Implemented 2026-09-14 behind `businessPublication` (`BUSINESS_PUBLICATION_ENABLED` / `VITE_BUSINESS_PUBLICATION_ENABLED`; enabled in development only — not gate approval). No schema change (the foundation tables were already pushed; `business_profiles.category` push was re-applied to dev). Existing published/unpublished/suspended profiles are migrated into an approved revision v1 by an idempotent startup backfill (`lib/businessRevisionBackfill.ts`, also `pnpm --filter @workspace/api-server run backfill:business-revisions`), recorded with a system actor and audit row; private intake drafts are not migrated. Reviewer exclusion covers creator, member, author, claimant and anyone with an active claim; claim creation, owner save/submit/discard, and every review decision (claim, revision, publication) lock the profile row first (then the latest revision) and re-check under it; save/submit/discard updates are conditional on revision id + version + `draft` status and treat zero affected rows as a conflict, so a submitted revision can never be rewritten. Every dimension (claim, revision, publication decisions and queue hints) also excludes the author of the currently approved snapshot even after membership removal. Claimant PATCH/submit/withdraw use an unlocked preflight to find the profile, then lock profile → claim, matching the reviewer decision order so withdrawal vs. review cannot deadlock. Listing-derived profiles created while the flag is on start as `draft`, so ownership approval and editorial approval never make them public — only an explicit publish decision does. With the flag off the public route serves the legacy columns unconditionally (snapshot kept for re-enablement). Four dimensions stay independent: ownership (claims/members), editorial approval (`business_profile_revisions.status` + `business_profiles.approved_revision_id`), publication (`publication_status`), freshness (`business_fact_checks`, stale after 180 days, `unverified` until a confirmed check exists). API (`routes/business-publication.ts`, per-route flag + `requireAppUser`): owners `GET/PATCH /business-profiles/{id}/revision` (member-only else 404; owner role else 403; a `draft` is edited in place, any other latest state creates version n+1 seeded from the latest content or the legacy columns; `expectedVersion` → 409 `VERSION_CONFLICT`; URLs must be http(s), control characters stripped, English never invented), `POST …/submit` (draft → `submitted`, immutable afterwards; empty drafts → 400), `POST …/discard`; reviewers (`identity.isEditor` else 403) `GET /review/claims|revisions|businesses` (cursor `PageInfo`, allowlisted profile summary, no e-mail/claimant/author ids, `canDecide` false for creator/member/author), `POST /review/claims/{id}/decision` (shared `applyClaimDecision`: version-bound, self-review re-checked in the transaction, one owner membership, competing claims rejected, audit row), `POST /review/revisions/{id}/decision` (exact `expectedVersion` and newest-version check under `FOR UPDATE`; approve moves `approved_revision_id`, supersedes the previous approved row, inserts fact checks + `business_reviews` row; never publishes), `POST /review/businesses/{id}/publication` (`publish|unpublish|suspend` with `expectedRevisionVersion` = approved snapshot version, reason required except publish, transition table enforced, publish refused without an approved snapshot, audit row targetType `publication`). Public `GET /business-profiles/public/{slug}` serialises only the approved snapshot (contradicted fields withheld, `content` + `provenance` with source/approved version/freshness/checks without reviewer notes or ids); with the flag on a profile without a snapshot is 404 (logged) rather than falling back to mutable columns. Legacy owner `PATCH /business-profiles/{id}` writes a draft revision when the flag is on (name changes refused). Web: `/mijn-bedrijf/:id/profiel` bilingual editor + status dashboard (unknown/draft/submitted/changes_requested/approved/published/stale/suspended/unpublished, reviewer note, fact checks, freshness, resumable draft, locked while submitted/suspended), workspace edit button routes there when the flag is on; `/redactie/bedrijven` gains Eigenaarschap/Profielen/Publicatie tabs (NL/EN, paginated, self-review shown as blocked, decisions confirm the exact version, 409 refreshes the queue); `/bedrijf/:slug` renders localised approved content (EN falls back per field to NL) plus a provenance/verification section. | `pnpm --filter @workspace/api-server run test:business-publication` → 25 pass (flag-off 404 on every route; a profile at the legacy contract limits (2400-char description, 600-char hours, 50-char phone, long URL/email) backfills, serves publicly, opens in the owner workspace and seeds a draft unchanged, while new owner input stays at the stricter input limits — stored/response revision schemas carry no length limits, only `BusinessRevision*Input` does; departed approved-snapshot author gets `canDecide=false` and 403 in the editorial and authority queues; self-reported claim withdrawal racing a reviewer approval on a held profile lock: both wait, exactly one wins (200/409) and the claim, membership and profile state agree; save/discard racing a submit on a held profile lock all wait, submit wins, save and discard get 409 and the submitted content is untouched; the approved snapshot's author with editor rights but no membership sees `canDecide=false` and gets 403 on suspend while another reviewer succeeds; post-rollout claim → ownership approval → revision approval keeps the public page 404 until publish, with a single `publish` audit row; flag rollback after backfill serves edited columns with `content: null` and re-enabling serves the snapshot; claim creation and claim decisions block on a held profile row lock and complete normally after release; claimant-editor on a listing-derived business gets `canDecide=false` and 403 on revision decision and publication until the claim is withdrawn; backfill creates exactly one approved v1 per column-only profile, is a no-op on re-run, leaves profiles with a snapshot untouched, and migrated profiles can be suspended → republished → unpublished from v1; stranger 404 / unverified 403 / unknown fields 400 / `javascript:` URL 400; draft seeded from columns then edited in place; draft invisible publicly; submitted revision immutable and queued without author identity; authority queue paginates by cursor without e-mail, claimant-editor `canDecide=false` and 403 on decision; reason required, stale 409, request_changes → approve grants exactly one owner with audit rows; owner-editor self-approval 403, stale/decided versions 409, bad fact-check URL 400; changes requested → v2 resubmitted → approved with fact checks, second approval 409; public page serves the snapshot with contradicted website withheld, provenance without reviewer notes/ids, no legacy text; newer draft and rejected v3 leave the published snapshot untouched, legacy PATCH lands in a draft, discard drops it; owner self-suspend 403, suspend → public 404 and owner `suspended` with reason, publish restores exactly v2, unpublish → 404, invalid transition 409, audit `suspend,publish,unpublish`; publish without snapshot 409; freshness `stale` after 180 days on a backfilled profile; empty draft cannot be submitted). `test:business-intake` → 14 pass unchanged. `playwright test e2e/business-review.spec.ts` → 3 pass (owner editor prefilled from profile columns, draft → private (v1 snapshot still public) → resume → submit locks → changes requested with note → v2 → approve → public snapshot with provenance, English per-field fallback; stale save shows conflict and keeps server content; suspended business locked for owner and hidden publicly). `tsc --noEmit` clean for api-server and buurtgids. Gate T042/Q4 (editorial policy owner, reviewer roster) remains open. |
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
