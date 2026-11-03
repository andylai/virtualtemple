import { Suspense, lazy, type ComponentProps, type ReactNode } from 'react';
import { reportProblem } from '../../net/reportProblem';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import type { PicturePlane } from '../hallLayout';

const SlotModelChunk = lazy(() => import('./SlotAssets'));
const SlotPictureChunk = lazy(() =>
  import('./SlotAssets').then((module) => ({ default: module.SlotPicture })),
);

function reportAssetFailure(error: Error): void {
  reportProblem('asset_failed', `${error.name}: ${error.message}`);
}

/**
 * A model from the manifest. While it downloads, and if it never loads (missing file, broken file,
 * no support for its compression), the placeholder is shown instead, so a bad asset cannot break the hall (M7-7).
 */
export function ModelSlot(props: ComponentProps<typeof SlotModelChunk> & { fallback: ReactNode }) {
  const { fallback, ...model } = props;
  return (
    <ErrorBoundary fallback={fallback} onError={reportAssetFailure}>
      <Suspense fallback={fallback}>
        <SlotModelChunk {...model} />
      </Suspense>
    </ErrorBoundary>
  );
}

/** A picture from the manifest. Nothing is drawn while it loads or if it cannot be loaded. */
export function PictureSlot({ url, plane }: { url: string; plane: PicturePlane }) {
  return (
    <ErrorBoundary fallback={null} onError={reportAssetFailure}>
      <Suspense fallback={null}>
        <SlotPictureChunk url={url} plane={plane} />
      </Suspense>
    </ErrorBoundary>
  );
}
