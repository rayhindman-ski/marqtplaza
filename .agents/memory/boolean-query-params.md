---
name: Boolean query params & route test DB
description: Why optional boolean query flags must be read from the raw query string, and why the publication route suite needs a disposable database.
---
Read optional boolean query flags (e.g. `recheckDue`) from the raw `req.query` string and accept only `true/1/false/0`; do not trust the generated `GetXQueryParams` zod schema for them.

**Why:** Orval emits `zod.coerce.boolean()` for `type: boolean` query params, which turns the string `"false"` into `true`, so `?flag=false` would silently enable the flag.

**How to apply:** Keep the generated schema for validation of the other fields, then parse the flag separately and return a `VALIDATION_FAILED` field error for anything else.

Related: the shared development database may lag the schema (it lacked `lifecycle_outbox`, so `test:business-publication` failed with HTML 500s that looked like route bugs). Run route suites against a freshly `push`ed disposable database before diagnosing failures.
