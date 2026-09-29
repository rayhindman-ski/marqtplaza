# Release v0.5.3 — Remaining Consumer Lifecycle Requirements

## 1. Release purpose

v0.5.3 closes the v0.5 programme defined in
[`requirements.md`](./requirements.md). It contains every requirement from
that catalogue that is **not** claimed as delivered by
[`release_v051.md`](./release_v051.md) (§8 "Requirements coverage") or
[`release_v052.md`](./release_v052.md) (§8.8 "Coverage of consumer
requirements claimed by v0.5.2").

The remaining work falls into five themes:

1. account-backed **last search and map-state** retention and restoration
   (`SRCH-*`, `BUS-005`);
2. **consent, privacy rights and legal-document** completion (`PRIV-004`,
   `PRIV-011` – `PRIV-019`, `BUS-007`, `BUS-008`);
3. **export and offboarding** (`OFF-001` – `OFF-020`);
4. remaining **profile** capabilities (`PROF-004` – `PROF-006`);
5. **data-model hygiene** (`DATA-001`) and confirmation of two business
   outcomes delivered in substance by v0.5.2 but never claimed
   (`BUS-006`, `BUS-010`).

## 2. Source documents

| Document | Role |
|---|---|
| [`requirements.md`](./requirements.md) | Requirement catalogue (IDs below refer to it) |
| [`consumer-registration-journey.md`](./consumer-registration-journey.md) | Journey narrative |
| [`release_v051.md`](./release_v051.md) §8 | IDs claimed by v0.5.1 |
| [`release_v052.md`](./release_v052.md) §8.8 | IDs claimed by v0.5.2 |
| [`release_v052_log.md`](./release_v052_log.md) | Current production state (all v0.5.1/v0.5.2 flags on since 2026-09-28) |

## 3. Release classification

- Additive account capability; **§7 of `release_v051.md` (protected discovery
  behaviour) applies verbatim.** `BUS-011` remains in force: the only permitted
  interaction with discovery state is the account-backed capture and
  restoration of the last search defined in §5 below, through the existing
  map, list, card, icon and filter interfaces.
- Feature flags: `LAST_SEARCH_ENABLED`, `CONSENT_CENTER_ENABLED`,
  `ACCOUNT_EXPORT_ENABLED`, `ACCOUNT_DELETION_ENABLED` (+ `VITE_` mirrors),
  each an effective flag that also requires `ACCOUNTS_ENABLED`; every
  account-only API fails closed (`OPS-006`).

## 4. Coverage reconciliation

### 4.1 Claimed by earlier releases (not repeated here)

| Release | IDs |
|---|---|
| v0.5.1 | `REG-001`–`REG-017`; `BUS-001`–`BUS-004`, `BUS-009`–`BUS-011`; `SEC-001`, `SEC-004`–`SEC-009`, `SEC-012`–`SEC-016`; `A11Y-001`–`A11Y-006`, `A11Y-008`; `L10N-001`–`L10N-003`; `DATA-002`–`DATA-006`; `OPS-001`–`OPS-008` |
| v0.5.2 | `REG-017`–`REG-030`; `AUTH-001`–`AUTH-014`; `REC-001`–`REC-013`; `PROF-001`–`PROF-003`, `PROF-007`, `PROF-008`; `PRIV-001`–`PRIV-003`, `PRIV-005`–`PRIV-010`; `SEC-002`, `SEC-003`, `SEC-010`, `SEC-011`; `A11Y-007` |

### 4.2 Remaining — the scope of v0.5.3

| Group | IDs | Count |
|---|---|---|
| Business outcomes | `BUS-005`, `BUS-006`, `BUS-007`, `BUS-008` | 4 |
| Profile and contact | `PROF-004`, `PROF-005`, `PROF-006` | 3 |
| Last search and map state | `SRCH-001` – `SRCH-021` | 21 |
| Terms, privacy, GDPR | `PRIV-004`, `PRIV-011` – `PRIV-019` | 10 |
| Export and offboarding | `OFF-001` – `OFF-020` | 20 |
| Data | `DATA-001` | 1 |
| **Total** | | **59** |

Every other ID in `requirements.md` is claimed by v0.5.1 or v0.5.2. Where an
earlier release only partially delivered a claimed ID, that gap belongs to
that release's convergence record, not to this document.

## 5. Requirements

Text is quoted from `requirements.md`; the *Note* column records the v0.5.3
delivery decision or dependency.

### 5.1 Business outcomes

| ID | Requirement | Priority | Note |
|---|---|---|---|
| BUS-005 | A returning consumer must be able to resume the most recent permitted search and map context. | Must | Delivered by §5.3. |
| BUS-006 | The lifecycle must provide secure credential recovery without support staff handling passwords. | Must | Implemented by v0.5.2 (`REC-001`–`REC-013`) but never claimed; v0.5.3 records the evidence and closes it. |
| BUS-007 | Legal notices and consumer choices must be versioned and auditable. | Must | Terms/privacy records exist (`PRIV-005`); v0.5.3 adds the optional-consent ledger (§5.4) that completes it. |
| BUS-008 | The lifecycle must support access, correction, export, consent withdrawal, and policy-compliant deletion. | Must | Access/correction exist (`PROF-001`–`PROF-003`); export, withdrawal and deletion delivered by §5.4–§5.5. |
| BUS-010 | Operations must be able to diagnose lifecycle failures without viewing passwords, tokens, or unnecessary personal data. | Must | Delivered by the lifecycle outbox and `OPS-004` logging in v0.5.1/v0.5.2; unclaimed by either. Confirm with the new export/deletion states (`OFF-006`, `OFF-020`). |

### 5.2 Profile and contact

| ID | Requirement | Priority | Note |
|---|---|---|---|
| PROF-004 | Require verification of a new email before replacing the verified primary email. | Must | Identity-provider e-mail change flow, app-framed like the v0.5.2 password screens; the application record follows only after provider verification. |
| PROF-005 | Notify the appropriate old and new addresses of a primary-email change according to security policy. | Should | New outbox templates `account.email_change_requested` (old address) and `account.email_changed` (both). |
| PROF-006 | Allow review and update of preferred locale and approved discovery preferences. | Must | Locale already persists in the account (v0.5.1); adds the "discovery preferences" block (external-search scope, last-search retention opt-out — see `SRCH-016`, `SRCH-021`). |

### 5.3 Last search and map state

| ID | Requirement | Priority | Note |
|---|---|---|---|
| SRCH-001 | Store the latest permitted search state only for an authenticated account. | Must | New `account_last_search` row keyed by account ID; anonymous visitors are untouched. |
| SRCH-002 | Store only approved fields: service area, neighbourhoods, postcode/query, categories, filters, locale, source scope, selected listing, presentation mode, zoom, minimum viewport, scroll context, and timestamp. | Must | Closed allow-list schema; anything else is rejected server-side. |
| SRCH-003 | Treat search, viewport, and selected-result state as private account data. | Must | Included in export (§5.5) and deletion. |
| SRCH-004 | Do not store raw device geolocation merely because the consumer used a map. | Must | |
| SRCH-005 | Use only the minimum map-center precision required to restore the view. | Must | Policy decision §15.6 (proposed: 3 decimals ≈ 100 m). |
| SRCH-006 | Do not put private viewport state, exact coordinates, account identifiers, or private preferences in shared URLs. | Must | Restoration writes only the existing public discovery URL parameters. |
| SRCH-007 | Do not store passwords, tokens, provider responses, or full result payloads in last-search state. | Must | |
| SRCH-008 | Replace older state when only the most recent search is approved. | Must | Single row per account, upsert. |
| SRCH-009 | Apply the approved last-search retention period. | Must | Policy decision §15.6; expired rows purged by the existing scheduler. |
| SRCH-010 | Show a human-readable quick link to the most recent search after sign-in and on account home. | Must | Also satisfies the deferred `REG-030` "Resume previous search" option. |
| SRCH-011 | Avoid exposing sensitive query details in a quick-link summary on a shared screen. | Must | Summary shows area/category labels, never the raw query text. |
| SRCH-012 | Validate every stored value against the current supported taxonomy and geography before restoration. | Must | Reuse the existing neighbourhood/category catalogues. |
| SRCH-013 | Ignore removed or invalid values without failing the entire restoration. | Must | |
| SRCH-014 | Never request device location automatically during restoration. | Must | |
| SRCH-015 | Never silently launch optional third-party search during restoration. | Must | Stored-only results on restore; live provider fetch stays user-initiated. |
| SRCH-016 | Restore external-search scope only under the active, approved disclosure and preference rules. | Must | Depends on `PROF-006` preference. |
| SRCH-017 | Update the canonical URL only with validated public criteria. | Must | |
| SRCH-018 | Provide Clear last search with confirmation and authoritative server completion. | Must | |
| SRCH-019 | Clear related private client cache after server-side removal. | Must | |
| SRCH-020 | Prevent one account's search state from appearing for another account on a shared browser. | Must | Query cache keyed by account ID and dropped on sign-out (`AUTH-010`). |
| SRCH-021 | Provide a control to disable future account-backed search retention if required by approved policy. | Should | Policy decision §15.6. |

Non-regression: capture reads the existing discovery state; restoration calls
the existing navigation and filter interfaces. The map, list, card, icon and
filter regression suites (`map-regression`, `usability-regression`) must pass
with unchanged expectations.

### 5.4 Terms, privacy and GDPR

| ID | Requirement | Priority | Note |
|---|---|---|---|
| PRIV-004 | Provide printable or downloadable legal documents where policy requires it. | Should | Print stylesheet + PDF download of the versioned NL/EN documents. |
| PRIV-011 | Permit withdrawal of each optional consent independently. | Must | Consent centre on the account page, one toggle per purpose. |
| PRIV-012 | Stop future optional processing as soon as operationally possible after withdrawal. | Must | Outbox consumers check the current consent state at send time. |
| PRIV-013 | Record consent grants and withdrawals with purpose, notice version, locale, and time. | Must | Append-only `consent_events` ledger. |
| PRIV-014 | Explain that withdrawal affects future processing and does not invalidate lawful prior processing. | Must | NL/EN copy in the consent centre. |
| PRIV-015 | Provide access, correction, portability/export, deletion, restriction, objection, and contact routes where applicable. | Must | Rights page linking the profile, export, deletion and support routes. |
| PRIV-016 | Maintain an approved processing inventory covering purpose, category, lawful basis, source, recipient, location, retention, deletion, rights, and owner. | Must | Document deliverable (`doc/md/privacy/processing-inventory.md`), owner approval required. |
| PRIV-017 | Apply concrete approved retention periods and lawful exceptions. | Must | Policy decisions §15.6, §15.10; enforced by scheduled purges. |
| PRIV-018 | Never claim GDPR compliance solely because a checkbox or privacy link exists. | Must | Copy review; no "GDPR-compliant" claims in UI or e-mail. |
| PRIV-019 | Keep account identifiers, tokens, phone numbers, private preferences, and precise location out of shared URLs, public metadata, and ordinary analytics. | Must | Extend the existing log/telemetry scan to URLs and analytics events. |

### 5.5 Export and offboarding

| ID | Requirement | Priority | Note |
|---|---|---|---|
| OFF-001 | Distinguish sign-out, all-session revocation, consent withdrawal, preference clearing, export, deactivation, and deletion. | Must | Separate account-page sections with distinct wording. |
| OFF-002 | Require recent authentication for export, all-session revocation, email change, and deletion. | Must | Reuse the v0.5.2 recent-authentication gate. |
| OFF-003 | Create an authenticated export request for the current consumer only. | Must | `account_export_requests` table. |
| OFF-004 | Produce the export in a commonly used machine-readable format. | Must | Policy decision §15.9 (proposed: JSON, optional CSV). |
| OFF-005 | Deliver exports through an expiring authenticated download or another approved secure method, not ordinary email content. | Must | E-mail carries a notice only; download requires a signed-in session. |
| OFF-006 | Record export request, preparation, availability, delivery, expiry, and failure states. | Must | Explicit state column (`DATA-003`). |
| OFF-007 | Explain deletion effects, waiting period, cancellation cutoff, and approved retention exceptions before confirmation. | Must | Policy decision §15.10. |
| OFF-008 | Require explicit final confirmation and proportionate reauthentication for deletion. | Must | |
| OFF-009 | Make deletion requests idempotent and provide a stable request reference and status. | Must | Extends the existing `account_lifecycle` terminal-state model. |
| OFF-010 | Allow cancellation only until the documented cutoff and confirm the result. | Must | |
| OFF-011 | Disable account use, revoke sessions, and remove credentials at the policy-defined lifecycle stage. | Must | Identity-provider session revocation + user deletion in the approved order (§15.11). |
| OFF-012 | Delete or anonymize application and identity-provider data in the approved order. | Must | |
| OFF-013 | Complete required downstream-processor actions and reconcile their outcomes. | Must | Outbox-driven, per-processor outcome rows. |
| OFF-014 | Report deleted, anonymized, and lawfully retained categories accurately. | Must | Completion e-mail and status page list categories from the inventory (`PRIV-016`). |
| OFF-015 | Never claim completion before all policy-defined in-scope systems confirm the outcome. | Must | |
| OFF-016 | Invalidate registration, verification, and reset links when the account reaches the closure stage. | Must | Tombstone check in every token route. |
| OFF-017 | Prevent a deleted account from restoring sessions, preferences, or last-search state. | Must | Depends on §5.3. |
| OFF-018 | Treat later registration with the same email as a new account unless an approved restoration window exists. | Must | Policy decision §15.10. |
| OFF-019 | Minimize and access-control any audit evidence retained under legal obligation. | Must | |
| OFF-020 | Provide support visibility into pending and failed requests without exposing unnecessary personal data. | Must | Editor-gated operations view keyed by request reference. |

The v0.5.2 sole-owner deletion guard stays: deletion is refused while the
account is the only owner of an open business (`business-membership`).

### 5.6 Data

| ID | Requirement | Priority | Note |
|---|---|---|---|
| DATA-001 | Use stable internal account IDs and identity-provider user IDs rather than email as relational keys. | Must | Audit existing tables (`user_registrations`, consent, business membership) for e-mail-keyed joins and migrate any found. |

## 6. Open policy decisions blocking this release

From `requirements.md` §15; each must be resolved and recorded before the
affected group is marked ready:

| §15 item | Decision | Blocks |
|---|---|---|
| 2 | Whether phone ownership requires separate verification | `PROF-003` follow-up only |
| 6 | Last-search retention, viewport precision, opt-out behaviour | `SRCH-005`, `SRCH-009`, `SRCH-021` |
| 7 | Terms reacceptance rules | `BUS-007`, `PRIV-017` |
| 8 | Optional communication purposes and lawful bases | `PRIV-011` – `PRIV-014`, `PRIV-016` |
| 9 | Export format and download expiry | `OFF-004`, `OFF-005` |
| 10 | Deletion waiting period, cancellation cutoff, retained categories | `OFF-007`, `OFF-010`, `OFF-014`, `OFF-018`, `PRIV-017` |
| 11 | Identity-provider deletion order | `OFF-011`, `OFF-012` |

Items 1, 3, 4, 5 and 12 were settled provisionally in v0.5.1/v0.5.2 and are
not reopened here.

## 7. Acceptance

The global acceptance baseline in `requirements.md` §14 applies unchanged,
including item 9: existing map, list, icon, card and filter regression suites
pass without changed expectations. Evidence is recorded in a
`release_v053_log.md` companion, following the v0.5.2 log format (flag state
per environment, live-provider evidence where the identity provider owns the
step, and manual checks never ticked from automated proxies).
