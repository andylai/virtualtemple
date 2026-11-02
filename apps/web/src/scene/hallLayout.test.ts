import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it } from 'vitest';
import { BLOCKOUT, buildHallLayout } from './hallLayout';

const layout = buildHallLayout(flagshipManifest.hall);

describe('buildHallLayout', () => {
  it('puts the altar behind the walkable area', () => {
    const altarFront = layout.altar.z + layout.altar.depth / 2;
    expect(altarFront).toBeCloseTo(layout.bounds.minZ);
    expect(layout.altar.height).toBe(BLOCKOUT.altarHeight);
  });

  it('stands the statue on top of the altar, centred on it', () => {
    expect(layout.statue.x).toBe(layout.altar.x);
    expect(layout.statue.z).toBe(layout.altar.z);
    expect(layout.statue.y - layout.statue.height / 2).toBeCloseTo(BLOCKOUT.altarHeight);
  });

  it('encloses the walkable area with a back wall and two side walls', () => {
    expect(layout.walls).toHaveLength(3);
    const [back, left, right] = layout.walls;
    expect(back!.z).toBeLessThan(layout.altar.z - layout.altar.depth / 2);
    expect(left!.x).toBeLessThan(layout.bounds.minX);
    expect(right!.x).toBeGreaterThan(layout.bounds.maxX);
  });

  it('keeps the manifest cushions and lamp slots', () => {
    expect(layout.cushions).toHaveLength(flagshipManifest.hall.cushions.length);
    expect(layout.lampSlots).toHaveLength(flagshipManifest.hall.lampSlots.length);
  });

  it('hangs the pictures on the inside of the back wall, inside the hall and clear of the wall', () => {
    const wallInside = layout.altar.z - layout.altar.depth / 2;
    for (const plane of Object.values(layout.pictures)) {
      expect(plane.z).toBeGreaterThan(wallInside);
      expect(plane.z - wallInside).toBeLessThan(0.1);
      expect(plane.y - plane.height / 2).toBeGreaterThanOrEqual(0);
      expect(plane.y + plane.height / 2).toBeLessThanOrEqual(BLOCKOUT.wallHeight);
      expect(plane.x - plane.width / 2).toBeGreaterThan(layout.bounds.minX);
      expect(plane.x + plane.width / 2).toBeLessThan(layout.bounds.maxX);
    }
  });

  it('builds a shelf on each side of the altar, and every lamp place stands on one', () => {
    expect(layout.lampRacks).toHaveLength(2);
    const [left, right] = [...layout.lampRacks].sort((a, b) => a.x - b.x);
    expect(left!.x).toBeLessThan(layout.altar.x);
    expect(right!.x).toBeGreaterThan(layout.altar.x);
    for (const slot of layout.lampSlots) {
      const shelf = slot.x < layout.altar.x ? left! : right!;
      expect(Math.abs(slot.x - shelf.x)).toBeLessThanOrEqual(shelf.width / 2);
      expect(Math.abs(slot.z - shelf.z)).toBeLessThanOrEqual(shelf.depth / 2);
    }
  });

  it('keeps the shelves clear of the altar', () => {
    const altarLeft = layout.altar.x - layout.altar.width / 2;
    const altarRight = layout.altar.x + layout.altar.width / 2;
    for (const shelf of layout.lampRacks) {
      const near = shelf.x < layout.altar.x ? shelf.x + shelf.width / 2 : shelf.x - shelf.width / 2;
      expect(shelf.x < layout.altar.x ? near : -near).toBeLessThan(
        shelf.x < layout.altar.x ? altarLeft : -altarRight,
      );
    }
  });

  it('fills the lamp places left, right, left, right, so the first lamps look balanced', () => {
    const sides = layout.lampSlots.slice(0, 6).map((slot) => Math.sign(slot.x - layout.altar.x));
    expect(sides).toEqual([-1, 1, -1, 1, -1, 1]);
  });

  it('has no shelves when there are no lamp places', () => {
    expect(buildHallLayout({ ...flagshipManifest.hall, lampSlots: [] }).lampRacks).toEqual([]);
  });

  it('looks at the middle of the walkable area', () => {
    expect(layout.focus.x).toBe(0);
    expect(layout.focus.z).toBe((layout.bounds.minZ + layout.bounds.maxZ) / 2);
  });
});
