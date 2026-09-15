# User testing notes

**Tester:** Mattijs Nijland  
**Date:** 2026-09-15

- Where the map shows number badges, cards with information do not appear.
- News articles on the overview or news page should mention a date.
- Food and business listings did not load.
- Split Food & Drink into subcategories.
- Event cards should mention price.
- There should be more events and social listings.
- Follow-up observation: news dates are already mentioned.
- Cards on the overview should expand when clicked and show more information.

## Release interpretation

- Treat missing map-cluster information, card expansion, and stored-only discovery cache misses as defects.
- Keep news dates and event prices visible; when a source omits either value, say that it is unknown rather than inventing data.
- Add source-derived Food & Drink types so people can filter useful subcategories.
- Do not claim broader event/social coverage by weakening source verification. Source expansion remains separate work.