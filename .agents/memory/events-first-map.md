---
name: Events-only first map
description: Rule for the initial visitor map and event-data fallbacks.
---

The first discovery map for a visitor must contain only verified upcoming events. If no validated events are available, show the empty-events state instead of reclassifying museums, tours, attractions, or other fixed places as events.

**Why:** A generic activity fallback makes the event filter appear correct while silently showing non-event content, which undermines the visitor journey and category trust.

**How to apply:** Keep the default discovery section on events for ordinary homepage entry points. Any event API or client fallback must be limited to time-bound, validated event records; fixed locations belong to their own sections.