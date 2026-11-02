import type { RitualId } from '@temple/shared';
import { useEffect, useRef } from 'react';
import type { AudioEngine } from '../audio/engine';
import type { Meditation } from '../meditation/useMeditation';
import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { ChangeHall } from './ChangeHall';
import { InviteButton } from './InviteButton';
import { RitualBar } from './RitualBar';
import { setDockHeight } from '../scene/screenReserve';
import { AboutPanel } from './AboutPanel';
import { MeditateButton } from './Meditation';
import { SettingsPanel } from './SettingsPanel';

interface ToolbarProps {
  state: HallState;
  engine: AudioEngine;
  meditation: Meditation;
  /** Called when the visitor chooses to leave the hall. */
  onLeave: () => void;
  onPickHall: (hall: number) => void;
  onStartRitual: (ritualId: RitualId) => void;
  onStopRitual: () => void;
}

/** Reports the height of the button area, so the camera can keep the hall clear of it. */
function useReportHeight(joined: boolean) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = element.current;
    if (!joined || dock === null) {
      return undefined;
    }
    const report = () => setDockHeight(dock.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      setDockHeight(0);
    };
  }, [joined]);
  return element;
}

/** The buttons along the bottom while the visitor is in a hall: the quick rituals, then everything else. */
export function Toolbar(props: ToolbarProps) {
  const { state, engine, meditation, onLeave, onPickHall, onStartRitual, onStopRitual } = props;
  const t = useT();
  const joined = state.status === 'joined' && state.hall !== null;
  const dock = useReportHeight(joined);
  if (!joined || state.hall === null) {
    return null;
  }
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  const canStop = state.walk !== null || self?.ritual?.ritualId === 'bow';
  return (
    <div className="dock" ref={dock}>
      <RitualBar onStart={onStartRitual} onStop={onStopRitual} canStop={canStop}>
        <MeditateButton meditation={meditation} />
      </RitualBar>
      <div className="toolbar">
        <ChangeHall currentHall={state.hall} onPick={onPickHall} />
        <InviteButton hall={state.hall} />
        <SettingsPanel engine={engine} />
        <AboutPanel />
        <button type="button" onClick={onLeave}>
          {t('exit.button')}
        </button>
      </div>
    </div>
  );
}
