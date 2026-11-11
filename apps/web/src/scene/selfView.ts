import { Vector3, type Camera } from 'three';
import type { Point } from '@temple/shared';

/**
 * Where the visitor's own avatar is across the picture of the hall: 0 at the left edge, 1 at the
 * right. The avatar reports it from inside the 3D canvas, and the stage around the canvas reads it
 * to keep the avatar in sight in the closer view. It is not React state: it changes every frame
 * while walking.
 */
let selfAcross = 0.5;
const listeners = new Set<() => void>();
/** A change smaller than this is not worth moving the picture for. */
const ACROSS_STEP = 0.001;
/** How close to the edge of the screen the avatar may come before the picture slides, as a share of the picture's width. */
export const SELF_EDGE_MARGIN = 0.07;

const projected = new Vector3();

/**
 * How far across the camera's picture a place on the floor is, from 0 (left) to 1 (right).
 *
 * @param point - The place on the floor.
 * @param camera - The camera, with its matrices up to date (as they are inside a frame).
 */
export function acrossView(point: Point, camera: Camera): number {
  projected.set(point.x, 0, point.z).project(camera);
  return (projected.x + 1) / 2;
}

/** Records where the visitor's avatar is across the picture, and tells the stage when it moved. */
export function reportSelfAcross(across: number): void {
  if (Math.abs(across - selfAcross) >= ACROSS_STEP) {
    selfAcross = across;
    listeners.forEach((listener) => listener());
  }
}

/** Where the visitor's avatar last was across the picture. */
export function readSelfAcross(): number {
  return selfAcross;
}

/** Calls `listener` whenever the avatar has moved across the picture; returns how to stop. */
export function watchSelfAcross(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * How far to slide an enlarged picture sideways so the visitor's avatar stays on screen, as a
 * share of the picture's own width (negative slides it left). The picture stays centred while the
 * avatar is comfortably in sight, slides only as far as needed, and never past its own edge, so
 * no empty strip shows.
 *
 * @param across - Where the avatar is across the picture, 0 to 1.
 * @param zoom - How many screen widths wide the picture is; 1 or less means all of it is visible.
 * @param margin - The gap kept between the avatar and the screen edge, as a share of the picture's width.
 */
export function slideToKeepInSight(
  across: number,
  zoom: number,
  margin = SELF_EDGE_MARGIN,
): number {
  if (!(zoom > 1)) {
    return 0;
  }
  const fromCentre = across - 0.5;
  const visibleHalf = 0.5 / zoom;
  const comfortable = Math.max(0, visibleHalf - margin);
  const furthest = 0.5 - visibleHalf;
  const wanted = Math.min(comfortable - fromCentre, Math.max(-comfortable - fromCentre, 0));
  // Adding 0 turns a negative zero into a plain zero.
  return Math.min(furthest, Math.max(-furthest, wanted)) + 0;
}
