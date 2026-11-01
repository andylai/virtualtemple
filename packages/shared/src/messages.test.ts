import { describe, expect, it } from 'vitest';
import { flagshipManifest } from './flagship';
import {
  nicknameText,
  parseClientMessage,
  parseHallsResponse,
  parseServerMessage,
} from './messages';

const MAX_BYTES = 1024;
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value), MAX_BYTES);

describe('parseClientMessage', () => {
  it('accepts the three client messages', () => {
    expect(parse({ type: 'join', lang: 'en' }).ok).toBe(true);
    expect(parse({ type: 'move', x: 1.5, z: -2, facing: 90 }).ok).toBe(true);
    expect(parse({ type: 'ping' }).ok).toBe(true);
  });

  it('accepts a join with a nickname and a resume token', () => {
    const result = parse({
      type: 'join',
      lang: 'en',
      nickname: { adjectiveId: 'calm', nounId: 'lotus' },
      resumeToken: 'abcdefghijklmnop',
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['an unknown type', { type: 'dance' }],
    ['an extra field', { type: 'ping', admin: true }],
    ['a missing field', { type: 'move', x: 1 }],
    ['a number as text', { type: 'move', x: '1', z: 2, facing: 0 }],
    ['a huge coordinate', { type: 'move', x: 1e9, z: 0, facing: 0 }],
    ['a nickname written as free text', { type: 'join', lang: 'en', nickname: 'Bob' }],
    ['a language that does not exist', { type: 'join', lang: 'xx' }],
    ['a short resume token', { type: 'join', lang: 'en', resumeToken: 'abc' }],
  ])('refuses %s', (_label, value) => {
    expect(parse(value).ok).toBe(false);
  });

  it('refuses text that is not JSON, non-text payloads and oversize messages', () => {
    expect(parseClientMessage('{nope', MAX_BYTES).ok).toBe(false);
    expect(parseClientMessage(new ArrayBuffer(4), MAX_BYTES).ok).toBe(false);
    expect(parseClientMessage(JSON.stringify({ type: 'ping' }), 5).ok).toBe(false);
  });

  it('refuses non-finite numbers, which JSON turns into null', () => {
    expect(parseClientMessage('{"type":"move","x":null,"z":0,"facing":0}', MAX_BYTES).ok).toBe(
      false,
    );
  });
});

describe('parseServerMessage', () => {
  it('accepts a population message and refuses an unknown one', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'population', count: 3 })).ok).toBe(true);
    expect(parseServerMessage(JSON.stringify({ type: 'surprise' })).ok).toBe(false);
    expect(parseServerMessage(42).ok).toBe(false);
  });
});

describe('nicknameText', () => {
  const ids = { adjectiveId: 'calm', nounId: 'lotus' };

  it('joins the two words in the requested language, falling back to English', () => {
    expect(nicknameText(flagshipManifest.nicknames, ids, 'en')).toBe('Calm Lotus');
    expect(nicknameText(flagshipManifest.nicknames, ids, 'ms')).toBe('Calm Lotus');
  });

  it('shows the raw id for a word that is not in the list', () => {
    expect(
      nicknameText(flagshipManifest.nicknames, { adjectiveId: 'zzz', nounId: 'lotus' }, 'en'),
    ).toBe('zzz Lotus');
  });
});

describe('ritual messages', () => {
  it('accepts the two ritual requests and refuses unknown rituals or extra fields', () => {
    expect(parse({ type: 'ritual_start', ritualId: 'bow' }).ok).toBe(true);
    expect(parse({ type: 'ritual_stop' }).ok).toBe(true);
    expect(parse({ type: 'ritual_start', ritualId: 'dance' }).ok).toBe(false);
    expect(parse({ type: 'ritual_start', ritualId: 'bow', slotId: 'cushion-1' }).ok).toBe(false);
  });

  it('accepts the ritual and lamp messages the hall sends', () => {
    const id = 'player-aaaaaaaa';
    const messages = [
      { type: 'ritual_started', playerId: id, ritualId: 'bow', slotId: 'cushion-1' },
      { type: 'ritual_started', playerId: id, ritualId: 'greet' },
      { type: 'ritual_ended', playerId: id },
      { type: 'ritual_walk', slotId: 'cushion-1', x: 1, z: 2, facing: 0 },
      { type: 'lamp_lit', slotId: 'lamp-1', ownerId: id },
      { type: 'lamp_out', slotId: 'lamp-1' },
      { type: 'error', code: 'no_slot_free' },
      { type: 'error', code: 'lamp_limit' },
    ];
    for (const message of messages) {
      expect(parseServerMessage(JSON.stringify(message)).ok).toBe(true);
    }
  });
});

describe('refusal messages', () => {
  it('accepts a hall_full error with the next hall, or none', () => {
    const withNext = { type: 'error', code: 'hall_full', nextHall: 3 };
    const none = { type: 'error', code: 'all_halls_full', nextHall: null };
    expect(parseServerMessage(JSON.stringify(withNext)).ok).toBe(true);
    expect(parseServerMessage(JSON.stringify(none)).ok).toBe(true);
    expect(parseServerMessage(JSON.stringify({ type: 'error', code: 'hall_full' })).ok).toBe(true);
  });

  it('refuses a next hall that is not a positive whole number', () => {
    const bad = { type: 'error', code: 'hall_full', nextHall: 0 };
    expect(parseServerMessage(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('parseHallsResponse', () => {
  const ok = {
    halls: [{ hall: 1, count: 50, full: true }],
    suggestedHall: 2,
    hallCount: 20,
    maxPlayers: 50,
  };

  it('accepts a well-formed list, including no suggestion', () => {
    expect(parseHallsResponse(ok)).toEqual(ok);
    expect(parseHallsResponse({ ...ok, suggestedHall: null })?.suggestedHall).toBeNull();
  });

  it.each([[null], ['text'], [{}], [{ ...ok, halls: [{ hall: 0, count: 1, full: false }] }]])(
    'returns null for %j',
    (raw) => {
      expect(parseHallsResponse(raw)).toBeNull();
    },
  );
});
