import { useFrame, useThree } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Vector3, type Camera, type Group } from 'three';
import { AVATAR_BASE_Y, Avatar } from './Avatar';
import {
  NO_KEYS,
  WALK_SPEED_MPS,
  facingFromDirection,
  keyDirection,
  planStep,
  type HeldKeys,
} from './movement';

const MS_PER_SECOND = 1000;
const DEGREES_TO_RADIANS = Math.PI / 180;
/** Share of the remaining distance the camera closes each frame when following (0 to 1). */
const CAMERA_FOLLOW = 0.15;

type OrbitTarget = { target: Vector3 } | null;
const scratch = new Vector3();

interface SelfAvatarProps {
  /** Where the visitor starts, from the server's welcome. */
  start: Point & { facing: number };
  avatarId: number;
  walkableArea: readonly Point[];
  /** How many times a second the position may be sent. */
  sendHz: number;
  /** Sends the visitor's position to the hall. */
  onMove: (x: number, z: number, facing: number) => void;
  /** Where a click on the floor asked the visitor to walk, or null. */
  walkTarget: MutableRefObject<Point | null>;
}

/** Keeps `held` up to date with the movement keys, ignoring typing in form fields. */
function useHeldKeys(): MutableRefObject<HeldKeys> {
  const held = useRef<HeldKeys>({ ...NO_KEYS });
  useEffect(() => {
    const set = (event: KeyboardEvent, down: boolean) => {
      const direction = keyDirection(event.code);
      const target = event.target as HTMLElement | null;
      if (direction === null || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
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

/** Moves the orbit target (and the camera with it) part of the way towards a point. */
function followWithCamera(controls: OrbitTarget, camera: Camera, point: Point): void {
  if (controls !== null) {
    scratch.set(point.x, 0, point.z).sub(controls.target).multiplyScalar(CAMERA_FOLLOW);
    controls.target.add(scratch);
    camera.position.add(scratch);
  }
}

/**
 * The visitor's own avatar. It moves at once, from the keyboard or a click on the floor, and
 * reports its position to the hall at most `sendHz` times a second. The camera follows it.
 */
export function SelfAvatar({
  start,
  avatarId,
  walkableArea,
  sendHz,
  onMove,
  walkTarget,
}: SelfAvatarProps) {
  const group = useRef<Group>(null);
  const position = useRef<Point>({ x: start.x, z: start.z });
  const facing = useRef(start.facing);
  const unsent = useRef(false);
  const sinceSendMs = useRef(0);
  const held = useHeldKeys();
  const controls = useThree((state) => state.controls) as OrbitTarget;

  const camera = useThree((state) => state.camera);

  // On arrival the view moves to the visitor as a whole, so the camera keeps its angle.
  useEffect(() => {
    if (controls !== null) {
      scratch.set(start.x, 0, start.z).sub(controls.target);
      controls.target.add(scratch);
      camera.position.add(scratch);
    }
  }, [controls, camera, start.x, start.z]);

  useFrame(({ camera }, deltaSeconds) => {
    const cameraForward = controls
      ? { x: controls.target.x - camera.position.x, z: controls.target.z - camera.position.z }
      : { x: 0, z: -1 };
    const reach = WALK_SPEED_MPS * deltaSeconds;
    const input = { keys: held.current, cameraForward, target: walkTarget.current };
    const { next, target } = planStep(position.current, input, walkableArea, reach);
    walkTarget.current = target;
    if (next.x !== position.current.x || next.z !== position.current.z) {
      facing.current = facingFromDirection(
        next.x - position.current.x,
        next.z - position.current.z,
      );
      position.current = next;
      unsent.current = true;
    }
    group.current?.position.set(next.x, AVATAR_BASE_Y, next.z);
    group.current?.rotation.set(0, -facing.current * DEGREES_TO_RADIANS, 0);

    sinceSendMs.current += deltaSeconds * MS_PER_SECOND;
    if (unsent.current && sinceSendMs.current >= MS_PER_SECOND / sendHz) {
      onMove(next.x, next.z, facing.current);
      unsent.current = false;
      sinceSendMs.current = 0;
    }
    followWithCamera(controls, camera, next);
  });

  return (
    <group ref={group} position={[start.x, AVATAR_BASE_Y, start.z]}>
      <Avatar avatarId={avatarId} isSelf />
    </group>
  );
}
