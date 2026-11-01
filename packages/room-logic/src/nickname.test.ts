import { describe, expect, it } from 'vitest';
import { nicknameKey, pickNickname } from './nickname';

const words = { adjectiveIds: ['calm', 'kind'], nounIds: ['lotus', 'tree'] };
const never = () => false;
const random = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length] as number;
};

describe('pickNickname', () => {
  it('keeps a remembered nickname when its words exist and it is free', () => {
    const wanted = { adjectiveId: 'kind', nounId: 'tree' };
    expect(pickNickname(words, wanted, never, random([0]))).toEqual(wanted);
  });

  it.each([
    ['an unknown adjective', { adjectiveId: 'angry', nounId: 'tree' }],
    ['an unknown noun', { adjectiveId: 'kind', nounId: 'stone' }],
  ])('ignores a remembered nickname with %s', (_label, wanted) => {
    const picked = pickNickname(words, wanted, never, random([0, 0]));
    expect(picked).toEqual({ adjectiveId: 'calm', nounId: 'lotus' });
  });

  it('picks another pair when the remembered one is taken', () => {
    const wanted = { adjectiveId: 'kind', nounId: 'tree' };
    const taken = new Set([nicknameKey(wanted)]);
    const picked = pickNickname(words, wanted, (key) => taken.has(key), random([0.99, 0.99, 0, 0]));
    expect(picked).toEqual({ adjectiveId: 'calm', nounId: 'lotus' });
  });

  it('finds the last free pair even when random picks keep hitting taken ones', () => {
    const all = words.adjectiveIds.flatMap((adjectiveId) =>
      words.nounIds.map((nounId) => nicknameKey({ adjectiveId, nounId })),
    );
    const free = all[3] as string;
    const picked = pickNickname(words, undefined, (key) => key !== free, random([0]));
    expect(nicknameKey(picked)).toBe(free);
  });

  it('allows a repeat only when every pair is taken', () => {
    const picked = pickNickname(words, undefined, () => true, random([0.5]));
    expect(words.adjectiveIds).toContain(picked.adjectiveId);
    expect(words.nounIds).toContain(picked.nounId);
  });
});
