# Implementation Plan: Event Source Evidence

**Spec**: [relative path to spec.md]  
**Status**: Converged  
**Date**: 2026-09-11

## Summary

Add an additive event-source status table, update it from the existing approved
source scanner, and derive a localized evidence summary in the event branch of
the listings route. Extend the OpenAPI contract and generated client, then add a
compact evidence panel and explicit empty/error copy to discovery.

## Constitution check

| Principle | How this plan complies | Evidence or exception |
| --- | --- | --- |
| User value is a vertical slice | [x] | Source scan → API evidence → public event UI |
| Local truth beats invented completeness | [x] | Only approved upcoming events are listed |
| Contracts are the shared language | [x] | OpenAPI changes precede client regeneration |
| Privacy, moderation, and ownership are explicit | [x] | No editor identity or unapproved candidates are exposed |
| External integrations fail independently | [x] | Per-source status preserves blocked/failed boundaries |
| Accessible, localized, and responsive by default | [x] | NL/EN status copy, semantic status region, compact responsive panel |
| Small changes preserve operational clarity | [x] | Additive schema and focused tests |

## Technical context

- **Web package**: `artifacts/buurtgids`
- **API package**: `artifacts/api-server`
- **Shared libraries**: `lib/api-spec`, `lib/api-client-react`, `lib/db`
- **Persistence**: additive `event_source_statuses` table via Drizzle push
- **Integrations**: existing approved event source scanner only
- **Testing**: route unit tests, API typecheck, web typecheck, manual preview
- **OpenAPI/codegen**: Required

## Affected surfaces

### Files and modules

- `lib/db/src/schema/eventSourceStatuses.ts` — latest scan evidence per event source
- `lib/db/src/schema/index.ts` — export the new table
- `artifacts/api-server/src/routes/sources.ts` — persist each scan result
- `artifacts/api-server/src/routes/listings.ts` — build event evidence response
- `lib/api-spec/openapi.yaml` — define evidence response schemas
- `lib/api-client-react/src/generated/*` — regenerate response types
- `artifacts/buurtgids/src/App.tsx` — render evidence and explicit event states
- `artifacts/buurtgids/src/lib/i18n.ts` — localized evidence copy

### API and data model

- `ListingsResponse.evidence` is optional for additive compatibility and contains
  `status`, `lastCheckedAt`, and source entries.
- Existing rows remain valid; missing status rows become `unavailable`/`unknown`
  evidence rather than fabricated success.

### UX and content

- The event source panel appears only when events are selected, uses `role=status`,
  and remains readable on narrow sidebars.

## Research and decisions

| Question | Finding | Decision | Why |
| --- | --- | --- | --- |
| How to distinguish empty from blocked? | Scanner already returns both statuses but did not persist them | Persist latest status per source | Adds one additive table but avoids misleading empty copy |
| How fresh is current event evidence? | Scan status has timestamps and the feed is date-bounded | Treat status older than 24h as stale | Simple, explainable public rule |
| Should event errors fall back to attractions? | Existing route intentionally forbids that | Keep explicit event-only unavailable state | Preserves source trust |

## Implementation phases

### Phase 1 — Setup

- [x] Define evidence statuses and acceptance fixtures in the spec.

### Phase 2 — Foundation

- [x] Add the event source status schema and OpenAPI evidence types.

### Phase 3 — User Story 1 (P1)

- [x] Persist source scan results and return verified/blocked/empty evidence.
- [x] Verify source lineage and event-only behavior with route tests.

### Phase 4 — User Story 2 (P2)

- [x] Render stale/missing stored evidence and localized evidence copy.
- [x] Verify public empty and unavailable states in the discovery UI.

### Phase 5 — Convergence

- [x] Compare implementation with spec and acceptance scenarios.
- [x] Verify constitution gates and document deviations.
- [x] Record deferred work and update the quickstart or project docs.

## Risks and rollback

- **Risk**: Existing environments may not have the additive table — **Mitigation**:
  push the schema before relying on persisted source statuses and degrade to
  `unavailable` if rows are absent.
- **Rollback**: remove the evidence field/UI and leave the additive table
  unused; no existing event rows are rewritten.

## Verification plan

```text
pnpm --filter @workspace/db push
pnpm --filter @workspace/api-spec codegen
pnpm --filter @workspace/api-server exec tsc --noEmit
pnpm --filter @workspace/buurtgids exec tsc --noEmit
pnpm --filter @workspace/api-server test -- src/routes/listings-query.test.ts
pnpm speckit:check
```
