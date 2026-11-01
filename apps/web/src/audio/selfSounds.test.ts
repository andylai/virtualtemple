import type { PlayerView } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { INITIAL_HALL_STATE, type HallState } from '../net/hallState';
import { selfSounds, soundSnapshot, type SoundSnapshot } from './selfSounds';

const snap = (bowing: boolean, lamps: string[] = []): SoundSnapshot => ({
  bowing,
  ownLamps: new Set(lamps),
});

describe('selfSounds', () => {
  it('rings the bell when the bow begins, and not while it goes on', () => {
    expect(selfSounds(snap(false), snap(true))).toEqual(['bell']);
    expect(selfSounds(snap(true), snap(true))).toEqual([]);
    expect(selfSounds(snap(true), snap(false))).toEqual([]);
  });

  it('chimes when a lamp of the visitor is lit, and not when one goes out', () => {
    expect(selfSounds(snap(false), snap(false, ['lamp-1']))).toEqual(['lamp']);
    expect(selfSounds(snap(false, ['lamp-1']), snap(false, ['lamp-1']))).toEqual([]);
    expect(selfSounds(snap(false, ['lamp-1']), snap(false))).toEqual([]);
  });

  it('can do both at once', () => {
    expect(selfSounds(snap(false), snap(true, ['lamp-2']))).toEqual(['bell', 'lamp']);
  });
});

describe('soundSnapshot', () => {
  const person = (id: string, ritual: PlayerView['ritual']) => ({
    id,
    nickname: { adjectiveId: 'calm', nounId: 'lotus' },
    avatarId: 0,
    x: 0,
    z: 0,
    facing: 0,
    ritual,
  });
  const state: HallState = {
    ...INITIAL_HALL_STATE,
    selfId: 'me-xxxxxxxx',
    players: new Map([
      ['me-xxxxxxxx', person('me-xxxxxxxx', { ritualId: 'bow', slotId: 'cushion-1' })],
      ['you-xxxxxxx', person('you-xxxxxxx', { ritualId: 'bow', slotId: 'cushion-2' })],
    ]),
    lamps: new Map([
      ['lamp-1', 'me-xxxxxxxx'],
      ['lamp-2', 'you-xxxxxxx'],
    ]),
  };

  it('looks only at the visitor, not at other people', () => {
    expect(soundSnapshot(state)).toEqual({ bowing: true, ownLamps: new Set(['lamp-1']) });
  });

  it('is quiet before the visitor is in the hall, and while they are only walking to a cushion', () => {
    expect(soundSnapshot(INITIAL_HALL_STATE)).toEqual({ bowing: false, ownLamps: new Set() });
    const walking = {
      ...state,
      players: new Map([['me-xxxxxxxx', person('me-xxxxxxxx', { ritualId: 'greet' })]]),
    };
    expect(soundSnapshot(walking).bowing).toBe(false);
  });
});
