/** Fields that appear on every log line of one hall or request. */
export interface TelemetryContext {
  temple_id: string;
  hall_id?: number;
  correlation_id?: string;
}

type Level = 'info' | 'warn' | 'error';

/**
 * Structured logs and counters (spec 8.5). Every line is one JSON object with the temple, hall and
 * correlation ids, so lines can be filtered and followed across the Worker and the hall.
 *
 * Never pass personal data: no nicknames, addresses or message text. Ids made at random are fine.
 * Counters are logged for now; the destination is open question O-9 and only this class changes.
 * This is the one place allowed to write to the console.
 */
export class Telemetry {
  constructor(private readonly context: TelemetryContext) {}

  /** Returns a copy that adds or replaces context fields, for example a correlation id. */
  with(extra: Partial<TelemetryContext>): Telemetry {
    return new Telemetry({ ...this.context, ...extra });
  }

  /**
   * Writes one log line.
   *
   * @param event - A short snake_case name such as `joined`.
   * @param fields - Extra values for this event.
   * @param level - How serious it is.
   */
  event(event: string, fields: Record<string, unknown> = {}, level: Level = 'info'): void {
    const line = JSON.stringify({
      level,
      event,
      at: new Date().toISOString(),
      ...this.context,
      ...fields,
    });
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  /**
   * Counts something that happened, for example `rejected_message` with a `reason`.
   *
   * @param metric - The counter name.
   * @param labels - Small fixed sets of values only (such as a reason), never ids or text.
   */
  count(metric: string, labels: Record<string, string> = {}): void {
    this.event('metric', { metric, value: 1, ...labels });
  }
}
