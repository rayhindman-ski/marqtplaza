# MarqtPlaza v0.42 proposed release plan

## Goal and status

- **Status:** Proposed; no behavior in this plan is claimed implemented, tested, or released.
- **Goal:** fully deliver BR-01, BR-02, and BR-09 for the global website vision, using the current Hague implementation only as the availability and assessment baseline.
- **Release boundary:** v0.42 depends on accepted [v0.41](./release_v0.41.md), which owns BR-03, BR-04, BR-06, BR-07, and BR-08.
- **Success statement:** consumers can understand the proposition, navigate an explicit hierarchy, and complete the responsive journey while the accepted non-map, search-scope, accessibility, trust, and privacy gates remain true.
- This release does not claim global rollout or availability beyond currently supported locations.

## Owned scope

| Requirement | Full-delivery release | Priority | Criticality | Complexity | Provisional effort |
|---|---|---|---|---|---|
| [BR-01 — Clear value proposition](../BR-01.md) | v0.42 | P1 — High | High | Low | 3–5 person-days |
| [BR-02 — Clear navigation labels and hierarchy](../BR-02.md) | v0.42 | P1 — High | High | Medium | 5–8 person-days |
| [BR-09 — Mobile-first experience](../BR-09.md) | v0.42 | P1 — High | High | High | 10–15 person-days |

## Inclusion rationale

- BR-01 makes the global proposition and current Hague availability understandable without implying worldwide coverage.
- BR-02 completes broad desktop/mobile navigation, routing context, account entry, locale behavior, and responsive hierarchy.
- BR-09 completes the broad mobile-first journey, disclosures, state persistence, device behavior, and map/list resilience.
- v0.41 necessarily shipped minimum labelled navigation/accessibility and minimum lazy-map/reflow behavior to satisfy its own P0 acceptance.
- That prerequisite slice does not complete BR-02 or BR-09; their remaining breadth and their single full-delivery credit belong to v0.42.
- BR-01, BR-02, and BR-09 are sequenced together because proposition, hierarchy, and responsive composition must agree in both English and Dutch.

## Excluded and deferred scope

- No duplication or completion claim for v0.41-owned BR-03, BR-04, BR-06, BR-07, or BR-08; they remain enforced release gates.
- No implementation of [v0.43](./release_v0.43.md) ownership: BR-05, BR-10, BR-11, or BR-12.
- BR-12's later full-site localization audit is not permission to defer strings: every v0.42 UI change ships with equivalent English and Dutch content.
- No new geographic rollout, dataset acquisition, native app, offline maps, ranking redesign, account entitlement design, or unsupported verification/safety claim.
- Result-card action breadth and account-value breadth remain with BR-10 and BR-11 unless a minimum non-completing hook is required for an assigned acceptance criterion.

## Entry criteria

- [v0.41](./release_v0.41.md) is accepted against all of its BR-03/04/06/07/08 criteria and its evidence is available.
- Its list-first/manual-neighbourhood path, explicit search scope, WCAG 2.2 AA gate, trust caveats, and privacy controls are regression baselines.
- Its minimum labelled controls, accessible navigation path, narrow reflow, and map lazy-loading contract are identified for extension rather than replacement.
- Live routes, components, localization, authentication, search/map contracts, analytics, and release-control mechanisms have been inspected.
- Supported browser/device matrix, current Hague availability source, bilingual copy authority, privacy-approved telemetry, and representative test data are available.
- Any incompatibility in assumed contracts is surfaced for re-estimation before implementation proceeds.

## Staged implementation order

1. Baseline v0.41 acceptance artifacts and map every inherited gate to the v0.42 change surface.
2. Inventory routes, navigation controls, breakpoints, shared state, map requests, locale keys, headings, account states, and failure states.
3. Agree one bilingual proposition, availability notice, navigation model, route hierarchy, and mobile information order.
4. Extend the v0.41 public-state allow-list and history behavior without exposing coordinates, preferences, account identifiers, session data, or tokens.
5. Deliver BR-01 hero, benefits, availability distinction, scope explanation, condensed results context, recovery states, and privacy-minimized analytics.
6. Complete BR-02 desktop/mobile destination parity, labels, landmarks, titles, current-page cues, safe account return, menu semantics, and focus restoration.
7. Complete BR-09 mobile-first layouts, progressive filters/details, orientation/keyboard/zoom behavior, map/list switching, and failure resilience.
8. Add English and Dutch strings atomically at every stage; verify locale-consistent “The Hague”/“Den Haag” terminology.
9. Run assigned functional, responsive, accessibility, localization, security/privacy, performance, and regression tests.
10. Capture target screenshots only from the implemented consumer build, then conduct rollout and go/no-go review.

## Dependency resolution

| Dependency | Resolution in v0.42 | Ownership/accounting |
|---|---|---|
| v0.41 BR-03/04/06/07/08 | Preserve list-first discovery, local-only opt-in semantics, WCAG, trust, and privacy behavior through every stage. | Accepted prerequisite; no v0.42 completion credit. |
| BR-02/09 minimum slice used by v0.41 | Reuse and broaden the shipped labelled-control, reflow, and lazy-map foundation. | Earlier shared effort is credited within later BR-02/09 estimates; do not count it twice. |
| BR-01 on BR-02/09 | Build shared hierarchy and responsive proposition components before final proposition acceptance. | BR-01 remains fully delivered only here. |
| BR-01 on BR-03/04/07/08 | Test that every proposition promise is substantiated by accepted list, scope, trust, and privacy behavior. | Do not waive BR-01 acceptance or reopen ownership. |
| BR-02/09 on later BR-10/11 | Supply only the minimum reachable detail/account hooks needed by assigned criteria. | Broad result actions/account value stay deferred to v0.43. |
| BR-12 audit | Maintain an affected-string inventory and immediate EN/NL parity. | Full-site audit remains solely v0.43. |

## Acceptance gate

- **BR-01 AC gate:** verify [BR-01-AC-01 through BR-01-AC-12](../BR-01.md#measurable-acceptance-criteria); no criterion may be waived because its shared dependency originated in v0.41 or is broadly owned later.
- **BR-01 test gate:** pass [BR-01-TC-01, BR-01-TC-02, BR-01-TC-03, BR-01-TC-04, BR-01-TC-05, BR-01-TC-06, BR-01-TC-07, BR-01-TC-08, BR-01-TC-09, BR-01-TC-10, BR-01-TC-11, BR-01-TC-12, BR-01-TC-13, BR-01-TC-14, and BR-01-TC-15](../BR-01.md#test-cases).
- **BR-02 AC gate:** verify [BR-02-AC-01 through BR-02-AC-12](../BR-02.md#measurable-acceptance-criteria), including desktop/mobile destination parity and English/Dutch WCAG 2.2 AA checks.
- **BR-02 test gate:** pass [BR-02-TC-01, BR-02-TC-02, BR-02-TC-03, BR-02-TC-04, BR-02-TC-05, BR-02-TC-06, BR-02-TC-07, BR-02-TC-08, BR-02-TC-09, BR-02-TC-10, BR-02-TC-11, BR-02-TC-12, BR-02-TC-13, BR-02-TC-14, BR-02-TC-15, and BR-02-TC-16](../BR-02.md#test-cases).
- **BR-09 AC gate:** verify [BR-09-AC-01 through BR-09-AC-14](../BR-09.md#acceptance-criteria), including 320 CSS-pixel reflow, 400% zoom, explicit map/location activation, and list fallback.
- **BR-09 test gate:** pass [BR-09-TC-01, BR-09-TC-02, BR-09-TC-03, BR-09-TC-04, BR-09-TC-05, BR-09-TC-06, BR-09-TC-07, BR-09-TC-08, BR-09-TC-09, BR-09-TC-10, BR-09-TC-11, BR-09-TC-12, BR-09-TC-13, and BR-09-TC-14](../BR-09.md#test-cases).
- **Inherited gate:** rerun affected v0.41 acceptance and regression tests; all critical accessibility/privacy/trust/non-map gates and the BR-04 P0 gate must remain true.
- Acceptance requires evidence from the implemented consumer experience; specifications and screenshots alone are not proof.

## Test and evidence strategy

- Use unit/component checks for navigation models, locale keys, parameter validation, disclosure states, focus restoration, and responsive rendering.
- Use integration checks for search/map request ordering, grouped scope, safe return paths, canonical URL round trips, history, cancellation, and stale responses.
- Use end-to-end tests for fresh/guest/account journeys, errors, empty states, permission denial, Back/Forward, sign-in cancel/return, and both locales.
- Test keyboard, screen reader, touch, contrast, reduced motion, 200–400% zoom, 320 CSS pixels, portrait/landscape, safe areas, and virtual keyboards.
- Verify no map SDK, tile, map-data request, or geolocation prompt occurs before its explicit action; block the map provider to prove list resilience.
- Inspect analytics and copied URLs to ensure queries/coordinates/private preferences/account data/tokens are not exposed beyond approved contracts.
- Capture BR-01 evidence [BR-01-SS-01 through BR-01-SS-05](../BR-01.md#future-screenshot-capture-matrix).
- Capture BR-02 evidence [BR-02-SS-01 through BR-02-SS-06](../BR-02.md#future-screenshot-capture-matrix).
- Capture BR-09 evidence [BR-09-SS-01 through BR-09-SS-10](../BR-09.md#future-screenshot-capture-matrix), in both locales where copy differs.
- Record build, locale, viewport, state, browser/OS where required, and capture date; redact personal data and never stage fabricated results.
- Screenshots support visible-state review only; network, permission, focus, semantics, history, and security require executable evidence.

## Roles and decision ownership

- Product owns scope, proposition truthfulness, current-availability wording, and acceptance sign-off.
- Design/content/localization own hierarchy, bilingual equivalence, disclosure clarity, and prohibited-claim review.
- Frontend owns semantic responsive components, routing/state, navigation, focus, and map lazy-loading integration.
- Backend/data owners validate existing contracts and source grouping without inventing coverage or verification.
- Accessibility and privacy/security specialists own their respective gate evidence and regression assessment.
- QA owns traceability across every assigned AC, TC, device/locale state, and screenshot matrix item.
- Release operations owns controlled exposure, monitoring, rollback execution, and preservation of prior data.

## Rollout, go/no-go, monitoring, and rollback

- Use the existing reversible release-control mechanism if one exists; do not introduce an unreviewed parallel flag system.
- Increase exposure only after smoke checks confirm list-first use, local-only default, bilingual navigation, safe URLs, and no eager map/location behavior.
- **Go** only when every assigned AC/TC passes, required captures are recorded, and all affected v0.41 gates pass unchanged.
- **No-go** on mixed-language changed UI, unsupported global-coverage claims, inaccessible navigation/reflow, privacy leakage, eager map/location activation, broken list fallback, or lost criteria.
- Monitor privacy-approved aggregate route errors, search completion, menu abandonment, map opt-in/failure, location-denial recovery, overflow, and performance; collect no raw query/coordinate/account data.
- Roll back v0.42 presentation and navigation through the existing mechanism while keeping validated canonical links and accepted v0.41 list/scope/accessibility/trust/privacy behavior operational.
- Do not roll back or migrate consumer data destructively; preserve prior state contracts, avoid irreversible schema changes, and verify access/privacy controls after rollback.
- Escalate any regression of a critical or P0 inherited gate immediately and halt further exposure.

## Estimate caveats

- Ranges are provisional combined design, engineering, and QA person-days, not elapsed duration or commitments.
- Do not sum BR ranges as the actual v0.42 total: navigation, state, accessibility, privacy, localization, responsive work, and tests overlap.
- Identify and deduct/credit the minimum BR-02/09 foundation already delivered for v0.41 before producing a release forecast; do not double-count it.
- Re-estimate after live-code inspection if routes, contracts, localization, map separation, identity, data, test coverage, or release controls differ from assumptions.
- Estimates exclude global rollout, new dataset acquisition, ongoing verification, infrastructure/vendor charges, approval waits, and legal-review lead time.