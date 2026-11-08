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
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: (target: number) => {
      this.gain.value = target;
    },
  };
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
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
  currentTime = 0;
  resumed = false;
  suspended = false;
  suspend() {
    this.suspended = true;
    return Promise.resolve();
  }
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
    this.suspended = false;
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
const loadRecitation = async () => ({ duration: RECORDING_SEC }) as AudioBuffer;

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
  it('plays once, ducks the piano and restores it when the recording ends', async () => {
    const { context, engine, playing, ambientGain, chantingGain } = setup();
    engine.unlock();
    await engine.playPersonalChant('heart-sutra', loadRecitation);
    expect(engine.getSnapshot().personalChant).toEqual({ id: 'heart-sutra', state: 'playing' });
    const [source] = playing(chantingGain);
    expect(source).toMatchObject({ loop: false, started: { when: 0, offset: 0 } });
    expect(context.gains[ambientGain]!.gain.value).toBeLessThan(0.35);
    source!.onended?.();
    expect(engine.getSnapshot().personalChant).toBeNull();
    expect(context.gains[ambientGain]!.gain.value).toBe(0.35);
  });

  it('ignores a download that finishes after the visitor presses Stop', async () => {
    const { engine, playing, chantingGain } = setup();
    engine.unlock();
    const loading = engine.playPersonalChant('heart-sutra', loadRecitation);
    expect(engine.getSnapshot().personalChant?.state).toBe('loading');
    engine.stopPersonalChant();
    await loading;
    expect(engine.getSnapshot().personalChant).toBeNull();
    expect(playing(chantingGain)).toHaveLength(0);
  });

  it('reports an unavailable recording without substituting audio', async () => {
    const { engine, playing, chantingGain } = setup();
    engine.unlock();
    await engine.playPersonalChant('heart-sutra', () => Promise.reject(new Error('missing')));
    expect(engine.getSnapshot().personalChant).toEqual({ id: 'heart-sutra', state: 'failed' });
    expect(playing(chantingGain)).toHaveLength(0);
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
    await engine.playPersonalChant('heart-sutra', loadRecitation);
    await settle();
    engine.scheduleCommunal(SESSION, 0);
    await vi.advanceTimersByTimeAsync(600_000);
    const [personal, communal] = playing(chantingGain);
    expect(personal!.stopped).toBe(true);
    expect(communal!.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(SESSION.durationMs);
    expect(communal!.stopped).toBe(true);
    expect(engine.communalChanting).toBe(false);
    expect(engine.getSnapshot().personalChant).toBeNull();
  });

  it('does not let the visitor start their own chanting during the session', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    await engine.playPersonalChant('heart-sutra', loadRecitation);
    await settle();
    expect(playing(chantingGain)).toHaveLength(1);
    expect(engine.getSnapshot().personalChant).toBeNull();
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

describe('pausing and the background', () => {
  it('goes quiet when paused and comes back when unpaused', async () => {
    const { engine, context } = setup();
    engine.unlock();
    await settle();
    engine.pause();
    expect(context.suspended).toBe(true);
    engine.unpause();
    await settle();
    expect(context.suspended).toBe(false);
  });

  it('goes quiet in the background unless the visitor allows sound there', async () => {
    const { engine, context } = setup();
    engine.unlock();
    await settle();
    engine.setPageVisible(false);
    expect(context.suspended).toBe(true);
    engine.setPageVisible(true);
    await settle();
    expect(context.suspended).toBe(false);
    engine.setBackgroundPlay(true);
    engine.setPageVisible(false);
    expect(context.suspended).toBe(false);
  });

  it('stays quiet in the background even if the visitor un-pauses, and the other way round', async () => {
    const { engine, context } = setup();
    engine.unlock();
    await settle();
    engine.pause();
    engine.setPageVisible(false);
    engine.unpause();
    expect(context.suspended).toBe(true);
    engine.setPageVisible(true);
    await settle();
    expect(context.suspended).toBe(false);
  });

  it('keeps the clock running for a waiting bell and silences everything else while hidden', async () => {
    const { engine, context, sfxGain, ambientGain } = setup();
    engine.unlock();
    await settle();
    const bellAt = Date.now() + 90_000;
    const cancel = engine.scheduleBell(bellAt);
    expect(cancel).not.toBeNull();
    await settle();
    engine.setPageVisible(false);
    expect(context.suspended).toBe(false);
    expect(context.gains[ambientGain]?.gain.value).toBe(0);
    expect(context.gains[sfxGain]?.gain.value).toBe(0.35);
    const bell = context.sources.at(-1);
    expect(bell?.started?.when).toBeCloseTo(90, 0);
    bell?.onended?.();
    expect(context.suspended).toBe(true);
    engine.setPageVisible(true);
    await settle();
    expect(context.gains[ambientGain]?.gain.value).toBe(0.35);
  });

  it('lets the clock stop again when a waiting bell is cancelled, and cancels the sound', async () => {
    const { engine, context } = setup();
    engine.unlock();
    await settle();
    const cancel = engine.scheduleBell(Date.now() + 60_000);
    await settle();
    engine.setPageVisible(false);
    cancel?.();
    expect(context.sources.at(-1)?.stopped).toBe(true);
    expect(context.suspended).toBe(true);
  });

  it('cannot schedule a bell before sound is unlocked', () => {
    const { engine } = setup();
    expect(engine.scheduleBell(Date.now() + 1000)).toBeNull();
  });

  it('puts the communal chanting back at the right place after a pause', async () => {
    const { engine, playing, chantingGain } = setup();
    vi.setSystemTime(START + 10_000);
    engine.unlock();
    engine.scheduleCommunal(SESSION, 0);
    await settle();
    expect(playing(chantingGain)[0]).toMatchObject({ started: { offset: 10 } });
    engine.pause();
    await vi.advanceTimersByTimeAsync(45_000);
    engine.unpause();
    await settle();
    const sources = playing(chantingGain);
    expect(sources[0]!.stopped).toBe(true);
    expect(sources[1]).toMatchObject({ started: { offset: 55 }, stopped: false });
  });
});
