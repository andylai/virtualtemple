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

  it('builds a lamp rack that spans every lamp slot', () => {
    const rack = layout.lampRack!;
    for (const slot of layout.lampSlots) {
      expect(Math.abs(slot.z - rack.z)).toBeLessThanOrEqual(rack.depth / 2);
      expect(Math.abs(slot.x - rack.x)).toBeLessThanOrEqual(rack.width / 2);
    }
  });

  it('has no lamp rack when there are no lamp slots', () => {
    expect(buildHallLayout({ ...flagshipManifest.hall, lampSlots: [] }).lampRack).toBeNull();
  });

  it('looks at the middle of the walkable area', () => {
    expect(layout.focus.x).toBe(0);
    expect(layout.focus.z).toBe((layout.bounds.minZ + layout.bounds.maxZ) / 2);
  });
});
