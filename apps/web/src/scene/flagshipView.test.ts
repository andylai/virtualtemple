import { flagshipManifest } from '@temple/shared/flagship';
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FLAGSHIP_VIEW } from './flagshipView';

it('keeps the reserved cushion positions on the artwork when the camera projects them', () => {
  const { width, height, camera: view } = FLAGSHIP_VIEW;
  const camera = new PerspectiveCamera(view.fov, width / height);
  camera.position.set(...view.position);
  camera.rotation.set(...view.rotation);
  camera.updateMatrixWorld();
  const cushionPixels = [
    [375, 577],
    [519, 577],
    [1120, 577],
    [1263, 577],
    [351, 644],
    [505, 644],
    [1138, 644],
    [1291, 644],
    [326, 720],
    [489, 720],
    [1159, 720],
    [1320, 720],
  ] as const;
  expect(flagshipManifest.hall.cushions).toHaveLength(cushionPixels.length);
  flagshipManifest.hall.cushions.forEach(({ x, z }, index) => {
    const point = new Vector3(x, 0, z).project(camera);
    const [pixelX, pixelY] = cushionPixels[index]!;
    expect(Math.abs(((point.x + 1) * width) / 2 - pixelX)).toBeLessThan(3);
    expect(Math.abs(((1 - point.y) * height) / 2 - pixelY)).toBeLessThan(3);
  });
});
