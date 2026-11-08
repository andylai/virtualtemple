import type { RefObject } from 'react';
import { Group, Vector3 } from 'three';
import { MONK_SKIN_COLOR } from './monkColors';

/** Independent bone pivots keep shoulders fixed while elbows fold into a greeting. */
export interface MonkArmRefs {
  upper: RefObject<Group | null>;
  fore: RefObject<Group | null>;
  palm: RefObject<Group | null>;
}

const SHOULDER_X = 0.205;
const SHOULDER_Y = 0.29;
const ELBOW_X = 0.245;
const ELBOW_Y = 0.105;
const WRIST_X = 0.26;
const WRIST_Y = -0.075;
const GREET_ELBOW_X = 0.205;
const GREET_ELBOW_Z = -0.13;
const GREET_WRIST_X = 0.025;
const GREET_WRIST_Y = 0.23;
const GREET_WRIST_Z = -0.265;
const SIT_ELBOW_X = 0.235;
const SIT_ELBOW_Z = -0.08;
const SIT_WRIST_X = 0.095;
const SIT_WRIST_Y = 0.015;
const SIT_WRIST_Z = -0.24;
const SLEEVE_RADIUS = 0.065;
const SLEEVE_CUFF_RADIUS = 0.075;
const PALM_RADIUS = 0.05;
const PALM_SCALE: [number, number, number] = [0.5, 1.4, 0.8];
const SEGMENTS = 10;
const DOWN = new Vector3(0, -1, 0);
const shoulder = new Vector3();
const elbow = new Vector3();
const wrist = new Vector3();
const direction = new Vector3();

/** Positions a unit sleeve between two joints without stretching the hands themselves. */
function placeSleeve(group: Group | null, start: Vector3, end: Vector3): void {
  if (group === null) return;
  direction.subVectors(end, start);
  group.position.copy(start);
  group.scale.y = direction.length();
  group.quaternion.setFromUnitVectors(DOWN, direction.normalize());
}

/** Poses both sleeves and an upright palm; front is -Z throughout the placeholder rig. */
export function poseMonkArm(
  refs: MonkArmRefs,
  side: -1 | 1,
  together: number,
  swing: number,
  seated = 0,
): void {
  const loose = 1 - together - seated;
  shoulder.set(side * SHOULDER_X, SHOULDER_Y, 0);
  elbow.set(
    side * (ELBOW_X * loose + GREET_ELBOW_X * together + SIT_ELBOW_X * seated),
    ELBOW_Y,
    GREET_ELBOW_Z * together + SIT_ELBOW_Z * seated,
  );
  wrist.set(
    side * (WRIST_X * loose + GREET_WRIST_X * together + SIT_WRIST_X * seated),
    WRIST_Y * loose + GREET_WRIST_Y * together + SIT_WRIST_Y * seated,
    GREET_WRIST_Z * together + SIT_WRIST_Z * seated,
  );
  // Rotate the relaxed chain around its shoulder, then blend into the still greeting.
  for (const joint of [elbow, wrist]) {
    const y = joint.y - SHOULDER_Y;
    const z = joint.z;
    joint.y = SHOULDER_Y + y * Math.cos(swing * loose) - z * Math.sin(swing * loose);
    joint.z = y * Math.sin(swing * loose) + z * Math.cos(swing * loose);
  }
  placeSleeve(refs.upper.current, shoulder, elbow);
  placeSleeve(refs.fore.current, elbow, wrist);
  refs.palm.current?.position.copy(wrist);
  if (refs.palm.current !== null)
    refs.palm.current.rotation.x = swing * loose + (Math.PI / 2) * seated;
}

/** Rounded sleeves and flattened palms make the prayer gesture readable from the hall camera. */
export function MonkArm({ refs, robe }: { refs: MonkArmRefs; robe: string }) {
  return (
    <>
      {[refs.upper, refs.fore].map((ref, index) => (
        <group ref={ref} key={index}>
          <mesh position={[0, -0.5, 0]}>
            <cylinderGeometry args={[SLEEVE_RADIUS, SLEEVE_CUFF_RADIUS, 1, SEGMENTS]} />
            <meshStandardMaterial color={robe} roughness={1} />
          </mesh>
        </group>
      ))}
      <group ref={refs.palm}>
        <mesh scale={PALM_SCALE}>
          <sphereGeometry args={[PALM_RADIUS, SEGMENTS, SEGMENTS]} />
          <meshStandardMaterial color={MONK_SKIN_COLOR} roughness={1} />
        </mesh>
      </group>
    </>
  );
}
