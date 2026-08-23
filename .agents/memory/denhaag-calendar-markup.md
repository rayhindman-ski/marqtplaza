---
name: DenHaag calendar markup
description: Reliable locality extraction from DenHaag.com event pages.
---

DenHaag.com event pages can expose the site-wide travel-mode label (“walking” or “spazieren”) before the actual event venue. Prefer the event-specific `playlist-item__location__link` value, then the most detailed locality-bearing venue from available source data.

**Why:** Treating the generic interface label as a venue caused verified Haagse events to be rejected, while replacing a full address with a shorter venue label could remove the Den Haag evidence needed for safe publication.

**How to apply:** When scanning this source, reject generic travel-mode labels as venue evidence. Prefer a venue with explicit Den Haag locality, postcode, or a verified local landmark; use the source page’s calendar data only as a fallback, since some event calendar links omit a LOCATION field.

Recurring exhibitions can contain hundreds of inline calendar links and approach three quarters of a megabyte. Keep a hard response-size limit, but make it large enough to admit this known official calendar format.

**Why:** A smaller cap cut off valid recurring-event calendar entries, causing date recovery to fail even though the source page supplied an upcoming occurrence.

**How to apply:** Treat a page-size increase as a bounded source-compatibility decision, not permission for unrestricted downloads; preserve the stream limit, timeout, approved-origin checks, and concurrency caps.