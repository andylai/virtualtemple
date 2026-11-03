import { z } from 'zod';

/** What went wrong in the visitor's browser, as a small fixed set so the counts can be charted. */
export const PROBLEM_KINDS = [
  'crash',
  'no_webgl',
  'picture_lost',
  'asset_failed',
  'connection_failed',
] as const;

/** One kind of problem a browser can report. */
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

/** The most characters of detail kept: enough for an error name and a short message. */
export const MAX_PROBLEM_DETAIL_CHARS = 200;

/** The largest report body the Worker reads, in bytes. A report is a few dozen characters. */
export const MAX_PROBLEM_REPORT_BYTES = 512;

const problemReportSchema = z.strictObject({
  kind: z.enum(PROBLEM_KINDS),
  detail: z.string().max(MAX_PROBLEM_DETAIL_CHARS).optional(),
});

/** The body of `POST /api/report`. */
export type ProblemReport = z.infer<typeof problemReportSchema>;

/**
 * Checks a report received from a browser. Anything unexpected, including extra fields, is refused,
 * so a report can never carry more than a kind and a short note.
 *
 * @param raw - The parsed JSON body.
 * @returns The report, or null when it is not valid.
 */
export function parseProblemReport(raw: unknown): ProblemReport | null {
  const result = problemReportSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Shortens a note to what a report may carry. Used by the browser before sending, so a long error
 * message does not make the whole report fail validation.
 */
export function clipProblemDetail(text: string): string {
  return text.slice(0, MAX_PROBLEM_DETAIL_CHARS);
}
