---
name: External source scanning
description: Safety and user-feedback rules for scanning public event sources from the server.
---

# External source scanning

Source scans must accept source IDs, not arbitrary URLs. The server resolves those IDs through an allowlist of approved public source pages before fetching any page. Deep crawls must require the configured source’s exact HTTPS origin (scheme, hostname, and port), enforce parsed robots.txt rules before queueing and fetching pages and before each redirect, and stop streamed responses at a hard byte limit.

**Why:** Accepting a user-supplied URL, blindly following redirects, or buffering unrestricted pages can turn a public scan into SSRF or resource exhaustion. Public sites can also deny automated access, and that is not the same as finding no events.

**How to apply:** Keep the allowlist in the server scan route, fetch robots.txt before crawl admission, handle redirects manually, stream response bodies with page-size and redirect limits, reject duplicate selections, and cap concurrent scans. Bound links, index pages, detail pages, and sitemaps separately; report budget-skipped and robots-protected pages truthfully. For every selected source, return a distinct status for events found, no detectable events, automated access blocked, or fetch error. Never silently collapse blocked and failed scans into an empty result.

Only publish a scanned activity to the public event list when it has a valid upcoming date and verified local evidence (coordinates or Den Haag venue/context). Keep incomplete candidates in scan feedback, not the public list.

**Why:** Source landing pages and evergreen articles produce many event-like links that otherwise accumulate as stale or non-local public listings.

**How to apply:** Treat “captured” and “published” as different counts, filter public listings to upcoming dated records, and disclose any city-centre fallback map pin as approximate.

Publication metrics must distinguish inspected links from captured events. Only a captured event that fails a publication check belongs in a rejection count; page and link-volume limits must be reported separately.

**Why:** A crawler can inspect thousands of safe same-origin links while finding only a few candidates. Reporting the difference as rejected events makes source quality and coverage look far worse than they are.

**How to apply:** Report pages/links examined, captured events, eligible events, and each explicit publication reason independently. Never treat a source-listing URL as event-locality proof; require event-specific venue/address/description evidence or in-bounds coordinates.

Public event listings must preserve the human-readable publisher that listed the event separately from the event’s destination URL.

**Why:** A link tells visitors where to open an event, but it does not make the discovery provenance visible or auditable.

**How to apply:** Keep the event URL as the destination link and return a distinct publisher/source-name field from scanned records. For curated records, provide a readable publisher label without reusing the destination URL as the provenance value.