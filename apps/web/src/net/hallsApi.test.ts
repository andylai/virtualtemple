import { describe, expect, it } from 'vitest';
import { fetchHalls } from './hallsApi';

const good = {
  halls: [{ hall: 1, count: 3, full: false }],
  suggestedHall: 1,
  hallCount: 20,
  maxPlayers: 50,
};
const answering = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('fetchHalls', () => {
  it('returns the list from a good answer', async () => {
    expect(await fetchHalls(answering(good))).toEqual(good);
  });

  it('returns null for an error status, a bad shape, bad JSON or a network failure', async () => {
    expect(await fetchHalls(answering(good, 503))).toBeNull();
    expect(await fetchHalls(answering({ nope: true }))).toBeNull();
    expect(await fetchHalls((async () => new Response('<html>')) as typeof fetch)).toBeNull();
    expect(
      await fetchHalls((async () => Promise.reject(new Error('offline'))) as typeof fetch),
    ).toBeNull();
  });
});
