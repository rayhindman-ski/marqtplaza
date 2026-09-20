---
name: drizzle-kit push diff limits
description: Schema changes that drizzle-kit push silently misses or keeps re-applying, and how to rehearse a push safely.
---
Rules:
1. `drizzle-kit push` does not detect a changed `WHERE` clause on an existing partial index. To change the predicate, rename the index so push drops the old one and creates the new one.
2. Auto-generated FK/constraint names longer than 63 characters are truncated by PostgreSQL; push then drops and recreates them on every run. Name long FKs explicitly with `foreignKey({ name })`.
3. Rehearse a push by cloning the dev schema (`pg_dump --schema-only | psql`) into a disposable database, running push with `--verbose --force`, and running it a second time to confirm "No changes detected".

**Why:** Both problems were found while adding the account/lifecycle tables; without the rename the widened one-open-claim rule would never have reached the database, and truncated FK names made push non-idempotent.

**How to apply:** Any change under `lib/db/src/schema`, especially partial unique indexes and tables with long names.
