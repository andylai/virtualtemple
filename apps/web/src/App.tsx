import { flagshipManifest } from '@temple/shared/flagship';
import type { Point } from '@temple/shared';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLanguage, useT } from './i18n/I18nProvider';
import { createHallClient, requestedHallFromAddress, type HallClient } from './net/hallClient';
import type { AudioEngine } from './audio/engine';
import { useHallAudio } from './audio/useHallAudio';
import type { HallState } from './net/hallState';
import { useHallActions, type HallActions } from './net/useHallActions';
import { buildHallLayout } from './scene/hallLayout';
import { HallPeople, stopBowIfBusy } from './scene/HallPeople';
import { HallScene } from './scene/HallScene';
import { readDebugFlags } from './scene/queryFlags';
import { ChantingBanner } from './ui/ChantingBanner';
import { EnterOverlay } from './ui/EnterOverlay';
import { FpsCounter } from './ui/FpsCounter';
import { HallStatus } from './ui/HallStatus';
import { Hud } from './ui/Hud';
import { Overlay } from './ui/Overlay';
import { SpecialDayBanner } from './ui/SpecialDayBanner';
import { Toasts } from './ui/Toasts';
import { Toolbar } from './ui/Toolbar';
import { useRitualKeys } from './ui/useRitualKeys';
import { isWebGlAvailable } from './webgl';

/** The text and buttons over the hall: who is here, banners, toasts and the toolbar. */
function HallOverlays({
  state,
  actions,
  engine,
}: {
  state: HallState;
  actions: HallActions;
  engine: AudioEngine;
}) {
  return (
    <>
      <Hud state={state} />
      <SpecialDayBanner state={state} />
      <ChantingBanner state={state} />
      <Toasts toasts={state.toasts} onDismiss={actions.dismissToast} />
      <Toolbar
        state={state}
        engine={engine}
        onPickHall={actions.switchHall}
        onNoticeShown={actions.clearNotice}
        onStartRitual={actions.startRitual}
        onStopRitual={actions.stopRitual}
        onRitualNoticeShown={actions.clearRitualNotice}
      />
    </>
  );
}

/** The hall with its people, once the page is ready: scene, status messages, buttons and toasts. */
function HallView({ client }: { client: HallClient }) {
  const flags = useMemo(() => readDebugFlags(window.location.search), []);
  const layout = useMemo(() => buildHallLayout(flagshipManifest.hall), []);
  const state = useSyncExternalStore(client.store.subscribe, client.store.getState);
  const actions = useHallActions(client);
  const engine = useHallAudio(state);
  const walkTarget = useRef<Point | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const litLamps = useMemo(() => new Set(state.lamps.keys()), [state.lamps]);

  useRitualKeys(state.status === 'joined', actions.startRitual);
  const enter = useCallback(() => {
    // Browsers allow sound only after a click, so it is unlocked here.
    engine.unlock();
    setEntered(true);
    actions.join();
  }, [actions, engine]);
  const clickFloor = useCallback(
    (point: Point) => {
      walkTarget.current = point;
      stopBowIfBusy(client, client.store.getState());
    },
    [client],
  );

  return (
    <>
      <HallScene
        layout={layout}
        standIns={flags.stress}
        onReady={() => setSceneReady(true)}
        onFloorClick={clickFloor}
        litLamps={litLamps}
      >
        <HallPeople client={client} state={state} walkTarget={walkTarget} />
      </HallScene>
      {entered ? (
        <HallStatus state={state} onRetry={actions.join} />
      ) : (
        <EnterOverlay sceneReady={sceneReady} onEnter={enter} />
      )}
      <HallOverlays state={state} actions={actions} engine={engine} />
      {flags.debug && <FpsCounter detail={`${flags.stress} stand-in avatars`} />}
    </>
  );
}

/** The app shell: checks the browser can draw 3D, then shows the hall. */
export function App() {
  const t = useT();
  const language = useLanguage();
  const hasWebGl = useMemo(isWebGlAvailable, []);
  const [client] = useState(() =>
    createHallClient(language, requestedHallFromAddress(window.location.search)),
  );
  if (!hasWebGl) {
    return (
      <Overlay>
        <p>{t('error.webgl')}</p>
      </Overlay>
    );
  }
  return <HallView client={client} />;
}
