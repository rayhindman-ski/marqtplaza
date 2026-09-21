# Feature Specification: v0.43 local context, actions, accounts, and localization

**Feature Branch**: `feature/v043-enhancements`  
**Created**: 2026-09-20  
**Status**: Ready for plan  
**Input**: Implement `doc/md/v0.4/release/release_v0.43.md` after accepted v0.42.

## Context

### Problem

The current development build uses Hague data and has strong list and map foundations,
but public discovery state is only partly shareable, result actions and failure
recovery are inconsistent, account value is not always tied to working benefits,
and consumer routes do not yet prove atomic Dutch/English parity.

### Users and scope

- **Primary users**: local residents and visitors; guests and signed-in members.
- **Product areas**: local discovery, details/actions, favourites, accounts,
  privacy, and consumer localization.
- **In scope**: BR-05, BR-10, BR-11, BR-12; all applicable v0.41/v0.42 gates.
- **Development boundary**: the current fixture data is Hague-based, but that
  restriction is not a feature, market promise, or customer-facing product claim.
- **Out of scope**: additional production datasets, additional languages, invented listings
  or actions, transactions, mandatory location/map use, analytics, and unsupported
  quality/verification/opening-hours/accessibility claims.

## User scenarios and acceptance

### User Story 1 — Understand and share local context (Priority: P1)

**As a** visitor  
**I want** to browse real Hague neighbourhood/category context and share my
validated criteria  
**So that** I can resume the same useful list without disclosing private state.

**Independent test**: Open a crafted public URL in a fresh browser, browse without
map/location permission, switch locale, use Back/Forward, and recover from an
unsupported city or failed optional map.

**Acceptance scenarios**:

1. Fresh guests see a location-independent proposition with no Hague-only
   availability claim and can browse stable neighbourhood/category choices.
2. Public criteria and locale survive reload, Back/Forward, and sharing; unknown
   or sensitive parameters are rejected.
3. Unsupported cities and optional map/provider failures show named bilingual
   recovery while the result list remains usable.

### User Story 2 — Move from a result to a safe action (Priority: P1)

**As a** visitor  
**I want** clear filters, evidence-aware details, and only valid actions  
**So that** I can act without relying on unsupported or stale claims.

**Independent test**: Exercise known, unknown, partial, empty, loading, and failed
fixtures; open details; route only when coordinates are exact; use a safe public
source action; and cancel/retry without losing unrelated criteria.

**Acceptance scenarios**:

1. Cards and details expose source/evidence/caveat/Unknown states semantically.
2. Filters only use contract-backed fields and preserve unrelated criteria.
3. Actions are hidden or disabled when their exact contract is absent; outbound
   actions are clearly labelled and safe.
4. Progressive loading and partial/provider failures never destroy available
   results or silently widen scope.

### User Story 3 — Receive truthful account and favourite value (Priority: P1)

**As a** guest or member  
**I want** account prompts tied to working favourites and privacy controls  
**So that** registration is optional, useful, and never falsely confirms a save.

**Independent test**: Start a favourite as a guest, sign in or cancel, return to
the original public context, confirm server-backed ownership, switch accounts,
sign out, and exercise deletion truth states.

**Acceptance scenarios**:

1. Guest discovery remains complete and registration is never a browsing wall.
2. Guest favourite intent uses a sanitized return path; cancel/error returns
   without a confirmed save.
3. Signed-in favourites are owner-scoped, survive reload, and are not mirrored
   into another account or resurrected from stale anonymous state.
4. Account benefits, sign-out, retention, privacy and deletion wording match the
   inspected implementation in both locales.

### User Story 4 — Use every consumer journey in Dutch or English (Priority: P1)

**As a** Dutch- or English-speaking user  
**I want** one complete, coherent locale across every state  
**So that** navigation, errors, account flows, evidence and accessibility remain
equivalent.

**Independent test**: Run the route/state matrix in both locales, change language
during a filtered journey, and verify URL/history, formatting, labels, focus,
document language, mobile reflow, and no mixed-language frame.

**Acceptance scenarios**:

1. Locale is a validated public URL criterion and switches atomically.
2. Every consumer route has equivalent EN/NL keys, placeholders, actions,
   loading/empty/error states and accessible names.
3. Source-authored content is attributed rather than falsely translated.
4. Dates, times, numbers and plurals use locale-aware formatting.

## Functional requirements

- **FR-001**: The system MUST keep local-only search scope as the fresh default
  while preserving map-first discovery. The populated homepage and discovery
  maps load by default; web scope and location remain explicit actions.
- **FR-001A**: Official neighborhood polygons MUST visibly highlight on
  hover/focus, remain highlighted while selected, support simultaneous visible
  multi-selection, and return to the normal state when deselected.
- **FR-002**: The system MUST parse and serialize only allowlisted public
  discovery criteria, including locale, and MUST exclude tokens, user IDs,
  private coordinates, session state and unsanitized return targets.
- **FR-003**: Public criteria MUST use stable internal identifiers while labels
  remain complete in English and Dutch.
- **FR-004**: Cards and details MUST distinguish known, unknown, stale, blocked,
  approximate and unavailable evidence without unsupported claims.
- **FR-005**: The system MUST expose only actions backed by inspected listing
  fields and MUST use exact coordinates for routing.
- **FR-006**: Provider failures MUST settle independently and preserve successful
  local results and criteria.
- **FR-007**: Favourite intent MUST use safe return context and MUST not display a
  confirmed save until the account-backed operation succeeds.
- **FR-008**: Account-backed favourites MUST remain isolated by authenticated
  owner and preserve deletion tombstones/migration boundaries.
- **FR-009**: Account value, privacy, retention, deletion, auth error and sign-out
  states MUST match real capabilities and remain optional for discovery.
- **FR-010**: All consumer strings and accessible names MUST have equivalent,
  non-empty EN/NL resources; locale changes MUST update document language.
- **FR-011**: History, reload, shared links, auth detours, cancel and retry MUST
  preserve unaffected public criteria and locale.
- **FR-012**: Core journeys MUST remain keyboard-operable and usable at 320 CSS
  pixels and 400% zoom without mandatory map access.

## Data and contracts

- **Entities**: existing listings/evidence, stable public discovery criteria,
  authenticated saved events/favourites, account lifecycle state.
- **Ownership**: server identity remains authoritative; private account data is
  never encoded in public discovery state.
- **API changes**: prefer none; only contract-backed actions and existing saved
  event/account endpoints may be used. Any required contract change is OpenAPI
  first and regenerated.
- **Persistence**: no new migration planned. Existing owner-scoped saved-event
  storage and deletion lifecycle remain authoritative.
- **Generated artifacts**: regenerate API clients only if OpenAPI changes.

## Edge cases and failure states

- Invalid/unsupported city, locale, neighbourhood, section, category or filter.
- Map SDK/tile failure after explicit activation; denied location permission.
- Empty, partial, stale, blocked, malformed or failed provider response.
- Missing exact coordinates, official URL, evidence URL or contact field.
- Guest auth cancel, expired auth state, write failure, account switch/sign-out.
- Deletion pending, blocked, failed, cancelled and completed truth states.
- Slow locale transition, missing key, source-authored foreign-language content.
- Keyboard, focus restoration, screen-reader naming, 320px and 400% reflow.

## Success criteria

- **SC-001**: All BR-05/10/11/12 acceptance scenarios selected above pass in EN
  and NL without weakening v0.41/v0.42 gates.
- **SC-002**: Workspace typecheck, focused unit/integration tests, v0.42
  regressions and the v0.43 browser suite pass.
- **SC-003**: Fresh-browser network assertions prove no eager map, location or
  live-web access.
- **SC-004**: Crafted URLs and auth detours preserve allowlisted criteria and
  reject sensitive/unknown state.
- **SC-005**: Convergence evidence records exact automated results and manual
  boundaries without claiming unsupported independent audit.

## Assumptions and open questions

- The accepted v0.42 branch is the baseline.
- Existing Hague records, source fields, Clerk integration, saved-event APIs and
  account lifecycle are the only approved capabilities.
- No privacy-approved analytics baseline exists, so telemetry is not invented.
- Source-authored names/descriptions remain source language with attribution.

## Risks and follow-up

- `App.tsx` is large; isolate shared public-state/localization helpers instead of
  adding more route logic inline.
- Full real Clerk e-mail delivery is outside deterministic local validation; use
  existing controlled Clerk test-token flows for live auth evidence.
- Screen-reader quality requires manual specialist review beyond semantic and
  keyboard automation; do not claim that independent review occurred.