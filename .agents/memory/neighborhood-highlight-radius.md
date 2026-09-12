---
name: Neighborhood highlight radius
description: The map’s visual neighborhood emphasis should not reuse the larger radius used to find nearby listings.
---

Use a dedicated, smaller visual radius for a selected neighborhood and keep the provider/filter radius unchanged. A centroid-based circle is only an approximation, so it should communicate focus without implying an exact administrative boundary.

**Why:** Reusing the 2.5 km discovery radius made a single selected neighborhood appear to cover much of The Hague and made the map selection look incorrect.

**How to apply:** When changing neighborhood discovery distance, review the map overlay separately; do not automatically use the provider search radius for the visual boundary.