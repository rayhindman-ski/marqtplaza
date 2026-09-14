# buurtplaza.nl

Een hyperlokale gids voor het ontdekken van bedrijven, evenementen en specials in Nederlandse buurten.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test:listings-query:integration` — provision the disposable `buurtplaza_listings_query_test` database from `DATABASE_URL`, then run the provider-failure isolation check
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- The listings integration check never falls back to `DATABASE_URL` as its test database. The root command provisions its named disposable database; the API package command requires an explicit `LISTINGS_TEST_DATABASE_URL`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Consumer accounts are gated by `ACCOUNTS_ENABLED` (API) and `VITE_ACCOUNTS_ENABLED` (web). Both are off in production until the Spec Kit gates Q1/Q6/Q7 in `.specify/specs/002-consumer-accounts-and-business-onboarding/convergence.md` are recorded; development has them on for preview.
- Lifecycle messages (claim/review/publication/deletion) are written to the `lifecycle_outbox` table inside the same transaction as the state change. Real delivery is release configuration: `LIFECYCLE_DELIVERY_PROVIDER` unset keeps rows `queued` (no attempts consumed); `log` is a development-only loader refused in production. Account deletion requests live at `/account/privacy`; support decisions go through `/api/review/account-requests` and never delete claims, memberships, or audit rows. Retention periods and erasure remain open gates (no deadlines are promised in UI copy).
- An account (Clerk login + optional controlled preferences on `app_users`/`consumer_preferences`), the research registration (`user_registrations`), saved events, and purpose-specific consents (`account_consent_events`, append-only) are separate scopes. Creating an account never writes to the other three.
- Preference writes use optimistic revisions (`expectedRevision`, 409 `VERSION_CONFLICT`); all neighbourhood/interest IDs must come from `GET /account/options`. Nothing is inferred and unset stays unset.
- Post-auth return targets go through `artifacts/buurtgids/src/lib/returnPath.ts` (`terug` query param, local allowlist, default `/account`).

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Account e2e specs drive auth with `?e2eAccountAuth=1` plus `window.__accountTestAuth` (dev builds only) and mock `/api/account/**`; the Playwright web server runs with `VITE_ACCOUNTS_ENABLED=1`.
- Account route tests need the account tables: run `pnpm --filter @workspace/db run push` on a fresh database first.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
