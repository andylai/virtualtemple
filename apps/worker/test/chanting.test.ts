import { env, runInDurableObject } from 'cloudflare:test';
import { ChantingSchedule } from '@temple/room-logic';
import { DEFAULT_CONFIG, hallRoomName } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it } from 'vitest';
import { joinHall } from './helpers';

const MS_PER_SECOND = 1000;
const MINUTE = 60 * MS_PER_SECOND;
const HOUR = 60 * MINUTE;

/** The schedule the hall uses, built the same way from the same manifest. */
const schedule = new ChantingSchedule({
  timeZone: flagshipManifest.timezone,
  regularTimes: flagshipManifest.chantingSchedule,
  specialDays: flagshipManifest.specialDays,
  durationMs: flagshipManifest.audio.chantingDurationSec * MS_PER_SECOND,
  leadMs: DEFAULT_CONFIG.audio.preloadLeadSec * MS_PER_SECOND,
});

/** Runs the hall's chanting check as if it were `atMs`. */
async function syncAt(hall: number, atMs: number): Promise<void> {
  const stub = env.TempleRoom.getByName(hallRoomName('flagship', hall));
  await runInDurableObject(stub, (room) => room.syncChanting(atMs));
}

/** The first session that starts more than an hour from now. */
function laterSession() {
  const now = Date.now();
  const session = schedule.sessionsAround(now).find((s) => s.startAtMs > now + HOUR);
  if (session === undefined) {
    throw new Error('No session found');
  }
  return session;
}

describe('the welcome message', () => {
  it("carries the session that is on or about to start, and today's special day, as the schedule says", async () => {
    const { welcome } = await joinHall(1);
    const now = welcome.serverTimeMs;
    const expected = schedule.current(now);
    if (expected === null) {
      expect(welcome.chanting).toBeUndefined();
    } else {
      expect(welcome.chanting).toEqual({ ...expected, audioId: 'chanting' });
    }
    expect(welcome.specialDay ?? null).toEqual(schedule.specialDay(now));
  });
});

describe('announcing a session', () => {
  it('tells everyone once, when the session is within the lead time', async () => {
    const first = await joinHall(2);
    const second = await joinHall(2);
    const session = laterSession();

    await syncAt(2, session.startAtMs - 10 * MINUTE);
    expect(first.client.of('chanting_start')).toEqual([]);

    await syncAt(2, session.startAtMs - MINUTE);
    const expected = { type: 'chanting_start', ...session, audioId: 'chanting' };
    expect(await first.client.waitFor('chanting_start')).toEqual(expected);
    expect(await second.client.waitFor('chanting_start')).toEqual(expected);

    await syncAt(2, session.startAtMs + MINUTE);
    await syncAt(2, session.startAtMs - 30 * MS_PER_SECOND);
    expect(first.client.of('chanting_start')).toHaveLength(1);
  });

  it('tells everyone when the session is over', async () => {
    const visitor = await joinHall(3);
    const session = laterSession();
    await syncAt(3, session.startAtMs);
    await visitor.client.waitFor('chanting_start');
    await syncAt(3, session.startAtMs + session.durationMs - 1);
    expect(visitor.client.of('chanting_end')).toEqual([]);
    await syncAt(3, session.startAtMs + session.durationMs);
    await visitor.client.waitFor('chanting_end');
  });

  it('says nothing between sessions', async () => {
    const visitor = await joinHall(4);
    const session = laterSession();
    await syncAt(4, session.startAtMs + session.durationMs + MINUTE);
    expect(visitor.client.of('chanting_start')).toEqual([]);
    expect(visitor.client.of('chanting_end')).toEqual([]);
  });
});
