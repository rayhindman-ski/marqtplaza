# Release v0.41 — Critical discovery, accessibility, trust, and privacy

## Status and objective

**Status:** Proposed release plan; no implementation, release date, or completed acceptance is implied.

Deliver the critical requirements and all P0 release gates before expanding the consumer experience in [v0.42](./release_v0.42.md) and [v0.43](./release_v0.43.md).

MarqtPlaza is a global product. The current Hague implementation is the initial delivery and test baseline, not a permanent geographic boundary. This release does not launch worldwide coverage.

Source of truth: [business requirements and assessment definitions](../requirements.md).

## Release allocation

| Release | Full-delivery ownership | Allocation rule |
|---|---|---|
| v0.41 | BR-03, BR-04, BR-06, BR-07, BR-08 | All four Critical items plus the remaining P0 release gate |
| v0.42 | BR-01, BR-02, BR-09 | Three of the six P1 high-priority enhancements |
| v0.43 | BR-05, BR-10, BR-12, BR-11 | Remaining three P1 enhancements and the P2 enhancement |

Each requirement has one full-delivery release. Shared prerequisites may be delivered earlier without claiming that the entire later requirement is complete.

## In-scope enhancements

| Requirement | Priority | Criticality | Complexity | Provisional effort |
|---|---|---|---|---|
| [BR-03 — Non-map discovery](../BR-03.md) | P0 — Release gate | Critical | High | 10–15 person-days |
| [BR-04 — Transparent search scope](../BR-04.md) | P0 — Release gate | High | Medium | 5–8 person-days |
| [BR-06 — Accessible discovery and navigation](../BR-06.md) | P0 — Release gate | Critical | Very high | 15–25 person-days |
| [BR-07 — Trust and freshness information](../BR-07.md) | P0 — Release gate | Critical | High | 12–20 person-days |
| [BR-08 — Clear privacy information and controls](../BR-08.md) | P0 — Release gate | Critical | Very high | 15–25 person-days |

**Why BR-04 is included:** its criticality is High, but its priority is P0. Informed external-search choices are dependencies of the critical privacy and trust work; deferring them would leave a release gate unresolved.

## Consumer outcomes

- Search and browse a usable list without loading a map, granting location access, or registering.
- Understand and explicitly choose local-only versus additional web results.
- Navigate the released journeys with keyboard and assistive technology.
- Inspect field-level sources, checked dates, status, and sensitive-claim caveats.
- Control optional processing and obtain accurate retention, correction, and deletion information.
- Recover from empty results, service failure, denied permissions, and cancelled sign-in without losing safe discovery context.

## Entry criteria

- Identify and inspect the actual live consumer application's repository, routes, contracts, providers, data stores, and tests. The workspace report viewer is not the implementation target.
- Inventory existing search, location, account, correction, and deletion capabilities; re-estimate missing foundations before committing a schedule.
- Agree supported-location data, trust-status definitions, freshness thresholds, processing purposes, retention rules, and deletion exceptions with accountable owners.
- Establish a baseline for the affected guest/account journeys and a non-production environment with representative, non-sensitive fixtures.
- Assign the roles below and confirm how release controls, audit evidence, monitoring, and operational recovery will work.

## Implementation sequence

### 1. Shared contracts and safeguards

1. Define validated public search state and history behavior shared by list, map, filters, scope, and locale.
2. Exclude coordinates, tokens, account identifiers, and private preferences from shared URLs and telemetry.
3. Inventory provider requests and enforce explicit scope/location choices in both client and server behavior.
4. Define field-level trust metadata, explicit unknown states, stale/conflicting states, and approved caveats.

### 2. Discovery and scope

1. Implement manual location selection, list results, detail entry, history restoration, and retry without map dependencies.
2. Default fresh sessions to local-only; add explanatory web opt-in and independently labelled source groups.
3. Load the map only following **Show map**; request geolocation only following **Use my location**.
4. Ensure map failure, web-provider failure, or denied location access does not disable successful local discovery.

### 3. Trust, correction, and privacy

1. Render source/date/status per decision-relevant field, including unknown, stale, conflicting, loading, and failure states.
2. Add privacy-disclosed, validated, idempotent correction submission without automatically publishing changes.
3. Implement privacy notices, withdrawal, accurate browser-data clearing, and authorized account-deletion status and outcomes.
4. Exercise real processing paths, including retries and retained-data exceptions; do not substitute success messages for completed actions.

### 4. Accessibility and integrated verification

1. Apply BR-06 throughout the specified discovery/navigation surfaces, including account and privacy paths.
2. Implement keyboard operation, semantic names, focus recovery, status announcements, contrast, touch-target sizing, and reflow.
3. Deliver Dutch and English parity for all changed visible and programmatic copy.
4. Run the full assigned acceptance suites, collect screenshots and interaction evidence, and resolve release-gate failures.

## Cross-release dependencies

| Later-owned requirement | Required foundation in v0.41 | Work retained for later release |
|---|---|---|
| BR-01 / v0.42 | Truthful current-availability and scope copy; no single-city product positioning | Full proposition, benefits explanation, and content validation |
| BR-02 / v0.42 | Accessible names, essential visible labels, focus, and working navigation needed by BR-06 | Broader information hierarchy and navigation refinements |
| BR-05 / v0.43 | Real location/category identifiers and enough existing location context to use non-map browsing | Richer local categories, examples, and coverage presentation |
| BR-09 / v0.42 | Accessible reflow and explicitly requested map loading required by P0 criteria | Broader mobile composition, progressive disclosure, and performance work |
| BR-10 / v0.43 | Working list/detail actions and trust metadata needed by BR-03 and BR-07 | Complete practical filtering and richer result-to-action experience |
| BR-11 / v0.43 | Required account/authentication integration, protected deletion, guest access, and sign-in context restoration | Full account-benefit presentation and remaining save/return enhancements |
| BR-12 / v0.43 | Shared locale conventions and complete EN/NL parity on all v0.41 surfaces | Full-site parity audit and remaining terminology remediation |

If a required foundation does not exist, implement it in v0.41 or block release and revise scope explicitly. Do not mark an assigned criterion passed merely because its prerequisite is scheduled later. In particular, account-dependent P0 criteria cannot be deferred under the BR-11 label.

Record shared work and its tests once, then credit it against the later BR estimate. Accessibility and privacy remain release gates for every subsequent change.

## Acceptance and test evidence

Full specifications remain authoritative; this plan does not replace or weaken their criteria.

| Requirement | Required acceptance coverage | Required test coverage |
|---|---|---|
| BR-03 | All BR-03-AC criteria in [BR-03](../BR-03.md#measurable-acceptance-criteria) | All BR-03-TC cases |
| BR-04 | All BR-04-AC criteria in [BR-04](../BR-04.md#measurable-acceptance-criteria) | All BR-04-TC cases |
| BR-06 | All BR-06-AC criteria in [BR-06](../BR-06.md#acceptance-criteria) | All BR-06-TC cases |
| BR-07 | All BR-07-AC criteria in [BR-07](../BR-07.md#acceptance-criteria) | All BR-07-TC cases |
| BR-08 | All BR-08-AC criteria in [BR-08](../BR-08.md#acceptance-criteria) | All BR-08-TC cases |

- Run unit/contract tests for parameter validation, source grouping, trust transitions, authorization, and idempotency.
- Run integrated guest/account journeys through success, empty, partial failure, denied permission, cancellation, retry, and history restoration.
- Verify keyboard and screen-reader use, 320 CSS-pixel reflow, zoom, desktop/mobile behavior, and EN/NL parity.
- Inspect network and storage behavior to prove that optional provider/geolocation processing does not happen prematurely.
- Capture the target states listed in each assigned BR's **Future screenshot capture matrix**, recording build, locale, viewport, state, and date.
- Treat existing baseline screenshots as reference only. Screenshots cannot establish network privacy, deletion correctness, or screen-reader accessibility; attach the corresponding test evidence.

## Ownership and release decision

| Role | Responsibility |
|---|---|
| Product owner | Confirm scope, current coverage, global positioning, and consumer outcomes |
| Engineering lead | Own contracts, integrations, safe delivery controls, and recovery readiness |
| Data/content owner | Approve sources, freshness/status policy, and correction operations |
| Privacy owner | Approve processing disclosures, retention, withdrawal, and deletion outcomes |
| Accessibility/QA lead | Verify all mapped criteria and retain evidence |
| Release owner | Coordinate documented go/no-go, monitored rollout, and incident decisions |

**Go:** all assigned criteria pass; no unresolved defects violating these gates; required policies and operational ownership are approved; recovery is rehearsed.

**No-go:** blocked non-map discovery, premature optional processing, inaccessible essential actions, misleading trust/safety claims, unauthorized or falsely reported deletion, or any other failed assigned criterion.

## Rollout, monitoring, and recovery

1. Validate in a non-production environment, then expose a limited cohort using existing release controls where available.
2. Monitor list/search failures, provider request gating, map-load failures, correction/deletion processing errors, and reported accessibility regressions without logging sensitive query/location/account data.
3. Expand exposure only after the release owner reviews acceptance evidence and observed failures against the pre-agreed operational baseline.
4. On a gate regression, stop expansion and disable the affected optional processing or feature while preserving a safe list-based discovery path.
5. Roll back presentation or compatible application changes only if they retain privacy choices, accessibility protections, queued correction/deletion work, and valid public links.
6. Never restore deleted personal data to reverse a release; use a forward fix or disable affected processing when reverting would violate completed deletion or consent decisions.

## Effort and exclusions

The per-BR ranges above are provisional combined design/engineering/QA person-days, not elapsed duration. Do not sum them into a release commitment: shared search state, trust cards, accessibility, localization, and testing overlap.

Deduplicate work packages, identify the critical dependency path, and re-estimate missing foundations before assigning capacity or dates. Third-party/legal lead times, new dataset acquisition, ongoing verification operations, and global rollout are excluded under the [estimation basis](../requirements.md#effort-estimation).

Full delivery of BR-01, BR-02, and BR-09 remains in v0.42; BR-05, BR-10, BR-11, and BR-12 remain in v0.43. No production publishing or application changes are authorized or performed by this document.