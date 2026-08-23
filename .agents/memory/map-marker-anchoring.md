---
name: Map marker anchoring
description: Rules for keeping custom map pins and multi-neighborhood viewport behavior consistent across map providers.
---

# Map marker anchoring and viewports

Custom marker wrappers must own their map coordinates and centering transform exactly once; their child buttons should only provide visual dimensions and interaction.

**Why:** Applying the same `left`/`top` values to a wrapper and its child shifts pins off their geographical position, particularly near map edges.

**How to apply:** When changing tile or coordinate-fallback pins, put the calculated location on the outer positioned wrapper only. For multiple neighborhood selection, calculate the tile viewport from the measured map container dimensions with padding and recompute on resize; clearing the selection must restore the city viewport in every provider.