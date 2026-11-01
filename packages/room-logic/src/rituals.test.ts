import type { Point } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { PlayerRegistry } from './registry';
import { RitualEngine, type RitualEffect, type RitualEngineOptions } from './rituals';

const area: Point[] = [
  { x: -6, z: -4 },
  { x: 6, z: -4 },
  { x: 6, z: 9 },
  { x: -6, z: 9 },
];
const cushions = [
  { id: 'cushion-1', x: -3, z: 0, facing: 0 },
  { id: 'cushion-2', x: 0, z: 0, facing: 0 },
  { id: 'cushion-3', x: 3, z: 0, facing: 0 },
];
const lampSlots = [
  { id: 'lamp-1', x: 5.5, z: -3 },
  { id: 'lamp-2', x: 5.5, z: -2 },
];
const COOLDOWN = 1500;
const WALK_TIMEOUT = 20_000;
const LAMP_LIFE = 300_000;

function setup(overrides: Partial<RitualEngineOptions> = {}, hallSize = 10, idPrefix = 'player') {
  let counter = 0;
  let seed = 0;
  const players = new PlayerRegistry({
    maxPlayers: hallSize,
    walkableArea: area,
    nicknames: { adjectiveIds: ['a', 'b', 'c', 'd'], nounIds: ['w', 'x', 'y', 'z'] },
    random: () => ((seed = (seed + 0.137) % 1), seed),
    newPlayerId: () => `${idPrefix}-${(counter += 1)}-xxxxxxxx`,
  });
  const engine = new RitualEngine({
    players,
    offered: ['greet', 'bow', 'lamp', 'sit'],
    cushions,
    lampSlots,
    cooldownMs: COOLDOWN,
    walkTimeoutMs: WALK_TIMEOUT,
    lampDurationMs: LAMP_LIFE,
    lampMaxPerPlayer: 1,
    ...overrides,
  });
  /** Adds a person standing at (x, z). */
  const person = (x: number, z: number): string => {
    const result = players.admit(undefined, 0);
    if (!result.ok) throw new Error('hall is full');
    players.setPosition(result.player.id, x, z, 0);
    return result.player.id;
  };
  return { players, engine, person };
}

const types = (effects: RitualEffect[]) => effects.map((effect) => effect.type);

describe('greet', () => {
  it('starts at once, and ends after its duration', () => {
    const { engine, person, players } = setup();
    const id = person(0, 5);
    const started = engine.start(id, 'greet', 10_000);
    expect(started.effects).toEqual([{ type: 'started', playerId: id, ritualId: 'greet' }]);
    expect(started.changed).toEqual([id]);
    expect(players.get(id)?.ritual).toMatchObject({ ritualId: 'greet', phase: 'performing' });
    expect(engine.runDue(10_000 + 2_000).effects).toEqual([]);
    const ended = engine.runDue(10_000 + 2_500);
    expect(ended.effects).toEqual([{ type: 'ended', playerId: id }]);
    expect(players.get(id)?.ritual).toBeNull();
  });

  it('is not allowed when the temple does not offer it', () => {
    const { engine, person } = setup({ offered: ['greet'] });
    expect(engine.start(person(0, 5), 'lamp', 0)).toMatchObject({
      error: 'not_offered',
      effects: [],
    });
  });

  it('refuses someone who is not in the hall', () => {
    const { engine } = setup();
    expect(engine.start('nobody-xxxxxxxx', 'greet', 0).error).toBe('not_in_hall');
  });
});

describe('cooldown', () => {
  it('refuses a second ritual too soon and allows it after the cooldown', () => {
    const { engine, person } = setup();
    const id = person(0, 5);
    engine.start(id, 'greet', 10_000);
    expect(engine.start(id, 'greet', 10_000 + COOLDOWN - 1).error).toBe('cooldown');
    expect(engine.start(id, 'greet', 10_000 + COOLDOWN).error).toBeNull();
  });

  it('does not let a refused attempt cancel what the person is doing', () => {
    const { engine, person, players } = setup();
    const id = person(0, 5);
    engine.start(id, 'greet', 0);
    engine.start(id, 'lamp', 100);
    expect(players.get(id)?.ritual?.ritualId).toBe('greet');
    expect(engine.litLamps()).toEqual([]);
  });

  it('replaces the old ritual when a new one starts, telling others the old one ended', () => {
    const { engine, person, players } = setup();
    const id = person(0, 5);
    engine.start(id, 'greet', 0);
    const next = engine.start(id, 'lamp', COOLDOWN);
    expect(types(next.effects)).toEqual(['ended', 'started', 'lamp_lit']);
    expect(players.get(id)?.ritual?.ritualId).toBe('lamp');
  });
});

describe('bow and cushions', () => {
  it('gives the nearest free cushion and tells the person to walk there', () => {
    const { engine, person } = setup();
    const id = person(2.5, 6);
    const outcome = engine.start(id, 'bow', 0);
    expect(outcome.effects).toEqual([
      { type: 'walk', playerId: id, slotId: 'cushion-3', x: 3, z: 0, facing: 0 },
    ]);
  });

  it('starts the bow only when the person arrives, and puts them exactly on the cushion', () => {
    const { engine, person, players } = setup();
    const id = person(2.5, 6);
    engine.start(id, 'bow', 0);
    players.applyMove(id, 3, 3, 0);
    expect(engine.onMove(id, 1_000).effects).toEqual([]);
    players.applyMove(id, 3.2, 0.3, 0);
    const arrived = engine.onMove(id, 2_000);
    expect(arrived.effects).toEqual([
      { type: 'started', playerId: id, ritualId: 'bow', slotId: 'cushion-3' },
    ]);
    expect(players.get(id)).toMatchObject({ x: 3, z: 0, facing: 0 });
    expect(players.get(id)?.ritual).toMatchObject({ phase: 'performing', slotId: 'cushion-3' });
  });

  it('starts at once for someone already standing at a cushion', () => {
    const { engine, person } = setup();
    const id = person(0.2, 0.1);
    expect(types(engine.start(id, 'bow', 0).effects)).toEqual(['walk', 'started']);
  });

  it('never gives one cushion to two people, and picks the next nearest', () => {
    const { engine, person } = setup();
    const first = person(0, 0.1);
    const second = person(0, 0.2);
    const a = engine.start(first, 'bow', 0).effects[0];
    const b = engine.start(second, 'bow', 0).effects[0];
    expect(a).toMatchObject({ slotId: 'cushion-2' });
    expect(b).toMatchObject({ slotId: 'cushion-1' });
  });

  it('says there is no free cushion once they are all taken', () => {
    const { engine, person } = setup();
    for (let i = 0; i < cushions.length; i += 1) {
      engine.start(person(0, 5 + i * 0.1), 'bow', 0);
    }
    const late = engine.start(person(0, 8), 'bow', 0);
    expect(late).toMatchObject({ error: 'no_slot_free', effects: [] });
  });

  it('lets the person who holds a cushion ask again without losing it to anyone else', () => {
    const { engine, person } = setup();
    const id = person(0, 5);
    engine.start(id, 'bow', 0);
    const again = engine.start(id, 'bow', COOLDOWN);
    expect(again.effects[0]).toMatchObject({ type: 'walk', slotId: 'cushion-2' });
  });

  it('frees the cushion when the bow ends, when stopped, and when the person leaves', () => {
    const { engine, person, players } = setup();
    const finish = person(0, 0.1);
    engine.start(finish, 'bow', 0);
    expect(types(engine.runDue(6_000).effects)).toEqual(['ended']);
    const stopper = person(0, 0.1);
    engine.start(stopper, 'bow', 7_000);
    expect(types(engine.stop(stopper).effects)).toEqual(['ended']);
    const leaver = person(0, 0.1);
    engine.start(leaver, 'bow', 8_000);
    engine.onLeave(leaver);
    players.remove(leaver);
    const next = engine.start(person(0, 0.1), 'bow', 9_000);
    expect(next.effects[0]).toMatchObject({ slotId: 'cushion-2' });
  });

  it('ends the bow when the person walks away from the cushion', () => {
    const { engine, person, players } = setup();
    const id = person(0, 0.1);
    engine.start(id, 'bow', 0);
    players.applyMove(id, 0.9, 0, 0);
    expect(engine.onMove(id, 1_000).effects).toEqual([]);
    players.applyMove(id, 2.5, 0, 0);
    expect(engine.onMove(id, 2_000).effects).toEqual([{ type: 'ended', playerId: id }]);
    expect(players.get(id)?.ritual).toBeNull();
  });

  it('gives up the cushion silently when the person never arrives', () => {
    const { engine, person, players } = setup();
    const id = person(0, 8);
    engine.start(id, 'bow', 0);
    const outcome = engine.runDue(WALK_TIMEOUT);
    expect(outcome.effects).toEqual([]);
    expect(outcome.changed).toEqual([id]);
    expect(players.get(id)?.ritual).toBeNull();
    expect(engine.start(person(0, 0.1), 'bow', WALK_TIMEOUT).effects[0]).toMatchObject({
      slotId: 'cushion-2',
    });
  });
});

describe('lamps', () => {
  it('lights the first free place and tells everyone', () => {
    const { engine, person } = setup();
    const id = person(0, 5);
    const outcome = engine.start(id, 'lamp', 0);
    expect(outcome.effects).toEqual([
      { type: 'started', playerId: id, ritualId: 'lamp' },
      { type: 'lamp_lit', slotId: 'lamp-1', ownerId: id },
    ]);
    expect(engine.litLamps()).toEqual([{ slotId: 'lamp-1', ownerId: id }]);
  });

  it('allows only the permitted number of lit lamps per person', () => {
    const { engine, person } = setup();
    const id = person(0, 5);
    engine.start(id, 'lamp', 0);
    expect(engine.start(id, 'lamp', COOLDOWN)).toMatchObject({ error: 'lamp_limit', effects: [] });
  });

  it('gives different people different places, and says when none is left', () => {
    const { engine, person } = setup();
    engine.start(person(0, 5), 'lamp', 0);
    engine.start(person(0, 5), 'lamp', 0);
    expect(engine.litLamps().map((lamp) => lamp.slotId)).toEqual(['lamp-1', 'lamp-2']);
    expect(engine.start(person(0, 5), 'lamp', 0).error).toBe('no_slot_free');
  });

  it('puts the lamp out after its life, and frees the place and the owner', () => {
    const { engine, person } = setup();
    const id = person(0, 5);
    engine.start(id, 'lamp', 1_000);
    expect(engine.nextDueAtMs()).toBe(1_000 + 1_500);
    const early = engine.runDue(1_000 + LAMP_LIFE - 1);
    expect(early.effects.filter((e) => e.type === 'lamp_out')).toEqual([]);
    const out = engine.runDue(1_000 + LAMP_LIFE);
    expect(out.effects).toEqual([{ type: 'lamp_out', slotId: 'lamp-1' }]);
    expect(engine.litLamps()).toEqual([]);
    expect(engine.start(id, 'lamp', 1_000 + LAMP_LIFE).error).toBeNull();
  });

  it('keeps a lamp lit when its owner leaves', () => {
    const { engine, person, players } = setup();
    const id = person(0, 5);
    engine.start(id, 'lamp', 0);
    engine.onLeave(id);
    players.remove(id);
    expect(engine.litLamps()).toHaveLength(1);
  });
});

describe('rebuild after the hall was evicted', () => {
  it('restores cushion owners, end times and lamps', () => {
    const first = setup();
    const id = first.person(0, 0.1);
    first.engine.start(id, 'bow', 0);
    const lamper = first.person(0, 5);
    first.engine.start(lamper, 'lamp', 0);
    const lamps = first.engine.lampRecords();

    const second = setup({}, 10, 'later');
    second.players.restore(first.players.list());
    second.engine.rebuild(lamps);
    expect(second.engine.litLamps()).toHaveLength(1);
    expect(second.engine.start(second.person(0, 0.1), 'bow', 0).effects[0]).toMatchObject({
      slotId: 'cushion-1',
    });
    const ended = second.engine.runDue(10_000);
    expect(ended.effects.some((e) => e.type === 'ended' && e.playerId === id)).toBe(true);
  });
});

describe('sitting for meditation', () => {
  it('reserves the nearest cushion, begins on arrival, and is announced like a bow', () => {
    const { engine, person, players } = setup();
    const id = person(2.5, 6);
    expect(engine.start(id, 'sit', 0).effects).toEqual([
      { type: 'walk', playerId: id, slotId: 'cushion-3', x: 3, z: 0, facing: 0 },
    ]);
    players.applyMove(id, 3.1, 0.2, 0);
    expect(engine.onMove(id, 1_000).effects).toEqual([
      { type: 'started', playerId: id, ritualId: 'sit', slotId: 'cushion-3' },
    ]);
    expect(players.get(id)).toMatchObject({ x: 3, z: 0 });
  });

  it('is held far longer than a bow, so a timer of up to fifteen minutes can run', () => {
    const { engine, person, players } = setup();
    const id = person(3, 0.1);
    engine.start(id, 'sit', 0);
    expect(engine.runDue(10 * 60_000).effects).toEqual([]);
    expect(players.get(id)?.ritual).toMatchObject({ ritualId: 'sit', phase: 'performing' });
    expect(types(engine.runDue(20 * 60_000).effects)).toEqual(['ended']);
  });

  it('shares the cushions with the bow, so nobody gets a cushion that someone else holds', () => {
    const { engine, person } = setup();
    const sitter = person(0, 0.1);
    const bower = person(0, 0.2);
    const a = engine.start(sitter, 'sit', 0).effects[0];
    const b = engine.start(bower, 'bow', 0).effects[0];
    expect(a).toMatchObject({ slotId: 'cushion-2' });
    expect(b).toMatchObject({ slotId: 'cushion-1' });
  });

  it('ends when the person walks away, and frees the cushion when they stop', () => {
    const { engine, person, players } = setup();
    const walker = person(0, 0.1);
    engine.start(walker, 'sit', 0);
    players.applyMove(walker, 0, 5, 0);
    expect(engine.onMove(walker, 1_000).effects).toEqual([{ type: 'ended', playerId: walker }]);
    const stopper = person(0, 0.1);
    engine.start(stopper, 'sit', 2_000);
    expect(types(engine.stop(stopper).effects)).toEqual(['ended']);
    expect(engine.start(person(0, 0.1), 'bow', 3_000).effects[0]).toMatchObject({
      slotId: 'cushion-2',
    });
  });

  it('says there is no cushion when they are all taken', () => {
    const { engine, person } = setup();
    cushions.forEach(() => engine.start(person(0, 5), 'sit', 0));
    expect(engine.start(person(0, 5), 'sit', 0).error).toBe('no_slot_free');
  });
});
