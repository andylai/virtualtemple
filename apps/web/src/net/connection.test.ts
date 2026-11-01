import { CLOSE_CODE, type ServerMessage } from '@temple/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HallConnection, type TokenStorage } from './connection';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import { TrackSet } from './interpolation';
import { Store } from './store';

type Listener = (event: { data?: unknown; code?: number }) => void;

class FakeSocket {
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
      x: 1,
      z: 2,
      facing: 0,
    },
  ],
  population: 1,
  serverTimeMs: 1,
  positionSendHz: 8,
  pingSec: 30,
});

function setup() {
  const sockets: FakeSocket[] = [];
  let saved: string | null = null;
  const tokens: TokenStorage = {
    read: () => saved,
    write: (token) => (saved = token),
    clear: () => (saved = null),
  };
  const store = new Store<HallState>(INITIAL_HALL_STATE);
  const tracks = new TrackSet();
  let visible = true;
  let clock = 1000;
  const connection = new HallConnection({
    url: 'ws://test/ws?hall=1',
    language: 'en',
    store,
    tracks,
    tokens,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    now: () => clock,
    random: () => 0.5,
    isPageVisible: () => visible,
  });
  return {
    connection,
    sockets,
    store,
    tracks,
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
    connection.connect();
    expect(store.getState().status).toBe('connecting');
    sockets[0]!.open();
    expect(sockets[0]!.sent).toEqual([{ type: 'join', lang: 'en' }]);
    sockets[0]!.receive(welcome());
    expect(store.getState()).toMatchObject({ status: 'joined', selfId: 'player-self-xx' });
    expect(tokens.read()).toBe('t'.repeat(32));
  });

  it('puts the saved token in the join so the same person returns', () => {
    const { connection, sockets, tokens } = setup();
    tokens.write('x'.repeat(32));
    connection.connect();
    sockets[0]!.open();
    expect(sockets[0]!.sent[0]).toEqual({ type: 'join', lang: 'en', resumeToken: 'x'.repeat(32) });
  });

  it('records snapshots as positions to draw', () => {
    const { connection, sockets, tracks, advanceClock } = setup();
    connection.connect();
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
    connection.connect();
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
    connection.connect();
    sockets[0]!.open();
    sockets[0]!.drop(code);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(store.getState().status).toBe(status);
  });

  it('forgets the saved token after being away or replaced', () => {
    const { connection, sockets, tokens } = setup();
    connection.connect();
    sockets[0]!.open();
    sockets[0]!.receive(welcome());
    sockets[0]!.drop(CLOSE_CODE.idle);
    expect(tokens.read()).toBeNull();
  });

  it('pings while the page is visible and stays quiet when it is hidden', () => {
    const { connection, sockets, hide } = setup();
    connection.connect();
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
    connection.connect();
    connection.sendMove(1, 2, 3);
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.open();
    connection.sendMove(1, 2, 3);
    expect(sockets[0]!.sent.at(-1)).toEqual({ type: 'move', x: 1, z: 2, facing: 3 });
  });

  it('stops for good when the visitor leaves', () => {
    const { connection, sockets, store } = setup();
    connection.connect();
    sockets[0]!.open();
    connection.close();
    sockets[0]!.drop(1006);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(store.getState().status).toBe('idle');
  });

  it('ignores a message that breaks the schema', () => {
    const { connection, sockets, store } = setup();
    connection.connect();
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'welcome' } as unknown as ServerMessage);
    expect(store.getState().status).toBe('connecting');
  });
});
