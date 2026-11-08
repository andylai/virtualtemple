import type { Box, HallLayout } from './hallLayout';

/** Architectural elements use a short, warm palette so the gold altar remains the focal point. */
export const HALL_COLOURS = {
  walnut: '#573626',
  edge: '#996642',
  inlay: '#754a33',
  plaster: '#a68564',
  niche: '#bb8954',
  nicheFrame: '#6b432d',
  cushion: '#8d493f',
  cushionEdge: '#65352d',
  lampWood: '#503222',
  lampPaper: '#a58058',
  lampLight: '#ffd291',
} as const;

const DETAIL = {
  railHeight: 0.1,
  panelDepth: 0.08,
  pillarRadius: 0.14,
  pillarSegments: 12,
  pillarInset: 0.43,
  nicheWidth: 3.15,
  nicheHeight: 3.18,
  nicheTrim: 0.14,
  latticeWidth: 0.98,
  latticeHeight: 1.65,
  sidePanelHeight: 0.55,
  sidePanelDepth: 0.06,
  latticeRails: [-0.32, -0.16, 0, 0.16, 0.32],
} as const;

/** Reuses the same box representation as the hall, so the trim follows the layout. */
export function HallBox({ box, color }: { box: Box; color: string }) {
  return (
    <mesh position={[box.x, box.y, box.z]}>
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/** A simple dark frame with vertical timber slats echoes the approved hall reference. */
function Lattice({
  x,
  y,
  z,
  rotation = 0,
}: {
  x: number;
  y: number;
  z: number;
  rotation?: number;
}) {
  const { latticeWidth, latticeHeight, latticeRails, panelDepth } = DETAIL;
  return (
    <group position={[x, y, z]} rotation={[0, rotation, 0]}>
      <HallBox
        box={{ x: 0, y: 0, z: 0, width: latticeWidth, height: latticeHeight, depth: panelDepth }}
        color={HALL_COLOURS.nicheFrame}
      />
      <HallBox
        box={{
          x: 0,
          y: 0,
          z: panelDepth,
          width: latticeWidth * 0.85,
          height: latticeHeight * 0.91,
          depth: panelDepth,
        }}
        color={HALL_COLOURS.niche}
      />
      {latticeRails.map((rail) => (
        <HallBox
          key={rail}
          box={{
            x: rail,
            y: 0,
            z: panelDepth * 2,
            width: panelDepth,
            height: latticeHeight * 0.91,
            depth: panelDepth,
          }}
          color={HALL_COLOURS.walnut}
        />
      ))}
    </group>
  );
}

/** The double frame creates depth without using a second image or a shadow map. */
function AltarNiche({ x, y, z }: { x: number; y: number; z: number }) {
  const { nicheWidth, nicheHeight, nicheTrim, panelDepth } = DETAIL;
  return (
    <>
      <HallBox
        box={{
          x,
          y,
          z: z + panelDepth,
          width: nicheWidth,
          height: nicheHeight,
          depth: panelDepth,
        }}
        color={HALL_COLOURS.nicheFrame}
      />
      <HallBox
        box={{
          x,
          y,
          z: z + panelDepth * 2,
          width: nicheWidth - 2 * nicheTrim,
          height: nicheHeight - 2 * nicheTrim,
          depth: panelDepth,
        }}
        color={HALL_COLOURS.niche}
      />
    </>
  );
}

/** The low wainscoting adds contrast along the aisle without closing the cutaway walls. */
function SideWallTrim({ walls }: { walls: readonly Box[] }) {
  const { sidePanelHeight, sidePanelDepth, railHeight } = DETAIL;
  return walls.slice(1).map((wall, index) => {
    const side = index === 0 ? 1 : -1;
    const x = wall.x + (side * wall.width) / 2;
    const box = {
      ...wall,
      x,
      y: sidePanelHeight / 2,
      height: sidePanelHeight,
      width: sidePanelDepth,
    };
    return (
      <group key={wall.x}>
        <HallBox box={box} color={HALL_COLOURS.walnut} />
        <HallBox
          box={{ ...box, y: sidePanelHeight, height: railHeight, width: 2 * sidePanelDepth }}
          color={HALL_COLOURS.edge}
        />
      </group>
    );
  });
}

/** Walnut pillars and a recessed-looking sandstone frame give the altar a distinct silhouette. */
export function HallDetails({ layout }: { layout: HallLayout }) {
  const { minX, maxX } = layout.bounds;
  const { altar, walls } = layout;
  const { panelDepth, pillarRadius, pillarSegments, pillarInset, nicheTrim } = DETAIL;
  const back = walls[0]!;
  const backZ = back.z + back.depth / 2;
  const nicheY = back.height / 2 + nicheTrim;
  const offset = (maxX - minX) / 4;
  return (
    <>
      <AltarNiche x={altar.x} y={nicheY} z={backZ} />
      <SideWallTrim walls={walls} />
      {[
        minX + pillarInset,
        altar.x - offset * 0.62,
        altar.x + offset * 0.62,
        maxX - pillarInset,
      ].map((x) => (
        <mesh key={x} position={[x, back.y, backZ + pillarRadius]}>
          <cylinderGeometry
            args={[pillarRadius, pillarRadius * 1.22, back.height, pillarSegments]}
          />
          <meshStandardMaterial color={HALL_COLOURS.inlay} roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <Lattice
          key={side}
          x={altar.x + side * offset * 1.13}
          y={back.y + pillarRadius}
          z={backZ + panelDepth}
        />
      ))}
      {walls.map((wall) => (
        <HallBox
          key={wall.x}
          box={{
            ...wall,
            y: wall.y + wall.height / 2 - DETAIL.railHeight / 2,
            height: DETAIL.railHeight,
          }}
          color={HALL_COLOURS.edge}
        />
      ))}
    </>
  );
}

/** A wood cabinet has a readable top edge and recessed front even at phone scale. */
export function AltarCabinet({ box }: { box: Box }) {
  const { railHeight, panelDepth } = DETAIL;
  const front = box.z + box.depth / 2;
  return (
    <>
      <HallBox box={box} color={HALL_COLOURS.walnut} />
      <HallBox
        box={{ ...box, y: box.y + box.height / 2 - railHeight / 2, height: railHeight }}
        color={HALL_COLOURS.edge}
      />
      <HallBox
        box={{ ...box, y: box.y - box.height / 2 + railHeight / 2, height: railHeight }}
        color={HALL_COLOURS.inlay}
      />
      <HallBox
        box={{
          ...box,
          z: front,
          depth: panelDepth,
          width: box.width - 4 * panelDepth,
          height: box.height - 3 * railHeight,
        }}
        color={HALL_COLOURS.inlay}
      />
    </>
  );
}
