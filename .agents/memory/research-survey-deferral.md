---
name: Research survey deferral
description: The /onboarding research survey is asked only after 14 days of participation; the registration API freeze was lifted for this.
---
The usefulness/referral/desired-features survey must never appear at sign-up
or first registration. Eligibility counts from the research registration row's
own creation date (not the Clerk account date), so an old account registering
for the first time still finishes without answers. `PUT /api/registration`
accepts a registration without answers and must never overwrite stored answers
with absent ones.

**Why:** The user saw the survey on the published site's sign-up landing and
rejected it explicitly (2026-09-28); the earlier "do not touch /api/registration"
freeze was lifted by the user for exactly this change.

**How to apply:** Any new prompt for the survey (account page, e-mail) must use
the same registration-age rule; keep survey columns nullable.
