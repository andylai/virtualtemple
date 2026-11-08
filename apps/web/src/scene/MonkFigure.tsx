import type { Group } from 'three';
import type { RefObject } from 'react';
import { MonkArm, type MonkArmRefs } from './MonkArm';
import { MonkLimb } from './MonkLimb';
import { MONK_DARK_COLOR, MONK_SKIN_COLOR, monkColors } from './monkColors';

/** Where `AnimatedAvatar` moves the monk for the walk cycle and for rituals (`walkCycle.ts`, `ritualPose.ts`). */
export interface MonkLimbRefs {
  /** The torso, arms and head, so a bow bends only this and leaves the legs planted. */
  waist: RefObject<Group | null>;
  /** The shoulder-anchored robe gathers up over the legs when seated. */
  robe: RefObject<Group | null>;
  leftLeg: RefObject<Group | null>;
  rightLeg: RefObject<Group | null>;
  /** The robe over the folded legs widens the silhouette as the visitor sits. */
  foldedLegs: RefObject<Group | null>;
  leftArm: MonkArmRefs;
  rightArm: MonkArmRefs;
}

// Heights below WAIST are in the figure's own local space, where 0 is mid-body (AVATAR_BASE_Y's
// envelope, Avatar.tsx); heights with a _REL suffix are relative to the waist pivot instead.
const WAIST_Y = -0.18;
const ROBE_TOP_Y_REL = 0.34;
const SEATED_HEM_Y_REL = -0.12;
const ROBE_TOP_RADIUS = 0.185;
const ROBE_BOTTOM_RADIUS = 0.265;
const NECK_RADIUS = 0.08;
const NECK_HEIGHT = 0.045;
const HEAD_RADIUS = 0.225;
const HEAD_Y_REL = ROBE_TOP_Y_REL + NECK_HEIGHT + HEAD_RADIUS;
const EYE_RADIUS = 0.018;
const EYE_OFFSET_X = 0.07;
const EYE_Z = -HEAD_RADIUS * 0.94;
const COLLAR_TUBE = 0.009;
const BODY_SEGMENTS = 16;
const HEAD_SEGMENTS = 20;

const LEG_JOINT_Y = WAIST_Y;
const FIGURE_FLOOR_Y = -0.6;
const FOOT_HALF_HEIGHT = 0.045;
const LEG_LENGTH = LEG_JOINT_Y - (FIGURE_FLOOR_Y + FOOT_HALF_HEIGHT);
const STANDING_HEM_Y_REL = -LEG_LENGTH / 2;
const ROBE_LENGTH = ROBE_TOP_Y_REL - STANDING_HEM_Y_REL;
const SEATED_ROBE_SCALE = (ROBE_TOP_Y_REL - SEATED_HEM_Y_REL) / ROBE_LENGTH;

/** Keep the hem at the knee when upright and above the cushion while seated. */
export function poseMonkRobe(robe: Group | null, seated: number): void {
  if (robe !== null) robe.scale.y = 1 + (SEATED_ROBE_SCALE - 1) * seated;
}

/** The torso: robe, collar, neck and head, grouped so `MonkFigure` can nest it under the waist pivot. */
function MonkTorso({
  robe,
  trim,
  robeRef,
}: {
  robe: string;
  trim: string;
  robeRef: RefObject<Group | null>;
}) {
  return (
    <>
      <group ref={robeRef} position={[0, ROBE_TOP_Y_REL, 0]}>
        <mesh position={[0, -ROBE_LENGTH / 2, 0]}>
          <cylinderGeometry
            args={[ROBE_TOP_RADIUS, ROBE_BOTTOM_RADIUS, ROBE_LENGTH, BODY_SEGMENTS]}
          />
          <meshStandardMaterial color={robe} />
        </mesh>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROBE_TOP_Y_REL, 0]}>
        <torusGeometry args={[ROBE_TOP_RADIUS, COLLAR_TUBE, BODY_SEGMENTS, BODY_SEGMENTS]} />
        <meshStandardMaterial color={trim} />
      </mesh>
      <mesh position={[0, ROBE_TOP_Y_REL + NECK_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[NECK_RADIUS, NECK_RADIUS, NECK_HEIGHT, BODY_SEGMENTS]} />
        <meshStandardMaterial color={MONK_SKIN_COLOR} />
      </mesh>
      <mesh position={[0, HEAD_Y_REL, 0]}>
        <sphereGeometry args={[HEAD_RADIUS, HEAD_SEGMENTS, HEAD_SEGMENTS]} />
        <meshStandardMaterial color={MONK_SKIN_COLOR} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * EYE_OFFSET_X, HEAD_Y_REL, EYE_Z]}>
          <sphereGeometry args={[EYE_RADIUS, 8, 8]} />
          <meshStandardMaterial color={MONK_DARK_COLOR} />
        </mesh>
      ))}
    </>
  );
}

const FOLDED_LEGS = {
  y: WAIST_Y - 0.025,
  z: -0.08,
  kneeX: 0.16,
  kneeZ: -0.045,
  kneeScale: [0.225, 0.088, 0.19] as [number, number, number],
  kneeTurn: 0.32,
  footX: 0.07,
  footZ: -0.21,
  footY: -0.026,
  footScale: [0.103, 0.046, 0.072] as [number, number, number],
};

/** Rounded robe folds and tucked slippers read as a cross-legged seat from the fixed camera. */
function FoldedLegs({ robe, pivotRef }: { robe: string; pivotRef: RefObject<Group | null> }) {
  const shape = FOLDED_LEGS;
  return (
    <group ref={pivotRef} position={[0, shape.y, shape.z]} scale={0} visible={false}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * shape.kneeX, 0, shape.kneeZ]}
            scale={shape.kneeScale}
            rotation={[0, side * shape.kneeTurn, 0]}
          >
            <sphereGeometry args={[1, BODY_SEGMENTS, BODY_SEGMENTS]} />
            <meshStandardMaterial color={robe} />
          </mesh>
          <mesh position={[side * shape.footX, shape.footY, shape.footZ]} scale={shape.footScale}>
            <sphereGeometry args={[1, BODY_SEGMENTS, BODY_SEGMENTS]} />
            <meshStandardMaterial color={MONK_DARK_COLOR} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The placeholder monk that stands for a visitor until the manifest names a real model
 * (ADR-034). The legs hang from the figure's own root, so they stay planted; the robe, head and
 * arms hang from a separate waist pivot, so a bow bends the torso without moving the feet.
 */
export function MonkFigure({ avatarId, limbRefs }: { avatarId: number; limbRefs: MonkLimbRefs }) {
  const { robe, trim } = monkColors(avatarId);
  const legProps = {
    length: LEG_LENGTH,
    radius: 0.07,
    color: MONK_SKIN_COLOR,
    capColor: MONK_DARK_COLOR,
    capRadius: 0.09,
    jointY: LEG_JOINT_Y,
    jointOffsetX: 0.115,
  };
  return (
    <>
      <MonkLimb side={-1} pivotRef={limbRefs.leftLeg} {...legProps} />
      <MonkLimb side={1} pivotRef={limbRefs.rightLeg} {...legProps} />
      <FoldedLegs robe={robe} pivotRef={limbRefs.foldedLegs} />
      <group ref={limbRefs.waist} position={[0, WAIST_Y, 0]}>
        <MonkTorso robe={robe} trim={trim} robeRef={limbRefs.robe} />
        <MonkArm refs={limbRefs.leftArm} robe={robe} />
        <MonkArm refs={limbRefs.rightArm} robe={robe} />
      </group>
    </>
  );
}
