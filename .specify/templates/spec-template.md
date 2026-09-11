# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-short-name]`  
**Created**: [YYYY-MM-DD]  
**Status**: Draft | Ready for plan | In progress | Converged  
**Input**: [original user request or problem statement]

## Context

### Problem

[What is difficult, missing, or unreliable today?]

### Users and scope

- **Primary user**: [resident, visitor, business owner, editor, etc.]
- **Product area**: [events, discovery, business, community, news, etc.]
- **In scope**: [what this change includes]
- **Out of scope**: [what it deliberately does not include]

## User scenarios and acceptance

### User Story 1 — [short title] (Priority: P1)

**As a** [user]  
**I want** [capability]  
**So that** [outcome]

**Why this priority**: [value and ordering rationale]

**Independent test**: [how this story can be exercised without relying on
future stories]

**Acceptance scenarios**:

1. **Given** [initial state], **when** [action], **then** [observable result].
2. **Given** [initial state], **when** [action], **then** [observable result].

### User Story 2 — [short title] (Priority: P2)

**As a** [user]  
**I want** [capability]  
**So that** [outcome]

**Why this priority**: [value and ordering rationale]

**Independent test**: [testable outcome]

**Acceptance scenarios**:

1. **Given** [initial state], **when** [action], **then** [observable result].

## Functional requirements

- **FR-001**: The system MUST [observable behavior].
- **FR-002**: The system MUST preserve [source, language, ownership, or
  fallback invariant].
- **FR-003**: The system MUST show [loading, empty, stale, blocked, or error
  state] when [condition].

## Data and contracts

- **Entities**: [new or changed data types and fields]
- **Relationships**: [ownership and lifecycle rules]
- **API changes**: [OpenAPI paths, request/response changes, or “none”]
- **Persistence**: [schema/migration/seed changes, or “none”]
- **Generated artifacts**: [codegen required? which clients?]

## Edge cases and failure states

- [missing or blocked source]
- [stale data]
- [empty event/business/news result]
- [unauthorized or moderated action]
- [mobile, keyboard, localization, and reduced-motion behavior]
- [provider timeout, quota, or malformed response]

## Success criteria

- **SC-001**: [measurable product outcome]
- **SC-002**: [quality or reliability outcome]
- **SC-003**: [verification evidence expected]

## Assumptions and open questions

- [assumption or question]

## Risks and follow-up

- [risk, mitigation, or explicitly deferred work]
