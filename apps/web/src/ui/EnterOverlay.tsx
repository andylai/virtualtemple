import { useProgress } from '@react-three/drei';
import { useT } from '../i18n/I18nProvider';
import { FLAGSHIP_VIEW } from '../scene/flagshipView';
import { LanguageSelect } from './LanguageSelect';
import { Overlay } from './Overlay';

/** The portrait is composed for the entrance, while the wide image belongs to the live hall. */
const PORTRAIT_ARTWORK = '/art/welcome-altar-portrait.jpg';

/** The first card: shows loading progress, then the Enter button (which also unlocks sound later). */
export function EnterOverlay({
  sceneReady,
  onEnter,
}: {
  sceneReady: boolean;
  onEnter: () => void;
}) {
  const t = useT();
  const { active, progress } = useProgress();
  return (
    <Overlay
      title={t('app.wordmark')}
      level={1}
      className="welcome-overlay"
      beforeTitle={
        <picture className="welcome-art">
          <source
            media="(max-width: 600px) and (orientation: portrait)"
            srcSet={PORTRAIT_ARTWORK}
          />
          <img src={FLAGSHIP_VIEW.artwork} alt="" />
        </picture>
      }
    >
      <p className="welcome-tagline">{t('enter.tagline')}</p>
      <LanguageSelect />
      {sceneReady ? (
        <>
          <button className="welcome-enter" type="button" autoFocus onClick={onEnter}>
            {t('enter.button')}
          </button>
          <p className="welcome-sound">{t('enter.hint')}</p>
        </>
      ) : (
        <p>
          {active
            ? t('loading.progress', { percent: Math.round(progress) })
            : t('loading.preparing')}
        </p>
      )}
    </Overlay>
  );
}
