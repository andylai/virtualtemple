import type { RitualId } from '@temple/shared';
import { useCallback, useEffect } from 'react';
import type { HallClient } from './hallClient';
import { INITIAL_HALL_STATE } from './hallState';

/** What the interface can ask of the halls. */
export interface HallActions {
  /** Joins a hall, or tries again after a refusal. */
  join: () => void;
  /** Moves to a hall the visitor picked. */
  switchHall: (hall: number) => void;
  /** Hides the "placed in another hall" message. */
  clearNotice: () => void;
  /** Asks the hall to start a ritual. */
  startRitual: (ritualId: RitualId) => void;
  /** Asks the hall to end the visitor's ritual and free their cushion. */
  stopRitual: () => void;
  /** Leaves the hall and forgets who was in it. */
  leave: () => void;
  /** Hides a toast that was shown long enough. */
  dismissToast: (id: number) => void;
  /** Hides the message that a ritual did not start. */
  clearRitualNotice: () => void;
}

/** Gives the interface its actions on the hall client, and disconnects when the page goes away. */
export function useHallActions(client: HallClient): HallActions {
  useEffect(
    () => () => {
      client.flow.dispose();
      client.connection.close();
    },
    [client],
  );
  const update = useCallback(
    (
      change: (
        state: ReturnType<typeof client.store.getState>,
      ) => ReturnType<typeof client.store.getState>,
    ) => client.store.setState(change(client.store.getState())),
    [client],
  );
  return {
    join: useCallback(() => void client.flow.start(), [client]),
    switchHall: useCallback(
      (hall: number) => client.flow.switchTo(hall, client.store.getState().nickname),
      [client],
    ),
    clearNotice: useCallback(() => update((state) => ({ ...state, notice: null })), [update]),
    startRitual: useCallback(
      (ritualId: RitualId) => client.connection.startRitual(ritualId),
      [client],
    ),
    stopRitual: useCallback(() => client.connection.stopRitual(), [client]),
    leave: useCallback(() => {
      client.flow.dispose();
      client.connection.close();
      client.store.setState(INITIAL_HALL_STATE);
    }, [client]),
    dismissToast: useCallback(
      (id: number) =>
        update((state) => ({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) })),
      [update],
    ),
    clearRitualNotice: useCallback(
      () => update((state) => ({ ...state, ritualNotice: null })),
      [update],
    ),
  };
}
