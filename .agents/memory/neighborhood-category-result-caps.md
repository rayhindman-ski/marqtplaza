---
name: Neighborhood category result caps
description: How provider limits must be applied when discovery is narrowed by business category and neighborhood.
---

Provider queries must receive the selected business subcategories and official polygon scope. The shared geo library is the source of truth for neighborhood boundaries; client centers are only a fallback for free-form searches. Apply category filtering and nearest-first ordering before enforcing provider result caps.

**Why:** A broad city query can contain thousands of records. Truncating raw provider order—or even a citywide category result—lets distant or unrelated businesses consume the cap and hides valid nearby listings. Provider outages also must not blank a neighborhood when a saved result exists.

**How to apply:** Keep category and effective polygon scope in the request/query cache identity, use targeted provider selectors, query the polygon bounding box, filter results by point-in-polygon before sorting/capping, and serve saved results filtered by the current polygon when live providers fail.