---
name: Overpass API fetch pattern
description: How to call the Overpass API reliably from Node.js (not curl-compatible patterns)
---

# Overpass API fetch pattern in Node.js

## The rule
Use GET with `?data=<encoded-query>` and a descriptive `User-Agent` header.

**Why:** POST with `Content-Type: text/plain` and a raw body returns HTTP 406 from Node.js `fetch()`, even though the identical curl command works. The 406 appears to come from a CDN or proxy in front of `overpass-api.de` that behaves differently based on request origin headers. GET + URL-encoded query bypasses this issue.

**How to apply:**
```typescript
const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
const res = await fetch(url, {
  headers: { "User-Agent": "appname/1.0 (brief description)" },
  signal: AbortSignal.timeout(25000),
});
```

## Additional rules
- Do NOT run multiple Overpass queries in parallel — triggers 429 rate limiting.
- Use a single combined query covering all node types (amenity, shop, leisure, tourism) and classify results server-side.
- Set `[timeout:20]` in the Overpass QL header (not just the AbortSignal timeout).
- The free public endpoint (`overpass-api.de`) is accessible from Replit. Mirrors (kumi.systems, openstreetmap.ru) are rate-limited or unreachable.
- Always catch errors and fall back to static data so the UI is never broken.
