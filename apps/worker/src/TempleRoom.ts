import { CLOSE_CODE, ERROR_CODE, directoryName } from '@temple/shared';
import { hasSpace } from '@temple/room-logic';
import { Server, type Connection, type WSMessage } from 'partyserver';

/** Per-connection state. It is stored in the WebSocket attachment, so it survives hibernation. */
interface PlayerState {
  admitted: true;
  joinedAtMs: number;
}

/**
 * Spike version of one hall (spec section 5). It proves capacity checking, hibernation recovery
 * and reporting to the hall directory. The real room rules arrive in milestone M2.
 */
export class TempleRoom extends Server<Env> {
  static override options = { hibernate: true };

  /** Changes every time the Durable Object is rebuilt, so tests can see a hibernation wake-up. */
  private readonly incarnation = crypto.randomUUID();

  override onConnect(connection: Connection): void {
    const maxPlayers = Number(this.env.HALL_MAX_PLAYERS);
    // No await between the check and setState: the check and the admission are one step.
    if (!hasSpace(this.admittedCount(), maxPlayers)) {
      connection.send(JSON.stringify({ type: 'error', code: ERROR_CODE.hallFull }));
      connection.close(CLOSE_CODE.hallFull, ERROR_CODE.hallFull);
      return;
    }
    connection.setState({ admitted: true, joinedAtMs: Date.now() } satisfies PlayerState);
    this.announcePopulation();
  }

  override onMessage(connection: Connection, message: WSMessage): void {
    if (typeof message !== 'string' || !isAdmitted(connection)) {
      return;
    }
    if (message === 'info') {
      connection.send(
        JSON.stringify({
          type: 'info',
          name: this.name,
          incarnation: this.incarnation,
          admitted: this.admittedCount(),
          state: connection.state,
        }),
      );
    } else {
      this.broadcast(JSON.stringify({ type: 'hello', from: connection.id }));
    }
  }

  override onClose(connection: Connection): void {
    if (isAdmitted(connection)) {
      this.announcePopulation();
    }
  }

  /** Counts people who were admitted, not connections that are merely open. */
  private admittedCount(): number {
    let count = 0;
    for (const connection of this.getConnections<PlayerState>()) {
      if (connection.state?.admitted === true) {
        count += 1;
      }
    }
    return count;
  }

  private announcePopulation(): void {
    const count = this.admittedCount();
    this.broadcast(JSON.stringify({ type: 'population', count }));
    this.ctx.waitUntil(this.reportToDirectory(count));
  }

  private async reportToDirectory(count: number): Promise<void> {
    const hall = Number(this.name.split(':').at(-1));
    const directory = this.env.HallDirectory.getByName(directoryName(this.env.TEMPLE_SLUG));
    await directory.report(hall, count, Date.now());
  }
}

function isAdmitted(connection: Connection): boolean {
  return (connection.state as PlayerState | null)?.admitted === true;
}
