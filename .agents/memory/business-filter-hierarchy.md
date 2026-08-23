---
name: Business filter hierarchy
description: The parent-child relationship between discovery business filters and the normalized business taxonomy.
---

The discovery filter treats **Businesses** and **Food & Drink** as separate top-level categories. Businesses owns every normalized business subcategory except Food & Drink; the Food & Drink parent owns that matching subcategory.

**Why:** Keeps hospitality separate from general local businesses while still using one provider-neutral business taxonomy across cards, maps, and filters.

**How to apply:** Show only the subcategories belonging to selected top-level categories. Keep child selections independent so visitors can narrow a parent category without changing the broader route or source query.