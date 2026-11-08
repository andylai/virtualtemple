import { useLoader } from '@react-three/fiber';
import { Suspense } from 'react';
import { SRGBColorSpace, TextureLoader } from 'three';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import type { Box } from './hallLayout';

/** Baked lighting preserves the sculpture's soft highlights from the one fixed hall view. */
const ART_URL = '/art/seated-buddha.png';
const ART_ASPECT = 0.88;
const SILHOUETTE_CUTOFF = 0.12;

/** The alpha cutoff lets the statue occlude the niche without drawing a rectangular background. */
function ReliefImage({ statue }: { statue: Box }) {
  const texture = useLoader(TextureLoader, ART_URL);
  texture.colorSpace = SRGBColorSpace;
  return (
    <mesh position={[statue.x, statue.y, statue.z]}>
      <planeGeometry args={[statue.height * ART_ASPECT, statue.height]} />
      <meshBasicMaterial map={texture} alphaTest={SILHOUETTE_CUTOFF} toneMapped={false} />
    </mesh>
  );
}

/** Local artwork fills the altar when no manifest statue is available. */
export function BuddhaRelief({ statue }: { statue: Box }) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <ReliefImage statue={statue} />
      </Suspense>
    </ErrorBoundary>
  );
}
