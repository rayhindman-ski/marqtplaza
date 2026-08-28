---
name: Weather response caching
description: Why browser weather requests need to bypass conditional HTTP caching.
---

Request weather data with browser caching disabled.

**Why:** Conditional requests can receive a bodyless 304 through the development proxy. The generated query client then has no weather payload, which makes the compact map weather strip disappear even though the endpoint is healthy.

**How to apply:** Keep the query library's in-memory stale time for efficiency, but set the underlying weather request to `cache: "no-store"` whenever the weather card uses the generated API client.