import { DEFAULT_CONFIG, parseHallNumber, type LanguageCode } from '@temple/shared';
import { HallConnection, sessionTokenStorage } from './connection';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import { TrackSet } from './interpolation';
import { Store } from './store';

const FIRST_HALL = 1;

/** The hall the page address asks for (`?hall=2`), or the first hall. */
export function hallFromAddress(search: string): number {
  const raw = new URLSearchParams(search).get('hall');
  return parseHallNumber(raw, DEFAULT_CONFIG.hall.count) ?? FIRST_HALL;
}

/** Everything the interface needs to talk to one hall. */
export interface HallClient {
  store: Store<HallState>;
  tracks: TrackSet;
  connection: HallConnection;
}

/**
 * Builds the client for one hall. It does not connect until `connection.connect()` is called,
 * which happens when the visitor presses Enter.
 *
 * @param hall - The hall number.
 * @param language - The visitor's language.
 */
export function createHallClient(hall: number, language: LanguageCode): HallClient {
  const store = new Store<HallState>(INITIAL_HALL_STATE);
  const tracks = new TrackSet();
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const connection = new HallConnection({
    url: `${scheme}://${window.location.host}/ws?hall=${hall}`,
    language,
    store,
    tracks,
    tokens: sessionTokenStorage(),
    createSocket: (url) => new WebSocket(url),
    now: () => performance.now(),
    random: Math.random,
    isPageVisible: () => document.visibilityState === 'visible',
  });
  return { store, tracks, connection };
}
