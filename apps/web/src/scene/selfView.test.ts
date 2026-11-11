import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FLAGSHIP_VIEW } from './flagshipView';
import {
  acrossView,
  readSelfAcross,
  reportSelfAcross,
  slideToKeepInSight,
  watchSelfAcross,
} from './selfView';

const ZOOM = 1.45;
const MARGIN = 0.07;
/** Where the avatar ends up across the screen (0 to 1) after the picture has slid. */
const onScreen = (across: number, zoom = ZOOM) =>
  0.5 + (across - 0.5 + slideToKeepInSight(across, zoom, MARGIN)) * zoom;

describe('slideToKeepInSight', () => {
  it('leaves the picture centred while the avatar is comfortably in sight', () => {
    expect(slideToKeepInSight(0.5, ZOOM, MARGIN)).toBe(0);
    expect(slideToKeepInSight(0.4, ZOOM, MARGIN)).toBe(0);
    expect(slideToKeepInSight(0.6, ZOOM, MARGIN)).toBe(0);
  });

  it('slides the picture the opposite way to an avatar near a side wall', () => {
    expect(slideToKeepInSight(0.87, ZOOM, MARGIN)).toBeLessThan(0);
    expect(slideToKeepInSight(0.13, ZOOM, MARGIN)).toBeGreaterThan(0);
    expect(slideToKeepInSight(0.13, ZOOM, MARGIN)).toBeCloseTo(
      -slideToKeepInSight(0.87, ZOOM, MARGIN),
    );
  });

  it('keeps the avatar on the screen wherever it stands in the hall', () => {
    for (let across = 0.05; across <= 0.95; across += 0.01) {
      expect(onScreen(across)).toBeGreaterThanOrEqual(0);
      expect(onScreen(across)).toBeLessThanOrEqual(1);
    }
  });

  it('never slides past the edge of the picture', () => {
    const furthest = (1 - 1 / ZOOM) / 2;
    for (const across of [-0.5, 0, 0.02, 0.98, 1, 1.5]) {
      expect(Math.abs(slideToKeepInSight(across, ZOOM, MARGIN))).toBeLessThanOrEqual(
        furthest + 1e-12,
      );
    }
  });

  it('moves smoothly: a small step by the avatar is never a jump of the picture', () => {
    for (let across = 0; across < 1; across += 0.005) {
      const step =
        slideToKeepInSight(across + 0.005, ZOOM, MARGIN) - slideToKeepInSight(across, ZOOM, MARGIN);
      expect(Math.abs(step)).toBeLessThanOrEqual(0.005 + 1e-12);
    }
  });

  it('does nothing when the whole picture is visible', () => {
    expect(slideToKeepInSight(0.95, 1, MARGIN)).toBe(0);
    expect(slideToKeepInSight(0.05, 0.8, MARGIN)).toBe(0);
    expect(slideToKeepInSight(0.95, Number.NaN, MARGIN)).toBe(0);
  });
});

describe('acrossView', () => {
  const { width, height, camera: view } = FLAGSHIP_VIEW;
  const camera = new PerspectiveCamera(view.fov, width / height);
  camera.position.set(...view.position);
  camera.rotation.set(...view.rotation);
  camera.updateMatrixWorld();

  it('puts the middle of the hall in the middle and the sides to the sides', () => {
    expect(acrossView({ x: 0, z: 0 }, camera)).toBeCloseTo(0.5);
    expect(acrossView({ x: 4, z: 0 }, camera)).toBeGreaterThan(0.5);
    expect(acrossView({ x: -4, z: 0 }, camera)).toBeCloseTo(1 - acrossView({ x: 4, z: 0 }, camera));
  });
});

describe('the reported place of the avatar', () => {
  it('tells watchers about a real move and not about a tremor', () => {
    reportSelfAcross(0.5);
    const watcher = vi.fn();
    const stop = watchSelfAcross(watcher);
    reportSelfAcross(0.5002);
    expect(watcher).not.toHaveBeenCalled();
    reportSelfAcross(0.8);
    expect(watcher).toHaveBeenCalledTimes(1);
    expect(readSelfAcross()).toBe(0.8);
    stop();
    reportSelfAcross(0.2);
    expect(watcher).toHaveBeenCalledTimes(1);
  });
});
