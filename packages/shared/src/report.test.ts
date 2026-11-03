import { describe, expect, it } from 'vitest';
import {
  MAX_PROBLEM_DETAIL_CHARS,
  PROBLEM_KINDS,
  clipProblemDetail,
  parseProblemReport,
} from './report';

describe('parseProblemReport', () => {
  it.each(PROBLEM_KINDS)('accepts %s', (kind) => {
    expect(parseProblemReport({ kind })).toEqual({ kind });
  });

  it('keeps a short note', () => {
    expect(parseProblemReport({ kind: 'crash', detail: 'Error: x' })).toEqual({
      kind: 'crash',
      detail: 'Error: x',
    });
  });

  it.each([
    null,
    'crash',
    [],
    {},
    { kind: 'other' },
    { kind: 'crash', extra: 1 },
    { kind: 'crash', detail: 5 },
    { kind: 'crash', detail: 'x'.repeat(MAX_PROBLEM_DETAIL_CHARS + 1) },
  ])('refuses %j', (raw) => {
    expect(parseProblemReport(raw)).toBeNull();
  });
});

describe('clipProblemDetail', () => {
  it('cuts a long note to the limit', () => {
    expect(clipProblemDetail('x'.repeat(1000))).toHaveLength(MAX_PROBLEM_DETAIL_CHARS);
    expect(clipProblemDetail('short')).toBe('short');
  });
});
