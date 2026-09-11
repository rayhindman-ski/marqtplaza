# Feature Specification: Verified Event Source Evidence

**Feature Branch**: `001-verified-event-source-evidence`  
**Created**: 2026-09-11  
**Status**: Converged  
**Input**: Turn the next discovery improvement into a verified feature slice. Use event-source evidence to connect the user experience, provider lineage, API behavior, and existing trust rules.

## Context

### Problem

Event discovery depends on public sources that can be incomplete, stale, or unwilling to accept automated access. A successful scan must not make an unverified event look trustworthy, and a blocked or empty source must not look like a source that was checked successfully. The product needs one auditable contract from source scan to public event discovery.

### Users and scope

- **Primary user**: Resident or visitor looking for upcoming events; editors reviewing source quality.
- **Product area**: Events and source-backed discovery.
- **In scope**: Approved-source scanning, event-specific date and Den Haag evidence, source identity in API results, distinct found/partial/no-events/blocked/error outcomes, explicit empty discovery UI, and conservative freshness labeling.
- **Out of scope**: Adding new event providers, crawling arbitrary user URLs, automatic editorial approval, removing old events solely because a source is temporarily unavailable, or replacing the existing curated business discovery providers.

## User scenarios and acceptance

### User Story 1 — Discover events with source evidence (Priority: P1)

**As a** resident or visitor  
**I want** upcoming events to retain their publisher and destination evidence  
**So that** I can judge whether an event is current and locally relevant.

**Why this priority**: Source identity and publication checks are the minimum trust boundary for public event discovery.

**Independent test**: Scan a fixture source containing one valid upcoming Den Haag event plus candidates without a date or locality, then inspect the scan metrics and the event listing response.

**Acceptance scenarios**:

1. **Given** an approved source page contains an upcoming event with event-specific date and Den Haag evidence, **when** the source is scanned, **then** the result is `found` (or `partial` when bounded coverage is incomplete), includes the source name and event URL, counts the event as eligible, and the public event listing preserves `source_scan`, `sourceName`, `sourceUrl`, and `startsAt`.
2. **Given** a captured candidate has no explicit date or no verified Den Haag evidence, **when** publication checks run, **then** it is counted as skipped with a reason and is not returned in the public event list.
3. **Given** no approved event pages are detected after readable source pages are inspected, **when** the source is scanned, **then** the result is `no_events` with an explanatory message and the discovery UI shows an explicit no-verified-events state rather than generic attractions.

### User Story 2 — See source failure and freshness truth (Priority: P2)

**As an** editor or discovery user  
**I want** blocked sources and older source data to be distinguishable from verified fresh results  
**So that** an unavailable or stale source is not mistaken for an empty or recently checked source.

**Why this priority**: External access failures are expected operational states and must remain visible without discarding independent source results.

**Independent test**: Exercise a fixture whose robots policy blocks the source and render an event whose last update is older than the freshness window.

**Acceptance scenarios**:

1. **Given** robots.txt or an upstream response prevents the configured source from being read, **when** the source is scanned, **then** the result is `blocked` or `error`, never `no_events`, and its message tells the editor to treat the source as unavailable.
2. **Given** an event was last seen outside the recent freshness window, **when** it is rendered, **then** it is not labeled “Updated recently” or “Recently checked”; the existing event remains governed by its upcoming date and approval state rather than being silently refreshed.
3. **Given** one selected source is blocked or fails while another source returns verified events, **when** the scan completes, **then** the successful source result remains visible and the failed source retains its own status and message.

## Functional requirements

- **FR-001**: The system MUST scan only approved source IDs and preserve the human-readable publisher separately from the event destination URL.
- **FR-002**: The system MUST publish only events with an upcoming explicit date and verified Den Haag evidence; captured but ineligible candidates MUST remain out of the public event list.
- **FR-003**: The system MUST represent `found`, `partial`, `no_events`, `blocked`, and `error` as distinct source outcomes.
- **FR-004**: The system MUST never collapse blocked or failed source access into a successful empty result.
- **FR-005**: The listings API MUST preserve event source, source name, source URL, first-seen, last-seen, and updated timestamps when returning source-scanned events.
- **FR-006**: The web UI MUST show an explicit empty event state and MUST NOT substitute generic attractions when the event result is empty.
- **FR-007**: The web UI MUST avoid claiming stale source data is recently checked or recently updated.
- **FR-008**: Stored-only discovery MUST not call external providers or translation work.

## Data and contracts

- **Entities**: `SourceScanResult`, `SourceScanEvent`, `Listing`, and persisted discovered events.
- **Relationships**: A source scan owns its per-source outcome; an eligible event retains its source publisher and canonical event URL. A failed scan does not delete existing approved events.
- **API changes**: No new endpoint or response field. The existing `POST /sources/scan` and `GET /listings?section=events` contracts are the feature boundary.
- **Persistence**: No schema or migration change. Existing event query and `lastSeenAt`/`updatedAt` timestamps are used.
- **Generated artifacts**: No regeneration required because the OpenAPI contract is unchanged; existing generated client and Zod schemas are verified against the contract.

## Edge cases and failure states

- Missing, blocked, robots-protected, oversized, or failed source pages retain distinct metrics and statuses.
- Stale timestamps do not receive recent freshness labels.
- Empty event results render an explicit empty state and do not fall back to attractions.
- Editorial review remains the authority for non-eligible candidates; this slice does not auto-approve them.
- Dutch and English messages, semantic status text, keyboard-accessible controls, and responsive source/discovery layouts remain required.
- Provider timeout, quota, malformed markup, and partial crawl coverage remain independent from other source results.

## Success criteria

- **SC-001**: Every public source-scanned event has an event URL, readable publisher, upcoming date, and verified local evidence.
- **SC-002**: Blocked, failed, empty, partial, and verified source outcomes are distinguishable in API responses and editor UI.
- **SC-003**: Focused API and web tests cover the acceptance scenarios; typechecks pass; the convergence document records commands, evidence, and deviations.

## Assumptions and open questions

- The approved source inventory remains the editorial allowlist for this slice.
- “Stale” is currently a presentation boundary: old timestamps lose recent badges while upcoming approved events remain visible. Automatic expiry/removal needs a separate product decision.
- OpenAPI remains unchanged because all required source and freshness fields already exist.

## Risks and follow-up

- Public source pages can change markup or access policy; keep source outcomes and scan metrics visible and retry outside the request path.
- Existing approved events can outlive a source outage; defer automatic expiry until a source-level freshness policy is specified and tested.
