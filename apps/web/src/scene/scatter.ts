import { randomPointInPolygon, type Point } from '@temple/shared';

/** How close to the edge of the area a scattered point may be, in metres. */
const EDGE_MARGIN = 0.5;

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
  const points: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const point = randomPointInPolygon(polygon, random, EDGE_MARGIN);
    if (point === null) {
      throw new Error('The area is too small to place the points');
    }
    points.push(point);
  }
  return points;
}
