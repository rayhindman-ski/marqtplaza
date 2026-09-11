# Convergence: Verified Event Source Evidence

**Date**: 2026-09-11  
**Status**: Converged

## Acceptance evidence

| Scenario | Implementation evidence | Verification |
| --- | --- | --- |
| Verified upcoming event | `sources.ts` extracts structured event data, applies `publicationStatus`, persists eligible events, and `listings.ts` returns source name, canonical URL, date, and timestamps with `source: "source_scan"`. | Source parsing/status tests and listings query tests pass. |
| Blocked source | Robots denial and blocked upstream responses produce `status: "blocked"` with a message; the source directory preserves the result and explicitly states that blocked is not empty. | Source scanner tests and source-directory code review. |
| Stale data | `freshnessBadge` only labels timestamps inside the recent windows; old timestamps return no recent label. Existing approved rows are not silently deleted during an outage. | `listingPresentation.test.ts` stale timestamp assertion passes. |
| Explicit empty state | `no_events` is distinct from blocked/error; the event listings path returns no generic-attraction fallback and `App.tsx` renders the localized no-discoveries state. | Existing events-only regression and empty rendering path reviewed; API/query checks pass. |

## Verification commands

```text
pnpm --filter @workspace/api-server exec tsx --test src/routes/sources.test.ts src/routes/listings-query.test.ts
pnpm --filter @workspace/buurtgids exec tsx --test src/lib/listingPresentation.test.ts
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/buurtgids run typecheck
```

All commands pass on 2026-09-11.

## Convergence review

- The existing API contract already carried the required event lineage, source statuses, publication counters, and freshness timestamps, so no OpenAPI or generated-client change was needed.
- The existing implementation already enforced approved source IDs, bounded same-origin crawling, robots rules, upcoming dates, and verified Den Haag evidence. This slice verified and documented those behaviors instead of adding another provider.
- The existing `CaptureView.tsx` is a separate editor capture workflow and is not the public event-source scan surface. It remains unchanged to avoid mixing business capture persistence with source-backed event discovery.
- “Stale” is intentionally conservative rather than destructive: old data loses recent freshness labels but remains governed by its existing approval and upcoming-date checks. Automatic expiry requires a source-level policy and is deferred.

## Deviations and follow-up

- No runtime contract or schema change was required despite the initial cross-cutting scope.
- A future feature should define source freshness/expiry semantics, including how long an approved event can remain public after a source disappears and how users are notified.