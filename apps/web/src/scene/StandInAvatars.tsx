import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { Point } from '@temple/shared';

const CAPSULE_RADIUS = 0.25;
const CAPSULE_LENGTH = 0.7;
const CAPSULE_CAP_SEGMENTS = 4;
const CAPSULE_RADIAL_SEGMENTS = 8;
const BOB_SPEED = 1.5;
const BOB_AMPLITUDE = 0.04;
const COLOR_SATURATION = 50;
const COLOR_LIGHTNESS = 55;
const FULL_HUE = 360;

/**
 * Capsule stand-ins for visitors, each its own mesh and draw call, so the frame rate measured
 * with them is a cautious guide to the real avatars (spike S6). They bob a little to keep the
 * renderer working.
 */
export function StandInAvatars({ points }: { points: readonly Point[] }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const baseY = CAPSULE_LENGTH / 2 + CAPSULE_RADIUS;

  useFrame(({ clock }) => {
    meshes.current.forEach((mesh, index) => {
      if (mesh !== null) {
        mesh.position.y = baseY + Math.sin(clock.elapsedTime * BOB_SPEED + index) * BOB_AMPLITUDE;
      }
    });
  });

  return (
    <>
      {points.map((point, index) => (
        <mesh
          key={`${point.x}:${point.z}`}
          ref={(mesh) => {
            meshes.current[index] = mesh;
          }}
          position={[point.x, baseY, point.z]}
        >
          <capsuleGeometry
            args={[CAPSULE_RADIUS, CAPSULE_LENGTH, CAPSULE_CAP_SEGMENTS, CAPSULE_RADIAL_SEGMENTS]}
          />
          <meshStandardMaterial
            color={`hsl(${(index / points.length) * FULL_HUE}, ${COLOR_SATURATION}%, ${COLOR_LIGHTNESS}%)`}
          />
        </mesh>
      ))}
    </>
  );
}
