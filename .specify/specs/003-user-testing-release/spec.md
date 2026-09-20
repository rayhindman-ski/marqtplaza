# Feature Specification: User Testing Release

**Feature Branch**: `003-user-testing-release`  
**Created**: 2026-09-15  
**Status**: Converged  
**Input**: Address the findings recorded in `doc/md/user-testing.md` and publish a new GitHub release.

## Context

### Problem

The discovery interface hides useful information behind map clusters, overview cards do not behave like obvious disclosures, stored-only cache misses can look like broken Food & Drink or business loading, and Food & Drink cannot be narrowed by venue type. News and event metadata exists but must remain explicit when source data is missing.

### Users and scope

- **Primary user**: Hague resident or visitor discovering nearby activities and businesses.
- **Product area**: map discovery, listing cards, Food & Drink filters, news and event metadata.
- **In scope**: cluster result previews, accessible card disclosure behavior, live retry from stored-only cache misses, source-derived Food & Drink subcategories, explicit unknown date/price copy, regression coverage, release notes.
- **Out of scope**: inventing dates/prices, enabling unverified Google Places traffic, weakening neighborhood polygons, bulk event scraping, or adding unverified social-map organizations.

## User scenarios and acceptance

### User Story 1 — Understand map and overview results (Priority: P1)

**As a** resident  
**I want** number badges and overview cards to reveal their listings  
**So that** I can understand results without guessing what a map control does.

**Why this priority**: The current interaction looks broken even when listings were loaded successfully.

**Independent test**: Open a discovery result with overlapping markers, activate a number badge, and inspect/choose a listing from the revealed summary; activate an overview card and observe its details expand.

**Acceptance scenarios**:

1. **Given** a cluster with multiple listings, **when** its badge is activated, **then** a localized summary names the contained listings and offers a way to zoom or open one.
2. **Given** a collapsed overview card, **when** its main disclosure area is activated by pointer or keyboard, **then** its additional details expand and `aria-expanded` reflects the state.

### User Story 2 — Recover missing business results (Priority: P1)

**As a** resident  
**I want** a clear recovery action when saved results are unavailable  
**So that** Food & Drink or business discovery does not appear permanently broken.

**Why this priority**: A remembered stored-only preference can produce an empty cache response for a valid area.

**Independent test**: Store external sources as disabled, open an uncached neighborhood, and use the localized live-search action shown with the cache-miss state.

**Acceptance scenarios**:

1. **Given** a stored-only cache miss, **when** results render, **then** the interface explains that no saved results exist and offers a live search.
2. **Given** the user chooses live search, **when** the request reruns, **then** mode changes to live and the preference is persisted.

### User Story 3 — Narrow food results and trust metadata (Priority: P2)

**As a** resident  
**I want** Food & Drink types and honest metadata  
**So that** I can find the venue I need and understand what the source did or did not provide.

**Why this priority**: It improves relevance after the P1 result-access defects are resolved.

**Independent test**: Load mixed Food & Drink fixtures and filter restaurants, cafés, bars, bakeries, takeaways, and other food listings.

**Acceptance scenarios**:

1. **Given** source-tagged food listings, **when** a Food & Drink subtype is selected, **then** only matching listings remain.
2. **Given** an event without price evidence, **when** its card renders, **then** it says price unknown.
3. **Given** a news article without a publication date, **when** its card renders, **then** it says date unknown rather than implying recency.

## Functional requirements

- **FR-001**: Cluster activation MUST reveal a localized listing summary as well as retain a zoom action.
- **FR-002**: The selected cluster listing MUST remain independently selectable and visible.
- **FR-003**: Overview cards MUST start collapsed and expose one keyboard-accessible disclosure control for their details.
- **FR-004**: Stored-only mode MUST never turn a cache miss into an unexplained generic empty state.
- **FR-005**: Live retry MUST update both the current query mode and the persisted discovery preference.
- **FR-006**: Food subtypes MUST be derived from provider type/tag evidence and include an `other` fallback.
- **FR-007**: Unknown dates and prices MUST be labeled as unknown; the system MUST NOT infer values.
- **FR-008**: All new controls and copy MUST support Dutch and English.

## Data and contracts

- **Entities**: Add optional `foodType` to listings with `restaurant`, `cafe`, `bar`, `bakery`, `takeaway`, or `other`.
- **Relationships**: No ownership changes.
- **API changes**: Extend the OpenAPI Listing response with optional `foodType`.
- **Persistence**: Existing stored JSON accepts the additive field; no schema migration.
- **Generated artifacts**: Regenerate Zod and React clients.

## Edge cases and failure states

- Coincident points may remain clustered at maximum zoom; the summary must still expose them.
- Stored-only can return some sections while another section is a cache miss.
- Provider tags can be missing or unfamiliar; classify those as `other`.
- Date/price can be absent or malformed; render localized unknown copy.
- Cluster summary and card disclosure must work by keyboard and on mobile.
- Provider timeout remains an explicit error/fallback state.

## Success criteria

- **SC-001**: Browser regression proves a cluster reveals listing names and overview cards expand on click.
- **SC-002**: Browser regression proves a stored-only cache miss can switch to live mode.
- **SC-003**: API/unit regression proves Google and OSM food evidence maps to all supported food types.
- **SC-004**: Workspace typecheck, package tests, build, and preview validation pass.

## Assumptions and open questions

- “More events and social” requires source-health and coverage work; this release does not substitute unverified quantity for trustworthy listings.

## Risks and follow-up

- Additive listing fields can be absent in older stored snapshots; UI fallback handles that.
- Source-specific cuisine filtering can be expanded later without changing the top-level contract.