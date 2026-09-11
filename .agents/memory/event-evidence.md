---
name: Event source evidence
description: Public event discovery must distinguish verified results, checked-empty sources, blocked coverage, stale stored evidence, and missing scan history.
---

Treat missing event-source scan history as `unavailable`, never as an empty
result. A checked source with no eligible upcoming events is the separate
`empty` state; blocked or failed sources must remain visible as incomplete
coverage.

**Why:** Residents otherwise cannot tell whether “no events” reflects a real
source result or an unobserved provider failure, which undermines trust in the
event-only feed.

**How to apply:** Persist the latest approved source-scan outcome, return it as
structured listing evidence, and keep generic attractions out of every event
fallback path.