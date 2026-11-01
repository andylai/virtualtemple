import { DEFAULT_CONFIG } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { AudioEngine } from './engine';
import { loadSoundBuffer, soundUrl } from './soundAssets';

/** Some older Safari versions only have the prefixed name. */
type AudioContextConstructor = typeof AudioContext;

/** Builds the audio engine for the browser. No sound plays until `unlock()` is called from a click. */
export function createAudioEngine(): AudioEngine {
  const prefixed = (window as unknown as { webkitAudioContext?: AudioContextConstructor })
    .webkitAudioContext;
  const Context: AudioContextConstructor =
    window.AudioContext ?? (prefixed as AudioContextConstructor);
  return new AudioEngine({
    createContext: () => new Context(),
    loadBuffer: (context, name) =>
      loadSoundBuffer(context, name, soundUrl(flagshipManifest, name, import.meta.env.BASE_URL)),
    volumes: { ...DEFAULT_CONFIG.audio.defaultVolumes },
    epochNow: () => Date.now(),
  });
}
