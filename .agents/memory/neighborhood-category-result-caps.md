---
name: Neighborhood category result caps
description: How provider limits must be applied when discovery is narrowed by business category and neighborhood.
---

Provider queries must receive the selected business subcategories and, for a single selected neighborhood, its search center. Apply category filtering and nearest-first ordering before enforcing provider result caps.

**Why:** A broad city query can contain thousands of records. Truncating raw provider order—or even a citywide category result—lets distant or unrelated businesses consume the cap and hides valid nearby listings.

**How to apply:** Keep the category and neighborhood center in the request/query cache scope, use targeted provider selectors, support mapped-area center coordinates, then sort eligible listings by distance before taking the final bounded result set.