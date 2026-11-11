import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it, vi } from 'vitest';
import { loadSoundBuffer, soundUrl } from './soundAssets';

function fakeContext() {
  const decoded = { decoded: true };
  const copied: Float32Array[] = [];
  return {
    decoded,
    copied,
    context: {
      decodeAudioData: vi.fn(async () => decoded),
      createBuffer: vi.fn((_channels: number, length: number, rate: number) => ({
        length,
        sampleRate: rate,
        copyToChannel: (samples: Float32Array) => copied.push(samples),
      })),
    } as unknown as AudioContext,
  };
}

const audioResponse = () =>
  new Response(new ArrayBuffer(8), { status: 200, headers: { 'content-type': 'audio/ogg' } });

describe('soundUrl', () => {
  const withRecordings = {
    ...flagshipManifest,
    audio: {
      ...flagshipManifest.audio,
      chanting: 'audio/chanting.opus',
      sfx: { bell: 'audio/bell.opus', lamp: 'audio/lamp.opus' },
    },
  };

  it('joins the base address and the manifest path for each sound', () => {
    expect(soundUrl(withRecordings, 'ambient', '/')).toBe('/audio/ambient.opus');
    expect(soundUrl(withRecordings, 'chanting', '/app/')).toBe('/app/audio/chanting.opus');
    expect(soundUrl(withRecordings, 'bell', '/')).toBe('/audio/bell.opus');
    expect(soundUrl(withRecordings, 'lamp', '/')).toBe('/audio/lamp.opus');
  });

  it('has no address for a sound the manifest has no recording of', () => {
    const none = {
      ...withRecordings,
      audio: { ...withRecordings.audio, chanting: null, sfx: { bell: null, lamp: null } },
    };
    expect(soundUrl(none, 'chanting', '/')).toBeNull();
    expect(soundUrl(none, 'bell', '/')).toBeNull();
    expect(soundUrl(none, 'lamp', '/')).toBeNull();
    expect(soundUrl(none, 'ambient', '/')).toBe('/audio/ambient.opus');
  });
});

describe('loadSoundBuffer', () => {
  it('uses the recording when there is one', async () => {
    const { context, decoded } = fakeContext();
    const buffer = await loadSoundBuffer(context, 'bell', '/audio/bell.opus', async () =>
      audioResponse(),
    );
    expect(buffer).toBe(decoded);
  });

  it.each([
    ['a missing file', async () => new Response('nope', { status: 404 })],
    [
      'a home page where the file should be',
      async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ],
    ['a network failure', async () => Promise.reject(new Error('offline'))],
  ])('falls back to a placeholder for %s', async (_label, answer) => {
    const { context, copied } = fakeContext();
    const buffer = (await loadSoundBuffer(
      context,
      'chanting',
      '/x',
      answer as typeof fetch,
    )) as unknown as {
      length: number;
      sampleRate: number;
    };
    expect(buffer.sampleRate).toBe(22050);
    expect(buffer.length).toBe(22050 * 20);
    expect(copied).toHaveLength(1);
  });

  it('makes the placeholder without asking for anything when there is no recording', async () => {
    const { context, copied } = fakeContext();
    const fetchFn = vi.fn();
    const buffer = (await loadSoundBuffer(context, 'bell', null, fetchFn)) as unknown as {
      sampleRate: number;
    };
    expect(fetchFn).not.toHaveBeenCalled();
    expect(buffer.sampleRate).toBe(22050);
    expect(copied).toHaveLength(1);
  });

  it('falls back when the recording cannot be decoded', async () => {
    const { context } = fakeContext();
    (context.decodeAudioData as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad file'),
    );
    const buffer = (await loadSoundBuffer(context, 'lamp', '/x', async () =>
      audioResponse(),
    )) as unknown as {
      sampleRate: number;
    };
    expect(buffer.sampleRate).toBe(22050);
  });
});
