---
name: Clerk live verification
description: How to run a real Clerk sign-up in headless Chromium here, and what that evidence does and does not prove.
---

Headless Chromium can complete a real sign-up on the Clerk development instance, but only with
two things together: a Backend API testing token (`POST /v1/testing_tokens`) appended as
`__clerk_testing_token` to every Frontend API request, **and** the Turnstile script
(`challenges.cloudflare.com`) blocked. The dev instance still reports `captcha_enabled`, so
without the block clerk-js renders an interactive "Verify you are human" checkbox that
automation cannot pass; with the block it submits `captcha_error`, which the token waives.

Use Clerk test identities (`<local>+clerk_test@example.com`, code `424242`) as the controlled
inbox. They never send mail, so they prove the verification step and redirect, not SMTP delivery.

**Why:** A backend-created verified identity proves nothing about sign-up; a sign-up run without
the token stalls on bot protection and looks like "no email arrived".

**How to apply:** The opt-in spec `e2e/clerk-live-signup.spec.ts` encodes this; point
`CLERK_LIVE_BASE_URL` at the workspace dev domain, because the isolated Playwright server has no
`/api` and the landing page cannot load the account. Clerk's internal step navigations
(`/sign-up/verify-email-address`) arrive as bare paths through `routerPush`, so any query state the
app needs after redirect (e.g. `terug`) must be re-attached there — a live run is the only test
that catches this.
