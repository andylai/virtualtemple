/**
 * A rate limiter: it allows a steady number of actions per second plus a short burst.
 * Time is passed in so the behaviour is repeatable in tests.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;

  /**
   * @param ratePerSec - How many actions are allowed per second on average.
   * @param burst - How many actions may happen at once after a quiet spell.
   * @param nowMs - The current time in milliseconds.
   */
  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
    nowMs: number,
  ) {
    this.tokens = burst;
    this.lastRefillMs = nowMs;
  }

  /**
   * Tries to spend one action.
   *
   * @param nowMs - The current time in milliseconds.
   * @returns True when allowed, false when the limit is exceeded.
   */
  tryTake(nowMs: number): boolean {
    const elapsedSec = Math.max(0, nowMs - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.ratePerSec);
    this.lastRefillMs = nowMs;
    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}
