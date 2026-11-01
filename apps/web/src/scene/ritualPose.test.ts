import { RITUALS, RITUAL_IDS } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { REST_POSE, ritualPose } from './ritualPose';

describe('ritualPose', () => {
  it.each(RITUAL_IDS)('%s starts and ends at rest', (id) => {
    const { durationMs } = RITUALS[id];
    expect(ritualPose(id, 0)).toEqual(REST_POSE);
    expect(ritualPose(id, durationMs)).toEqual(REST_POSE);
    expect(ritualPose(id, -50)).toEqual(REST_POSE);
    expect(ritualPose(id, durationMs * 3)).toEqual(REST_POSE);
  });

  it.each(RITUAL_IDS)('%s stays within sensible bounds', (id) => {
    const { durationMs } = RITUALS[id];
    for (let ms = 0; ms < durationMs; ms += 25) {
      const pose = ritualPose(id, ms);
      expect(pose.pitch).toBeGreaterThanOrEqual(0);
      expect(pose.pitch).toBeLessThan(Math.PI / 2 + 0.1);
      expect(pose.lift).toBeGreaterThan(-0.3);
      expect(pose.lift).toBeLessThan(0.2);
      expect(pose.scale).toBeGreaterThanOrEqual(1);
      expect(pose.scale).toBeLessThan(1.5);
    }
  });

  it('leans forward most in the middle of a greeting', () => {
    const d = RITUALS.greet.durationMs;
    expect(ritualPose('greet', d / 2).pitch).toBeGreaterThan(ritualPose('greet', d / 8).pitch);
  });

  it('holds the bow at its deepest in the middle', () => {
    const d = RITUALS.bow.durationMs;
    const deepest = ritualPose('bow', d / 2).pitch;
    expect(deepest).toBeGreaterThan(ritualPose('bow', d * 0.1).pitch);
    expect(ritualPose('bow', d * 0.4).pitch).toBeCloseTo(deepest);
    expect(ritualPose('bow', d * 0.6).pitch).toBeCloseTo(deepest);
  });

  it('pulses for the lamp', () => {
    expect(ritualPose('lamp', RITUALS.lamp.durationMs / 2).scale).toBeGreaterThan(1.2);
  });

  it('lowers and settles for sitting, and stays that way for as long as the sitting lasts', () => {
    const early = ritualPose('sit', 100);
    const settled = ritualPose('sit', 5_000);
    expect(settled.lift).toBeLessThan(early.lift);
    expect(settled.lift).toBeLessThan(-0.15);
    expect(ritualPose('sit', 10 * 60_000)).toEqual(settled);
  });
});
