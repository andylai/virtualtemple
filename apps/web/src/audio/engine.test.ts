import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, type SoundName } from './engine';

class FakeNode {
  connected: unknown[] = [];
  connect(node: unknown) {
    this.connected.push(node);
    return node;
  }
}
class FakeGain extends FakeNode {
  gain = { value: 1 };
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  started: { when: number; offset: number | undefined } | null = null;
  stopped = false;
  start(when: number, offset?: number) {
    this.started = { when, offset };
  }
  stop() {
    this.stopped = true;
  }
}
class FakeContext {
  destination = new FakeNode();
  resumed = false;
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  resume() {
    this.resumed = true;
    return Promise.resolve();
  }
}

const RECORDING_SEC = 100;
const START = 1_000_000;
const SESSION = { startAtMs: START, durationMs: 300_000 };

function setup(options: { chantingArrives?: Promise<void> } = {}) {
  const context = new FakeContext();
  const engine = new AudioEngine({
    createContext: () => context as unknown as AudioContext,
    loadBuffer: async (_context, name: SoundName) => {
      if (name === 'chanting') {
        await options.chantingArrives;
      }
      return { name, duration: name === 'chanting' ? RECORDING_SEC : 4 } as unknown as AudioBuffer;
    },
    volumes: { ambient: 0.35, chanting: 0.26, sfx: 0.35 },
    epochNow: () => Date.now(),
  });
  const [ambientGain, chantingGain, sfxGain] = [0, 1, 2];
  /** The sources playing through one layer's gain. */
  const playing = (gainIndex: number) =>
    context.sources.filter((source) => source.connected.includes(context.gains[gainIndex]));
  return { context, engine, playing, ambientGain, chantingGain, sfxGain };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START - 600_000);
});
afterEach(() => vi.useRealTimers());

describe('unlocking', () => {
  it('makes sound possible only after unlock, sets the default volumes and starts the ambient loop', async () => {
    const { engine, context, playing, ambientGain } = setup();
    expect(engine.unlocked).toBe(false);
    engine.unlock();
    await settle();
    expect(engine.unlocked).toBe(true);
    expect(context.resumed).toBe(true);
    expect(context.gains.map((g) => g.gain.value)).toEqual([0.35, 0.26, 0.35]);
    expect(playing(ambientGain)).toHaveLength(1);
    expect(playing(ambientGain)[0]).toMatchObject({ loop: true });
  });

  it('does nothing the second time', async () => {
    const { engine, context } = setup();
    engine.unlock();
    engine.unlock();
    await settle();
    expect(context.gains).toHaveLength(3);
    expect(context.sources.filter((s) => s.loop)).toHaveLength(1);
  });
});

describe('volumes', () => {
  it('sets each layer, keeps it between 0 and 1, and tells listeners', async () => {
    const { engine, context } = setup();
    engine.unlock();
    await settle();
    const heard = vi.fn();
    engine.subscribe(heard);
    engine.setVolume('chanting', 0.8);
    engine.setVolume('sfx', 3);
    engine.setVolume('ambient', -1);
    expect(context.gains.map((g) => g.gain.value)).toEqual([0, 0.8, 1]);
    expect(engine.getVolumes()).toEqual({ ambient: 0, chanting: 0.8, sfx: 1 });
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it('keeps a volume set before unlock', async () => {
    const { engine, context } = setup();
    engine.setVolume('sfx', 0.1);
    engine.unlock();
    expect(context.gains[2]!.gain.value).toBe(0.1);
  });
});

describe('sound effects', () => {
  it('plays a short sound once through the effects layer, and nothing before unlock', async () => {
    const { engine, playing, sfxGain } = setup();
    engine.playSfx('bell');
    await settle();
    expect(playing(sfxGain)).toHaveLength(0);
    engine.unlock();
    await settle();
    engine.playSfx('bell');
    await settle();
    expect(playing(sfxGain)).toHaveLength(1);
    expect(playing(sfxGain)[0]).toMatchObject({ loop: false, started: { when: 0 } });
  });
});

describe('personal chanting', () => {
  it('starts and stops on request, looping from the beginning', async () => {
    const { engine, playing, chantingGain } = setup();
    engine.unlock();
    await settle();
    engine.togglePersonalChanting();
    await settle();
    expect(engine.personalChanting).toBe(true);
    expect(playing(chantingGain)[0]).toMatchObject({ loop: true, started: { when: 0, offset: 0 } });
    engine.togglePersonalChanting();
    expect(engine.personalChanting).toBe(false);
    expect(playing(chantingGain)[0]!.stopped).toBe(true);
  });
});

describe('communal chanting', () => {
  it('waits for the start, then plays from the start of the recording and rings the bell', async () => {
    const { engine, playing, chantingGain, sfxGain } = setup();
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    expect(playing(chantingGain)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(engine.communalChanting).toBe(true);
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 0 } });
    expect(playing(sfxGain)).toHaveLength(1);
  });

  it('starts in the middle for someone who joins late, and does not ring the bell', async () => {
    const { engine, playing, chantingGain, sfxGain } = setup();
    vi.setSystemTime(START + 130_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 30 } });
    expect(playing(sfxGain)).toHaveLength(0);
  });

  it("uses the server's clock, not the browser's", async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START - 20_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 50_000);
    await settle();
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 30 } });
  });

  it('starts further in when the recording arrives after the start time', async () => {
    let arrive!: () => void;
    const { engine, playing, chantingGain } = setup({
      chantingArrives: new Promise<void>((resolve) => (arrive = resolve)),
    });
    vi.setSystemTime(START - 1_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(playing(chantingGain)).toHaveLength(0);
    arrive();
    await settle();
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 10 } });
  });

  it("takes over from the visitor's own chanting, and does not bring it back afterwards", async () => {
    const { engine, playing, chantingGain } = setup();
    engine.unlock();
    await settle();
    engine.togglePersonalChanting();
    await settle();
    engine.scheduleCommunal(SESSION, 0);
    await vi.advanceTimersByTimeAsync(600_000);
    const [personal, communal] = playing(chantingGain);
    expect(personal!.stopped).toBe(true);
    expect(communal!.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(SESSION.durationMs);
    expect(communal!.stopped).toBe(true);
    expect(engine.communalChanting).toBe(false);
    expect(engine.personalChanting).toBe(false);
  });

  it('does not let the visitor start their own chanting during the session', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    engine.togglePersonalChanting();
    await settle();
    expect(playing(chantingGain)).toHaveLength(1);
    expect(engine.personalChanting).toBe(false);
  });

  it('ignores the same session announced twice', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    engine.scheduleCommunal({ ...SESSION }, 0);
    await settle();
    expect(playing(chantingGain)).toHaveLength(1);
  });

  it('plays a session that was announced before sound was unlocked, once it is unlocked', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    expect(playing(chantingGain)).toHaveLength(0);
    engine.unlock();
    await settle();
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 10 } });
  });

  it('stops when cancelled', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    engine.cancelCommunal();
    expect(playing(chantingGain)[0]!.stopped).toBe(true);
    expect(engine.communalChanting).toBe(false);
  });

  it('does not play a session that is already over', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + SESSION.durationMs + 1_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    expect(playing(chantingGain)).toHaveLength(0);
  });
});
