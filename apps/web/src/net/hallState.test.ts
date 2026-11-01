import type { PlayerView, ServerMessage } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { INITIAL_HALL_STATE, applyServerMessage } from './hallState';

const view = (id: string, x = 0): PlayerView => ({
  id,
  nickname: { adjectiveId: 'calm', nounId: 'lotus' },
  avatarId: 1,
  x,
  z: 0,
  facing: 0,
});

const welcome: ServerMessage = {
  type: 'welcome',
  playerId: 'player-self-xx',
  resumeToken: 'r'.repeat(32),
  hall: 2,
  nickname: { adjectiveId: 'calm', nounId: 'lotus' },
  avatarId: 3,
  players: [view('player-self-xx'), view('player-other-x')],
  population: 2,
  serverTimeMs: 1,
  positionSendHz: 8,
  pingSec: 30,
};

describe('applyServerMessage', () => {
  it('becomes joined on welcome and learns who is here', () => {
    const state = applyServerMessage(INITIAL_HALL_STATE, welcome);
    expect(state).toMatchObject({
      status: 'joined',
      hall: 2,
      selfId: 'player-self-xx',
      population: 2,
    });
    expect([...state.players.keys()]).toEqual(['player-self-xx', 'player-other-x']);
  });

  it('adds and removes people without changing the old state object', () => {
    const joined = applyServerMessage(INITIAL_HALL_STATE, welcome);
    const added = applyServerMessage(joined, {
      type: 'player_joined',
      player: view('player-new-xxx'),
    });
    expect(added.players.has('player-new-xxx')).toBe(true);
    expect(joined.players.has('player-new-xxx')).toBe(false);
    const removed = applyServerMessage(added, { type: 'player_left', playerId: 'player-new-xxx' });
    expect(removed.players.has('player-new-xxx')).toBe(false);
  });

  it('updates the population and leaves state alone for messages it does not track', () => {
    const joined = applyServerMessage(INITIAL_HALL_STATE, welcome);
    expect(applyServerMessage(joined, { type: 'population', count: 9 }).population).toBe(9);
    const snapshot: ServerMessage = { type: 'snapshot', tick: 1, moves: [] };
    expect(applyServerMessage(joined, snapshot)).toBe(joined);
  });

  it('remembers why a join was refused, and forgets it on the next welcome', () => {
    const refused = applyServerMessage(INITIAL_HALL_STATE, {
      type: 'error',
      code: 'hall_full',
      nextHall: 5,
    });
    expect(refused.refusal).toEqual({ code: 'hall_full', nextHall: 5 });
    expect(applyServerMessage(refused, welcome).refusal).toBeNull();
  });

  it('ignores errors that are not about a full hall, and keeps a placement notice through welcome', () => {
    const idle = applyServerMessage(INITIAL_HALL_STATE, { type: 'error', code: 'rate_limited' });
    expect(idle).toBe(INITIAL_HALL_STATE);
    const withNotice = { ...INITIAL_HALL_STATE, notice: { fromHall: 1, toHall: 2 } };
    expect(applyServerMessage(withNotice, welcome).notice).toEqual({ fromHall: 1, toHall: 2 });
  });
});
