import type { NicknameIds, PlayerView, ServerMessage } from '@temple/shared';

/** Where the visitor stands with the hall. */
export type HallStatus =
  | 'idle'
  | 'connecting'
  | 'joined'
  | 'reconnecting'
  | 'hall_full'
  | 'away'
  | 'replaced'
  | 'disconnected';

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
    default:
      return state;
  }
}
