import {
  CLOSE_CODE,
  CORRELATION_HEADER,
  ERROR_CODE,
  directoryName,
  hallNumberFromRoomName,
  parseClientMessage,
  type ClientMessage,
  type PlayerView,
  type ServerMessage,
  type TempleConfig,
  type TempleManifest,
} from '@temple/shared';
import {
  PlayerRegistry,
  TokenBucket,
  reportDelayMs,
  suggestHall,
  type Player,
} from '@temple/room-logic';
import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { configFor } from './config';
import { readHallCounts } from './directoryClient';
import { manifestFor } from './manifests';
import { Telemetry } from './telemetry';

const MS_PER_SECOND = 1000;
/** Storage key prefix for people who dropped and may come back. */
const GRACE_PREFIX = 'grace:';
/** Invalid or too-frequent messages are forgotten after this long without a new one. */
const STRIKE_WINDOW_MS = 60_000;
/** Closes the hall itself starts. People who leave this way are not kept for a reconnect. */
const SERVER_CLOSE_CODES: ReadonlySet<number> = new Set([
  CLOSE_CODE.hallFull,
  CLOSE_CODE.invalidMessages,
  CLOSE_CODE.idle,
  CLOSE_CODE.joinTimeout,
  CLOSE_CODE.replaced,
]);

interface PendingState {
  phase: 'pending';
  connectedAtMs: number;
  correlationId: string;
}

interface AdmittedState {
  phase: 'admitted';
  player: Player;
  resumeToken: string;
  correlationId: string;
}

/** Per-connection state. It lives in the WebSocket attachment, so it survives hibernation. */
type ConnectionState = PendingState | AdmittedState;

/** A person who dropped, kept in storage until they come back or the grace period ends. */
interface GraceRecord {
  player: Player;
  expiresAtMs: number;
}

function toView(player: Player): PlayerView {
  const { id, nickname, avatarId, x, z, facing } = player;
  return { id, nickname, avatarId, x, z, facing };
}

function newResumeToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/**
 * One hall (spec section 5). This class only connects the platform to the room rules in
 * `@temple/room-logic`: it reads messages, asks the rules, and sends the results (ADR-003).
 */
export class TempleRoom extends Server<Env> {
  static override options = { hibernate: true };

  private cachedRegistry: PlayerRegistry | null = null;
  private cachedTelemetry: Telemetry | null = null;
  private readonly limiters = new Map<string, TokenBucket>();
  private readonly strikes = new Map<string, { count: number; lastAtMs: number }>();
  private readonly lastSeenMs = new Map<string, number>();
  private lastReportAtMs: number | null = null;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private tickNumber = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  private get config(): TempleConfig {
    return configFor(this.env);
  }

  private get manifest(): TempleManifest {
    return manifestFor(this.env.TEMPLE_SLUG);
  }

  private get hall(): number {
    const hall = hallNumberFromRoomName(this.name);
    if (hall === null) {
      throw new Error(`Not a hall name: ${this.name}`);
    }
    return hall;
  }

  private get telemetry(): Telemetry {
    this.cachedTelemetry ??= new Telemetry({ temple_id: this.env.TEMPLE_SLUG, hall_id: this.hall });
    return this.cachedTelemetry;
  }

  /**
   * The people in this hall. After hibernation the in-memory registry is gone, so it is rebuilt
   * from the saved state of the open connections (spec 5.2).
   */
  private get registry(): PlayerRegistry {
    if (this.cachedRegistry === null) {
      const registry = new PlayerRegistry({
        maxPlayers: this.config.hall.maxPlayers,
        walkableArea: this.manifest.hall.walkableArea,
        nicknames: {
          adjectiveIds: this.manifest.nicknames.adjectives.map((word) => word.id),
          nounIds: this.manifest.nicknames.nouns.map((word) => word.id),
        },
        random: Math.random,
        newPlayerId: () => crypto.randomUUID(),
      });
      const saved = this.admittedStates().map((state) => state.player);
      registry.restore(saved);
      if (saved.length > 0) {
        this.telemetry.event('restored_after_wake', { people: saved.length });
      }
      this.cachedRegistry = registry;
    }
    return this.cachedRegistry;
  }

  override onConnect(connection: Connection, ctx: ConnectionContext): void {
    const nowMs = Date.now();
    const correlationId = ctx.request.headers.get(CORRELATION_HEADER) ?? crypto.randomUUID();
    connection.setState({
      phase: 'pending',
      connectedAtMs: nowMs,
      correlationId,
    } satisfies PendingState);
    this.lastSeenMs.set(connection.id, nowMs);
    this.telemetry.with({ correlation_id: correlationId }).event('connection_opened');
    this.ctx.waitUntil(this.ensureAlarm(nowMs));
  }

  override async onMessage(connection: Connection, raw: WSMessage): Promise<void> {
    const nowMs = Date.now();
    const state = this.stateOf(connection);
    if (state === null) {
      connection.close(CLOSE_CODE.invalidMessages, ERROR_CODE.invalidMessage);
      return;
    }
    this.lastSeenMs.set(connection.id, nowMs);
    if (!this.limiterFor(connection.id, nowMs).tryTake(nowMs)) {
      this.refuse(connection, state, ERROR_CODE.rateLimited, nowMs);
      return;
    }
    const parsed = parseClientMessage(raw, this.config.net.maxMessageBytes);
    if (!parsed.ok) {
      this.refuse(connection, state, ERROR_CODE.invalidMessage, nowMs);
      return;
    }
    await this.handle(connection, state, parsed.message, nowMs);
  }

  override async onClose(connection: Connection, code: number): Promise<void> {
    const state = this.stateOf(connection);
    this.limiters.delete(connection.id);
    this.strikes.delete(connection.id);
    this.lastSeenMs.delete(connection.id);
    if (state?.phase !== 'admitted') {
      return;
    }
    const left = this.registry.remove(state.player.id);
    if (left === undefined) {
      return;
    }
    this.sendToAdmitted({ type: 'player_left', playerId: left.id });
    this.announcePopulation();
    const kept = !SERVER_CLOSE_CODES.has(code);
    this.telemetry.with({ correlation_id: state.correlationId }).event('left', { code, kept });
    if (kept) {
      const nowMs = Date.now();
      const record: GraceRecord = {
        player: left,
        expiresAtMs: nowMs + this.config.hall.reconnectGraceSec * MS_PER_SECOND,
      };
      await this.ctx.storage.put(GRACE_PREFIX + state.resumeToken, record);
      await this.ensureAlarm(nowMs);
    }
  }

  override async onAlarm(): Promise<void> {
    await this.sweepExpired(Date.now());
  }

  /**
   * Closes connections that never joined or have been silent too long, and forgets people whose
   * reconnect grace period is over. Runs from the alarm; the time is a parameter so tests can
   * jump ahead.
   *
   * @param nowMs - The current time in milliseconds.
   */
  async sweepExpired(nowMs: number): Promise<void> {
    const { joinTimeoutSec, idleKickSec } = this.config.hall;
    for (const connection of [...this.getConnections()]) {
      const state = this.stateOf(connection);
      const lastSeen = this.lastSeenMs.get(connection.id) ?? nowMs;
      this.lastSeenMs.set(connection.id, lastSeen);
      if (
        state?.phase === 'pending' &&
        nowMs - state.connectedAtMs > joinTimeoutSec * MS_PER_SECOND
      ) {
        this.telemetry.count('closed', { reason: 'join_timeout' });
        connection.close(CLOSE_CODE.joinTimeout, 'join_timeout');
      } else if (state?.phase === 'admitted' && nowMs - lastSeen > idleKickSec * MS_PER_SECOND) {
        this.telemetry.count('closed', { reason: 'idle' });
        this.safeSend(connection, { type: 'error', code: ERROR_CODE.idleTimeout });
        connection.close(CLOSE_CODE.idle, ERROR_CODE.idleTimeout);
      }
    }
    const remainingGraces = await this.dropExpiredGraces(nowMs);
    this.telemetry.event('sweep', { remaining_graces: remainingGraces });
    this.sendHeartbeat(nowMs);
    if (remainingGraces > 0 || [...this.getConnections()].length > 0) {
      await this.ctx.storage.setAlarm(nowMs + this.alarmPeriodMs());
    }
  }

  private async handle(
    connection: Connection,
    state: ConnectionState,
    message: ClientMessage,
    nowMs: number,
  ): Promise<void> {
    if (message.type === 'join') {
      if (state.phase === 'pending') {
        await this.handleJoin(connection, state, message);
      } else {
        this.refuse(connection, state, ERROR_CODE.notAllowed, nowMs);
      }
    } else if (state.phase !== 'admitted') {
      this.refuse(connection, state, ERROR_CODE.notAllowed, nowMs);
    } else if (message.type === 'move') {
      const result = this.registry.applyMove(state.player.id, message.x, message.z, message.facing);
      if (result === 'ok') {
        this.scheduleTick();
      } else {
        this.refuse(connection, state, ERROR_CODE.notAllowed, nowMs);
      }
    }
  }

  private async handleJoin(
    connection: Connection,
    state: PendingState,
    message: Extract<ClientMessage, { type: 'join' }>,
  ): Promise<void> {
    const nowMs = Date.now();
    const returning =
      message.resumeToken === undefined
        ? null
        : await this.takeReturning(message.resumeToken, nowMs);
    // The connection may have closed while storage was read, so look again before admitting.
    if (this.stateOf(connection)?.phase !== 'pending') {
      return;
    }
    // From here to setState there is no await: the capacity check and the admission are one step.
    const result =
      returning === null
        ? this.registry.admit(message.nickname, nowMs)
        : this.registry.readmit(returning);
    const log = this.telemetry.with({ correlation_id: state.correlationId });
    if (!result.ok) {
      log.count('refused', { reason: ERROR_CODE.hallFull });
      await this.refuseFullHall(connection);
      return;
    }
    const resumeToken = newResumeToken();
    connection.setState({
      phase: 'admitted',
      player: result.player,
      resumeToken,
      correlationId: state.correlationId,
    } satisfies AdmittedState);
    this.safeSend(connection, this.welcomeFor(result.player, resumeToken));
    this.sendToAdmitted({ type: 'player_joined', player: toView(result.player) }, connection.id);
    this.announcePopulation();
    log.event('joined', { returning: returning !== null, population: this.registry.size });
  }

  private welcomeFor(player: Player, resumeToken: string): ServerMessage {
    return {
      type: 'welcome',
      playerId: player.id,
      resumeToken,
      hall: this.hall,
      nickname: player.nickname,
      avatarId: player.avatarId,
      players: this.registry.list().map(toView),
      population: this.registry.size,
      serverTimeMs: Date.now(),
      positionSendHz: this.config.net.positionSendHz,
      pingSec: this.config.net.pingSec,
    };
  }

  /**
   * Finds a person who is coming back: either one kept in storage after a drop, or one whose old
   * connection the server has not noticed closing yet. Returns null when the token matches no one.
   */
  private async takeReturning(token: string, nowMs: number): Promise<Player | null> {
    const stale = this.admittedConnections().find(({ state }) => state.resumeToken === token);
    if (stale !== undefined) {
      const player = this.registry.remove(stale.state.player.id);
      stale.connection.close(CLOSE_CODE.replaced, 'replaced');
      if (player !== undefined) {
        this.sendToAdmitted({ type: 'player_left', playerId: player.id });
        return player;
      }
    }
    const key = GRACE_PREFIX + token;
    const record = await this.ctx.storage.get<GraceRecord>(key);
    if (record === undefined) {
      return null;
    }
    await this.ctx.storage.delete(key);
    return record.expiresAtMs >= nowMs ? record.player : null;
  }

  private async dropExpiredGraces(nowMs: number): Promise<number> {
    const records = await this.ctx.storage.list<GraceRecord>({ prefix: GRACE_PREFIX });
    const expired = [...records]
      .filter(([, record]) => record.expiresAtMs < nowMs)
      .map(([key]) => key);
    if (expired.length > 0) {
      await this.ctx.storage.delete(expired);
    }
    return records.size - expired.length;
  }

  /** Sends movement to everyone at most `net.snapshotHz` times a second, and only when someone moved. */
  private scheduleTick(): void {
    if (this.tickTimer !== null) {
      return;
    }
    this.tickTimer = setTimeout(() => this.runTick(), MS_PER_SECOND / this.config.net.snapshotHz);
  }

  private runTick(): void {
    this.tickTimer = null;
    const moved = this.registry.drainMoved();
    if (moved.length === 0) {
      return;
    }
    this.tickNumber += 1;
    this.sendToAdmitted({
      type: 'snapshot',
      tick: this.tickNumber,
      moves: moved.map(({ id, x, z, facing }) => ({ playerId: id, x, z, facing })),
    });
    this.saveMovedPositions(new Set(moved.map((player) => player.id)));
    if (this.registry.hasMoves) {
      this.scheduleTick();
    }
  }

  /** Saves moved people into their connections, so a still person keeps their place after hibernation. */
  private saveMovedPositions(movedIds: ReadonlySet<string>): void {
    for (const { connection, state } of this.admittedConnections()) {
      const current = movedIds.has(state.player.id)
        ? this.registry.get(state.player.id)
        : undefined;
      if (current !== undefined) {
        connection.setState({ ...state, player: { ...current } } satisfies AdmittedState);
      }
    }
  }

  private announcePopulation(): void {
    this.sendToAdmitted({ type: 'population', count: this.registry.size });
    if (this.registry.size >= this.config.hall.maxPlayers) {
      // A full hall is told at once, so the next visitor is not sent to it.
      this.sendReport();
    } else {
      this.scheduleReport();
    }
  }

  /**
   * Tells the hall directory how many people are here, at most once per `hall.reportIntervalSec`.
   * A change inside the interval waits for the end of it, so the last change is never left out.
   */
  private scheduleReport(): void {
    if (this.reportTimer !== null) {
      return;
    }
    const intervalMs = this.config.hall.reportIntervalSec * MS_PER_SECOND;
    const delay = reportDelayMs(this.lastReportAtMs, Date.now(), intervalMs);
    if (delay === 0) {
      this.sendReport();
      return;
    }
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null;
      this.sendReport();
    }, delay);
  }

  private sendReport(): void {
    this.lastReportAtMs = Date.now();
    this.ctx.waitUntil(this.reportToDirectory(this.registry.size));
  }

  /** An occupied hall repeats its report so the directory can tell a quiet hall from a gone one. */
  private sendHeartbeat(nowMs: number): void {
    const heartbeatMs = this.config.hall.heartbeatSec * MS_PER_SECOND;
    const due = this.lastReportAtMs === null || nowMs - this.lastReportAtMs >= heartbeatMs;
    if (this.registry.size > 0 && due) {
      this.sendReport();
    }
  }

  /** The alarm must come at least as often as the heartbeat. */
  private alarmPeriodMs(): number {
    const { sweepSec, heartbeatSec } = this.config.hall;
    return Math.min(sweepSec, heartbeatSec) * MS_PER_SECOND;
  }

  private async reportToDirectory(count: number): Promise<void> {
    try {
      const directory = this.env.HallDirectory.getByName(directoryName(this.env.TEMPLE_SLUG));
      await directory.report(this.hall, count, Date.now());
    } catch {
      this.telemetry.count('directory_unavailable', { during: 'report' });
    }
  }

  /**
   * Refuses someone because this hall is full, and says where to try next: the hall that most
   * likely has space, or that no hall has (`all_halls_full`). When the directory cannot be reached
   * the answer carries no hall, and the browser tries the halls in order.
   */
  private async refuseFullHall(connection: Connection): Promise<void> {
    // Make sure the directory knows this hall is full before asking it where else to go.
    await this.reportToDirectory(this.registry.size);
    const nextHall = await this.findNextHall();
    const all = nextHall === null;
    this.safeSend(connection, {
      type: 'error',
      code: all ? ERROR_CODE.allHallsFull : ERROR_CODE.hallFull,
      ...(nextHall === undefined ? {} : { nextHall }),
    });
    connection.close(CLOSE_CODE.hallFull, ERROR_CODE.hallFull);
  }

  /** The next hall to try, null when every hall is full, undefined when the directory is down. */
  private async findNextHall(): Promise<number | null | undefined> {
    const { count, maxPlayers, suggestSpread } = this.config.hall;
    try {
      const counts = await readHallCounts(this.env, Date.now());
      counts.set(this.hall, maxPlayers);
      return suggestHall(counts, {
        hallCount: count,
        maxPlayers,
        spread: suggestSpread,
        random: Math.random,
        exclude: new Set([this.hall]),
      });
    } catch {
      this.telemetry.count('directory_unavailable', { during: 'refusal' });
      return undefined;
    }
  }

  /** Answers a message that must not be accepted, and closes the connection after too many. */
  private refuse(
    connection: Connection,
    state: ConnectionState,
    code: ServerErrorCode,
    nowMs: number,
  ): void {
    const log = this.telemetry.with({ correlation_id: state.correlationId });
    log.count('rejected_message', { reason: code });
    this.safeSend(connection, { type: 'error', code });
    const known = this.strikes.get(connection.id);
    const fresh = known !== undefined && nowMs - known.lastAtMs <= STRIKE_WINDOW_MS;
    const count = (fresh ? known.count : 0) + 1;
    this.strikes.set(connection.id, { count, lastAtMs: nowMs });
    if (count >= this.config.net.maxInvalidMessages) {
      log.event('closed_for_misbehaviour', { reason: code }, 'warn');
      connection.close(CLOSE_CODE.invalidMessages, ERROR_CODE.invalidMessage);
    }
  }

  private limiterFor(connectionId: string, nowMs: number): TokenBucket {
    let limiter = this.limiters.get(connectionId);
    if (limiter === undefined) {
      const rate = this.config.net.maxMessagesPerSecond;
      limiter = new TokenBucket(rate, rate, nowMs);
      this.limiters.set(connectionId, limiter);
    }
    return limiter;
  }

  private async ensureAlarm(nowMs: number): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(nowMs + this.alarmPeriodMs());
    }
  }

  private stateOf(connection: Connection): ConnectionState | null {
    return connection.state as ConnectionState | null;
  }

  private admittedConnections(): { connection: Connection; state: AdmittedState }[] {
    const found: { connection: Connection; state: AdmittedState }[] = [];
    for (const connection of this.getConnections()) {
      const state = this.stateOf(connection);
      if (state?.phase === 'admitted') {
        found.push({ connection, state });
      }
    }
    return found;
  }

  private admittedStates(): AdmittedState[] {
    return this.admittedConnections().map(({ state }) => state);
  }

  private sendToAdmitted(message: ServerMessage, exceptConnectionId?: string): void {
    const text = JSON.stringify(message);
    for (const { connection } of this.admittedConnections()) {
      if (connection.id !== exceptConnectionId) {
        this.trySend(connection, text);
      }
    }
  }

  private safeSend(connection: Connection, message: ServerMessage): void {
    this.trySend(connection, JSON.stringify(message));
  }

  /** A socket that is closing can refuse a send; that must not stop the others from being served. */
  private trySend(connection: Connection, text: string): void {
    try {
      connection.send(text);
    } catch {
      this.telemetry.count('send_failed');
    }
  }
}

type ServerErrorCode = Extract<ServerMessage, { type: 'error' }>['code'];
