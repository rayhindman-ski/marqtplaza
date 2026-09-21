---
name: Map surface separation
description: Product responsibilities that must remain separate between the homepage neighborhood map and drill-down discovery map.
---

Treat the homepage neighborhood-selection map and drill-down discovery map as distinct product surfaces, even if they reuse low-level rendering infrastructure.

**Why:** The homepage map exists to select one or more neighborhoods and enter discovery. The drill-down map exists to visualize results from the active discovery filters. Sharing unconstrained behavior caused boundary, marker, and empty-state changes intended for one surface to break the other.

**How to apply:** Both maps always show and frame all neighborhood boundaries. Selected neighborhoods use stronger border/fill styling while unselected boundaries remain lighter; selection must not refit the camera to hide the rest. The homepage supports multi-selection and does not fetch or display discovery listing markers. The drill-down map displays listing icons produced by its active filters. Keep separate public components and locked configuration contracts.