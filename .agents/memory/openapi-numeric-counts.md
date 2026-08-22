---
name: OpenAPI numeric counts
description: Compatibility constraint for numeric count fields in generated API schemas.
---

# OpenAPI numeric counts

Use OpenAPI `type: number` for non-negative count fields in this workspace. Avoid `type: integer` until the generated Zod output is compatible with the installed Zod version.

**Why:** The current code-generation combination emits `zod.int()` for integer fields, but the installed Zod package does not provide that helper. This causes the generated validation package to fail typechecking.

**How to apply:** Model counters with `type: number` and `minimum: 0`, then regenerate the API client and Zod schemas. The server may still return whole-number values.