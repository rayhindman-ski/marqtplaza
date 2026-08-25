---
name: Business claim integrity
description: Rules that keep third-party map references separate from verified ownership.
---

Business claims must resolve a listing from an approved, current provider on the server. Browser-supplied names, addresses, coordinates, and source URLs are display hints only, never evidence that a listing exists or that the claimant owns it.

**Why:** Provider identifiers locate a business but do not prove ownership. Trusting browser metadata enables fabricated listings, and parallel claim or moderation requests can otherwise create competing owners.

**How to apply:** Add new listing providers to the server-side resolver before allowing claims from them. Keep identity scoped by city, provider, and provider listing ID; database constraints and conditional transitions must guarantee one pending claim and one approved owner path.