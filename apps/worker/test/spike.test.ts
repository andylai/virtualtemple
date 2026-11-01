import { SELF, evictAllDurableObjects } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'http://localhost:5173';
const HALL_CAPACITY = 50;
const SIMULTANEOUS_VISITORS = 60;
const HALL_FULL_CLOSE_CODE = 4001;

interface TestClient {
  socket: WebSocket;
  messages: Record<string, unknown>[];
  closeCode: () => number | null;
}

async function connect(hall: number, origin: string = ORIGIN): Promise<TestClient> {
  const response = await SELF.fetch(`http://example.com/ws?hall=${hall}`, {
    headers: { Upgrade: 'websocket', Origin: origin },
  });
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error(`No WebSocket for hall ${hall}: HTTP ${response.status}`);
  }
  socket.accept();
  const messages: Record<string, unknown>[] = [];
  let closeCode: number | null = null;
  socket.addEventListener('message', (event) => {
    messages.push(JSON.parse(String(event.data)) as Record<string, unknown>);
  });
  socket.addEventListener('close', (event) => {
    closeCode = event.code;
  });
  return { socket, messages, closeCode: () => closeCode };
}

async function askInfo(client: TestClient): Promise<Record<string, unknown>> {
  const before = client.messages.filter((message) => message['type'] === 'info').length;
  client.socket.send('info');
  return vi.waitFor(() => {
    const replies = client.messages.filter((message) => message['type'] === 'info');
    if (replies.length <= before) {
      throw new Error('no info reply yet');
    }
    return replies[replies.length - 1] as Record<string, unknown>;
  });
}

describe('S1/S3: Worker forwards a WebSocket to the hall', () => {
  it('rejects a missing or foreign Origin and a bad hall number', async () => {
    const upgrade = { Upgrade: 'websocket' };
    expect((await SELF.fetch('http://example.com/ws?hall=1', { headers: upgrade })).status).toBe(
      403,
    );
    const foreign = { ...upgrade, Origin: 'https://evil.example' };
    expect((await SELF.fetch('http://example.com/ws?hall=1', { headers: foreign })).status).toBe(
      403,
    );
    const ok = { ...upgrade, Origin: ORIGIN };
    expect((await SELF.fetch('http://example.com/ws?hall=0', { headers: ok })).status).toBe(400);
    expect((await SELF.fetch('http://example.com/ws?hall=21', { headers: ok })).status).toBe(400);
    expect((await SELF.fetch('http://example.com/ws?hall=x', { headers: ok })).status).toBe(400);
  });

  it('lets two visitors in the same hall see each other', async () => {
    const first = await connect(1);
    const second = await connect(1);
    await vi.waitFor(() => {
      expect(second.messages).toContainEqual({ type: 'population', count: 2 });
    });
    first.socket.send('hello');
    await vi.waitFor(() => {
      expect(second.messages.some((message) => message['type'] === 'hello')).toBe(true);
    });
  });
});

describe('S7: capacity check under simultaneous joins', () => {
  it('admits exactly the capacity when more visitors arrive at once', async () => {
    const clients = await Promise.all(
      Array.from({ length: SIMULTANEOUS_VISITORS }, () => connect(2)),
    );
    await vi.waitFor(() => {
      const refused = clients.filter((client) => client.closeCode() === HALL_FULL_CLOSE_CODE);
      expect(refused).toHaveLength(SIMULTANEOUS_VISITORS - HALL_CAPACITY);
    });
    const open = clients.filter((client) => client.closeCode() === null);
    const infos = await Promise.all(open.map((client) => askInfo(client)));
    expect(open).toHaveLength(HALL_CAPACITY);
    expect(infos.every((info) => info['admitted'] === HALL_CAPACITY)).toBe(true);
  });
});

describe('S2: hibernation recovery', () => {
  it('keeps admitted players after the Durable Object is evicted and rebuilt', async () => {
    const first = await connect(3);
    const second = await connect(3);
    const before = await askInfo(first);

    await evictAllDurableObjects();

    const after = await askInfo(first);
    expect(after['incarnation']).not.toBe(before['incarnation']);
    expect(after['state']).toEqual(before['state']);
    expect(after['admitted']).toBe(2);
    expect(second.closeCode()).toBeNull();
  });
});

describe('S4: hall directory', () => {
  it('lists the counts that halls report', async () => {
    const probe = await connect(4);
    expect((await askInfo(probe))['name']).toBe('temple:flagship:4');
    await connect(4);
    await connect(5);
    await vi.waitFor(async () => {
      const response = await SELF.fetch('http://example.com/api/halls');
      expect(await response.json()).toEqual([
        { hall: 4, count: 2 },
        { hall: 5, count: 1 },
      ]);
    });
  });
});
