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
      expect(pose.waistPitch).toBeGreaterThanOrEqual(0);
      expect(pose.waistPitch).toBeLessThan(Math.PI / 2 + 0.1);
      expect(pose.lift).toBeGreaterThan(-0.3);
      expect(pose.lift).toBeLessThan(0.2);
      expect(pose.scale).toBeGreaterThanOrEqual(1);
      expect(pose.scale).toBeLessThan(1.5);
      expect(pose.handsTogether).toBeGreaterThanOrEqual(0);
      expect(pose.handsTogether).toBeLessThanOrEqual(1);
    }
  });

  it('brings the hands together and holds the greeting', () => {
    const d = RITUALS.greet.durationMs;
    expect(ritualPose('greet', d / 2).handsTogether).toBeCloseTo(1);
    expect(ritualPose('greet', d / 2).waistPitch).toBe(0);
    expect(ritualPose('greet', d * 0.35).handsTogether).toBe(1);
    expect(ritualPose('greet', d * 0.65).handsTogether).toBe(1);
    expect(ritualPose('greet', d / 8).handsTogether).toBeGreaterThan(0);
    expect(ritualPose('greet', d / 8).handsTogether).toBeLessThan(1);
  });

  it('holds the bow at its deepest in the middle, bent only at the waist', () => {
    const d = RITUALS.bow.durationMs;
    const deepest = ritualPose('bow', d / 2).waistPitch;
    expect(deepest).toBeGreaterThan(ritualPose('bow', d * 0.1).waistPitch);
    expect(ritualPose('bow', d * 0.4).waistPitch).toBeCloseTo(deepest);
    expect(ritualPose('bow', d * 0.6).waistPitch).toBeCloseTo(deepest);
    expect(deepest).toBeCloseTo(Math.PI / 4);
    expect(ritualPose('bow', d / 2).handsTogether).toBe(1);
  });

  it('pulses for the lamp', () => {
    expect(ritualPose('lamp', RITUALS.lamp.durationMs / 2).scale).toBeGreaterThan(1.2);
  });

  it('folds the legs into a held seat for the meditation timer', () => {
    const early = ritualPose('sit', 100);
    const settled = ritualPose('sit', 5_000);
    expect(early.seated).toBeGreaterThan(0);
    expect(early.seated).toBeLessThan(1);
    expect(settled.seated).toBe(1);
    expect(settled.lift).toBeLessThan(early.lift);
    expect(settled.lift).toBeLessThan(-0.15);
    expect(ritualPose('sit', 10 * 60_000)).toEqual(settled);
  });
});
