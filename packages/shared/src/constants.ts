/** Halls are numbered from 1 so the number matches the "Hall 1" label visitors see. */
export const FIRST_HALL_NUMBER = 1;

/** WebSocket close codes. The 4000-4999 range is reserved for applications. */
export const CLOSE_CODE = {
  hallFull: 4001,
  invalidMessages: 4002,
  idle: 4003,
  joinTimeout: 4004,
  replaced: 4005,
} as const;

/** The header the Worker uses to pass a request's correlation id on to the hall. */
export const CORRELATION_HEADER = 'x-correlation-id';

/** Server-to-client error codes (spec section 6.2). */
export const ERROR_CODE = {
  hallFull: 'hall_full',
  invalidMessage: 'invalid_message',
  rateLimited: 'rate_limited',
  notAllowed: 'not_allowed',
  idleTimeout: 'idle_timeout',
} as const;

/** How many look-alike avatar variants exist. Each visitor is given one at random. */
export const AVATAR_VARIANT_COUNT = 6;
