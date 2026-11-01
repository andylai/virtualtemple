import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { RITUAL_IDS } from './manifest';
import { RITUALS, ritualForKey } from './rituals';

describe('RITUALS', () => {
  it('defines every ritual id, once, with a positive duration', () => {
    expect(Object.keys(RITUALS).sort()).toEqual([...RITUAL_IDS].sort());
    for (const ritual of Object.values(RITUALS)) {
      expect(ritual.durationMs).toBeGreaterThan(0);
      expect(ritual.keys.length > 0).toBe(ritual.quick);
    }
  });

  it('gives no key to two rituals', () => {
    const keys = Object.values(RITUALS).flatMap((ritual) => ritual.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('needs a cushion only for the bow and for sitting', () => {
    expect(
      Object.values(RITUALS)
        .filter((r) => r.needsSeat)
        .map((r) => r.id),
    ).toEqual(['bow', 'sit']);
  });
});

describe('ritualForKey', () => {
  const all = [...RITUAL_IDS];

  it('maps the keys from the spec', () => {
    expect(ritualForKey('Digit3', all)).toBe('greet');
    expect(ritualForKey('Digit1', all)).toBe('bow');
    expect(ritualForKey('KeyE', all)).toBe('bow');
    expect(ritualForKey('Space', all)).toBe('bow');
    expect(ritualForKey('Digit2', all)).toBeNull();
    expect(ritualForKey('KeyL', all)).toBe('lamp');
  });

  it('ignores other keys and rituals the temple does not offer', () => {
    expect(ritualForKey('KeyQ', all)).toBeNull();
    expect(ritualForKey('KeyL', ['greet', 'bow'])).toBeNull();
  });
});

describe('sitting for meditation', () => {
  it('is not a button or a key, and can be held longer than the longest timer', () => {
    expect(RITUALS.sit.quick).toBe(false);
    expect(ritualForKey('Space', ['sit'])).toBeNull();
    const longestTimerMs = Math.max(...DEFAULT_CONFIG.meditation.options) * 60_000;
    expect(RITUALS.sit.durationMs).toBeGreaterThan(longestTimerMs);
  });
});
