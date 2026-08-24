---
name: Homepage postcode routing
description: Product rule for postcode search and discovery navigation.
---

Valid Haagse postcodes, with or without the space before the suffix, must be searchable from the homepage and navigate to a refreshable discovery route.

**Why:** Residents expect a postcode search to take them to an addressable local map, not only change in-memory UI state that is lost on refresh or cannot be shared.

**How to apply:** Keep the root page as the search entry point. When a valid postcode resolves to the active city, preserve any relevant discovery context in the route and ensure the map's back action returns to the root search page.