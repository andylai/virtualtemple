import type { HallState } from '../net/hallState';
import type { SfxName } from './engine';

/** What the audio needs to know about the visitor from one moment to the next. */
export interface SoundSnapshot {
  /** Whether the visitor is bowing on a cushion. */
  bowing: boolean;
  /** The lamp places the visitor has lit. */
  ownLamps: ReadonlySet<string>;
}

/**
 * Chooses the sound effects to play when the visitor's state changes: a bell as their bow begins, and
 * a chime for a lamp they light. Other people's rituals are seen and read, not heard.
 *
 * @param previous - How things were.
 * @param next - How they are now.
 */
export function selfSounds(previous: SoundSnapshot, next: SoundSnapshot): SfxName[] {
  const sounds: SfxName[] = [];
  if (next.bowing && !previous.bowing) {
    sounds.push('bell');
  }
  if ([...next.ownLamps].some((slotId) => !previous.ownLamps.has(slotId))) {
    sounds.push('lamp');
  }
  return sounds;
}

/** Reads what the audio needs to know about the visitor out of the hall's state. */
export function soundSnapshot(state: HallState): SoundSnapshot {
  const self = state.selfId === null ? undefined : state.players.get(state.selfId);
  const ownLamps = new Set<string>();
  state.lamps.forEach((ownerId, slotId) => {
    if (ownerId === state.selfId) {
      ownLamps.add(slotId);
    }
  });
  return {
    bowing: self?.ritual?.ritualId === 'bow' && self.ritual.slotId !== undefined,
    ownLamps,
  };
}
