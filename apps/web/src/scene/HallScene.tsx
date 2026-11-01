import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { Point } from '@temple/shared';
import { useMemo, type ReactNode } from 'react';
import { BlockoutHall } from './BlockoutHall';
import type { HallLayout } from './hallLayout';
import { scatterPoints } from './scatter';
import { StandInAvatars } from './StandInAvatars';

/** The pixel ratio is capped so high-density phones do not draw more pixels than they can hold. */
const MAX_PIXEL_RATIO = 2;
const CAMERA = { height: 8, distanceBeyondFloor: 6, fieldOfView: 50 } as const;
const CONTROLS = {
  minDistance: 4,
  maxDistance: 28,
  maxPolarAngle: Math.PI / 2.1,
  damping: 0.1,
} as const;
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
  /** Things drawn inside the scene, such as the people in the hall. */
  children?: ReactNode;
}

/** The 3D canvas: the placeholder hall, lights, a camera the visitor can orbit, and optional stand-ins. */
export function HallScene({ layout, standIns, onReady, onFloorClick, children }: HallSceneProps) {
  const points = useMemo(
    () => (standIns > 0 ? scatterPoints(standIns, layout.floor, STAND_IN_SEED) : []),
    [layout.floor, standIns],
  );
  const cameraPosition: [number, number, number] = [
    layout.focus.x,
    CAMERA.height,
    layout.bounds.maxZ + CAMERA.distanceBeyondFloor,
  ];

  return (
    <Canvas
      dpr={[1, MAX_PIXEL_RATIO]}
      camera={{ position: cameraPosition, fov: CAMERA.fieldOfView }}
      onCreated={onReady}
    >
      <ambientLight intensity={LIGHTS.ambient} />
      <directionalLight intensity={LIGHTS.sun} position={LIGHTS.sunPosition} />
      <BlockoutHall layout={layout} onFloorClick={onFloorClick} />
      <StandInAvatars points={points} />
      {children}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={CONTROLS.damping}
        minDistance={CONTROLS.minDistance}
        maxDistance={CONTROLS.maxDistance}
        maxPolarAngle={CONTROLS.maxPolarAngle}
        target={[layout.focus.x, 0, layout.focus.z]}
      />
    </Canvas>
  );
}
