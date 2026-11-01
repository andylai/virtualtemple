import { planChant, type Session } from './chantPlanner';

/** The three volume layers (FR-23): the background, the chanting, and short sound effects. */
export type Layer = 'ambient' | 'chanting' | 'sfx';
/** The sounds the engine plays. */
export type SoundName = 'ambient' | 'chanting' | 'bell' | 'lamp';
export type SfxName = 'bell' | 'lamp';

type Volumes = Record<Layer, number>;
type ChantKind = 'personal' | 'communal';

/** Everything the engine needs from outside, so tests can replace the browser's audio. */
export interface EngineDeps {
  createContext: () => AudioContext;
  /** Gets a sound as a buffer: a recording if there is one, otherwise a placeholder. */
  loadBuffer: (context: AudioContext, name: SoundName) => Promise<AudioBuffer>;
  volumes: Volumes;
  /** The time now, in epoch milliseconds. */
  epochNow: () => number;
}

/** What the sound panel shows. A new object is made each time something changes. */
export interface EngineSnapshot {
  volumes: Readonly<Volumes>;
  personalChanting: boolean;
  communalChanting: boolean;
}

/** The sound of the hall: ambient background, personal and communal chanting, and sound effects. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private gains: Partial<Record<Layer, GainNode>> = {};
  private readonly buffers = new Map<SoundName, Promise<AudioBuffer>>();
  private volumes: Volumes;
  private chant: { source: AudioBufferSourceNode; kind: ChantKind } | null = null;
  private personalWanted = false;
  private communal: { session: Session; clockOffsetMs: number } | null = null;
  private communalTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private pageVisible = true;
  private backgroundPlay = false;
  private suspended = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: EngineSnapshot;

  constructor(private readonly deps: EngineDeps) {
    this.volumes = { ...deps.volumes };
    this.snapshot = this.makeSnapshot();
  }

  /** Whether sound can play. Browsers allow it only after the visitor has pressed a button. */
  get unlocked(): boolean {
    return this.context !== null;
  }

  /** The volume of each layer, from 0 to 1. */
  getVolumes(): Readonly<Volumes> {
    return this.volumes;
  }

  /** Whether the visitor's own chanting is playing (not the communal one). */
  get personalChanting(): boolean {
    return this.chant?.kind === 'personal';
  }

  /** Whether the communal chanting is playing for everyone. */
  get communalChanting(): boolean {
    return this.chant?.kind === 'communal';
  }

  /** What the sound panel shows now. The same object is returned until something changes. */
  getSnapshot = (): EngineSnapshot => this.snapshot;

  /** Calls a function whenever volumes or chanting change. Returns the function that stops it. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Makes sound possible and starts the background. Call it from the Enter button's click, because
   * browsers refuse sound until the visitor has done something. Calling it again does nothing.
   */
  unlock(): void {
    if (this.context !== null) {
      return;
    }
    const context = this.deps.createContext();
    this.context = context;
    for (const layer of ['ambient', 'chanting', 'sfx'] as const) {
      const gain = context.createGain();
      gain.gain.value = this.volumes[layer];
      gain.connect(context.destination);
      this.gains[layer] = gain;
    }
    void context.resume();
    this.applySuspension();
    void this.loadBuffer('ambient').then((buffer) => this.loop(buffer, 'ambient'));
    if (this.communal !== null) {
      void this.applyCommunal();
    }
  }

  /** Silences everything, for example while the visitor has left the hall. `unpause` brings it back. */
  pause(): void {
    this.paused = true;
    this.applySuspension();
  }

  /** Brings the sound back after `pause`. */
  unpause(): void {
    this.paused = false;
    this.applySuspension();
  }

  /** Says whether sound may keep playing while the tab is in the background (FR-25). */
  setBackgroundPlay(allowed: boolean): void {
    this.backgroundPlay = allowed;
    this.applySuspension();
  }

  /** Tells the engine whether the tab can be seen, so it can go quiet in the background if that is wanted. */
  setPageVisible(visible: boolean): void {
    this.pageVisible = visible;
    this.applySuspension();
  }

  /** Sets one layer's volume, kept between 0 and 1. */
  setVolume(layer: Layer, value: number): void {
    this.volumes = { ...this.volumes, [layer]: Math.min(1, Math.max(0, value)) };
    const gain = this.gains[layer];
    if (gain !== undefined) {
      gain.gain.value = this.volumes[layer];
    }
    this.notify();
  }

  /** Plays a short sound once. */
  playSfx(name: SfxName): void {
    const context = this.context;
    const gain = this.gains.sfx;
    if (context !== null && gain !== undefined) {
      void this.loadBuffer(name).then((buffer) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start(0);
      });
    }
  }

  /** Starts or stops the visitor's own chanting. It gives way to the communal chanting (FR-24). */
  togglePersonalChanting(): void {
    if (this.personalChanting || this.personalWanted) {
      this.personalWanted = false;
      this.stopChant('personal');
    } else if (this.context !== null && !this.communalChanting) {
      this.personalWanted = true;
      void this.loadBuffer('chanting').then((buffer) => {
        if (this.personalWanted && !this.communalChanting) {
          this.startChant(buffer, 0, 'personal');
        }
      });
    }
    this.notify();
  }

  /**
   * Plays a communal session when its time comes, at the place in the recording that everyone else
   * is at (FR-27 to FR-30, FR-42). The same session announced again is ignored.
   *
   * @param session - The session, from the server.
   * @param clockOffsetMs - What to add to this browser's clock to get the server's.
   */
  scheduleCommunal(session: Session, clockOffsetMs: number): void {
    if (this.communal?.session.startAtMs === session.startAtMs) {
      this.communal = { session, clockOffsetMs };
      return;
    }
    this.clearCommunalTimer();
    this.communal = { session, clockOffsetMs };
    if (this.context !== null) {
      void this.applyCommunal();
    }
  }

  /** Forgets the communal session and stops it if it is playing. */
  cancelCommunal(): void {
    this.clearCommunalTimer();
    this.communal = null;
    this.stopChant('communal');
    this.notify();
  }

  private async applyCommunal(): Promise<void> {
    const wanted = this.communal;
    if (wanted === null || this.context === null) {
      return;
    }
    const buffer = await this.loadBuffer('chanting');
    // A recording that arrives late is started further in, because the plan is made now.
    const plan = planChant(
      wanted.session,
      this.deps.epochNow() + wanted.clockOffsetMs,
      buffer.duration,
    );
    if (this.communal !== wanted || this.communal === null) {
      return;
    }
    if (plan.state === 'waiting') {
      this.communalTimer = setTimeout(() => void this.applyCommunal(), plan.startInMs);
    } else if (plan.state === 'playing') {
      this.personalWanted = false;
      this.startChant(buffer, plan.offsetSec, 'communal');
      if (plan.offsetSec < 1) {
        this.playSfx('bell');
      }
      this.communalTimer = setTimeout(() => this.endCommunal(wanted), plan.endsInMs);
    } else {
      this.endCommunal(wanted);
    }
  }

  private endCommunal(session: NonNullable<AudioEngine['communal']>): void {
    if (this.communal === session) {
      this.communal = null;
      this.stopChant('communal');
      this.notify();
    }
  }

  /** Stops or restarts the browser's audio clock as the visitor's choices and the tab's state require. */
  private applySuspension(): void {
    const context = this.context;
    if (context === null) {
      return;
    }
    const shouldSuspend = this.paused || (!this.pageVisible && !this.backgroundPlay);
    if (shouldSuspend && !this.suspended) {
      this.suspended = true;
      void context.suspend();
    } else if (!shouldSuspend && this.suspended) {
      this.suspended = false;
      void context.resume().then(() => this.resyncCommunal());
    }
  }

  /** After a pause the communal chanting is behind the others, so it is started again at the right place. */
  private resyncCommunal(): void {
    if (this.communal !== null) {
      this.clearCommunalTimer();
      this.stopChant('communal');
      void this.applyCommunal();
    }
  }

  private loadBuffer(name: SoundName): Promise<AudioBuffer> {
    const context = this.context as AudioContext;
    let loading = this.buffers.get(name);
    if (loading === undefined) {
      loading = this.deps.loadBuffer(context, name);
      this.buffers.set(name, loading);
    }
    return loading;
  }

  /** Plays a buffer on repeat on one layer. */
  private loop(buffer: AudioBuffer, layer: 'ambient'): AudioBufferSourceNode | null {
    const context = this.context;
    const gain = this.gains[layer];
    if (context === null || gain === undefined) {
      return null;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(0);
    return source;
  }

  private startChant(buffer: AudioBuffer, offsetSec: number, kind: ChantKind): void {
    const context = this.context;
    const gain = this.gains.chanting;
    if (context === null || gain === undefined) {
      return;
    }
    this.stopChant();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(0, offsetSec);
    this.chant = { source, kind };
    this.notify();
  }

  /** Stops the chanting that is playing, if it is of the given kind (or of any kind when none is given). */
  private stopChant(kind?: ChantKind): void {
    if (this.chant !== null && (kind === undefined || this.chant.kind === kind)) {
      this.chant.source.stop();
      this.chant = null;
      this.notify();
    }
  }

  private clearCommunalTimer(): void {
    if (this.communalTimer !== null) {
      clearTimeout(this.communalTimer);
      this.communalTimer = null;
    }
  }

  private makeSnapshot(): EngineSnapshot {
    return {
      volumes: this.volumes,
      personalChanting: this.personalChanting,
      communalChanting: this.communalChanting,
    };
  }

  private notify(): void {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((listener) => listener());
  }
}
