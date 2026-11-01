import type { PlayerView } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { INITIAL_HALL_STATE, type HallState } from '../net/hallState';
import { observe } from './useMeditation';
import {
  REQUEST_GRACE_MS,
  formatClock,
  remainingMs,
  requestSession,
  stepMeditation,
  type Observation,
} from './session';

const MINUTE = 60_000;
const seen = (overrides: Partial<Observation> = {}): Observation => ({
  seated: false,
  walking: false,
  refused: false,
  ...overrides,
});

describe('requestSession', () => {
  it('makes a timer of the right length that has not started', () => {
    expect(requestSession(10, 5_000)).toEqual({
      durationMs: 10 * MINUTE,
      requestedAtMs: 5_000,
      startedAtMs: null,
    });
  });
});

describe('stepMeditation', () => {
  const requested = requestSession(5, 0);

  it('keeps waiting while the visitor walks to the cushion', () => {
    const step = stepMeditation(requested, seen({ walking: true }), 20_000);
    expect(step).toEqual({ session: requested, finished: false });
  });

  it('starts the clock the moment the visitor is seated', () => {
    const step = stepMeditation(requested, seen({ seated: true }), 4_000);
    expect(step.session).toEqual({ ...requested, startedAtMs: 4_000 });
  });

  it('drops a request that never turned into walking or sitting', () => {
    expect(stepMeditation(requested, seen(), REQUEST_GRACE_MS).session).toBe(requested);
    expect(stepMeditation(requested, seen(), REQUEST_GRACE_MS + 1).session).toBeNull();
  });

  it('drops the request when the hall had no cushion', () => {
    expect(stepMeditation(requested, seen({ refused: true }), 100)).toEqual({
      session: null,
      finished: false,
    });
  });

  const running = { ...requested, startedAtMs: 1_000 };

  it('keeps running while seated and the time is not up, returning the same object', () => {
    const step = stepMeditation(running, seen({ seated: true }), 1_000 + 5 * MINUTE - 1);
    expect(step.session).toBe(running);
    expect(step.finished).toBe(false);
  });

  it('finishes exactly when the time is up, even if the tab was asleep for longer', () => {
    expect(stepMeditation(running, seen({ seated: true }), 1_000 + 5 * MINUTE)).toEqual({
      session: null,
      finished: true,
    });
    expect(stepMeditation(running, seen({ seated: true }), 1_000 + 40 * MINUTE).finished).toBe(
      true,
    );
  });

  it('ends without finishing when the visitor stands up or is moved off the cushion', () => {
    expect(stepMeditation(running, seen(), 60_000)).toEqual({ session: null, finished: false });
    expect(stepMeditation(running, seen({ walking: true }), 60_000)).toEqual({
      session: null,
      finished: false,
    });
  });
});

describe('remainingMs', () => {
  it('is the whole time until the visitor has sat down, then counts down to zero', () => {
    const session = { ...requestSession(5, 0), startedAtMs: null };
    expect(remainingMs(session, 10_000)).toBe(5 * MINUTE);
    const running = { ...session, startedAtMs: 1_000 };
    expect(remainingMs(running, 1_000 + 2 * MINUTE)).toBe(3 * MINUTE);
    expect(remainingMs(running, 1_000 + 9 * MINUTE)).toBe(0);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds, rounding up so 00:00 only appears at the very end', () => {
    expect(formatClock(5 * MINUTE)).toBe('05:00');
    expect(formatClock(4 * MINUTE + 7_000)).toBe('04:07');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-50)).toBe('00:00');
    expect(formatClock(15 * MINUTE)).toBe('15:00');
  });
});

describe('observe', () => {
  const me = 'me-xxxxxxxx';
  const person = (ritual: PlayerView['ritual']) => ({
    id: me,
    nickname: { adjectiveId: 'calm', nounId: 'lotus' },
    avatarId: 0,
    x: 0,
    z: 0,
    facing: 0,
    ritual,
  });
  const state = (overrides: Partial<HallState>): HallState => ({
    ...INITIAL_HALL_STATE,
    selfId: me,
    ...overrides,
  });

  it('is seated only when sitting on a cushion, and not for a bow', () => {
    const sitting = state({
      players: new Map([[me, person({ ritualId: 'sit', slotId: 'cushion-1' })]]),
    });
    const bowing = state({
      players: new Map([[me, person({ ritualId: 'bow', slotId: 'cushion-1' })]]),
    });
    expect(observe(sitting).seated).toBe(true);
    expect(observe(bowing).seated).toBe(false);
    expect(observe(INITIAL_HALL_STATE).seated).toBe(false);
  });

  it('is walking when the hall told the visitor to walk to a cushion', () => {
    expect(observe(state({ walk: { slotId: 'cushion-1', x: 1, z: 2, facing: 0 } })).walking).toBe(
      true,
    );
    expect(observe(state({})).walking).toBe(false);
  });

  it('is refused only when the hall had no cushion for sitting', () => {
    expect(
      observe(state({ ritualNotice: { code: 'no_slot_free', ritualId: 'sit' } })).refused,
    ).toBe(true);
    expect(
      observe(state({ ritualNotice: { code: 'no_slot_free', ritualId: 'bow' } })).refused,
    ).toBe(false);
  });
});
