import { flagshipManifest } from '@temple/shared/flagship';
import type { Point } from '@temple/shared';
import type { MutableRefObject } from 'react';
import type { HallClient } from '../net/hallClient';
import type { HallState } from '../net/hallState';
import { RemotePlayers } from './RemotePlayers';
import { SelfAvatar } from './SelfAvatar';

interface HallPeopleProps {
  client: HallClient;
  state: HallState;
  walkTarget: MutableRefObject<Point | null>;
}

/** Everyone in the hall: other people drawn from the server's updates, and the visitor's own avatar. */
export function HallPeople({ client, state, walkTarget }: HallPeopleProps) {
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  const inHall = state.status === 'joined' || state.status === 'reconnecting';
  return (
    <>
      <RemotePlayers
        players={state.players}
        selfId={state.selfId}
        tracks={client.tracks}
        positionSendHz={state.positionSendHz}
      />
      {inHall && self !== undefined && (
        <SelfAvatar
          key={self.id}
          start={self}
          avatarId={self.avatarId}
          walkableArea={flagshipManifest.hall.walkableArea}
          sendHz={state.positionSendHz}
          onMove={(x, z, facing) => client.connection.sendMove(x, z, facing)}
          walkTarget={walkTarget}
        />
      )}
    </>
  );
}
