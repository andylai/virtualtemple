import { z } from 'zod';
import { AVATAR_VARIANT_COUNT } from './constants';
import { LANGUAGE_CODES } from './manifest';

/** Largest coordinate a client may send, so absurd numbers are refused before any geometry runs. */
export const MAX_COORDINATE = 1000;

const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const coordinate = z.number().finite().min(-MAX_COORDINATE).max(MAX_COORDINATE);
const facing = z.number().finite().min(-360).max(360);
const nickname = z.object({ adjectiveId: itemId, nounId: itemId });
const playerId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const resumeToken = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Two word ids that together make a visitor's nickname. The words come from the manifest. */
export type NicknameIds = z.infer<typeof nickname>;

/** What other visitors can see of a person in the hall. */
export const playerViewSchema = z.object({
  id: playerId,
  nickname,
  avatarId: z
    .number()
    .int()
    .min(0)
    .max(AVATAR_VARIANT_COUNT - 1),
  x: coordinate,
  z: coordinate,
  facing,
});
export type PlayerView = z.infer<typeof playerViewSchema>;

/** Messages a browser may send. Strict: unknown fields are refused (spec section 6.3). */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('join'),
    nickname: nickname.optional(),
    lang: z.enum(LANGUAGE_CODES),
    resumeToken: resumeToken.optional(),
  }),
  z.strictObject({ type: z.literal('move'), x: coordinate, z: coordinate, facing }),
  z.strictObject({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages the server sends. */
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    playerId,
    resumeToken,
    hall: z.number().int().positive(),
    nickname,
    avatarId: playerViewSchema.shape.avatarId,
    players: z.array(playerViewSchema),
    population: z.number().int().nonnegative(),
    serverTimeMs: z.number().int().nonnegative(),
    positionSendHz: z.number().positive(),
    pingSec: z.number().positive(),
  }),
  z.object({ type: z.literal('player_joined'), player: playerViewSchema }),
  z.object({ type: z.literal('player_left'), playerId }),
  z.object({
    type: z.literal('snapshot'),
    tick: z.number().int().nonnegative(),
    moves: z.array(z.object({ playerId, x: coordinate, z: coordinate, facing })),
  }),
  z.object({ type: z.literal('population'), count: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['hall_full', 'invalid_message', 'rate_limited', 'not_allowed', 'idle_timeout']),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Result of reading one incoming message. */
export type ParseResult<T> = { ok: true; message: T } | { ok: false };

/** The text of a WebSocket message, or null when it is not text. */
function textOf(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

/**
 * Reads a message from a browser. Anything that is not a short, valid JSON message is refused.
 *
 * @param raw - The WebSocket payload.
 * @param maxBytes - Largest accepted size (`net.maxMessageBytes`).
 */
export function parseClientMessage(raw: unknown, maxBytes: number): ParseResult<ClientMessage> {
  const text = textOf(raw);
  if (text === null || new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false };
  }
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(text));
    return result.success ? { ok: true, message: result.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Reads a message from the server. The browser does not trust the network either.
 *
 * @param raw - The WebSocket payload.
 */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  const text = textOf(raw);
  if (text === null) {
    return { ok: false };
  }
  try {
    const result = serverMessageSchema.safeParse(JSON.parse(text));
    return result.success ? { ok: true, message: result.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Finds the display text of a nickname in one language, falling back to English.
 *
 * @param words - The manifest's `nicknames` lists.
 * @param ids - The two word ids.
 * @param language - The viewer's language.
 * @returns For example "Calm Lotus", or the raw ids when a word is unknown.
 */
export function nicknameText(
  words: { adjectives: readonly WordEntry[]; nouns: readonly WordEntry[] },
  ids: NicknameIds,
  language: (typeof LANGUAGE_CODES)[number],
): string {
  const textOfWord = (list: readonly WordEntry[], id: string): string => {
    const word = list.find((entry) => entry.id === id);
    return word?.text[language] ?? word?.text.en ?? id;
  };
  return `${textOfWord(words.adjectives, ids.adjectiveId)} ${textOfWord(words.nouns, ids.nounId)}`;
}

interface WordEntry {
  id: string;
  text: Partial<Record<(typeof LANGUAGE_CODES)[number], string>>;
}
