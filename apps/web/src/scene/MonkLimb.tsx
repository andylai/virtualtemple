import type { Group } from 'three';
import type { RefObject } from 'react';

const LIMB_SEGMENTS = 8;
const CAP_SEGMENTS = 8;
const FOOT_SCALE: [number, number, number] = [1, 0.5, 1.35];

/** A leg pivot lets the foot swing while the waist bends independently. */
export interface MonkLimbProps {
  /** Which side of the body, as a sign: -1 left, 1 right. */
  side: -1 | 1;
  /** How far from the body's centre line the joint sits, in metres. */
  jointOffsetX: number;
  /** Height of the joint above the figure's local origin (mid-body), in metres. */
  jointY: number;
  length: number;
  radius: number;
  color: string;
  capColor: string;
  capRadius: number;
  /** Set by `AnimatedAvatar` every frame to swing the limb while its owner walks. */
  pivotRef: RefObject<Group | null>;
}

/**
 * A leg of the placeholder monk (`MonkFigure`), hanging from a pivot at the hip so
 * rotating the pivot about X swings the whole limb, as a pendulum, for the walk cycle.
 */
export function MonkLimb({
  side,
  jointOffsetX,
  jointY,
  length,
  radius,
  color,
  capColor,
  capRadius,
  pivotRef,
}: MonkLimbProps) {
  return (
    <group ref={pivotRef} position={[side * jointOffsetX, jointY, 0]}>
      <mesh position={[0, -length / 2, 0]}>
        <cylinderGeometry args={[radius, radius, length, LIMB_SEGMENTS]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -length, 0]} scale={FOOT_SCALE}>
        <sphereGeometry args={[capRadius, CAP_SEGMENTS, CAP_SEGMENTS]} />
        <meshStandardMaterial color={capColor} />
      </mesh>
    </group>
  );
}
