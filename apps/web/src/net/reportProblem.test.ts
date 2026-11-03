import { MAX_PROBLEM_DETAIL_CHARS, parseProblemReport } from '@temple/shared';
import { describe, expect, it, vi } from 'vitest';
import { createProblemReporter } from './reportProblem';

describe('createProblemReporter', () => {
  it('sends a kind alone, or with a short note, as valid reports', () => {
    const send = vi.fn();
    const report = createProblemReporter(send);
    report('no_webgl');
    report('crash', 'TypeError: x is not a function');
    const bodies = send.mock.calls.map(([body]) => parseProblemReport(JSON.parse(String(body))));
    expect(bodies).toEqual([
      { kind: 'no_webgl' },
      { kind: 'crash', detail: 'TypeError: x is not a function' },
    ]);
  });

  it('sends each kind once, so a failing page cannot loop', () => {
    const send = vi.fn();
    const report = createProblemReporter(send);
    report('crash');
    report('crash');
    report('picture_lost');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cuts a long note so the report stays valid', () => {
    const send = vi.fn();
    createProblemReporter(send)('crash', 'x'.repeat(5000));
    const sent = parseProblemReport(JSON.parse(String(send.mock.calls[0]?.[0])));
    expect(sent?.detail).toHaveLength(MAX_PROBLEM_DETAIL_CHARS);
  });

  it('leaves out an empty note', () => {
    const send = vi.fn();
    createProblemReporter(send)('crash', '');
    expect(JSON.parse(String(send.mock.calls[0]?.[0]))).toEqual({ kind: 'crash' });
  });
});
