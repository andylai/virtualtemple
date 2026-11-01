import { describe, expect, it } from 'vitest';
import { clockOffset, planChant } from './chantPlanner';

const session = { startAtMs: 1_000_000, durationMs: 300_000 };
const RECORDING_SEC = 120;

describe('planChant', () => {
  it('waits until the start, and says for how long', () => {
    expect(planChant(session, 940_000, RECORDING_SEC)).toEqual({
      state: 'waiting',
      startInMs: 60_000,
    });
  });

  it('starts at the beginning of the recording exactly at the start', () => {
    expect(planChant(session, 1_000_000, RECORDING_SEC)).toEqual({
      state: 'playing',
      offsetSec: 0,
      endsInMs: 300_000,
    });
  });

  it('starts further in for someone who is late or joined in the middle', () => {
    expect(planChant(session, 1_030_000, RECORDING_SEC)).toMatchObject({
      state: 'playing',
      offsetSec: 30,
    });
  });

  it('repeats a recording that is shorter than the session', () => {
    const plan = planChant(session, 1_000_000 + 250_000, RECORDING_SEC);
    expect(plan).toMatchObject({ state: 'playing', offsetSec: 10, endsInMs: 50_000 });
  });

  it('is over at the end of the session', () => {
    expect(planChant(session, 1_299_999, RECORDING_SEC).state).toBe('playing');
    expect(planChant(session, 1_300_000, RECORDING_SEC)).toEqual({ state: 'ended' });
  });

  it('puts two browsers at the same place in the recording even when started at different moments', () => {
    const early = planChant(session, 1_040_000, RECORDING_SEC);
    const late = planChant(session, 1_070_000, RECORDING_SEC);
    expect(early).toMatchObject({ offsetSec: 40 });
    expect(late).toMatchObject({ offsetSec: 70 });
  });
});

describe('clockOffset', () => {
  it('is how much to add to the local time to get the server time', () => {
    expect(clockOffset(5_000, 4_200)).toBe(800);
    expect(clockOffset(5_000, 6_000)).toBe(-1_000);
  });
});
