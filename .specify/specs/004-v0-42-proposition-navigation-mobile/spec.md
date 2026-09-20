# Feature Specification: v0.42 proposition, navigation, and mobile discovery

**Feature Branch**: `004-v0-42-proposition-navigation-mobile`  
**Source release**: `doc/md/v0.4/release/release_v0.42.md`  
**Requirements**: `doc/md/v0.4/BR-01.md`, `doc/md/v0.4/BR-02.md`, `doc/md/v0.4/BR-09.md`  
**Status**: Ready for implementation  
**Date**: 2026-09-20

## Context and users

MarqtPlaza currently has a usable Hague discovery flow, but its proposition, global
navigation, and narrow-screen composition do not yet explain the global product
vision or provide a complete, labelled, state-preserving mobile journey. The
current implementation is a Hague availability baseline, not evidence of global
coverage. The primary user is a signed-out or signed-in resident or visitor
discovering local places, events, food, social support, and community activity.

### In scope

- A bilingual, location-independent proposition with a separate current-availability
  notice (currently The Hague/Den Haag).
- A labelled, typed global navigation model shared by desktop and mobile.
- Clear account and language entry points, current-page semantics, titles, headings,
  safe return paths, focus behavior, and browser history.
- Mobile-first home, discovery list, filters/disclosures, detail, account detours,
  explicit map opt-in, optional geolocation, and failure recovery.
- Validated, public route state for supported discovery criteria.
- Focused unit, integration, browser, responsive, accessibility, localization, and
  privacy tests.

### Explicit exclusions

- No new city, neighborhood dataset, provider, ranking system, native app, offline
  map, background location tracking, or schema migration.
- No v0.43 BR-05, BR-10, BR-11, or BR-12 full-site ownership.
- No result-card action redesign or account entitlement design beyond the minimum
  labelled entry/preserved return needed here.
- No unsupported “verified”, “safe”, “complete”, “best”, allergy, freshness, or
  worldwide-coverage claim.
- No replacement of accepted v0.41 BR-03/04/06/07/08 behavior.

## Inherited v0.41 invariants

The implementation MUST preserve:

1. List-first discovery, with guest browsing and manual neighborhood selection
   available without a map or geolocation.
2. Local-only search as the fresh-session default; web results require explicit
   opt-in and remain visibly separated.
3. Explicit map activation and explicit location activation; neither may run on
   page load or as a search side effect.
4. Official neighborhood polygon filtering, stored/live/source lineage, unknown
   values, blocked/stale/empty distinctions, and existing trust caveats.
5. Safe local account return paths via
   `artifacts/buurtgids/src/lib/returnPath.ts`; no token, account identifier,
   coordinate, private preference, or session data in public URLs.
6. Existing saved-place/account ownership and moderation boundaries.
7. English/Dutch parity for every changed string, WCAG 2.2 AA semantics, visible
   focus, reduced motion, and the map/list fallback.

## User stories and independent acceptance

### US1 — Understand the product before searching (P1)

As a guest or account user, I want to understand what MarqtPlaza helps me
discover, where it is currently available, and how local versus optional web
results work, so that I can choose a useful search without a map or permission.

**Independent acceptance**: Fresh English and Dutch homepages show one semantic
`h1`, a location-independent benefit, a separate The Hague availability notice,
one primary search action, local-only scope, and a keyboard-operable explanation.
Search and manual neighborhood browsing work while map and geolocation requests
remain absent.

### US2 — Navigate by labelled hierarchy (P1)

As a consumer, I want visible and programmatic labels for destinations, language,
account, and current page so that I do not need to decode icons or internal role
strings.

**Independent acceptance**: Desktop and mobile render the same typed destination
set; mobile menu open/close/Escape/destination/focus restoration work; page title,
`h1`, route, current state, Dutch/English labels, and safe account return agree.

### US3 — Complete discovery on a phone (P1)

As a consumer on a narrow or zoomed viewport, I want search, filters, results,
details, map opt-in, location recovery, and account detours to remain usable so
that the map is optional and state is not lost.

**Independent acceptance**: At 320 CSS px through desktop there is no page-level
horizontal overflow or clipped primary action. A fresh user can go list-to-detail
without map/location access, apply/cancel filters, preserve criteria through
Back/Forward, switch list/map, recover from errors, and use Dutch or English.

## Functional requirements

- **FR-001 Proposition**: Render an explicit global discovery proposition and
  chosen-location benefit before search; keep current The Hague availability in a
  separate configurable notice.
- **FR-002 Scope**: Fresh state is local-only. “Include web results” is an explicit,
  labelled opt-in and local/web source groups remain distinct.
- **FR-003 Evidence language**: Explain source/date/status fields as aids to
  judgment and render unknown fields as unknown; never imply unsupported coverage
  or safety.
- **FR-004 List independence**: Home, list search, and manual neighborhood browse
  must function without map SDK, map tiles, or geolocation.
- **FR-005 Explicit activation**: Only a labelled Show map action starts map
  loading; only a labelled Use my location action requests geolocation.
- **FR-006 Public route state**: Allow-list and normalize city, neighborhood,
  query, category, filters, scope, locale, and (only if useful) presentation.
  Bound length and reject unknown/malformed/duplicate values safely. Exclude
  coordinates, precision, private preferences, session/account identifiers,
  tokens, and raw location analytics.
- **FR-007 State/history**: Meaningful criteria and presentation changes restore
  through Back/Forward, detail/account cancel/return, retry, and map/list changes
  without duplicate searches or ephemeral-menu history entries.
- **FR-008 Navigation model**: Define one typed destination model with route,
  label key, audience/visibility, and current matcher; use it for desktop and
  mobile. Every interactive icon has an accurate accessible name and ambiguous
  actions have visible labels.
- **FR-009 Account/language**: Replace consumer-facing “UserRole user” with an
  approved purpose label; language changes preserve criteria and switch changed
  copy atomically; account return remains local and safe.
- **FR-010 Semantics**: Use header/nav/main/heading/list semantics, skip navigation,
  `aria-current`, visible focus, logical focus movement, and trigger restoration.
  Mobile menus/sheets must be dismissible, keyboard/touch operable, and scroll safe.
- **FR-011 Responsive hierarchy**: Mobile DOM/order prioritizes proposition, query,
  neighborhood/category entry, filters, result status/cards, and next actions.
  Use progressive disclosure for secondary filters/source/privacy/detail content.
- **FR-012 Responsive resilience**: Preserve input above virtual keyboards and
  through portrait/landscape, 200–400% zoom, safe areas, reduced motion, touch
  targets, and map failure.
- **FR-013 Failure states**: Distinguish loading, empty, search error, map error,
  validation error, offline/network error, blocked/stale source, and permission
  denial. Preserve criteria and provide targeted retry/manual recovery.
- **FR-014 Guest/account**: Guest search, browse, details, and map remain usable.
  Favourites stay account-backed; sign-in cancellation/success restores safe
  originating context without leaking private state.
- **FR-015 Localization**: New English and Dutch strings have equivalent intent,
  caveats, action order, and The Hague/Den Haag terminology, including status,
  recovery, menu, filters, and map/location copy.
- **FR-016 Analytics**: If approved telemetry exists, emit only privacy-minimized
  event IDs for explanation opened, search started, scope selected, map requested,
  navigation/menu outcomes; never send query text, coordinates, tokens, account
  IDs, or private preferences. If no approved analytics exists, do not invent one.

## Acceptance-criteria traceability

### BR-01 — Clear value proposition

| Criterion | Required evidence |
|---|---|
| AC-01 | Fresh EN/NL hero has global proposition, separate current availability, one primary action, and no Hague-only identity. |
| AC-02 | Fresh storage shows local-only; explicit web opt-in is required. |
| AC-03 | Explanation distinguishes local/web sources and evidence limits without unsupported claims. |
| AC-04 | List/search/manual browse pass with map and geolocation blocked/not requested. |
| AC-05 | Map network/import begins only after Show map. |
| AC-06 | Geolocation begins only after Use my location; denial leaves manual browse. |
| AC-07 | URL round trip includes only validated public criteria and excludes sensitive state. |
| AC-08 | Empty/error retain criteria and offer relevant recovery. |
| AC-09 | Signed-out search and browse have no registration wall. |
| AC-10 | Copy scan rejects unsupported verification/safety/completeness/worldwide-live claims. |
| AC-11 | EN/NL content has equivalent intent and terminology. |
| AC-12 | Semantic, keyboard, focus, contrast, zoom, and reflow checks pass. |

### BR-02 — Navigation labels and hierarchy

| Criterion | Required evidence |
|---|---|
| AC-01 | Header accessibility tree and visible labels agree for every interactive icon/action. |
| AC-02 | Desktop/mobile expose the same essential destinations and current cue. |
| AC-03 | No “UserRole user” or unexplained internal role text reaches consumer UI. |
| AC-04 | Each tested destination has one descriptive `h1`, document title, and route. |
| AC-05 | Mobile menu supports open, close, Escape, destination selection, and focus restoration. |
| AC-06 | Language switch preserves validated criteria with no mixed new copy. |
| AC-07 | Guest can reach search/neighborhood browse without sign-in. |
| AC-08 | Map/location are separate labelled explicit actions. |
| AC-09 | Public URLs are allow-listed and contain no sensitive state. |
| AC-10 | Back/Forward restore route/criteria while menus stay closed. |
| AC-11 | Route loading/empty/error/permission states retain global navigation. |
| AC-12 | EN/NL desktop/mobile/200% checks meet WCAG target. |

### BR-09 — Mobile-first experience

| Criterion | Required evidence |
|---|---|
| AC-01 | 320 CSS px through supported desktop has no page overflow/clipped primary action. |
| AC-02 | Fresh list-to-detail works with map SDK/location blocked. |
| AC-03 | No map SDK/tile/data request before Show map. |
| AC-04 | Only Use my location requests permission; denial preserves manual alternative. |
| AC-05 | Local-only default, explicit opt-in, source grouping. |
| AC-06 | Validated criteria URL excludes coordinates/private/token state. |
| AC-07 | Back/Forward, list/map, retry, sign-in cancel preserve criteria/context. |
| AC-08 | Loading/empty/error/denied states are labelled, announced, recoverable. |
| AC-09 | Focus remains logical and visible through menu/filter/results/map/dialog. |
| AC-10 | 400% zoom and portrait/landscape remain usable except map panning. |
| AC-11 | Guest browse/favorite explanation and safe account context work. |
| AC-12 | All new mobile copy has EN/NL parity and correct Hague terminology. |
| AC-13 | Current Hague-only availability is clear without unsupported coverage. |
| AC-14 | Map failure leaves list discovery intact and actionable. |

## Data, contracts, and persistence

- **API/OpenAPI**: No new endpoint or request/response field is required by this
  specification. Inspect existing listings/account/weather contracts first. Do
  not change OpenAPI or run codegen unless implementation proves an existing
  contract cannot express the required behavior; any such change requires a
  compatibility plan and generated outputs.
- **Database/schema**: None. Do not add migrations, indexes, or seed data.
- **Client state**: Public route state may be encoded in existing navigation
  conventions. Ephemeral menu/focus state stays in memory. No coordinates,
  account/session data, tokens, or private preferences are persisted publicly.
- **Analytics**: No new analytics dependency or schema without privacy approval.

## Failure, edge, and security cases

- Invalid, overlong, duplicate, unknown, or encoded route parameters normalize to
  safe defaults with understandable recovery, never a blank screen.
- API empty is not API failure; provider blocked/stale/unavailable remains distinct.
- Map SDK/tile failure does not remove list results. Location denial/timeout does
  not remove manual neighborhoods and does not repeatedly prompt.
- Slow/cancelled responses cannot overwrite newer criteria.
- Sign-in cancel and malformed/external return paths resolve to safe local routes.
- Long Dutch labels, large text, keyboard, reduced motion, landscape, 320px, and
  400% zoom receive the same semantic actions as desktop English.
- Unknown source/date/status values are displayed honestly; no fabricated listing
  data or screenshot evidence is acceptable.

## Success and evidence

- **SC-001**: All 38 BR-01/02/09 acceptance criteria have executable evidence or
  a documented manual boundary; all inherited v0.41 regression gates remain green.
- **SC-002**: EN/NL guest and account journeys are usable at desktop, 320px,
  390×844, landscape, and 200–400% zoom with no prohibited map/location eagerness.
- **SC-003**: Root typecheck and focused unit/browser suites pass; screenshots
  record build, locale, viewport, and state and are not treated as behavioral proof.
- **SC-004**: A convergence record documents deviations, exclusions, rollback,
  deferred work, and exact command/evidence results.

## Open decisions

- Reconcile the existing route shape with the proposed public state before coding;
  do not add speculative `GET /api/discovery`.
- Confirm the approved navigation destination set and final bilingual copy with
  product/content ownership; prohibit invented claims until approved.
- Confirm whether an existing release flag or telemetry mechanism exists. Do not
  create a parallel mechanism.