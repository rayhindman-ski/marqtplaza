---
name: Google Places discovery
description: Coverage and safety bounds for provider-backed business discovery in the Hague explorer.
---

Google Places Text Search must follow its `nextPageToken` within a bounded page count, deduplicate results, and collect every configured area/category query before applying a final response cap.

**Why:** Text Search returns only a ranked first page by default, so stopping after one page makes a large city’s business inventory look like a small fraction of reality. Applying a global cap while queries are still running also creates geographic blind spots, and independent public cache misses can multiply provider usage.

**How to apply:** Use overlapping area/category searches with a process-wide upstream concurrency limit and per-section in-flight coalescing. Fairly distribute the final result cap across completed searches, preserve Hague bounds/evidence checks, and reserve space for deduplicated OpenStreetMap supplements rather than allowing a full Google response to crowd them out.