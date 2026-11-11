import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider';
import { FLAGSHIP_VIEW } from './flagshipView';
import { useDockHeight } from './screenReserve';
import { readSelfAcross, slideToKeepInSight, watchSelfAcross } from './selfView';

/** Space for the permanent controls before the dock has reported its actual size. */
const DOCK_ESTIMATE_PX = 88;

const PERCENT = 100;

/**
 * Slides the enlarged stage sideways while `active`, so the visitor's own avatar is never in a
 * clipped strip (ADR-049). The whole stage moves as one element, so the artwork, the lamps, the
 * avatars and floor taps stay aligned. The style is set directly because it changes every frame
 * while the visitor walks.
 */
function useSlideToSelf(active: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = stage.current;
    const frame = element?.parentElement;
    if (!active || element === null || frame === null || frame === undefined) {
      return undefined;
    }
    const slide = () => {
      // Measured, not assumed: on a short screen the stage is limited by height and is less enlarged.
      const zoom = element.offsetWidth / frame.clientWidth;
      element.style.translate = `${slideToKeepInSight(readSelfAcross(), zoom) * PERCENT}%`;
    };
    slide();
    const stopWatching = watchSelfAcross(slide);
    const observer = new ResizeObserver(slide);
    observer.observe(frame);
    return () => {
      stopWatching();
      observer.disconnect();
      element.style.translate = '';
    };
  }, [active]);
  return stage;
}

/** Keep the scenery and live WebGL layer on the same rectangle at every screen size. */
export function PaintedStage({
  children,
  joined,
  litLamps,
  onArtworkError,
}: {
  children: ReactNode;
  /** View controls appear only once a visitor is inside the hall. */
  joined: boolean;
  litLamps: ReadonlySet<string> | undefined;
  onArtworkError: () => void;
}) {
  const dockHeight = useDockHeight();
  const t = useT();
  const [closeView, setCloseView] = useState(false);
  const { artwork, width, height, lamps, altarLamps } = FLAGSHIP_VIEW;
  const stageStyle = { '--art-aspect': width / height } as CSSProperties;
  const stage = useSlideToSelf(joined && closeView);
  return (
    <div className="painted-stage-space" style={{ bottom: dockHeight || DOCK_ESTIMATE_PX }}>
      <div className="painted-stage-frame">
        <div
          className="painted-stage"
          ref={stage}
          style={stageStyle}
          data-close-view={joined && closeView}
        >
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
      {joined && (
        <div className="hall-view-options" role="group" aria-label={t('hall.view')}>
          <button type="button" aria-pressed={!closeView} onClick={() => setCloseView(false)}>
            {t('hall.viewWhole')}
          </button>
          <button type="button" aria-pressed={closeView} onClick={() => setCloseView(true)}>
            {t('hall.viewClose')}
          </button>
        </div>
      )}
    </div>
  );
}
