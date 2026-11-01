import { SELF } from 'cloudflare:test';
import { parseServerMessage, type ServerMessage } from '@temple/shared';
import { vi } from 'vitest';

export const ORIGIN = 'http://localhost:5173';
const WAIT_MS = 4000;

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

/** A scripted browser: it keeps every message the hall sent, already checked against the schema. */
export class TestClient {
  readonly received: ServerMessage[] = [];
  private code: number | null = null;

  constructor(readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const parsed = parseServerMessage(event.data);
      if (!parsed.ok) {
        throw new Error(`The hall sent a message that breaks the schema: ${String(event.data)}`);
      }
      this.received.push(parsed.message);
    });
    socket.addEventListener('close', (event) => {
      this.code = event.code;
    });
  }

  get closeCode(): number | null {
    return this.code;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  close(code = 1000): void {
    this.socket.close(code, 'test');
  }

  /** All messages of one type received so far. */
  of<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  /** Waits until a message of this type (and matching the test, if given) has arrived. */
  async waitFor<T extends ServerMessage['type']>(
    type: T,
    matches: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    return vi.waitFor(
      () => {
        const found = this.of(type).find(matches);
        if (found === undefined) {
          throw new Error(`No "${type}" message yet`);
        }
        return found;
      },
      { timeout: WAIT_MS },
    );
  }

  async waitForClose(): Promise<number> {
    return vi.waitFor(
      () => {
        if (this.code === null) {
          throw new Error('Not closed yet');
        }
        return this.code;
      },
      { timeout: WAIT_MS },
    );
  }
}

/** Opens a WebSocket to a hall through the Worker, as a browser would. */
export async function connect(hall: number, origin: string = ORIGIN): Promise<TestClient> {
  const response = await SELF.fetch(`http://example.com/ws?hall=${hall}`, {
    headers: { Upgrade: 'websocket', Origin: origin },
  });
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error(`No WebSocket for hall ${hall}: HTTP ${response.status}`);
  }
  socket.accept();
  return new TestClient(socket);
}

/** Connects, sends `join`, and waits for the welcome. */
export async function joinHall(
  hall: number,
  extra: Record<string, unknown> = {},
): Promise<{ client: TestClient; welcome: Welcome }> {
  const client = await connect(hall);
  client.send({ type: 'join', lang: 'en', ...extra });
  const welcome = await client.waitFor('welcome');
  return { client, welcome };
}
