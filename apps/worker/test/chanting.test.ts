import { env, runInDurableObject } from 'cloudflare:test';
import { ChantingSchedule } from '@temple/room-logic';
import { DEFAULT_CONFIG, hallRoomName, type ServerMessage } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { describe, expect, it } from 'vitest';
import { HallChanting } from '../src/hallChanting';
import { joinHall } from './helpers';

const MS_PER_SECOND = 1000;
const MINUTE = 60 * MS_PER_SECOND;
const SESSION_START = Date.parse('2026-11-08T05:00:00+08:00');
const DURATION_MS = flagshipManifest.audio.chantingDurationSec * MS_PER_SECOND;

describe('the flagship hall', () => {
  it('does not announce communal chanting in the welcome or at the former session times', async () => {
    const visitor = await joinHall(1);
    expect(visitor.welcome.chanting).toBeUndefined();
    const stub = env.TempleRoom.getByName(hallRoomName(flagshipManifest.slug, 1));
    await runInDurableObject(stub, (room) => {
      room.syncChanting(SESSION_START);
      room.syncChanting(Date.parse('2026-11-08T22:33:00+08:00'));
    });
    expect(visitor.client.of('chanting_start')).toEqual([]);
    expect(visitor.client.of('chanting_end')).toEqual([]);
  });
});

describe('a hall with scheduled chanting enabled', () => {
  it('announces a session once in the preload window and ends it at the scheduled time', () => {
    const messages: ServerMessage[] = [];
    const chanting = new HallChanting({
      schedule: new ChantingSchedule({
        timeZone: flagshipManifest.timezone,
        regularTimes: ['05:00'],
        specialDays: [],
        durationMs: DURATION_MS,
        leadMs: DEFAULT_CONFIG.audio.preloadLeadSec * MS_PER_SECOND,
      }),
      audioId: 'chanting',
      broadcast: (message) => messages.push(message),
    });

    chanting.update(SESSION_START - 10 * MINUTE);
    expect(messages).toEqual([]);

    const session = { startAtMs: SESSION_START, durationMs: DURATION_MS, audioId: 'chanting' };
    chanting.update(SESSION_START - MINUTE);
    expect(chanting.current(SESSION_START)).toEqual(session);
    chanting.update(SESSION_START + DURATION_MS - 1);
    expect(messages).toEqual([{ type: 'chanting_start', ...session }]);

    chanting.update(SESSION_START + DURATION_MS);
    expect(messages).toEqual([{ type: 'chanting_start', ...session }, { type: 'chanting_end' }]);
  });
});
