import {
  CLOSE_CODE,
  parseServerMessage,
  type LanguageCode,
  type NicknameIds,
  type RitualId,
  type ServerMessage,
} from '@temple/shared';
import {
  INITIAL_HALL_STATE,
  applyServerMessage,
  type HallState,
  type HallStatus,
} from './hallState';
import { clockOffset } from '../audio/chantPlanner';
import type { TrackSet } from './interpolation';
import type { RitualClock } from './ritualClock';
import type { Store } from './store';

/** `WebSocket.OPEN`, named because the number alone says nothing. */
const SOCKET_OPEN = 1;
const MS_PER_SECOND = 1000;
const NORMAL_CLOSE = 1000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8000;
/** Reconnect delays vary by up to this share, so many browsers do not return at the same instant. */
const RECONNECT_JITTER = 0.2;

/** Closes after which the browser must not reconnect by itself, and the status each one means. */
const FINAL_CLOSES: ReadonlyMap<number, HallStatus> = new Map([
  [CLOSE_CODE.idle, 'away'],
  [CLOSE_CODE.replaced, 'replaced'],
  [CLOSE_CODE.invalidMessages, 'disconnected'],
  [CLOSE_CODE.joinTimeout, 'disconnected'],
]);

/** The token that lets this tab return to its place after a drop, and the hall it belongs to. */
export interface SavedToken {
  hall: number;
  token: string;
}

/** Keeps the saved token. */
export interface TokenStorage {
  read(): SavedToken | null;
  write(hall: number, token: string): void;
  clear(): void;
}

/** What to send in `join` besides the token. */
export interface ConnectOptions {
  /** The nickname to keep, for example when moving to another hall. */
  nickname?: NicknameIds | undefined;
}

/** What the join flow needs from a connection. */
export interface HallLink {
  connect(hall: number, options?: ConnectOptions): void;
  close(): void;
}

/** Everything the connection needs from outside, so tests can replace it. */
export interface ConnectionDeps {
  /** The WebSocket address of a hall. */
  urlForHall: (hall: number) => string;
  language: LanguageCode;
  store: Store<HallState>;
  tracks: TrackSet;
  ritualClock: RitualClock;
  tokens: TokenStorage;
  createSocket: (url: string) => WebSocket;
  now: () => number;
  /** The time now in epoch milliseconds, to compare with the server's clock. */
  epochNow: () => number;
  random: () => number;
  isPageVisible: () => boolean;
}

/**
 * The browser's link to one hall: joins, keeps the state and positions up to date, sends the
 * visitor's own moves, and reconnects with back-off when the network drops (FR-40, FR-41).
 */
export class HallConnection implements HallLink {
  private socket: WebSocket | null = null;
  private hall = 1;
  private options: ConnectOptions = {};
  private lastRitual: RitualId | null = null;
  private attempt = 0;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ConnectionDeps) {}

  /**
   * Opens a connection to a hall and joins it. A connection that is already open is closed first.
   *
   * @param hall - The hall number.
   * @param options - Extra things to send with `join`.
   */
  connect(hall: number, options: ConnectOptions = {}): void {
    this.clearTimers();
    const previous = this.socket;
    this.socket = null;
    previous?.close(NORMAL_CLOSE, 'moving');
    this.hall = hall;
    this.options = options;
    this.stopped = false;
    this.attempt = 0;
    this.open();
  }

  /** Leaves the hall and stops reconnecting. */
  close(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close(NORMAL_CLOSE, 'leaving');
    this.socket = null;
    this.setStatus('idle');
  }

  /** Asks the hall to start a ritual. The answer arrives as messages. */
  startRitual(ritualId: RitualId): void {
    this.lastRitual = ritualId;
    this.send({ type: 'ritual_start', ritualId });
  }

  /** Asks the hall to end the visitor's ritual and free their cushion. */
  stopRitual(): void {
    this.send({ type: 'ritual_stop' });
  }

  /** Tells the hall where the visitor is. Ignored while not connected. */
  sendMove(x: number, z: number, facing: number): void {
    this.send({ type: 'move', x, z, facing });
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.deps.createSocket(this.deps.urlForHall(this.hall));
    this.socket = socket;
    socket.addEventListener('open', () => this.join());
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', (event) => this.closed(socket, event.code));
  }

  private join(): void {
    const saved = this.deps.tokens.read();
    const resumeToken = saved?.hall === this.hall ? saved.token : undefined;
    this.send({
      type: 'join',
      lang: this.deps.language,
      ...(this.options.nickname === undefined ? {} : { nickname: this.options.nickname }),
      ...(resumeToken === undefined ? {} : { resumeToken }),
    });
  }

  private receive(data: unknown): void {
    const parsed = parseServerMessage(data);
    if (!parsed.ok) {
      return;
    }
    const message = parsed.message;
    if (message.type === 'snapshot') {
      this.recordSnapshot(message);
      return;
    }
    if (message.type === 'welcome') {
      this.welcomed(message);
    }
    this.trackPeople(message);
    const next = applyServerMessage(this.deps.store.getState(), message);
    this.deps.store.setState(this.withClockOffset(this.withRitualNotice(next, message), message));
  }

  private welcomed(message: Extract<ServerMessage, { type: 'welcome' }>): void {
    this.attempt = 0;
    this.deps.tokens.write(message.hall, message.resumeToken);
    this.deps.tracks.clear();
    this.deps.ritualClock.clear();
    message.players.forEach((player) => {
      this.deps.tracks.push(player.id, this.sampleOf(player));
      if (player.ritual !== null) {
        this.deps.ritualClock.start(player.id, player.ritual.ritualId, this.deps.now());
      }
    });
    this.startPings(message.pingSec);
  }

  /** Keeps the positions and the ritual start times of the people in the hall up to date. */
  private trackPeople(message: ServerMessage): void {
    if (message.type === 'player_joined') {
      this.deps.tracks.push(message.player.id, this.sampleOf(message.player));
      if (message.player.ritual !== null) {
        this.deps.ritualClock.start(
          message.player.id,
          message.player.ritual.ritualId,
          this.deps.now(),
        );
      }
    } else if (message.type === 'player_left') {
      this.deps.tracks.remove(message.playerId);
      this.deps.ritualClock.stop(message.playerId);
    } else if (message.type === 'ritual_started') {
      this.deps.ritualClock.start(message.playerId, message.ritualId, this.deps.now());
    } else if (message.type === 'ritual_ended') {
      this.deps.ritualClock.stop(message.playerId);
    }
  }

  /** Learns how far this browser's clock is from the server's, from the time in the welcome (FR-30). */
  private withClockOffset(state: HallState, message: ServerMessage): HallState {
    return message.type === 'welcome'
      ? { ...state, clockOffsetMs: clockOffset(message.serverTimeMs, this.deps.epochNow()) }
      : state;
  }

  /** Remembers that a ritual did not start, with the ritual the visitor had asked for. */
  private withRitualNotice(state: HallState, message: ServerMessage): HallState {
    if (
      message.type === 'error' &&
      (message.code === 'no_slot_free' || message.code === 'lamp_limit')
    ) {
      return { ...state, ritualNotice: { code: message.code, ritualId: this.lastRitual } };
    }
    return state;
  }

  private recordSnapshot(message: Extract<ServerMessage, { type: 'snapshot' }>): void {
    const atMs = this.deps.now();
    for (const move of message.moves) {
      this.deps.tracks.push(move.playerId, { atMs, x: move.x, z: move.z, facing: move.facing });
    }
  }

  private sampleOf(player: { x: number; z: number; facing: number }) {
    return { atMs: this.deps.now(), x: player.x, z: player.z, facing: player.facing };
  }

  private closed(socket: WebSocket, code: number): void {
    if (socket !== this.socket) {
      return;
    }
    this.clearTimers();
    this.socket = null;
    const finalStatus = this.finalStatusFor(code);
    if (finalStatus !== undefined) {
      this.stopped = true;
      this.setStatus(finalStatus);
      if (finalStatus === 'replaced' || finalStatus === 'away') {
        this.deps.tokens.clear();
      }
    } else if (!this.stopped) {
      this.scheduleReconnect();
    }
  }

  private finalStatusFor(code: number): HallStatus | undefined {
    if (code === CLOSE_CODE.hallFull) {
      return this.deps.store.getState().refusal?.code === 'all_halls_full'
        ? 'all_halls_full'
        : 'hall_full';
    }
    return FINAL_CLOSES.get(code);
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const base = Math.min(RECONNECT_BASE_MS * 2 ** this.attempt, RECONNECT_MAX_MS);
    const jitter = 1 + (this.deps.random() * 2 - 1) * RECONNECT_JITTER;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), base * jitter);
  }

  private startPings(pingSec: number): void {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.deps.isPageVisible()) {
        this.send({ type: 'ping' });
      }
    }, pingSec * MS_PER_SECOND);
  }

  private send(message: unknown): void {
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private setStatus(status: HallStatus): void {
    const state = this.deps.store.getState();
    if (state.status !== status) {
      this.deps.store.setState({ ...state, status });
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPingTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** The tab's saved token, kept in `sessionStorage` (it survives a reload but not a new tab). */
export function sessionTokenStorage(key = 'temple.resumeToken'): TokenStorage {
  return {
    read: () => {
      try {
        const [hall, token] = (sessionStorage.getItem(key) ?? '').split(':');
        return /^[0-9]{1,4}$/.test(hall ?? '') && token ? { hall: Number(hall), token } : null;
      } catch {
        return null;
      }
    },
    write: (hall, token) => {
      try {
        sessionStorage.setItem(key, `${hall}:${token}`);
      } catch {
        // Private windows can refuse storage; the visitor then simply rejoins as a new person.
      }
    },
    clear: () => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // See above.
      }
    },
  };
}

export { INITIAL_HALL_STATE };
