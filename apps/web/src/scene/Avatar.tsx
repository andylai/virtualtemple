import { flagshipManifest } from '@temple/shared/flagship';
import { ASSET_BASE } from '../assets/assetUrl';
import { MonkFigure, type MonkLimbRefs } from './MonkFigure';
import { ModelSlot } from './slots/LazySlots';
import { resolveSlotUrls } from './slots/slotUrls';

const RING_INNER = 0.365;
const RING_OUTER = 0.39;
const RING_SEGMENTS = 24;
const RING_LIFT = 0.02;

/**
 * Local origin above the floor, in metres. The procedural figure's soles sit at -0.6;
 * keeping this origin stable also preserves the manifest model's floor alignment.
 */
export const AVATAR_BASE_Y = 0.6;

/** The model that stands for a person, if the manifest has one. The manifest is fixed for the life of the page. */
const AVATAR_MODEL = resolveSlotUrls(flagshipManifest, ASSET_BASE).avatar;

/** A model faces the way glTF says is front (+Z); a person's front must face the altar (-Z) when they face 0 degrees. */
const MODEL_TURN = Math.PI;

/**
 * A person: the manifest's model if it has one (standing with its feet where the placeholder
 * monk's feet would be), otherwise the monk (`MonkFigure`), which also shows while the model
 * downloads or if it cannot be loaded. The identifying ring is drawn separately so it stays on the floor.
 * `limbRefs` are the monk's arm and leg pivots, swung by `AnimatedAvatar` for the walk cycle.
 */
export function Avatar({ avatarId, limbRefs }: { avatarId: number; limbRefs: MonkLimbRefs }) {
  const monk = <MonkFigure avatarId={avatarId} limbRefs={limbRefs} />;
  return (
    <>
      {AVATAR_MODEL === null ? (
        monk
      ) : (
        <ModelSlot
          url={AVATAR_MODEL}
          position={[0, -AVATAR_BASE_Y, 0]}
          rotationY={MODEL_TURN}
          fallback={monk}
        />
      )}
    </>
  );
}

/** The identifying ring stays on the floor when the body steps, bows or sits. */
export function AvatarRing() {
  return (
    <mesh position={[0, RING_LIFT - AVATAR_BASE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[RING_INNER, RING_OUTER, RING_SEGMENTS]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}
