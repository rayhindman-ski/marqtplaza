# Feature Specification: Event Source Evidence

**Feature Branch**: `001-event-source-evidence`  
**Created**: 2026-09-11  
**Status**: Converged  
**Input**: Implement the next discovery improvement from the Spec Kit follow-up:
make event-source evidence explicit for verified, blocked, stale, and empty states.

## Context

### Problem

The event feed only exposes a coarse response source such as `live`, `stored`, or
`fallback`. Residents cannot tell whether an empty result means that approved
sources were checked, a source was blocked, the stored evidence is stale, or the
event store was unavailable. This makes an intentionally empty event-only feed
look like a generic failure.

### Users and scope

- **Primary user**: resident or visitor using the public event discovery feed
- **Product area**: events and source evidence
- **In scope**: persist the latest approved event-source scan status, return a
  structured evidence summary from `/listings?section=events`, and show verified,
  blocked, stale, unavailable, and explicit empty states in the discovery UI.
- **Out of scope**: changing source allowlists, publishing unapproved events,
  adding generic attractions to the event feed, or exposing private editor data.

## User scenarios and acceptance

### User Story 1 — Understand event evidence (Priority: P1)

**As a** resident  
**I want** to see why the event feed has results or is empty  
**So that** I can distinguish verified availability from a blocked or unavailable source.

**Why this priority**: source provenance is required for trust in a local discovery product.

**Independent test**: return fixtures for each evidence state and assert the
public response and rendered status copy.

**Acceptance scenarios**:

1. **Given** approved upcoming events, **when** the feed loads, **then** it
   shows the number of verified events and the source evidence summary.
2. **Given** an approved source scan with no publishable events, **when** the
   feed loads, **then** it shows an explicit empty event state rather than
   generic attractions.
3. **Given** blocked or failed sources, **when** the feed loads, **then** it
   identifies that evidence is incomplete without presenting those sources as
   empty.

### User Story 2 — Handle stored freshness (Priority: P2)

**As a** resident in stored-only mode  
**I want** to know when event evidence is stale or missing  
**So that** I do not mistake cached data for a current scan.

**Why this priority**: stored-only mode is an intentional privacy and reliability
boundary and needs honest freshness copy.

**Independent test**: return a scan older than the freshness threshold and assert
the stale badge and no-local-data state.

**Acceptance scenarios**:

1. **Given** stored event evidence older than the freshness threshold, **when**
   the feed loads, **then** it shows a stale indicator with its last checked time.

## Functional requirements

- **FR-001**: The event listings response MUST include structured evidence with
  an overall status and per-source status.
- **FR-002**: A source is `verified` only when its approved scan produced
  publishable event evidence; blocked and failed scans MUST remain distinct from
  an intentional no-events result.
- **FR-003**: The response MUST distinguish `empty`, `stale`, `blocked`, and
  `unavailable` states and provide a human-readable message in the requested
  language.
- **FR-004**: The public event feed MUST never add generic attractions as an
  event fallback.
- **FR-005**: The UI MUST make evidence state available to keyboard and screen
  reader users and preserve Dutch/English copy.

## Data and contracts

- **Entities**: event source status with source id, label, scan status, last
  scanned time, message, captured/publishable counts, and failure count;
  listings evidence summary with overall status and source entries.
- **Relationships**: one latest status row per approved event source; event
  listings remain limited to approved upcoming `discovered_events` rows.
- **API changes**: add `evidence` to `ListingsResponse`; no new public path.
- **Persistence**: add an event-source status table and update it after each
  editor-triggered source scan.
- **Generated artifacts**: regenerate the shared OpenAPI React client and schemas.

## Edge cases and failure states

- blocked, failed, pending, or never-scanned source
- stale event evidence in stored-only mode
- approved source scan with zero eligible events
- database read failure
- mobile, keyboard, localization, and reduced-motion behavior

## Success criteria

- **SC-001**: every event-feed response has an explicit evidence status; no
  empty event response is labelled only as a generic fallback.
- **SC-002**: focused tests cover verified, blocked, stale, unavailable, and
  empty outcomes without allowing generic attraction fallback.
- **SC-003**: API schema, generated client, frontend typecheck, and focused
  route/UI tests pass.

## Assumptions and open questions

- A source status older than 24 hours is stale for public event discovery.
- The latest scan status is safe to show publicly because it contains source
  health and counts, not private editor identity or moderation notes.

## Risks and follow-up

- Existing databases need the additive status table before source scan status can
  be persisted; the UI remains backward compatible if evidence is absent.
