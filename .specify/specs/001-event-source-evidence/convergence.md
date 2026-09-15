# Convergence: Event Source Evidence

**Status**: Converged  
**Date**: 2026-09-11

## Delivered

- Added an additive `event_source_statuses` table for the latest approved
  event-source scan outcome.
- Persisted source scan statuses without exposing editor identity or unapproved
  event candidates.
- Added `ListingsResponse.evidence` to the OpenAPI contract and regenerated the
  shared clients.
- Added a pure evidence summarizer covering verified, empty, stale, blocked, and
  unavailable outcomes.
- Added a localized, semantic evidence panel to public discovery. Events remain
  event-only; generic attractions are never used as a fallback.

## Verification

- `pnpm --filter @workspace/db push`
- `pnpm --filter @workspace/api-spec codegen`
- `pnpm --filter @workspace/api-server exec tsc --noEmit`
- `pnpm --filter @workspace/buurtgids exec tsc --noEmit`
- `pnpm --filter @workspace/api-server test -- src/routes/listings-query.test.ts`
- `pnpm speckit:check`
- `git diff --check`
- Direct HTTP check of `/api/listings?section=events` confirmed the structured
  evidence response.
- Preview screenshot confirmed the discovery route renders without browser
  errors.

## Deviations and follow-up

- Existing environments with no event-source scan history report `unavailable`
  rather than pretending that no events were found. The next successful source
  scan populates the new table and enables verified, empty, blocked, or partial
  evidence for the public feed.
- The source status table is additive and is intended to be included in the
  normal publish-time schema diff for production.