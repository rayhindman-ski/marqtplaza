---
name: External source scanning
description: Safety and user-feedback rules for scanning public event sources from the server.
---

# External source scanning

Source scans must accept source IDs, not arbitrary URLs. The server resolves those IDs through an allowlist of approved public source pages before fetching any page. Deep crawls must re-check that allowlist before every redirect and every followed link, and must stop streamed responses at a hard byte limit.

**Why:** Accepting a user-supplied URL, blindly following redirects, or buffering unrestricted pages can turn a public scan into SSRF or resource exhaustion. Public sites can also deny automated access, and that is not the same as finding no events.

**How to apply:** Keep the allowlist in the server scan route, handle redirects manually, stream response bodies with page-size and redirect limits, reject duplicate selections, and cap concurrent scans. For every selected source, return a distinct status for events found, no detectable events, automated access blocked, or fetch error. Never silently collapse blocked and failed scans into an empty result.

Only publish a scanned activity to the public event list when it has a valid upcoming date and verified local evidence (coordinates or Den Haag venue/context). Keep incomplete candidates in scan feedback, not the public list.

**Why:** Source landing pages and evergreen articles produce many event-like links that otherwise accumulate as stale or non-local public listings.

**How to apply:** Treat “captured” and “published” as different counts, filter public listings to upcoming dated records, and disclose any city-centre fallback map pin as approximate.