import {
  MAX_PROBLEM_REPORT_BYTES,
  parseProblemReport,
  type ProblemKind,
  type ProblemReport,
} from '@temple/shared';
import type { Telemetry } from './telemetry';

/** How long a refused browser is told to wait. The limiters' windows are at most this long. */
const RETRY_AFTER_SECONDS = '60';
/** Headers on every answer the Worker writes itself, so a browser never guesses a type or caches it. */
const SAFE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } as const;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;

/** A plain-text answer with the safe headers. */
export function plain(text: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { ...SAFE_HEADERS, ...extra } });
}

/** The answer for a browser that has used up its allowance. */
export function tooManyRequests(): Response {
  return plain('Too many requests', HTTP_TOO_MANY_REQUESTS, { 'Retry-After': RETRY_AFTER_SECONDS });
}

/**
 * Whether a request is within its allowance. The browser's address is the limiter's key and is not
 * stored or logged by us. Without a limiter (local development, tests) everything is allowed, and a
 * limiter that fails never blocks a visitor, because refusing everyone is worse than refusing no one.
 */
export async function withinAllowance(
  limiter: RateLimit | undefined,
  request: Request,
): Promise<boolean> {
  if (limiter === undefined) {
    return true;
  }
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

/** A coarse description of a browser, with few enough values to chart: no versions, no devices. */
export function browserFamily(userAgent: string | null): string {
  const agent = userAgent ?? '';
  const form = /Mobi|Android|iPhone|iPad/i.test(agent) ? 'mobile' : 'desktop';
  let family = 'other';
  if (/Firefox\//.test(agent) || /FxiOS\//.test(agent)) {
    family = 'firefox';
  } else if (/Edg(?:e|A|iOS)?\//.test(agent)) {
    family = 'edge';
  } else if (/Chrome\/|CriOS\//.test(agent)) {
    family = 'chrome';
  } else if (/Safari\//.test(agent)) {
    family = 'safari';
  }
  return `${family}-${form}`;
}

/** Reads a request body up to a limit; null when it is larger, so a flood of bytes is not buffered. */
async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) {
    return null;
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength > maxBytes ? null : new TextDecoder().decode(bytes);
}

/** What `handleReport` needs from the Worker. */
export interface ReportDeps {
  originAllowed: boolean;
  limiter: RateLimit | undefined;
  telemetry: Telemetry;
}

/**
 * Answers `POST /api/report`: a browser says that something broke (spec 8.5). The report is only a
 * kind and a short note, it is counted by kind and browser family, and nothing about the visitor
 * is kept. Always answers without a body so a failing page does not wait for it.
 */
export async function handleReport(request: Request, deps: ReportDeps): Promise<Response> {
  const { originAllowed, limiter, telemetry } = deps;
  if (request.method !== 'POST') {
    return plain('Method not allowed', HTTP_METHOD_NOT_ALLOWED, { Allow: 'POST' });
  }
  if (!originAllowed) {
    telemetry.count('rejected_request', { reason: 'origin' });
    return plain('Origin not allowed', HTTP_FORBIDDEN);
  }
  if (!(await withinAllowance(limiter, request))) {
    telemetry.count('rejected_request', { reason: 'report_rate' });
    return tooManyRequests();
  }
  const text = await readLimited(request, MAX_PROBLEM_REPORT_BYTES);
  if (text === null) {
    telemetry.count('rejected_request', { reason: 'report_size' });
    return plain('Report too large', HTTP_PAYLOAD_TOO_LARGE);
  }
  const report = parseJsonReport(text);
  if (report === null) {
    telemetry.count('rejected_request', { reason: 'report_invalid' });
    return plain('Invalid report', HTTP_BAD_REQUEST);
  }
  recordProblem(telemetry, report, browserFamily(request.headers.get('User-Agent')));
  return new Response(null, { status: HTTP_NO_CONTENT, headers: SAFE_HEADERS });
}

function parseJsonReport(text: string): ProblemReport | null {
  try {
    return parseProblemReport(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Counts a problem and writes its note to the log at warning level. */
function recordProblem(telemetry: Telemetry, report: ProblemReport, browser: string): void {
  const kind: ProblemKind = report.kind;
  telemetry.count('client_problem', { kind, browser });
  if (report.detail !== undefined) {
    telemetry.event('client_problem_detail', { kind, browser, detail: report.detail }, 'warn');
  }
}
