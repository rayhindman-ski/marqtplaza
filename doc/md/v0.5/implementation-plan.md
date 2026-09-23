# Consumer Onboarding and Offboarding Implementation Plan

## 1. Purpose and traceability

This plan implements every requirement in
[`requirements.md`](./requirements.md), derived from
[`consumer-registration-journey.md`](./consumer-registration-journey.md).

Every requirement has:

- an implementation approach;
- one or more concrete test references; and
- a measurable acceptance condition.

Final legal text, lawful bases, retention periods, identity-provider settings,
and production operating procedures remain approval dependencies.

## 2. Proposed architecture

### 2.1 Identity boundary

Use the approved managed identity provider for:

- password creation, hashing, breach checking, and verification;
- verified-email identity;
- sign-in and session issuance;
- password reset;
- session revocation; and
- identity deletion.

Application code must never store or inspect password values. Phone number is
application contact data under this specification, not an SMS sign-in method.

### 2.2 Application services

Implement the lifecycle as six bounded services:

1. **Registration service:** pending registrations, token digests, resend,
   expiry, completion orchestration, and reconciliation.
2. **Account service:** account projection, profile, locale, legal status, and
   authorization.
3. **Consent service:** immutable versioned acknowledgements and consent events.
4. **Search continuity service:** one minimized last-search record per account.
5. **Rights service:** export and deletion requests, state transitions, and
   processor reconciliation.
6. **Lifecycle delivery service:** outbox-based email generation, retries,
   delivery receipts, and operator-visible failures.

### 2.3 Frontend routes

Proposed routes:

```text
/account/register
/account/register/check-email
/account/register/complete
/account/sign-in
/account/forgot-password
/account/reset-password
/account
/account/profile
/account/preferences
/account/privacy
/account/export
/account/delete
```

Every route must support Dutch and English, mobile/desktop layouts, keyboard
operation, explicit loading/error states, and a safe return-context reference.

### 2.4 Data model

Add or reconcile:

- `pending_registrations`;
- `registration_tokens`;
- `app_users`;
- `account_consent_events`;
- `consumer_preferences`;
- `consumer_last_search`;
- `account_requests`;
- `lifecycle_outbox`; and
- access-controlled audit events.

Use unique constraints and transaction boundaries for registration completion,
legal records, last-search upsert, export request, and deletion request.

### 2.5 API boundary

Define contracts in OpenAPI before implementation and regenerate server/client
types. All account-owned routes must authorize the authenticated identity on
the server.

Proposed application endpoints:

```text
POST   /api/consumer-registration
POST   /api/consumer-registration/resend
GET    /api/consumer-registration/verify
POST   /api/consumer-registration/complete

GET    /api/account
PATCH  /api/account/profile
GET    /api/account/legal
POST   /api/account/consents

GET    /api/account/last-search
PUT    /api/account/last-search
DELETE /api/account/last-search

POST   /api/account/export-requests
GET    /api/account/export-requests/{requestId}
POST   /api/account/deletion-requests
GET    /api/account/deletion-requests/{requestId}
POST   /api/account/deletion-requests/{requestId}/cancel
```

Credential and session actions use identity-provider APIs rather than
application-created password endpoints.

## 3. Delivery sequence

### Phase 0 — Approval and reconciliation

1. Confirm mandatory/optional fields and the purpose of phone collection.
2. Approve Terms, privacy notice, lawful bases, consent purposes, retention,
   deletion exceptions, export format, and support process.
3. Confirm identity-provider registration, password, reset, session, and
   deletion capabilities in Development and Production.
4. Complete the data inventory, threat model, and processor inventory.
5. Reconcile proposed data/API contracts with existing account infrastructure.

**Exit criteria:** all open policy decisions affecting schema or consumer copy
have named owners and approved outcomes.

### Phase 1 — Registration foundation

1. Add pending-registration schema and migrations.
2. Add enumeration-safe initial registration and resend APIs.
3. Add token-digest generation, expiry, single-use, and supersession.
4. Add transactional lifecycle-outbox messages.
5. Build initial registration, check-email, and link-state pages.
6. Add localized accessible validation and abuse controls.

**Exit criteria:** registration request, resend, email delivery, and every link
state pass integration and accessibility tests.

### Phase 2 — Completion and activation

1. Build full registration form.
2. Integrate identity-provider credential creation and email verification.
3. Persist account, legal acknowledgement, and optional consent events.
4. Add idempotent activation/reconciliation.
5. Restore safe return context.

**Exit criteria:** no partial retry creates duplicate identity, account, legal,
or consent records; password values never enter application persistence/logs.

### Phase 3 — Sign-in, recovery, and profile

1. Complete sign-in, session-expiry, sign-out, and allowlisted returns.
2. Complete forgot/reset password and security notifications.
3. Add profile read/update and verified email-change flow.
4. Add recent-auth checks for sensitive actions.

**Exit criteria:** enumeration, open-redirect, recovery replay, session
isolation, and shared-browser tests pass.

### Phase 4 — Search continuity

1. Define minimized versioned last-search schema.
2. Save account-owned search state after validated user-driven discovery.
3. Add account-home quick link and safe restoration.
4. Add retention cleanup, clear control, and optional disable control.

**Exit criteria:** stale taxonomy degrades safely; no location permission or
third-party provider call is triggered automatically; cross-account leakage is
impossible.

### Phase 5 — Privacy rights and offboarding

1. Add legal/consent history and withdrawal.
2. Add export request, generation, secure download, and expiry.
3. Add deletion request, reauthentication, cancellation cutoff, processor
   orchestration, identity deletion, and completion summary.
4. Add operator queues and support procedures.

**Exit criteria:** export isolation and deletion reconciliation pass on an
isolated production-like dataset; no completion is reported prematurely.

### Phase 6 — Release hardening

1. Complete bilingual content and legal approval.
2. Run security, privacy, accessibility, failure, and rollback suites.
3. Rehearse email-provider failure, identity-provider failure, export failure,
   deletion failure, and rollback.
4. Enable through controlled rollout and monitor privacy-approved metrics.

## 4. Test catalogue

### 4.1 Business journey tests

| Test ID | Concrete test |
|---|---|
| BUS-T01 | Browse, search, open a listing, and share a public route without an account. |
| BUS-T02 | Open registration from navigation and an account-only prompt; verify truthful benefits and Continue browsing. |
| BUS-T03 | Begin registration from a filtered map, cancel, fail, then succeed; verify exact safe context restoration. |
| BUS-T04 | Inspect network, database, logs, analytics, and email payloads for data minimization. |
| BUS-T05 | Complete every core journey in Dutch and English and compare outcomes. |
| BUS-T06 | Run the established map, list, icon, card, and filter regression suites before and after onboarding changes; verify unchanged snapshots, interactions, request contracts, ordering, selection, hover, zoom, viewport restoration, and filter results. |

### 4.2 Registration tests

| Test ID | Concrete test |
|---|---|
| REG-T01 | Submit valid name/email/phone; receive a neutral response and one pending registration. |
| REG-T02 | Submit malformed, empty, Unicode, maximum-length, and country-code inputs; verify client/server parity. |
| REG-T03 | Submit existing and new emails; compare status, copy, timing class, and response shape. |
| REG-T04 | Exceed registration/resend limits; verify accessible recovery and no account disclosure. |
| REG-T05 | Inspect email sender, locale, purpose, expiry, support/privacy links, and absence of phone/password. |
| REG-T06 | Use token once, replay it, expire it, resend, and use an older link; verify state transitions. |
| REG-T07 | Attempt completion without a valid state or with a changed email; verify rejection/reverification. |
| REG-T08 | Exercise password mismatch, short, compromised, pasted, autofilled, shown/hidden, and provider-error states. |
| REG-T09 | Retry completion concurrently; verify one identity, account, legal set, and activation result. |
| REG-T10 | Fail between identity creation and app-account commit; run reconciliation and verify a recoverable single account. |
| REG-T11 | Inspect logs/traces/analytics/database for password or raw-token absence. |
| REG-T12 | Complete registration from a saved search and verify safe return and post-activation choices. |

### 4.3 Authentication and recovery tests

| Test ID | Concrete test |
|---|---|
| AUTH-T01 | Sign in with valid and invalid credentials; verify generic errors and safe progress states. |
| AUTH-T02 | Attempt external, protocol-relative, encoded, and nested return URLs; verify allowlist rejection. |
| AUTH-T03 | Expire a session during read and write actions; verify public context and no destructive replay. |
| AUTH-T04 | Sign out account A, sign in account B, and inspect memory/storage/cache for A's private data. |
| AUTH-T05 | Request reset for eligible/ineligible addresses and compare observable responses. |
| AUTH-T06 | Use, replay, expire, and supersede reset credentials. |
| AUTH-T07 | Reset password, verify notification, and confirm approved session-revocation behavior. |
| AUTH-T08 | Verify support cannot access password values or directly bypass verified-email recovery. |

### 4.4 Profile and search tests

| Test ID | Concrete test |
|---|---|
| PROF-T01 | Read/update name and phone; verify validation, authorization, and audit behavior. |
| PROF-T02 | Change email; verify old email remains primary until new address is verified. |
| PROF-T03 | Attempt another account's profile and preference endpoints; expect denial without leakage. |
| SRCH-T01 | Save a filtered search/map view; verify minimized versioned server record. |
| SRCH-T02 | Sign in later and restore neighbourhood, filters, mode, zoom, viewport, and selection. |
| SRCH-T03 | Remove a category/listing after save; verify graceful partial restoration. |
| SRCH-T04 | Restore while geolocation and web scope are disabled; verify no permission/provider call. |
| SRCH-T05 | Clear last search; verify server deletion, client-cache removal, and no unrelated deletion. |
| SRCH-T06 | Switch accounts in one browser; verify strict account isolation. |
| SRCH-T07 | Run retention cleanup and verify expired state is unavailable and auditable without content leakage. |

### 4.5 Privacy and offboarding tests

| Test ID | Concrete test |
|---|---|
| PRIV-T01 | Register in both locales; verify exact Terms/privacy versions and separate records. |
| PRIV-T02 | Refuse optional consent; verify account activation and core functions remain available. |
| PRIV-T03 | Grant then withdraw each optional purpose; verify future processing stops independently. |
| PRIV-T04 | Access legal/privacy documents signed out and legal/consent history signed in. |
| PRIV-T05 | Request export as account A; verify only A's data and an expiring authenticated download. |
| OFF-T01 | Compare sign-out, clear-search, consent withdrawal, export, and deletion effects. |
| OFF-T02 | Submit deletion twice concurrently; verify one effective request/reference. |
| OFF-T03 | Test cancellation before and after cutoff. |
| OFF-T04 | Fail each downstream deletion step; verify pending/failed status and no false completion. |
| OFF-T05 | Complete deletion; verify session/token invalidation and accurate category summary. |
| OFF-T06 | Re-register the same email after completion; verify a new account without old private state. |

### 4.6 Security, accessibility, and operations tests

| Test ID | Concrete test |
|---|---|
| SEC-T01 | Run account-enumeration comparisons across registration, resend, sign-in, reset, and support. |
| SEC-T02 | Test CSRF, session fixation, cookie flags, open redirects, replay, brute force, and ownership bypass. |
| SEC-T03 | Scan logs, traces, analytics, error payloads, and email queues for prohibited data. |
| SEC-T04 | Verify recent-auth enforcement for email change, export, all-session revocation, and deletion. |
| A11Y-T01 | Complete every critical flow by keyboard with visible focus and correct focus restoration. |
| A11Y-T02 | Verify labels, descriptions, field errors, summaries, and live announcements with a screen reader. |
| A11Y-T03 | Verify 320 CSS-pixel reflow, 400% zoom, contrast, and non-color status cues. |
| L10N-T01 | Compare every static, dynamic, email, legal, validation, and exceptional state in Dutch and English. |
| OPS-T01 | Simulate email acceptance, delivery, retry, rejection, receipt replay, and terminal failure. |
| OPS-T02 | Disable feature flags and providers; verify fail-closed account APIs and uninterrupted public discovery. |
| OPS-T03 | Restore from rollback without dropping or mutating account, consent, request, or audit records. |

## 5. Requirement-by-requirement implementation matrix

The requirement wording remains authoritative in `requirements.md`. The
implementation column below specifies the concrete component or control; the
test column references executable scenarios above; acceptance is additional to
the global acceptance baseline.

### 5.1 Business requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| BUS-001 | Keep public discovery routes and listing APIs independent of auth middleware. | BUS-T01 | Guest completes public discovery without redirects. |
| BUS-002 | Add benefit panel with implemented features and Continue browsing. | BUS-T02 | Copy names no unimplemented benefit. |
| BUS-003 | Gate activation on verified identity email. | REG-T06, REG-T09 | Unverified attempts cannot activate. |
| BUS-004 | Approve field-purpose map and reject undeclared payload keys. | BUS-T04 | Stored fields match the approved inventory. |
| BUS-005 | Add private last-search service and quick link. | SRCH-T01, SRCH-T02 | Latest valid state restores after sign-in. |
| BUS-006 | Route recovery exclusively through identity provider. | AUTH-T05–T08 | Staff/application never handle passwords. |
| BUS-007 | Store immutable versioned legal/consent events. | PRIV-T01 | Exact presented versions are retrievable. |
| BUS-008 | Add profile, legal, export, and deletion controls. | PROF-T01, PRIV-T05, OFF-T01–T05 | Authorized rights journeys complete truthfully. |
| BUS-009 | Use one locale catalogue and bilingual lifecycle templates. | BUS-T05, L10N-T01 | Dutch/English outcomes are equivalent. |
| BUS-010 | Add safe event codes, request status, and operator queues. | OPS-T01, SEC-T03 | Failures are diagnosable without prohibited data. |
| BUS-011 | Keep account work behind additive account routes/services; consume existing discovery state interfaces without modifying map, list, icon, card, filter, route, request, response, cache, or provider contracts. | BUS-T06, SRCH-T01–T06 | Existing discovery regression tests pass without changed expectations; any exception has a separate approved requirement and impact assessment. |

### 5.2 Registration requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| REG-001 | Add `/account/register` behind HTTPS/security headers. | REG-T01, SEC-T02 | Insecure production access is rejected/redirected safely. |
| REG-002 | Render verified benefits and guest continuation. | BUS-T02 | Both choices are visible before data entry. |
| REG-003 | Store allowlisted return-state ID, not arbitrary URL. | BUS-T03, AUTH-T02 | Cancel/failure/success restores safe context. |
| REG-004 | Add name, email, and phone fields to initial schema. | REG-T01, REG-T02 | Valid values reach pending record once. |
| REG-005 | Add per-field purpose copy and phone-use explanation. | REG-T01, A11Y-T02 | Purpose is accessible before submission. |
| REG-006 | Share validation rules server/client and field errors. | REG-T02 | Invalid payloads fail consistently without losing safe values. |
| REG-007 | Use conservative email normalization and E.164 phone parsing. | REG-T02 | Distinct valid emails remain distinct. |
| REG-008 | Return one neutral response contract. | REG-T03 | Existing/new accounts are not distinguishable. |
| REG-009 | Add layered limiter and accessible challenge fallback. | REG-T04, SEC-T01 | Abuse is limited without permanent shared-IP block. |
| REG-010 | Persist explicit `pending` lifecycle state only. | REG-T01 | No active app user exists before completion. |
| REG-011 | Queue localized registration outbox template. | REG-T05, OPS-T01 | Required content is sent idempotently. |
| REG-012 | Generate random bound single-use expiring token. | REG-T06, SEC-T02 | Guess/replay/expired use fails generically. |
| REG-013 | Persist token digest and safe metadata only. | REG-T11, SEC-T03 | Raw token is absent from storage/logs. |
| REG-014 | Mark used/expired/cancelled/superseded transactionally. | REG-T06 | Only newest valid unused token succeeds. |
| REG-015 | Build localized route states for every token outcome. | REG-T06, L10N-T01 | Each state has correct recovery action. |
| REG-016 | Add neutral resend endpoint and cooldown UI. | REG-T03, REG-T04, REG-T06 | Resend supersedes old token without disclosure. |
| REG-017 | Require verified registration state server-side. | REG-T07 | Direct completion requests are denied. |
| REG-018 | Lock verified email and route change to reverification. | REG-T07 | Email cannot be swapped during completion. |
| REG-019 | Add full form schema and authoritative server validation. | REG-T02, REG-T09 | Missing required data blocks activation. |
| REG-020 | Annotate optional schema/UI fields explicitly. | REG-T01, A11Y-T02 | Optional fields are identified in accessible names/help. |
| REG-021 | Submit password only to identity-provider SDK/API. | REG-T08, REG-T11 | Application persistence never receives password. |
| REG-022 | Add autocomplete, paste, manager, show/hide controls. | REG-T08, A11Y-T01 | Password can be completed without manual retyping. |
| REG-023 | Configure provider policy and mirror non-secret guidance. | REG-T08 | Provider rejects noncompliant password with usable error. |
| REG-024 | Redact sensitive keys and prohibit credential telemetry. | REG-T11, SEC-T03 | Automated scans find no password values. |
| REG-025 | Use activation transaction/saga gates. | REG-T09, REG-T10 | Account is active only when all gates succeed. |
| REG-026 | Add idempotent reconciliation keyed by registration/identity. | REG-T10 | Partial failure converges to one valid state. |
| REG-027 | Add unique constraints and idempotency keys. | REG-T09 | Concurrent retries create no duplicates. |
| REG-028 | Read authoritative state before success screen. | REG-T09, REG-T10 | UI never reports premature completion. |
| REG-029 | Resolve validated return-state after activation. | REG-T12, AUTH-T02 | Safe initiating search returns intact. |
| REG-030 | Render post-activation action choices. | REG-T12 | All three actions work and are keyboard accessible. |

### 5.3 Authentication and recovery requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| AUTH-001 | Use identity-provider email/password sign-in. | AUTH-T01 | Valid verified consumer receives authorized session. |
| AUTH-002 | Add labeled secondary routes and public cancel. | AUTH-T01, A11Y-T01 | Routes remain usable signed out. |
| AUTH-003 | Map provider failures to one generic credential error. | AUTH-T01, SEC-T01 | Account state is not disclosed. |
| AUTH-004 | Use pending state, disabled duplicate submit, live status. | AUTH-T01, A11Y-T02 | One request and announced result per action. |
| AUTH-005 | Resolve only signed internal return-state identifiers. | AUTH-T02 | External/encoded redirects fail safely. |
| AUTH-006 | Hydrate validated public search state after auth. | BUS-T03, SRCH-T02 | Safe criteria restore. |
| AUTH-007 | Store pending writes as confirmation prompts, not replay jobs. | AUTH-T03 | Destructive action never auto-runs. |
| AUTH-008 | Keep discovery mounted/restorable on cancel/error. | AUTH-T01, AUTH-T03 | Guest journey remains available. |
| AUTH-009 | Add session-expired state and loop guard. | AUTH-T03 | Reauth succeeds or returns to guest once. |
| AUTH-010 | Clear account query cache, memory, and private storage. | AUTH-T04 | Account B sees none of A's state. |
| AUTH-011 | Separate public criteria from private cache. | AUTH-T04 | Sign-out preserves only approved public criteria. |
| AUTH-012 | Call provider sign-out and confirm local cleanup. | AUTH-T04 | Session and private state are gone. |
| AUTH-013 | Add recent-authenticated all-session revocation. | AUTH-T07, SEC-T04 | Every prior session becomes invalid. |
| AUTH-014 | Queue idempotent security notifications. | AUTH-T07, OPS-T01 | Required notice has one effective delivery event. |
| REC-001 | Add accessible forgot-password route. | AUTH-T05, A11Y-T01 | Route is reachable from sign-in. |
| REC-002 | Return neutral reset-request response. | AUTH-T05, SEC-T01 | Eligible/ineligible responses are equivalent. |
| REC-003 | Apply layered reset limiter. | AUTH-T05, SEC-T01 | Excess attempts are limited without disclosure. |
| REC-004 | Use identity-provider expiring reset mechanism. | AUTH-T06 | Only current unused credential works. |
| REC-005 | Configure localized reset email template. | AUTH-T05, L10N-T01 | Purpose, expiry, unexpected-use, support are present. |
| REC-006 | Implement all reset exceptional states. | AUTH-T06 | Each state has safe retry/recovery. |
| REC-007 | Reuse approved provider password policy. | AUTH-T07, REG-T08 | Reset cannot choose weaker password. |
| REC-008 | Consume reset credential atomically. | AUTH-T06 | Replay fails after success. |
| REC-009 | Execute approved session-review/revocation rule. | AUTH-T07 | Session behavior matches policy. |
| REC-010 | Queue password-changed notification. | AUTH-T07, OPS-T01 | Notice is emitted once after confirmed change. |
| REC-011 | Remove support credential fields/actions and document prohibition. | AUTH-T08 | Staff cannot request/set/view password. |
| REC-012 | Route lost-email cases to approved manual procedure. | AUTH-T08 | No ordinary bypass changes identity. |
| REC-013 | Emit safe recovery audit codes. | AUTH-T06, SEC-T03 | Audit exists without credential values. |

### 5.4 Profile and search requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| PROF-001 | Add authorized account profile projection. | PROF-T01, PROF-T03 | Consumer sees only own approved fields. |
| PROF-002 | Add validated name patch. | PROF-T01 | Valid update persists; invalid update does not. |
| PROF-003 | Add country-aware phone patch. | PROF-T01 | Normalized valid number persists once. |
| PROF-004 | Stage email change pending provider verification. | PROF-T02 | Old email remains primary until verification. |
| PROF-005 | Queue approved old/new address notifications. | PROF-T02, OPS-T01 | Notifications follow policy without exposing details. |
| PROF-006 | Add locale/preference read/write contract. | PROF-T01, L10N-T01 | Authorized values round-trip. |
| PROF-007 | Add account navigation to legal/search/export/delete controls. | PROF-T01, A11Y-T01 | Every control is reachable and labeled. |
| PROF-008 | Add recent-auth middleware to sensitive patches. | PROF-T02, SEC-T04 | Stale sessions must reauthenticate. |
| SRCH-001 | Upsert one record by authenticated account ID. | SRCH-T01, PROF-T03 | No anonymous or cross-account write. |
| SRCH-002 | Define versioned allowlisted state schema. | SRCH-T01 | Record contains only approved fields. |
| SRCH-003 | Authorize all read/write/delete operations. | SRCH-T06, PROF-T03 | Other-account access is denied. |
| SRCH-004 | Exclude device-geolocation payloads. | SRCH-T01, SRCH-T04 | Raw device location is absent. |
| SRCH-005 | Round viewport coordinates to approved precision. | SRCH-T01 | Stored precision matches policy. |
| SRCH-006 | Keep private state in account API, not canonical URL. | SRCH-T01, SRCH-T02 | Shared URL excludes private fields. |
| SRCH-007 | Reject undeclared/oversized payload keys. | SRCH-T01, SEC-T03 | Secrets/provider payloads cannot persist. |
| SRCH-008 | Use last-write-wins versioned upsert. | SRCH-T01 | Only latest approved state is returned. |
| SRCH-009 | Add scheduled expiry cleanup. | SRCH-T07 | Expired records are unavailable. |
| SRCH-010 | Add account-home/post-sign-in summary link. | SRCH-T02 | Link describes and opens latest search. |
| SRCH-011 | Apply privacy-safe summary formatter. | SRCH-T02 | Shared-screen copy omits sensitive text. |
| SRCH-012 | Validate taxonomy/geography on restore. | SRCH-T03 | Unsupported values are excluded. |
| SRCH-013 | Restore valid subset when some values are stale. | SRCH-T03 | One stale field does not break route. |
| SRCH-014 | Never call geolocation during hydration. | SRCH-T04 | Browser permission is not requested. |
| SRCH-015 | Gate provider calls on current explicit scope. | SRCH-T04 | No silent external request occurs. |
| SRCH-016 | Reapply scope only under approved preference rules. | SRCH-T04 | UI and request scope remain consistent. |
| SRCH-017 | Serialize only validated public criteria. | SRCH-T02, SRCH-T03 | Canonical URL stays share-safe. |
| SRCH-018 | Add confirm-and-delete account API/UI. | SRCH-T05 | Server confirms before success. |
| SRCH-019 | Invalidate client/private persisted caches on delete. | SRCH-T05 | Refresh does not restore cleared state. |
| SRCH-020 | Namespace and clear caches by identity. | SRCH-T06, AUTH-T04 | Shared browser cannot leak state. |
| SRCH-021 | Add retention preference when policy enables it. | SRCH-T05 | Disabling stops future writes and explains effect. |

### 5.5 Privacy and offboarding requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| PRIV-001 | Gate activation on current Terms/privacy presentation. | PRIV-T01 | Required records precede activation. |
| PRIV-002 | Publish legal routes and account links. | PRIV-T04 | Documents work signed out and signed in. |
| PRIV-003 | Version localized approved legal content. | PRIV-T01, L10N-T01 | Correct locale/version/effective date display. |
| PRIV-004 | Add print/download presentation if approved. | PRIV-T04 | Accessible document export matches displayed version. |
| PRIV-005 | Persist immutable legal event metadata. | PRIV-T01 | Exact action/version is auditable. |
| PRIV-006 | Use separate event types and controls. | PRIV-T01, PRIV-T02 | Records cannot be bundled. |
| PRIV-007 | Label notice acknowledgement accurately. | PRIV-T01 | UI/data never calls it blanket consent. |
| PRIV-008 | Default optional purposes off and granular. | PRIV-T02 | Refusal does not block activation. |
| PRIV-009 | Remove combined acceptance/marketing controls. | PRIV-T02 | Terms action cannot grant marketing. |
| PRIV-010 | Add authorized legal-history projection. | PRIV-T04 | Consumer sees own current/history status. |
| PRIV-011 | Add one withdrawal action per purpose. | PRIV-T03 | Purposes withdraw independently. |
| PRIV-012 | Gate future processing on latest consent event. | PRIV-T03 | Withdrawn purpose stops. |
| PRIV-013 | Append versioned consent events. | PRIV-T03 | Grant/withdraw history is immutable. |
| PRIV-014 | Add approved withdrawal-effect copy. | PRIV-T03 | Copy distinguishes future/prior processing. |
| PRIV-015 | Add privacy-center rights routes. | PRIV-T04, PRIV-T05, OFF-T01 | Applicable right has actionable entry. |
| PRIV-016 | Maintain approved processing inventory artifact. | BUS-T04, SEC-T03 | Every stored/transmitted field maps to purpose. |
| PRIV-017 | Configure retention jobs and legal holds. | SRCH-T07, OFF-T04 | Data follows approved schedule/exception. |
| PRIV-018 | Use factual controls/copy, not compliance badge claim. | PRIV-T01, PRIV-T04 | No unsupported claim appears. |
| PRIV-019 | Add URL/log/analytics allowlists and scans. | SEC-T03, SRCH-T01 | Prohibited personal data is absent. |
| OFF-001 | Separate account actions and consequence copy. | OFF-T01 | Each action changes only declared data. |
| OFF-002 | Add recent-auth middleware. | SEC-T04, PRIV-T05, OFF-T02 | Sensitive action rejects stale auth. |
| OFF-003 | Authorize export to current account. | PRIV-T05, PROF-T03 | A cannot request B's export. |
| OFF-004 | Generate approved JSON/CSV archive. | PRIV-T05 | Export is machine-readable and complete by policy. |
| OFF-005 | Store encrypted temporary artifact and expiring access. | PRIV-T05 | Ordinary email contains no export data. |
| OFF-006 | Persist explicit export lifecycle states. | PRIV-T05, OPS-T03 | Request status is truthful and diagnosable. |
| OFF-007 | Render approved deletion consequences/exceptions. | OFF-T01, OFF-T03 | Consumer sees cutoff and retained categories. |
| OFF-008 | Require recent auth and typed/final confirmation. | SEC-T04, OFF-T02 | Unconfirmed/stale-auth deletion is rejected. |
| OFF-009 | Add unique active request and idempotency key. | OFF-T02 | Concurrent submissions share one result. |
| OFF-010 | Enforce cancellation cutoff transactionally. | OFF-T03 | Before succeeds; after is accurately refused. |
| OFF-011 | Implement lifecycle state gate and session revocation. | OFF-T04, OFF-T05 | Closed account cannot use account routes. |
| OFF-012 | Orchestrate app then provider deletion in approved order. | OFF-T04, OFF-T05 | Every step records confirmed outcome. |
| OFF-013 | Add processor adapters and reconciliation retries. | OFF-T04 | Processor failure remains pending/failed. |
| OFF-014 | Generate category-level completion summary. | OFF-T05 | Summary matches actual outcomes. |
| OFF-015 | Compute complete only from all required confirmations. | OFF-T04, OFF-T05 | No premature complete state. |
| OFF-016 | Revoke lifecycle tokens at closure transition. | OFF-T05 | Old registration/reset links fail. |
| OFF-017 | Delete search/preferences and clear caches. | OFF-T05, SRCH-T06 | Deleted account restores no private state. |
| OFF-018 | Use new identity/account ID after permitted re-registration. | OFF-T06 | No old data attaches to new account. |
| OFF-019 | Minimize retained audit projection and role access. | OFF-T05, SEC-T03 | Retained audit reveals only approved fields. |
| OFF-020 | Add safe reviewer/support request queue. | OFF-T04, OPS-T03 | Staff can resolve failures without excess data. |

### 5.6 Security requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| SEC-001 | Enforce TLS/proxy settings and security headers. | SEC-T02 | Production scanner passes approved baseline. |
| SEC-002 | Keep all credential operations in identity provider. | REG-T11, AUTH-T08 | App DB/logs contain no credentials. |
| SEC-003 | Add CSRF controls to state-changing cookie-auth routes. | SEC-T02 | Cross-site requests fail. |
| SEC-004 | Configure layered privacy-safe rate limits. | REG-T04, SEC-T01 | Abuse is limited without disclosure. |
| SEC-005 | Use temporary/risk-based network limits. | REG-T04 | Shared network can recover normally. |
| SEC-006 | Provide accessible challenge alternative. | REG-T04, A11Y-T01 | Legitimate keyboard/screen-reader user can continue. |
| SEC-007 | Standardize enumeration-safe contracts/copy. | SEC-T01 | Observable outcomes do not reveal account existence. |
| SEC-008 | Centralize secure token generation/consumption. | REG-T06, AUTH-T06 | Replay/expiry/supersession enforced. |
| SEC-009 | Centralize internal return-state allowlist. | AUTH-T02 | Open-redirect suite passes. |
| SEC-010 | Configure secure, HttpOnly, SameSite sessions and rotation. | SEC-T02 | Fixation/cookie tests pass. |
| SEC-011 | Add recent-auth claims/middleware. | SEC-T04 | Sensitive routes reject stale session. |
| SEC-012 | Add redaction, allowlisted telemetry, safe errors. | SEC-T03 | Prohibited values absent from all sinks. |
| SEC-013 | Add immutable access-controlled audit event sink. | AUTH-T06, OFF-T05 | Required actions are traceable by safe ID. |
| SEC-014 | Add anomaly counters/alerts for lifecycle operations. | SEC-T01, OPS-T01 | Approved thresholds produce safe alerts. |
| SEC-015 | Publish and rehearse incident runbooks. | OPS-T01, OPS-T03 | On-call can contain and recover incidents. |
| SEC-016 | Complete threat model and close release-blocking findings. | SEC-T02–T04 | Security owner approves residual risk. |

### 5.7 Accessibility, localization, data, and operations requirements

| ID | Implementation | Tests | Acceptance |
|---|---|---|---|
| A11Y-001 | Apply WCAG 2.2 AA design/component standards. | A11Y-T01–T03 | No critical/serious core-flow violation. |
| A11Y-002 | Use semantic controls and keyboard interactions. | A11Y-T01 | Every action completes without pointer. |
| A11Y-003 | Add route/modal/error focus management. | A11Y-T01 | Focus lands predictably after each transition. |
| A11Y-004 | Use labels, descriptions, `aria-invalid`, and summaries. | A11Y-T02 | Screen reader identifies field and error. |
| A11Y-005 | Use live regions and text/icon status cues. | A11Y-T02, A11Y-T03 | Status is announced and non-color-only. |
| A11Y-006 | Build responsive layouts without clipped controls. | A11Y-T03 | 320px/400% journeys remain usable. |
| A11Y-007 | Add correct autocomplete and avoid paste blockers. | REG-T08 | Password managers and paste work. |
| A11Y-008 | Use semantic responsive email templates. | REG-T05, AUTH-T05 | Email accessibility checks pass. |
| L10N-001 | Maintain one complete EN/NL catalogue. | L10N-T01 | Every state has equivalent localized content. |
| L10N-002 | Sign and validate locale in lifecycle/return state. | L10N-T01 | Correct locale persists without injection. |
| L10N-003 | Add missing-key and mixed-language CI checks. | L10N-T01 | No fallback text ships in core journeys. |
| DATA-001 | Key domain records by internal/identity IDs. | PROF-T03 | Email change does not break ownership. |
| DATA-002 | Add unique constraints/idempotency indexes. | REG-T09, OFF-T02 | Concurrency creates one effective record. |
| DATA-003 | Use explicit enums/timestamps for lifecycle state. | REG-T06, PRIV-T05, OFF-T04 | State never depends on null inference. |
| DATA-004 | Use TLS and approved database/storage encryption. | SEC-T02, PRIV-T05 | Security review confirms protection. |
| DATA-005 | Apply least privilege and privileged-access audit. | PROF-T03, OFF-T04 | Unauthorized access fails and admin access audits. |
| DATA-006 | Keep Development/Production provider and data stores separate. | OPS-T02 | Test identity cannot access production account. |
| OPS-001 | Use transactional outbox, monotonic attempts, receipts. | OPS-T01 | One logical message survives retries safely. |
| OPS-002 | Separate accepted/delivered states. | OPS-T01 | UI/ops never equate acceptance with delivery. |
| OPS-003 | Add operator queues for terminal/pending failures. | OPS-T01, OFF-T04 | Failed lifecycle item is actionable. |
| OPS-004 | Emit event codes and safe row/request IDs only. | SEC-T03 | Logs contain no prohibited personal content. |
| OPS-005 | Preserve lifecycle data during rollback. | OPS-T03 | Rollback changes behavior, not record history. |
| OPS-006 | Gate account APIs/UI while leaving public discovery running. | OPS-T02, BUS-T01 | Disabled account feature returns safe unavailable state. |
| OPS-007 | Emit aggregate allowlisted metrics only. | SEC-T03 | Analytics contain no raw search/location/identity. |
| OPS-008 | Publish support playbooks with no credential bypass. | AUTH-T08, OFF-T04 | Support follows verified authorized workflow. |

## 6. Acceptance evidence package

Before release, produce:

1. requirements-to-test traceability export;
2. OpenAPI and schema review;
3. migration rehearsal and rollback evidence;
4. identity-provider Development and Production configuration review;
5. email sender, template, retry, and receipt evidence;
6. threat model and security test report;
7. privacy processing inventory and retention/deletion approval;
8. Dutch/English content parity report;
9. WCAG 2.2 AA audit for critical journeys;
10. isolated integration-test report for account isolation, export, and deletion;
11. unchanged map, list, icon, card, and filter regression evidence;
12. operator/support runbook rehearsal; and
13. product, legal, privacy, security, accessibility, QA, support, and operations sign-off.

## 7. Definition of implementation complete

Implementation is complete only when every **Must** requirement in
`requirements.md` has:

- merged production code or an approved external configuration;
- passing positive, negative, authorization, failure, accessibility, and
  localization tests as applicable;
- no unresolved critical/high security or privacy finding;
- accurate consumer and operator documentation;
- observable but privacy-safe failure handling;
- approved rollback behavior; and
- an owner-approved acceptance record linked to the requirement ID.