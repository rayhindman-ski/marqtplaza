---
name: Google Places discovery
description: Coverage and safety bounds for provider-backed business discovery in the Hague explorer.
---

Google Places Text Search must follow its `nextPageToken` within a bounded page count, deduplicate results, and collect every configured area/category query before applying a final response cap.

**Why:** Text Search returns only a ranked first page by default, so stopping after one page makes a large city’s business inventory look like a small fraction of reality. Applying a global cap while queries are still running also creates geographic blind spots, and independent public cache misses can multiply provider usage.

**How to apply:** Use overlapping area/category searches with a process-wide upstream concurrency limit and per-section in-flight coalescing. Fairly distribute the final result cap across completed searches, preserve Hague bounds/evidence checks, and reserve space for deduplicated OpenStreetMap supplements rather than allowing a full Google response to crowd them out.

Google Places discovery queries are currently disabled; OpenStreetMap is the sole active external business provider until an explicit decision is made to restore Google querying.

**Why:** The configured permanent Google Places request allowance has been exhausted, so attempting the provider only adds failed lineage records, retries, and latency.

**How to apply:** Keep production provider selection Google-free, including claim lookups. Failure-isolation tests may explicitly inject and enable a fake Google loader without permitting real requests.

When a discovery rectangle reaches beyond the municipal boundary, coordinate inclusion alone is not sufficient for OpenStreetMap records: each record needs positive local evidence such as an approved locality or a Hague postcode, as well as rejection of conflicting locality tags.

**Why:** Public map records often have no locality tag, and a deliberately overlapping search rectangle can otherwise silently publish nearby-municipality entries as Hague listings.

**How to apply:** Apply the same positive evidence rule to both the normal OSM supplement and every provider-fallback response. Classify food consistently from both `amenity` and `shop` tags so food shops cannot leak into the non-food business stream.