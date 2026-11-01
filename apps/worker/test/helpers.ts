import { SELF, env, runInDurableObject } from 'cloudflare:test';
import {
  DEFAULT_CONFIG,
  directoryName,
  hallRoomName,
  parseHallsResponse,
  parseServerMessage,
  type ServerMessage,
} from '@temple/shared';
import { expect, vi } from 'vitest';

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

const REPORT_WAIT_MS = 6000;

/** The directory, as the hall and the Worker see it. */
export function directoryStub() {
  return env.HallDirectory.getByName(directoryName('flagship'));
}

/** What the directory currently knows: hall number to people. */
export async function reportedCounts(): Promise<Map<number, number>> {
  const entries = await directoryStub().counts(Date.now());
  return new Map(entries.map((entry) => [entry.hall, entry.count]));
}

/** Waits until the directory shows the given number of people for a hall. */
export async function waitForReportedCount(hall: number, count: number): Promise<void> {
  await vi.waitFor(
    async () => {
      expect((await reportedCounts()).get(hall) ?? 0).toBe(count);
    },
    { timeout: REPORT_WAIT_MS },
  );
}

/** Asks the Worker for the halls list, as the browser does. */
export async function fetchHalls() {
  const response = await SELF.fetch('http://example.com/api/halls', {
    headers: { Origin: ORIGIN },
  });
  return { response, body: parseHallsResponse(await response.json()) };
}

/**
 * Joins the way the browser does (spec 5.5): ask which hall has space, join it, and when refused
 * follow the hall's hint, trying at most `hall.joinRetries` halls.
 *
 * @returns The hall joined, how many tries it took, and the client; or null hall when it gave up.
 */
export async function joinWithAssignment(): Promise<{
  hall: number | null;
  tries: number;
  client: TestClient | null;
}> {
  const listing = (await fetchHalls()).body;
  let hall = listing?.suggestedHall ?? null;
  const tried = new Set<number>();
  for (let tries = 1; tries <= DEFAULT_CONFIG.hall.joinRetries && hall !== null; tries += 1) {
    tried.add(hall);
    const client = await connect(hall);
    client.send({ type: 'join', lang: 'en' });
    const answer = await vi.waitFor(
      () => {
        const done = client.of('welcome')[0] ?? client.of('error')[0];
        if (done === undefined) {
          throw new Error('No answer yet');
        }
        return done;
      },
      { timeout: WAIT_MS },
    );
    if (answer.type === 'welcome') {
      return { hall, tries, client };
    }
    // Follow the hint unless that hall was already tried; then take the first hall not yet tried.
    const hint = answer.nextHall;
    hall =
      hint !== null && hint !== undefined && !tried.has(hint)
        ? hint
        : answer.code === 'all_halls_full'
          ? null
          : firstUntried(tried);
  }
  return { hall: null, tries: DEFAULT_CONFIG.hall.joinRetries, client: null };
}

function firstUntried(tried: ReadonlySet<number>): number | null {
  for (let hall = 1; hall <= DEFAULT_CONFIG.hall.count; hall += 1) {
    if (!tried.has(hall)) {
      return hall;
    }
  }
  return null;
}

/** Runs the hall's due work as if it were `atMs`: ends rituals, puts lamps out, closes idle people. */
export async function sweepAt(hall: number, atMs: number): Promise<void> {
  const stub = env.TempleRoom.getByName(hallRoomName('flagship', hall));
  await runInDurableObject(stub, (room) => room.sweepExpired(atMs));
}
