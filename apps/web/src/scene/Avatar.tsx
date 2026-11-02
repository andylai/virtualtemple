import { AVATAR_VARIANT_COUNT } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { ASSET_BASE } from '../assets/assetUrl';
import { ModelSlot } from './slots/LazySlots';
import { resolveSlotUrls } from './slots/slotUrls';

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

/** The model that stands for a person, if the manifest has one. The manifest is fixed for the life of the page. */
const AVATAR_MODEL = resolveSlotUrls(flagshipManifest, ASSET_BASE).avatar;

/** A model faces the way glTF says is front (+Z); a person's front must face the altar (-Z) when they face 0 degrees. */
const MODEL_TURN = Math.PI;

/**
 * A person: the manifest's model if it has one (standing with its feet where the capsule's feet
 * would be), otherwise a coloured capsule, which also shows while the model downloads or if it
 * cannot be loaded. `isSelf` adds a white ring so you can find yourself.
 */
export function Avatar({ avatarId, isSelf = false }: { avatarId: number; isSelf?: boolean }) {
  const hue = (avatarId / AVATAR_VARIANT_COUNT) * FULL_HUE;
  const capsule = (
    <mesh>
      <capsuleGeometry
        args={[CAPSULE_RADIUS, CAPSULE_LENGTH, CAPSULE_CAP_SEGMENTS, CAPSULE_RADIAL_SEGMENTS]}
      />
      <meshStandardMaterial color={`hsl(${hue}, ${COLOR_SATURATION}%, ${COLOR_LIGHTNESS}%)`} />
    </mesh>
  );
  return (
    <>
      {AVATAR_MODEL === null ? (
        capsule
      ) : (
        <ModelSlot
          url={AVATAR_MODEL}
          position={[0, -AVATAR_BASE_Y, 0]}
          rotationY={MODEL_TURN}
          fallback={capsule}
        />
      )}
      {isSelf && (
        <mesh position={[0, RING_LIFT - AVATAR_BASE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[RING_INNER, RING_OUTER, RING_SEGMENTS]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </>
  );
}
