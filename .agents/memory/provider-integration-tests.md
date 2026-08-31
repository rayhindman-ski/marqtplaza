---
name: Provider integration tests
description: How to make listings provider integration tests deterministic without contacting external services.
---

Inject outbound provider loaders when constructing the route under test instead of replacing `globalThis.fetch`.

**Why:** Default provider dependencies may capture the original fetch function when the module is evaluated, so a later global replacement does not intercept requests and can make an isolated integration test contact live services.

**How to apply:** For endpoint tests that exercise database lineage and partial-failure behavior, use production database code with injected deterministic loaders. Keep production route construction on the real defaults.