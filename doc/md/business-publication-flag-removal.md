# Retiring the legacy business profile editor once publication is permanently on

Status: **not yet applicable** (decided 2026-09-14). `BUSINESS_PUBLICATION_ENABLED`
is off in production and gate Q4 in
`.specify/specs/002-consumer-accounts-and-business-onboarding/convergence.md` is
open. Nothing in this document may be executed before the gate row is recorded
with an approver and date and the production flag has been on for one full
release cycle without a rollback.

## Why the legacy path still exists today

Two owner edit paths exist on purpose while the flag can still be rolled back:

| Flag state | Owner edit path | Public truth |
| --- | --- | --- |
| off | Inline dialog in `MyBusinessWorkspace` (`openProfileEdit`) → `PATCH /api/business-profiles/:id` writes the profile columns directly | profile columns |
| on | `BusinessRevisionPage` (`/mijn-bedrijf/:id/profiel`) → `/api/business-profiles/:id/revision*`; the legacy `PATCH` merges into a draft revision via `upsertDraftRevision`, refuses `name`, and answers 409 while a revision is under review | approved snapshot only |

The flag-off row is what makes rollback safe ("Rollback" in
`doc/md/onboarding-release.md`): switching the flag off must restore a working
editor and the column projection. Removing the legacy editor before the gate
closes would leave owners without an editor on rollback, so the branches stay.

Until then the invariant to protect is: **while the flag is on, no owner
input reaches the public projection without an approval.** That is covered by
`business-publication.test.ts` ("legacy PATCH lands in a draft", "no legacy
column fallback while publication is on") and the rollback trigger "Owner edits
reaching the public page without a recorded approval while the publication
flag is on".

## Preconditions for removal

1. Q4 recorded in the gate table (approver, date).
2. `BUSINESS_PUBLICATION_ENABLED=1` and `VITE_BUSINESS_PUBLICATION_ENABLED=1`
   in production, with `GET /api/readiness` confirming it, for at least one
   release cycle with no rollback.
3. The startup backfill (`lib/businessRevisionBackfill.ts`) has run in
   production: every `business_profiles` row that is `published`, `unpublished`
   or `suspended` has an `approved_revision_id`. Verify with a read-only
   query before starting; a profile without a snapshot becomes unreachable
   for owners once the column editor is gone.
4. A decision recorded in `convergence.md` that the flag is retired (this is a
   closed technical decision, not a new gate).

## Removal steps (single change set, one pull request)

Do these together; a partial removal leaves the web and API mirrors
disagreeing, which is exactly the silent-bypass scenario this runbook exists
to avoid.

### API (`artifacts/api-server`)

1. `src/routes/businesses.ts`
   - `PATCH /business-profiles/:id`: delete the column-update branch (the
     `db.update(businessProfilesTable)` after the flag check) and the flag
     check itself. Either keep the draft-merge body as the only behaviour, or
     — preferred for a single edit path — retire the route and answer
     `410 Gone` pointing at `/business-profiles/:id/revision`. Pick one and
     reflect it in the OpenAPI spec (below).
   - `publicProjection(profile, publicationEnabled)`: drop the parameter and
     the `if (!publicationEnabled)` column branch; return `null` when no
     approved revision exists.
   - Claim submission (`publicationStatus: publicationEnabled ? "draft" : "published"`):
     always `"draft"`.
   - Remove the `flags` option from the router factory if nothing else reads it.
2. `src/routes/business-intake.ts`: same `publicationStatus` change as above.
3. `src/routes/business-publication.ts`: remove
   `requireFlag("businessPublication", …)` from every route.
4. `src/index.ts`: run `backfillApprovedRevisions()` unconditionally (it is
   idempotent and is the safety net for step 3 of the preconditions).
5. `src/lib/featureFlags.ts`: remove `businessPublication` from
   `FeatureFlagName`, `FEATURE_FLAG_ENV_VARS`, and `readFeatureFlags`;
   update `src/lib/permissions.test.ts` and `featureFlags.test.ts`.
6. Serialisation: after step 1 the only owner-facing profile serialisers are
   `serialiseProfile` (`src/lib/businessClaims.ts`) and `serialiseRevision`
   (`src/lib/businessRevisions.ts`). Remove the `approvedRevisionVersion: null,
   content: null, provenance: null` shape from the public response type so
   the public projection is always snapshot-shaped.
7. Tests (`src/routes/business-publication.test.ts`):
   - delete "serves the legacy columns again when the flag is rolled back after
     a backfill" and every `flag-off 404` assertion;
   - replace "legacy PATCH lands in a draft" with the chosen route behaviour
     (draft merge or 410);
   - keep "no legacy column fallback while publication is on" as the
     unconditional public-projection test.

### OpenAPI (`lib/api-spec/openapi.yaml`) and generated clients

1. `/business-profiles/{id}` `PATCH` (`updateBusinessProfile`): remove it, or
   document it as deprecated with the 410 response, matching the API choice.
2. `/readiness` (`FeatureReadiness`): drop `businessPublication`.
3. Public business profile schema: make `content` and `provenance` required
   (non-nullable) and remove the null column-fallback variant.
4. Regenerate `lib/api-zod` and `lib/api-client-react` (see the OpenAPI client
   regeneration notes in `.agents/memory`) and fix downstream typecheck
   errors before judging anything else.

### Web (`artifacts/buurtgids`)

1. `src/pages/MyBusinessWorkspace.tsx`: remove `openProfileEdit`,
   `onProfileSubmit`, `profileForm`, `isEditProfileOpen`, the edit `Dialog`,
   the `useUpdateBusinessProfile` import, and the
   `featureFlags.businessPublication ? … : …` ternary so the "Profiel
   bewerken / Edit profile" link to `/mijn-bedrijf/:id/profiel` is the only
   control.
2. `src/pages/BusinessRevisionPage.tsx`: remove the
   `featureFlags.businessPublication` checks (the `enabled` guard and the
   "not available yet" early return).
3. `src/pages/BusinessModerationView.tsx`: always render the Eigenaarschap /
   Profielen / Publicatie tabs and the five-column tab list.
4. `src/lib/featureFlags.ts`: remove `businessPublication`; remove
   `VITE_BUSINESS_PUBLICATION_ENABLED` from `playwright.config.ts`.
5. `e2e/business-review.spec.ts` and `e2e/business-moderation.spec.ts`: drop
   any flag-off expectations; the flag-off inline editor has no e2e coverage
   to remove.

### Documentation

1. `doc/md/onboarding-release.md`: delete the "Business publication" row from
   the flag table, rollback step 3, and the `businessPublication` field in the
   readiness example.
2. `convergence.md`: move the flag from "Rollout flags" to "Closed decisions"
   with the date, and record the removal run under "Acceptance evidence".
3. Delete this file.

## Verification after removal

- `pnpm --filter @workspace/api-server run test:business-publication` and
  `test:business-intake` pass with no flag environment set.
- `pnpm --filter @workspace/api-server exec tsc --noEmit` and
  `pnpm --filter @workspace/buurtgids exec tsc --noEmit` clean.
- `playwright test e2e/business-review.spec.ts e2e/business-moderation.spec.ts`
  pass with `VITE_BUSINESS_PUBLICATION_ENABLED` removed from the config.
- `grep -rn "businessPublication\|BUSINESS_PUBLICATION_ENABLED"` across
  `artifacts/`, `lib/`, and `doc/` returns nothing.
- Manual: as an owner, the workspace shows exactly one edit control and it
  opens `/mijn-bedrijf/:id/profiel`; an owner save never changes
  `/bedrijf/:slug` until a reviewer publishes.

## Rollback of the removal

Revert the pull request. Because the removal makes no schema change and keeps
`business_profile_revisions` and the approved snapshots, the reverted code
serves the same data; the flag returns to the "on" state it had before.
