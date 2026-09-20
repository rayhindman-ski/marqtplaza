---
name: Lifecycle schema reconciliation
description: Safe handling of development database drift in lifecycle integration tests.
---

When lifecycle integration tests report several missing columns or relations, treat
the development database as schema-drifted rather than patching each failure ad hoc.
Use the approved schema reconciliation flow and explicitly resolve Drizzle rename
prompts; do not guess with force mode or destructive DDL. In Drizzle Kit 0.31,
`--force` only bypasses the later data-loss approval: rename resolution happens
earlier and can still require stdin.

**Why:** Noninteractive `drizzle-kit push` stops when it needs rename/conflict input,
and `--force` does not resolve that ambiguity. Isolated additive fixes can reveal
broader missing lifecycle tables and fields.

**How to apply:** Compare the live development schema to the current lifecycle schema,
resolve the complete diff intentionally, then rerun the lifecycle suite against a
fresh isolated database. Production changes remain part of the Publish flow.