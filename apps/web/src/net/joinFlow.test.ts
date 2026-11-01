import type { HallsResponse } from '@temple/shared';
import { describe, expect, it } from 'vitest';
import type { ConnectOptions, SavedToken, TokenStorage } from './connection';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import { JoinFlow } from './joinFlow';
import { Store } from './store';

const listing = (suggestedHall: number | null): HallsResponse => ({
  halls: [],
  suggestedHall,
  hallCount: 20,
  maxPlayers: 50,
});

function setup(
  options: {
    requestedHall?: number | null;
    listing?: HallsResponse | null;
    saved?: SavedToken | null;
    maxTries?: number;
  } = {},
) {
  const connects: { hall: number; options: ConnectOptions | undefined }[] = [];
  let saved = options.saved ?? null;
  const tokens: TokenStorage = {
    read: () => saved,
    write: (hall, token) => (saved = { hall, token }),
    clear: () => (saved = null),
  };
  const store = new Store<HallState>(INITIAL_HALL_STATE);
  let fetches = 0;
  const flow = new JoinFlow({
    link: {
      connect: (hall, connectOptions) => {
        connects.push({ hall, options: connectOptions });
        // The real connection reports that it is joining.
        store.setState({ ...store.getState(), status: 'connecting' });
      },
      close: () => undefined,
    },
    store,
    tokens,
    fetchHalls: async () => {
      fetches += 1;
      return options.listing === undefined ? listing(2) : options.listing;
    },
    requestedHall: options.requestedHall ?? null,
    hallCount: 20,
    maxTries: options.maxTries ?? 5,
  });
  /** What the connection does when a hall refuses: the error message, then the close. */
  const refuse = (
    nextHall: number | null | undefined,
    code: 'hall_full' | 'all_halls_full' = 'hall_full',
  ) => {
    const state = store.getState();
    store.setState({ ...state, refusal: { code, nextHall } });
    store.setState({ ...store.getState(), status: code });
  };
  return { flow, connects, store, tokens, refuse, fetches: () => fetches, saved: () => saved };
}

const halls = (connects: { hall: number }[]) => connects.map((c) => c.hall);

describe('JoinFlow: choosing the first hall', () => {
  it('goes straight to the hall named in the link, without asking the server', async () => {
    const t = setup({ requestedHall: 7 });
    await t.flow.start();
    expect(halls(t.connects)).toEqual([7]);
    expect(t.fetches()).toBe(0);
  });

  it('goes back to the hall this tab was in', async () => {
    const t = setup({ saved: { hall: 4, token: 'x'.repeat(32) } });
    await t.flow.start();
    expect(halls(t.connects)).toEqual([4]);
    expect(t.fetches()).toBe(0);
  });

  it('takes the hall the server suggests', async () => {
    const t = setup({ listing: listing(3) });
    await t.flow.start();
    expect(halls(t.connects)).toEqual([3]);
    expect(t.store.getState().status).toBe('connecting');
  });

  it('tries hall 1 when the server cannot be asked', async () => {
    const t = setup({ listing: null });
    await t.flow.start();
    expect(halls(t.connects)).toEqual([1]);
  });

  it('shows that every hall is full, without connecting, when the server has no hall to suggest', async () => {
    const t = setup({ listing: listing(null) });
    await t.flow.start();
    expect(t.connects).toEqual([]);
    expect(t.store.getState().status).toBe('all_halls_full');
  });
});

describe('JoinFlow: when a hall is full', () => {
  it("follows the hall's hint and says where the visitor was placed", async () => {
    const t = setup({ listing: listing(1) });
    await t.flow.start();
    t.refuse(4);
    expect(halls(t.connects)).toEqual([1, 4]);
    expect(t.store.getState().notice).toEqual({ fromHall: 1, toHall: 4 });
    expect(t.store.getState().status).toBe('connecting');
  });

  it('never tries the same hall twice, even if the hint repeats it', async () => {
    const t = setup({ listing: listing(1) });
    await t.flow.start();
    t.refuse(2);
    t.refuse(1);
    t.refuse(2);
    expect(halls(t.connects)).toEqual([1, 2, 3, 4]);
  });

  it('tries the halls in order when the hall gave no hint', async () => {
    const t = setup({ requestedHall: 2 });
    await t.flow.start();
    t.refuse(undefined);
    t.refuse(undefined);
    expect(halls(t.connects)).toEqual([2, 1, 3]);
  });

  it('gives up after the allowed number of tries and leaves the full-hall message', async () => {
    const t = setup({ requestedHall: 1, maxTries: 3 });
    await t.flow.start();
    for (let i = 0; i < 6; i += 1) {
      t.refuse(undefined);
    }
    expect(t.connects).toHaveLength(3);
    expect(t.store.getState().status).toBe('hall_full');
  });

  it('stops when the hall says every hall is full', async () => {
    const t = setup({ listing: listing(1) });
    await t.flow.start();
    t.refuse(null, 'all_halls_full');
    expect(t.connects).toHaveLength(1);
    expect(t.store.getState().status).toBe('all_halls_full');
  });

  it('starts over with a clean slate when asked to try again', async () => {
    const t = setup({ listing: listing(1) });
    await t.flow.start();
    t.refuse(2);
    await t.flow.start();
    expect(halls(t.connects)).toEqual([1, 2, 1]);
    expect(t.store.getState().notice).toBeNull();
  });
});

describe('JoinFlow: switching halls', () => {
  it('forgets the saved token and keeps the nickname', () => {
    const t = setup({ saved: { hall: 1, token: 'x'.repeat(32) } });
    const nickname = { adjectiveId: 'calm', nounId: 'lotus' };
    t.flow.switchTo(5, nickname);
    expect(t.saved()).toBeNull();
    expect(t.connects).toEqual([{ hall: 5, options: { nickname } }]);
  });

  it('follows the hint if the chosen hall turns out to be full', () => {
    const t = setup();
    t.flow.switchTo(5, null);
    t.refuse(6);
    expect(halls(t.connects)).toEqual([5, 6]);
  });
});
