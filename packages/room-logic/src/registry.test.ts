import { isPointInPolygon, type Point } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import { PlayerRegistry, type RegistryOptions } from './registry';

const area: Point[] = [
  { x: -6, z: -4 },
  { x: 6, z: -4 },
  { x: 6, z: 9 },
  { x: -6, z: 9 },
];

function makeRegistry(overrides: Partial<RegistryOptions> = {}): PlayerRegistry {
  let counter = 0;
  let seed = 0;
  return new PlayerRegistry({
    maxPlayers: 3,
    walkableArea: area,
    nicknames: { adjectiveIds: ['calm', 'kind', 'still'], nounIds: ['lotus', 'tree', 'mist'] },
    random: () => ((seed = (seed + 0.137) % 1), seed),
    newPlayerId: () => `player-${(counter += 1)}-xxxxxxxx`,
    ...overrides,
  });
}

describe('admit', () => {
  it('admits people until the hall is full, then refuses', () => {
    const registry = makeRegistry();
    const results = [0, 1, 2, 3].map(() => registry.admit(undefined, 1000));
    expect(results.map((result) => result.ok)).toEqual([true, true, true, false]);
    expect(registry.size).toBe(3);
  });

  it('places new people inside the walkable area near the entrance', () => {
    const registry = makeRegistry({ maxPlayers: 20 });
    for (let i = 0; i < 20; i += 1) {
      const result = registry.admit(undefined, 0);
      if (result.ok) {
        expect(isPointInPolygon(result.player, area)).toBe(true);
        expect(result.player.z).toBeGreaterThan(6);
      }
    }
  });

  it('gives different people different ids and nicknames', () => {
    const registry = makeRegistry();
    const players = [0, 1, 2]
      .map(() => registry.admit(undefined, 0))
      .flatMap((r) => (r.ok ? [r.player] : []));
    expect(new Set(players.map((p) => p.id)).size).toBe(3);
    expect(new Set(players.map((p) => `${p.nickname.adjectiveId}:${p.nickname.nounId}`)).size).toBe(
      3,
    );
  });

  it('keeps a remembered nickname that is free', () => {
    const registry = makeRegistry();
    const result = registry.admit({ adjectiveId: 'still', nounId: 'mist' }, 0);
    expect(result.ok && result.player.nickname).toEqual({ adjectiveId: 'still', nounId: 'mist' });
  });
});

describe('readmit', () => {
  it('brings a person back with the same id and position', () => {
    const registry = makeRegistry();
    const first = registry.admit(undefined, 0);
    if (!first.ok) throw new Error('expected a place');
    registry.applyMove(first.player.id, 1, 2, 90);
    const left = registry.remove(first.player.id)!;
    const back = registry.readmit(left);
    expect(back.ok && back.player).toMatchObject({ id: left.id, x: 1, z: 2 });
    expect(registry.size).toBe(1);
  });

  it('refuses when the hall filled up while they were away', () => {
    const registry = makeRegistry({ maxPlayers: 1 });
    const first = registry.admit(undefined, 0);
    if (!first.ok) throw new Error('expected a place');
    const left = registry.remove(first.player.id)!;
    registry.admit(undefined, 0);
    expect(registry.readmit(left)).toEqual({ ok: false, reason: 'hall_full' });
  });

  it('gives a new nickname when theirs was taken in the meantime', () => {
    const registry = makeRegistry();
    const first = registry.admit({ adjectiveId: 'calm', nounId: 'lotus' }, 0);
    if (!first.ok) throw new Error('expected a place');
    const left = registry.remove(first.player.id)!;
    registry.admit({ adjectiveId: 'calm', nounId: 'lotus' }, 0);
    const back = registry.readmit(left);
    expect(back.ok && back.player.nickname).not.toEqual({ adjectiveId: 'calm', nounId: 'lotus' });
  });

  it('does not add a person who is already present', () => {
    const registry = makeRegistry();
    const first = registry.admit(undefined, 0);
    if (!first.ok) throw new Error('expected a place');
    registry.readmit(first.player);
    expect(registry.size).toBe(1);
  });
});

describe('applyMove', () => {
  function oneMember() {
    const registry = makeRegistry();
    const result = registry.admit(undefined, 0);
    if (!result.ok) throw new Error('expected a place');
    return { registry, id: result.player.id };
  }

  it('moves a person inside the area and records that they moved', () => {
    const { registry, id } = oneMember();
    expect(registry.applyMove(id, 1, 1, 450)).toBe('ok');
    expect(registry.get(id)).toMatchObject({ x: 1, z: 1, facing: 90 });
    expect(registry.hasMoves).toBe(true);
    expect(registry.drainMoved().map((p) => p.id)).toEqual([id]);
    expect(registry.hasMoves).toBe(false);
  });

  it('normalises a negative facing', () => {
    const { registry, id } = oneMember();
    registry.applyMove(id, 0, 0, -90);
    expect(registry.get(id)?.facing).toBe(270);
  });

  it('refuses a position outside the area and leaves the person where they were', () => {
    const { registry, id } = oneMember();
    const before = { ...registry.get(id)! };
    expect(registry.applyMove(id, 50, 0, 0)).toBe('outside_area');
    expect(registry.get(id)).toMatchObject({ x: before.x, z: before.z });
    expect(registry.hasMoves).toBe(false);
  });

  it('refuses a move from someone who is not in the hall', () => {
    expect(makeRegistry().applyMove('nobody-xxxxxxxx', 0, 0, 0)).toBe('unknown_player');
  });

  it('forgets a pending move when the person leaves', () => {
    const { registry, id } = oneMember();
    registry.applyMove(id, 1, 1, 0);
    registry.remove(id);
    expect(registry.drainMoved()).toEqual([]);
  });
});

describe('restore', () => {
  it('rebuilds the registry from saved people', () => {
    const source = makeRegistry();
    [0, 1].forEach(() => source.admit(undefined, 0));
    let counter = 100;
    const fresh = makeRegistry({ newPlayerId: () => `fresh-${(counter += 1)}-xxxxxxxx` });
    fresh.restore(source.list());
    expect(fresh.size).toBe(2);
    expect(fresh.admit(undefined, 0).ok).toBe(true);
    expect(fresh.admit(undefined, 0).ok).toBe(false);
  });
});
