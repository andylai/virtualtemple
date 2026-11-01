import { evictAllDurableObjects } from 'cloudflare:test';
import { DEFAULT_CONFIG } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it, vi } from 'vitest';
import { connect, joinHall, sweepAt, type TestClient } from './helpers';

const MS_PER_SECOND = 1000;
const { cushions, lampSlots } = flagshipManifest.hall;
const lampLifeMs = DEFAULT_CONFIG.lamp.durationSec * MS_PER_SECOND;
const walkTimeoutMs = DEFAULT_CONFIG.ritual.walkTimeoutSec * MS_PER_SECOND;

type Visitor = Awaited<ReturnType<typeof joinHall>>;

const cushion = (slotId: string) => cushions.find((c) => c.id === slotId)!;

/** Gives the hall a moment to handle a message sent on another connection. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

/** Asks to bow and waits for the cushion the hall hands out. */
async function askToBow(visitor: Visitor) {
  visitor.client.send({ type: 'ritual_start', ritualId: 'bow' });
  return visitor.client.waitFor('ritual_walk');
}

/** Walks to the cushion and waits until the hall says the bow has begun. */
async function bowAt(visitor: Visitor, slotId: string) {
  const spot = cushion(slotId);
  visitor.client.send({ type: 'move', x: spot.x, z: spot.z, facing: 0 });
  await visitor.client.waitFor(
    'ritual_started',
    (m) => m.playerId === visitor.welcome.playerId && m.slotId === slotId,
  );
}

/** Joins as many people as there are cushions and gives each one a cushion to walk to. */
async function everyoneAsksToBow(hall: number) {
  const people = await Promise.all(cushions.map(() => joinHall(hall)));
  const walks = await Promise.all(people.map((visitor) => askToBow(visitor)));
  return people.map((visitor, index) => ({ visitor, slotId: walks[index]!.slotId }));
}

describe('greet', () => {
  it('shows everyone who greeted, and ends after a while', async () => {
    const greeter = await joinHall(1);
    const watcher = await joinHall(1);
    greeter.client.send({ type: 'ritual_start', ritualId: 'greet' });
    const started = await watcher.client.waitFor('ritual_started');
    expect(started).toEqual({
      type: 'ritual_started',
      playerId: greeter.welcome.playerId,
      ritualId: 'greet',
    });
    await greeter.client.waitFor('ritual_started');

    const late = await joinHall(1);
    expect(late.welcome.players.find((p) => p.id === greeter.welcome.playerId)?.ritual).toEqual({
      ritualId: 'greet',
    });

    await sweepAt(1, Date.now() + 3 * MS_PER_SECOND);
    await watcher.client.waitFor('ritual_ended', (m) => m.playerId === greeter.welcome.playerId);
  });

  it('quietly ignores a second ritual inside the cooldown', async () => {
    const person = await joinHall(1);
    person.client.send({ type: 'ritual_start', ritualId: 'greet' });
    person.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    await person.client.waitFor('ritual_started');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(person.client.of('ritual_started')).toHaveLength(1);
    expect(person.client.of('lamp_lit')).toEqual([]);
    expect(person.client.of('error')).toEqual([]);
  });
});

describe('bow and cushions', () => {
  it('hands out a cushion, and the bow begins when the person arrives and is put on it', async () => {
    const bower = await joinHall(2);
    const watcher = await joinHall(2);
    const walk = await askToBow(bower);
    expect(watcher.client.of('ritual_started')).toEqual([]);

    const spot = cushion(walk.slotId);
    bower.client.send({ type: 'move', x: spot.x + 0.3, z: spot.z + 0.3, facing: 90 });
    const started = await watcher.client.waitFor('ritual_started');
    expect(started).toMatchObject({
      playerId: bower.welcome.playerId,
      ritualId: 'bow',
      slotId: walk.slotId,
    });
    const snapshot = await watcher.client.waitFor('snapshot', (m) =>
      m.moves.some((move) => move.x === spot.x && move.z === spot.z),
    );
    expect(snapshot.moves.find((move) => move.playerId === bower.welcome.playerId)?.facing).toBe(
      spot.facing,
    );
    expect(watcher.client.of('ritual_ended')).toEqual([]);
  });

  it('ends the bow when the person walks away from the cushion', async () => {
    const bower = await joinHall(2);
    const watcher = await joinHall(2);
    const walk = await askToBow(bower);
    await bowAt(bower, walk.slotId);
    // Near the entrance, inside the hall and far from every cushion.
    bower.client.send({ type: 'move', x: 0, z: 8.5, facing: 0 });
    await watcher.client.waitFor('ritual_ended', (m) => m.playerId === bower.welcome.playerId);
  });

  it('gives two people two different cushions', async () => {
    const first = await joinHall(3);
    const second = await joinHall(3);
    const [a, b] = await Promise.all([askToBow(first), askToBow(second)]);
    expect(a.slotId).not.toBe(b.slotId);
  });

  it('says there is no free cushion when all are taken, without punishing the visitor', async () => {
    await everyoneAsksToBow(4);
    const late = await joinHall(4);
    late.client.send({ type: 'ritual_start', ritualId: 'bow' });
    expect((await late.client.waitFor('error')).code).toBe('no_slot_free');
    for (let i = 0; i < DEFAULT_CONFIG.net.maxInvalidMessages + 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_CONFIG.ritual.cooldownMs / 5 / 5));
    }
    expect(late.client.closeCode).toBeNull();
  });

  it('frees the cushion when the person stops', async () => {
    const [stopper] = await everyoneAsksToBow(5);
    stopper!.visitor.client.send({ type: 'ritual_stop' });
    await settle();
    const newcomer = await joinHall(5);
    expect((await askToBow(newcomer)).slotId).toBe(stopper!.slotId);
  });

  it('frees the cushion when the person leaves', async () => {
    const [leaver] = await everyoneAsksToBow(5);
    leaver!.visitor.client.close();
    await settle();
    const newcomer = await joinHall(5);
    expect((await askToBow(newcomer)).slotId).toBe(leaver!.slotId);
  });

  it('frees every cushion whose person never arrives, once the walk times out', async () => {
    await everyoneAsksToBow(5);
    await sweepAt(5, Date.now() + walkTimeoutMs + MS_PER_SECOND);
    const newcomers = await Promise.all(cushions.map(() => joinHall(5)));
    const walks = await Promise.all(newcomers.map((visitor) => askToBow(visitor)));
    expect(new Set(walks.map((walk) => walk.slotId)).size).toBe(cushions.length);
  });

  it('keeps a reserved cushion through hibernation, and the bow still begins on arrival', async () => {
    const bower = await joinHall(6);
    const walk = await askToBow(bower);
    await evictAllDurableObjects();

    const newcomer = await joinHall(6);
    expect((await askToBow(newcomer)).slotId).not.toBe(walk.slotId);
    await bowAt(bower, walk.slotId);
  });
});

describe('lamps', () => {
  it('lights a lamp for everyone to see, and shows it to people who join later', async () => {
    const lighter = await joinHall(7);
    const watcher = await joinHall(7);
    lighter.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    const lit = await watcher.client.waitFor('lamp_lit');
    expect(lit).toEqual({
      type: 'lamp_lit',
      slotId: lampSlots[0]!.id,
      ownerId: lighter.welcome.playerId,
    });
    await watcher.client.waitFor('ritual_started', (m) => m.ritualId === 'lamp');

    const late = await joinHall(7);
    expect(late.welcome.lamps).toEqual([
      { slotId: lampSlots[0]!.id, ownerId: lighter.welcome.playerId },
    ]);
  });

  it('allows one lit lamp per person, and says so without punishing them', async () => {
    const person = await joinHall(7);
    person.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    await person.client.waitFor('lamp_lit');
    await new Promise((resolve) => setTimeout(resolve, DEFAULT_CONFIG.ritual.cooldownMs + 100));
    person.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    expect((await person.client.waitFor('error')).code).toBe('lamp_limit');
    expect(person.client.closeCode).toBeNull();
  });

  it('says there is no place when the rack is full', async () => {
    const people = await Promise.all(lampSlots.map(() => joinHall(8)));
    people.forEach(({ client }) => client.send({ type: 'ritual_start', ritualId: 'lamp' }));
    await vi.waitFor(() => expect(people[0]!.client.of('lamp_lit')).toHaveLength(lampSlots.length));
    const late = await joinHall(8);
    late.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    expect((await late.client.waitFor('error')).code).toBe('no_slot_free');
  });

  it('puts the lamp out after its life, even after the hall was evicted from memory', async () => {
    const lighter = await joinHall(9);
    lighter.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    await lighter.client.waitFor('lamp_lit');
    await evictAllDurableObjects();

    const watcher = await joinHall(9);
    expect(watcher.welcome.lamps).toHaveLength(1);
    await sweepAt(9, Date.now() + lampLifeMs + MS_PER_SECOND);
    await watcher.client.waitFor('lamp_out', (m) => m.slotId === lampSlots[0]!.id);
    expect((await joinHall(9)).welcome.lamps).toEqual([]);
  });

  it('keeps a lamp lit after its owner leaves', async () => {
    const lighter = await joinHall(10);
    lighter.client.send({ type: 'ritual_start', ritualId: 'lamp' });
    await lighter.client.waitFor('lamp_lit');
    lighter.client.close();
    await vi.waitFor(async () => expect((await joinHall(10)).welcome.population).toBe(1));
    expect((await joinHall(10)).welcome.lamps).toHaveLength(1);
  });
});

describe('bad ritual requests', () => {
  it('refuses a ritual the temple does not offer, as a misuse', async () => {
    const person = await joinHall(11);
    const bad = await connect(11);
    bad.send({ type: 'ritual_start', ritualId: 'bow' });
    expect((await bad.waitFor('error')).code).toBe('not_allowed');
    expect(person.client.closeCode).toBeNull();
  });
});

export type { TestClient };
