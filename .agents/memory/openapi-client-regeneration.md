---
name: OpenAPI client regeneration
description: The shared React API client must be regenerated when merged OpenAPI endpoints are present in the schema but absent from client exports.
---

When an OpenAPI change is merged, regenerate the shared clients before treating frontend import errors as application-code regressions.

**Why:** This workspace keeps the API schema, generated Zod package, and generated React client as separate artifacts; a merge can update the schema and consumer while leaving the client stale.

**How to apply:** Run the repository's API-spec codegen command, then rebuild library declarations and rerun the affected artifact typechecks before changing consumer code.