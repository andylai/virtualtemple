import {
  CLOSE_CODE,
  CORRELATION_HEADER,
  ERROR_CODE,
  hallNumberFromRoomName,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type TempleConfig,
  type TempleManifest,
} from '@temple/shared';
import {
  ChantingSchedule,
  PlayerRegistry,
  RitualEngine,
  TokenBucket,
  type LampRecord,
  type Player,
} from '@temple/room-logic';
import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { configFor } from './config';
import {
  GRACE_PREFIX,
  LAMPS_KEY,
  SERVER_CLOSE_CODES,
  newResumeToken,
  toView,
  type AdmittedState,
  type ConnectionState,
  type GraceRecord,
  type PendingState,
} from './connectionState';
import { DirectoryReporter } from './directoryReporter';
import { HallChanting } from './hallChanting';
import { HallRituals } from './hallRituals';
import { manifestFor } from './manifests';
import { Telemetry, describeError } from './telemetry';

const MS_PER_SECOND = 1000;
/**
 * Rituals and lamps due within this long get an exact timer. Anything later waits for the alarm,
 * so a long wait (a walk to a cushion, a lit lamp) does not keep the hall awake and unable to hibernate.
 */
const EXACT_TIMER_HORIZON_MS = 8000;
/** Invalid or too-frequent messages are forgotten after this long without a new one. */
const STRIKE_WINDOW_MS = 60_000;

type ServerErrorCode = Extract<ServerMessage, { type: 'error' }>['code'];

/**
 * One hall (spec section 5). This class only connects the platform to the room rules in
 * `@temple/room-logic`: it reads messages, asks the rules, and sends the results (ADR-003).
 */
export class TempleRoom extends Server<Env> {
  static override options = { hibernate: true };

  private cachedRegistry: PlayerRegistry | null = null;
  private cachedTelemetry: Telemetry | null = null;
  private cachedReporter: DirectoryReporter | null = null;
  private cachedRituals: HallRituals | null = null;
  private cachedChanting: HallChanting | null = null;
  private savedLamps: LampRecord[] = [];
  private readonly limiters = new Map<string, TokenBucket>();
  private readonly strikes = new Map<string, { count: number; lastAtMs: number }>();
  private readonly lastSeenMs = new Map<string, number>();
  /** Messages received since the last sweep, logged with it so rates can be charted without a log line per message. */
  private messagesSinceSweep = 0;
  private tickNumber = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private dueTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The lit lamps must be read before the first message is handled, so none is given out twice.
    void ctx.blockConcurrencyWhile(async () => {
      this.savedLamps = (await ctx.storage.get<LampRecord[]>(LAMPS_KEY)) ?? [];
    });
  }

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

  private get reporter(): DirectoryReporter {
    this.cachedReporter ??= new DirectoryReporter({
      env: this.env,
      hall: this.hall,
      config: this.config,
      population: () => this.registry.size,
      waitUntil: (work) => this.ctx.waitUntil(work),
      telemetry: this.telemetry,
    });
    return this.cachedReporter;
  }

  /**
   * The people in this hall. After hibernation the in-memory registry is gone, so it is rebuilt
   * from the saved state of the open connections (spec 5.2), and the rituals with it.
   */
  private get registry(): PlayerRegistry {
    if (this.cachedRegistry === null) {
      const registry = this.newRegistry();
      const saved = this.admittedStates().map((state) => state.player);
      registry.restore(saved);
      this.cachedRegistry = registry;
      this.cachedRituals = this.newRituals(registry);
      if (saved.length > 0) {
        this.telemetry.event('restored_after_wake', { people: saved.length });
      }
      this.armDueTimer();
    }
    return this.cachedRegistry;
  }

  private get rituals(): HallRituals {
    // Reading the registry builds the rituals as well.
    void this.registry;
    return this.cachedRituals as HallRituals;
  }

  private get chanting(): HallChanting {
    this.cachedChanting ??= new HallChanting({
      schedule: new ChantingSchedule({
        timeZone: this.manifest.timezone,
        regularTimes: this.manifest.chantingSchedule,
        specialDays: this.manifest.specialDays,
        durationMs: this.manifest.audio.chantingDurationSec * MS_PER_SECOND,
        leadMs: this.config.audio.preloadLeadSec * MS_PER_SECOND,
      }),
      audioId: 'chanting',
      broadcast: (message) => this.sendToAdmitted(message),
    });
    return this.cachedChanting;
  }

  private newRegistry(): PlayerRegistry {
    return new PlayerRegistry({
      maxPlayers: this.config.hall.maxPlayers,
      walkableArea: this.manifest.hall.walkableArea,
      nicknames: {
        adjectiveIds: this.manifest.nicknames.adjectives.map((word) => word.id),
        nounIds: this.manifest.nicknames.nouns.map((word) => word.id),
      },
      random: Math.random,
      newPlayerId: () => crypto.randomUUID(),
    });
  }

  private newRituals(registry: PlayerRegistry): HallRituals {
    const { cooldownMs, walkTimeoutSec } = this.config.ritual;
    const { durationSec, maxPerPlayer } = this.config.lamp;
    const engine = new RitualEngine({
      players: registry,
      offered: this.manifest.rituals,
      cushions: this.manifest.hall.cushions,
      lampSlots: this.manifest.hall.lampSlots,
      cooldownMs,
      walkTimeoutMs: walkTimeoutSec * MS_PER_SECOND,
      lampDurationMs: durationSec * MS_PER_SECOND,
      lampMaxPerPlayer: maxPerPlayer,
    });
    engine.rebuild(this.savedLamps);
    return new HallRituals({
      engine,
      storage: this.ctx.storage,
      broadcast: (message) => this.sendToAdmitted(message),
      sendToPlayer: (playerId, message) => this.sendToPlayer(playerId, message),
      savePlayers: (playerIds) => this.savePlayers(new Set(playerIds)),
      scheduleSnapshot: () => this.scheduleTick(),
      waitUntil: (work) => this.ctx.waitUntil(work),
    });
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
    this.messagesSinceSweep += 1;
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
    this.rituals.left(state.player.id);
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

  override onError(_connection: Connection, error: unknown): void {
    this.telemetry.event('connection_error', describeError(error), 'error');
  }

  override onException(error: unknown): void {
    this.telemetry.event('unhandled_exception', describeError(error), 'error');
  }

  override async onAlarm(): Promise<void> {
    await this.sweepExpired(Date.now());
  }

  /**
   * Closes connections that never joined or have been silent too long, forgets people whose
   * reconnect grace period is over, ends rituals and lamps that have come due, and repeats the
   * report to the directory. Runs from the alarm; the time is a parameter so tests can jump ahead.
   *
   * @param nowMs - The current time in milliseconds.
   */
  async sweepExpired(nowMs: number): Promise<void> {
    this.closeSilentConnections(nowMs);
    this.rituals.runDue(nowMs);
    this.syncChanting(nowMs);
    const remainingGraces = await this.dropExpiredGraces(nowMs);
    this.telemetry.event('sweep', {
      remaining_graces: remainingGraces,
      connections: [...this.getConnections()].length,
      population: this.registry.size,
      messages_since_last_sweep: this.messagesSinceSweep,
    });
    this.messagesSinceSweep = 0;
    this.reporter.heartbeat(nowMs);
    this.armDueTimer();
    if (remainingGraces > 0 || [...this.getConnections()].length > 0) {
      await this.ctx.storage.setAlarm(nowMs + this.alarmPeriodMs());
    }
  }

  /**
   * Tells everyone when a chanting session has become current or has ended. Runs with the alarm;
   * public so tests can set the time.
   *
   * @param nowMs - The current time in milliseconds.
   */
  syncChanting(nowMs: number): void {
    this.chanting.update(nowMs);
  }

  private closeSilentConnections(nowMs: number): void {
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
      this.handleMove(connection, state, message, nowMs);
    } else if (message.type === 'ritual_start') {
      this.handleRitualStart(connection, state, message.ritualId, nowMs);
    } else if (message.type === 'ritual_stop') {
      this.rituals.stop(state.player.id);
      this.armDueTimer();
    }
  }

  private handleMove(
    connection: Connection,
    state: AdmittedState,
    message: Extract<ClientMessage, { type: 'move' }>,
    nowMs: number,
  ): void {
    const result = this.registry.applyMove(state.player.id, message.x, message.z, message.facing);
    if (result === 'ok') {
      this.rituals.moved(state.player.id, nowMs);
      this.armDueTimer();
      this.scheduleTick();
    } else {
      this.refuse(connection, state, ERROR_CODE.notAllowed, nowMs);
    }
  }

  private handleRitualStart(
    connection: Connection,
    state: AdmittedState,
    ritualId: Extract<ClientMessage, { type: 'ritual_start' }>['ritualId'],
    nowMs: number,
  ): void {
    const error = this.rituals.start(state.player.id, ritualId, nowMs);
    this.armDueTimer();
    const log = this.telemetry.with({ correlation_id: state.correlationId });
    if (error === null) {
      log.count('ritual_started', { ritual: ritualId });
    } else if (error === 'not_offered') {
      this.refuse(connection, state, ERROR_CODE.notAllowed, nowMs);
    } else if (error === 'no_slot_free' || error === 'lamp_limit') {
      // The visitor did nothing wrong, so this is an answer and not a strike.
      log.count('ritual_refused', { reason: error });
      this.safeSend(connection, {
        type: 'error',
        code: error === 'lamp_limit' ? ERROR_CODE.lampLimit : ERROR_CODE.noSlotFree,
      });
    } else {
      log.count('ritual_ignored', { reason: error });
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
    const nowMs = Date.now();
    const chanting = this.chanting.current(nowMs);
    const specialDay = this.chanting.specialDay(nowMs);
    return {
      type: 'welcome',
      playerId: player.id,
      resumeToken,
      hall: this.hall,
      nickname: player.nickname,
      avatarId: player.avatarId,
      players: this.registry.list().map(toView),
      lamps: this.rituals.litLamps(),
      population: this.registry.size,
      serverTimeMs: nowMs,
      positionSendHz: this.config.net.positionSendHz,
      pingSec: this.config.net.pingSec,
      ...(chanting === undefined ? {} : { chanting }),
      ...(specialDay === undefined ? {} : { specialDay }),
    };
  }

  /**
   * Finds a person who is coming back: either one kept in storage after a drop, or one whose old
   * connection the server has not noticed closing yet. Returns null when the token matches no one.
   */
  private async takeReturning(token: string, nowMs: number): Promise<Player | null> {
    const stale = this.admittedConnections().find(({ state }) => state.resumeToken === token);
    if (stale !== undefined) {
      this.rituals.left(stale.state.player.id);
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
    this.savePlayers(new Set(moved.map((player) => player.id)));
    if (this.registry.hasMoves) {
      this.scheduleTick();
    }
  }

  /** Saves people into their connections, so a still person keeps their place and ritual after hibernation. */
  private savePlayers(playerIds: ReadonlySet<string>): void {
    for (const { connection, state } of this.admittedConnections()) {
      const current = playerIds.has(state.player.id)
        ? this.registry.get(state.player.id)
        : undefined;
      if (current !== undefined) {
        connection.setState({ ...state, player: { ...current } } satisfies AdmittedState);
      }
    }
  }

  /**
   * Makes sure the next ritual end or lamp expiry is handled on time. A timer covers the short ones
   * (a few seconds); later ones wait for the alarm, which always comes while anyone is here, so they
   * can be up to one alarm period late.
   */
  private armDueTimer(): void {
    if (this.dueTimer !== null) {
      clearTimeout(this.dueTimer);
      this.dueTimer = null;
    }
    const next = this.rituals.nextDueAtMs();
    const wait = next === null ? null : Math.max(0, next - Date.now());
    if (wait !== null && wait <= EXACT_TIMER_HORIZON_MS) {
      this.dueTimer = setTimeout(() => {
        this.dueTimer = null;
        this.rituals.runDue(Date.now());
        this.armDueTimer();
      }, wait);
    }
  }

  private announcePopulation(): void {
    this.sendToAdmitted({ type: 'population', count: this.registry.size });
    this.reporter.populationChanged();
  }

  /**
   * Refuses someone because this hall is full, and says where to try next: the hall that most
   * likely has space, or that no hall has (`all_halls_full`). When the directory cannot be reached
   * the answer carries no hall, and the browser tries the halls in order.
   */
  private async refuseFullHall(connection: Connection): Promise<void> {
    // Make sure the directory knows this hall is full before asking it where else to go.
    await this.reporter.reportNow();
    const nextHall = await this.reporter.findNextHall();
    this.safeSend(connection, {
      type: 'error',
      code: DirectoryReporter.codeFor(nextHall),
      ...(nextHall === undefined ? {} : { nextHall }),
    });
    connection.close(CLOSE_CODE.hallFull, ERROR_CODE.hallFull);
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

  /** The alarm must come at least as often as the heartbeat. */
  private alarmPeriodMs(): number {
    const { sweepSec, heartbeatSec } = this.config.hall;
    return Math.min(sweepSec, heartbeatSec) * MS_PER_SECOND;
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

  private sendToPlayer(playerId: string, message: ServerMessage): void {
    const target = this.admittedConnections().find(({ state }) => state.player.id === playerId);
    if (target !== undefined) {
      this.safeSend(target.connection, message);
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
