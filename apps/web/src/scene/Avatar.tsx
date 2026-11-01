import { AVATAR_VARIANT_COUNT } from '@temple/shared';

const CAPSULE_RADIUS = 0.25;
const CAPSULE_LENGTH = 0.7;
const CAPSULE_CAP_SEGMENTS = 4;
const CAPSULE_RADIAL_SEGMENTS = 8;
const COLOR_SATURATION = 50;
const COLOR_LIGHTNESS = 55;
const FULL_HUE = 360;
const RING_INNER = 0.35;
const RING_OUTER = 0.45;
const RING_SEGMENTS = 24;
const RING_LIFT = 0.02;

/** Standing height of the placeholder avatar's centre above the floor, in metres. */
export const AVATAR_BASE_Y = CAPSULE_LENGTH / 2 + CAPSULE_RADIUS;

/** The placeholder avatar: a coloured capsule. `isSelf` adds a white ring so you can find yourself. */
export function Avatar({ avatarId, isSelf = false }: { avatarId: number; isSelf?: boolean }) {
  const hue = (avatarId / AVATAR_VARIANT_COUNT) * FULL_HUE;
  return (
    <>
      <mesh>
        <capsuleGeometry
          args={[CAPSULE_RADIUS, CAPSULE_LENGTH, CAPSULE_CAP_SEGMENTS, CAPSULE_RADIAL_SEGMENTS]}
        />
        <meshStandardMaterial color={`hsl(${hue}, ${COLOR_SATURATION}%, ${COLOR_LIGHTNESS}%)`} />
      </mesh>
      {isSelf && (
        <mesh position={[0, RING_LIFT - AVATAR_BASE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[RING_INNER, RING_OUTER, RING_SEGMENTS]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </>
  );
}
