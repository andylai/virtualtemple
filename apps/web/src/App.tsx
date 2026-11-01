import { useProgress } from '@react-three/drei';
import { flagshipManifest } from '@temple/shared/flagship';
import { useMemo, useState } from 'react';
import { useT } from './i18n/I18nProvider';
import { buildHallLayout } from './scene/hallLayout';
import { HallScene } from './scene/HallScene';
import { readDebugFlags } from './scene/queryFlags';
import { FpsCounter } from './ui/FpsCounter';
import { Overlay } from './ui/Overlay';
import { isWebGlAvailable } from './webgl';

/** The app shell: loading screen, "Enter" button, then the 3D hall. */
export function App() {
  const t = useT();
  const flags = useMemo(() => readDebugFlags(window.location.search), []);
  const hasWebGl = useMemo(isWebGlAvailable, []);
  const layout = useMemo(() => buildHallLayout(flagshipManifest.hall), []);
  const [sceneReady, setSceneReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const { active, progress } = useProgress();

  if (!hasWebGl) {
    return (
      <Overlay>
        <p>{t('error.webgl')}</p>
      </Overlay>
    );
  }

  return (
    <>
      <HallScene layout={layout} standIns={flags.stress} onReady={() => setSceneReady(true)} />
      {!entered && (
        <Overlay>
          <h1>{t('app.title')}</h1>
          {sceneReady ? (
            <>
              <button type="button" onClick={() => setEntered(true)}>
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
      )}
      {flags.debug && <FpsCounter detail={`${flags.stress} stand-in avatars`} />}
    </>
  );
}
