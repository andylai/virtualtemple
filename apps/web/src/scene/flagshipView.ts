/** The approved hall artwork and its camera share one aspect ratio, independent of screen size. */
export const FLAGSHIP_VIEW = {
  artwork: '/art/flagship-hall.jpg',
  width: 1672,
  height: 941,
  // Calibrated to the front and back edges of the walkable floor in the artwork.
  camera: {
    position: [0, 14.035799, 71.472585],
    rotation: [-0.17816, 0, 0],
    fov: 6.476227,
  },
  // The altar pair is decorative and does not use any ritual lamp slots.
  altarLamps: {
    'altar-left': [646, 426],
    'altar-right': [1026, 426],
  },
  // Centres of the lantern faces, in artwork pixels. Keep the ID mapping from the manifest.
  lamps: {
    'lamp-1': [485, 430],
    'lamp-2': [1186, 430],
    'lamp-3': [442, 430],
    'lamp-4': [1229, 430],
    'lamp-5': [397, 430],
    'lamp-6': [1273, 430],
    'lamp-7': [353, 430],
    'lamp-8': [1318, 430],
  },
} as const;
