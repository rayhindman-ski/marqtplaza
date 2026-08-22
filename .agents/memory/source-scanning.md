---
name: External source scanning
description: Safety and user-feedback rules for scanning public event sources from the server.
---

# External source scanning

Source scans must accept source IDs, not arbitrary URLs. The server resolves those IDs through an allowlist of approved public source pages before fetching any page.

**Why:** Accepting a user-supplied URL would turn the endpoint into an SSRF risk, allowing requests to private or internal services. Public sites can also deny automated access, and that is not the same as finding no events.

**How to apply:** Keep the allowlist in the server scan route. For every selected source, return a distinct status for events found, no detectable events, automated access blocked, or fetch error. Never silently collapse blocked and failed scans into an empty result.