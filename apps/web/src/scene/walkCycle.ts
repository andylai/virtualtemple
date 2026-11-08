/** How the placeholder monk's arms and legs swing while walking (spec 7, ADR-013 blockout style). */
export interface WalkPose {
  /** Forward swing of the left leg, in radians (positive swings it towards the altar). */
  leftLeg: number;
  /** Forward swing of the right leg, in radians; always the opposite side of `leftLeg`. */
  rightLeg: number;
  /** Forward swing of the left arm, in radians; opposite the left leg, as in a natural gait. */
  leftArm: number;
  /** Forward swing of the right arm, in radians. */
  rightArm: number;
  /** A small twice-per-stride rise, so walking looks like steps and not gliding, in metres. */
  bob: number;
}

export const WALK_REST: WalkPose = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0, bob: 0 };

/** How far a leg swings at full stride, in radians (about 29 degrees each way). */
const LEG_SWING_RAD = 0.5;
/** Arms swing a little less than legs, as a real gait does. */
const ARM_SWING_RAD = 0.4;
/** How high the body rises at the peak of each step, in metres. */
const BOB_HEIGHT_M = 0.02;

/**
 * The limb angles and body rise at one moment of a walk cycle. Arms and legs on opposite sides
 * swing together, as in a natural gait, and the whole swing fades out as `intensity` falls to 0,
 * so starting and stopping walking looks smooth instead of a snap to a fixed pose.
 *
 * @param phase - Where in the stride this moment is, in radians; one full stride is 2π.
 * @param intensity - How much of the swing to show, from 0 (standing still) to 1 (walking).
 */
export function walkCycle(phase: number, intensity: number): WalkPose {
  // Adding 0 turns a negative zero (e.g. a negative sine times a 0 intensity) into a plain zero.
  const swing = Math.sin(phase) * intensity + 0;
  const bob = Math.sin(phase) ** 2 * intensity + 0;
  return {
    leftLeg: LEG_SWING_RAD * swing + 0,
    rightLeg: -LEG_SWING_RAD * swing + 0,
    leftArm: -ARM_SWING_RAD * swing + 0,
    rightArm: ARM_SWING_RAD * swing + 0,
    bob: BOB_HEIGHT_M * bob,
  };
}
