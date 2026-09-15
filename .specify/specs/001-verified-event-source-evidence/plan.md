# Implementation Plan: Verified Event Source Evidence

**Spec**: [relative path to spec.md]  
**Status**: Converged  
**Date**: 2026-09-11

## Summary

Use the existing approved-source scanner as the vertical slice. Verify event extraction and publication eligibility at the API boundary, preserve per-source status and lineage in the existing OpenAPI response, and verify that the discovery UI renders source-backed events, source failures, stale freshness conservatively, and an explicit empty state. No provider, persistence, or contract expansion is needed.

## Constitution check

| Principle | How this plan complies | Evidence or exception |
| --- | --- | --- |
| User value is a vertical slice | [x] | Source scan → eligible event → public listing and empty/failure states are verified together. |
| Local truth beats invented completeness | [x] | Publication requires date and Den Haag evidence; blocked sources are not empty. |
| Contracts are the shared language | [x] | Existing OpenAPI `SourceScanResult` and `Listing` contracts already contain the needed fields. |
| Privacy, moderation, and ownership are explicit | [x] | No new identity or ownership path; editorial review remains separate. |
| External integrations fail independently | [x] | Per-source scan statuses and messages remain independent; stored-only mode avoids outbound work. |
| Accessible, localized, and responsive by default | [x] | Existing Dutch/English messages, semantic empty/status content, and responsive source/discovery views are retained. |
| Small changes preserve operational clarity | [x] | No provider, dependency, schema, or generated-client change. |

## Technical context

- **Web package**: `artifacts/buurtgids`
- **API package**: `artifacts/api-server`
- **Shared libraries**: `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db`
- **Persistence**: Existing `discovered_events` rows and query lineage; no migration.
- **Integrations**: Approved public event pages; robots and same-origin crawl safeguards; no new credentials.
- **Testing**: API source parsing/status tests, web freshness/empty-state regression checks, API and web typechecks.
- **OpenAPI/codegen**: Not required; contract unchanged.

## Affected surfaces

### Files and modules

- `artifacts/api-server/src/routes/sources.ts` — source allowlist, crawl status, event publication eligibility, and lineage fields.
- `artifacts/api-server/src/routes/sources.test.ts` — verified event, blocked source, and no-events regression coverage.
- `artifacts/api-server/src/routes/listings.ts` — public event projection and stored-only boundary.
- `artifacts/api-server/src/routes/listings-query.test.ts` — stored-only and event preparation safeguards.
- `artifacts/buurtgids/src/App.tsx` — source-backed listing projection and explicit empty event behavior.
- `artifacts/buurtgids/src/lib/listingPresentation.ts` — freshness labeling.
- `artifacts/buurtgids/src/lib/listingPresentation.test.ts` — stale timestamp regression coverage.
- `artifacts/buurtgids/src/pages/SourceDirectoryView.tsx` — editor-facing scan status, metrics, and blocked-source transparency.
- `artifacts/buurtgids/src/pages/CaptureView.tsx` — existing capture surface remains unchanged and is explicitly out of the public event-source path.

### API and data model

- No contract or schema change. Existing statuses are `found`, `partial`, `no_events`, `blocked`, and `error`.
- Existing clients remain compatible. If a future status or freshness field is added, update `lib/api-spec/openapi.yaml` first and regenerate the clients/Zod schemas.
- Rollback is code-only: revert the testability/documentation changes without data migration.

### UX and content

- Source directory reports per-source status and message, including blocked access; it does not turn blocked into empty.
- Discovery shows only returned event listings and uses the existing localized empty/error/loading states.
- Freshness badges are conservative: old timestamps have no recent label. Existing keyboard/focus and mobile layouts remain in scope for regression checks.

## Research and decisions

| Question | Finding | Decision | Why |
| --- | --- | --- | --- |
| Can a source scan publish every captured event? | `publicationStatus` rejects missing date, out-of-window dates, missing locality, and foreign evidence. | Publish only eligible events; retain rejected candidates for review. | Prevents source landing pages and generic links from becoming public events. |
| How should blocked access be represented? | Scanner already emits `blocked` separately from `no_events` and `error`. | Preserve the status and explanatory message. | A blocked source is not evidence that no events exist. |
| What does “stale” mean in this slice? | `freshnessBadge` only labels recent timestamps and existing approved events retain their lifecycle fields. | Do not label old data as recent; defer automatic expiry. | Avoids inventing freshness while avoiding destructive removal during outages. |
| Is a new API contract needed? | OpenAPI and generated types already include statuses, source identity, dates, and metrics. | Keep the contract unchanged. | Reduces compatibility and regeneration risk for a verification slice. |

## Implementation phases

### Phase 1 — Setup

- [x] Confirm the constitution, templates, existing source scan contract, and approved-source boundaries.
- [x] Create the numbered feature directory and populate the spec/plan/tasks documents.

### Phase 2 — Foundation

- [x] Verify source identity, event URL, date/locality eligibility, status, and freshness fields against the existing API and UI paths.

### Phase 3 — User Story 1 (P1)

- [x] Verify structured event extraction and publication metrics with focused source tests.
- [x] Verify public event projection, source lineage, stored-only isolation, and the explicit empty event state.

### Phase 4 — User Story 2 (P2)

- [x] Verify blocked/no-events distinction and conservative stale freshness behavior.

### Phase 5 — Convergence

- [x] Compare implementation with the spec and acceptance scenarios.
- [x] Verify constitution gates and document deviations in `convergence.md`.
- [x] Record deferred automatic source expiry as follow-up work.

## Risks and rollback

- **Risk**: Source markup/access policy changes — **Mitigation**: bounded crawl, robots enforcement, per-source status, and explicit editor messaging.
- **Risk**: Approved rows remain visible through a temporary outage — **Mitigation**: preserve lineage and conservative freshness; specify expiry separately before deleting or hiding rows.
- **Rollback**: Revert the feature-directory documentation and focused regression additions; no schema or data rollback is required.

## Verification plan

```text
pnpm --filter @workspace/api-server exec tsx --test src/routes/sources.test.ts src/routes/listings-query.test.ts
pnpm --filter @workspace/buurtgids exec tsx --test src/lib/listingPresentation.test.ts
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/buurtgids run typecheck
Manual/API evidence:
  - approved event fixture => found/eligible with source identity
  - robots-blocked fixture => blocked, not no_events
  - readable fixture with no event links => no_events and explicit UI empty state
  - old lastSeen/updated timestamp => no recent freshness badge
```
