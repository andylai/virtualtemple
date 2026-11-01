import { flagshipManifest } from '@temple/shared/flagship';
import type { Point } from '@temple/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage, useT } from './i18n/I18nProvider';
import { createHallClient, hallFromAddress } from './net/hallClient';
import { buildHallLayout } from './scene/hallLayout';
import { HallPeople } from './scene/HallPeople';
import { HallScene } from './scene/HallScene';
import { readDebugFlags } from './scene/queryFlags';
import { EnterOverlay } from './ui/EnterOverlay';
import { FpsCounter } from './ui/FpsCounter';
import { HallStatus } from './ui/HallStatus';
import { Hud } from './ui/Hud';
import { Overlay } from './ui/Overlay';
import { isWebGlAvailable } from './webgl';

/** The app shell: the Enter card, then the hall with the people in it. */
export function App() {
  const t = useT();
  const language = useLanguage();
  const flags = useMemo(() => readDebugFlags(window.location.search), []);
  const hasWebGl = useMemo(isWebGlAvailable, []);
  const layout = useMemo(() => buildHallLayout(flagshipManifest.hall), []);
  const [client] = useState(() =>
    createHallClient(hallFromAddress(window.location.search), language),
  );
  const state = useSyncExternalStore(client.store.subscribe, client.store.getState);
  const walkTarget = useRef<Point | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => () => client.connection.close(), [client]);
  const join = useCallback(() => client.connection.connect(), [client]);
  const enter = useCallback(() => {
    setEntered(true);
    join();
  }, [join]);

  if (!hasWebGl) {
    return (
      <Overlay>
        <p>{t('error.webgl')}</p>
      </Overlay>
    );
  }
  return (
    <>
      <HallScene
        layout={layout}
        standIns={flags.stress}
        onReady={() => setSceneReady(true)}
        onFloorClick={(point) => {
          walkTarget.current = point;
        }}
      >
        <HallPeople client={client} state={state} walkTarget={walkTarget} />
      </HallScene>
      {entered ? (
        <HallStatus state={state} onRetry={join} />
      ) : (
        <EnterOverlay sceneReady={sceneReady} onEnter={enter} />
      )}
      <Hud state={state} />
      {flags.debug && <FpsCounter detail={`${flags.stress} stand-in avatars`} />}
    </>
  );
}
