import { FIRST_HALL_NUMBER, type HallsResponse, type NicknameIds } from '@temple/shared';
import type { HallLink, TokenStorage } from './connection';
import { INITIAL_HALL_STATE, type HallState } from './hallState';
import type { Store } from './store';

/** Everything the join flow needs from outside, so tests can replace it. */
export interface JoinFlowDeps {
  link: HallLink;
  store: Store<HallState>;
  tokens: TokenStorage;
  fetchHalls: () => Promise<HallsResponse | null>;
  /** The hall named in the page address, or null. */
  requestedHall: number | null;
  hallCount: number;
  /** How many halls to try before giving up (`hall.joinRetries`). */
  maxTries: number;
}

/**
 * Decides which hall to join and what to do when a hall is full (spec 5.5, FR-5, FR-7, FR-8).
 *
 * A link with a hall number goes to that hall; otherwise a tab that was in a hall goes back to it;
 * otherwise the server suggests one. A refused visitor follows the hall's hint to the next hall
 * and never tries the same hall twice. When the server cannot be asked, halls are tried in order.
 */
export class JoinFlow {
  private readonly tried = new Set<number>();
  private currentHall: number | null = null;
  private handledRefusal: HallState['refusal'] = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: JoinFlowDeps) {}

  /** Starts a fresh join, forgetting which halls were tried before. */
  async start(): Promise<void> {
    this.begin();
    const hall = await this.firstHall();
    if (hall !== null) {
      this.tryHall(hall);
    }
  }

  /**
   * Moves to a hall the visitor picked, keeping their nickname when it is free there.
   * The saved token belongs to the old hall, so it is dropped.
   */
  switchTo(hall: number, nickname: NicknameIds | null): void {
    this.begin();
    this.deps.tokens.clear();
    this.tryHall(hall, nickname ?? undefined);
  }

  /** Stops reacting to refusals. */
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private begin(): void {
    this.tried.clear();
    this.handledRefusal = null;
    // Forget the old hall's people and any old message, so nothing of it lingers on screen.
    this.deps.store.setState({ ...INITIAL_HALL_STATE, status: 'connecting' });
    this.unsubscribe ??= this.deps.store.subscribe(() => this.onChange());
  }

  private async firstHall(): Promise<number | null> {
    const { requestedHall, tokens, hallCount } = this.deps;
    if (requestedHall !== null) {
      return requestedHall;
    }
    const saved = tokens.read();
    if (saved !== null && saved.hall <= hallCount) {
      return saved.hall;
    }
    const listing = await this.deps.fetchHalls();
    if (listing === null) {
      return FIRST_HALL_NUMBER;
    }
    if (listing.suggestedHall === null) {
      this.setStatus('all_halls_full');
      return null;
    }
    return listing.suggestedHall;
  }

  private tryHall(hall: number, nickname?: NicknameIds): void {
    this.tried.add(hall);
    this.currentHall = hall;
    this.deps.link.connect(hall, { nickname });
  }

  private onChange(): void {
    const state = this.deps.store.getState();
    const refused = state.status === 'hall_full' || state.status === 'all_halls_full';
    if (!refused || state.refusal === null || state.refusal === this.handledRefusal) {
      return;
    }
    this.handledRefusal = state.refusal;
    if (state.status === 'all_halls_full' || this.tried.size >= this.deps.maxTries) {
      return;
    }
    const next = this.pickNext(state.refusal.nextHall);
    if (next !== null && this.currentHall !== null) {
      this.deps.store.setState({ ...state, notice: { fromHall: this.currentHall, toHall: next } });
      this.tryHall(next);
    }
  }

  /** The hint if it is a hall not yet tried, otherwise the first hall not yet tried. */
  private pickNext(hint: number | null | undefined): number | null {
    if (typeof hint === 'number' && hint <= this.deps.hallCount && !this.tried.has(hint)) {
      return hint;
    }
    for (let hall = FIRST_HALL_NUMBER; hall <= this.deps.hallCount; hall += 1) {
      if (!this.tried.has(hall)) {
        return hall;
      }
    }
    return null;
  }

  private setStatus(status: HallState['status']): void {
    this.deps.store.setState({ ...this.deps.store.getState(), status });
  }
}
