import { describe, expect, it } from 'vitest';
import { boundsOf, isPointInPolygon, randomPointInPolygon, type Point } from './geometry';

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

describe('boundsOf', () => {
  it('finds the box around a polygon', () => {
    expect(boundsOf(lShape)).toEqual({ minX: 0, maxX: 10, minZ: 0, maxZ: 10 });
  });
});

describe('randomPointInPolygon', () => {
  const counter = (values: number[]) => {
    let index = 0;
    return () => values[index++ % values.length] as number;
  };

  it('returns a point inside the polygon', () => {
    const point = randomPointInPolygon(lShape, counter([0.9, 0.9, 0.1, 0.5]));
    expect(point).not.toBeNull();
    expect(isPointInPolygon(point!, lShape)).toBe(true);
  });

  it('stays inside the requested region and away from the edges by the margin', () => {
    const region = { minX: 0, maxX: 10, minZ: 8, maxZ: 10 };
    const point = randomPointInPolygon(square, counter([0, 0, 1, 1]), 0.5, region)!;
    expect(point.z).toBeGreaterThanOrEqual(8.5);
    expect(point.x).toBeGreaterThanOrEqual(0.5);
  });

  it('gives up with null when the area is too small or no try lands inside', () => {
    expect(randomPointInPolygon(square, () => 0.5, 6)).toBeNull();
    expect(randomPointInPolygon(lShape, () => 0.99)).toBeNull();
  });
});
