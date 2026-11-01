import { useMemo } from 'react';
import { ShapeGeometry, Shape, Vector2 } from 'three';
import { BLOCKOUT, type Box, type HallLayout } from './hallLayout';

/** Colours of the placeholder hall. Real art replaces all of them. */
const PALETTE = {
  floor: '#8a6a4b',
  wall: '#d8c7a3',
  altar: '#6b4a2f',
  statue: '#c9a227',
  rack: '#5a3e28',
  cushion: '#a33b2d',
  lamp: '#e8b84a',
} as const;

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

/** The box-shaped placeholder hall, drawn from the layout that the manifest describes. */
export function BlockoutHall({ layout }: { layout: HallLayout }) {
  const floor = useMemo(() => {
    const shape = new Shape(layout.floor.map((point) => new Vector2(point.x, -point.z)));
    return new ShapeGeometry(shape);
  }, [layout.floor]);
  const { cushionRadius, cushionHeight, lampSize, rackHeight } = BLOCKOUT;

  return (
    <group>
      <mesh geometry={floor} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={PALETTE.floor} />
      </mesh>
      {layout.walls.map((wall) => (
        <BoxMesh key={`${wall.x}:${wall.z}`} box={wall} color={PALETTE.wall} />
      ))}
      <BoxMesh box={layout.altar} color={PALETTE.altar} />
      <BoxMesh box={layout.statue} color={PALETTE.statue} />
      {layout.lampRack !== null && <BoxMesh box={layout.lampRack} color={PALETTE.rack} />}
      {layout.cushions.map((cushion) => (
        <mesh key={cushion.id} position={[cushion.x, cushionHeight / 2, cushion.z]}>
          <cylinderGeometry
            args={[cushionRadius, cushionRadius, cushionHeight, CYLINDER_SEGMENTS]}
          />
          <meshStandardMaterial color={PALETTE.cushion} />
        </mesh>
      ))}
      {layout.lampSlots.map((slot) => (
        <mesh key={slot.id} position={[slot.x, rackHeight + lampSize, slot.z]}>
          <sphereGeometry args={[lampSize, LAMP_SEGMENTS, LAMP_SEGMENTS]} />
          <meshStandardMaterial color={PALETTE.lamp} />
        </mesh>
      ))}
    </group>
  );
}
