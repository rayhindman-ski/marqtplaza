---
name: Map marker anchoring
description: Rules for keeping custom map pins and multi-neighborhood viewport behavior consistent across map providers.
---

# Map marker anchoring and viewports

Custom marker wrappers must own their map coordinates and centering transform exactly once; Google `OverlayView` wrappers must be `position:absolute`, while child buttons only provide visual dimensions and interaction. Every neighborhood in the selection set must use active boundary styling; a single highlighted-neighborhood value cannot represent multi-selection.

**Why:** Applying the same `left`/`top` values to a wrapper and its child shifts pins off their geographical position. A relatively positioned `OverlayView` wrapper also treats projected coordinates as offsets from normal flow, scattering correct coordinates outside their polygon. Styling only one highlighted neighborhood made every boundary faint as soon as two neighborhoods were selected.

**How to apply:** When changing tile or coordinate-fallback pins, put the calculated location on the outer positioned wrapper only. For multiple neighborhood selection, calculate the tile viewport from the measured map container dimensions with padding and recompute on resize; clearing the selection must restore the city viewport in every provider. Assert that each selected boundary is active and that a marker from each selected area is visible.