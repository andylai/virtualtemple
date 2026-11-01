import { RITUALS } from '@temple/shared';
import { useCallback, useEffect, useState } from 'react';
import type { AudioEngine } from '../audio/engine';
import type { HallState } from '../net/hallState';
import { useNow } from '../ui/useNow';
import {
  requestSession,
  stepMeditation,
  type MeditationSession,
  type Observation,
} from './session';

const TICK_MS = 1000;
/** How long the "your meditation is complete" message stays. */
const DONE_MESSAGE_MS = 6000;

/** What the hall's state says about the visitor, as the timer needs it. */
export function observe(state: HallState): Observation {
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  return {
    seated: self?.ritual?.ritualId === 'sit' && self.ritual.slotId !== undefined,
    walking: state.walk !== null,
    refused: state.ritualNotice?.ritualId === 'sit',
  };
}

/** The meditation timer's state and what the visitor can do with it. */
export interface Meditation {
  session: MeditationSession | null;
  /** True for a few seconds after the time ran out. */
  finished: boolean;
  start: (minutes: number) => void;
  stop: () => void;
}

/**
 * Runs the meditation timer (FR-34, FR-35). The visitor asks for a cushion with the `sit` ritual, the
 * clock starts when they are seated, and when it runs out a bell rings and they are stood up.
 * The clock lives in the browser; the hall only keeps the cushion.
 */
export function useMeditation(
  state: HallState,
  engine: AudioEngine,
  startRitual: (id: 'sit') => void,
  stopRitual: () => void,
): Meditation {
  const [session, setSession] = useState<MeditationSession | null>(null);
  const [finished, setFinished] = useState(false);
  const tick = useNow(session === null ? null : TICK_MS);
  const { seated, walking, refused } = observe(state);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const step = stepMeditation(session, { seated, walking, refused }, Date.now());
    if (step.finished) {
      engine.playSfx('bell');
      stopRitual();
      setFinished(true);
    }
    if (step.session !== session) {
      setSession(step.session);
    }
  }, [session, tick, seated, walking, refused, engine, stopRitual]);

  useEffect(() => {
    if (!finished) {
      return undefined;
    }
    const timer = setTimeout(() => setFinished(false), DONE_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [finished]);

  const start = useCallback(
    (minutes: number) => {
      setFinished(false);
      setSession(requestSession(minutes, Date.now()));
      startRitual('sit');
    },
    [startRitual],
  );
  const stop = useCallback(() => {
    setSession(null);
    stopRitual();
  }, [stopRitual]);

  return { session, finished, start, stop };
}

/** Whether a ritual keeps the visitor on a cushion, so walking away by hand should end it. */
export function holdsCushion(ritualId: keyof typeof RITUALS | undefined): boolean {
  return ritualId !== undefined && RITUALS[ritualId].needsSeat;
}
