import type { Point } from '@temple/shared';
import { useEffect, useMemo } from 'react';
import { ShapeGeometry, Shape, Vector2 } from 'three';
import { BuddhaRelief } from './BuddhaRelief';
import { AltarCabinet, HALL_COLOURS, HallBox, HallDetails } from './HallDetails';
import { hallWoodTexture } from './HallWood';
import { BLOCKOUT, type HallLayout } from './hallLayout';
import { ModelSlot } from './slots/LazySlots';

/** A press that moves further than this many pixels is a drag, not a click. */
const CLICK_DRAG_PX = 5;
const CUSHION_SEGMENTS = 20;
const ALTAR_LANTERN_OFFSET_SHARE = 0.34;
const LANTERN = { roof: 0.24, base: 0.2, paper: 0.15, trim: 0.045, glow: 0.4992 } as const;

/** The grain and plank seams are baked into one texture, keeping the floor one mesh. */
function WoodFloor({ layout }: { layout: HallLayout }) {
  const geometry = useFloorGeometry(layout);
  const texture = useMemo(hallWoodTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const rear = minZ - BLOCKOUT.altarDepth;
  return (
    <>
      <HallBox
        box={{
          x: (minX + maxX) / 2,
          y: -BLOCKOUT.floorThickness * 0.51,
          z: (rear + maxZ) / 2,
          width: maxX - minX,
          height: BLOCKOUT.floorThickness,
          depth: maxZ - rear,
        }}
        color={HALL_COLOURS.edge}
      />
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial map={texture} roughness={0.97} />
      </mesh>
    </>
  );
}

function useFloorGeometry(layout: HallLayout): ShapeGeometry {
  return useMemo(() => {
    const shape = new Shape(layout.floor.map((point) => new Vector2(point.x, -point.z)));
    return new ShapeGeometry(shape);
  }, [layout.floor]);
}

/**
 * The floor that takes clicks and taps. It is always there, and invisible: the walkable area is
 * what the manifest says, whatever art is drawn over it.
 */
export function FloorClickArea({
  layout,
  onFloorClick,
}: {
  layout: HallLayout;
  /** Called with the spot on the floor that was clicked or tapped. */
  onFloorClick?: ((point: Point) => void) | undefined;
}) {
  const geometry = useFloorGeometry(layout);
  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        // A drag that ends in a click is not a walk; only a real click or tap should walk.
        if (event.delta <= CLICK_DRAG_PX) {
          onFloorClick?.({ x: event.point.x, z: event.point.z });
        }
      }}
    >
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/**
 * The warm hall is drawn from the manifest's layout, with a statue relief while a model is absent
 * or downloading. Click targets and ritual positions are independent of the decoration.
 */
export function BlockoutFurniture({
  layout,
  statueUrl,
}: {
  layout: HallLayout;
  statueUrl: string | null;
}) {
  const { cushionRadius, cushionHeight } = BLOCKOUT;
  const statue = <BuddhaRelief statue={layout.statue} />;
  return (
    <group>
      <WoodFloor layout={layout} />
      {layout.walls.map((wall) => (
        <HallBox key={wall.x} box={wall} color={HALL_COLOURS.plaster} />
      ))}
      <HallDetails layout={layout} />
      <AltarCabinet box={layout.altar} />
      {[-1, 1].map((side) => (
        <Lantern
          key={side}
          x={layout.altar.x + side * layout.altar.width * ALTAR_LANTERN_OFFSET_SHARE}
          y={layout.altar.height}
          z={layout.altar.z}
          lit
        />
      ))}
      {statueUrl === null ? (
        statue
      ) : (
        <ModelSlot
          url={statueUrl}
          position={[layout.statue.x, layout.altar.height, layout.statue.z]}
          fallback={statue}
        />
      )}
      {layout.lampRacks.map((rack) => (
        <AltarCabinet key={rack.x} box={rack} />
      ))}
      {layout.cushions.map((cushion) => (
        <group key={cushion.id} position={[cushion.x, cushionHeight / 2, cushion.z]}>
          <mesh>
            <cylinderGeometry
              args={[cushionRadius, cushionRadius, cushionHeight, CUSHION_SEGMENTS]}
            />
            <meshStandardMaterial color={HALL_COLOURS.cushionEdge} roughness={1} />
          </mesh>
          <mesh scale={[cushionRadius, cushionHeight, cushionRadius]}>
            <sphereGeometry args={[1, CUSHION_SEGMENTS, CUSHION_SEGMENTS]} />
            <meshStandardMaterial color={HALL_COLOURS.cushion} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Lit and unlit lanterns share a silhouette so ritual state stays visible from the entrance. */
function Lantern({ x, y, z, lit }: { x: number; y: number; z: number; lit: boolean }) {
  const { roof, base, paper, trim, glow } = LANTERN;
  const height = BLOCKOUT.lampSize * 1.6;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, trim / 2, 0]}>
        <boxGeometry args={[base, trim, base]} />
        <meshStandardMaterial color={HALL_COLOURS.lampWood} />
      </mesh>
      <mesh position={[0, trim + height / 2, 0]}>
        <boxGeometry args={[paper, height, paper]} />
        <meshStandardMaterial
          color={lit ? HALL_COLOURS.lampLight : HALL_COLOURS.lampPaper}
          emissive={HALL_COLOURS.lampLight}
          emissiveIntensity={lit ? glow : 0}
        />
      </mesh>
      <mesh position={[0, trim + height, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[roof / 3, roof / Math.SQRT2, trim * 2, 4]} />
        <meshStandardMaterial color={HALL_COLOURS.lampWood} />
      </mesh>
    </group>
  );
}

/** Lamp slots remain visible for every temple model and only the ritual changes which ones glow. */
export function Lamps({
  layout,
  litLamps,
}: {
  layout: HallLayout;
  litLamps?: ReadonlySet<string> | undefined;
}) {
  return (
    <>
      {layout.lampSlots.map((slot) => (
        <Lantern
          key={slot.id}
          x={slot.x}
          y={BLOCKOUT.rackHeight}
          z={slot.z}
          lit={litLamps?.has(slot.id) ?? false}
        />
      ))}
    </>
  );
}
