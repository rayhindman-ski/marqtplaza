---
name: buurtplaza Location interface
description: The Location type in data.ts requires postcodes, neighborhoods, and mapType — three components depend on them.
---

# Location interface requirements

The `Location` interface in `artifacts/buurtgids/src/lib/data.ts` must include:

- `mapType: 'amsterdam' | 'rotterdam' | 'utrecht' | 'denhaag' | 'eindhoven'` — used by `SchematicMap.tsx` to index into `CITY_LABELS`
- `postcodes: string[]` — postal code prefixes; used by `App.tsx` search and `CaptureView.tsx` to match businesses to cities
- `neighborhoods: string[]` — display list of neighbourhood names; used by `App.tsx` neighbourhood filter UI

**Why:** These fields were stripped during a data.ts rewrite and caused TypeScript errors in three files. The components that read them (`SchematicMap`, `App`, `CaptureView`) do not import from each other, so the breakage was not obvious until typecheck ran.

**How to apply:** Any future rewrite of `LOCATIONS` or the `Location` interface must include all five fields above alongside `id`, `name`, `nameNl`, `lat`, `lng`, `zoom`, and `neighborhoodCoords`.
