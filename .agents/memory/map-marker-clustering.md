---
name: Map marker clustering
description: Rules for the overlapping-listing count badges across Google, tile, and coordinate map providers.
---

Cluster listings in **screen pixels** (projected world coords for tile/Google, percent × measured container size for the coordinate fallback), never in raw lat/lng or percentages.

**Why:** the coordinate fallback container is not square, so a percentage radius groups differently horizontally vs vertically; lat/lng radii ignore zoom entirely.

The **selected listing is always excluded from clustering** and drawn as its own pin.

**Why:** coincident points can never separate through zoom, so a selected listing inside a badge would be unreachable on the map.

Cluster badges **capture their own pointer** on pointerdown and only activate on a stationary release (small movement threshold).

**Why:** the tile map calls `setPointerCapture` on its container; if the badge lets pointerdown bubble, the container captures the pointer and the badge's click never fires. Without a movement threshold, a drag ending on a badge zooms the map.

**How to apply:** any new map provider or marker type must reuse `clusterMapPoints` with pixel positions and pass `selectedMarkerId`. E2E assertions on badges should match `aria-label` with a prefix regex, since the interactive (Google/tile) and non-interactive (coordinate fallback) labels differ.
