import { useFrame } from '@react-three/fiber';
import type { PlayerView } from '@temple/shared';
import { useRef } from 'react';
import type { Group } from 'three';
import { renderDelayMs, type TrackSet } from '../net/interpolation';
import { AVATAR_BASE_Y, Avatar } from './Avatar';

const DEGREES_TO_RADIANS = Math.PI / 180;

interface RemotePlayersProps {
  players: ReadonlyMap<string, PlayerView>;
  selfId: string | null;
  tracks: TrackSet;
  positionSendHz: number;
}

function RemotePlayer({
  player,
  tracks,
  delayMs,
}: {
  player: PlayerView;
  tracks: TrackSet;
  delayMs: number;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const sample = tracks.get(player.id)?.sampleAt(performance.now() - delayMs);
    if (group.current !== null && sample !== null && sample !== undefined) {
      group.current.position.set(sample.x, AVATAR_BASE_Y, sample.z);
      group.current.rotation.y = -sample.facing * DEGREES_TO_RADIANS;
    }
  });
  return (
    <group ref={group} position={[player.x, AVATAR_BASE_Y, player.z]}>
      <Avatar avatarId={player.avatarId} />
    </group>
  );
}

/**
 * Everyone else in the hall. Each person is drawn slightly in the past, blended between the last
 * two positions the server sent, so walking looks smooth (FR-15). React redraws this only when
 * someone joins or leaves; positions are set directly every frame.
 */
export function RemotePlayers({ players, selfId, tracks, positionSendHz }: RemotePlayersProps) {
  const delayMs = renderDelayMs(positionSendHz);
  return (
    <>
      {[...players.values()]
        .filter((player) => player.id !== selfId)
        .map((player) => (
          <RemotePlayer key={player.id} player={player} tracks={tracks} delayMs={delayMs} />
        ))}
    </>
  );
}
