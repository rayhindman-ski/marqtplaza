# Consumer Onboarding and Offboarding Requirements

## 1. Document control

| Field | Value |
|---|---|
| Product | MarqtPlaza consumer application |
| Version | 0.5 draft |
| Status | Proposed requirements baseline |
| Source | [`consumer-registration-journey.md`](./consumer-registration-journey.md) |
| Scope | Consumer registration, authentication, continuity, recovery, privacy, and offboarding |
| Requirement keywords | **Must** = release requirement; **Should** = expected unless an approved exception exists |

This catalogue converts the customer-journey specification into individually
traceable requirements. It does not replace approved legal text, privacy
decisions, identity-provider policy, or production operating procedures.

## 2. Business outcomes

| ID | Requirement | Priority |
|---|---|---|
| BUS-001 | Public discovery must remain usable without registration. | Must |
| BUS-002 | Registration must provide a concrete, truthful account benefit. | Must |
| BUS-003 | The account lifecycle must verify control of the consumer's email address before activation. | Must |
| BUS-004 | The lifecycle must collect only data required for an approved purpose. | Must |
| BUS-005 | A returning consumer must be able to resume the most recent permitted search and map context. | Must |
| BUS-006 | The lifecycle must provide secure credential recovery without support staff handling passwords. | Must |
| BUS-007 | Legal notices and consumer choices must be versioned and auditable. | Must |
| BUS-008 | The lifecycle must support access, correction, export, consent withdrawal, and policy-compliant deletion. | Must |
| BUS-009 | Dutch and English journeys must be semantically and functionally equivalent. | Must |
| BUS-010 | Operations must be able to diagnose lifecycle failures without viewing passwords, tokens, or unnecessary personal data. | Must |
| BUS-011 | Consumer onboarding and offboarding changes must not alter any existing map, list, icon, card, or filter behavior, appearance, interaction, state, data contract, or performance unless a separate approved requirement explicitly authorizes that change. | Must |

### 2.1 Existing discovery behavior is fixed

The registration, authentication, account, recovery, privacy, and offboarding
work is an additive account capability. It must not redesign, replace,
reconfigure, or otherwise change existing discovery behavior.

This restriction includes, but is not limited to:

- map rendering, boundaries, tiles, markers, clusters, selection, hover,
  panning, zooming, viewport restoration, and map/list synchronization;
- list ordering, grouping, pagination, scrolling, selection, and empty/error
  states;
- icon choice, color, size, position, labels, and interaction;
- result cards, hover cards, detail cards, saved-state indicators, links, and
  actions;
- filter names, hierarchy, defaults, visibility, combinations, query
  serialization, application, clearing, and result counts;
- existing public discovery routes, API request parameters, response mapping,
  cache keys, and provider behavior; and
- desktop, responsive, keyboard, and localized behavior for those surfaces.

The only permitted interaction with discovery state is the explicitly defined
account-backed capture and restoration of the consumer's last search. That
feature must call the existing map, list, card, icon, and filter interfaces
without changing their established behavior.

Any change to these protected surfaces requires a separate requirement,
documented impact assessment, explicit product approval, and dedicated
regression evidence. It must not be introduced as an incidental part of
consumer onboarding or offboarding.

## 3. Registration requirements

| ID | Requirement | Priority |
|---|---|---|
| REG-001 | Provide a dedicated registration page over HTTPS. | Must |
| REG-002 | Explain verified account benefits and state that consumers may continue browsing without an account. | Must |
| REG-003 | Preserve the initiating public search, result, locale, and return context when registration begins, is cancelled, fails, or succeeds. | Must |
| REG-004 | Capture the consumer's name, email address, and phone number on the initial registration page. | Must |
| REG-005 | State the purpose of each required field and identify phone number as contact data rather than an SMS sign-in method. | Must |
| REG-006 | Validate required fields on both client and server, associate errors with their fields, and preserve non-secret values after recoverable errors. | Must |
| REG-007 | Normalize email and phone values without merging distinct email addresses or changing the consumer's intended contact details. | Must |
| REG-008 | Return a neutral response to initial registration and resend requests so account existence cannot be inferred. | Must |
| REG-009 | Apply accessible abuse prevention and rate limits to registration and resend operations. | Must |
| REG-010 | Create a pending registration without creating an active consumer account. | Must |
| REG-011 | Send a registration email containing the approved sender identity, purpose, expiry information, support/privacy links, and a secure registration link. | Must |
| REG-012 | Use a cryptographically strong, single-use, expiring registration token that is bound to the registration attempt and contains no personal data. | Must |
| REG-013 | Store only a digest of an application-managed registration token. | Must |
| REG-014 | Invalidate a registration token after use, expiry, cancellation, or a superseding resend. | Must |
| REG-015 | Present explicit valid, expired, invalid, used, superseded, unavailable, and network-error link states. | Must |
| REG-016 | Permit a rate-limited resend from the expired/invalid-link journey without disclosing account state. | Must |
| REG-017 | Require a valid registration state before showing or accepting the full registration form. | Must |
| REG-018 | Present the verified email as read-only, or require reverification if it is changed. | Must |
| REG-019 | Capture and validate the required full-profile fields before activation. | Must |
| REG-020 | Mark every non-required profile field as optional. | Must |
| REG-021 | Create and confirm the password through the approved identity provider rather than the application database. | Must |
| REG-022 | Support password-manager autofill, paste, show/hide, and accessible advance notice of password rules. | Must |
| REG-023 | Enforce the approved minimum length, compromised-password policy, confirmation match, rate limits, and identity-provider limits. | Must |
| REG-024 | Never log, persist, analyze, or return password values from application code. | Must |
| REG-025 | Activate the consumer account only after email verification, credential creation, required field validation, legal records, and application-account creation succeed. | Must |
| REG-026 | Make activation atomic or provide a controlled, idempotent reconciliation path for partial identity/application failures. | Must |
| REG-027 | Prevent duplicate accounts and duplicate legal records when requests are retried. | Must |
| REG-028 | Confirm registration completion only after the authoritative identity and application state is active. | Must |
| REG-029 | Restore the safe initiating context after successful registration. | Must |
| REG-030 | Offer Resume previous search, Start a new search, and Account settings after activation. | Should |

## 4. Authentication and session requirements

| ID | Requirement | Priority |
|---|---|---|
| AUTH-001 | Support sign-in with verified email and password through the approved identity provider. | Must |
| AUTH-002 | Provide registration, forgot-password, privacy, Terms, and cancel/back routes from sign-in. | Must |
| AUTH-003 | Use generic credential errors that do not reveal whether an account exists. | Must |
| AUTH-004 | Disable duplicate submission only while necessary and announce progress and outcomes accessibly. | Must |
| AUTH-005 | Accept post-authentication return destinations only from an internal allowlist. | Must |
| AUTH-006 | Restore safe public discovery context after successful sign-in. | Must |
| AUTH-007 | Never automatically replay destructive or account-writing actions after sign-in. | Must |
| AUTH-008 | Preserve public discovery when authentication is cancelled or fails. | Must |
| AUTH-009 | Explain session expiry and permit reauthentication without a redirect loop or loss of public context. | Must |
| AUTH-010 | Clear private in-memory and browser cache for the signed-out account. | Must |
| AUTH-011 | Retain only permitted public criteria after sign-out. | Must |
| AUTH-012 | Support sign-out of the current session. | Must |
| AUTH-013 | Support revocation of all sessions after recent authentication where enabled by policy. | Should |
| AUTH-014 | Notify the verified email after high-risk session or credential changes when required by security policy. | Should |

## 5. Password recovery requirements

| ID | Requirement | Priority |
|---|---|---|
| REC-001 | Provide an accessible Forgot password route from sign-in. | Must |
| REC-002 | Return the same neutral response for eligible and ineligible reset requests. | Must |
| REC-003 | Apply rate limits without revealing account existence. | Must |
| REC-004 | Use an approved identity-provider reset email with a single-use, expiring credential. | Must |
| REC-005 | State the reset purpose, expiry, unexpected-request guidance, and support route in the email. | Must |
| REC-006 | Present invalid, expired, used, superseded, offline, and server-error reset states. | Must |
| REC-007 | Apply registration-equivalent password rules to reset. | Must |
| REC-008 | Invalidate the reset credential after successful password change. | Must |
| REC-009 | Revoke or review existing sessions according to approved security policy after reset. | Must |
| REC-010 | Send a password-changed security notification. | Must |
| REC-011 | Ensure support staff never request, view, transmit, or set a consumer password. | Must |
| REC-012 | Require a separately approved identity-verification process when the verified email is unavailable. | Must |
| REC-013 | Audit recovery events without storing reset credentials or passwords. | Must |

## 6. Profile and contact requirements

| ID | Requirement | Priority |
|---|---|---|
| PROF-001 | Allow the consumer to view the name, verified email, and phone held for the account. | Must |
| PROF-002 | Allow name updates with server validation. | Must |
| PROF-003 | Allow phone updates with country-aware format validation. | Must |
| PROF-004 | Require verification of a new email before replacing the verified primary email. | Must |
| PROF-005 | Notify the appropriate old and new addresses of a primary-email change according to security policy. | Should |
| PROF-006 | Allow review and update of preferred locale and approved discovery preferences. | Must |
| PROF-007 | Provide direct routes to legal history, consent controls, last-search controls, export, sign-out, and account closure. | Must |
| PROF-008 | Protect sensitive profile operations with recent authentication. | Must |

## 7. Last-search and map-state requirements

| ID | Requirement | Priority |
|---|---|---|
| SRCH-001 | Store the latest permitted search state only for an authenticated account. | Must |
| SRCH-002 | Store only approved fields: service area, neighbourhoods, postcode/query, categories, filters, locale, source scope, selected listing, presentation mode, zoom, minimum viewport, scroll context, and timestamp. | Must |
| SRCH-003 | Treat search, viewport, and selected-result state as private account data. | Must |
| SRCH-004 | Do not store raw device geolocation merely because the consumer used a map. | Must |
| SRCH-005 | Use only the minimum map-center precision required to restore the view. | Must |
| SRCH-006 | Do not put private viewport state, exact coordinates, account identifiers, or private preferences in shared URLs. | Must |
| SRCH-007 | Do not store passwords, tokens, provider responses, or full result payloads in last-search state. | Must |
| SRCH-008 | Replace older state when only the most recent search is approved. | Must |
| SRCH-009 | Apply the approved last-search retention period. | Must |
| SRCH-010 | Show a human-readable quick link to the most recent search after sign-in and on account home. | Must |
| SRCH-011 | Avoid exposing sensitive query details in a quick-link summary on a shared screen. | Must |
| SRCH-012 | Validate every stored value against the current supported taxonomy and geography before restoration. | Must |
| SRCH-013 | Ignore removed or invalid values without failing the entire restoration. | Must |
| SRCH-014 | Never request device location automatically during restoration. | Must |
| SRCH-015 | Never silently launch optional third-party search during restoration. | Must |
| SRCH-016 | Restore external-search scope only under the active, approved disclosure and preference rules. | Must |
| SRCH-017 | Update the canonical URL only with validated public criteria. | Must |
| SRCH-018 | Provide Clear last search with confirmation and authoritative server completion. | Must |
| SRCH-019 | Clear related private client cache after server-side removal. | Must |
| SRCH-020 | Prevent one account's search state from appearing for another account on a shared browser. | Must |
| SRCH-021 | Provide a control to disable future account-backed search retention if required by approved policy. | Should |

## 8. Terms, privacy, and GDPR requirements

| ID | Requirement | Priority |
|---|---|---|
| PRIV-001 | Present the current Terms and Conditions and privacy notice before account activation. | Must |
| PRIV-002 | Make current Terms and privacy documents available without sign-in and from account settings. | Must |
| PRIV-003 | Provide approved Dutch and English versions with version and effective date. | Must |
| PRIV-004 | Provide printable or downloadable legal documents where policy requires it. | Should |
| PRIV-005 | Record document type, immutable version, locale, timestamp, account/registration reference, and consumer action. | Must |
| PRIV-006 | Treat Terms acceptance, privacy-notice acknowledgement, and optional consent as separate records. | Must |
| PRIV-007 | Do not represent privacy-notice acknowledgement as blanket consent. | Must |
| PRIV-008 | Keep optional consent specific, granular, unselected, and non-blocking. | Must |
| PRIV-009 | Do not bundle marketing consent with Terms acceptance or account creation. | Must |
| PRIV-010 | Display account-specific legal acknowledgements and optional consent status after sign-in. | Must |
| PRIV-011 | Permit withdrawal of each optional consent independently. | Must |
| PRIV-012 | Stop future optional processing as soon as operationally possible after withdrawal. | Must |
| PRIV-013 | Record consent grants and withdrawals with purpose, notice version, locale, and time. | Must |
| PRIV-014 | Explain that withdrawal affects future processing and does not invalidate lawful prior processing. | Must |
| PRIV-015 | Provide access, correction, portability/export, deletion, restriction, objection, and contact routes where applicable. | Must |
| PRIV-016 | Maintain an approved processing inventory covering purpose, category, lawful basis, source, recipient, location, retention, deletion, rights, and owner. | Must |
| PRIV-017 | Apply concrete approved retention periods and lawful exceptions. | Must |
| PRIV-018 | Never claim GDPR compliance solely because a checkbox or privacy link exists. | Must |
| PRIV-019 | Keep account identifiers, tokens, phone numbers, private preferences, and precise location out of shared URLs, public metadata, and ordinary analytics. | Must |

## 9. Export and offboarding requirements

| ID | Requirement | Priority |
|---|---|---|
| OFF-001 | Distinguish sign-out, all-session revocation, consent withdrawal, preference clearing, export, deactivation, and deletion. | Must |
| OFF-002 | Require recent authentication for export, all-session revocation, email change, and deletion. | Must |
| OFF-003 | Create an authenticated export request for the current consumer only. | Must |
| OFF-004 | Produce the export in a commonly used machine-readable format. | Must |
| OFF-005 | Deliver exports through an expiring authenticated download or another approved secure method, not ordinary email content. | Must |
| OFF-006 | Record export request, preparation, availability, delivery, expiry, and failure states. | Must |
| OFF-007 | Explain deletion effects, waiting period, cancellation cutoff, and approved retention exceptions before confirmation. | Must |
| OFF-008 | Require explicit final confirmation and proportionate reauthentication for deletion. | Must |
| OFF-009 | Make deletion requests idempotent and provide a stable request reference and status. | Must |
| OFF-010 | Allow cancellation only until the documented cutoff and confirm the result. | Must |
| OFF-011 | Disable account use, revoke sessions, and remove credentials at the policy-defined lifecycle stage. | Must |
| OFF-012 | Delete or anonymize application and identity-provider data in the approved order. | Must |
| OFF-013 | Complete required downstream-processor actions and reconcile their outcomes. | Must |
| OFF-014 | Report deleted, anonymized, and lawfully retained categories accurately. | Must |
| OFF-015 | Never claim completion before all policy-defined in-scope systems confirm the outcome. | Must |
| OFF-016 | Invalidate registration, verification, and reset links when the account reaches the closure stage. | Must |
| OFF-017 | Prevent a deleted account from restoring sessions, preferences, or last-search state. | Must |
| OFF-018 | Treat later registration with the same email as a new account unless an approved restoration window exists. | Must |
| OFF-019 | Minimize and access-control any audit evidence retained under legal obligation. | Must |
| OFF-020 | Provide support visibility into pending and failed requests without exposing unnecessary personal data. | Must |

## 10. Security requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-001 | Use HTTPS and approved secure response headers for every account route. | Must |
| SEC-002 | Keep credential storage, verification, breach checks, and reset in the approved identity provider. | Must |
| SEC-003 | Protect authenticated state-changing requests against CSRF. | Must |
| SEC-004 | Apply layered rate limits using privacy-safe account, request, network, and device-risk signals. | Must |
| SEC-005 | Do not permanently block a shared network solely by IP address. | Must |
| SEC-006 | Provide an accessible fallback for bot or abuse challenges. | Must |
| SEC-007 | Prevent account enumeration in registration, resend, sign-in, recovery, and support journeys. | Must |
| SEC-008 | Use random, short-lived, single-use verification and reset credentials. | Must |
| SEC-009 | Validate redirect and return destinations against an internal allowlist. | Must |
| SEC-010 | Protect sessions against fixation and use secure cookie settings. | Must |
| SEC-011 | Require recent authentication for sensitive account changes. | Must |
| SEC-012 | Prevent secrets and unnecessary personal data from entering logs, traces, analytics, and raw errors. | Must |
| SEC-013 | Record access-controlled security audit events with approved retention. | Must |
| SEC-014 | Detect abnormal resend, reset, token, sign-in, export, and deletion patterns. | Must |
| SEC-015 | Maintain incident procedures for compromised accounts and delivery abuse. | Must |
| SEC-016 | Complete and approve a lifecycle threat model before production release. | Must |

## 11. Accessibility and localization requirements

| ID | Requirement | Priority |
|---|---|---|
| A11Y-001 | Core onboarding, recovery, account, export, and deletion journeys must meet WCAG 2.2 AA. | Must |
| A11Y-002 | Every journey must be fully operable with a keyboard. | Must |
| A11Y-003 | Focus must move predictably after validation, resend, modal close, and route transition. | Must |
| A11Y-004 | Errors and help text must be programmatically associated with fields and summarized when useful. | Must |
| A11Y-005 | Loading, success, warning, and error states must be announced and must not rely on color alone. | Must |
| A11Y-006 | Core pages must reflow at 320 CSS pixels and remain usable at 400% browser zoom. | Must |
| A11Y-007 | Password managers, paste, and correct autocomplete semantics must be supported. | Must |
| A11Y-008 | Registration, recovery, security, export, and deletion emails must be accessible. | Must |
| L10N-001 | Dutch and English must have complete functional and semantic parity. | Must |
| L10N-002 | The selected locale must persist safely through email, recovery, legal, and return journeys. | Must |
| L10N-003 | Validation, exceptional states, legal labels, and lifecycle notifications must not fall back to mixed-language text. | Must |

## 12. Data and operational requirements

| ID | Requirement | Priority |
|---|---|---|
| DATA-001 | Use stable internal account IDs and identity-provider user IDs rather than email as relational keys. | Must |
| DATA-002 | Enforce uniqueness and idempotency at the database boundary for registrations, account identity, legal records, export, and deletion. | Must |
| DATA-003 | Store lifecycle states and transitions explicitly rather than inferring them from missing data. | Must |
| DATA-004 | Encrypt personal data in transit and apply approved storage protection at rest. | Must |
| DATA-005 | Restrict production personal-data access by role and audit privileged access. | Must |
| DATA-006 | Separate Development and Production identities and consumer data. | Must |
| OPS-001 | Lifecycle email delivery must be idempotent, retryable, and observable. | Must |
| OPS-002 | Provider acceptance must not be represented as consumer delivery. | Must |
| OPS-003 | Failed registration, recovery, export, and deletion operations must enter visible support/operations states. | Must |
| OPS-004 | Operational logs must use event codes and safe record identifiers rather than email addresses, phone numbers, tokens, or message bodies. | Must |
| OPS-005 | Rollback must preserve account, consent, request, and audit records. | Must |
| OPS-006 | Feature controls must fail closed for account-only APIs without breaking public discovery. | Must |
| OPS-007 | Monitoring must use privacy-approved aggregate measures and exclude raw search text and precise location. | Must |
| OPS-008 | Support procedures must prohibit credential handling and unauthorized identity changes. | Must |

## 13. Requirement dependencies

| Requirement group | Depends on |
|---|---|
| Registration | Approved identity provider, verified email sender, legal documents, account schema |
| Authentication/recovery | Identity-provider production configuration and session policy |
| Search restoration | Account authorization, approved data minimization and retention |
| Legal/privacy | Approved processing inventory, lawful bases, legal text, rights procedures |
| Export/deletion | Data inventory, processor inventory, retention exceptions, support workflow |
| Security | Threat model, abuse controls, audit design, incident response |
| Accessibility/localization | Approved bilingual content and accessible email/page templates |
| Operations | Delivery provider, lifecycle queues, monitoring, support ownership |

## 14. Global acceptance baseline

Every **Must** requirement is accepted only when:

1. implementation behavior matches the approved requirement in Dutch and English;
2. authorization and account isolation are enforced server-side;
3. initial, loading, success, error, retry, offline, and exceptional states are tested where applicable;
4. no password, token, phone number, email address, raw search text, or precise location appears in prohibited logs or analytics;
5. accessibility checks pass for keyboard, focus, labels, announcements, reflow, and zoom;
6. automated tests cover the stable contract and critical negative cases;
7. operational failure and retry behavior is observable;
8. legal/privacy wording matches actual system behavior; and
9. existing map, list, icon, card, and filter regression suites pass without changed expectations, except where a separate approved requirement explicitly authorizes a change; and
10. the relevant product, engineering, QA, privacy, legal, security, accessibility, support, and operations owners approve the release evidence.

## 15. Open policy decisions

These decisions must be resolved before affected requirements can be marked
ready for implementation:

1. Whether phone number is mandatory and its approved purpose.
2. Whether phone ownership requires separate verification.
3. Pending-registration and token expiry periods.
4. Password and breached-password policy.
5. Automatic session creation after registration.
6. Last-search retention, viewport precision, and opt-out behavior.
7. Terms reacceptance rules.
8. Optional communication purposes and lawful bases.
9. Export format and download expiry.
10. Deletion waiting period, cancellation cutoff, and retained categories.
11. Identity-provider deletion order.
12. Recovery procedure when verified email access is lost.