---
name: Discovery outbound isolation
description: Read-only and failure-isolation rules for external discovery and enrichment work.
---

Treat every provider and its lineage writes as an independent outcome. A failure to create or finalize one provider record must not reject the whole discovery request, discard another provider's stored results, or leave the parent user query permanently running.

**Why:** Query-lineage storage is part of the reliability boundary, not just observability. A provider-record insert can fail before the network call starts; without explicit isolation and parent finalization, this turns a partial success into an HTTP failure and strands lifecycle state.

Stored-only mode must also be read-only across every outbound path, including enrichment such as event translation—not only Google Places and OpenStreetMap discovery.

**How to apply:** Any future provider, enrichment, refresh worker, or result-storage path should settle all planned outcomes independently and always move the parent query to succeeded, partial, or failed. Branch stored-only requests before any outbound or mutating enrichment helper.