import { flagshipManifest } from '@temple/shared/flagship';
import type { Point } from '@temple/shared';
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { HallClient } from '../net/hallClient';
import type { HallState } from '../net/hallState';
import { RemotePlayers } from './RemotePlayers';
import { SelfAvatar, type Snap } from './SelfAvatar';

interface HallPeopleProps {
  client: HallClient;
  state: HallState;
  walkTarget: MutableRefObject<Point | null>;
}

const cushionSpot = (slotId: string): Snap | undefined => {
  const cushion = flagshipManifest.hall.cushions.find((c) => c.id === slotId);
  return cushion === undefined ? undefined : { x: cushion.x, z: cushion.z, facing: cushion.facing };
};

/** Everyone in the hall: other people drawn from the server's updates, and the visitor's own avatar. */
export function HallPeople({ client, state, walkTarget }: HallPeopleProps) {
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  const inHall = state.status === 'joined' || state.status === 'reconnecting';
  const snap = useRef<Snap | null>(null);
  const seatId = self?.ritual?.slotId;
  const walk = state.walk;

  // The hall gave the visitor a cushion: walk to it.
  useEffect(() => {
    if (walk !== null) {
      walkTarget.current = { x: walk.x, z: walk.z };
    }
  }, [walk, walkTarget]);

  // The visitor reached the cushion: the hall put them exactly on it, so do the same here.
  useEffect(() => {
    const spot = seatId === undefined ? undefined : cushionSpot(seatId);
    if (spot !== undefined) {
      snap.current = spot;
    }
  }, [seatId]);

  return (
    <>
      <RemotePlayers
        players={state.players}
        selfId={state.selfId}
        tracks={client.tracks}
        ritualClock={client.ritualClock}
        positionSendHz={state.positionSendHz}
      />
      {inHall && self !== undefined && (
        <SelfAvatar
          key={self.id}
          start={self}
          playerId={self.id}
          avatarId={self.avatarId}
          ritualClock={client.ritualClock}
          walkableArea={flagshipManifest.hall.walkableArea}
          sendHz={state.positionSendHz}
          onMove={(x, z, facing) => client.connection.sendMove(x, z, facing)}
          onKeyMove={() => stopBowIfBusy(client, client.store.getState())}
          walkTarget={walkTarget}
          snap={snap}
        />
      )}
    </>
  );
}

/** Walking away by hand cancels a bow that is under way, and frees the cushion. */
export function stopBowIfBusy(client: HallClient, state: HallState): void {
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  if (state.walk !== null || self?.ritual?.ritualId === 'bow') {
    client.connection.stopRitual();
  }
}
