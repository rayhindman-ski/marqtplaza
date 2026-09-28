---
name: Business listing → profile link
description: How map pins resolve to claimed business profiles without touching marker queries.
---
Map markers never carry business-profile data; the popup resolves a claimed
profile lazily through a public by-listing lookup keyed on (cityId,
listingSource, listingId) — city included because listing identity is unique
only per city. While the lookup is pending the popup shows a non-link
placeholder; offering "claim" before it settles can push a visitor into the
claim flow for an already-claimed business.

**Why:** the map/list/card surfaces are frozen; the user approved exactly one
popup change (2026-09-28), and the reviewer flagged the pending-state race.

**How to apply:** owner-facing content (services, messages) is published only
from approved snapshots / approved moderation rows; the lookup returns slug and
name only.
