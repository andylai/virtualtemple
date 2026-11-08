import { describe, expect, it } from 'vitest';
import { WALK_REST, walkCycle } from './walkCycle';

const QUARTER_TURN = Math.PI / 2;
const FULL_TURN = Math.PI * 2;

describe('walkCycle', () => {
  it('is at rest when intensity is 0, at any phase', () => {
    expect(walkCycle(0, 0)).toEqual(WALK_REST);
    expect(walkCycle(QUARTER_TURN, 0)).toEqual(WALK_REST);
    expect(walkCycle(3, 0)).toEqual(WALK_REST);
  });

  it('swings legs and arms on the same side opposite each other', () => {
    const pose = walkCycle(QUARTER_TURN, 1);
    expect(pose.leftLeg).toBeGreaterThan(0);
    expect(pose.leftArm).toBeLessThan(0);
    expect(pose.rightLeg).toBeLessThan(0);
    expect(pose.rightArm).toBeGreaterThan(0);
  });

  it('mirrors left and right at every phase', () => {
    for (let phase = 0; phase < FULL_TURN; phase += 0.3) {
      const pose = walkCycle(phase, 1);
      expect(pose.leftLeg).toBeCloseTo(-pose.rightLeg);
      expect(pose.leftArm).toBeCloseTo(-pose.rightArm);
    }
  });

  it('never bows or dips the body, only rises', () => {
    for (let phase = 0; phase < FULL_TURN; phase += 0.2) {
      expect(walkCycle(phase, 1).bob).toBeGreaterThanOrEqual(0);
    }
  });

  it('repeats every full stride', () => {
    // A full turn later lands on the same point of the cycle, up to the floating-point error of
    // adding 2π to the phase, so each field is compared loosely rather than with toEqual.
    const phase = 1.1;
    const once = walkCycle(phase, 1);
    const again = walkCycle(phase + FULL_TURN, 1);
    for (const key of Object.keys(once) as (keyof typeof once)[]) {
      expect(again[key]).toBeCloseTo(once[key]);
    }
  });

  it('scales down smoothly as intensity falls, without changing direction', () => {
    const full = walkCycle(QUARTER_TURN, 1);
    const half = walkCycle(QUARTER_TURN, 0.5);
    expect(half.leftLeg).toBeCloseTo(full.leftLeg / 2);
    expect(half.bob).toBeCloseTo(full.bob / 2);
  });
});
