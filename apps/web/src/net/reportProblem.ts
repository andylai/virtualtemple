import { clipProblemDetail, type ProblemKind } from '@temple/shared';

/** Where a browser says that something broke. Same address as the page, so no cross-origin request. */
const REPORT_PATH = '/api/report';

/** Sends one report body. Never throws and never waits: a page that is already failing must not wait on this. */
function sendReport(body: string): void {
  try {
    void fetch(REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting is best effort.
  }
}

/** Says something broke, in a form that cannot hold anything about the visitor. */
export type ProblemReporter = (kind: ProblemKind, detail?: string) => void;

/**
 * Makes a reporter that tells the server about a problem at most once per kind. One report per kind
 * is enough to see that it happens, and it keeps a failing page from sending reports in a loop.
 * Only the kind and a short note leave the browser (spec 8.4, 8.5).
 *
 * @param send - Sends the JSON body; replaced in tests.
 */
export function createProblemReporter(send: (body: string) => void = sendReport): ProblemReporter {
  const already = new Set<ProblemKind>();
  return (kind, detail) => {
    if (already.has(kind)) {
      return;
    }
    already.add(kind);
    const note = detail === undefined || detail === '' ? undefined : clipProblemDetail(detail);
    send(JSON.stringify(note === undefined ? { kind } : { kind, detail: note }));
  };
}

/** The page's reporter. */
export const reportProblem: ProblemReporter = createProblemReporter();
