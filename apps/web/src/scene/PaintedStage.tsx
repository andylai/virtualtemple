import { useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider';
import { FLAGSHIP_VIEW } from './flagshipView';
import { useDockHeight } from './screenReserve';

/** Space for the permanent controls before the dock has reported its actual size. */
const DOCK_ESTIMATE_PX = 88;

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
  const [altarView, setAltarView] = useState(false);
  const { artwork, width, height, lamps, altarLamps } = FLAGSHIP_VIEW;
  const stageStyle = { '--art-aspect': width / height } as CSSProperties;
  return (
    <div className="painted-stage-space" style={{ bottom: dockHeight || DOCK_ESTIMATE_PX }}>
      <div className="painted-stage-frame">
        <div className="painted-stage" style={stageStyle} data-altar-view={joined && altarView}>
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
          <button type="button" aria-pressed={!altarView} onClick={() => setAltarView(false)}>
            {t('hall.viewWhole')}
          </button>
          <button type="button" aria-pressed={altarView} onClick={() => setAltarView(true)}>
            {t('hall.viewAltar')}
          </button>
        </div>
      )}
    </div>
  );
}
