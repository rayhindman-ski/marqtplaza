---
name: Clerk live verification
description: Limits of live Clerk sign-up evidence in this development environment.
---

Headless Chromium can load the real managed Clerk widget and use a backend-created,
email-verified development identity for authenticated API/session smoke tests, but
the sign-up submit may stop at Clerk bot protection and a disposable inbox may
receive no verification message.

**Why:** A passing authenticated session does not prove sign-up, email verification,
redirect-after-verification, or expired-link handling.

**How to apply:** Keep these cases explicitly separate in convergence evidence. Use
a controlled Clerk test inbox and a browser session that can complete the configured
bot-protection challenge before marking the full identity journey verified.