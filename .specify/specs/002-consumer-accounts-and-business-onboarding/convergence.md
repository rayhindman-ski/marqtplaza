# Convergence: Consumer accounts and business onboarding

**Date**: 2026-09-14  
**Status**: Release candidate, verification incomplete (2026-09-14) — US1–US5 implemented behind flags with automated evidence recorded below; the manual keyboard-only / screen-reader pass (T050) is still owed; every release gate Q1–Q8 still open; production flags off. No wider rollout until T050 is recorded and the gate table below records approvers.

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

Current state per environment (2026-09-14, release-candidate review):
`ACCOUNTS_ENABLED`, `BUSINESS_INTAKE_ENABLED`, and
`BUSINESS_PUBLICATION_ENABLED` (plus their `VITE_*` mirrors) are **on in
development only** so every journey can be previewed against the real API.
**Production: all three off; `LIFECYCLE_DELIVERY_PROVIDER` unset everywhere.**
A development flag is a preview convenience and is never gate evidence; only a
row in the gate table with an approver and date allows a production flag.
Operator documentation: `doc/md/onboarding-release.md`.

Decision 2026-09-14: the legacy owner editor (workspace inline dialog and the
column-writing branch of `PATCH /api/business-profiles/:id`) and the
`businessPublication` flag branches are **kept** until Q4 is recorded and the
production flag has survived one release cycle. While the flag is on the
legacy PATCH only produces draft revisions and the inline dialog is not
rendered, so no owner input bypasses review; the removal steps are written
down in `doc/md/business-publication-flag-removal.md` and are not to be run
before that gate.

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
5. Account erasure is intentionally not implemented; deletion requests are
   tracked and decided but no data is erased until Q6/Q8 record retention
   periods and exceptions.
6. The real Clerk development-session pass for the authenticated
   preferences → account journey is recorded below. The sign-up submission
   and e-mail-verification portions remain open: headless Chromium did not
   complete Clerk's bot-protection challenge, so no verification message
   reached the disposable inbox; the expired-link case was therefore not
   exercised. A real verification pass is still owed before the first
   production flag is turned on.
7. Keyboard-only and screen-reader completion of the new screens (T050,
   FR-017) has not been performed; automated focus/aria/reduced-motion checks
   do not replace it.
8. ~~The full browser suite is not yet stable: one pre-existing homepage map
   zoom test failed once in two full runs (passed on rerun and in isolation).~~
   Resolved 2026-09-15: the test now waits for the map camera to settle
   (network idle + zoom stable across two animation frames) before applying the
   user zoom, and reads the zoom after flushing frames instead of a fixed
   300 ms sleep. Verified 5/5 isolated repeats and 16/16 for the full
   `discovery-regression.spec.ts` file (`--repeat-each 2`) with three
   CPU-burning background processes to simulate full-run contention.

## Acceptance evidence

| Scenario | Implementation evidence | Verification |
| --- | --- | --- |
| US1 identity and capabilities | Foundation landed 2026-09-14: additive `app_users`/`consumer_preferences`/`account_consent_events`, `business_profile_revisions`/`business_reviews`/`business_fact_checks`, `lifecycle_outbox`/`account_requests`; additive columns on `business_profiles` (`publication_status` default `published`, `approved_revision_id`, `created_by_user_id`) and `business_claims` (`authority_declaration`, `evidence_reference`, `version`, `withdrawn_at`); open-claim partial unique index renamed to `business_claims_one_open_claim_per_profile_unique` covering `pending, submitted, changes_requested, disputed`. Server: `lib/featureFlags.ts`, `lib/apiError.ts`, `lib/permissions.ts` (Clerk-derived identity, editor role, capabilities, self-review guard), `middlewares/requireFlag.ts`, `middlewares/requireAppUser.ts` (INSERT … ON CONFLICT DO NOTHING + read), `routes/account.ts` (`GET /account/me`, `GET /account/options`), `GET /readiness`. Contract: `ApiError`, `FeatureReadiness`, `AccountMe`, `AccountCapabilities`, `ConsumerPreferences`, `ConsentEvent`, `AccountOptions`, `PublicationStatus`, `BusinessRevisionStatus`/`BusinessRevisionSummary`, `ReviewDecisionRecord`, `AccountRequest`, `LifecycleMessageStatus`, `PageInfo`, `Idempotency-Key`/cursor parameters, `VersionConflict` response; `ClaimStatus` extended additively. No UI, no backfill, flags off. | `pnpm --filter @workspace/api-server run test:account-foundation` → 18 pass, 0 fail (provisioning idempotent under 8 concurrent first calls; 401/403/404 error shape; forged `role` query rejected as `UNKNOWN_FIELD`; suspended account refused; registration kept separate; editor/business-member roles server-derived). `pnpm run typecheck` clean. Live dev server: `/api/readiness` → all false, `/api/account/me` → 404 `FEATURE_DISABLED`. |
| US2 preferences | Implemented 2026-09-14: `PATCH /account/preferences` (expectedRevision, controlled-ID validation → 400 `VALIDATION_FAILED` with `not_in_controlled_list`, 409 `VERSION_CONFLICT` with `expectedVersion`, omitted fields unchanged / empty arrays clear, locale on `app_users`), `POST /account/onboarding/complete` (idempotent, skip creates no preference row), `GET`/`POST /account/consents` (append-only ledger, purposes `marketing_updates` and `research_contact`, client must echo the current notice version `draft-2026-09`, `support`/`system` sources rejected from clients, writes require a verified identity). Web: `/account/voorkeuren` (checkbox groups from `/account/options`, save/skip/cancel, draft kept in session storage across refresh, conflict keeps draft and reloads revision, error summary receives focus, NL/EN switch keeps the draft), `AccountPage` with preference summary, per-purpose consent controls, explicit account / research registration / saved data / consent scopes, `returnPath.ts` allowlist (`terug`), Clerk sign-in/sign-up redirects derive from the sanitised return path, `OnboardingPage` marker mirrors server state and points to the separate preference step. Account creation still writes no registration, subscription, or consent. | `pnpm --filter @workspace/api-server run test:account-foundation` → 24 pass, 0 fail (incl. six concurrent revision-0 writers → one 200, five 409; consent `current` derived from the newest row beyond a 200-entry history page). `tsx --test src/lib/returnPath.test.ts` → 5 pass. `playwright test` → 20 pass (8 new in `e2e/account-preferences.spec.ts`: anonymous discovery prompt-free, signed-out redirect with safe `terug`, save + language switch + refresh + resume, skip with external URL rejected, stale revision conflict, failed save keeps input and focuses the error, account page scopes and consent recording, disabled gate state; discovery and saved-events regressions unchanged). `pnpm run typecheck` clean. Live dev: `/api/readiness` → accounts true, unauthenticated `PATCH /api/account/preferences` → 401 `AUTH_REQUIRED`. Live Clerk development-session smoke on 2026-09-14 used a disposable, backend-created and email-verified test identity against the proxied development URL (no production data): sign-in loaded `/account`; `/account/voorkeuren?terug=/deals` loaded real `/api/account/options` and `/api/account/me`, saved two controlled neighbourhoods, refreshed with both selections intact, `/account` displayed the saved names, sign-out returned to discovery, and the signed-out preferences route redirected to `/sign-in?terug=...`. Observed API responses were 200 for options/me/consents, 200 for `PATCH /api/account/preferences`, and 200 for `POST /api/account/onboarding/complete`; no browser errors occurred. The real sign-up attempt loaded the Clerk widget but headless Chromium did not complete its bot-protection challenge, no submit request or verification message was observed in the disposable inbox within 120 seconds, and the expired verification-link case was not executed. Gates: Q1 taxonomy still `provisional-2026-09`; Q6 consent notice is a draft version; Q7 unresolved — the research registration remains a separate, voluntary step and sign-up lands on the optional preference step only while the flag is on. |
| US3 intake | Implemented 2026-09-14 behind `businessIntake` (`BUSINESS_INTAKE_ENABLED` / `VITE_BUSINESS_INTAKE_ENABLED`; enabled in development only — not gate approval). Schema (additive): `business_claims.idempotency_key` + `(claimant_id, idempotency_key)` partial unique index, one-draft-per-claimant-per-business partial unique index, `draft` claim status (private, holds no open slot), `business_profiles.category`, `self_reported` listing source. API: `GET /businesses/lookup` (verified-account-only via `requireVerified`, allowlisted public fields, 8-result cap with `truncated`, per-account 30/min → 429, loader failure → 503), `POST /businesses` (existing listing re-resolved server-side and browser facts rejected as `UNKNOWN_FIELD`; new business creates a `draft` profile that is never public; `Idempotency-Key` replay → 200, same key different body → 409), `GET`/`PATCH /business-claims/{id}` (owner-only, otherwise 404; `expectedVersion` → 409 `VERSION_CONFLICT`; facts editable only for self-reported drafts), `POST …/submit` (new-business drafts are re-checked against public listings and published profiles first: candidates → 409 `DUPLICATE_CANDIDATES` with the public matches until the representative claims one instead or confirms with `confirmNoDuplicate`; then → `submitted`, or `disputed` when the business already has an owner; another open claim → 409), `POST …/withdraw` (archives a self-reported draft profile). Legacy `routes/businesses.ts` now shares serialisers, excludes non-published profiles from `/business-profiles/public/:slug` and `/deals`, and its moderation decision accepts `approve`/`reject`/`request_changes` on `pending|submitted|disputed`, refuses self-review, refuses approval when another owner exists (no dual ownership), creates exactly one owner membership + `business_reviews` audit row + rejects competing open claims in one transaction. Web: `/bedrijf-zoeken` (lookup), `/bedrijf-nieuw` (claim/new draft, resume via `?claim=<id>`, receipt, withdraw, changes-requested edit + resubmit), `MyBusinessWorkspace` status/reason/next action/withdraw, onboarding CTA and map claim link route to the lookup when the flag is on; moderation view gained "request changes" and shows the private declaration/evidence to editors only. Legacy `/bedrijf-claim` + `POST /business-claims` unchanged when the flag is off. | `pnpm --filter @workspace/api-server run test:business-intake` → 14 pass (profile-kind lookup matches resolve from the trusted published profile row — aged-out Google and published self-reported profiles both claimable; an editor who is a member of the business gets 403 on every claim decision, re-checked inside the transaction; claim decisions are bound to the reviewed `expectedVersion` — missing → 400, stale → 409 and no ownership; `business_reviews.targetVersion` records the reviewed version; the raw Idempotency-Key is stored exactly (unique per claimant) with the payload sha256 in a separate column: concurrent same-key/same-payload requests replay the winner (200), concurrent same-key/different-payload requests leave exactly one claim and 409 for the rest, and `key:other` is a distinct key; production lookup+resolver chain claims a stored `google_maps` listing from `external-results` without a live provider call, unknown identity stays 400; flag-off 404 without shadowing moderation; 401/403 unverified/400/`UNKNOWN_FIELD` on lookup; duplicate re-check at new-business submission blocks with public candidates, leaves the draft untouched, submits after explicit confirmation, skips when no candidates, 503 when the check fails; deal moderation refuses `request_changes`; public-only lookup fields; 503; 429 burst; unverified 403; mass assignment; idempotent replay/conflict; cross-user 404; stale version 409; fact redefinition refused; submit blocks a second open claim; withdraw frees the slot; request_changes → edit → resubmit → approve creates one owner + audit rows; later claim becomes `disputed`, approval refused 409, rejection reason visible without competing evidence; new-business draft invisible via public profile and lookup, archived on withdraw). `test:account-foundation` → 14 pass unchanged. `playwright test` → 24 pass (`src/lib/claimPresentation.test.ts` proves every persisted claim status renders its own truthful label with gated actions hidden when the intake flag is rolled back; 4 new in `e2e/business-intake.spec.ts`: lookup → identity-only claim → refresh resumes → submit receipt → withdraw; private new-business draft with duplicate-candidate panel → cancel keeps draft → confirm submits; anonymous claim URL redirects before any fetch; keyboard-only lookup). `pnpm run typecheck` clean. Live dev: `/api/readiness` → businessIntake true, anonymous `/api/businesses/lookup` → 401. Gate T032 (Q2/Q3 evidence policy, reviewer and support owner) remains open. |
| US4 review and publication | Implemented 2026-09-14 behind `businessPublication` (`BUSINESS_PUBLICATION_ENABLED` / `VITE_BUSINESS_PUBLICATION_ENABLED`; enabled in development only — not gate approval). No schema change (the foundation tables were already pushed; `business_profiles.category` push was re-applied to dev). Existing published/unpublished/suspended profiles are migrated into an approved revision v1 by an idempotent startup backfill (`lib/businessRevisionBackfill.ts`, also `pnpm --filter @workspace/api-server run backfill:business-revisions`), recorded with a system actor and audit row; private intake drafts are not migrated. Reviewer exclusion covers creator, member, author, claimant and anyone with an active claim; claim creation, owner save/submit/discard, and every review decision (claim, revision, publication) lock the profile row first (then the latest revision) and re-check under it; save/submit/discard updates are conditional on revision id + version + `draft` status and treat zero affected rows as a conflict, so a submitted revision can never be rewritten. Every dimension (claim, revision, publication decisions and queue hints) also excludes the author of the currently approved snapshot even after membership removal. Claimant PATCH/submit/withdraw use an unlocked preflight to find the profile, then lock profile → claim, matching the reviewer decision order so withdrawal vs. review cannot deadlock. Listing-derived profiles created while the flag is on start as `draft`, so ownership approval and editorial approval never make them public — only an explicit publish decision does. With the flag off the public route serves the legacy columns unconditionally (snapshot kept for re-enablement). Four dimensions stay independent: ownership (claims/members), editorial approval (`business_profile_revisions.status` + `business_profiles.approved_revision_id`), publication (`publication_status`), freshness (`business_fact_checks`, stale after 180 days, `unverified` until a confirmed check exists). API (`routes/business-publication.ts`, per-route flag + `requireAppUser`): owners `GET/PATCH /business-profiles/{id}/revision` (member-only else 404; owner role else 403; a `draft` is edited in place, any other latest state creates version n+1 seeded from the latest content or the legacy columns; `expectedVersion` → 409 `VERSION_CONFLICT`; URLs must be http(s), control characters stripped, English never invented), `POST …/submit` (draft → `submitted`, immutable afterwards; empty drafts → 400), `POST …/discard`; reviewers (`identity.isEditor` else 403) `GET /review/claims|revisions|businesses` (cursor `PageInfo`, allowlisted profile summary, no e-mail/claimant/author ids, `canDecide` false for creator/member/author), `POST /review/claims/{id}/decision` (shared `applyClaimDecision`: version-bound, self-review re-checked in the transaction, one owner membership, competing claims rejected, audit row), `POST /review/revisions/{id}/decision` (exact `expectedVersion` and newest-version check under `FOR UPDATE`; approve moves `approved_revision_id`, supersedes the previous approved row, inserts fact checks + `business_reviews` row; never publishes), `POST /review/businesses/{id}/publication` (`publish|unpublish|suspend` with `expectedRevisionVersion` = approved snapshot version, reason required except publish, transition table enforced, publish refused without an approved snapshot, audit row targetType `publication`). Public `GET /business-profiles/public/{slug}` serialises only the approved snapshot (contradicted fields withheld, `content` + `provenance` with source/approved version/freshness/checks without reviewer notes or ids); with the flag on a profile without a snapshot is 404 (logged) rather than falling back to mutable columns. Legacy owner `PATCH /business-profiles/{id}` writes a draft revision when the flag is on (name changes refused). Web: `/mijn-bedrijf/:id/profiel` bilingual editor + status dashboard (unknown/draft/submitted/changes_requested/approved/published/stale/suspended/unpublished, reviewer note, fact checks, freshness, resumable draft, locked while submitted/suspended), workspace edit button routes there when the flag is on; `/redactie/bedrijven` gains Eigenaarschap/Profielen/Publicatie tabs (NL/EN, paginated, self-review shown as blocked, decisions confirm the exact version, 409 refreshes the queue); `/bedrijf/:slug` renders localised approved content (EN falls back per field to NL) plus a provenance/verification section. | `pnpm --filter @workspace/api-server run test:business-publication` → 25 pass (flag-off 404 on every route; a profile at the legacy contract limits (2400-char description, 600-char hours, 50-char phone, long URL/email) backfills, serves publicly, opens in the owner workspace and seeds a draft unchanged, while new owner input stays at the stricter input limits — stored/response revision schemas carry no length limits, only `BusinessRevision*Input` does; departed approved-snapshot author gets `canDecide=false` and 403 in the editorial and authority queues; self-reported claim withdrawal racing a reviewer approval on a held profile lock: both wait, exactly one wins (200/409) and the claim, membership and profile state agree; save/discard racing a submit on a held profile lock all wait, submit wins, save and discard get 409 and the submitted content is untouched; the approved snapshot's author with editor rights but no membership sees `canDecide=false` and gets 403 on suspend while another reviewer succeeds; post-rollout claim → ownership approval → revision approval keeps the public page 404 until publish, with a single `publish` audit row; flag rollback after backfill serves edited columns with `content: null` and re-enabling serves the snapshot; claim creation and claim decisions block on a held profile row lock and complete normally after release; claimant-editor on a listing-derived business gets `canDecide=false` and 403 on revision decision and publication until the claim is withdrawn; backfill creates exactly one approved v1 per column-only profile, is a no-op on re-run, leaves profiles with a snapshot untouched, and migrated profiles can be suspended → republished → unpublished from v1; stranger 404 / unverified 403 / unknown fields 400 / `javascript:` URL 400; draft seeded from columns then edited in place; draft invisible publicly; submitted revision immutable and queued without author identity; authority queue paginates by cursor without e-mail, claimant-editor `canDecide=false` and 403 on decision; reason required, stale 409, request_changes → approve grants exactly one owner with audit rows; owner-editor self-approval 403, stale/decided versions 409, bad fact-check URL 400; changes requested → v2 resubmitted → approved with fact checks, second approval 409; public page serves the snapshot with contradicted website withheld, provenance without reviewer notes/ids, no legacy text; newer draft and rejected v3 leave the published snapshot untouched, legacy PATCH lands in a draft, discard drops it; owner self-suspend 403, suspend → public 404 and owner `suspended` with reason, publish restores exactly v2, unpublish → 404, invalid transition 409, audit `suspend,publish,unpublish`; publish without snapshot 409; freshness `stale` after 180 days on a backfilled profile; empty draft cannot be submitted). `test:business-intake` → 14 pass unchanged. `playwright test e2e/business-review.spec.ts` → 3 pass (owner editor prefilled from profile columns, draft → private (v1 snapshot still public) → resume → submit locks → changes requested with note → v2 → approve → public snapshot with provenance, English per-field fallback; stale save shows conflict and keeps server content; suspended business locked for owner and hidden publicly). `tsc --noEmit` clean for api-server and buurtgids. Gate T042/Q4 (editorial policy owner, reviewer roster) remains open. |
| US4 freshness re-check window | Added 2026-09-14: `BusinessFreshness` gains derived `staleOn` (checkedOn + 180 days, never stored), `daysUntilStale`, `recheckWindowDays` (30) and `recheckDue` (true only while `fresh` and within the window; always false when unverified or already stale). Owner workspace `/mijn-bedrijf/:id/profiel` shows a re-check notice with the expiry date; the reviewer publication queue (`GET /review/businesses`) shows a `Hercontrole nodig · verloopt op …` badge per item. `state` is unchanged — freshness stays independent from publication status. | `pnpm --filter @workspace/api-server run test:business-publication` against disposable database `task49_pub` (schema pushed via `db push`, flags as the test harness sets them) → 26 pass, 0 fail (new: fresh confirmation not due at day 0, due at day 159 with `daysUntilStale` 21 while `state` stays `unpublished`, same flag in the reviewer queue, unverified items keep `staleOn`/`daysUntilStale` null, stale after 180 days has `recheckDue` false). `playwright test e2e/business-review.spec.ts e2e/business-moderation.spec.ts` → 10 pass (new: owner notice appears at 7 days and disappears for a far-off expiry; queue badge only on the soon-stale item). `pnpm run typecheck` clean after client regeneration. |
| US5 lifecycle | Implemented 2026-09-14: `lifecycle_outbox` rows are enqueued inside the same transaction as the state change (legacy claim submission, new-claim decisions, revision and publication transitions, deletion requests) with dedupe on idempotency key; the dispatcher takes an injected loader, records every attempt monotonically, retries transient failures with backoff, fails permanently when the budget is exhausted, cancels messages whose recipient row is gone, and never delivers one row twice across concurrent dispatchers. No provider is configured: rows stay `queued` and consume no attempts; `LIFECYCLE_DELIVERY_PROVIDER=log` is a development-only loader refused in production. `POST /account/deletion-requests` requires the accounts flag, a verified identity, and every scope acknowledgement; sole owners get `blocked_ownership` and an audited support decision path (`/api/review/account-requests`) that never deletes claims, memberships, or audit rows; `/api/review/lifecycle-messages` lists failed rows and allows resend. Web: `/account/privacy` shows consent withdrawal, deletion scope explanation, request status, and message status limited to queued/accepted/failed. Actual erasure is not implemented (gate Q6/Q8). | `pnpm --filter @workspace/api-server run test:account-lifecycle` → 16 pass on the isolated `buurtplaza_release_rehearsal` database (payload allowlist rejects contact data, tokens, and reviewer details; dedupe + recipient provisioning in one transaction; rollback with the parent state change; queued-without-attempts when unconfigured; recipient-gone cancellation; backoff, attempt records, exhaustion → `failed`; receipts idempotent; concurrent dispatchers deliver once; recipient status view without payload/address/error; claimant messages without reviewer notes; deletion request gate + acknowledgements; request filed/tracked/withdrawn with messages committed alongside; sole-owner block → audited support decision keeps history; legacy claim submission enqueues in-transaction; support-closed business excluded from live ownership). `playwright test e2e/account-privacy.spec.ts` → 3 pass (scope acknowledgements + truthful tracking, sole-owner block with pending decision, unverified account refused). |
| US5 e-mail delivery (provider path) | Implemented 2026-09-14, still dark: `LIFECYCLE_DELIVERY_PROVIDER=resend` selects an e-mail loader that resolves the recipient's verified primary address at Clerk at dispatch time (never stored in the outbox), renders NL/EN plain-text copy for all 18 event codes from the allow-listed payload only (no links, no contact data, no reviewer notes), and posts to the Resend API with an idempotency key that is stable across every automatic retry of a row (so an ambiguous send — accepted remotely, response lost locally — is deduplicated by the provider) and rotates only on an explicit support resend; 2xx → `accepted` with the provider id, 429/5xx/network → `transient_failure`, other 4xx → `permanent_failure`; a missing/unverified address or deleted identity fails permanently (`recipient_no_address`/`recipient_gone`), an identity-provider outage retries. Startup refuses `resend` without `RESEND_API_KEY`, `LIFECYCLE_SENDER_ADDRESS` (the approved sender identity) and `LIFECYCLE_RECEIPT_WEBHOOK_SECRET`; an API key alone never selects a provider. `POST /api/lifecycle/delivery-receipts/resend` verifies the Svix-style signature over the raw body (5-minute tolerance), maps `email.delivered` onto `recordDeliveryReceipt`, treats replays as no-ops (`already_delivered`) and unknown ids as `unknown`, acknowledges other event types without changes, and returns 404 while no secret is configured. **Gate Q5 remains open: no provider account, sender domain, or test inbox exists; production keeps `LIFECYCLE_DELIVERY_PROVIDER` unset.** | `pnpm --filter @workspace/api-server run test:account-lifecycle` on disposable database `buurtplaza_t51_lifecycle` (created, `db push`, dropped afterwards) with `ACCOUNTS_ENABLED=1 BUSINESS_INTAKE_ENABLED=1 BUSINESS_PUBLICATION_ENABLED=1` → 22 pass (16 existing + templates for every event in NL/EN without forbidden content, address resolved at dispatch and absent from outbox/attempt rows, identical provider key on the retry after a lost response and a rotated key only after support resend, delivery-contract mapping for recipient and Resend HTTP outcomes with an injected fetch, explicit-configuration guard, signed receipt delivered once / replay no-op / unknown id / non-delivery event ignored / unsigned, stale, tampered → 401 / no secret → 404). No live send was performed. |

## Release verification (2026-09-14, release-candidate review)

All commands ran against non-production data. API suites used the disposable
database `buurtplaza_release_rehearsal` (created from the development
connection, schema pushed by `drizzle-kit push`); browser suites used the
Playwright dev server with mocked `/api/account/**`, `/api/business*`,
`/api/review/**` responses and `?e2eAccountAuth=1` test identities. No real
consumer, reviewer, or production row was touched.

| Check | Command | Result |
| --- | --- | --- |
| Contracts | `pnpm --filter @workspace/api-spec run codegen` then `git status lib/api-client-react lib/api-zod` | regenerated output identical to the committed client and Zod schemas (no diff) |
| Static + builds | `pnpm run typecheck`; `pnpm --filter @workspace/buurtgids run build`; `pnpm --filter @workspace/api-server run build` | typecheck clean (libs, api-server, buurtgids, scripts); both builds succeed |
| Migration rehearsal | `DATABASE_URL=<rehearsal> pnpm --filter @workspace/db run push` twice | first push applies the additive schema; second push "No changes detected" |
| Permissions | `tsx --test src/lib/permissions.test.ts` | 8 pass |
| Baseline registration | `tsx --test src/routes/registration.test.ts` | 2 pass |
| Accounts | `tsx --test src/routes/account.test.ts` | 14 pass |
| Business intake | `tsx --test src/routes/business-intake.test.ts` | 14 pass |
| Business review/publication | `tsx --test src/routes/business-publication.test.ts` | 25 pass |
| Lifecycle | `tsx --test src/routes/account-lifecycle.test.ts` | 16 pass |
| NL/EN parity | `tsx --test src/lib/i18n.test.ts` (new) | 12 pass — identical key trees, no empty strings in any translation table |
| Browser journeys (desktop 1280×900) | `playwright test --config playwright.config.ts` (30 tests) | run 1: 29 pass, 1 fail `discovery-regression.spec.ts › homepage map keeps the user zoom level when hovering neighborhoods` (expected zoom 13, got 11); isolated `--repeat-each 3`: 3 pass; run 2 (full suite, after the accessibility edits): **30 pass**. The single failure was a timing race in the test itself: the map legitimately refits its camera when the container size/content settles, and under load that refit landed after the test's zoom-in clicks; the test used a fixed 300 ms sleep. Fixed 2026-09-15 by waiting for the camera to settle before zooming and by flushing animation frames instead of sleeping (see Known gaps item 8) |
| Browser journeys (mobile 390×844, `reducedMotion: 'reduce'`, touch) | `playwright test e2e/account-preferences.spec.ts e2e/account-privacy.spec.ts e2e/business-intake.spec.ts e2e/business-review.spec.ts` with a viewport override | 18 pass |
| Flags-off rollback rehearsal | production-mode API bundle started against the rehearsal database with all flags unset | `/api/readiness` → all `false`; `/api/account/me`, `/api/businesses/lookup`, `/api/account/requests` → 404 `FEATURE_DISABLED`; `/api/review/*` not mounted (404); `/api/registration` → 401 unchanged; listings unchanged; no lifecycle dispatch started |
| Deployed base-path smoke (development, flags on) | `curl` through the Replit dev domain | `/api/readiness` → all `true`; every gated API route answers 401 `AUTH_REQUIRED` anonymously; `/`, `/account`, `/account/voorkeuren`, `/account/privacy`, `/bedrijf-zoeken`, `/mijn-bedrijf`, `/nieuws`, `/deals`, `/activiteiten/den-haag` → 200; `/account/privacy` at 390px renders the real Clerk sign-in gate |

### Evidence per release quality

- **Authorization**: server-derived roles and capabilities; stranger 404,
  unverified 403, self-review 403, forged role fields `UNKNOWN_FIELD`
  (`permissions.test.ts`, `account.test.ts`, `business-publication.test.ts`).
- **Version conflicts**: preference and revision writes 409 `VERSION_CONFLICT`
  under six concurrent writers; stale reviewer decisions 409; save/discard
  racing submit on a held profile lock (`account.test.ts`,
  `business-publication.test.ts`, `business-review.spec.ts`).
- **Draft privacy and public serialization**: lookup allowlist omits contact
  and claim data; drafts and rejected revisions invisible publicly; public
  page serves only the approved snapshot, provenance without reviewer notes
  or IDs; contradicted website withheld (`business-intake.test.ts`,
  `business-publication.test.ts`).
- **Migration**: additive push idempotent on the rehearsal database; backfill
  creates exactly one approved v1 per legacy profile and is a no-op on re-run.
- **Message failure**: transient retry with backoff, permanent `failed` after
  the budget, receipts idempotent, concurrent dispatchers deliver once, status
  exposed without payload or address (`account-lifecycle.test.ts`).
- **Deletion exceptions**: sole-owner block, audited support decision, history
  preserved; erasure deferred to Q6/Q8.
- **Rollback controls**: flags-off rehearsal above; publication flag off serves
  legacy columns and re-enabling serves the snapshot (`business-publication.test.ts`).
- **Localization**: `i18n.test.ts` parity; language switch retains form state
  (`account-preferences.spec.ts`, `business-review.spec.ts`).
- **Accessibility (automated part only)**: error summaries carry
  `role="alert"` and receive focus on the preferences and draft pages; the
  revision editor now focuses the first invalid field and links each error via
  `aria-describedby`; a global `prefers-reduced-motion` rule disables
  animations and transitions; account and business journeys pass at 390×844
  with reduced motion enabled. **Not yet done:** keyboard-only completion and
  a screen-reader pass of each new screen (T050, FR-017). This is a release
  blocker (see blocker 7) and is tracked as a follow-up task.
- **Low data**: pages render from JSON APIs only; the map layers already fall
  back from Google to OSM tiles to coordinates (`discovery-regression.spec.ts`).
- **Operator visibility**: `GET /api/readiness`, structured logs with event
  codes and IDs only (`lifecycle_dispatch.*`, `lifecycle_message.*`), support
  queues for deletion requests and failed messages.
- **Separate flags**: accounts, intake, and publication gate independently;
  each gated route was checked with only its own flag unset in the route
  tests (`flag-off 404 on every route`).

### Rollback triggers

Recorded in `doc/md/onboarding-release.md`: draft or reviewer data in a public
response, unapproved owner edits reaching the public page, failed lifecycle
rows without visibility or duplicate messages per event, deletion requests
resolved outside the audited path, or a schema push reporting a destructive
statement.

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
- Intentional deviations from `tasks.md` file names: review/publication
  routes live in `business-publication.ts` (+ `.test.ts`), the reviewer detail
  is a panel inside `/redactie/bedrijven` rather than a separate route, and
  outbox tests live in `account-lifecycle.test.ts`. Behaviour matches the spec.
- Deviation from the constitution's "focused tests" gate: the manual checks
  (keyboard-only completion with a screen reader, real Clerk identities in a
  deployed environment) are documented as owed before the first production
  flag, not replaced by the automated evidence above.
- Follow-up candidates outside this feature: adopting migration files
  instead of schema push; shared-store rate limiting for multi-instance
  deployments; automated erasure job after Q6/Q8. (The timing-sensitive
  homepage zoom regression test was stabilised on 2026-09-15.)
