---
name: Google Places discovery
description: Coverage and safety bounds for provider-backed business discovery in the Hague explorer.
---

Google Places Text Search must follow its `nextPageToken` within a bounded page count and deduplicate results before returning them.

**Why:** Text Search returns only a ranked first page by default, so stopping after one page makes a large city’s business inventory look like a small fraction of reality.

**How to apply:** Keep the query set targeted to the requested section, cap pages and total listings to control latency and provider usage, preserve the Hague bounds/evidence checks on every page, and retain OpenStreetMap fallback when Google is unavailable.