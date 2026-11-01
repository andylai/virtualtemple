import { SELF, env, evictAllDurableObjects, runInDurableObject } from 'cloudflare:test';
import { CLOSE_CODE, DEFAULT_CONFIG, hallRoomName } from '@temple/shared';
import { describe, expect, it, vi } from 'vitest';
import { connect, joinHall, ORIGIN } from './helpers';

const { maxPlayers, idleKickSec, joinTimeoutSec } = DEFAULT_CONFIG.hall;
const MS_PER_SECOND = 1000;
/** A point inside the flagship hall's walkable area. */
const INSIDE = { x: 1, z: 2 };

function stubFor(hall: number) {
  return env.TempleRoom.getByName(hallRoomName('flagship', hall));
}

async function sweepAt(hall: number, atMs: number): Promise<void> {
  await runInDurableObject(stubFor(hall), (room) => room.sweepExpired(atMs));
}

describe('requests the Worker refuses', () => {
  const upgrade = { Upgrade: 'websocket' };
  const status = async (path: string, headers: Record<string, string>) =>
    (await SELF.fetch(`http://example.com${path}`, { headers })).status;

  it('refuses a missing or foreign Origin', async () => {
    expect(await status('/ws?hall=1', upgrade)).toBe(403);
    expect(await status('/ws?hall=1', { ...upgrade, Origin: 'https://evil.example' })).toBe(403);
  });

  it('refuses a bad hall number and a plain request', async () => {
    const ok = { ...upgrade, Origin: ORIGIN };
    for (const hall of ['0', String(DEFAULT_CONFIG.hall.count + 1), 'x', '1.5', '']) {
      expect(await status(`/ws?hall=${hall}`, ok)).toBe(400);
    }
    expect(await status('/ws?hall=1', { Origin: ORIGIN })).toBe(426);
  });
});

describe('joining', () => {
  it('welcomes a visitor with an id, a nickname and the people already there', async () => {
    const { welcome } = await joinHall(1);
    expect(welcome.hall).toBe(1);
    expect(welcome.population).toBe(1);
    expect(welcome.players.map((player) => player.id)).toEqual([welcome.playerId]);
    expect(welcome.positionSendHz).toBe(DEFAULT_CONFIG.net.positionSendHz);
    expect(welcome.pingSec).toBe(DEFAULT_CONFIG.net.pingSec);
    expect(welcome.resumeToken).toHaveLength(32);
  });

  it('tells everyone when someone joins and leaves', async () => {
    const first = await joinHall(2);
    const second = await joinHall(2);
    expect(second.welcome.population).toBe(2);
    expect(second.welcome.players).toHaveLength(2);
    await first.client.waitFor('player_joined', (m) => m.player.id === second.welcome.playerId);
    await first.client.waitFor('population', (m) => m.count === 2);

    second.client.close();
    await first.client.waitFor('player_left', (m) => m.playerId === second.welcome.playerId);
    await first.client.waitFor('population', (m) => m.count === 1);
  });

  it('keeps a remembered nickname unless someone already has it', async () => {
    const wanted = { adjectiveId: 'calm', nounId: 'lotus' };
    const first = await joinHall(3, { nickname: wanted });
    const second = await joinHall(3, { nickname: wanted });
    expect(first.welcome.nickname).toEqual(wanted);
    expect(second.welcome.nickname).not.toEqual(wanted);
  });

  it('does not accept anything but a join from someone who has not joined', async () => {
    const client = await connect(4);
    client.send({ type: 'move', ...INSIDE, facing: 0 });
    expect((await client.waitFor('error')).code).toBe('not_allowed');
  });

  it('does not accept a second join', async () => {
    const { client } = await joinHall(4);
    client.send({ type: 'join', lang: 'en' });
    await client.waitFor('error', (m) => m.code === 'not_allowed');
  });
});

describe('capacity', () => {
  it('admits exactly the capacity when more visitors join at the same moment', async () => {
    const visitors = maxPlayers + 10;
    const clients = await Promise.all(Array.from({ length: visitors }, () => connect(5)));
    clients.forEach((client) => client.send({ type: 'join', lang: 'en' }));
    await vi.waitFor(() => {
      const answered = clients.filter((c) => c.of('welcome').length + c.of('error').length > 0);
      expect(answered).toHaveLength(visitors);
    });
    const welcomed = clients.filter((c) => c.of('welcome').length === 1);
    const refused = clients.filter((c) => c.of('error').some((m) => m.code === 'hall_full'));
    expect(welcomed).toHaveLength(maxPlayers);
    expect(refused).toHaveLength(visitors - maxPlayers);
    await Promise.all(refused.map((c) => c.waitForClose()));
    expect(refused.every((c) => c.closeCode === CLOSE_CODE.hallFull)).toBe(true);
  });
});

describe('movement', () => {
  it('sends a move to everyone as part of a snapshot', async () => {
    const mover = await joinHall(6);
    const watcher = await joinHall(6);
    mover.client.send({ type: 'move', ...INSIDE, facing: -270 });
    const snapshot = await watcher.client.waitFor('snapshot');
    expect(snapshot.moves).toEqual([{ playerId: mover.welcome.playerId, ...INSIDE, facing: 90 }]);
    await mover.client.waitFor('snapshot');
  });

  it('batches many quick moves into fewer snapshots that end at the last position', async () => {
    const mover = await joinHall(7);
    const watcher = await joinHall(7);
    const moves = 20;
    for (let i = 1; i <= moves; i += 1) {
      mover.client.send({ type: 'move', x: i / 10, z: 1, facing: 0 });
    }
    await vi.waitFor(() => {
      const last = watcher.client.of('snapshot').at(-1)?.moves.at(-1);
      expect(last?.x).toBeCloseTo(moves / 10);
    });
    expect(watcher.client.of('snapshot').length).toBeLessThan(moves);
  });

  it('refuses a position outside the hall and does not move the person', async () => {
    const mover = await joinHall(8);
    const watcher = await joinHall(8);
    mover.client.send({ type: 'move', x: 500, z: 500, facing: 0 });
    expect((await mover.client.waitFor('error')).code).toBe('not_allowed');
    mover.client.send({ type: 'move', ...INSIDE, facing: 0 });
    const snapshot = await watcher.client.waitFor('snapshot');
    expect(snapshot.moves).toHaveLength(1);
    expect(snapshot.moves[0]).toMatchObject(INSIDE);
  });
});

describe('bad messages', () => {
  it('answers a message it cannot read, and closes the connection after too many', async () => {
    const { client } = await joinHall(9);
    const attempts = DEFAULT_CONFIG.net.maxInvalidMessages;
    for (let i = 0; i < attempts; i += 1) {
      client.sendRaw('{not json');
    }
    await client.waitFor('error', (m) => m.code === 'invalid_message');
    expect(await client.waitForClose()).toBe(CLOSE_CODE.invalidMessages);
  });

  it('refuses an oversize message', async () => {
    const { client } = await joinHall(9);
    client.sendRaw(
      JSON.stringify({ type: 'ping', pad: 'x'.repeat(DEFAULT_CONFIG.net.maxMessageBytes) }),
    );
    await client.waitFor('error', (m) => m.code === 'invalid_message');
  });

  it('limits how fast a connection may send', async () => {
    const { client } = await joinHall(9);
    for (let i = 0; i < DEFAULT_CONFIG.net.maxMessagesPerSecond * 3; i += 1) {
      client.send({ type: 'ping' });
    }
    await client.waitFor('error', (m) => m.code === 'rate_limited');
  });
});

describe('dropping and coming back', () => {
  it('restores the same person, place and avatar when they return with the token', async () => {
    const watcher = await joinHall(10);
    const first = await joinHall(10);
    first.client.send({ type: 'move', ...INSIDE, facing: 0 });
    await watcher.client.waitFor('snapshot');
    first.client.close(1001);
    await watcher.client.waitFor('player_left', (m) => m.playerId === first.welcome.playerId);

    const back = await joinHall(10, { resumeToken: first.welcome.resumeToken });
    expect(back.welcome.playerId).toBe(first.welcome.playerId);
    expect(back.welcome.avatarId).toBe(first.welcome.avatarId);
    expect(back.welcome.players.find((p) => p.id === back.welcome.playerId)).toMatchObject(INSIDE);
    expect(back.welcome.resumeToken).not.toBe(first.welcome.resumeToken);
    await watcher.client.waitFor('player_joined', (m) => m.player.id === first.welcome.playerId);
  });

  it('lets a token be used only once', async () => {
    const first = await joinHall(11);
    first.client.close(1001);
    await vi.waitFor(async () => {
      const list = await (
        await SELF.fetch('http://example.com/api/halls')
      ).json<{ hall: number; count: number }[]>();
      expect(list.find((entry) => entry.hall === 11)?.count).toBe(0);
    });
    const once = await joinHall(11, { resumeToken: first.welcome.resumeToken });
    once.client.close(1001);
    const twice = await joinHall(11, { resumeToken: first.welcome.resumeToken });
    expect(once.welcome.playerId).toBe(first.welcome.playerId);
    expect(twice.welcome.playerId).not.toBe(first.welcome.playerId);
  });

  it('treats an unknown token as a new person', async () => {
    const { welcome } = await joinHall(11, { resumeToken: 'a'.repeat(32) });
    expect(welcome.playerId).toHaveLength(36);
  });

  it('forgets a person once the grace period is over', async () => {
    const first = await joinHall(12);
    first.client.close(1001);
    await vi.waitFor(async () => {
      const list = await (
        await SELF.fetch('http://example.com/api/halls')
      ).json<{ hall: number; count: number }[]>();
      expect(list.find((entry) => entry.hall === 12)?.count).toBe(0);
    });
    const graceMs = DEFAULT_CONFIG.hall.reconnectGraceSec * MS_PER_SECOND;
    await sweepAt(12, Date.now() + graceMs + MS_PER_SECOND);
    const back = await joinHall(12, { resumeToken: first.welcome.resumeToken });
    expect(back.welcome.playerId).not.toBe(first.welcome.playerId);
  });

  it('takes over from an old connection that the hall has not noticed closing', async () => {
    const old = await joinHall(13);
    const fresh = await joinHall(13, { resumeToken: old.welcome.resumeToken });
    expect(fresh.welcome.playerId).toBe(old.welcome.playerId);
    expect(fresh.welcome.population).toBe(1);
    expect(await old.client.waitForClose()).toBe(CLOSE_CODE.replaced);
  });
});

describe('silent connections', () => {
  it('closes a person who has been silent too long', async () => {
    const { client } = await joinHall(14);
    await sweepAt(14, Date.now() + (idleKickSec + 1) * MS_PER_SECOND);
    await client.waitFor('error', (m) => m.code === 'idle_timeout');
    expect(await client.waitForClose()).toBe(CLOSE_CODE.idle);
  });

  it('does not close someone whose page keeps pinging', async () => {
    const { client } = await joinHall(14);
    client.send({ type: 'ping' });
    await sweepAt(14, Date.now() + MS_PER_SECOND);
    expect(client.closeCode).toBeNull();
  });

  it('closes a connection that never joins', async () => {
    const client = await connect(15);
    await sweepAt(15, Date.now() + (joinTimeoutSec + 1) * MS_PER_SECOND);
    expect(await client.waitForClose()).toBe(CLOSE_CODE.joinTimeout);
  });
});

describe('hibernation', () => {
  it('keeps everyone, with their places, after the hall is evicted and rebuilt', async () => {
    const first = await joinHall(16);
    const second = await joinHall(16);
    first.client.send({ type: 'move', ...INSIDE, facing: 0 });
    await second.client.waitFor('snapshot');

    await evictAllDurableObjects();

    second.client.send({ type: 'move', x: -1, z: 3, facing: 0 });
    await first.client.waitFor('snapshot', (m) =>
      m.moves.some((move) => move.playerId === second.welcome.playerId),
    );
    const third = await joinHall(16);
    expect(third.welcome.population).toBe(3);
    const seenFirst = third.welcome.players.find((p) => p.id === first.welcome.playerId);
    expect(seenFirst).toMatchObject(INSIDE);
  });
});

describe('hall directory', () => {
  it('lists the people each hall reports', async () => {
    await joinHall(17);
    await joinHall(17);
    await joinHall(18);
    await vi.waitFor(async () => {
      const list = await (
        await SELF.fetch('http://example.com/api/halls')
      ).json<{ hall: number; count: number }[]>();
      expect(list.filter((entry) => entry.hall >= 17)).toEqual([
        { hall: 17, count: 2 },
        { hall: 18, count: 1 },
      ]);
    });
  });
});
