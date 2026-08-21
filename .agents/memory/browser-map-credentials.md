---
name: Browser map credentials
description: How the activity explorer avoids rejected browser map credentials while preserving a usable map.
---

Only initialize the Google Maps browser loader for a value that matches the exact Google browser API-key format. When there is no usable browser key, use generic interactive map tiles; if those tiles cannot load, retain the coordinate-based map with clickable activity pins.

**Why:** A workspace secret named for Google Maps may still not be accepted by the browser Maps API. Passing an arbitrary secret through to the browser produces an InvalidKey error and an empty map.

**How to apply:** Keep the same strict validation at build-time exposure and client-time provider selection. Treat Google authentication failure as a provider failure, not as a reason to remove the coordinate fallback.