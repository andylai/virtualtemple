import { Canvas, useThree } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { flagshipManifest } from '@temple/shared/flagship';
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
const BUTTONS_HEIGHT_PX = 110;
const BUTTONS_HEIGHT_PHONE_PX = 170;
/** Room kept free above the hall for the text at the top, in pixels. On phones it runs across the screen. */
const TEXT_HEIGHT_PX = 40;
const TEXT_HEIGHT_PHONE_PX = 72;
const PHONE_WIDTH_PX = 600;
/** Where the manifest's models and pictures are. The manifest is fixed for the life of the page. */
const SLOT_URLS = resolveSlotUrls(flagshipManifest, ASSET_BASE);
const LIGHTS = { ambient: 0.7, sun: 1.1, sunPosition: [6, 12, 8] } as const;
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
  const firstFrame = useMemo(() => {
    const { innerWidth: width, innerHeight: height } = window;
    return frameHall(layout, width / Math.max(1, height), reserveFor(width, Math.max(1, height)));
  }, [layout]);

  return (
    <Canvas
      dpr={[1, MAX_PIXEL_RATIO]}
      camera={{ position: firstFrame.position, fov: CAMERA_FOV }}
      onCreated={onReady}
    >
      <ambientLight intensity={LIGHTS.ambient} />
      <directionalLight intensity={LIGHTS.sun} position={LIGHTS.sunPosition} />
      <FixedCamera layout={layout} />
      {onPictureLost !== undefined && <ContextWatch onLost={onPictureLost} />}
      <TempleHall
        layout={layout}
        slots={SLOT_URLS}
        onFloorClick={onFloorClick}
        litLamps={litLamps}
      />
      <StandInAvatars points={points} />
      {children}
    </Canvas>
  );
}
