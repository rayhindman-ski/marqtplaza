# Consumer Registration, Onboarding, and Offboarding

## Business Requirements Document

| Field | Value |
|---|---|
| Product | MarqtPlaza consumer application |
| Document type | Business requirements and functional specification |
| Version | 0.5 draft |
| Status | Proposed; requires product, privacy, legal, security, and technical approval |
| Audience | Product, design, engineering, security, privacy, legal, support, and QA |
| Primary journey | Consumer registration, verification, account activation, account use, recovery, and offboarding |

## 1. Purpose

This document specifies the complete consumer account lifecycle:

1. A consumer starts registration on a secure sign-up page.
2. The initial page captures name, email address, and phone number.
3. The system sends a secure, time-limited registration link to the supplied email address.
4. The consumer opens the link and completes a full registration form.
5. The consumer creates and validates a password, reviews legal notices, and activates the account.
6. The application retains the consumer's permitted discovery context, including their last search and map zoom state.
7. On later sign-in, the consumer receives a quick link to resume their last search.
8. The consumer can recover access, reset a password, manage privacy choices, sign out, export data, and close the account.

This is a proposed specification. It does not assert that every requirement is already implemented. Final legal text, lawful bases, retention periods, and identity-provider capabilities must be approved before release.

## 2. Business objective

Provide a secure, understandable, and low-friction consumer account journey that:

- verifies control of the supplied email address;
- captures only information needed for the account and explicitly selected services;
- prevents account enumeration and common registration abuse;
- gives a clear reason to register without blocking guest discovery;
- restores a consumer's recent discovery context after sign-in;
- supports accessible password recovery;
- records the exact legal notices and choices presented to the consumer;
- enables GDPR rights, account closure, and policy-compliant deletion;
- preserves Dutch and English parity; and
- gives support and operations an auditable, privacy-safe lifecycle.

## 3. Guiding principles

1. **Guest discovery remains available.** Registration must not be required to browse public search results, maps, listings, or public detail pages.
2. **Collect the minimum necessary data.** Required and optional fields must be visibly distinguished and justified.
3. **Verify before activation.** An account is not active until email ownership and required registration steps are confirmed.
4. **Do not store passwords in the application database.** Password creation, hashing, breach checks, reset, and credential verification belong to the approved identity provider.
5. **Do not use phone number as SMS sign-in unless separately approved and supported.** Under this specification, phone number is consumer contact data.
6. **Terms and privacy are not bundled.** Required Terms and Conditions acceptance, privacy-notice acknowledgement, and optional consent must be separate records.
7. **Optional consent is unselected by default.** Refusing optional processing must not block account creation.
8. **Private context stays private.** Account identifiers, tokens, phone numbers, exact private preferences, and precise location must not appear in shared URLs, analytics payloads, or public metadata.
9. **Deletion claims must be accurate.** The interface must distinguish requested, pending, completed, anonymized, and lawfully retained data.
10. **Every lifecycle transition is auditable.** Audit events must avoid passwords, registration tokens, email contents, and unnecessary personal data.

## 4. Scope

### 4.1 In scope

- Account-value explanation and registration entry points.
- Secure initial sign-up page.
- Name, email, and phone capture.
- Email registration-link delivery and resend.
- Registration-link verification, expiry, and invalid-link handling.
- Full profile completion.
- Password creation, confirmation, and validation.
- Terms and Conditions acceptance.
- Privacy notice presentation and acknowledgement.
- Optional GDPR consent choices where consent is the approved lawful basis.
- Account activation and initial sign-in.
- Safe restoration of the initiating discovery context.
- Account-backed last-search and map-view state.
- Quick link to resume the last search.
- Sign-in, sign-out, session expiry, and reauthentication.
- Forgot-password and reset-password journeys.
- Profile correction and contact-detail updates.
- Consent review and withdrawal.
- Personal-data export request.
- Account closure and deletion request.
- Offboarding notifications and support states.
- Security, accessibility, localization, audit, and operational controls.

### 4.2 Out of scope

- Mandatory registration for public discovery.
- SMS-based authentication or verification unless separately approved.
- Social login, passkeys, or multi-factor authentication unless enabled by a later requirement.
- Marketing automation beyond recording an optional choice.
- Advertising profiling.
- Saving a precise device location without a separately approved purpose and disclosure.
- Legal drafting of final Terms and Conditions or privacy policy.
- Inventing retention periods or lawful bases without legal and privacy approval.
- Business-owner onboarding, claims, publication review, or reviewer administration.

## 5. Stakeholders and roles

| Role | Responsibility |
|---|---|
| Consumer | Registers, verifies, completes the profile, manages credentials and privacy, and closes the account |
| Product owner | Approves value proposition, scope, priorities, and release criteria |
| Privacy owner / DPO | Approves purposes, lawful bases, notices, rights, retention, and deletion outcomes |
| Legal owner | Approves Terms and Conditions, privacy policy, age rules, and jurisdiction-specific text |
| Security owner | Approves threat model, identity controls, abuse controls, token handling, and incident procedures |
| Engineering | Implements frontend, API, identity integration, persistence, and lifecycle operations |
| UX/content | Designs accessible Dutch and English journeys and exceptional states |
| QA | Verifies functional, security, accessibility, localization, and privacy acceptance criteria |
| Support | Handles verified account-recovery and data-rights exceptions without bypassing security |
| Operations | Monitors delivery, failures, abuse, deletion queues, and service health |

## 6. Consumer personas

### 6.1 Guest explorer

Wants to search and browse without creating an account. May register later to save continuity and preferences.

### 6.2 Registering consumer

Has supplied initial contact information but has not yet verified the email address or completed the account.

### 6.3 Active consumer

Has a verified account and can use account-backed preferences, last-search restoration, privacy controls, and saved features.

### 6.4 Locked-out consumer

Cannot remember the password, has an expired session, or needs to change a compromised credential.

### 6.5 Departing consumer

Wants to sign out, stop optional processing, export personal data, deactivate the account, or request deletion.

## 7. End-to-end customer journey

### 7.1 Stage A — Registration entry

**Entry points**

- Account navigation.
- A contextual prompt shown after the consumer asks to use an account-only feature.
- A registration link from a sign-in page.

**Required behavior**

1. Explain the currently implemented account benefits.
2. State that public browsing remains available without an account.
3. Preserve the consumer's current public discovery context.
4. Offer **Register**, **Sign in**, and **Continue browsing**.
5. On cancel or Back, return to the exact initiating context.

### 7.2 Stage B — Secure initial sign-up

The secure sign-up page captures:

- first and last name, or one full-name field;
- email address; and
- phone number.

The page must also:

- explain why each field is required;
- identify the phone number as contact data, not an SMS login method;
- link to the Terms and Conditions and privacy notice;
- avoid collecting a password at this stage;
- include abuse protection that does not create an inaccessible barrier;
- submit only over HTTPS;
- never disclose whether an email address already has an account; and
- retain only non-secret inputs after a recoverable validation error.

**Submission result**

The response must use neutral wording such as:

> If the address can be used for registration, we will send instructions to that email address.

This wording prevents account enumeration.

### 7.3 Stage C — Registration email

The system sends an email containing:

- the MarqtPlaza name and approved sender identity;
- a clear explanation of why the email was sent;
- a secure registration link;
- the link-expiry period;
- guidance for an unintended recipient;
- a privacy/support link; and
- no password, phone number, or unnecessary personal data.

The registration link must:

- contain a cryptographically strong, unguessable token;
- be single-use;
- expire after an approved short period;
- be bound to the registration attempt and intended email;
- be invalidated after successful use or superseding resend;
- avoid exposing personal data in the URL;
- use an allowlisted application destination; and
- be stored only in a non-reversible form where application-managed tokens are used.

### 7.4 Stage D — Link opened

The consumer sees one of the following states:

| State | Required behavior |
|---|---|
| Valid | Continue to the full registration form |
| Already used | Explain that the link is no longer valid and offer Sign in or password recovery |
| Expired | Explain expiry and offer a new registration email |
| Invalid | Show a generic invalid-link message without revealing account state |
| Superseded | Explain that a newer email must be used |
| Network error | Preserve safe context and provide Retry |
| Registration disabled | Explain unavailability without exposing internal configuration |

Opening a link must not silently complete an account or sign the consumer in before the required form, legal acknowledgements, and identity-provider actions succeed.

### 7.5 Stage E — Full registration form

The form must present the verified email address as read-only or require reverification after an email change.

#### Required fields

- Name.
- Verified email address.
- Phone number in normalized international format.
- Password.
- Password confirmation.
- Required Terms and Conditions acceptance.
- Required acknowledgement that the privacy notice was presented.

#### Optional fields

Optional fields may include:

- preferred language;
- preferred neighbourhood;
- accessibility or display preferences;
- optional product communications; and
- optional marketing consent.

Every optional field must be labeled optional. Optional consent controls must be separate, specific, unselected, and withdrawable.

#### Password requirements

The approved identity provider must enforce:

- an approved minimum length;
- support for paste and password managers;
- no unnecessary maximum shorter than the identity provider's safe limit;
- no composition rules that weaken usability without security benefit;
- confirmation that both password entries match;
- compromised-password screening where approved;
- secure transport;
- rate limiting; and
- no application logging, analytics, or persistence of password values.

The interface must:

- provide show/hide controls;
- announce requirements before submission;
- show field-specific errors;
- preserve non-secret fields after failure;
- clear password fields when the security context requires it; and
- not reveal whether the same credentials belong to another account.

### 7.6 Stage F — Legal and GDPR presentation

Before activation:

1. Present links to the current Terms and Conditions and privacy notice.
2. Make both documents available in the selected language.
3. Provide a printable or downloadable form where required by policy.
4. Make the documents available again from account settings.
5. Record the document type, version, locale, timestamp, account/registration reference, and action.

The records must distinguish:

- **Terms acceptance:** required to create the account where legally approved.
- **Privacy notice acknowledgement:** evidence that the notice was presented; it is not blanket consent.
- **Optional consent:** recorded only for a specific optional purpose where consent is the approved lawful basis.

The system must not:

- bundle marketing consent with Terms acceptance;
- preselect optional consent;
- block account creation because optional consent was refused;
- present a single "I agree to everything" control; or
- describe all processing as consent-based when another lawful basis applies.

If a consumer requests the GDPR/privacy policy, the system must:

- display it without requiring sign-in;
- provide the current version and effective date;
- show the consumer's recorded acknowledgement and optional choices after sign-in;
- allow withdrawal of optional consent;
- explain that withdrawal affects future processing and does not automatically invalidate lawful prior processing; and
- provide data-access, correction, export, objection/restriction, and deletion routes as applicable.

### 7.7 Stage G — Account activation

The account becomes active only after:

- the email is verified;
- the identity provider confirms password creation;
- required form fields are valid;
- required Terms acceptance is recorded;
- the privacy notice has been presented and acknowledged as required; and
- the application account record is created successfully.

Activation must be atomic or recoverable. A partial failure must not produce an active identity with missing required application records without a controlled reconciliation path.

On success:

1. Confirm that registration is complete.
2. Start an authenticated session only when permitted by the approved identity flow.
3. Restore the safe initiating context.
4. Explain the last-search feature and its privacy controls.
5. Offer **Resume previous search**, **Start a new search**, and **Account settings**.

### 7.8 Stage H — Return sign-in

The sign-in page must provide:

- email and password inputs;
- **Forgot password?**;
- registration path;
- privacy and Terms links;
- generic invalid-credential feedback;
- progress and retry states;
- accessible labels and errors; and
- a safe cancel/back route to public discovery.

After successful sign-in:

- restore an allowlisted internal return destination;
- do not accept an arbitrary redirect URL;
- show the latest available last-search quick link;
- do not automatically initiate external searches or geolocation requests; and
- do not automatically repeat destructive or account-writing actions.

## 8. Last-search and map-state requirements

### 8.1 Business requirement

For an authenticated consumer, retain sufficient private discovery state to offer a quick link to their most recent search after sign-in.

### 8.2 Permitted state

Subject to approved privacy policy, the saved state may include:

- city or service area;
- selected neighbourhoods;
- postcode or text query;
- top-level category and subcategories;
- filters;
- language;
- local-only or explicitly selected online-search scope;
- selected result identifier when still valid;
- result-list or map presentation mode;
- map zoom level;
- map center or bounded viewport at the minimum precision needed for restoration;
- result scroll position where technically appropriate; and
- last-used timestamp.

### 8.3 Restrictions

- Do not store a raw device geolocation merely because the user used a map.
- A map center derived from manual navigation must be treated as private preference data.
- Do not put private viewport state, account IDs, or precise coordinates in shared URLs.
- Do not automatically reactivate optional online-search scope without the approved disclosure and saved preference rules.
- Do not save passwords, tokens, provider responses, or full result payloads in last-search state.
- Apply an approved retention period and replace older state when only the latest search is required.
- Provide **Clear last search** and a control to disable future account-backed search-history retention if policy requires it.

### 8.4 Quick-link behavior

The account home and post-sign-in page must show:

> Continue your last search: [human-readable summary]

The summary must include enough context to be understood, such as neighbourhood and category, but must avoid exposing private information on a shared screen.

When selected, the quick link must:

1. validate the saved state against current supported values;
2. restore only safe, current fields;
3. degrade gracefully if a category, listing, or neighbourhood no longer exists;
4. avoid automatically requesting device location;
5. avoid automatically starting a third-party web search unless allowed by the active scope choice; and
6. update the canonical public URL only with validated public criteria.

## 9. Password recovery and reset

### 9.1 Forgot-password request

1. Consumer selects **Forgot password?**.
2. Consumer enters an email address.
3. The system always shows a neutral response.
4. If eligible, the identity provider sends a time-limited reset email.
5. Repeated requests are rate-limited without confirming account existence.

### 9.2 Reset email

The email must:

- identify the requested action;
- include a single-use, expiring reset link or approved verification code;
- state the expiry period;
- explain how to ignore or report an unexpected request; and
- omit credentials and unnecessary personal data.

### 9.3 Reset form

The reset page must:

- validate the token before accepting a new password;
- show generic invalid, expired, used, and superseded states;
- apply the same password rules as registration;
- prevent reuse when supported and approved;
- invalidate the reset token after success;
- revoke or review existing sessions according to approved security policy;
- send a password-changed notification; and
- return the consumer to sign-in or a confirmed authenticated session according to policy.

### 9.4 Recovery exceptions

- Support must not set, request, view, or transmit a consumer password.
- Support must not change an account email or phone solely from an unverified request.
- Recovery for consumers without access to the verified email requires a separately approved identity-verification procedure.
- Recovery events must be audited without logging tokens or passwords.

## 10. Profile and contact-data management

An active consumer must be able to:

- view the name, email, and phone held for the account;
- update the name;
- update the phone number with format validation;
- request an email change through reverification;
- review preferred language and discovery preferences;
- review legal-notice versions and optional consent status;
- clear last-search data;
- request data export;
- sign out; and
- start account closure.

An email change must not replace the verified primary email until the new address is verified. Notifications may be sent to the old and new addresses according to security policy.

## 11. Offboarding requirements

Offboarding includes distinct actions. The interface must not present them as equivalent.

### 11.1 Sign out

- End the current authenticated session.
- Remove private account data from in-memory client state.
- Retain only permitted public discovery criteria.
- Do not delete the account or server-held preferences.
- Provide a clear sign-in path.

### 11.2 Sign out of all sessions

- Require recent authentication where appropriate.
- Revoke all active sessions through the identity provider.
- Confirm completion.
- Notify the verified email when required by security policy.

### 11.3 Disable optional processing

- Allow withdrawal of each optional consent independently.
- Stop future processing for that purpose as soon as operationally possible.
- Record the withdrawal with notice/consent version and time.
- Do not remove access to core account functions when optional consent is withdrawn.

### 11.4 Clear account-backed last-search data

- Explain what will be cleared.
- Require confirmation.
- Remove the last-search record and related private client cache.
- Do not clear favourites or the full account unless selected separately.
- Report success only after the server confirms deletion.

### 11.5 Data export

- Provide an authenticated request route.
- Apply proportionate reauthentication.
- Generate an export in a commonly used, machine-readable format.
- Include only the requesting consumer's data.
- Deliver the export through an expiring authenticated download or another approved secure method.
- Record request, preparation, delivery, expiry, and failure states.
- Do not place exported personal data in ordinary email content.

### 11.6 Account closure and deletion

The deletion journey must:

1. explain immediate effects and any recoverable waiting period;
2. explain approved retention exceptions;
3. identify which data will be deleted, anonymized, or retained;
4. require proportionate reauthentication;
5. require an explicit final confirmation;
6. use idempotency to prevent duplicate requests;
7. provide a request reference and status;
8. allow cancellation only until the documented cutoff;
9. disable account use at the approved lifecycle stage;
10. revoke sessions and credentials at the correct stage;
11. remove or anonymize application data and identity-provider data according to the approved order;
12. complete downstream processor actions where applicable;
13. send accurate status and completion notices; and
14. provide a support route for unresolved requests.

The application must not claim immediate or complete deletion until all in-scope systems confirm the policy-defined outcome.

### 11.7 Post-deletion behavior

- Sign-in must no longer restore the deleted account.
- A later registration with the same email is a new account unless policy explicitly defines a restoration window.
- Old registration, verification, and reset links must remain invalid.
- Public, lawfully retained, or anonymized content must not expose the deleted consumer's identity.
- Audit evidence retained under an approved obligation must be minimized and access-controlled.

## 12. Functional requirements

### 12.1 Registration

| ID | Requirement | Priority |
|---|---|---|
| REG-001 | Provide a secure HTTPS registration entry page | Must |
| REG-002 | Capture name, email, and phone number with purpose text | Must |
| REG-003 | Validate required fields on client and server | Must |
| REG-004 | Normalize email and phone without changing their meaning | Must |
| REG-005 | Return enumeration-safe responses | Must |
| REG-006 | Create one pending registration per active attempt policy | Must |
| REG-007 | Send a single-use, expiring email registration link | Must |
| REG-008 | Support rate-limited resend and invalidate superseded links | Must |
| REG-009 | Present valid, expired, invalid, used, and error link states | Must |
| REG-010 | Present the full registration form only after link validation | Must |
| REG-011 | Create and confirm the password through the identity provider | Must |
| REG-012 | Record required legal acknowledgements by version and locale | Must |
| REG-013 | Keep optional consent separate and unselected | Must |
| REG-014 | Activate the account only after every release condition succeeds | Must |
| REG-015 | Restore safe initiating discovery context after success or cancel | Must |

### 12.2 Authentication and recovery

| ID | Requirement | Priority |
|---|---|---|
| AUTH-001 | Support email/password sign-in | Must |
| AUTH-002 | Use generic invalid-credential errors | Must |
| AUTH-003 | Support forgot-password request without enumeration | Must |
| AUTH-004 | Use single-use, expiring reset credentials | Must |
| AUTH-005 | Enforce approved password rules and breached-password controls | Must |
| AUTH-006 | Notify the consumer after a password change | Must |
| AUTH-007 | Provide session-expired recovery without losing public context | Must |
| AUTH-008 | Validate all post-authentication return destinations | Must |
| AUTH-009 | Support sign-out and, where approved, sign-out of all sessions | Should |

### 12.3 Search restoration

| ID | Requirement | Priority |
|---|---|---|
| SRCH-001 | Store the latest permitted search state for an authenticated account | Must |
| SRCH-002 | Include map zoom and minimum necessary viewport context | Must |
| SRCH-003 | Treat search and viewport state as private account data | Must |
| SRCH-004 | Show a human-readable last-search quick link after sign-in | Must |
| SRCH-005 | Validate and safely degrade stale search state | Must |
| SRCH-006 | Provide a clear-last-search control | Must |
| SRCH-007 | Never restore geolocation permission or launch optional external processing silently | Must |

### 12.4 Legal and privacy

| ID | Requirement | Priority |
|---|---|---|
| PRIV-001 | Present current Terms and Conditions and privacy notice before activation | Must |
| PRIV-002 | Record document version, locale, timestamp, and action | Must |
| PRIV-003 | Separate Terms acceptance, notice acknowledgement, and optional consent | Must |
| PRIV-004 | Make privacy information available without sign-in | Must |
| PRIV-005 | Show account-specific acknowledgement and consent history after sign-in | Should |
| PRIV-006 | Permit withdrawal of optional consent | Must |
| PRIV-007 | Provide access, correction, export, and deletion routes | Must |
| PRIV-008 | Apply approved retention schedules and lawful exceptions | Must |
| PRIV-009 | Do not expose personal data in shared URLs, logs, or public metadata | Must |

### 12.5 Offboarding

| ID | Requirement | Priority |
|---|---|---|
| OFF-001 | Distinguish sign-out, preference clearing, consent withdrawal, and deletion | Must |
| OFF-002 | Require reauthentication for sensitive account actions | Must |
| OFF-003 | Create idempotent deletion requests with status | Must |
| OFF-004 | Revoke sessions at the policy-defined lifecycle stage | Must |
| OFF-005 | Delete/anonymize identity and application data in an approved order | Must |
| OFF-006 | Report retained categories and reasons accurately | Must |
| OFF-007 | Invalidate all old registration and reset links | Must |
| OFF-008 | Provide support visibility without exposing unnecessary personal data | Must |

## 13. Business rules

1. Email comparison must be case-insensitive according to the approved identity implementation.
2. Email normalization must not remove characters in a way that merges distinct provider addresses.
3. Phone numbers must be stored in a normalized format with the original country context where required.
4. One email must not activate multiple consumer identities unless explicitly supported.
5. A pending registration is not an active account.
6. Repeated submission must not create duplicate accounts or duplicate legal records.
7. A newer registration-link resend invalidates older active links.
8. Password and token values must never enter application logs or analytics.
9. Legal-document acceptance must reference an immutable approved version.
10. Material Terms changes may require reacceptance; privacy notices must be re-presented when legally required.
11. Optional consent withdrawal must not be treated as account deletion.
12. Last-search state belongs to one account and must never cross accounts on a shared browser.
13. Sign-out must clear private client caches before another account signs in.
14. Deletion requests must remain monotonic and auditable.
15. Support cannot bypass email verification, password security, or deletion authorization through an ordinary UI override.

## 14. Proposed information model

The following conceptual records must be reconciled with the existing schema before implementation.

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

ConsumerAccount {
  accountId
  identityProviderUserId
  name
  verifiedEmail
  phone
  preferredLocale
  status
  createdAt
  updatedAt
}

LegalAcknowledgement {
  accountId
  documentType
  documentVersion
  locale
  action
  recordedAt
}

ConsentEvent {
  accountId
  purpose
  noticeVersion
  action: granted | withdrawn
  recordedAt
}

LastSearchState {
  accountId
  publicCriteria
  presentationMode
  zoom
  boundedViewport?
  selectedListingId?
  updatedAt
  expiresAt?
}

AccountLifecycleRequest {
  requestId
  accountId
  type: export | deletion
  status
  requestedAt
  cancellableUntil?
  completedAt?
  outcomeSummary?
}
```

### 14.1 Data minimization

- Store identity-provider user IDs, not passwords.
- Store token digests rather than raw application-managed tokens.
- Do not duplicate verified email data in lifecycle message rows if it can be resolved at delivery time.
- Do not store full email bodies as operational logs.
- Store only the latest search when history is not an approved feature.
- Reduce map precision to what restoration requires.
- Do not retain failed form password values.

## 15. Proposed service interfaces

Existing identity-provider and account contracts take precedence. Proposed application interfaces include:

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

Password creation, sign-in, forgot-password, reset-password, session management, and identity deletion should use the approved identity-provider interfaces rather than application-created credential endpoints.

## 16. Security requirements

- HTTPS and secure headers are mandatory.
- Use an approved identity provider for credential storage and verification.
- Apply CSRF protection to authenticated state-changing requests.
- Apply rate limits by safe combinations of request, account, network, and device risk signals.
- Do not permanently block shared networks solely by IP.
- Apply bot and abuse protection with an accessible fallback.
- Prevent account enumeration in registration, sign-in, recovery, and resend responses.
- Use short-lived, random, single-use verification/reset credentials.
- Validate all redirect and return destinations against an internal allowlist.
- Require recent authentication for email change, password change, export, all-session sign-out, and deletion.
- Apply session fixation protection and secure cookie settings.
- Do not expose secrets or personal data in logs, traces, error messages, or analytics.
- Record security audit events with controlled access and approved retention.
- Detect abnormal resend, reset, token, and sign-in patterns.
- Provide incident procedures for compromised accounts and email delivery abuse.
- Threat-model the complete onboarding and offboarding lifecycle before production release.

## 17. Privacy and GDPR requirements

Before release, the privacy owner must approve a processing inventory containing:

- purpose;
- data category;
- lawful basis;
- source;
- recipient/processor;
- processing location;
- retention period;
- deletion/anonymization path;
- consumer right handling; and
- operational owner.

The product must support, where applicable:

- transparent notice;
- access;
- correction;
- portability/export;
- deletion;
- restriction;
- objection;
- consent withdrawal; and
- complaint/contact route.

The product must not claim "GDPR compliant" solely because a checkbox or privacy link exists. Compliance requires policy, contracts, technical controls, operational procedures, and verifiable outcomes.

## 18. Accessibility and localization

- Target WCAG 2.2 AA.
- Support keyboard-only completion.
- Maintain logical focus after validation, resend, modal close, and route transitions.
- Associate errors and help text with their fields.
- Announce loading, success, and error states.
- Do not rely on color alone.
- Support browser zoom to 400% and reflow at 320 CSS pixels.
- Permit password-manager and clipboard use.
- Use appropriate autocomplete attributes.
- Ensure registration emails and linked pages are accessible.
- Provide complete Dutch and English parity for UI, validation, lifecycle email, Terms, privacy, recovery, and offboarding.
- Preserve the selected locale through email links and recovery, subject to safe validation.

## 19. Notifications

| Event | Notification |
|---|---|
| Registration requested | Registration-link email |
| Registration link resent | New email; prior link invalidated |
| Registration completed | Welcome/security confirmation |
| Password reset requested | Reset email when eligible |
| Password changed | Security confirmation |
| Primary email change requested | Verification plus security notification as approved |
| Primary email changed | Confirmation to appropriate old/new addresses |
| All sessions revoked | Security confirmation |
| Export ready | Secure availability notice, not the data itself |
| Deletion requested | Request reference and status |
| Deletion cancelled | Cancellation confirmation |
| Deletion completed | Accurate outcome summary |

All delivery must be idempotent, retryable, observable, and privacy-safe. A delivery-provider acceptance response is not proof that the consumer received the email.

## 20. Required UI states

Every relevant screen must define:

- initial;
- valid input;
- invalid input;
- submitting;
- success;
- empty;
- expired;
- already used;
- superseded;
- unavailable;
- rate limited;
- offline/network error;
- server error;
- permission denied;
- session expired;
- pending deletion;
- deletion cancellation unavailable; and
- deletion complete.

No success state may be shown before the authoritative backend or identity provider confirms it.

## 21. Acceptance criteria

### 21.1 Registration

1. A guest can open registration without losing the current public search.
2. Name, email, and phone are required and have accessible validation.
3. Submission produces an enumeration-safe response.
4. A registration email contains a single-use expiring link.
5. Old links fail after resend, use, or expiry.
6. The full registration form is accessible only through a valid registration state.
7. Password values never appear in application storage, logs, analytics, or error payloads.
8. Required Terms acceptance and privacy-notice acknowledgement reference exact approved versions.
9. Optional consent is separate, unselected, and non-blocking.
10. Repeated completion does not create duplicate accounts.
11. Partial activation failures can be retried or reconciled safely.
12. Successful completion restores the initiating discovery context.

### 21.2 Sign-in and recovery

13. Invalid sign-in does not reveal whether an account exists.
14. Forgot-password requests return neutral responses.
15. Reset credentials expire, are single-use, and are invalid after success.
16. New passwords meet the same rules as registration.
17. Password change produces a security notification.
18. Session expiry does not erase public search criteria or create a redirect loop.

### 21.3 Last search

19. An authenticated search records only the approved minimum state.
20. A later sign-in shows a readable quick link to the last search.
21. Selecting the link restores search filters and map zoom when values remain valid.
22. Stale or removed values are ignored safely.
23. No device-geolocation permission request or optional web-provider call occurs automatically.
24. Clearing last-search data removes the server record and private client cache.
25. One user's saved search cannot appear for another user on the same browser.

### 21.4 Legal and privacy

26. Terms and privacy documents are available without sign-in and in Dutch and English.
27. The account shows current legal acknowledgements and optional consent status.
28. Optional consent can be withdrawn as easily as it was granted.
29. Export returns only the authenticated consumer's data.
30. Personal data, tokens, and account identifiers do not appear in shared URLs or ordinary logs.

### 21.5 Offboarding

31. Sign-out does not delete the account.
32. Clear-last-search does not delete unrelated account data.
33. Deletion requires reauthentication and explicit confirmation.
34. Duplicate deletion submissions create one effective request.
35. Pending, cancelled, failed, and completed states are accurate.
36. Completion reports deleted, anonymized, and lawfully retained categories.
37. Sessions and old registration/reset links are invalid after the policy-defined closure stage.
38. A deleted account cannot restore old private search state.

### 21.6 Quality

39. All core journeys pass keyboard, screen-reader, 320-pixel reflow, and 400% zoom checks.
40. Dutch and English journeys are functionally and semantically equivalent.
41. Security tests cover enumeration, token replay, token expiry, open redirects, CSRF, rate limiting, session isolation, and authorization.
42. Privacy tests verify minimization, consent separation, rights routing, retention behavior, and deletion outcomes.

## 22. Success measures

Metrics must be privacy-approved and aggregated. Proposed measures:

- registration start-to-email-request completion;
- registration email accepted by the delivery provider;
- valid-link open-to-registration completion;
- validation failure rate by non-sensitive error category;
- resend, expiry, and invalid-link rates;
- successful sign-in and recovery rates;
- last-search quick-link use;
- last-search clear/disable use;
- support contacts for registration and recovery;
- export/deletion request completion time;
- deletion failure and retry rate;
- accessibility defects;
- localization defects; and
- confirmed security/privacy incidents.

Do not include raw email addresses, phone numbers, passwords, tokens, full search text, or precise location in analytics.

## 23. Dependencies

- Approved identity-provider configuration for email/password, verification, reset, session, and password controls.
- Verified email sender and lifecycle delivery provider.
- Approved Terms and Conditions.
- Approved privacy notice and processing inventory.
- Approved retention and deletion schedule.
- Account, consent, preference, search-state, and lifecycle data contracts.
- Support and privacy-request operating procedures.
- Security threat model and abuse-control configuration.
- Dutch and English legal/content approval.
- Production monitoring and incident response.

## 24. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Account enumeration | Neutral responses, uniform flows, rate limiting, no account-state disclosure |
| Stolen or forwarded registration link | Short expiry, single use, binding, reauthentication for sensitive follow-up |
| Duplicate identity/application records | Idempotency, unique constraints, transactional lifecycle, reconciliation |
| Password exposure | Identity-provider handling only; no application persistence/logging |
| Unverified phone data | Label purpose; validate format; add verification only if later required |
| Excessive search/location retention | Minimum state, reduced precision, retention limit, clear control |
| Consent invalidity | Separate optional choices, no preselection, versioned evidence, easy withdrawal |
| Inaccurate deletion claims | Status model, processor reconciliation, approved exceptions, completion summary |
| Broken email delivery | Retry schedule, delivery receipts, operator queue, resend |
| Shared-device data leakage | Account isolation, private-cache clearing, no cross-account hydration |
| Open redirect after auth | Internal allowlist and validated return-state identifiers |
| Accessibility barrier from abuse controls | Accessible challenge/fallback and monitored failure rates |

## 25. Delivery plan

### Phase 1 — Policy and contract approval

- Approve purposes, lawful bases, fields, Terms, privacy notice, retention, and deletion.
- Reconcile this specification with current identity, account, lifecycle, and database contracts.
- Complete threat model and data-protection assessment where required.

### Phase 2 — Registration and identity

- Build initial sign-up, email-link lifecycle, full form, password-provider integration, and activation.
- Add localization, accessibility, audit, and abuse controls.

### Phase 3 — Account continuity

- Add last-search persistence, map-zoom restoration, quick link, clear controls, and session-safe return paths.

### Phase 4 — Recovery and account management

- Complete forgot/reset password, profile correction, legal history, consent management, and all-session sign-out.

### Phase 5 — Offboarding and rights

- Complete export, deletion request/status/cancellation, processor reconciliation, and completion reporting.

### Phase 6 — Release validation

- Run functional, security, privacy, accessibility, localization, failure, rollback, and operational-readiness tests.
- Release behind approved feature controls.
- Monitor aggregate lifecycle health and support demand.

## 26. Release gates

The consumer onboarding/offboarding journey must not be released until:

- legal text and versions are approved;
- privacy purposes, lawful bases, retention, and deletion are approved;
- identity-provider production configuration is verified;
- email sender and delivery monitoring are operational;
- passwords and tokens are absent from application logs;
- enumeration and redirect tests pass;
- account/search state isolation tests pass;
- export and deletion authorization tests pass;
- Dutch and English parity passes;
- WCAG 2.2 AA acceptance passes for core journeys;
- support and incident procedures are ready; and
- rollback does not require deleting or corrupting account, consent, or lifecycle records.

## 27. Open decisions

The following require explicit approval before implementation:

1. Whether name is one field or separate first/last fields.
2. Why phone number is mandatory and whether it may instead be optional.
3. Whether phone ownership must be verified.
4. Registration-link and pending-registration expiry periods.
5. Password policy and compromised-password handling.
6. Whether successful registration starts a session automatically.
7. Exact last-search retention period and map-center precision.
8. Whether consumers can disable account-backed search-state storage.
9. Terms reacceptance rules after material changes.
10. Optional communication and marketing purposes.
11. Export format and secure-delivery expiry.
12. Account-deletion waiting period and cancellation cutoff.
13. Required lawful retention exceptions.
14. Whether identity-provider deletion occurs immediately or after application-data reconciliation.
15. Support escalation process when the verified email is unavailable.

## 28. Definition of done

This requirement is complete only when:

- the approved customer journeys are implemented end to end;
- every lifecycle state is represented truthfully;
- account, identity, consent, search-state, email, export, and deletion records reconcile;
- all acceptance criteria have evidence;
- policy and UI copy match real system behavior;
- operations can diagnose failures without viewing passwords, tokens, or unnecessary personal data; and
- product, privacy, legal, security, accessibility, engineering, QA, support, and operations approve production readiness.
