import { isPointInPolygon, type Point } from '@temple/shared';

/** How fast a visitor walks, in metres per second. */
export const WALK_SPEED_MPS = 3;
/** A click target closer than this counts as reached, in metres. */
export const ARRIVE_DISTANCE = 0.05;

const HALF_TURN_DEGREES = 180;
const FULL_TURN_DEGREES = 360;

/** Which movement keys are held down right now. */
export interface HeldKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export const NO_KEYS: HeldKeys = { forward: false, back: false, left: false, right: false };

const KEY_DIRECTIONS: Readonly<Record<string, keyof HeldKeys>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Which direction a keyboard key means, or null for any other key. `code` is `KeyboardEvent.code`. */
export function keyDirection(code: string): keyof HeldKeys | null {
  return KEY_DIRECTIONS[code] ?? null;
}

/**
 * Turns the held keys into a walking direction relative to where the camera looks.
 *
 * @param keys - The keys held down.
 * @param forward - The direction the camera looks along the floor (does not need to be unit length).
 * @returns A unit direction, or zero when no key is held or the keys cancel out.
 */
export function directionFromKeys(keys: HeldKeys, forward: Point): Point {
  const length = Math.hypot(forward.x, forward.z);
  if (length === 0) {
    return { x: 0, z: 0 };
  }
  const ahead = { x: forward.x / length, z: forward.z / length };
  const right = { x: -ahead.z, z: ahead.x };
  const along = Number(keys.forward) - Number(keys.back);
  const across = Number(keys.right) - Number(keys.left);
  const x = ahead.x * along + right.x * across;
  const z = ahead.z * along + right.z * across;
  const size = Math.hypot(x, z);
  return size === 0 ? { x: 0, z: 0 } : { x: x / size, z: z / size };
}

/**
 * Moves from one point towards another by at most `maxDistance`.
 *
 * @returns The new point; the target itself when it is within reach.
 */
export function stepToward(from: Point, target: Point, maxDistance: number): Point {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDistance) {
    return target;
  }
  return { x: from.x + (dx / distance) * maxDistance, z: from.z + (dz / distance) * maxDistance };
}

/**
 * Moves to `to` if that is inside the walkable area; otherwise slides along one axis, so walking
 * into a wall at an angle slides along it instead of stopping dead. Stays put when neither works.
 */
export function moveWithinArea(from: Point, to: Point, area: readonly Point[]): Point {
  const options: Point[] = [to, { x: to.x, z: from.z }, { x: from.x, z: to.z }];
  return options.find((option) => isPointInPolygon(option, area)) ?? from;
}

/**
 * The direction a person faces when walking along (dx, dz), in degrees from 0 up to 360.
 * 0 faces the altar (towards smaller z), 90 faces right, 180 faces away from the altar.
 */
export function facingFromDirection(dx: number, dz: number): number {
  const degrees = (Math.atan2(dx, -dz) * HALF_TURN_DEGREES) / Math.PI;
  return (degrees + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

/** What the visitor is asking for this frame. */
export interface WalkInput {
  keys: HeldKeys;
  /** The direction the camera looks along the floor. */
  cameraForward: Point;
  /** Where a click asked to walk, or null. */
  target: Point | null;
}

/** The result of one frame of walking. */
export interface WalkStep {
  next: Point;
  /** The click target still to reach, or null when there is none left. */
  target: Point | null;
}

/**
 * Works out one frame of walking. Held keys win over a clicked target. A clicked target is
 * dropped once it is reached or when a wall stops the walk, so the avatar never pushes on a wall.
 *
 * @param position - Where the visitor is.
 * @param input - The keys held, the camera direction and the clicked target.
 * @param area - The walkable area.
 * @param reach - How far the visitor can walk this frame, in metres.
 */
export function planStep(
  position: Point,
  input: WalkInput,
  area: readonly Point[],
  reach: number,
): WalkStep {
  const direction = directionFromKeys(input.keys, input.cameraForward);
  const usingKeys = direction.x !== 0 || direction.z !== 0;
  let desired = position;
  let target = usingKeys ? null : input.target;
  if (usingKeys) {
    desired = { x: position.x + direction.x * reach, z: position.z + direction.z * reach };
  } else if (target !== null) {
    desired = stepToward(position, target, reach);
  }
  const next = moveWithinArea(position, desired, area);
  const blocked = next.x === position.x && next.z === position.z && desired !== position;
  const arrived =
    target !== null && Math.hypot(target.x - next.x, target.z - next.z) < ARRIVE_DISTANCE;
  if (blocked || arrived) {
    target = null;
  }
  return { next, target };
}
