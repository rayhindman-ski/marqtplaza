---
name: v0.41 discovery safeguards
description: P0 privacy and non-map discovery defaults that later UI work must preserve.
---

Fresh discovery sessions must use stored/local results only, and both homepage and results maps must remain unmounted until the user explicitly chooses to show a map.

**Why:** Release v0.41 defines transparent search scope and usable non-map discovery as release gates. Loading providers or enabling external search before an explicit choice violates those gates.

**How to apply:** Preserve an existing explicit web-search preference, but default absence of a preference to local-only. Any new discovery entry point must provide list/manual-location use without constructing the map component first.

The privacy-information route must remain available to guests. Browser-data clearing must be category-specific, accurately report what was removed, and explicitly distinguish browser clearing from account or server deletion.

**Why:** The search-scope disclosure links guests to privacy information, and v0.41 forbids forcing account access for privacy controls or claiming deletion that did not happen.

**How to apply:** Keep browser-held preference controls outside authenticated account gating. Keep account deletion authorized and signed-in-only, and never combine its outcome text with local storage clearing.