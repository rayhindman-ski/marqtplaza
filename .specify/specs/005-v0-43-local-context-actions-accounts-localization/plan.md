# Implementation Plan: v0.43 local context, actions, accounts, and localization

**Spec**: `spec.md`  
**Status**: Ready for tasks  
**Date**: 2026-09-20

## Summary

Implement v0.43 as one contract-preserving consumer slice. First centralize
validated public discovery/locale state and bilingual formatting. Then complete
context, evidence-aware result actions, favourite/auth detours and account truth
states using existing APIs. Finish with route/state parity and inherited
privacy/accessibility regressions.

## Constitution check

| Principle | How this plan complies | Evidence or exception |
| --- | --- | --- |
| User value is a vertical slice | Four independently testable user journeys | BR-05/10/11/12 scenarios |
| Local truth beats invented completeness | Hague-only records and existing listing fields | No new data/provider |
| Contracts are the shared language | Existing OpenAPI hooks inspected first | Codegen only if contract changes |
| Privacy, moderation, and ownership are explicit | Public-state allowlist and server-owned favourites | No private URL state |
| External integrations fail independently | Map, listing providers and Clerk retain recovery | Partial data preserved |
| Accessible, localized, responsive by default | EN/NL, keyboard, 320px/400% planned together | Manual SR audit not claimed |
| Small changes preserve operational clarity | Shared helpers plus focused route integration | No broad library replacement |

## Technical context

- **Web package**: `artifacts/buurtgids`
- **API package**: `artifacts/api-server` (existing contracts unless a verified
  gap requires a minimal change)
- **Shared libraries**: `lib/api-spec`, generated API clients, `lib/geo`
- **Persistence**: existing saved-event/account lifecycle tables; no migration planned
- **Integrations**: Clerk, Google Maps, OSM tiles, listing providers; no new integration
- **Testing**: unit/catalog, API route tests, focused Playwright, inherited v0.42
- **OpenAPI/codegen**: Not planned; required if any API surface changes

## Affected surfaces

### Files and modules

- `artifacts/buurtgids/src/lib/discoveryUrlState.ts` — validated parse/serialize
  for locale and allowlisted public criteria.
- `artifacts/buurtgids/src/lib/i18n.ts` — v0.43 semantic strings and formatting.
- `artifacts/buurtgids/src/lib/data.ts` — stable neighbourhood/category identity
  mapping without changing provider-facing Hague labels.
- `artifacts/buurtgids/src/App.tsx` — URL-authoritative discovery, context,
  result/detail actions, error recovery and localized route fallback.
- `artifacts/buurtgids/src/hooks/useSavedPlaces.ts` — preserve existing
  identity-aware favourite lifecycle; patch only observed UI integration gaps.
- `artifacts/buurtgids/src/pages/*Account*` and account components — truthful
  account value and locale parity using current lifecycle contracts.
- `artifacts/buurtgids/e2e/v043-release.spec.ts` — end-to-end release matrix.
- `artifacts/buurtgids/src/lib/*.test.ts` — URL, catalog and formatting tests.

### API and data model

- Reuse `/listings`, `/listing`, `/saved-events`, account privacy/deletion and
  current Clerk identity/session behavior.
- Keep stable public URL identifiers separate from translated labels.
- No migration or destructive rollback path is introduced.

### UX and content

- Hague-only context, shareable criteria, unsupported-city and optional-map recovery.
- Semantic cards/details and safe actions derived only from available fields.
- Optional account prompts, confirmed favourites and safe auth return context.
- Atomic locale switching, localized 404/errors/statuses, document language,
  keyboard/focus behavior and mobile/zoom reflow.

## Research and decisions

| Question | Finding | Decision | Why |
| --- | --- | --- | --- |
| New backend needed? | Listings, saves and lifecycle APIs exist | Reuse them | Avoid duplicate ownership/contracts |
| How should locale persist? | localStorage exists; URLs are only partial | URL is authoritative when valid | Sharing/history need deterministic locale |
| How are neighbourhoods identified? | UI/API currently use Hague display names | Add validated stable slugs at URL boundary, resolve to canonical names | Preserve API compatibility |
| Can action fields be invented? | Release forbids invented actions/contact data | Render only exact coordinates and safe stored URLs | Trust and safety |
| How should source text be localized? | It is provider-authored | Attribute/tag; do not translate as app copy | Avoid false provenance |
| Is analytics included? | No approved telemetry contract | Exclude | Privacy and release boundary |

## Implementation phases

### Phase 1 — Reconcile and test foundations

- [ ] Map each BR acceptance criterion to existing behavior or exact gap.
- [ ] Add failing unit tests for public URL validation and locale/catalog parity.
- [ ] Add focused v0.43 browser fixtures without real provider dependence.

### Phase 2 — Shared public state and locale

- [ ] Implement typed allowlisted discovery URL parse/serialize/canonicalization.
- [ ] Add stable Hague neighbourhood/category URL identifiers and validators.
- [ ] Make valid URL locale authoritative; preserve criteria on locale/history changes.
- [ ] Add locale-aware date/number/plural helpers and missing semantic strings.

### Phase 3 — BR-05 local context

- [ ] Complete Hague-only context and real-record example presentation.
- [ ] Add unsupported-city and optional-map failure recovery.
- [ ] Preserve unaffected criteria/list usability through clear, cancel and retry.

### Phase 4 — BR-10 result-to-action

- [ ] Audit filters against actual listing fields and remove unsupported implications.
- [ ] Complete semantic evidence/card/detail states and safe action gating.
- [ ] Keep partial/provider errors non-destructive and scope-stable.

### Phase 5 — BR-11 accounts and favourites

- [ ] Tie account prompts to verified save/privacy benefits without gating discovery.
- [ ] Preserve sanitized public return context through auth cancel/success/error.
- [ ] Confirm owner-isolated save, sign-out, account switch and deletion truth states.

### Phase 6 — BR-12 parity and accessibility

- [ ] Localize route fallback, errors, statuses, account and action copy.
- [ ] Validate equal resource trees/placeholders and source-content attribution.
- [ ] Verify atomic switch, document language, focus, 320px and 400% reflow.

### Phase 7 — Convergence

- [ ] Run unit, route, typecheck, build and focused browser suites.
- [ ] Run applicable v0.41/v0.42 privacy/map/source/account regressions.
- [ ] Inspect EN/NL desktop/mobile screenshots and workflow/browser logs.
- [ ] Record exact evidence, deviations and manual-review boundaries.

## Risks and rollback

- **Risk**: canonicalization changes break existing links — **Mitigation**:
  accept legacy query names, serialize one canonical form, test Back/Forward.
- **Risk**: favourite/auth return leaks private data — **Mitigation**: reuse the
  return-path allowlist and serialize public criteria only.
- **Risk**: locale switch creates mixed frames — **Mitigation**: synchronous
  catalog state with atomic URL/language update and parity tests.
- **Risk**: inherited map privacy regresses — **Mitigation**: retain explicit
  Show map/Use location actions and network assertions.
- **Rollback**: revert web rendering/helpers together; no schema/data rollback.

## Verification plan

```text
pnpm speckit:check
pnpm --filter @workspace/buurtgids run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm run typecheck
pnpm --filter @workspace/buurtgids run build
pnpm --dir artifacts/buurtgids exec tsx --test src/lib/i18n.test.ts src/lib/discoveryUrlState.test.ts
pnpm --dir artifacts/api-server exec tsx --test src/routes/listings-query.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(command -v chromium) pnpm --dir artifacts/buurtgids exec playwright test --config playwright.config.ts e2e/v043-release.spec.ts e2e/v042-release.spec.ts e2e/discovery-regression.spec.ts
git diff --check
```