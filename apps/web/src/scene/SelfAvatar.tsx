import { useFrame } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Group } from 'three';
import type { RitualClock } from '../net/ritualClock';
import { AnimatedAvatar } from './AnimatedAvatar';
import { AVATAR_BASE_Y } from './Avatar';
import { keyIsForControl } from '../ui/keyTargets';
import { FORWARD_ON_FLOOR } from './framing';
import {
  NO_KEYS,
  WALK_SPEED_MPS,
  facingFromDirection,
  keyDirection,
  planStep,
  type HeldKeys,
} from './movement';
import { acrossView, reportSelfAcross } from './selfView';

const MS_PER_SECOND = 1000;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** A place the hall put the visitor at, for example on their cushion. */
export type Snap = Point & { facing: number };

interface SelfAvatarProps {
  /** Where the visitor starts, from the server's welcome. */
  start: Snap;
  playerId: string;
  avatarId: number;
  ritualClock: RitualClock;
  walkableArea: readonly Point[];
  /** How many times a second the position may be sent. */
  sendHz: number;
  /** Sends the visitor's position to the hall. */
  onMove: (x: number, z: number, facing: number) => void;
  /** Called when the visitor starts walking with the keyboard. */
  onKeyMove: () => void;
  /** Where a click on the floor or a cushion asked the visitor to walk, or null. */
  walkTarget: MutableRefObject<Point | null>;
  /** Set by the interface to put the visitor exactly somewhere; taken (and cleared) on the next frame. */
  snap: MutableRefObject<Snap | null>;
}

/** What changes from frame to frame while the visitor walks. */
interface Motion {
  position: Point;
  facing: number;
  unsent: boolean;
  sinceSendMs: number;
  keysWereHeld: boolean;
}

interface FrameContext extends Omit<
  SelfAvatarProps,
  'start' | 'playerId' | 'avatarId' | 'ritualClock'
> {
  motion: Motion;
  held: HeldKeys;
  group: Group | null;
  deltaSeconds: number;
}

/** Keeps `held` up to date with the movement keys, ignoring keys meant for a dialog or form field. */
function useHeldKeys(): MutableRefObject<HeldKeys> {
  const held = useRef<HeldKeys>({ ...NO_KEYS });
  useEffect(() => {
    const set = (event: KeyboardEvent, down: boolean) => {
      const direction = keyDirection(event.code);
      // A key let go is always noticed, so a key held while a panel opened cannot stay stuck.
      if (direction === null || (down && keyIsForControl(event.target, event.code))) {
        return;
      }
      held.current[direction] = down;
      event.preventDefault();
    };
    const down = (event: KeyboardEvent) => set(event, true);
    const up = (event: KeyboardEvent) => set(event, false);
    const release = () => {
      held.current = { ...NO_KEYS };
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);
  return held;
}

/** Puts the visitor where the hall asked, and forgets any walk in progress. */
function takeSnap(context: FrameContext): void {
  const spot = context.snap.current;
  if (spot !== null) {
    context.motion.position = { x: spot.x, z: spot.z };
    context.motion.facing = spot.facing;
    context.motion.unsent = false;
    context.walkTarget.current = null;
    context.snap.current = null;
  }
}

/** One frame of the visitor's walking: step, draw, and report to the hall. */
function advance(context: FrameContext): void {
  const { motion, held, group, deltaSeconds } = context;
  takeSnap(context);
  const keysHeld = held.forward || held.back || held.left || held.right;
  if (keysHeld && !motion.keysWereHeld) {
    context.onKeyMove();
  }
  motion.keysWereHeld = keysHeld;
  const input = {
    keys: held,
    cameraForward: FORWARD_ON_FLOOR,
    target: context.walkTarget.current,
  };
  const { next, target } = planStep(
    motion.position,
    input,
    context.walkableArea,
    WALK_SPEED_MPS * deltaSeconds,
  );
  context.walkTarget.current = target;
  if (next.x !== motion.position.x || next.z !== motion.position.z) {
    motion.facing = facingFromDirection(next.x - motion.position.x, next.z - motion.position.z);
    motion.position = next;
    motion.unsent = true;
  }
  group?.position.set(motion.position.x, AVATAR_BASE_Y, motion.position.z);
  group?.rotation.set(0, -motion.facing * DEGREES_TO_RADIANS, 0);
  motion.sinceSendMs += deltaSeconds * MS_PER_SECOND;
  if (motion.unsent && motion.sinceSendMs >= MS_PER_SECOND / context.sendHz) {
    context.onMove(motion.position.x, motion.position.z, motion.facing);
    motion.unsent = false;
    motion.sinceSendMs = 0;
  }
}

/**
 * The visitor's own avatar. It moves at once, from the keyboard or a click on the floor, and
 * reports its position to the hall at most `sendHz` times a second. The camera does not move:
 * the whole hall is always in view.
 */
export function SelfAvatar(props: SelfAvatarProps) {
  const { start, playerId, avatarId, ritualClock } = props;
  const group = useRef<Group>(null);
  const motion = useRef<Motion>({
    position: { x: start.x, z: start.z },
    facing: start.facing,
    unsent: false,
    sinceSendMs: 0,
    keysWereHeld: false,
  });
  const held = useHeldKeys();

  useFrame(({ camera }, deltaSeconds) => {
    advance({
      ...props,
      motion: motion.current,
      held: held.current,
      group: group.current,
      deltaSeconds,
    });
    // The closer view slides sideways to keep the visitor in sight (ADR-049).
    reportSelfAcross(acrossView(motion.current.position, camera));
  });

  return (
    <group ref={group} position={[start.x, AVATAR_BASE_Y, start.z]}>
      <AnimatedAvatar playerId={playerId} avatarId={avatarId} isSelf clock={ritualClock} />
    </group>
  );
}
