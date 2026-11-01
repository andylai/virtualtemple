/** A position on the hall floor. `x` runs left to right and `z` runs from the altar outwards. */
export interface Point {
  x: number;
  z: number;
}

/**
 * Tells whether a point lies inside a polygon (ray casting). A point exactly on an edge may be
 * reported either way, so keep real positions a little away from the edges.
 *
 * @param point - The position to test.
 * @param polygon - The corners of the polygon in order, at least three.
 */
export function isPointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    const crossesRay = a.z > point.z !== b.z > point.z;
    if (crossesRay && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** The smallest box that contains a polygon. */
export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Finds the smallest box that contains a polygon.
 *
 * @param polygon - The corners of the polygon, at least one.
 */
export function boundsOf(polygon: readonly Point[]): Bounds {
  const xs = polygon.map((point) => point.x);
  const zs = polygon.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Tries per point before giving up, so an odd-shaped area cannot loop forever. */
const MAX_TRIES = 100;

/**
 * Picks a random point inside a polygon by trying points in a box until one lands inside.
 *
 * @param polygon - The area to pick from.
 * @param random - A function returning numbers from 0 up to (not including) 1.
 * @param margin - How far from the edges of the box a point must stay, in metres.
 * @param region - Optionally limit the tries to this box (it is cut down to the polygon's box).
 * @returns A point, or null when none was found, for example when the area is too small.
 */
export function randomPointInPolygon(
  polygon: readonly Point[],
  random: () => number,
  margin = 0,
  region?: Bounds,
): Point | null {
  const whole = boundsOf(polygon);
  const box =
    region === undefined
      ? whole
      : {
          minX: Math.max(whole.minX, region.minX),
          maxX: Math.min(whole.maxX, region.maxX),
          minZ: Math.max(whole.minZ, region.minZ),
          maxZ: Math.min(whole.maxZ, region.maxZ),
        };
  const [minX, maxX] = [box.minX + margin, box.maxX - margin];
  const [minZ, maxZ] = [box.minZ + margin, box.maxZ - margin];
  if (minX >= maxX || minZ >= maxZ) {
    return null;
  }
  for (let tries = 0; tries < MAX_TRIES; tries += 1) {
    const candidate = { x: minX + random() * (maxX - minX), z: minZ + random() * (maxZ - minZ) };
    if (isPointInPolygon(candidate, polygon)) {
      return candidate;
    }
  }
  return null;
}
