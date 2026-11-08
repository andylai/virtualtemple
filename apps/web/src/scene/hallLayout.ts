import type { Point, TempleManifest } from '@temple/shared';

type Hall = TempleManifest['hall'];

/** Sizes of the blockout hall's furniture, in metres. Real art replaces them via manifest slots. */
export const BLOCKOUT = {
  floorThickness: 0.1,
  wallHeight: 3.5,
  sideWallHeight: 1.9,
  wallThickness: 0.3,
  altarDepth: 2,
  altarHeight: 1.1,
  altarWidthShare: 0.4,
  statueWidth: 1,
  statueHeight: 2.4,
  cushionRadius: 0.4,
  cushionHeight: 0.15,
  lampSize: 0.18,
  rackHeight: 0.9,
  rackWidth: 0.5,
  rackPadding: 0.5,
} as const;

/**
 * Where the pictures from the manifest hang on the back wall, as offsets from its middle, and how
 * big they are, in metres. They are first guesses: the art made for the hall decides the real ones.
 */
export const PICTURES = {
  /** Lifted off the wall so it is never hidden inside it. */
  lift: 0.02,
  backdrop: { dx: 0, y: 2.25, width: 3, height: 2.4 },
  banner: { dx: -3.2, y: 2.2, width: 0.9, height: 2.4 },
  plaque: { dx: 3.2, y: 2, width: 1.2, height: 0.6 },
} as const;

/** A flat picture on a wall, described by its centre and size. It faces into the hall (towards larger z). */
export interface PicturePlane {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

/** A box described by its centre and size. */
export interface Box {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

/** Everything the scene needs to draw the blockout hall, worked out from the manifest. */
export interface HallLayout {
  floor: readonly Point[];
  walls: readonly Box[];
  altar: Box;
  statue: Box;
  /** The low shelves the lamps stand on: one on each side of the altar, where there are lamp places. */
  lampRacks: readonly Box[];
  /** Where the manifest's wall pictures hang. */
  pictures: { altarBackdrop: PicturePlane; banner: PicturePlane; plaque: PicturePlane };
  cushions: Hall['cushions'];
  lampSlots: Hall['lampSlots'];
  /** The point the camera looks at. */
  focus: Point;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function boundsOf(polygon: readonly Point[]): HallLayout['bounds'] {
  const xs = polygon.map((point) => point.x);
  const zs = polygon.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** One shelf under a row of lamp places. */
function shelf(slots: Hall['lampSlots']): Box {
  const xs = slots.map((slot) => slot.x);
  const zs = slots.map((slot) => slot.z);
  const { rackHeight, rackWidth, rackPadding } = BLOCKOUT;
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
  const width = Math.max(...xs) - Math.min(...xs) + 2 * rackPadding;
  const depth = Math.max(...zs) - Math.min(...zs) + rackWidth;
  return box(center, rackHeight / 2, width, rackHeight, depth);
}

/** A shelf for the lamp places on each side of the middle of the hall (the altar is in the middle). */
function racksFor(slots: Hall['lampSlots'], centerX: number): Box[] {
  const left = slots.filter((slot) => slot.x < centerX);
  const right = slots.filter((slot) => slot.x >= centerX);
  return [left, right].filter((side) => side.length > 0).map(shelf);
}

function picture(
  spot: { dx: number; y: number; width: number; height: number },
  centerX: number,
  wallZ: number,
): PicturePlane {
  return {
    x: centerX + spot.dx,
    y: spot.y,
    z: wallZ + PICTURES.lift,
    width: spot.width,
    height: spot.height,
  };
}

function box(center: Point, y: number, width: number, height: number, depth: number): Box {
  return { x: center.x, y, z: center.z, width, height, depth };
}

/**
 * Works out where the blockout hall's parts go from the manifest's hall template.
 *
 * The altar sits just behind the walkable area (smaller z), and three walls enclose the other
 * sides, so the walkable area always lies inside the hall.
 *
 * @param hall - The `hall` section of a validated manifest.
 */
export function buildHallLayout(hall: Hall): HallLayout {
  const bounds = boundsOf(hall.walkableArea);
  const { wallHeight, sideWallHeight, wallThickness, altarDepth, altarHeight, altarWidthShare } =
    BLOCKOUT;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const width = bounds.maxX - bounds.minX;
  const backZ = bounds.minZ - altarDepth;
  const sideDepth = bounds.maxZ - backZ;
  const sideZ = (bounds.maxZ + backZ) / 2;
  const wallY = wallHeight / 2;
  const altarCenter = { x: centerX, z: bounds.minZ - altarDepth / 2 };
  return {
    floor: hall.walkableArea,
    walls: [
      box(
        { x: centerX, z: backZ - wallThickness / 2 },
        wallY,
        width + 2 * wallThickness,
        wallHeight,
        wallThickness,
      ),
      box(
        { x: bounds.minX - wallThickness / 2, z: sideZ },
        sideWallHeight / 2,
        wallThickness,
        sideWallHeight,
        sideDepth,
      ),
      box(
        { x: bounds.maxX + wallThickness / 2, z: sideZ },
        sideWallHeight / 2,
        wallThickness,
        sideWallHeight,
        sideDepth,
      ),
    ],
    altar: box(altarCenter, altarHeight / 2, width * altarWidthShare, altarHeight, altarDepth),
    statue: box(
      altarCenter,
      altarHeight + BLOCKOUT.statueHeight / 2,
      BLOCKOUT.statueWidth,
      BLOCKOUT.statueHeight,
      BLOCKOUT.statueWidth,
    ),
    lampRacks: racksFor(hall.lampSlots, centerX),
    pictures: {
      altarBackdrop: picture(PICTURES.backdrop, centerX, backZ),
      banner: picture(PICTURES.banner, centerX, backZ),
      plaque: picture(PICTURES.plaque, centerX, backZ),
    },
    cushions: hall.cushions,
    lampSlots: hall.lampSlots,
    focus: { x: centerX, z: (bounds.minZ + bounds.maxZ) / 2 },
    bounds,
  };
}
