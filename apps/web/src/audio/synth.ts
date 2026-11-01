/**
 * Placeholder sounds made from arithmetic, so the app has sound before real recordings exist.
 * Each function returns one channel of samples between -1 and 1. The real recordings replace them
 * through the manifest's audio paths; these are used whenever a file cannot be loaded.
 */

const TAU = 2 * Math.PI;
const PEAK = 0.8;

/** A small repeatable random number generator (mulberry32), so a sound is the same every time. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scales a sound so its loudest sample is `PEAK`. */
function normalise(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let loudest = 0;
  for (const sample of samples) {
    loudest = Math.max(loudest, Math.abs(sample));
  }
  const gain = loudest === 0 ? 1 : PEAK / loudest;
  return samples.map((sample) => sample * gain);
}

/**
 * Makes a sound repeat without a click: the end is blended into the start, and the sound gets
 * shorter by the length of the blend.
 */
function makeLoop(
  samples: Float32Array<ArrayBuffer>,
  fadeSamples: number,
): Float32Array<ArrayBuffer> {
  const length = samples.length - fadeSamples;
  const loop = samples.slice(0, length);
  for (let i = 0; i < fadeSamples; i += 1) {
    const share = i / fadeSamples;
    loop[i] = (samples[i] as number) * share + (samples[length + i] as number) * (1 - share);
  }
  return loop;
}

/**
 * Wind in trees: soft low-pass noise that swells and fades slowly. It repeats seamlessly.
 *
 * @param sampleRate - Samples per second.
 * @param seconds - Length of the repeating part.
 */
export function synthAmbient(sampleRate: number, seconds: number): Float32Array<ArrayBuffer> {
  const fade = Math.floor(sampleRate * 1);
  const total = Math.floor(sampleRate * seconds) + fade;
  const random = seededRandom(7);
  const noise = new Float32Array(total);
  let low = 0;
  for (let i = 0; i < total; i += 1) {
    low += 0.04 * (random() * 2 - 1 - low);
    const swell = 0.65 + 0.35 * Math.sin((TAU * i) / (sampleRate * 7));
    noise[i] = low * swell;
  }
  return normalise(makeLoop(noise, fade));
}

/**
 * A low, steady chant-like hum: a voice with a few overtones, a second voice slightly out of tune
 * for a slow beating, a gentle vibrato, and a pulse every few seconds like phrases. Every
 * frequency fits a whole number of times into `seconds`, so it repeats seamlessly.
 *
 * @param sampleRate - Samples per second.
 * @param seconds - Length of the repeating part; use a multiple of 4.
 */
export function synthChant(sampleRate: number, seconds: number): Float32Array<ArrayBuffer> {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  const base = 110;
  const overtones = [1, 0.6, 0.45, 0.3, 0.2];
  const detune = 0.5;
  const vibrato = { rate: 5.5, depth: 0.0006 };
  const pulseRate = 0.25;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const wobble = vibrato.depth * Math.sin(TAU * vibrato.rate * t);
    let sample = 0;
    overtones.forEach((weight, index) => {
      const frequency = base * (index + 1);
      sample += weight * Math.sin(TAU * frequency * (t + wobble));
      sample += weight * 0.8 * Math.sin(TAU * (frequency + detune * (index + 1)) * (t + wobble));
    });
    const pulse = 0.75 + 0.25 * Math.sin(TAU * pulseRate * t);
    out[i] = sample * pulse;
  }
  return normalise(out);
}

/** A struck temple bell: several partials, each fading at its own speed. */
export function synthBell(sampleRate: number, seconds = 4): Float32Array<ArrayBuffer> {
  const partials = [
    { ratio: 1, weight: 1, decay: 3 },
    { ratio: 2, weight: 0.6, decay: 2.2 },
    { ratio: 2.76, weight: 0.4, decay: 1.6 },
    { ratio: 5.4, weight: 0.25, decay: 1 },
  ];
  const base = 440;
  const attack = 0.005;
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const rise = Math.min(1, t / attack);
    let sample = 0;
    for (const { ratio, weight, decay } of partials) {
      sample += weight * Math.exp(-t / decay) * Math.sin(TAU * base * ratio * t);
    }
    out[i] = sample * rise;
  }
  return normalise(out);
}

/** A short high chime for a lamp being lit. */
export function synthLampChime(sampleRate: number, seconds = 1.6): Float32Array<ArrayBuffer> {
  const tones = [
    { frequency: 880, weight: 1, decay: 0.7 },
    { frequency: 1320, weight: 0.5, decay: 0.5 },
  ];
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    for (const { frequency, weight, decay } of tones) {
      sample += weight * Math.exp(-t / decay) * Math.sin(TAU * frequency * t);
    }
    out[i] = sample * Math.min(1, t / 0.004);
  }
  return normalise(out);
}
