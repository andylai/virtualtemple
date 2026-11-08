import { Canvas, useThree } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { flagshipManifest } from '@temple/shared/flagship';
import { FloorClickArea } from './BlockoutHall';
import { FLAGSHIP_VIEW } from './flagshipView';
import { PaintedStage } from './PaintedStage';
import { ASSET_BASE } from '../assets/assetUrl';
import { CAMERA_FOV, frameHall, type ScreenReserve } from './framing';
import type { HallLayout } from './hallLayout';
import { scatterPoints } from './scatter';
import { useDockHeight } from './screenReserve';
import { resolveSlotUrls } from './slots/slotUrls';
import { StandInAvatars } from './StandInAvatars';
import { TempleHall } from './TempleHall';

/** The pixel ratio is capped so high-density phones do not draw more pixels than they can hold. */
const MAX_PIXEL_RATIO = 2;
/**
 * Room kept free below the hall for the buttons, in pixels, until the buttons report their real
 * height. Phones wrap the buttons onto more rows.
 */
const BUTTONS_HEIGHT_PX = 86;
const BUTTONS_HEIGHT_PHONE_PX = 102;
/** Room kept free above the hall for the text at the top, in pixels. On phones it runs across the screen. */
const TEXT_HEIGHT_PX = 88;
const TEXT_HEIGHT_PHONE_PX = 88;
const PHONE_WIDTH_PX = 600;
/** Where the manifest's models and pictures are. The manifest is fixed for the life of the page. */
const SLOT_URLS = resolveSlotUrls(flagshipManifest, ASSET_BASE);
/** Custom scene art takes precedence over the flagship's bundled illustration. */
const USE_PAINTED_HALL = Object.entries(SLOT_URLS).every(
  ([slot, url]) => slot === 'avatar' || url === null,
);
const LIGHTS = {
  ambient: 0.88,
  sun: 1.45,
  sunColour: '#ffe4c5',
  sunPosition: [3, 12, 8],
  altarColour: '#ffc789',
  altarIntensity: 14,
  altarHeight: 3.35,
  altarOffsetZ: 1.55,
} as const;
/** Fixed so the stand-in avatars land in the same places on every run. */
const STAND_IN_SEED = 20261101;

interface HallSceneProps {
  layout: HallLayout;
  /** How many stand-in avatars to draw (0 for none). */
  standIns: number;
  /** Called once the WebGL context exists. */
  onReady: () => void;
  /** Called when the browser takes the graphics away (`true`) and when it gives them back (`false`). */
  onPictureLost?: ((lost: boolean) => void) | undefined;
  /** Called with the spot on the floor that was clicked or tapped. */
  onFloorClick?: ((point: Point) => void) | undefined;
  /** The lamp places that have a lit lamp. */
  litLamps?: ReadonlySet<string> | undefined;
  /** Things drawn inside the scene, such as the people in the hall. */
  children?: ReactNode;
}

/**
 * How much of a screen of this size is covered by buttons and text, as shares of its height.
 *
 * @param measuredButtonsPx - The real height of the buttons, or 0 to use an estimate for this width.
 */
function reserveFor(width: number, height: number, measuredButtonsPx = 0): ScreenReserve {
  const phone = width < PHONE_WIDTH_PX;
  const estimate = phone ? BUTTONS_HEIGHT_PHONE_PX : BUTTONS_HEIGHT_PX;
  const text = phone ? TEXT_HEIGHT_PHONE_PX : TEXT_HEIGHT_PX;
  return { top: text / height, bottom: (measuredButtonsPx || estimate) / height };
}

/**
 * Keeps the camera on the one fixed view that fits and centres the whole hall for the current
 * screen shape. The view does not rotate or zoom, so it is always the same picture of the hall.
 */
function FixedCamera({ layout }: { layout: HallLayout }) {
  const camera = useThree((state) => state.camera);
  const { width, height } = useThree((state) => state.size);
  const buttonsPx = useDockHeight();
  useEffect(() => {
    if (height > 0) {
      const frame = frameHall(layout, width / height, reserveFor(width, height, buttonsPx));
      camera.position.set(...frame.position);
      camera.lookAt(...frame.target);
      camera.updateProjectionMatrix();
    }
  }, [camera, layout, width, height, buttonsPx]);
  return null;
}

/** Reports when the browser takes the graphics context away, which three.js then restores by itself. */
function ContextWatch({ onLost }: { onLost: (lost: boolean) => void }) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const lose = (event: Event) => {
      // Without this the browser would not offer the context back.
      event.preventDefault();
      onLost(true);
    };
    const restore = () => onLost(false);
    canvas.addEventListener('webglcontextlost', lose);
    canvas.addEventListener('webglcontextrestored', restore);
    return () => {
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', restore);
    };
  }, [canvas, onLost]);
  return null;
}

/** The 3D canvas: the placeholder hall, lights, a fixed camera, and optional stand-ins. */
export function HallScene({
  layout,
  standIns,
  onReady,
  onPictureLost,
  onFloorClick,
  litLamps,
  children,
}: HallSceneProps) {
  const points = useMemo(
    () => (standIns > 0 ? scatterPoints(standIns, layout.floor, STAND_IN_SEED) : []),
    [layout.floor, standIns],
  );
  const [artworkFailed, setArtworkFailed] = useState(false);
  const painted = USE_PAINTED_HALL && !artworkFailed;
  const canvas = (
    <Canvas
      dpr={[1, MAX_PIXEL_RATIO]}
      camera={painted ? FLAGSHIP_VIEW.camera : { fov: CAMERA_FOV }}
      onCreated={onReady}
      style={painted ? { position: 'absolute', inset: 0 } : undefined}
    >
      <ambientLight intensity={LIGHTS.ambient} />
      <directionalLight
        color={LIGHTS.sunColour}
        intensity={LIGHTS.sun}
        position={LIGHTS.sunPosition}
      />
      <pointLight
        color={LIGHTS.altarColour}
        intensity={LIGHTS.altarIntensity}
        position={[layout.altar.x, LIGHTS.altarHeight, layout.altar.z + LIGHTS.altarOffsetZ]}
      />
      {onPictureLost !== undefined && <ContextWatch onLost={onPictureLost} />}
      {painted ? (
        <FloorClickArea layout={layout} onFloorClick={onFloorClick} />
      ) : (
        <>
          <FixedCamera layout={layout} />
          <TempleHall
            layout={layout}
            slots={SLOT_URLS}
            onFloorClick={onFloorClick}
            litLamps={litLamps}
          />
        </>
      )}
      <StandInAvatars points={points} />
      {children}
    </Canvas>
  );
  return painted ? (
    <PaintedStage litLamps={litLamps} onArtworkError={() => setArtworkFailed(true)}>
      {canvas}
    </PaintedStage>
  ) : (
    canvas
  );
}
