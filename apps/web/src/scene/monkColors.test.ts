import { AVATAR_VARIANT_COUNT } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { MONK_PALETTE_SIZE, monkColors } from './monkColors';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

describe('monkColors', () => {
  it('covers every avatar variant the server can assign', () => {
    expect(MONK_PALETTE_SIZE).toBeGreaterThanOrEqual(AVATAR_VARIANT_COUNT);
  });

  it('gives every variant a valid, distinct robe colour', () => {
    const robes = new Set<string>();
    for (let avatarId = 0; avatarId < AVATAR_VARIANT_COUNT; avatarId += 1) {
      const { robe, trim } = monkColors(avatarId);
      expect(robe).toMatch(HEX_COLOR);
      expect(trim).toMatch(HEX_COLOR);
      robes.add(robe);
    }
    expect(robes.size).toBe(AVATAR_VARIANT_COUNT);
  });

  it('wraps around instead of failing on an id past the palette', () => {
    expect(monkColors(MONK_PALETTE_SIZE)).toEqual(monkColors(0));
  });
});
