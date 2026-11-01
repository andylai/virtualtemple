import type { TempleManifest } from '@temple/shared';
import type { SoundName } from './engine';
import { synthAmbient, synthBell, synthChant, synthLampChime } from './synth';

/** Placeholder sounds are made at this sample rate: low, to keep their memory small. */
const SYNTH_RATE = 22050;
const AMBIENT_SECONDS = 12;
/** A multiple of 4, so the chant repeats seamlessly. */
const CHANT_SECONDS = 20;

/**
 * Where a sound's recording is, as named in the manifest.
 *
 * @param manifest - The temple's manifest.
 * @param name - Which sound.
 * @param baseUrl - Where the app's files are served from.
 */
export function soundUrl(manifest: TempleManifest, name: SoundName, baseUrl: string): string {
  const { audio } = manifest;
  const path = {
    ambient: audio.ambient,
    chanting: audio.chanting,
    bell: audio.sfx.bell,
    lamp: audio.sfx.lamp,
  }[name];
  return `${baseUrl}${path}`;
}

function synthesise(name: SoundName): Float32Array<ArrayBuffer> {
  switch (name) {
    case 'ambient':
      return synthAmbient(SYNTH_RATE, AMBIENT_SECONDS);
    case 'chanting':
      return synthChant(SYNTH_RATE, CHANT_SECONDS);
    case 'bell':
      return synthBell(SYNTH_RATE);
    case 'lamp':
      return synthLampChime(SYNTH_RATE);
  }
}

/**
 * Gets a sound as a buffer: the recording if there is one and it can be read, otherwise a
 * placeholder made in code. A missing file is normal for now, since the real recordings do not exist yet.
 *
 * @param context - The audio context the buffer is for.
 * @param name - Which sound.
 * @param url - Where its recording should be.
 * @param fetchFn - `fetch`, passed in so tests can replace it.
 */
export async function loadSoundBuffer(
  context: AudioContext,
  name: SoundName,
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<AudioBuffer> {
  try {
    const response = await fetchFn(url);
    // A development server answers a missing file with its home page, which is not audio.
    if (response.ok && (response.headers.get('content-type') ?? '').startsWith('audio')) {
      return await context.decodeAudioData(await response.arrayBuffer());
    }
  } catch {
    // Fall through to the placeholder.
  }
  const samples = synthesise(name);
  const buffer = context.createBuffer(1, samples.length, SYNTH_RATE);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
