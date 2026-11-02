import { useLoader, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { SRGBColorSpace, TextureLoader, type Object3D, type WebGLRenderer } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PicturePlane } from '../hallLayout';

/**
 * Loads models and pictures from the manifest. This file is a separate download that is fetched only
 * when a manifest names a model or picture, so the placeholder temple does not carry the loaders.
 * A file that cannot be loaded makes the component throw, and `LazySlots` then shows the placeholder.
 */

/**
 * Gives the model loader its Draco (mesh) and KTX2 (texture) decoders. three.js ships them as files
 * the build copies to this site's own address, so no decoder code comes from anywhere else.
 */
function withDecoders(gl: WebGLRenderer) {
  return (loader: GLTFLoader) => {
    loader.setDRACOLoader(new DRACOLoader());
    loader.setKTX2Loader(new KTX2Loader().detectSupport(gl));
  };
}

/** Props for placing a model. The model's own origin is the point on the floor under it. */
interface ModelProps {
  url: string;
  position?: [number, number, number];
  rotationY?: number;
}

/** A glTF model, placed where asked. Each use gets its own copy so a model can appear many times. */
export default function SlotModel({ url, position = [0, 0, 0], rotationY = 0 }: ModelProps) {
  const gl = useThree((state) => state.gl);
  const gltf = useLoader(GLTFLoader, url, withDecoders(gl));
  const copy = useMemo<Object3D>(() => clone(gltf.scene), [gltf]);
  return <primitive object={copy} position={position} rotation={[0, rotationY, 0]} />;
}

/** A picture hung on a wall. Compressed `.ktx2` pictures use the KTX2 loader, other kinds the plain one. */
export function SlotPicture({ url, plane }: { url: string; plane: PicturePlane }) {
  const gl = useThree((state) => state.gl);
  const compressed = url.toLowerCase().endsWith('.ktx2');
  const texture = useLoader(compressed ? KTX2Loader : TextureLoader, url, (loader) => {
    if (loader instanceof KTX2Loader) {
      loader.detectSupport(gl);
    }
  });
  if (!compressed) {
    texture.colorSpace = SRGBColorSpace;
  }
  return (
    <mesh position={[plane.x, plane.y, plane.z]}>
      <planeGeometry args={[plane.width, plane.height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
