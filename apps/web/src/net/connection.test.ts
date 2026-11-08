import { CLOSE_CODE, type ServerMessage } from '@temple/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HallConnection, type SavedToken, type TokenStorage } from './connection';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import { TrackSet } from './interpolation';
import { RitualClock } from './ritualClock';
import { Store } from './store';

type Listener = (event: { data?: unknown; code?: number }) => void;

class FakeSocket {
  constructor(readonly url: string) {}
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close(code?: number): void {
    this.closedWith = code ?? null;
  }
  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }
  receive(message: ServerMessage): void {
    this.emit('message', { data: JSON.stringify(message) });
  }
  drop(code: number): void {
    this.readyState = 3;
    this.emit('close', { code });
  }
  private emit(type: string, event: Parameters<Listener>[0]): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

const welcome = (resumeToken = 't'.repeat(32)): ServerMessage => ({
  type: 'welcome',
  playerId: 'player-self-xx',
  resumeToken,
  hall: 1,
  nickname: { adjectiveId: 'calm', nounId: 'lotus' },
  avatarId: 0,
  players: [
    {
      id: 'player-self-xx',
      nickname: { adjectiveId: 'calm', nounId: 'lotus' },
      avatarId: 0,
      ritual: null,
      x: 1,
      z: 2,
      facing: 0,
    },
  ],
  lamps: [],
  population: 1,
  serverTimeMs: 1,
  positionSendHz: 8,
  pingSec: 30,
});

/** The browser's clock in epoch milliseconds, in these tests. */
const EPOCH_NOW = 1_000_000;

function setup() {
  const sockets: FakeSocket[] = [];
  let saved: SavedToken | null = null;
  const tokens: TokenStorage = {
    read: () => saved,
    write: (hall, token) => (saved = { hall, token }),
    clear: () => (saved = null),
  };
  const store = new Store<HallState>(INITIAL_HALL_STATE);
  const tracks = new TrackSet();
  const ritualClock = new RitualClock();
  let visible = true;
  let clock = 1000;
  const connection = new HallConnection({
    urlForHall: (hall) => `ws://test/ws?hall=${hall}`,
    language: () => 'en',
    store,
    tracks,
    ritualClock,
    tokens,
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    now: () => clock,
    epochNow: () => EPOCH_NOW,
    random: () => 0.5,
    isPageVisible: () => visible,
  });
  return {
    connection,
    sockets,
    store,
    tracks,
    ritualClock,
    tokens,
    hide: () => (visible = false),
    advanceClock: (ms: number) => (clock += ms),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('HallConnection', () => {
  it('joins when the socket opens, and remembers the token from the welcome', () => {
    const { connection, sockets, store, tokens } = setup();
    connection.connect(1);
    expect(store.getState().status).toBe('connecting');
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual([{ type: 'join', lang: 'en' }]);
    sockets[0]!.receive(welcome());
    expect(store.getState()).toMatchObject({ status: 'joined', selfId: 'player-self-xx' });
    expect(tokens.read()).toEqual({ hall: 1, token: 't'.repeat(32) });
  });

  it('puts the saved token in the join so the same person returns', () => {
    const { connection, sockets, tokens } = setup();
    tokens.write(1, 'x'.repeat(32));
    connection.connect(1);
    sockets[0]!.open();
    expect(sockets[0]!.sent[0]).toEqual({ type: 'join', lang: 'en', resumeToken: 'x'.repeat(32) });
  });

  it('records snapshots as positions to draw', () => {
    const { connection, sockets, tracks, advanceClock } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    advanceClock(125);
    sockets[0]!.receive({
      type: 'snapshot',
      tick: 1,
      moves: [{ playerId: 'player-self-xx', x: 5, z: 6, facing: 90 }],
    });
    expect(tracks.get('player-self-xx')?.sampleAt(1125)).toMatchObject({ x: 5, z: 6 });
  });

  it('reconnects with a growing delay after a drop, and starts over after a welcome', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    sockets[0]!.drop(1006);
    expect(store.getState().status).toBe('reconnecting');
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.drop(1006);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);
    sockets[2]!.open();
    sockets[2]!.receive(welcome());
    sockets[2]!.drop(1006);
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(4);
  });

  it.each([
    [CLOSE_CODE.hallFull, 'hall_full'],
    [CLOSE_CODE.idle, 'away'],
    [CLOSE_CODE.replaced, 'replaced'],
    [CLOSE_CODE.invalidMessages, 'disconnected'],
  ])('does not reconnect after close code %i, and shows %s', (code, status) => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.drop(code);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(store.getState().status).toBe(status);
  });

  it('forgets the saved token after being away or replaced', () => {
    const { connection, sockets, tokens } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    sockets[0]!.drop(CLOSE_CODE.idle);
    expect(tokens.read()).toBeNull();
  });

  it('pings while the page is visible and stays quiet when it is hidden', () => {
    const { connection, sockets, hide } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    vi.advanceTimersByTime(30_000);
    expect(sockets[0]!.sent.filter((m) => m['type'] === 'ping')).toHaveLength(1);
    hide();
    vi.advanceTimersByTime(60_000);
    expect(sockets[0]!.sent.filter((m) => m['type'] === 'ping')).toHaveLength(1);
  });

  it('sends moves only while the socket is open', () => {
    const { connection, sockets } = setup();
    connection.connect(1);
    connection.sendMove(1, 2, 3);
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.open();
    connection.sendMove(1, 2, 3);
    expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'move', x: 1, z: 2, facing: 3 });
  });

  it('stops for good when the visitor leaves', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    connection.close();
    sockets[0]!.drop(1006);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(store.getState().status).toBe('idle');
  });

  it('ignores a message that breaks the schema', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'welcome' } as unknown as ServerMessage);
    expect(store.getState().status).toBe('connecting');
  });
});

describe('HallConnection: halls', () => {
  it('connects to the hall it is told to, and sends the nickname it should keep', () => {
    const { connection, sockets } = setup();
    const nickname = { adjectiveId: 'calm', nounId: 'lotus' };
    connection.connect(4, { nickname });
    sockets[0]!.open();
    expect(sockets[0]!.url).toBe('ws://test/ws?hall=4');
    expect(sockets[0]!.sent[0]).toEqual({ type: 'join', lang: 'en', nickname });
  });

  it('sends the saved token only to the hall it belongs to', () => {
    const { connection, sockets, tokens } = setup();
    tokens.write(2, 'x'.repeat(32));
    connection.connect(3);
    sockets[0]!.open();
    expect(sockets[0]!.sent[0]).toEqual({ type: 'join', lang: 'en' });
    connection.connect(2);
    sockets[1]!.open();
    expect(sockets[1]!.sent[0]).toEqual({ type: 'join', lang: 'en', resumeToken: 'x'.repeat(32) });
  });

  it('closes the old socket when moving to another hall, and ignores its late close', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    connection.connect(2);
    expect(sockets[0]!.closedWith).toBe(1000);
    sockets[0]!.drop(1006);
    expect(sockets).toHaveLength(2);
    expect(store.getState().status).toBe('connecting');
  });

  it('keeps the hall number in the saved token', () => {
    const { connection, sockets, tokens } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive({ ...(welcome() as Extract<ServerMessage, { type: 'welcome' }>), hall: 6 });
    expect(tokens.read()?.hall).toBe(6);
  });

  it('shows "hall full" after a refusal with a hint, and keeps the hint', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'error', code: 'hall_full', nextHall: 3 });
    sockets[0]!.drop(CLOSE_CODE.hallFull);
    expect(store.getState()).toMatchObject({
      status: 'hall_full',
      refusal: { code: 'hall_full', nextHall: 3 },
    });
  });

  it('shows "all halls full" when the refusal says no hall has space', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'error', code: 'all_halls_full', nextHall: null });
    sockets[0]!.drop(CLOSE_CODE.hallFull);
    expect(store.getState().status).toBe('all_halls_full');
  });
});

describe('HallConnection: rituals', () => {
  it('sends ritual requests', () => {
    const { connection, sockets } = setup();
    connection.connect(1);
    sockets[0]!.open();
    connection.startRitual('bow');
    connection.stopRitual();
    expect(sockets[0]!.sent.slice(-2)).toEqual([
      { type: 'ritual_start', ritualId: 'bow' },
      { type: 'ritual_stop' },
    ]);
  });

  it('keeps the start time of everyone who is performing a ritual', () => {
    const { connection, sockets, ritualClock, advanceClock } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    advanceClock(500);
    sockets[0]!.receive({ type: 'ritual_started', playerId: 'player-self-xx', ritualId: 'greet' });
    expect(ritualClock.get('player-self-xx')).toEqual({ ritualId: 'greet', startedAtMs: 1500 });
    sockets[0]!.receive({ type: 'ritual_ended', playerId: 'player-self-xx' });
    expect(ritualClock.get('player-self-xx')).toBeUndefined();
  });

  it('forgets the ritual of someone who leaves', () => {
    const { connection, sockets, ritualClock } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    sockets[0]!.receive({ type: 'ritual_started', playerId: 'player-self-xx', ritualId: 'greet' });
    sockets[0]!.receive({ type: 'player_left', playerId: 'player-self-xx' });
    expect(ritualClock.get('player-self-xx')).toBeUndefined();
  });

  it('records which ritual did not start when the hall has no place for it', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    connection.startRitual('bow');
    sockets[0]!.receive({ type: 'error', code: 'no_slot_free' });
    expect(store.getState().ritualNotice).toEqual({ code: 'no_slot_free', ritualId: 'bow' });
    connection.startRitual('lamp');
    sockets[0]!.receive({ type: 'error', code: 'lamp_limit' });
    expect(store.getState().ritualNotice).toEqual({ code: 'lamp_limit', ritualId: 'lamp' });
  });
});

describe('HallConnection: server clock and chanting', () => {
  it('learns how far the browser clock is from the server clock from the welcome', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    sockets[0]!.receive({
      ...(welcome() as Extract<ServerMessage, { type: 'welcome' }>),
      serverTimeMs: EPOCH_NOW + 800,
    });
    expect(store.getState().clockOffsetMs).toBe(800);
  });

  it('keeps the chanting and special day that come with the welcome, and follows the session announcements', () => {
    const { connection, sockets, store } = setup();
    connection.connect(1);
    sockets[0]!.open();
    const session = { startAtMs: 5_000_000, durationMs: 300_000, audioId: 'chanting' };
    sockets[0]!.receive({
      ...(welcome() as Extract<ServerMessage, { type: 'welcome' }>),
      chanting: session,
      specialDay: { date: '2026-11-02', name: { en: 'Example day' } },
    });
    expect(store.getState().chanting).toEqual(session);
    expect(store.getState().specialDay).toEqual({
      date: '2026-11-02',
      name: { en: 'Example day' },
    });
    sockets[0]!.receive({ type: 'chanting_end' });
    expect(store.getState().chanting).toBeNull();
    sockets[0]!.receive({ type: 'chanting_start', ...session });
    expect(store.getState().chanting).toEqual(session);
  });
});
