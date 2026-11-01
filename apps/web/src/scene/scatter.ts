import { isPointInPolygon, type Point } from '@temple/shared';

/** How close to the edge of the area a scattered point may be, in metres. */
const EDGE_MARGIN = 0.5;
/** Tries per point before giving up, so a tiny or odd-shaped area cannot loop forever. */
const MAX_TRIES_PER_POINT = 100;

/** A small, fast random number generator that repeats for the same seed (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks repeatable random points inside a polygon, used to place stand-in avatars for the
 * performance test. The same seed always gives the same points.
 *
 * @param count - How many points.
 * @param polygon - The area to fill.
 * @param seed - Any whole number.
 * @throws {Error} When the area is too small to fit the points.
 */
export function scatterPoints(count: number, polygon: readonly Point[], seed: number): Point[] {
  const random = seededRandom(seed);
  const xs = polygon.map((point) => point.x);
  const zs = polygon.map((point) => point.z);
  const [minX, maxX] = [Math.min(...xs) + EDGE_MARGIN, Math.max(...xs) - EDGE_MARGIN];
  const [minZ, maxZ] = [Math.min(...zs) + EDGE_MARGIN, Math.max(...zs) - EDGE_MARGIN];
  if (minX >= maxX || minZ >= maxZ) {
    throw new Error('The area is too small to place the points');
  }
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    let found: Point | null = null;
    for (let tries = 0; tries < MAX_TRIES_PER_POINT && found === null; tries += 1) {
      const candidate = { x: minX + random() * (maxX - minX), z: minZ + random() * (maxZ - minZ) };
      found = isPointInPolygon(candidate, polygon) ? candidate : null;
    }
    if (found === null) {
      throw new Error('The area is too small to place the points');
    }
    points.push(found);
  }
  return points;
}
