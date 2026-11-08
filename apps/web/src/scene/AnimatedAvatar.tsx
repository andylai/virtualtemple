import { RITUALS } from '@temple/shared';
import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import type { Group } from 'three';
import type { RitualClock } from '../net/ritualClock';
import { useReducedMotion } from '../prefs/usePreferences';
import { AVATAR_BASE_Y, Avatar, AvatarRing } from './Avatar';
import { poseMonkArm } from './MonkArm';
import { poseMonkRobe, type MonkLimbRefs } from './MonkFigure';
import { WALK_SPEED_MPS } from './movement';
import { REST_POSE, ritualPose } from './ritualPose';
import { WALK_REST, walkCycle, type WalkPose } from './walkCycle';

interface AnimatedAvatarProps {
  playerId: string;
  avatarId: number;
  isSelf?: boolean;
  clock: RitualClock;
}

/** How fast the walk cycle repeats, in strides a second; picked to look brisk, not realistic. */
const STRIDE_RATE_RAD_PER_SEC = 2 * Math.PI * 1.4;
/** How quickly the limb swing fades in or out as walking starts or stops, per second. */
const INTENSITY_RISE_PER_SEC = 10;
/** What `advanceWalk` remembers between frames to tell walking from standing still. */
interface WalkState {
  phase: number;
  intensity: number;
  lastX: number;
  lastZ: number;
  initialized: boolean;
}

/**
 * Turns how far the avatar's owner moved this frame into a limb swing, fading in and out instead
 * of snapping, so it reads as walking even though the server only ever reports a fixed speed.
 * Horizontal movement only: a ritual's vertical lift or lean never looks like walking.
 */
function advanceWalk(
  state: WalkState,
  moverX: number,
  moverZ: number,
  deltaSeconds: number,
  allowed: boolean,
): WalkPose {
  const speed =
    state.initialized && deltaSeconds > 0
      ? Math.hypot(moverX - state.lastX, moverZ - state.lastZ) / deltaSeconds
      : 0;
  state.lastX = moverX;
  state.lastZ = moverZ;
  state.initialized = true;
  const target = allowed ? Math.min(1, speed / WALK_SPEED_MPS) : 0;
  state.intensity +=
    (target - state.intensity) * Math.min(1, INTENSITY_RISE_PER_SEC * deltaSeconds);
  state.phase = (state.phase + STRIDE_RATE_RAD_PER_SEC * deltaSeconds) % (2 * Math.PI);
  return state.intensity > 0.001 ? walkCycle(state.phase, state.intensity) : WALK_REST;
}

/** The straight legs fold forward into the robe while the crossed seat takes their place. */
function poseLeg(ref: RefObject<Group | null>, swing: number, seated: number): void {
  if (ref.current !== null) {
    ref.current.rotation.x = swing * (1 - seated) + (Math.PI / 2) * seated;
    ref.current.scale.setScalar(1 - seated);
    ref.current.visible = seated < 1;
  }
}

/** Pose the lower body together so the hem follows the same seated blend as the legs. */
function poseSeat(refs: MonkLimbRefs, walk: WalkPose, seated: number): void {
  poseLeg(refs.leftLeg, walk.leftLeg, seated);
  poseLeg(refs.rightLeg, walk.rightLeg, seated);
  if (refs.foldedLegs.current !== null) {
    refs.foldedLegs.current.scale.setScalar(seated);
    refs.foldedLegs.current.visible = seated > 0;
  }
  poseMonkRobe(refs.robe.current, seated);
}

/** Keeps displacement history local to a visitor, without rerendering on every step. */
function useWalkState() {
  return useRef<WalkState>({
    phase: 0,
    intensity: 0,
    lastX: 0,
    lastZ: 0,
    initialized: false,
  });
}

/** Hooks belong to the avatar; grouping them keeps the two arm chains symmetrical. */
function useArmRefs() {
  return { upper: useRef<Group>(null), fore: useRef<Group>(null), palm: useRef<Group>(null) };
}

/**
 * An avatar that performs the ritual its owner is doing, and swings its arms and legs while they
 * walk. A bow bends the waist pivot, not the legs; a greeting folds the elbows to meet the palms; walking
 * swings the limb pivots according to `walkCycle`. All read every frame, not from React state.
 */
export function AnimatedAvatar({ playerId, avatarId, isSelf = false, clock }: AnimatedAvatarProps) {
  const pivot = useRef<Group>(null);
  const waist = useRef<Group>(null);
  const robe = useRef<Group>(null);
  const reduceMotion = useReducedMotion();
  const walk = useWalkState();
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const foldedLegs = useRef<Group>(null);
  const leftArm = useArmRefs();
  const rightArm = useArmRefs();
  const limbRefs = { waist, robe, leftLeg, rightLeg, foldedLegs, leftArm, rightArm };

  useFrame((_state, delta) => {
    const run = clock.get(playerId);
    const still = run === undefined;
    const elapsed = run === undefined ? 0 : performance.now() - run.startedAtMs;
    const pose = still
      ? REST_POSE
      : ritualPose(run.ritualId, reduceMotion ? RITUALS[run.ritualId].durationMs / 2 : elapsed);

    const mover = pivot.current?.parent;
    const walkPose =
      mover !== null && mover !== undefined
        ? advanceWalk(
            walk.current,
            mover.position.x,
            mover.position.z,
            delta,
            still && !reduceMotion,
          )
        : WALK_REST;
    if (pivot.current !== null) {
      pivot.current.position.y = -AVATAR_BASE_Y + pose.lift + walkPose.bob;
      pivot.current.scale.setScalar(reduceMotion ? 1 : pose.scale);
    }
    if (waist.current !== null) {
      waist.current.rotation.x = -pose.waistPitch;
    }
    poseSeat(limbRefs, walkPose, pose.seated);
    poseMonkArm(leftArm, -1, pose.handsTogether, walkPose.leftArm, pose.seated);
    poseMonkArm(rightArm, 1, pose.handsTogether, walkPose.rightArm, pose.seated);
  });
  return (
    <>
      {isSelf && <AvatarRing />}
      <group ref={pivot} position={[0, -AVATAR_BASE_Y, 0]}>
        <group position={[0, AVATAR_BASE_Y, 0]}>
          <Avatar avatarId={avatarId} limbRefs={limbRefs} />
        </group>
      </group>
    </>
  );
}
