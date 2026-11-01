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
