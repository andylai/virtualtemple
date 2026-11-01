import { useCallback, useEffect } from 'react';
import type { HallClient } from './hallClient';

/** What the interface can ask of the halls. */
export interface HallActions {
  /** Joins a hall, or tries again after a refusal. */
  join: () => void;
  /** Moves to a hall the visitor picked. */
  switchHall: (hall: number) => void;
  /** Hides the "placed in another hall" message. */
  clearNotice: () => void;
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
  const join = useCallback(() => void client.flow.start(), [client]);
  const switchHall = useCallback(
    (hall: number) => client.flow.switchTo(hall, client.store.getState().nickname),
    [client],
  );
  const clearNotice = useCallback(
    () => client.store.setState({ ...client.store.getState(), notice: null }),
    [client],
  );
  return { join, switchHall, clearNotice };
}
