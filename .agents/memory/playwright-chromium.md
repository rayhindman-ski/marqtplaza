---
name: Playwright browser executable
description: How to run the buurtgids Playwright suite in this workspace without downloaded browsers.
---
Run Playwright with the Nix system Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(command -v chromium) pnpm exec playwright test`.

**Why:** `playwright install` browsers are not present in the workspace cache; a bare `playwright test` fails on every test with "Executable doesn't exist" before any assertion runs. The package `test` script already sets this variable, but direct `playwright test` invocations do not.

**How to apply:** Use the `test` script or set the variable explicitly. The `test-results/` directory is generated output and is gitignored.

Related lesson: the details/discovery map keeps every boundary polygon mounted (faint at 0.2 stroke opacity), so tests must assert opacity changes, not polygon removal, when a neighborhood is deselected. Google Maps polygon listeners are bound once, so callbacks must be read through refs.
