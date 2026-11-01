import {
  CLOSE_CODE,
  parseServerMessage,
  type LanguageCode,
  type ServerMessage,
} from '@temple/shared';
import {
  INITIAL_HALL_STATE,
  applyServerMessage,
  type HallState,
  type HallStatus,
} from './hallState';
import type { TrackSet } from './interpolation';
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
  [CLOSE_CODE.hallFull, 'hall_full'],
  [CLOSE_CODE.idle, 'away'],
  [CLOSE_CODE.replaced, 'replaced'],
  [CLOSE_CODE.invalidMessages, 'disconnected'],
  [CLOSE_CODE.joinTimeout, 'disconnected'],
]);

/** Keeps the token that lets this tab return to its place after a drop. */
export interface TokenStorage {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

/** Everything the connection needs from outside, so tests can replace it. */
export interface ConnectionDeps {
  url: string;
  language: LanguageCode;
  store: Store<HallState>;
  tracks: TrackSet;
  tokens: TokenStorage;
  createSocket: (url: string) => WebSocket;
  now: () => number;
  random: () => number;
  isPageVisible: () => boolean;
}

/**
 * The browser's link to one hall: joins, keeps the state and positions up to date, sends the
 * visitor's own moves, and reconnects with back-off when the network drops (FR-40, FR-41).
 */
export class HallConnection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ConnectionDeps) {}

  /** Opens the connection and joins the hall. */
  connect(): void {
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

  /** Tells the hall where the visitor is. Ignored while not connected. */
  sendMove(x: number, z: number, facing: number): void {
    this.send({ type: 'move', x, z, facing });
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.deps.createSocket(this.deps.url);
    this.socket = socket;
    socket.addEventListener('open', () => this.join());
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', (event) => this.closed(socket, event.code));
  }

  private join(): void {
    const resumeToken = this.deps.tokens.read();
    this.send({
      type: 'join',
      lang: this.deps.language,
      ...(resumeToken === null ? {} : { resumeToken }),
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
    if (message.type === 'player_joined') {
      this.deps.tracks.push(message.player.id, this.sampleOf(message.player));
    } else if (message.type === 'player_left') {
      this.deps.tracks.remove(message.playerId);
    }
    this.deps.store.setState(applyServerMessage(this.deps.store.getState(), message));
  }

  private welcomed(message: Extract<ServerMessage, { type: 'welcome' }>): void {
    this.attempt = 0;
    this.deps.tokens.write(message.resumeToken);
    this.deps.tracks.clear();
    message.players.forEach((player) => this.deps.tracks.push(player.id, this.sampleOf(player)));
    this.startPings(message.pingSec);
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
    const finalStatus = FINAL_CLOSES.get(code);
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
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (token) => {
      try {
        sessionStorage.setItem(key, token);
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
