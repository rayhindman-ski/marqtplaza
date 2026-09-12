---
name: OpenAPI email validation
description: Compatibility rule for email fields in this workspace's OpenAPI and generated Zod clients.
---

Use a validated string pattern for email fields in the OpenAPI contract rather than `format: email`.

**Why:** The current Orval output targets the workspace's Zod 3 runtime, while the email format generator emits `z.email()`, which only exists in newer Zod APIs and breaks the generated library typecheck.

**How to apply:** For new API email inputs and responses, use the established non-empty email regex pattern in the OpenAPI schema and keep server-side validation as a second boundary.