import type { PlayerView, ServerMessage } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_HALL_STATE,
  addToast,
  applyServerMessage,
  dismissToast,
  type Toast,
} from './hallState';

const view = (id: string, x = 0): PlayerView => ({
  id,
  nickname: { adjectiveId: 'calm', nounId: 'lotus' },
  avatarId: 1,
  x,
  z: 0,
  facing: 0,
  ritual: null,
});

const welcome: ServerMessage = {
  type: 'welcome',
  playerId: 'player-self-xx',
  resumeToken: 'r'.repeat(32),
  hall: 2,
  nickname: { adjectiveId: 'calm', nounId: 'lotus' },
  avatarId: 3,
  players: [view('player-self-xx'), view('player-other-x')],
  lamps: [{ slotId: 'lamp-1', ownerId: 'player-other-x' }],
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

describe('rituals, lamps and toasts', () => {
  const joined = applyServerMessage(INITIAL_HALL_STATE, welcome);

  it('learns which lamps are lit from the welcome and from lamp messages', () => {
    expect([...joined.lamps]).toEqual([['lamp-1', 'player-other-x']]);
    const lit = applyServerMessage(joined, {
      type: 'lamp_lit',
      slotId: 'lamp-2',
      ownerId: 'player-self-xx',
    });
    expect([...lit.lamps.keys()]).toEqual(['lamp-1', 'lamp-2']);
    expect([
      ...applyServerMessage(lit, { type: 'lamp_out', slotId: 'lamp-1' }).lamps.keys(),
    ]).toEqual(['lamp-2']);
  });

  it('shows what someone else is doing, and adds a toast for it', () => {
    const state = applyServerMessage(joined, {
      type: 'ritual_started',
      playerId: 'player-other-x',
      ritualId: 'greet',
    });
    expect(state.players.get('player-other-x')?.ritual).toEqual({ ritualId: 'greet' });
    expect(state.toasts).toEqual([
      { id: 1, nickname: { adjectiveId: 'calm', nounId: 'lotus' }, ritualId: 'greet' },
    ]);
    const ended = applyServerMessage(state, { type: 'ritual_ended', playerId: 'player-other-x' });
    expect(ended.players.get('player-other-x')?.ritual).toBeNull();
    expect(ended.toasts).toHaveLength(1);
  });

  it('keeps the cushion in the ritual of a person who is bowing', () => {
    const state = applyServerMessage(joined, {
      type: 'ritual_started',
      playerId: 'player-other-x',
      ritualId: 'bow',
      slotId: 'cushion-3',
    });
    expect(state.players.get('player-other-x')?.ritual).toEqual({
      ritualId: 'bow',
      slotId: 'cushion-3',
    });
  });

  it("adds no toast for the visitor's own ritual, and ends their walk", () => {
    const walking = applyServerMessage(joined, {
      type: 'ritual_walk',
      slotId: 'cushion-1',
      x: 1,
      z: 2,
      facing: 0,
    });
    expect(walking.walk).toEqual({ slotId: 'cushion-1', x: 1, z: 2, facing: 0 });
    const bowing = applyServerMessage(walking, {
      type: 'ritual_started',
      playerId: 'player-self-xx',
      ritualId: 'bow',
      slotId: 'cushion-1',
    });
    expect(bowing.walk).toBeNull();
    expect(bowing.toasts).toEqual([]);
  });

  it('ignores ritual messages about people who are not here', () => {
    const state = applyServerMessage(joined, {
      type: 'ritual_started',
      playerId: 'player-ghost-x',
      ritualId: 'greet',
    });
    expect(state).toBe(joined);
  });
});

describe('toasts', () => {
  const toast = (id: number): Toast => ({
    id,
    nickname: { adjectiveId: 'calm', nounId: 'lotus' },
    ritualId: 'greet',
  });

  it('keeps only the newest toasts when there are too many', () => {
    const toasts = [1, 2, 3].reduce<Toast[]>((all, id) => addToast(all, toast(id), 3), []);
    expect(addToast(toasts, toast(4), 3).map((t) => t.id)).toEqual([2, 3, 4]);
  });

  it('removes one toast by id', () => {
    expect(dismissToast([toast(1), toast(2)], 1).map((t) => t.id)).toEqual([2]);
  });
});
