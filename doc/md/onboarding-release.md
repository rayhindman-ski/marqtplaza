# Consumer accounts and business onboarding — release notes for operators

Authoritative intent: `.specify/specs/002-consumer-accounts-and-business-onboarding/`
(spec, plan, tasks, convergence). The archived proposal that started this work
is `doc/md/version-v.03.md`; it is historical and must not be followed
literally (see the reconciliation table in `spec.md`).

## Rollout flags

Every flag defaults to **off**. Flags are read once per API process, so a
change needs a restart of the API service (and a rebuild of the web bundle for
the `VITE_*` mirrors). A disabled area answers `404 FEATURE_DISABLED` on the
API and shows the "not available yet" state in the web app. Existing public
discovery, research registration, saved events, and community routes do not
depend on any flag.

| Area | API flag | Web mirror | Unlocks | Gate before production |
| --- | --- | --- | --- | --- |
| Consumer accounts | `ACCOUNTS_ENABLED` | `VITE_ACCOUNTS_ENABLED` | `/api/account/*`, `/account/voorkeuren`, `/account/privacy`, account summary on `/account` | Q1, Q6, Q7 |
| Business intake | `BUSINESS_INTAKE_ENABLED` | `VITE_BUSINESS_INTAKE_ENABLED` | `GET /api/businesses/lookup`, `POST /api/businesses`, claim edit/submit/withdraw, `/bedrijf-zoeken`, `/bedrijf-nieuw` | Q2, Q3 |
| Business publication | `BUSINESS_PUBLICATION_ENABLED` | `VITE_BUSINESS_PUBLICATION_ENABLED` | revision editor `/mijn-bedrijf/:id/profiel`, reviewer queues under `/api/review/*`, publication transitions, snapshot-only public projection | Q4 |
| Lifecycle delivery | `LIFECYCLE_DELIVERY_PROVIDER` | — | real message sending from `lifecycle_outbox`; unset keeps rows `queued` and consumes no attempts; `log` is refused in production; `resend` sends e-mail and additionally requires `RESEND_API_KEY`, `LIFECYCLE_SENDER_ADDRESS` (approved sender identity) and `LIFECYCLE_RECEIPT_WEBHOOK_SECRET` (startup fails without them) | Q5, Q6, Q8 |

`GET /api/readiness` reports the three feature flags for the running process.

## Operator checks

- Readiness: `curl <base>/api/readiness` → `{"accounts":…,"businessIntake":…,"businessPublication":…}`.
- Reviewer access is derived from Clerk session claims (`admin`/`editor`)
  on the server; there is no client-side role switch.
- Support queues: `/api/review/account-requests` (deletion requests) and
  `/api/review/lifecycle-messages` (failed messages, resend) — reviewer role
  required, flag `ACCOUNTS_ENABLED`.
- Logs carry event codes and row IDs only (`lifecycle_dispatch.*`,
  `lifecycle_message.*`, `lifecycle_receipt.*`); no e-mail addresses or
  message bodies are logged.
- E-mail delivery (`resend`): the recipient's verified primary address is
  looked up at Clerk when a row is dispatched and is never stored. Point the
  provider's `email.delivered` webhook at
  `POST <base>/api/lifecycle/delivery-receipts/resend` using the signing
  secret from `LIFECYCLE_RECEIPT_WEBHOOK_SECRET`; the endpoint answers 404
  until that secret is set, 401 for a bad or stale signature, and is
  idempotent (a replayed receipt reports `already_delivered`). Rows only move
  from `accepted` to `delivered` through this endpoint.

## Rollback

1. Set the affected flag(s) to off and restart the API / rebuild the web app.
   New endpoints return 404, new screens hide, existing routes are unchanged.
2. Keep every table and row. Never drop `app_users`, `consumer_preferences`,
   `account_consent_events`, `business_profile_revisions`, `business_reviews`,
   `business_fact_checks`, `lifecycle_outbox`, or `account_requests`; never
   erase claims, memberships, requests, or consent events.
3. With `BUSINESS_PUBLICATION_ENABLED` off the public business page serves the
   legacy profile columns again and the workspace shows the legacy inline
   profile editor; re-enabling serves the approved snapshot and routes owner
   edits into draft revisions. Both paths stay in the code until the flag is
   retired; the retirement runbook is
   `doc/md/business-publication-flag-removal.md`.
4. Schema changes ship through `drizzle-kit push` only: rehearse on an
   isolated database (`node lib/db/scripts/run-isolated-database-integration.mjs`
   or a `pg_dump --schema-only` clone) and take a production backup first.

## Rollback triggers

- Any public response containing draft text, reviewer identity, reviewer
  notes, e-mail addresses, or claim evidence.
- Owner edits reaching the public page without a recorded approval while the
  publication flag is on.
- Lifecycle rows stuck in `failed` with no operator visibility, or duplicate
  messages for one event.
- Deletion requests resolved without the audited support decision path.
- A schema push that reports `DROP TABLE`, `DROP COLUMN`, or a type change.
