import { DEFAULT_CONFIG, parseHallNumber, type LanguageCode } from '@temple/shared';
import { HallConnection, sessionTokenStorage, type TokenStorage } from './connection';
import { preferencesStore } from '../prefs/preferences';
import { fetchHalls } from './hallsApi';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import { TrackSet } from './interpolation';
import { JoinFlow } from './joinFlow';
import { RitualClock } from './ritualClock';
import { Store } from './store';

/** The hall the page address asks for (`?hall=2`), or null when it names none. */
export function requestedHallFromAddress(search: string): number | null {
  return parseHallNumber(new URLSearchParams(search).get('hall'), DEFAULT_CONFIG.hall.count);
}

/** Everything the interface needs to talk to the halls. */
export interface HallClient {
  store: Store<HallState>;
  tracks: TrackSet;
  ritualClock: RitualClock;
  connection: HallConnection;
  flow: JoinFlow;
  tokens: TokenStorage;
}

/**
 * Builds the client for the halls. Nothing connects until `flow.start()` is called, which happens
 * when the visitor presses Enter.
 *
 * @param language - The visitor's language.
 * @param requestedHall - The hall named in the page address, or null.
 */
export function createHallClient(language: LanguageCode, requestedHall: number | null): HallClient {
  const store = new Store<HallState>(INITIAL_HALL_STATE);
  const tracks = new TrackSet();
  const ritualClock = new RitualClock();
  const tokens = sessionTokenStorage();
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const connection = new HallConnection({
    urlForHall: (hall) => `${scheme}://${window.location.host}/ws?hall=${hall}`,
    language,
    store,
    tracks,
    ritualClock,
    tokens,
    createSocket: (url) => new WebSocket(url),
    now: () => performance.now(),
    epochNow: () => Date.now(),
    random: Math.random,
    isPageVisible: () => document.visibilityState === 'visible',
  });
  const flow = new JoinFlow({
    link: connection,
    store,
    tokens,
    fetchHalls: () => fetchHalls(),
    requestedHall,
    hallCount: DEFAULT_CONFIG.hall.count,
    maxTries: DEFAULT_CONFIG.hall.joinRetries,
    rememberedNickname: () => preferencesStore().getState().nickname,
  });
  return { store, tracks, ritualClock, connection, flow, tokens };
}
