import { RITUALS, type RitualId } from '@temple/shared';

/** How the placeholder avatar's body is shown at one moment of a ritual. */
export interface Pose {
  /** Forward lean in radians (0 upright). */
  pitch: number;
  /** Rise above the floor in metres. */
  lift: number;
  /** Size factor (1 normal). */
  scale: number;
}

export const REST_POSE: Pose = { pitch: 0, lift: 0, scale: 1 };

const GREET_PITCH = 0.35;
const BOW_PITCH = 1.1;
/** Shares of the bow spent going down and coming up; the rest is held. */
const BOW_DOWN_SHARE = 0.25;
const BOW_UP_SHARE = 0.25;
const LAMP_PULSE = 0.25;
/** Sitting lowers the body and leans it a little, settling in over the first moments. */
const SIT_LIFT = -0.22;
const SIT_PITCH = 0.12;
const SIT_SETTLE_MS = 800;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Where the body is during a ritual, as a pure function of time so it can be tested. Real
 * animations will replace these by name; until then the capsule leans, bobs or pulses.
 *
 * @param ritualId - Which ritual.
 * @param elapsedMs - Time since it began.
 * @returns The pose; the resting pose before the start and after the end.
 */
export function ritualPose(ritualId: RitualId, elapsedMs: number): Pose {
  const duration = RITUALS[ritualId].durationMs;
  if (elapsedMs < 0 || elapsedMs >= duration) {
    return REST_POSE;
  }
  const t = elapsedMs / duration;
  switch (RITUALS[ritualId].animation) {
    case 'greet':
      return { ...REST_POSE, pitch: GREET_PITCH * Math.sin(Math.PI * t) };
    case 'bow': {
      const down = smooth(clamp01(t / BOW_DOWN_SHARE));
      const up = smooth(clamp01((1 - t) / BOW_UP_SHARE));
      return { ...REST_POSE, pitch: BOW_PITCH * Math.min(down, up) };
    }
    case 'lamp':
      return { ...REST_POSE, scale: 1 + LAMP_PULSE * Math.sin(Math.PI * t) };
    case 'sit': {
      const settled = smooth(clamp01(elapsedMs / SIT_SETTLE_MS));
      // Adding 0 turns a negative zero into a plain zero.
      return { ...REST_POSE, pitch: SIT_PITCH * settled, lift: SIT_LIFT * settled + 0 };
    }
  }
}
