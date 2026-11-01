import { isPointInPolygon, type Point } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { scatterPoints } from './scatter';

const room: Point[] = [
  { x: -6, z: -4 },
  { x: 6, z: -4 },
  { x: 6, z: 9 },
  { x: -6, z: 9 },
];

describe('scatterPoints', () => {
  it('returns the requested number of points, all inside the area', () => {
    const points = scatterPoints(50, room, 1);
    expect(points).toHaveLength(50);
    expect(points.every((point) => isPointInPolygon(point, room))).toBe(true);
  });

  it('repeats for the same seed and differs for another', () => {
    expect(scatterPoints(5, room, 7)).toEqual(scatterPoints(5, room, 7));
    expect(scatterPoints(5, room, 7)).not.toEqual(scatterPoints(5, room, 8));
  });

  it('refuses an area that is too small', () => {
    const tiny: Point[] = [
      { x: 0, z: 0 },
      { x: 0.5, z: 0 },
      { x: 0.5, z: 0.5 },
    ];
    expect(() => scatterPoints(1, tiny, 1)).toThrow('too small');
  });
});
