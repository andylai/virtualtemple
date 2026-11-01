import { useEffect, useRef, useState } from 'react';
import type { HallState } from '../net/hallState';
import { createAudioEngine } from './createAudioEngine';
import type { AudioEngine } from './engine';
import { selfSounds, soundSnapshot, type SoundSnapshot } from './selfSounds';

/**
 * Ties the sound to the hall: communal chanting follows the server's announcements, and the visitor's
 * own bow and lamp ring a bell and a chime. Returns the engine, which must be unlocked from a click.
 */
export function useHallAudio(state: HallState): AudioEngine {
  const [engine] = useState(createAudioEngine);

  useEffect(() => {
    if (state.chanting === null) {
      engine.cancelCommunal();
    } else {
      engine.scheduleCommunal(state.chanting, state.clockOffsetMs);
    }
  }, [engine, state.chanting, state.clockOffsetMs]);

  const previous = useRef<SoundSnapshot | null>(null);
  useEffect(() => {
    if (state.status !== 'joined') {
      return;
    }
    const next = soundSnapshot(state);
    // The first look only learns what is already there, so lamps lit earlier do not chime on arrival.
    if (previous.current !== null) {
      selfSounds(previous.current, next).forEach((sound) => engine.playSfx(sound));
    }
    previous.current = next;
  }, [engine, state]);

  return engine;
}
