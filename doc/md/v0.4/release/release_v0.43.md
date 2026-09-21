# MarqtPlaza v0.43 proposed release plan

## Goal and status

- **Status:** Proposed plan; no behavior in this plan is claimed implemented, verified, scheduled, or committed.
- **Goal:** Complete BR-05, BR-10, BR-11, and BR-12 after acceptance of [v0.42](./release_v0.42.md), while preserving every applicable v0.41 critical/P0 gate.
- [v0.41](./release_v0.41.md) is the critical-foundation release; v0.42 supplies accepted value, navigation, and mobile foundations; this release completes its four assigned BRs exactly once.
- The current Hague dataset is a development and evidence fixture only. It is
  never presented as a customer-facing availability feature or product boundary.
- “The Hague”/“Den Haag” describes present supported coverage, not a permanent product boundary or a claim of global rollout.
- Present localization scope is bilingual English/Dutch; additional global locales and datasets remain future work.

## Release scope

| Full-delivery requirement | Priority | Criticality | Complexity | Provisional effort |
|---|---|---|---|---|
| [BR-05 — Relevant local context](../BR-05.md) | P1 — High | Medium | Medium | 6–10 person-days |
| [BR-10 — Clear result-to-action path](../BR-10.md) | P1 — High | High | High | 12–20 person-days |
| [BR-11 — Clear account and registration value](../BR-11.md) | P2 — Normal | Medium | High | 10–15 person-days |
| [BR-12 — Dutch-English localization parity](../BR-12.md) | P1 — High | High | High | 10–18 person-days |

## Inclusion rationale

- BR-05 turns the Hague baseline into explicit neighbourhood/category context and real, dated examples without implying broader coverage.
- BR-10 completes the practical list-to-filter-to-detail-to-valid-action journey on the accepted non-map, scope, trust, privacy, accessibility, and mobile foundations.
- BR-11 follows usable guest discovery so account prompts can state only inspected, working benefits and favourites can use real result context.
- BR-12 performs the full-site parity audit and closes static, dynamic, exceptional, account, privacy, and accessible-language gaps.
- BR-12 does not excuse delayed translation: each earlier release must ship every changed UI string and behavior in EN and NL together.

## Excluded or deferred

- No global rollout, non-Hague dataset acquisition, language beyond EN/NL, ongoing verification operation, or third-party/legal lead time.
- No unsupported opening-hours, accessibility, allergy-safety, merchant-quality, ranking, completeness, or universal-verification claim.
- No invented filters, actions, contact data, account benefits, source records, or production example content.
- No mandatory map/geolocation, automatic web-scope widening, guest registration wall, or in-product third-party transaction.
- No change to BR specifications, requirements, project tasks, or policy terms; implementation must reconcile proposals with inspected contracts.

## Entry criteria

- [v0.42](./release_v0.42.md) is accepted, including its full BR-01, BR-02, and BR-09 gates.
- [v0.41](./release_v0.41.md) BR-03/04/06/07/08 critical and P0 gates are still passing in both locales on supported viewports.
- Live routes, schemas, search/source contracts, identity/session model, localization framework, content ownership, and policy are inspected; absence or incompatibility triggers re-estimation.
- Authoritative Hague neighbourhood/category records, real example records, approved bilingual terminology, and representative non-sensitive fixtures are available.
- Filter/action fields, provenance rules, outbound destinations, account benefits, retention, and deletion behavior are approved from actual capabilities.
- Feature flags, reversible migrations, privacy-approved telemetry, rollback ownership, and evidence storage are ready before exposure.

## Foundational work and cross-release dependencies

| Foundation | Earliest release and boundary | v0.43 use |
|---|---|---|
| Non-map list, local-only default, explicit web opt-in, WCAG, trust, privacy | v0.41 fully delivers BR-03/04/06/07/08 | Remain hard gates for BR-05/10/11/12 |
| Trust-card slots and basic valid-action affordances | v0.41 may deliver only the minimum needed to expose BR-07 evidence/caveats and make its own journeys operable | BR-10 owns complete cards, filters, details, action set, and full state handling; credit shared effort here |
| Locale-aware Hague location labels | v0.41 may add minimum EN/NL labels needed for its gated controls and states | BR-05 owns full local context; BR-12 owns the full-site terminology/parity audit |
| Account privacy/deletion entry and truth states | If inspected identity already exists, v0.41 BR-08 must expose the minimum privacy, retention, access, and deletion controls its acceptance requires | BR-11 owns complete account value/auth/favourite lifecycle; earlier work is prerequisite, not BR-11 completion |
| Value, labeled hierarchy, mobile reflow/lazy map | v0.42 fully delivers BR-01/02/09 | Used and regression-tested across all v0.43 journeys |
| Account-backed favourite hook | Implement with BR-10 result actions, then finish with BR-11 authorization/lifecycle | One shared implementation, no duplicate completion claim |
| Locale infrastructure and per-feature EN/NL strings | Minimum capability may begin in v0.41 and expands in every changed feature | BR-12 audits and completes parity across the whole present consumer scope |

- Any later-BR capability necessary for an earlier acceptance gate is delivered minimally in that earlier release; its overlap is credited when refining the later estimate.
- Shared prerequisite delivery neither waives earlier acceptance nor marks BR-05/10/11/12 complete before v0.43.
- Critical gates remain continuously true through v0.42, v0.43, rollout, and rollback.

## Staged implementation order

1. **Reconcile:** inventory live contracts, Hague records, provenance, URLs/history, identity/privacy operations, localization resources, and existing tests.
2. **Define shared state:** stable public IDs, validated criteria, locale, source groups, field evidence, Unknown, safe actions, errors, and private-field exclusions.
3. **BR-05 context:** keep the proposition location-independent, retain
   neighbourhood/category browse and real dated examples, provide generic
   unsupported-location recovery, and never advertise the Hague fixture as a feature.
4. **BR-10 results:** implement status, contract-backed filters, semantic cards, source groups, details, safe public actions, progressive loading, and non-destructive recovery.
5. **BR-10/11 seam:** add favourite detour with safe return context; keep guest discovery complete and never present an unconfirmed save.
6. **BR-11 accounts:** complete truthful account value, auth/registration/session states, confirmed favourites, sign-out, and policy-aligned deletion lifecycle.
7. **BR-12 audit:** inventory every screen/state, govern terms, close catalog/dynamic-content gaps, validate locale routing/formatting/cache isolation, and test full-site parity.
8. **Cross-cutting hardening:** run security, privacy, WCAG 2.2 AA, 320px/400% reflow, EN/NL, map/provider-failure, and history/restoration suites.
9. **Evidence and release review:** capture real implemented states, evaluate all gates, then use controlled exposure only if every go/no-go condition passes.

## Acceptance gate

- BR-05 ACs: [BR-05-AC-01 through BR-05-AC-12](../BR-05.md#acceptance-criteria) must all pass without scope substitution.
- BR-05 tests: [BR-05-TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12](../BR-05.md#test-cases) must pass at their specified levels.
- BR-10 ACs: [BR-10-AC-01 through BR-10-AC-14](../BR-10.md#acceptance-criteria) must all pass.
- BR-10 tests: [BR-10-TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, TC-14](../BR-10.md#test-cases) must pass.
- BR-11 ACs: [BR-11-AC-01 through BR-11-AC-14](../BR-11.md#acceptance-criteria) must all pass.
- BR-11 tests: [BR-11-TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, TC-14](../BR-11.md#test-cases) must pass.
- BR-12 ACs: [BR-12-AC-01 through BR-12-AC-14](../BR-12.md#acceptance-criteria) must all pass.
- BR-12 tests: [BR-12-TC-01, TC-02, TC-03, TC-04, TC-05, TC-06, TC-07, TC-08, TC-09, TC-10, TC-11, TC-12, TC-13, TC-14](../BR-12.md#test-cases) must pass.
- Also rerun applicable v0.41/v0.42 acceptance suites; any regression in local-only scope, non-map access, WCAG, trust, privacy, EN/NL parity, or mobile use is a no-go.

## Test and screenshot evidence strategy

- Use unit/catalog checks for locale keys, placeholders, formatting, stable IDs, validators, stale responses, and safe URL/action handling.
- Use component/integration tests for cards, provenance/Unknown, source groups, filters, account states, authorization, deletion truth states, and locale equivalence.
- Use E2E/negative tests for guest-to-action, provider/map/location failure, Back/Forward, shared URLs, auth cancel/expiry, write failure, cross-account access, and unsupported city.
- Perform keyboard, screen-reader, focus, contrast, target-size, 320 CSS px, text-spacing, and 400% zoom checks in both locales.
- Capture every specified matrix state after implementation: [BR-05-SS-01–08](../BR-05.md#future-screenshot-capture-matrix), [BR-10-SS-01–10](../BR-10.md#future-screenshot-capture-matrix), [BR-11-SS-01–10](../BR-11.md#future-screenshot-capture-matrix), and [BR-12-SS-01–10](../BR-12.md#future-screenshot-capture-matrix).
- Record the matrix-required build/environment, viewport, locale, criteria/fixture/source state, and provenance; use synthetic accounts and redact personal data/tokens.
- Existing current captures are baseline observations only and cannot prove target behavior, mobile/accessibility, localization parity, auth, results, or network states.

## Roles and responsibilities

- **Product owner:** approves bounded Hague scope, truthful benefits, action semantics, and go/no-go outcome.
- **Content/data steward:** approves real Hague records, category/geography terms, provenance, freshness, caveats, and Unknown handling.
- **Design and localization roles:** define interaction hierarchy and bilingual glossary; verify semantic equivalence and long-copy layouts.
- **Frontend and backend engineers:** reconcile contracts, implement reversible UI/API/state changes, authorization, validation, and safe history/URL behavior.
- **Privacy/security roles:** approve minimization, retention/deletion truth, telemetry, threat model, outbound links, return targets, and rollback data protection.
- **Accessibility specialist and QA:** independently verify WCAG behavior, full AC/TC coverage, locale/state matrices, regressions, and evidence completeness.
- **Release operator:** controls flags/exposure, monitors approved signals, executes rollback, and records the decision.

## Rollout, monitoring, and rollback

- Start with internal/synthetic-account validation against controlled authentic Hague records, then limited flagged exposure; do not describe this as global rollout.
- **Go:** all assigned ACs/TCs and inherited gates pass, evidence is complete, migrations are reversible, and policy/content approvals match actual operations.
- **No-go:** any missing locale/state, inaccessible core journey, scope/geography broadening, unsupported trust claim, unsafe action/URL, authorization failure, privacy mismatch, or data-loss risk.
- Monitor privacy-approved aggregate search success, empty/error/partial-error rates, missing keys, context restoration, auth/favourite/deletion failures, and action starts.
- Define thresholds from observed baseline during implementation; this plan invents no numeric threshold or commitment.
- Roll back both locales together via flags or prior rendering while preserving canonical public URLs and retaining usable list discovery.
- Never roll back by deleting or corrupting accounts/favourites, replaying destructive requests, weakening authorization, exposing private state, or bypassing prior privacy/accessibility gates.
- Pause exposure and investigate if inherited critical gates fail; restore the last accepted gate-preserving version and reconcile any schema/data changes safely.

## Estimate caveats

- Ranges are provisional combined design, engineering, and QA person-days, not elapsed time or calendar commitments.
- Do not sum BR ranges as an actual release total: navigation, result state, trust, privacy, accessibility, localization, account, URL/history, and testing work overlap.
- Attribute shared prerequisite effort explicitly during re-estimation, including capability delivered in v0.41/v0.42; do not double count or silently omit it.
- Re-estimate after inspection if assumed search, identity, localization, policy, content, or data contracts are missing or materially incompatible.