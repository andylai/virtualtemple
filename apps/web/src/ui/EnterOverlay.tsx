import { useProgress } from '@react-three/drei';
import { useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

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
    <Overlay>
      <h1>{t('app.title')}</h1>
      {sceneReady ? (
        <>
          <button type="button" onClick={onEnter}>
            {t('enter.button')}
          </button>
          <p>{t('enter.hint')}</p>
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
