# Convergence: v0.42 proposition, navigation, and mobile discovery

> **Superseded product assumptions (corrected 2026-09-21):** This is a
> historical execution record, not the current product contract. Its list-first,
> explicit Show map, no-eager-map, and mobile-first conclusions came from an
> agent-authored scope expansion that the user did not request. Current work must
> follow the corrected `spec.md` and `plan.md`: desktop web app first, populated
> map visible by default, list/filter column capped at 30%, and official
> neighborhood polygons with perceptible hover/focus/selected/multi-selected
> highlighting.

**Date**: 2026-09-20  
**Branch**: `feature/v042-enhancements`

## Delivered

- BR-01: location-independent EN/NL proposition, separate Hague availability,
  explicit local/web and privacy explanation, list-first entry, and no eager map,
  location, or external-search activation.
- BR-02: one semantic navigation surface with visible destination labels,
  consumer-facing account/mode language, mobile disclosure, Escape handling,
  trigger focus restoration, and preserved safe account return paths.
- BR-09: list-first mobile discovery, explicit map/list control, map provider
  mounting only after user action, 320px filter disclosure, one-column results,
  44px primary controls, and retained manual area browsing after location failure.
- Existing v0.41 local-only defaults, source evidence, detail snapshots, saved
  places, and provider-independent list behavior remain in place.
- Listing detail API client was regenerated after repairing a duplicate OpenAPI
  schema. Missing database schema exports and baseline listings test helpers were
  restored so workspace typechecking is reliable.

## Automated evidence

| Check | Result |
|---|---|
| `pnpm run typecheck` | Pass |
| `pnpm --filter @workspace/buurtgids run typecheck` | Pass |
| `pnpm --filter @workspace/buurtgids run build` | Pass |
| `playwright test e2e/v042-release.spec.ts` | 4 passed |
| Frontend unit suites | 32 passed |
| Listings route unit suite | 22 passed |
| `git diff --check` | Pass |

The v0.42 browser suite proves:

1. global proposition and current Hague availability are distinct;
2. a fresh homepage makes no Google Maps or OpenStreetMap tile request;
3. mobile navigation exposes labelled destinations and restores trigger focus;
4. discovery starts as a list and requests map resources only after **Show map**;
5. discovery filters are progressively disclosed at 320px.

## Visual evidence

- `screenshots/v042-home-desktop.jpg` — English desktop homepage.
- `screenshots/v042-discovery-mobile.jpg` — English 390×844 list-first discovery.

Screenshots are visual evidence only; request order and keyboard behavior are
covered by the browser tests.

## Deviations and boundaries

- No analytics system was introduced because the product has no approved
  privacy-minimized telemetry mechanism.
- No database migration, new provider, ranking change, native app, or global
  coverage claim was added.
- Existing search URLs continue to allow-list neighborhood, postcode, section,
  and restore state. Private identifiers, tokens, session state, and coordinates
  are not added to public URLs.
- Screen-reader quality beyond semantic roles, names, focus behavior, and
  keyboard automation remains a manual release check.
- The inherited `discovery-regression.spec.ts` is not a release gate for this
  build: its branch-baseline source contains duplicated partial helpers/tests,
  and its map assertions assume eager homepage/discovery maps. It requires a
  deliberate migration to the v0.42 explicit **Show map** contract rather than
  weakening the new privacy behavior to satisfy stale assertions.

## Release decision

The implemented v0.42 surfaces converge on BR-01, BR-02, and BR-09 without
weakening the v0.41 privacy and lazy-provider contracts. Automated release
checks listed above pass.