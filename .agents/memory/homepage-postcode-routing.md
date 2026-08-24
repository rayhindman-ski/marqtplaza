---
name: Homepage postcode routing
description: Product rule for postcode search and discovery navigation.
---

Valid Haagse postcodes, with or without the space before the suffix, must be searchable from the homepage, navigate to a refreshable discovery route, and narrow displayed listings to matching addresses.

**Why:** Residents expect a postcode search to find nearby places, not only recognise the city. The active Haagse range extends beyond the initial central prefixes, so the city-level range must not be arbitrarily truncated.

**How to apply:** Keep the root page as the search entry point. When a valid postcode resolves to the active city, preserve it in the route, initialise the visible filter from it, and ensure the map's back action returns to the root search page. Accept the full active Haagse prefix range, not just the central districts.