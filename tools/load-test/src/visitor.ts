import { flagshipManifest } from '@temple/shared/flagship';
import { parseServerMessage, type ServerMessage } from '@temple/shared';
import WebSocket from 'ws';
import { Tally } from './stats';

const MS_PER_SECOND = 1000;
/** How long a visitor waits for the hall to answer a join before counting it as failed. */
const JOIN_TIMEOUT_MS = 10_000;
/** Walking speed in metres per second; the browser walks at about this pace. */
const WALK_SPEED = 2;
/** Stay this far inside the walkable area's edge so a rounding error never sends a person outside. */
const EDGE_MARGIN = 0.5;
/** Smallest distance to a target that counts as arrived. */
const ARRIVED_METRES = 0.05;

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type SnapshotMove = Extract<ServerMessage, { type: 'snapshot' }>['moves'][number];

/** How one attempt to join ended. */
export type JoinOutcome =
  | { kind: 'welcome'; welcome: Welcome }
  | { kind: 'refused'; code: string; nextHall: number | null }
  | { kind: 'failed'; reason: string };

/** What a visitor measured about itself. */
export interface VisitorStats {
  /** From opening the connection to the welcome, or null when it never came. */
  joinMs: number | null;
  snapshots: number;
  messagesIn: number;
  messagesOut: number;
  bytesIn: number;
  bytesOut: number;
  /** Error codes the hall sent, such as `rate_limited` or `invalid_message`. */
  errors: Tally;
  closeCode: number | null;
}

/** The bounds of the walkable area, pulled in by a margin. */
function walkBounds() {
  const points = flagshipManifest.hall.walkableArea;
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minX: Math.min(...xs) + EDGE_MARGIN,
    maxX: Math.max(...xs) - EDGE_MARGIN,
    minZ: Math.min(...zs) + EDGE_MARGIN,
    maxZ: Math.max(...zs) - EDGE_MARGIN,
  };
}

/** A scripted visitor: connects like the browser does, joins, and walks about at the hall's send rate. */
export class Visitor {
  readonly stats: VisitorStats = {
    joinMs: null,
    snapshots: 0,
    messagesIn: 0,
    messagesOut: 0,
    bytesIn: 0,
    bytesOut: 0,
    errors: new Tally(),
    closeCode: null,
  };
  /** Called for every position in a snapshot, so a probe can time how long a move takes to arrive. */
  onSnapshotMove: ((move: SnapshotMove, atMs: number) => void) | null = null;
  welcome: Welcome | null = null;
  private socket: WebSocket | null = null;
  private walkTimer: ReturnType<typeof setInterval> | null = null;
  private position = { x: 0, z: 0 };
  private target: { x: number; z: number } | null = null;

  constructor(
    private readonly address: string,
    private readonly origin: string,
    private readonly random: () => number = Math.random,
  ) {}

  /** Opens the connection to a hall and joins it. Never throws: the outcome says what happened. */
  join(hall: number): Promise<JoinOutcome> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const wsAddress = this.address.replace(/^http/, 'ws');
      const socket = new WebSocket(`${wsAddress}/ws?hall=${hall}`, {
        headers: { Origin: this.origin },
      });
      this.socket = socket;
      let settled = false;
      const settle = (outcome: JoinOutcome) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(outcome);
        }
      };
      const timeout = setTimeout(() => {
        settle({ kind: 'failed', reason: 'join_timeout' });
        socket.terminate();
      }, JOIN_TIMEOUT_MS);
      socket.on('open', () => this.send({ type: 'join', lang: 'en' }));
      socket.on('message', (data) => this.receive(data, startedAt, settle));
      socket.on('unexpected-response', (_request, response) =>
        settle({ kind: 'failed', reason: `http_${response.statusCode ?? 0}` }),
      );
      socket.on('error', () => settle({ kind: 'failed', reason: 'socket_error' }));
      socket.on('close', (code) => {
        this.stats.closeCode = code;
        this.stopWalking();
        settle({ kind: 'failed', reason: `closed_${code}` });
      });
    });
  }

  private receive(
    data: WebSocket.RawData,
    startedAt: number,
    settle: (outcome: JoinOutcome) => void,
  ): void {
    const text = data.toString();
    this.stats.messagesIn += 1;
    this.stats.bytesIn += Buffer.byteLength(text);
    const parsed = parseServerMessage(text);
    if (!parsed.ok) {
      this.stats.errors.add('unreadable_message');
      return;
    }
    const message = parsed.message;
    if (message.type === 'welcome') {
      this.welcome = message;
      this.stats.joinMs = Date.now() - startedAt;
      const me = message.players.find((player) => player.id === message.playerId);
      this.position = { x: me?.x ?? 0, z: me?.z ?? 0 };
      settle({ kind: 'welcome', welcome: message });
    } else if (message.type === 'error') {
      this.stats.errors.add(message.code);
      settle({ kind: 'refused', code: message.code, nextHall: message.nextHall ?? null });
    } else if (message.type === 'snapshot') {
      this.stats.snapshots += 1;
      const now = Date.now();
      message.moves.forEach((move) => this.onSnapshotMove?.(move, now));
    }
  }

  /** Sends a message to the hall, counting it. */
  send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const text = JSON.stringify(message);
    this.stats.messagesOut += 1;
    this.stats.bytesOut += Buffer.byteLength(text);
    this.socket.send(text);
  }

  /** Walks between random points, sending a position at the hall's rate. */
  startWalking(): void {
    const hz = this.welcome?.positionSendHz ?? 1;
    const bounds = walkBounds();
    this.walkTimer = setInterval(() => {
      if (this.target === null) {
        this.target = {
          x: bounds.minX + this.random() * (bounds.maxX - bounds.minX),
          z: bounds.minZ + this.random() * (bounds.maxZ - bounds.minZ),
        };
      }
      const dx = this.target.x - this.position.x;
      const dz = this.target.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(distance, WALK_SPEED / hz);
      if (distance < ARRIVED_METRES) {
        this.target = null;
        return;
      }
      this.position = {
        x: this.position.x + (dx / distance) * step,
        z: this.position.z + (dz / distance) * step,
      };
      this.send({ type: 'move', ...this.position, facing: (Math.atan2(dx, dz) * 180) / Math.PI });
    }, MS_PER_SECOND / hz);
  }

  /** Sends a position straight away, without walking there: used by the latency probe. */
  moveTo(x: number, z: number): void {
    this.position = { x, z };
    this.send({ type: 'move', x, z, facing: 0 });
  }

  /** Sends a `ping` every `pingSec`, as a visible page does, so an idle visitor is not closed. */
  startPinging(): ReturnType<typeof setInterval> {
    const everyMs = (this.welcome?.pingSec ?? 30) * MS_PER_SECOND;
    return setInterval(() => this.send({ type: 'ping' }), everyMs);
  }

  stopWalking(): void {
    if (this.walkTimer !== null) {
      clearInterval(this.walkTimer);
      this.walkTimer = null;
    }
  }

  /** Whether the connection is still open. */
  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.stopWalking();
    this.socket?.close(1000, 'load test done');
  }
}
