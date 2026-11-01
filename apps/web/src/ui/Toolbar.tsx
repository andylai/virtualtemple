import { DEFAULT_CONFIG, type RitualId } from '@temple/shared';
import { useEffect } from 'react';
import type { AudioEngine } from '../audio/engine';
import type { Meditation } from '../meditation/useMeditation';
import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { ChangeHall } from './ChangeHall';
import { InviteButton } from './InviteButton';
import { RitualBar } from './RitualBar';
import { ritualNoticeKey } from './ritualLabels';
import { AboutPanel } from './AboutPanel';
import { MeditateButton } from './Meditation';
import { SettingsPanel } from './SettingsPanel';

const MS_PER_SECOND = 1000;

interface ToolbarProps {
  state: HallState;
  engine: AudioEngine;
  meditation: Meditation;
  /** Called when the visitor chooses to leave the hall. */
  onLeave: () => void;
  onPickHall: (hall: number) => void;
  /** Called when the "placed in another hall" message has been shown long enough. */
  onNoticeShown: () => void;
  onStartRitual: (ritualId: RitualId) => void;
  onStopRitual: () => void;
  /** Called when the "no free cushion" kind of message has been shown long enough. */
  onRitualNoticeShown: () => void;
}

/** Calls `onDone` after the message has been on screen for a toast's lifetime. */
function useExpiry(active: boolean, onDone: () => void): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setTimeout(onDone, DEFAULT_CONFIG.ui.toastSeconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [active, onDone]);
}

/** The buttons along the bottom while the visitor is in a hall, and the short messages about the hall. */
export function Toolbar(props: ToolbarProps) {
  const {
    state,
    engine,
    meditation,
    onLeave,
    onPickHall,
    onNoticeShown,
    onStartRitual,
    onStopRitual,
    onRitualNoticeShown,
  } = props;
  const t = useT();
  const joined = state.status === 'joined' && state.hall !== null;
  const notice = joined ? state.notice : null;
  const ritualNotice = joined ? state.ritualNotice : null;
  useExpiry(notice !== null, onNoticeShown);
  useExpiry(ritualNotice !== null, onRitualNoticeShown);

  if (!joined || state.hall === null) {
    return null;
  }
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  const canStop = state.walk !== null || self?.ritual?.ritualId === 'bow';
  return (
    <>
      {notice !== null && (
        <div className="banner" role="status">
          {t('status.placed', { from: notice.fromHall, to: notice.toHall })}
        </div>
      )}
      {ritualNotice !== null && (
        <div className="banner" role="status">
          {t(ritualNoticeKey(ritualNotice))}
        </div>
      )}
      <RitualBar onStart={onStartRitual} onStop={onStopRitual} canStop={canStop} />
      <div className="toolbar">
        <ChangeHall currentHall={state.hall} onPick={onPickHall} />
        <InviteButton hall={state.hall} />
        <MeditateButton meditation={meditation} />
        <SettingsPanel engine={engine} />
        <AboutPanel />
        <button type="button" onClick={onLeave}>
          {t('exit.button')}
        </button>
      </div>
    </>
  );
}
