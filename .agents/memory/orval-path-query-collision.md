---
name: Orval path/query parameter collision
description: A generated Zod export collision caused by OpenAPI operations that combine path and query parameters.
---

In this workspace's Orval/Zod configuration, an operation with both path and query parameters can generate a runtime path-parameter schema and a query-parameter type with the same `OperationParams` export name.

**Why:** The generated Zod barrel then fails TypeScript compilation with a duplicate export, even though client generation itself succeeds.

**How to apply:** For a new read endpoint, prefer a query-only contract when that is a reasonable API shape. If path and query parameters are required, verify generated Zod barrel exports immediately after codegen and solve the generator naming conflict rather than editing generated files.