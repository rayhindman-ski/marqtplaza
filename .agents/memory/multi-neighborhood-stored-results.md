---
name: Multi-neighborhood stored results
description: Preserving monotonic listing counts when users add neighborhoods to a stored-only discovery search.
---

Multi-neighborhood stored-only discovery must union the saved result snapshots for each selected neighborhood before applying the combined polygon filter. Do not rely only on a snapshot keyed by the exact neighborhood combination.

**Why:** Exact-combination snapshots may not exist even when every selected neighborhood has saved results. Looking up only that combination can make a third selection blank the map, violating the product rule that adding a neighborhood must not reduce the visible result set.

**How to apply:** For multi-select stored searches, combine and deduplicate provider results from the exact scope and each singleton neighborhood scope, then filter the union to the selected official polygons. Regression tests should assert monotonic visible counts across a 1 → 2 → 3 neighborhood progression.