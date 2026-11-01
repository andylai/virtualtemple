import {
  DEFAULT_CONFIG,
  type NicknameIds,
  type PlayerView,
  type RitualId,
  type ServerMessage,
} from '@temple/shared';

/** Where the visitor stands with the hall. */
export type HallStatus =
  | 'idle'
  | 'connecting'
  | 'joined'
  | 'reconnecting'
  | 'hall_full'
  | 'all_halls_full'
  | 'away'
  | 'replaced'
  | 'disconnected';

/** Why a join was refused, and where the hall suggests trying next. */
export interface Refusal {
  code: 'hall_full' | 'all_halls_full';
  /** A hall that probably has space; null when none has; undefined when the hall did not know. */
  nextHall: number | null | undefined;
}

/** A short message that the visitor was placed in another hall because theirs was full. */
export interface PlacementNotice {
  fromHall: number;
  toHall: number;
}

/** Where the hall told this visitor to walk to bow (spec FR-17). */
export interface CushionWalk {
  slotId: string;
  x: number;
  z: number;
  facing: number;
}

/** A short message that someone else did a ritual. The words are made when it is drawn. */
export interface Toast {
  id: number;
  nickname: NicknameIds;
  ritualId: RitualId;
}

/** Why the visitor's ritual did not start. */
export interface RitualNotice {
  code: 'no_slot_free' | 'lamp_limit';
  ritualId: RitualId | null;
}

/** Everything the interface needs to know about the hall. Positions live in `TrackSet`, not here. */
export interface HallState {
  status: HallStatus;
  hall: number | null;
  selfId: string | null;
  nickname: NicknameIds | null;
  avatarId: number;
  population: number;
  players: ReadonlyMap<string, PlayerView>;
  positionSendHz: number;
  pingSec: number;
  refusal: Refusal | null;
  notice: PlacementNotice | null;
  /** The lit lamps: lamp place to the person who lit it. */
  lamps: ReadonlyMap<string, string>;
  /** The cushion to walk to, or null. */
  walk: CushionWalk | null;
  toasts: readonly Toast[];
  toastSeq: number;
  ritualNotice: RitualNotice | null;
}

/** Defaults used until the server's welcome arrives. */
const FALLBACK_SEND_HZ = 8;
const FALLBACK_PING_SEC = 30;

export const INITIAL_HALL_STATE: HallState = {
  status: 'idle',
  hall: null,
  selfId: null,
  nickname: null,
  avatarId: 0,
  population: 0,
  players: new Map(),
  positionSendHz: FALLBACK_SEND_HZ,
  pingSec: FALLBACK_PING_SEC,
  refusal: null,
  notice: null,
  lamps: new Map(),
  walk: null,
  toasts: [],
  toastSeq: 0,
  ritualNotice: null,
};

/**
 * Works out the new state after a message from the server. Movement snapshots are not handled
 * here because they change many times a second and are drawn straight from `TrackSet`.
 */
export function applyServerMessage(state: HallState, message: ServerMessage): HallState {
  switch (message.type) {
    case 'welcome':
      return {
        status: 'joined',
        hall: message.hall,
        selfId: message.playerId,
        nickname: message.nickname,
        avatarId: message.avatarId,
        population: message.population,
        players: new Map(message.players.map((player) => [player.id, player])),
        positionSendHz: message.positionSendHz,
        pingSec: message.pingSec,
        refusal: null,
        notice: state.notice,
        lamps: new Map(message.lamps.map((lamp) => [lamp.slotId, lamp.ownerId])),
        walk: null,
        toasts: [],
        toastSeq: state.toastSeq,
        ritualNotice: null,
      };
    case 'player_joined':
      return { ...state, players: new Map(state.players).set(message.player.id, message.player) };
    case 'player_left': {
      const players = new Map(state.players);
      players.delete(message.playerId);
      return { ...state, players };
    }
    case 'population':
      return { ...state, population: message.count };
    case 'error':
      return message.code === 'hall_full' || message.code === 'all_halls_full'
        ? { ...state, refusal: { code: message.code, nextHall: message.nextHall } }
        : state;
    case 'ritual_started':
      return withRitual(state, message.playerId, {
        ritualId: message.ritualId,
        ...slot(message.slotId),
      });
    case 'ritual_ended':
      return withRitual(state, message.playerId, null);
    case 'ritual_walk':
      return {
        ...state,
        walk: { slotId: message.slotId, x: message.x, z: message.z, facing: message.facing },
      };
    case 'lamp_lit':
      return { ...state, lamps: new Map(state.lamps).set(message.slotId, message.ownerId) };
    case 'lamp_out': {
      const lamps = new Map(state.lamps);
      lamps.delete(message.slotId);
      return { ...state, lamps };
    }
    default:
      return state;
  }
}

function slot(slotId: string | undefined): { slotId?: string } {
  return slotId === undefined ? {} : { slotId };
}

/**
 * Records what a person is performing. When someone else starts a ritual a toast is added; when
 * this visitor reaches their cushion the walk is over.
 */
function withRitual(state: HallState, playerId: string, ritual: PlayerView['ritual']): HallState {
  const person = state.players.get(playerId);
  if (person === undefined) {
    return state;
  }
  const players = new Map(state.players).set(playerId, { ...person, ritual });
  if (playerId === state.selfId) {
    // Whatever the visitor does next, a walk to a cushion is over.
    return { ...state, players, walk: null };
  }
  if (ritual === null) {
    return { ...state, players };
  }
  const toast = { id: state.toastSeq + 1, nickname: person.nickname, ritualId: ritual.ritualId };
  return { ...state, players, toasts: addToast(state.toasts, toast), toastSeq: toast.id };
}

/**
 * Adds a toast, dropping the oldest when more than `maxToasts` would show (FR-21).
 *
 * @param toasts - The toasts now showing, oldest first.
 * @param toast - The new one.
 * @param maxToasts - How many may show at once.
 */
export function addToast(
  toasts: readonly Toast[],
  toast: Toast,
  maxToasts: number = DEFAULT_CONFIG.ui.maxToasts,
): Toast[] {
  return [...toasts, toast].slice(-maxToasts);
}

/** Removes a toast once it has been shown long enough. */
export function dismissToast(toasts: readonly Toast[], id: number): Toast[] {
  return toasts.filter((toast) => toast.id !== id);
}
