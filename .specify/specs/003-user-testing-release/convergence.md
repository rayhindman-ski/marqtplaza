# Convergence: User Testing Release

**Status**: Converged  
**Date**: 2026-09-15

## Delivered

- Numbered map clusters reveal their contained results across Google, tile, and
  coordinate map providers. Choosing a result selects, expands, and scrolls to
  its overview card.
- Overview cards now begin collapsed and use one native, keyboard-operable
  disclosure with `aria-expanded` and `aria-controls`.
- Stored-only cache misses explain that saved results are unavailable and offer
  an explicit, persisted live-search action.
- Food & Drink listings expose source-derived restaurant, café, bar, bakery,
  takeaway, and other filters through an additive OpenAPI field.
- News cards and article detail label missing or malformed publication dates as
  unknown. Event cards retain explicit price labels, including price unknown.
- The original testing notes are recorded in `doc/md/user-testing.md`.

## Verification

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm run typecheck`
- `DATABASE_URL=postgres://localhost/news_test tsx --test src/routes/listings-query.test.ts`
- `pnpm --filter @workspace/buurtgids exec tsx --test src/lib/listingPresentation.test.ts`
- `pnpm --filter @workspace/api-server run test`
- `pnpm --filter @workspace/buurtgids run test`: 50 browser tests passed, 4 skipped;
  one changed-flow assertion failed before correction.
- Focused rerun for discovery cluster/disclosure and live-retry flows: 2 passed.
- `pnpm --filter @workspace/buurtgids run build`
- `git diff --check`
- Restarted web workflow reached Vite ready state.
- Desktop preview confirmed discovery renders cleanly with clustered results,
  neighborhood geometry, filters, and no current browser errors.
- Architect review passed after disclosure, safe date, and OSM subtype findings
  were corrected.

## Deviations and follow-up

- Event and social-map quantity was not increased by weakening source
  verification. A separate follow-up covers adding more approved sources.
- Google Places queries remain disabled; this release does not change provider
  quota or release configuration.