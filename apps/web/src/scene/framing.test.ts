import { flagshipManifest } from '@temple/shared/flagship';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_FOV, NO_RESERVE, frameHall, hallPoints, type ScreenReserve } from './framing';
import { BLOCKOUT, buildHallLayout } from './hallLayout';

const layout = buildHallLayout(flagshipManifest.hall);
/** Room kept free for the buttons at the bottom (about 8% of a desktop screen) and text at the top. */
const DESKTOP_RESERVE: ScreenReserve = { top: 0.03, bottom: 0.09 };

/** Where the hall's corners land on screen (-1 to 1 each way) for a framing. */
function screenExtent(aspect: number, reserve: ScreenReserve = NO_RESERVE) {
  const framing = frameHall(layout, aspect, reserve);
  const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 400);
  camera.position.set(...framing.position);
  camera.lookAt(new Vector3(...framing.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const projected = hallPoints(layout).map((point) => point.clone().project(camera));
  const ys = projected.map((p) => p.y);
  const xs = projected.map((p) => p.x);
  return {
    framing,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

describe('frameHall', () => {
  it.each([
    ['a wide desktop screen', 16 / 9],
    ['a laptop screen', 4 / 3],
    ['a square screen', 1],
    ['a tall phone screen', 9 / 19.5],
  ])('puts the whole hall on %s', (_label, aspect) => {
    const { xMin, xMax, yMin, yMax } = screenExtent(aspect, DESKTOP_RESERVE);
    expect(Math.max(Math.abs(xMin), xMax)).toBeLessThanOrEqual(0.95);
    expect(yMin).toBeGreaterThanOrEqual(-0.95);
    expect(yMax).toBeLessThanOrEqual(0.95);
  });

  it('keeps the hall clear of the buttons along the bottom and the text along the top', () => {
    const { yMin, yMax } = screenExtent(16 / 9, DESKTOP_RESERVE);
    // The bottom 9% of the screen is the range -1 to -0.82 in these units; the top 3% is 0.94 to 1.
    expect(yMin).toBeGreaterThanOrEqual(-0.82);
    expect(yMax).toBeLessThanOrEqual(0.94);
  });

  it.each([
    ['a wide desktop screen', 16 / 9],
    ['a laptop screen', 4 / 3],
  ])(
    'centres the hall in the free part of %s, left to right and top to bottom',
    (_label, aspect) => {
      const { xMin, xMax, yMin, yMax } = screenExtent(aspect, DESKTOP_RESERVE);
      const freeMiddle =
        (-0.94 + 2 * DESKTOP_RESERVE.bottom + (0.94 - 2 * DESKTOP_RESERVE.top)) / 2;
      expect(Math.abs((yMin + yMax) / 2 - freeMiddle)).toBeLessThan(0.05);
      expect(Math.abs((xMin + xMax) / 2)).toBeLessThan(0.05);
    },
  );

  it('pulls the camera further back for a tall screen', () => {
    expect(frameHall(layout, 9 / 19.5).distance).toBeGreaterThan(
      frameHall(layout, 16 / 9).distance * 1.8,
    );
  });

  it('shows the hall wider than it is tall on a wide screen', () => {
    const { xMin, xMax, yMin, yMax } = screenExtent(16 / 9);
    const widthOnScreen = (xMax - xMin) * (16 / 9);
    const heightOnScreen = yMax - yMin;
    expect(widthOnScreen / heightOnScreen).toBeGreaterThan(1.6);
  });

  it('looks at the middle of the hall, slightly above the floor, from the entrance side', () => {
    const { target, position } = frameHall(layout, 16 / 9);
    expect(target[0]).toBeCloseTo(layout.focus.x);
    expect(target[1]).toBeGreaterThan(0);
    expect(position[2]).toBeGreaterThan(layout.bounds.maxZ);
    expect(position[0]).toBeCloseTo(target[0]);
  });
});

describe('hallPoints', () => {
  it('covers the floor corners, the back wall and its top', () => {
    const points = hallPoints(layout);
    expect(points).toHaveLength(8);
    expect(Math.max(...points.map((p) => p.y))).toBe(BLOCKOUT.wallHeight);
    expect(Math.min(...points.map((p) => p.z))).toBeLessThan(layout.bounds.minZ);
  });
});
