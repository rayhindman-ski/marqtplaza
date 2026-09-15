import { NEIGHBORHOOD_BOUNDARIES } from "./neighborhood-boundaries";

export {
  NEIGHBORHOOD_BOUNDARIES,
  type BoundaryPoint,
  type NeighborhoodBoundary,
} from "./neighborhood-boundaries";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  s: number;
  w: number;
  n: number;
  e: number;
}

/** Ray-casting point-in-polygon for a single [lat, lng] ring. */
export function isPointInsideRing(
  lat: number,
  lng: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const crosses = (latI > lat) !== (latJ > lat)
      && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (crosses) inside = !inside;
  }
  return inside;
}

const BOUNDARIES_BY_FOLDED_NAME = new Map(
  Object.entries(NEIGHBORHOOD_BOUNDARIES).map(([name, boundary]) => [foldName(name), boundary] as const),
);

function foldName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
}

/** Looks up official geometry by name, tolerant of casing and spacing differences. */
export function getNeighborhoodBoundary(name: string) {
  return BOUNDARIES_BY_FOLDED_NAME.get(foldName(name));
}

/** True when the point lies inside any ring of any named neighborhood. */
export function isPointInsideNeighborhoods(lat: number, lng: number, names: readonly string[]): boolean {
  return names.some((name) =>
    getNeighborhoodBoundary(name)?.some((ring) => isPointInsideRing(lat, lng, ring)) ?? false,
  );
}

/** Bounding box of all named neighborhoods; undefined if none has geometry. */
export function getNeighborhoodsBoundingBox(names: readonly string[]): BoundingBox | undefined {
  let box: BoundingBox | undefined;
  for (const name of names) {
    for (const ring of getNeighborhoodBoundary(name) ?? []) {
      for (const [lat, lng] of ring) {
        if (!box) box = { s: lat, n: lat, w: lng, e: lng };
        else {
          box.s = Math.min(box.s, lat); box.n = Math.max(box.n, lat);
          box.w = Math.min(box.w, lng); box.e = Math.max(box.e, lng);
        }
      }
    }
  }
  return box;
}

/** Geometric centre of the named neighborhoods' bounding box. */
export function getNeighborhoodsCenter(names: readonly string[]): LatLng | undefined {
  const box = getNeighborhoodsBoundingBox(names);
  return box ? { lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2 } : undefined;
}

