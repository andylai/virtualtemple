import { describe, expect, it } from 'vitest';
import { flagshipManifest } from './flagship';
import { nicknameText, parseClientMessage, parseServerMessage } from './messages';

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
