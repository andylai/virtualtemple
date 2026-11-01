import { describe, expect, it } from 'vitest';
import { isPointInPolygon, type Point } from './geometry';

const square: Point[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 10 },
  { x: 0, z: 10 },
];
const lShape: Point[] = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 4 },
  { x: 4, z: 4 },
  { x: 4, z: 10 },
  { x: 0, z: 10 },
];

describe('isPointInPolygon', () => {
  it('accepts points inside a square and rejects points outside', () => {
    expect(isPointInPolygon({ x: 5, z: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 11, z: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, z: -1 }, square)).toBe(false);
  });

  it('handles a polygon that is not convex', () => {
    expect(isPointInPolygon({ x: 2, z: 8 }, lShape)).toBe(true);
    expect(isPointInPolygon({ x: 8, z: 8 }, lShape)).toBe(false);
  });
});
