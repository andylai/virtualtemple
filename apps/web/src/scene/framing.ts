import { PerspectiveCamera, Vector3 } from 'three';
import { BLOCKOUT, type HallLayout } from './hallLayout';

/**
 * Vertical field of view of the hall camera, in degrees. A narrow lens makes the walls slope in
 * less, so the hall looks like a wide flat room and not a deep funnel.
 */
export const CAMERA_FOV = 38;
/** How far the camera looks down on the hall, in degrees. A low angle makes the hall look wider. */
const VIEW_ELEVATION_DEG = 24;
/** The camera looks at this height above the floor, so the walls and altar are in view too, in metres. */
export const TARGET_HEIGHT = 1;

const DEGREES_TO_RADIANS = Math.PI / 180;
/** The direction from the target back to the camera. It has no sideways part: the view is straight on. */
const VIEW_DIRECTION = new Vector3(
  0,
  Math.sin(VIEW_ELEVATION_DEG * DEGREES_TO_RADIANS),
  Math.cos(VIEW_ELEVATION_DEG * DEGREES_TO_RADIANS),
);
/** The way "forward" points along the floor in the fixed view: away from the camera, towards the altar. */
export const FORWARD_ON_FLOOR = { x: -VIEW_DIRECTION.x, z: -VIEW_DIRECTION.z } as const;
/** The hall is kept inside this share of the half-width and half-height of the screen. */
const SCREEN_MARGIN = 0.94;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 200;
const SEARCH_STEPS = 40;
/** Moving the view up or down changes the size a little, so centring is repeated. */
const CENTRING_PASSES = 3;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 400;

/** How much of the screen is kept free of the hall, as a share of the screen's height. */
export interface ScreenReserve {
  /** For text along the top. */
  top: number;
  /** For the buttons along the bottom. */
  bottom: number;
}

export const NO_RESERVE: ScreenReserve = { top: 0, bottom: 0 };

/** Where to put the camera so the hall fills the screen, centred. */
export interface Framing {
  /** The point the camera looks at. */
  target: [number, number, number];
  position: [number, number, number];
  /** How far the camera is from the target, in metres. */
  distance: number;
}

/** The outer corners of the hall, as seen from the camera: the floor, the back wall and its top. */
export function hallPoints(layout: HallLayout): Vector3[] {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const backZ = layout.walls[0]?.z ?? minZ;
  const points: Vector3[] = [];
  for (const x of [minX, maxX]) {
    for (const z of [minZ, maxZ, backZ]) {
      points.push(new Vector3(x, 0, z));
    }
    points.push(new Vector3(x, BLOCKOUT.wallHeight, backZ));
  }
  return points;
}

/**
 * Finds the closest camera position from which the whole hall is on screen, centred in the part of
 * the screen that is not covered by buttons or text. A wide screen needs the camera close; a tall
 * phone screen needs it much further back.
 *
 * @param layout - The hall.
 * @param aspect - Screen width divided by height.
 * @param reserve - Parts of the screen to keep free, as shares of its height.
 */
export function frameHall(
  layout: HallLayout,
  aspect: number,
  reserve: ScreenReserve = NO_RESERVE,
): Framing {
  const points = hallPoints(layout);
  const low = -SCREEN_MARGIN + 2 * reserve.bottom;
  const high = SCREEN_MARGIN - 2 * reserve.top;
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
  const target = new Vector3();

  const aim = (distance: number) => {
    camera.position.copy(target).addScaledVector(VIEW_DIRECTION, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  };
  const measure = () => {
    const projected = points.map((point) => point.clone().project(camera));
    const ys = projected.map((p) => p.y);
    return {
      xMax: Math.max(...projected.map((p) => Math.abs(p.x))),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    };
  };
  /** Slides the whole view up or down until the hall is in the middle of the free part of the screen. */
  const centre = (distance: number) => {
    const halfHeight = distance * Math.tan((CAMERA_FOV * DEGREES_TO_RADIANS) / 2);
    for (let pass = 0; pass < CENTRING_PASSES; pass += 1) {
      const { yMin, yMax } = measure();
      const screenUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      target.addScaledVector(screenUp, ((yMin + yMax) / 2 - (low + high) / 2) * halfHeight);
      aim(distance);
    }
  };
  const fitsAt = (distance: number): boolean => {
    target.set(layout.focus.x, TARGET_HEIGHT, layout.focus.z);
    aim(distance);
    centre(distance);
    const { xMax, yMin, yMax } = measure();
    return xMax <= SCREEN_MARGIN && yMax - yMin <= high - low;
  };

  let near = MIN_DISTANCE;
  let far = MAX_DISTANCE;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (near + far) / 2;
    if (fitsAt(middle)) {
      far = middle;
    } else {
      near = middle;
    }
  }
  fitsAt(far);
  return {
    target: [target.x, target.y, target.z],
    position: [camera.position.x, camera.position.y, camera.position.z],
    distance: far,
  };
}
