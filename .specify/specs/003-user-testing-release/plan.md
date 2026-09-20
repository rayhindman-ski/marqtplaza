# Implementation Plan: User Testing Release

**Spec**: `.specify/specs/003-user-testing-release/spec.md`  
**Status**: Complete  
**Date**: 2026-09-15

## Summary

Extend the listing contract with a source-derived Food & Drink type, improve cluster and card disclosure interactions, make stored-only cache misses recoverable, and retain honest unknown metadata. Verify with focused mapping tests, discovery browser tests, workspace checks, and a preview screenshot before publishing a GitHub release.

## Constitution check

| Principle | How this plan complies | Evidence or exception |
| --- | --- | --- |
| User value is a vertical slice | Yes | Contract, provider mapping, filters, interactions, and recovery ship together. |
| Local truth beats invented completeness | Yes | Unknown metadata is explicit; event/social expansion is deferred. |
| Contracts are the shared language | Yes | `foodType` is additive in OpenAPI and generated clients. |
| Privacy, moderation, and ownership are explicit | N/A | No account or moderation changes. |
| External integrations fail independently | Yes | Stored-only miss and live provider failure remain distinct. |
| Accessible, localized, and responsive by default | Yes | Disclosure semantics, keyboard controls, Dutch/English copy. |
| Small changes preserve operational clarity | Yes | No provider is silently enabled and no persistence migration is needed. |

## Technical context

- **Web package**: `artifacts/buurtgids`
- **API package**: `artifacts/api-server`
- **Shared libraries**: `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`
- **Persistence**: none
- **Integrations**: existing OSM and disabled Google Places mapping only
- **Testing**: focused unit/API mapping tests, Playwright discovery regression, full typecheck/build
- **OpenAPI/codegen**: Required

## Affected surfaces

### Files and modules

- `artifacts/buurtgids/src/components/GoogleMapView.tsx` — cluster summary interaction.
- `artifacts/buurtgids/src/App.tsx` — card disclosure, cache-miss recovery, food filters.
- `artifacts/buurtgids/src/lib/data.ts` — Food & Drink type.
- `artifacts/buurtgids/src/pages/NewsFeedView.tsx` — explicit unknown date.
- `artifacts/api-server/src/routes/listings.ts` — provider food-type mapping.
- `lib/api-spec/openapi.yaml` — additive Listing contract.
- `artifacts/buurtgids/e2e/discovery-regression.spec.ts` — acceptance coverage.

### API and data model

- Optional `foodType` preserves compatibility with older snapshots and non-food listings.
- No rollback migration; removing the optional field restores the previous contract.

### UX and content

- `/activiteiten/den-haag` gains localized cluster details, collapsed disclosures, subtype filters, and live retry.
- `/nieuws` says date unknown when the source did not supply a date.

## Research and decisions

| Question | Finding | Decision | Why |
| --- | --- | --- | --- |
| Why do number badges show no cards? | Badge only zooms; coincident points can remain clustered. | Reveal member names and actions in a cluster summary. | Guarantees information access at any zoom. |
| Why can food/business look unloaded? | A remembered stored-only preference yields an empty cache miss. | Show and persist an explicit live retry. | Keeps user control without silently changing network behavior. |
| Are dates/prices missing from cards? | Both are rendered when available; unknown date says “recent”. | Keep price unknown and change date fallback to date unknown. | Does not invent source facts. |
| How should Food & Drink split? | Google primary types and OSM amenity/shop tags provide venue evidence. | Six stable source-derived types with `other`. | Useful filters without speculative cuisine inference. |
| Should this release add more events/social items? | Coverage is curated/source-verified and not a simple UI defect. | Defer source expansion. | Preserves provenance and moderation guarantees. |

## Implementation phases

### Phase 1 — Contract and mapping

- [x] Add and generate the optional food type contract.
- [x] Map Google/OSM evidence and test the mapping.

### Phase 2 — Discovery interactions

- [x] Add cluster summaries and accessible overview disclosures.
- [x] Add subtype filtering and stored-only live recovery.
- [x] Make missing news dates explicit.

### Phase 3 — Convergence and release

- [x] Run focused and workspace verification.
- [x] Confirm preview behavior and browser logs.
- [x] Record convergence, commit/push, and create the GitHub release.

## Risks and rollback

- **Risk**: Cluster summary competes with map gestures — **Mitigation**: reuse stationary activation and stop pointer propagation.
- **Risk**: Old listings have no food type — **Mitigation**: classify missing values as `other` in UI.
- **Rollback**: Revert the release commit; there is no database migration or irreversible provider action.

## Verification plan

```text
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/buurtgids run test
pnpm --filter @workspace/buurtgids run build
```