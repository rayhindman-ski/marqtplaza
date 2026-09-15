---
name: Database error assertions
description: Stable assertions for PostgreSQL failures surfaced through Drizzle in integration tests.
---

Integration tests that force PostgreSQL failures through triggers should assert the persisted failure state and stable provider/error classification, not require the original server-side trigger message to survive the Drizzle/pg error wrapper.

**Why:** The driver can return a generated SQL statement and parameter list instead of the trigger's exception text, so exact-message assertions can fail across otherwise equivalent PostgreSQL environments.

**How to apply:** Prefer checking the affected operation is marked failed, successful sibling operations remain available, and an error is recorded. Match provider-specific text only when the adapter contract guarantees it.