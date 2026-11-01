/** Tells whether this browser can create a WebGL context, which the 3D hall needs. */
export function isWebGlAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}
