---
name: Google Places lifetime cap
description: Permanent cost-control rule for all Google Places API activity.
---

Google Places API calls share one persistent lifetime allowance of 100 requests. The allowance never resets by date, deployment, process restart, or cache expiry; only an explicit editor-authorized manual reset may make calls available again.

**Why:** The user explicitly chose a permanent ceiling to stop query and scraping costs after 100 calls.

**How to apply:** Every new Google Places request path must atomically reserve from the same durable counter immediately before the outbound request. Cached responses and non-Google providers do not consume the allowance.