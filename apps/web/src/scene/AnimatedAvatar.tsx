import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { RitualClock } from '../net/ritualClock';
import { AVATAR_BASE_Y, Avatar } from './Avatar';
import { REST_POSE, ritualPose } from './ritualPose';

interface AnimatedAvatarProps {
  playerId: string;
  avatarId: number;
  isSelf?: boolean;
  clock: RitualClock;
}

/**
 * An avatar that performs the ritual its owner is doing. The body leans, bobs or pulses about the
 * feet according to `ritualPose`, read every frame from the ritual clock (not from React state).
 */
export function AnimatedAvatar({ playerId, avatarId, isSelf = false, clock }: AnimatedAvatarProps) {
  const pivot = useRef<Group>(null);
  useFrame(() => {
    const run = clock.get(playerId);
    const pose =
      run === undefined ? REST_POSE : ritualPose(run.ritualId, performance.now() - run.startedAtMs);
    if (pivot.current !== null) {
      pivot.current.rotation.x = -pose.pitch;
      pivot.current.position.y = -AVATAR_BASE_Y + pose.lift;
      pivot.current.scale.setScalar(pose.scale);
    }
  });
  return (
    <group ref={pivot} position={[0, -AVATAR_BASE_Y, 0]}>
      <group position={[0, AVATAR_BASE_Y, 0]}>
        <Avatar avatarId={avatarId} isSelf={isSelf} />
      </group>
    </group>
  );
}
