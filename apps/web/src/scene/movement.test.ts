import type { Point } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import {
  NO_KEYS,
  directionFromKeys,
  facingFromDirection,
  keyDirection,
  moveWithinArea,
  planStep,
  stepToward,
} from './movement';

const area: Point[] = [
  { x: -6, z: -4 },
  { x: 6, z: -4 },
  { x: 6, z: 9 },
  { x: -6, z: 9 },
];

describe('keyDirection', () => {
  it('maps WASD and the arrow keys', () => {
    expect(keyDirection('KeyW')).toBe('forward');
    expect(keyDirection('ArrowLeft')).toBe('left');
    expect(keyDirection('Space')).toBeNull();
  });
});

describe('directionFromKeys', () => {
  const lookingTowardAltar = { x: 0, z: -1 };

  it('walks the way the camera looks when forward is held', () => {
    const direction = directionFromKeys({ ...NO_KEYS, forward: true }, lookingTowardAltar);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });

  it('turns right and left relative to the camera', () => {
    expect(directionFromKeys({ ...NO_KEYS, right: true }, lookingTowardAltar).x).toBeCloseTo(1);
    expect(directionFromKeys({ ...NO_KEYS, left: true }, lookingTowardAltar).x).toBeCloseTo(-1);
    const sideways = directionFromKeys({ ...NO_KEYS, right: true }, { x: 1, z: 0 });
    expect(sideways.z).toBeCloseTo(1);
  });

  it('does not walk faster diagonally', () => {
    const direction = directionFromKeys(
      { ...NO_KEYS, forward: true, right: true },
      lookingTowardAltar,
    );
    expect(Math.hypot(direction.x, direction.z)).toBeCloseTo(1);
  });

  it('stays still when no key is held, keys cancel out, or the camera points straight down', () => {
    expect(directionFromKeys(NO_KEYS, lookingTowardAltar)).toEqual({ x: 0, z: 0 });
    expect(
      directionFromKeys({ ...NO_KEYS, forward: true, back: true }, lookingTowardAltar),
    ).toEqual({ x: 0, z: 0 });
    expect(directionFromKeys({ ...NO_KEYS, forward: true }, { x: 0, z: 0 })).toEqual({
      x: 0,
      z: 0,
    });
  });
});

describe('stepToward', () => {
  it('moves a limited distance and arrives exactly', () => {
    expect(stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 3)).toEqual({ x: 3, z: 0 });
    expect(stepToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 3)).toEqual({ x: 1, z: 0 });
  });
});

describe('moveWithinArea', () => {
  it('goes where asked when that is inside', () => {
    expect(moveWithinArea({ x: 0, z: 0 }, { x: 1, z: 1 }, area)).toEqual({ x: 1, z: 1 });
  });

  it('slides along a wall instead of stopping', () => {
    expect(moveWithinArea({ x: 5.9, z: 0 }, { x: 6.5, z: 1 }, area)).toEqual({ x: 5.9, z: 1 });
  });

  it('stays put when every option is outside', () => {
    expect(moveWithinArea({ x: 5.9, z: 8.9 }, { x: 7, z: 10 }, area)).toEqual({ x: 5.9, z: 8.9 });
  });
});

describe('facingFromDirection', () => {
  it('faces the altar at 0 and turns clockwise', () => {
    expect(facingFromDirection(0, -1)).toBeCloseTo(0);
    expect(facingFromDirection(1, 0)).toBeCloseTo(90);
    expect(facingFromDirection(0, 1)).toBeCloseTo(180);
    expect(facingFromDirection(-1, 0)).toBeCloseTo(270);
  });
});

describe('planStep', () => {
  const lookingTowardAltar = { x: 0, z: -1 };
  const idle = { keys: NO_KEYS, cameraForward: lookingTowardAltar, target: null };

  it('stays still with no keys and no target', () => {
    expect(planStep({ x: 0, z: 0 }, idle, area, 1)).toEqual({ next: { x: 0, z: 0 }, target: null });
  });

  it('walks with the keys and forgets a clicked target', () => {
    const input = { ...idle, keys: { ...NO_KEYS, forward: true }, target: { x: 5, z: 5 } };
    const step = planStep({ x: 0, z: 0 }, input, area, 1);
    expect(step.next.z).toBeCloseTo(-1);
    expect(step.target).toBeNull();
  });

  it('walks towards a clicked target and keeps it until reached', () => {
    const input = { ...idle, target: { x: 3, z: 0 } };
    const first = planStep({ x: 0, z: 0 }, input, area, 1);
    expect(first).toEqual({ next: { x: 1, z: 0 }, target: { x: 3, z: 0 } });
    const last = planStep({ x: 2.5, z: 0 }, input, area, 1);
    expect(last).toEqual({ next: { x: 3, z: 0 }, target: null });
  });

  it('gives up on a target that a wall blocks', () => {
    const input = { ...idle, target: { x: 10, z: 0 } };
    const step = planStep({ x: 5.9, z: 0 }, input, area, 1);
    expect(step.next).toEqual({ x: 5.9, z: 0 });
    expect(step.target).toBeNull();
  });
});
