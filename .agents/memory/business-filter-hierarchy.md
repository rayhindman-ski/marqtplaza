---
name: Business filter hierarchy
description: The parent-child relationship between discovery business filters and the normalized business taxonomy.
---

The discovery filter treats **Businesses** and **Food & Drink** as separate top-level categories. Businesses owns every normalized business subcategory except Food & Drink; the Food & Drink parent owns that matching subcategory.

**Why:** Keeps hospitality separate from general local businesses while still using one provider-neutral business taxonomy across cards, maps, and filters.

**How to apply:** Show only the subcategories belonging to selected top-level categories. Keep child selections independent so visitors can narrow a parent category without changing the broader route or source query.

Enabling a previously inactive top-level section must select all of that section’s child filters.

**Why:** A parent checkbox that exposes children with all of them disabled makes valid provider results appear missing and looks like an empty search.

**How to apply:** Preserve a visitor’s deliberate child-level narrowing while its parent stays active. When they newly enable Businesses or Food & Drink, activate that parent’s children so results become visible immediately.