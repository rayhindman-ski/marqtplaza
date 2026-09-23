# Release v0.5.1 — Secure Registration Foundation

## 1. Release purpose

Release v0.5.1 defines the smallest independently deliverable unit of work for
the consumer onboarding journey:

> A consumer can submit a secure registration request, receive a single-use
> email registration link, and reach a verified link handoff state.

This release establishes the registration foundation without creating an
active consumer account. Public exposure remains disabled until the
user-complete registration slice is implemented.

## 2. Source documents

- [`consumer-registration-journey.md`](./consumer-registration-journey.md)
- [`requirements.md`](./requirements.md)
- [`implementation-plan.md`](./implementation-plan.md)

If these documents conflict, approved requirements and legal/privacy decisions
take precedence over this release summary.

## 3. Release classification

| Field | Value |
|---|---|
| Release | v0.5.1 |
| Unit of work | Secure registration request and email-link verification |
| Delivery type | Independently testable technical foundation |
| Public availability | Disabled behind an account/registration feature flag |
| Account activation | Not included |
| Discovery changes | Prohibited |

## 4. Consumer journey

### 4.1 Registration request

1. The consumer opens the secure registration page.
2. The page explains the verified account benefit.
3. The page states that public browsing remains available without an account.
4. The consumer enters:
   - name;
   - email address; and
   - phone number.
5. The page explains why each field is required.
6. The phone number is described as contact data, not an SMS sign-in method.
7. Client and server validation run.
8. The application returns a neutral response regardless of whether the email
   is new, already registered, or otherwise ineligible.

### 4.2 Pending registration

1. A valid eligible request creates one pending-registration record.
2. No active application account is created.
3. No password is requested or stored.
4. The application creates a cryptographically strong registration token.
5. Only the token digest and safe lifecycle metadata are stored.
6. A lifecycle email is queued transactionally.

### 4.3 Registration email

The email contains:

- approved sender identity;
- the reason for the email;
- a secure registration link;
- the link-expiry period;
- instructions for an unintended recipient;
- privacy and support links; and
- no phone number, password, token value outside the link, or unnecessary
  personal data.

### 4.4 Link verification

Opening the registration link produces one explicit state:

- valid;
- expired;
- already used;
- superseded by a newer link;
- invalid;
- temporarily unavailable; or
- network/server error.

A valid link reaches the handoff page for the future full registration form.
The handoff does not activate an account or silently sign in the consumer.

### 4.5 Resend

The consumer may request a new email from an expired or invalid-link journey.

The resend operation:

- uses an enumeration-safe response;
- applies rate limits and cooldown behavior;
- invalidates earlier active links;
- creates one effective replacement message; and
- remains accessible to keyboard and assistive-technology users.

## 5. Included scope

- Secure registration route.
- Name, email, and phone capture.
- Field-purpose explanation.
- Client and server validation.
- Conservative email normalization.
- Country-aware phone normalization.
- Enumeration-safe responses.
- Pending-registration persistence.
- Single-use, expiring registration tokens.
- Token-digest persistence.
- Registration-email outbox event.
- Email delivery retry and status handling.
- Registration-link verification.
- Link expiry, replay, invalid, superseded, unavailable, and error states.
- Rate-limited resend.
- Dutch and English parity.
- Accessibility for pages and emails.
- Privacy-safe logging and telemetry.
- Abuse protection with an accessible fallback.
- Feature flag and safe unavailable state.
- Existing discovery regression verification.

## 6. Explicitly excluded scope

The following are deferred:

- Full registration form.
- Password creation.
- Terms and Conditions acceptance.
- Privacy-notice acknowledgement.
- Optional consent.
- Active application-account creation.
- Automatic session creation.
- Sign-in.
- Password recovery and reset.
- Profile management.
- Account-backed last-search retention.
- Map zoom and viewport restoration after sign-in.
- Data export.
- Account deletion and other offboarding operations.
- SMS verification or SMS sign-in.
- Social sign-in, passkeys, or multi-factor authentication.

## 7. Protected existing behavior

### 7.1 Non-regression rule

Release v0.5.1 must not alter any existing:

- map behavior;
- list behavior;
- icon behavior or appearance;
- result, hover, or detail card behavior;
- filter behavior;
- discovery route;
- discovery API request or response contract;
- cache key;
- provider behavior; or
- desktop, responsive, keyboard, or localized discovery interaction.

This includes map boundaries, tiles, markers, clustering, hover, selection,
panning, zooming, viewport restoration, list ordering, card links, filter
hierarchy, filter defaults, filter combinations, and result counts.

Any discovery change requires a separate approved requirement and must not be
introduced incidentally by v0.5.1.

### 7.2 Integration boundary

The registration foundation may preserve an opaque, allowlisted internal
return-state reference. It must not modify or reinterpret the discovery state
it references.

## 8. Requirements coverage

### 8.1 Primary registration requirements

- `REG-001` through `REG-017`

### 8.2 Supporting requirements

- `BUS-001` through `BUS-004`
- `BUS-009` through `BUS-011`
- `SEC-001`
- `SEC-004` through `SEC-009`
- `SEC-012` through `SEC-016`
- `A11Y-001` through `A11Y-006`
- `A11Y-008`
- `L10N-001` through `L10N-003`
- `DATA-002` through `DATA-006`
- `OPS-001` through `OPS-008`

Requirements outside these ranges remain in the v0.5 programme but are not
claimed as delivered by v0.5.1.

## 9. Proposed technical components

### 9.1 Frontend

- `/account/register`
- `/account/register/check-email`
- `/account/register/complete` handoff state
- registration-link state views
- resend controls
- localized accessible validation
- safe feature-disabled state

### 9.2 API

```text
POST /api/consumer-registration
POST /api/consumer-registration/resend
GET  /api/consumer-registration/verify
```

The completion endpoint is deferred until the full registration slice.

### 9.3 Data

```text
PendingRegistration {
  registrationId
  normalizedEmail
  name
  normalizedPhone
  status
  createdAt
  expiresAt
  resendCount
  lastSentAt
}

RegistrationToken {
  tokenDigest
  registrationId
  createdAt
  expiresAt
  usedAt?
  supersededAt?
}
```

Existing account and lifecycle tables must be reused where they already provide
the approved contract. Schema implementation must not duplicate an existing
source of truth.

### 9.4 Lifecycle delivery

The registration email must use the existing transactional outbox and approved
delivery provider where available.

Delivery states must distinguish:

- queued;
- processing;
- accepted by provider;
- delivered when confirmed by an approved receipt;
- retryable failure; and
- terminal failure.

Provider acceptance must not be represented as consumer delivery.

## 10. Security controls

- HTTPS and approved security headers.
- Cryptographically random tokens.
- Short approved token lifetime.
- Single-use token consumption.
- Digest-only application token storage.
- Transactional token supersession.
- Enumeration-safe request and resend responses.
- Layered registration, resend, token, and network rate limits.
- No permanent shared-network block based only on IP.
- Accessible bot/abuse-control fallback.
- Internal allowlist for return destinations.
- CSRF protection where cookie-authenticated state changes apply.
- Redaction of email, phone, tokens, and message content from operational logs.
- Access-controlled safe audit events.
- Threat-model approval before public release.

## 11. Privacy controls

- Collect only name, email, and phone for approved registration purposes.
- Display the purpose of every field.
- Do not collect a password in this release.
- Do not create an active account merely because a request was submitted.
- Do not put email, phone, account state, or token metadata into analytics.
- Do not expose personal data in registration URLs.
- Apply approved expiry and cleanup rules to pending registrations.
- Keep legal/privacy information accessible without sign-in.
- Do not claim that v0.5.1 alone establishes GDPR compliance.

## 12. Concrete test cases

### 12.1 Registration request

1. Submit valid name, new email, and valid phone.
2. Submit valid name, existing-account email, and valid phone.
3. Submit valid name, existing-pending email, and valid phone.
4. Compare browser-visible responses and response contracts.
5. Verify one effective pending registration.
6. Verify no active account was created.
7. Submit blank, malformed, Unicode, boundary-length, and oversized inputs.
8. Verify client/server validation parity.
9. Verify safe non-secret values survive recoverable validation errors.

### 12.2 Token lifecycle

1. Open a valid link.
2. Replay the used link.
3. Open an expired link.
4. Request resend and open the older link.
5. Open the newest valid link.
6. Modify the token.
7. Remove required link parameters.
8. Simulate unavailable token storage.
9. Verify each state produces the approved localized recovery action.

### 12.3 Resend and abuse controls

1. Resend within the permitted limit.
2. Resend during cooldown.
3. Exceed account, request, and network limits.
4. Verify no response reveals account existence.
5. Verify a shared network is not permanently blocked.
6. Complete the accessible challenge fallback.
7. Verify only one effective replacement email per idempotent action.

### 12.4 Email delivery

1. Verify sender, subject, locale, purpose, expiry, support, and privacy content.
2. Verify the email contains no phone number or password.
3. Simulate provider acceptance.
4. Simulate delivery receipt.
5. Replay a receipt.
6. Simulate retryable failure.
7. Simulate terminal failure.
8. Verify operator visibility and monotonic delivery attempts.

### 12.5 Security and privacy

1. Compare timing class and output for eligible and ineligible emails.
2. Attempt token guessing, replay, expiry bypass, and supersession bypass.
3. Attempt external and encoded return destinations.
4. Scan logs, traces, analytics, error payloads, database rows, and email queues
   for raw tokens and prohibited personal data.
5. Verify production account routes fail closed when the feature is disabled.
6. Verify public discovery remains operational when registration is disabled.

### 12.6 Accessibility and localization

1. Complete request, link, and resend journeys using keyboard only.
2. Verify focus after validation, submission, resend, and route changes.
3. Verify field labels, help, errors, summaries, and live announcements with a
   screen reader.
4. Verify 320 CSS-pixel reflow and 400% browser zoom.
5. Verify status is not communicated by color alone.
6. Compare every state and email in Dutch and English.
7. Verify no mixed-language fallback text.

### 12.7 Discovery non-regression

Run the established regression suites without changing expected behavior for:

- map rendering and navigation;
- marker and cluster interaction;
- hover previews;
- selection and viewport restoration;
- list ordering and selection;
- icon appearance and accessible labels;
- result and detail cards;
- filter hierarchy, defaults, application, clearing, and counts;
- discovery URL serialization; and
- discovery API parameters, response mapping, caching, and providers.

## 13. Acceptance criteria

Release v0.5.1 is accepted when:

1. Valid input creates one pending registration.
2. No active account is created.
3. Existing, pending, and new email addresses receive indistinguishable
   browser-visible request and resend responses.
4. The registration email contains the required content and no prohibited
   personal data.
5. Only the newest valid unused token succeeds.
6. Replayed, expired, superseded, and malformed links fail safely.
7. Resend cooldown and rate limits work without revealing account state.
8. Raw tokens, email contents, phone numbers, and passwords do not appear in
   prohibited logs, analytics, or error payloads.
9. Dutch and English journeys are complete and equivalent.
10. Keyboard, screen-reader, reflow, zoom, and accessible-email checks pass.
11. Delivery failures are retryable or operator-visible.
12. Feature-disabled account routes fail closed.
13. Public discovery remains available while registration is disabled.
14. Existing map, list, icon, card, and filter regression tests pass without
    changed expectations.
15. Product, privacy, legal, security, accessibility, engineering, QA,
    support, and operations approve the release evidence relevant to this
    technical foundation.

## 14. Public-release boundary

v0.5.1 is not a complete consumer-facing registration journey. It must remain
behind a feature flag until a later release adds at least:

- full registration form;
- password creation through the identity provider;
- Terms acceptance;
- privacy-notice acknowledgement;
- required application-account creation;
- idempotent activation;
- registration confirmation; and
- safe return to the initiating search.

That later vertical slice is the smallest publicly releasable account
registration capability.

## 15. Rollout and rollback

### 15.1 Rollout

1. Deploy schema and API with registration disabled.
2. Verify readiness and migration state.
3. Verify Development and Production identity/delivery separation.
4. Run API, email, security, accessibility, localization, and discovery
   regression suites.
5. Enable only for approved internal testing.
6. Monitor aggregate privacy-safe request, delivery, expiry, resend, and
   failure metrics.

### 15.2 Rollback

Rollback must:

- disable the registration feature;
- stop new requests and sends;
- leave public discovery operational;
- preserve pending-registration, token-state, outbox, and audit records;
- avoid replaying or duplicating lifecycle messages;
- avoid dropping tables or columns; and
- retain enough safe state for reconciliation or policy-approved cleanup.

## 16. Definition of done

v0.5.1 is done when:

- every included requirement has implementation and test evidence;
- the pending-registration and token lifecycle is deterministic and auditable;
- lifecycle delivery is idempotent and observable;
- security, privacy, accessibility, and localization gates pass;
- no discovery behavior changed;
- rollback is rehearsed;
- public exposure remains disabled; and
- the release evidence is approved by the required owners.