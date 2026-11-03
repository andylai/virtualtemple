import { Tally, summarize, type Summary } from './stats';
import type { Visitor } from './visitor';

/** What a scenario measured. Everything is a number or a count, so results can be compared across runs. */
export interface Result {
  scenario: string;
  target: string;
  startedAt: string;
  /** Seconds the scenario ran, from the first connection to the last close. */
  seconds: number;
  /** How many visitors tried to join and how it went. */
  joins: { attempted: number; welcomed: number; refused: number; failed: number };
  /** Why joins failed or were refused, by reason. */
  failures: Record<string, number>;
  /** Time from opening the connection to the welcome, over visitors that got one. */
  joinMs: Summary;
  /** Snapshots per second each visitor received while in a hall. */
  snapshotsPerSecond: Summary;
  /** Time from a position being sent to it arriving in another visitor's snapshot. */
  moveLatencyMs: Summary;
  /** Totals over all visitors: `In` is what they received from the halls, `Out` what they sent. */
  traffic: { messagesIn: number; messagesOut: number; bytesIn: number; bytesOut: number };
  /** Error codes the halls sent, and how connections ended. */
  hallErrors: Record<string, number>;
  closeCodes: Record<string, number>;
  /** People per hall at the end of the join phase. */
  perHall: Record<string, number>;
  /** Extra things a scenario wants to record, such as how many tries a stampede needed. */
  notes: Record<string, unknown>;
}

/** The numbers every scenario reports, worked out from its visitors. */
export type Measured = Pick<
  Result,
  'joinMs' | 'snapshotsPerSecond' | 'moveLatencyMs' | 'traffic' | 'hallErrors' | 'closeCodes'
>;

/**
 * Pulls the measurements out of a set of visitors.
 *
 * @param held - How long the visitors stayed in, and the move latencies the probes recorded.
 */
export function collect(
  visitors: readonly Visitor[],
  held: { seconds: number; moveLatencies: readonly number[] },
): Measured {
  const errors = new Tally();
  const closes = new Tally();
  const traffic = { messagesIn: 0, messagesOut: 0, bytesIn: 0, bytesOut: 0 };
  const joinTimes: number[] = [];
  const rates: number[] = [];
  for (const { stats } of visitors) {
    errors.merge(stats.errors);
    if (stats.closeCode !== null) {
      closes.add(String(stats.closeCode));
    }
    traffic.messagesIn += stats.messagesIn;
    traffic.messagesOut += stats.messagesOut;
    traffic.bytesIn += stats.bytesIn;
    traffic.bytesOut += stats.bytesOut;
    if (stats.joinMs !== null) {
      joinTimes.push(stats.joinMs);
      rates.push(held.seconds > 0 ? stats.snapshots / held.seconds : 0);
    }
  }
  return {
    joinMs: summarize(joinTimes),
    snapshotsPerSecond: summarize(rates),
    moveLatencyMs: summarize(held.moveLatencies),
    traffic,
    hallErrors: errors.toObject(),
    closeCodes: closes.toObject(),
  };
}

function row(label: string, summary: Summary, unit: string): string {
  const f = (n: number) => n.toFixed(1);
  return `  ${label.padEnd(22)} n=${summary.count}  p50 ${f(summary.p50)}${unit}  p95 ${f(summary.p95)}${unit}  max ${f(summary.max)}${unit}`;
}

/** A readable summary for the terminal. */
export function formatResult(result: Result): string {
  const { joins, traffic, seconds } = result;
  const perSecond = (n: number) => (seconds > 0 ? (n / seconds).toFixed(0) : '0');
  const kb = (bytes: number) => (bytes / 1024).toFixed(0);
  return [
    `Scenario ${result.scenario} against ${result.target} (${seconds.toFixed(0)} s)`,
    `  joins: ${joins.welcomed}/${joins.attempted} welcomed, ${joins.refused} refused, ${joins.failed} failed`,
    row('join time', result.joinMs, ' ms'),
    row('snapshots per second', result.snapshotsPerSecond, ''),
    row('move to snapshot', result.moveLatencyMs, ' ms'),
    `  received by visitors: ${traffic.messagesIn} msgs (${perSecond(traffic.messagesIn)}/s, ${kb(traffic.bytesIn)} kB)`,
    `  sent by visitors:     ${traffic.messagesOut} msgs (${perSecond(traffic.messagesOut)}/s, ${kb(traffic.bytesOut)} kB)`,
    `  failures: ${JSON.stringify(result.failures)}`,
    `  hall errors: ${JSON.stringify(result.hallErrors)}`,
    `  close codes: ${JSON.stringify(result.closeCodes)}`,
    `  people per hall: ${JSON.stringify(result.perHall)}`,
    `  notes: ${JSON.stringify(result.notes)}`,
  ].join('\n');
}
