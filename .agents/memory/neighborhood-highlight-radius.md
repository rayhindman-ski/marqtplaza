---
name: Neighborhood boundaries
description: Homepage neighborhood selection uses official polygon geometry rather than centroid circles or discovery radii.
---

Use official CBS/PDOK boundary polygons for visual neighborhood emphasis and selection. Keep provider/search distance logic separate; it is not a substitute for the administrative boundary.

**Why:** The centroid-circle approximation did not follow the actual neighborhood shapes and made map selection look incorrect, especially for irregular or combined app neighborhoods.

**How to apply:** Update the shared boundary dataset when official geometry changes, and render its rings consistently in Google Maps, tile-map, and coordinate-fallback providers. Forward click modifiers in every renderer and use functional selection updates so Shift+click multi-selection cannot lose a recent choice.