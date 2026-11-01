import type { NicknameIds } from '@temple/shared';

/** The word ids a nickname can be built from. */
export interface NicknameWords {
  adjectiveIds: readonly string[];
  nounIds: readonly string[];
}

/** Random picks tried before every pair is checked in order. */
const RANDOM_TRIES = 20;

/** A string that identifies a nickname, for comparing and for sets. */
export function nicknameKey(ids: NicknameIds): string {
  return `${ids.adjectiveId}:${ids.nounId}`;
}

function randomOf(list: readonly string[], random: () => number): string {
  return list[Math.floor(random() * list.length)] as string;
}

/**
 * Chooses a nickname for a joining visitor.
 *
 * The visitor's remembered nickname is used when both words exist and nobody else has it.
 * Otherwise a random free pair is chosen. Free text is never accepted: only word ids.
 *
 * @param words - The allowed words.
 * @param requested - The remembered nickname the browser sent, if any.
 * @param isTaken - Tells whether a nickname key is already in use in the hall.
 * @param random - A function returning numbers from 0 up to (not including) 1.
 */
export function pickNickname(
  words: NicknameWords,
  requested: NicknameIds | undefined,
  isTaken: (key: string) => boolean,
  random: () => number,
): NicknameIds {
  if (
    requested !== undefined &&
    words.adjectiveIds.includes(requested.adjectiveId) &&
    words.nounIds.includes(requested.nounId) &&
    !isTaken(nicknameKey(requested))
  ) {
    return requested;
  }
  for (let tries = 0; tries < RANDOM_TRIES; tries += 1) {
    const candidate = {
      adjectiveId: randomOf(words.adjectiveIds, random),
      nounId: randomOf(words.nounIds, random),
    };
    if (!isTaken(nicknameKey(candidate))) {
      return candidate;
    }
  }
  for (const adjectiveId of words.adjectiveIds) {
    for (const nounId of words.nounIds) {
      if (!isTaken(nicknameKey({ adjectiveId, nounId }))) {
        return { adjectiveId, nounId };
      }
    }
  }
  // Every pair is taken: allow a repeat rather than refuse a visitor.
  return {
    adjectiveId: randomOf(words.adjectiveIds, random),
    nounId: randomOf(words.nounIds, random),
  };
}
