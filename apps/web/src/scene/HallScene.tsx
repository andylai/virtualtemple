import { Canvas, useThree } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { BlockoutHall } from './BlockoutHall';
import { CAMERA_FOV, frameHall, type ScreenReserve } from './framing';
import type { HallLayout } from './hallLayout';
import { scatterPoints } from './scatter';
import { StandInAvatars } from './StandInAvatars';

/** The pixel ratio is capped so high-density phones do not draw more pixels than they can hold. */
const MAX_PIXEL_RATIO = 2;
/** Room kept free below the hall for the buttons, in pixels. Phones wrap the buttons onto more rows. */
const BUTTONS_HEIGHT_PX = 66;
const BUTTONS_HEIGHT_PHONE_PX = 150;
/** Room kept free above the hall for the text in the corner, in pixels. */
const TEXT_HEIGHT_PX = 24;
const PHONE_WIDTH_PX = 600;
const LIGHTS = { ambient: 0.7, sun: 1.1, sunPosition: [6, 12, 8] } as const;
/** Fixed so the stand-in avatars land in the same places on every run. */
const STAND_IN_SEED = 20261101;

interface HallSceneProps {
  layout: HallLayout;
  /** How many stand-in avatars to draw (0 for none). */
  standIns: number;
  /** Called once the WebGL context exists. */
  onReady: () => void;
  /** Called with the spot on the floor that was clicked or tapped. */
  onFloorClick?: ((point: Point) => void) | undefined;
  /** The lamp places that have a lit lamp. */
  litLamps?: ReadonlySet<string> | undefined;
  /** Things drawn inside the scene, such as the people in the hall. */
  children?: ReactNode;
}

/** How much of a screen of this size is covered by buttons and text, as shares of its height. */
function reserveFor(width: number, height: number): ScreenReserve {
  const buttons = width < PHONE_WIDTH_PX ? BUTTONS_HEIGHT_PHONE_PX : BUTTONS_HEIGHT_PX;
  return { top: TEXT_HEIGHT_PX / height, bottom: buttons / height };
}

/**
 * Keeps the camera on the one fixed view that fits and centres the whole hall for the current
 * screen shape. The view does not rotate or zoom, so it is always the same picture of the hall.
 */
function FixedCamera({ layout }: { layout: HallLayout }) {
  const camera = useThree((state) => state.camera);
  const { width, height } = useThree((state) => state.size);
  useEffect(() => {
    if (height > 0) {
      const frame = frameHall(layout, width / height, reserveFor(width, height));
      camera.position.set(...frame.position);
      camera.lookAt(...frame.target);
      camera.updateProjectionMatrix();
    }
  }, [camera, layout, width, height]);
  return null;
}

/** The 3D canvas: the placeholder hall, lights, a fixed camera, and optional stand-ins. */
export function HallScene({
  layout,
  standIns,
  onReady,
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
      <BlockoutHall layout={layout} onFloorClick={onFloorClick} litLamps={litLamps} />
      <StandInAvatars points={points} />
      {children}
    </Canvas>
  );
}
