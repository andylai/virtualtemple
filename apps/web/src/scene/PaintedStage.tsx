import type { CSSProperties, ReactNode } from 'react';
import { FLAGSHIP_VIEW } from './flagshipView';
import { useDockHeight } from './screenReserve';

/** Space for the permanent controls before the dock has reported its actual size. */
const DOCK_ESTIMATE_PX = 88;

/** Keep the scenery and live WebGL layer on the same rectangle at every screen size. */
export function PaintedStage({
  children,
  litLamps,
  onArtworkError,
}: {
  children: ReactNode;
  litLamps: ReadonlySet<string> | undefined;
  onArtworkError: () => void;
}) {
  const dockHeight = useDockHeight();
  const { artwork, width, height, lamps, altarLamps } = FLAGSHIP_VIEW;
  const stageStyle = { '--art-aspect': width / height } as CSSProperties;
  return (
    <div className="painted-stage-space" style={{ bottom: dockHeight || DOCK_ESTIMATE_PX }}>
      <div className="painted-stage" style={stageStyle}>
        <img src={artwork} width={width} height={height} alt="" onError={onArtworkError} />
        {[
          ...Object.entries(altarLamps),
          ...Object.entries(lamps).filter(([id]) => litLamps?.has(id)),
        ].map(([id, [x, y]]) => (
          <span
            className="painted-lamp-glow"
            key={id}
            aria-hidden="true"
            style={{ left: `${(x / width) * 100}%`, top: `${(y / height) * 100}%` }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
