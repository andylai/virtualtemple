import { useCallback, useState } from 'react';
import type { AudioEngine } from '../audio/engine';
import type { Meditation } from '../meditation/useMeditation';
import type { HallActions } from '../net/useHallActions';

/** Leaving the hall and coming back (FR-4): the sound goes quiet while the exit screen shows. */
export function useLeaving(actions: HallActions, engine: AudioEngine, meditation: Meditation) {
  const [left, setLeft] = useState(false);
  const leave = useCallback(() => {
    meditation.stop();
    actions.leave();
    engine.pause();
    setLeft(true);
  }, [actions, engine, meditation]);
  const stayAgain = useCallback(() => {
    engine.unpause();
    setLeft(false);
    actions.join();
  }, [actions, engine]);
  return { left, leave, stayAgain };
}
