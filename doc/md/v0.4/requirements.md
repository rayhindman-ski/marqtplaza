# MarqtPlaza v0.4 — Business Requirements

## Enhancement assessment summary

These are proposed planning assessments, not verified production severity ratings or committed delivery dates. Effort covers each linked implementation specification, including design, implementation, integration, and testing.

| Requirement | Priority | Criticality | Complexity | Estimated effort |
|---|---|---|---|---|
| [BR-01 — Clear value proposition](./BR-01.md) | P1 — High | High | Low | 3–5 person-days |
| [BR-02 — Clear navigation labels and hierarchy](./BR-02.md) | P1 — High | High | Medium | 5–8 person-days |
| [BR-03 — Non-map discovery](./BR-03.md) | P0 — Release gate | Critical | High | 10–15 person-days |
| [BR-04 — Transparent search scope](./BR-04.md) | P0 — Release gate | High | Medium | 5–8 person-days |
| [BR-05 — Relevant local context](./BR-05.md) | P1 — High | Medium | Medium | 6–10 person-days |
| [BR-06 — Accessible discovery and navigation](./BR-06.md) | P0 — Release gate | Critical | Very high | 15–25 person-days |
| [BR-07 — Trust and freshness information](./BR-07.md) | P0 — Release gate | Critical | High | 12–20 person-days |
| [BR-08 — Clear privacy information and controls](./BR-08.md) | P0 — Release gate | Critical | Very high | 15–25 person-days |
| [BR-09 — Mobile-first experience](./BR-09.md) | P1 — High | High | High | 10–15 person-days |
| [BR-10 — Clear result-to-action path](./BR-10.md) | P1 — High | High | High | 12–20 person-days |
| [BR-11 — Clear account and registration value](./BR-11.md) | P2 — Normal | Medium | High | 10–15 person-days |
| [BR-12 — Dutch-English localization parity](./BR-12.md) | P1 — High | High | High | 10–18 person-days |

## Assessment definitions and estimation basis

### Priority — proposed delivery order

- **P0 — Release gate:** resolve before releasing the affected v0.4 journey or claim. Used for essential non-map access, informed search scope, accessibility, sensitive trust claims, and privacy controls. This is not a claim that a production emergency has been confirmed.
- **P1 — High:** prioritize for v0.4 once prerequisite release gates are addressed; these enhancements materially affect comprehension, discovery, and usability.
- **P2 — Normal:** sequence after core discovery and release-gate work; do not let account enhancements delay usable guest discovery.
- Priority is a sequencing recommendation, not a deadline. Dependencies can require work to proceed together. Release gates apply even when their implementation is shared with a lower-priority requirement.

### Criticality — impact of omission or failure

- **Critical:** could exclude consumers from essential discovery or create material privacy, safety, or misleading-trust risks.
- **High:** could materially undermine informed choices, task completion, or access for a substantial user group.
- **Medium:** could reduce relevance, clarity, or account adoption while a core discovery path remains available.
- Criticality describes potential impact; it does not assert that the risk has been observed in production.

### Complexity — implementation difficulty

- **Low:** bounded copy/presentation changes using existing components and contracts.
- **Medium:** multiple components or states with limited integration and validation.
- **High:** coordinated frontend/data/API changes, state persistence, or substantial cross-screen testing.
- **Very high:** cross-cutting remediation or multi-system processing with specialist verification and significant uncertainty.
- Complexity and effort are separate: the former describes difficulty and coordination; the latter estimates work volume.

### Effort estimation

- All ranges are **provisional person-days**, where one person-day is approximately eight working hours. They represent combined design, engineering, and QA effort, not elapsed calendar duration.
- Each estimate covers the full linked BR implementation specification, not just the short business requirement or a text edit. The individual files contain work-package breakdowns and feature-specific rationale.
- Estimates assume existing core search, identity, and data contracts can be reused, and that required content, policy decisions, and representative test data are available.
- Shared work is counted within each standalone BR estimate. **Do not sum the ranges as a project total** without removing overlap in navigation, search/list state, accessibility, privacy, localization, and testing.
- Estimates exclude global rollout, acquisition or verification of new datasets, ongoing verification operations, infrastructure/vendor charges, third-party approval waits, and legal review lead times.
- MarqtPlaza's product vision is global; the current Hague implementation is the assessment baseline, not a permanent geographic limit.
- The Hague restriction exists for development and assessment only. It MUST NOT
  be presented in customer-facing copy as a feature, current market,
  availability promise, launch geography, or permanent product boundary.
- Inspect the live application's code, contracts, coverage, and existing tests before committing to a schedule. Re-estimate if core capabilities are missing, scope changes, or integration risks exceed these assumptions.

## BR-01 — Clear value proposition

MarqtPlaza must clearly explain why a consumer should choose it instead of familiar search and map products.

## BR-02 — Clear navigation labels and hierarchy

Navigation must provide sufficient labels and a clear hierarchy so consumers can understand the purpose of visible controls without relying solely on icons.

## BR-03 — Non-map discovery

Consumers must be able to discover places through a usable list or neighbourhood-browse alternative without depending on the map.

## BR-04 — Transparent search scope

MarqtPlaza must clearly explain the meaning and effect of “Also search online,” including how its scope differs from local search.

## BR-05 — Relevant local context

The consumer experience must provide visible Hague neighbourhoods, local categories, and current examples to support locally relevant discovery.

## BR-06 — Accessible discovery and navigation

The experience must address accessibility barriers involving icon names, focus, contrast, semantics, and map-only discovery.

## BR-07 — Trust and freshness information

MarqtPlaza must provide checked-on dates, sources, verification status, and appropriate caveats for sensitive claims so consumers can assess the reliability and freshness of information.

## BR-08 — Clear privacy information and controls

Consumers must receive explicit explanations of geolocation, online-search scope, privacy controls, data retention, and deletion.

## BR-09 — Mobile-first experience

The consumer experience must support mobile-first reflow, progressive disclosure, and map lazy-loading rather than rely on a desktop-first composition.

## BR-10 — Clear result-to-action path

Discovery must provide practical filters, useful result cards, and explicit next actions to help consumers move from results to action.

## BR-11 — Clear account and registration value

MarqtPlaza must explain the consumer benefit of registration and having an account rather than rely on the visible “UserRole user” control to communicate account value.

## BR-12 — Dutch-English localization parity

The experience must provide complete Dutch-English parity and consistent geographical terminology.