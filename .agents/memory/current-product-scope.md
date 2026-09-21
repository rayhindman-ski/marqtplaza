---
name: Current product scope
description: Defines how responsive work relates to the current desktop web-app focus.
---

Prioritize the desktop web application. Do not introduce mobile-first, 320px-first, or mobile-specific product redesigns unless the user explicitly requests them. Responsive checks should prevent regressions without changing the approved desktop product direction.

**Why:** An agent-authored Spec Kit plan expanded the scope into a mobile-first discovery redesign without a user request and displaced approved map-first web behavior.

**How to apply:** Keep desktop web behavior as the product baseline. Test smaller viewports for breakage, but do not use those checks to replace, defer, or reinterpret desktop requirements.