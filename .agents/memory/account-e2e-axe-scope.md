---
name: Account e2e axe scope
description: Why account-page Playwright axe checks are scoped to the page's own panel.
---
Scope `AxeBuilder.include(...)` to the page's content panel; the shared AccountShell eyebrow (`text-primary` 12px) and the active language-toggle button are known colour-contrast debt and the usability suite tracks them under a per-page budget. New links on budgeted pages (e.g. registration) must not use `text-primary` small bold text or the budget assertion fails.
