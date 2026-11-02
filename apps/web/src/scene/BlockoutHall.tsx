import type { Point } from '@temple/shared';
import { useMemo } from 'react';
import { ShapeGeometry, Shape, Vector2 } from 'three';
import { BLOCKOUT, type Box, type HallLayout } from './hallLayout';
import { ModelSlot } from './slots/LazySlots';

/** Colours of the placeholder hall. Real art replaces all of them. */
const PALETTE = {
  floor: '#8a6a4b',
  wall: '#d8c7a3',
  altar: '#6b4a2f',
  statue: '#c9a227',
  rack: '#5a3e28',
  cushion: '#a33b2d',
  lamp: '#7a6a4a',
  litLamp: '#ffd36b',
} as const;

const LIT_LAMP_GLOW = 1.2;

/** A press that moves further than this many pixels is a drag, not a click. */
const CLICK_DRAG_PX = 5;
const CYLINDER_SEGMENTS = 20;
const LAMP_SEGMENTS = 12;

function BoxMesh({ box, color }: { box: Box; color: string }) {
  return (
    <mesh position={[box.x, box.y, box.z]}>
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/** The coloured floor of the placeholder hall. */
function ColourFloor({ layout }: { layout: HallLayout }) {
  const geometry = useFloorGeometry(layout);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={PALETTE.floor} />
    </mesh>
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
 * The box-shaped placeholder hall: floor, walls, altar, lamp shelves and cushions, drawn from the
 * layout the manifest describes.
 *
 * @param statueUrl - A model for the statue on the altar. The box is drawn instead when it is
 *   null, while the model downloads, and if it cannot be loaded.
 */
export function BlockoutFurniture({
  layout,
  statueUrl,
}: {
  layout: HallLayout;
  statueUrl: string | null;
}) {
  const { cushionRadius, cushionHeight } = BLOCKOUT;
  const statueBox = <BoxMesh box={layout.statue} color={PALETTE.statue} />;
  return (
    <group>
      <ColourFloor layout={layout} />
      {layout.walls.map((wall) => (
        <BoxMesh key={`${wall.x}:${wall.z}`} box={wall} color={PALETTE.wall} />
      ))}
      <BoxMesh box={layout.altar} color={PALETTE.altar} />
      {statueUrl === null ? (
        statueBox
      ) : (
        <ModelSlot
          url={statueUrl}
          position={[layout.statue.x, layout.altar.height, layout.statue.z]}
          fallback={statueBox}
        />
      )}
      {layout.lampRacks.map((rack) => (
        <BoxMesh key={`${rack.x}:${rack.z}`} box={rack} color={PALETTE.rack} />
      ))}
      {layout.cushions.map((cushion) => (
        <mesh key={cushion.id} position={[cushion.x, cushionHeight / 2, cushion.z]}>
          <cylinderGeometry
            args={[cushionRadius, cushionRadius, cushionHeight, CYLINDER_SEGMENTS]}
          />
          <meshStandardMaterial color={PALETTE.cushion} />
        </mesh>
      ))}
    </group>
  );
}

/** The lamps, which are drawn from the manifest's lamp places whatever the hall looks like. A lit lamp glows. */
export function Lamps({
  layout,
  litLamps,
}: {
  layout: HallLayout;
  /** The lamp places that have a lit lamp. */
  litLamps?: ReadonlySet<string> | undefined;
}) {
  const { lampSize, rackHeight } = BLOCKOUT;
  return (
    <>
      {layout.lampSlots.map((slot) => (
        <mesh key={slot.id} position={[slot.x, rackHeight + lampSize, slot.z]}>
          <sphereGeometry args={[lampSize, LAMP_SEGMENTS, LAMP_SEGMENTS]} />
          <meshStandardMaterial
            color={litLamps?.has(slot.id) ? PALETTE.litLamp : PALETTE.lamp}
            emissive={litLamps?.has(slot.id) ? PALETTE.litLamp : '#000000'}
            emissiveIntensity={litLamps?.has(slot.id) ? LIT_LAMP_GLOW : 0}
          />
        </mesh>
      ))}
    </>
  );
}
