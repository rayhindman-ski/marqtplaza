---
name: Browser map credentials
description: How the activity explorer avoids rejected browser map credentials while preserving a usable map.
---

Only initialize the Google Maps browser loader for a value that matches the exact Google browser API-key format. When there is no usable browser key, use generic interactive map tiles; if those tiles cannot load, retain the coordinate-based map with clickable activity pins.

**Why:** A workspace secret named for Google Maps may still not be accepted by the browser Maps API. Passing an arbitrary secret through to the browser produces an InvalidKey error and an empty map.

**How to apply:** Keep the same strict validation at build-time exposure and client-time provider selection. Treat Google authentication failure as a provider failure, not as a reason to remove the coordinate fallback.

Inline Google map label styles cannot be combined with Advanced Markers: a map ID is required for Advanced Markers, but causes Google to ignore the map's inline `styles` option.

**Why:** Removing the map ID makes the styled map look correct but breaks Advanced Markers; keeping it makes the app's label-hiding rules silently ineffective.

**How to apply:** Use Google `OverlayView` DOM markers when inline basemap styling is required, or use a separately configured Cloud Map Style and map ID together. Never remove the map ID without replacing Advanced Markers.