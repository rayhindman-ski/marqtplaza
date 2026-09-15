---
name: Playwright route globs
description: Why route-mocked e2e specs in this workspace must use regex patterns for nested API paths.
---
Use a regex (or an exact glob per path) in `page.route` for API endpoints that have sub-paths such as `/api/review/claims/12/decision`.

**Why:** With the Playwright version pinned here, a trailing `**` in a glob like `**/api/review/claims**` matched `/api/review/claims?limit=20` but silently did *not* match `/api/review/claims/12/decision`; the POST fell through to the Vite dev server and produced an unexplained 404 with no route handler invoked. It took several debugging rounds to notice, because the list GET still worked.

**How to apply:** For stateful mock servers that serve both a list endpoint and its `/:id/action` siblings, register one regex such as `/\/api\/review\/claims(\/\d+\/decision)?(\?.*)?$/`. Write route-handler diagnostics to a file rather than `console.log`; reporter output for those logs was unreliable.

Related: the moderation screen has a dev-only `?e2eEditorAuth=1` opt-in (`window.__editorTestAuth = { userId, role }`) that mirrors the account test hook, so editor-gated views can be driven without a Clerk session.
