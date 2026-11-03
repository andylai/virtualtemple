import {
  CORRELATION_HEADER,
  hallRoomName,
  parseHallNumber,
  type HallsResponse,
} from '@temple/shared';
import { suggestHall, visibleHalls } from '@temple/room-logic';
import { routePartykitRequest } from 'partyserver';
import { configFor } from './config';
import { readHallCounts } from './directoryClient';
import { handleReport, plain, tooManyRequests, withinAllowance } from './edge';
import { Telemetry } from './telemetry';

export { HallDirectory } from './HallDirectory';
export { TempleRoom } from './TempleRoom';

/** Where the Durable Object namespace of `TempleRoom` is routed to (kebab-case of the class). */
const ROOM_ROUTE = 'temple-room';
/** Durable Objects are created near the first visitor unless hinted; see spec section 5.1. */
const LOCATION_HINT = 'apac';

function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()));
}

async function handleSocket(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const telemetry = new Telemetry({ temple_id: env.TEMPLE_SLUG });
  if (origin === null || !allowedOrigins(env).has(origin)) {
    telemetry.count('rejected_request', { reason: 'origin' });
    return plain('Origin not allowed', 403);
  }
  if (request.headers.get('Upgrade') !== 'websocket') {
    return plain('Expected a WebSocket upgrade', 426);
  }
  if (!(await withinAllowance(env.CONNECT_LIMITER, request))) {
    telemetry.count('rejected_request', { reason: 'connect_rate' });
    return tooManyRequests();
  }
  const url = new URL(request.url);
  const hall = parseHallNumber(url.searchParams.get('hall'), configFor(env).hall.count);
  if (hall === null) {
    telemetry.count('rejected_request', { reason: 'hall' });
    return plain('Invalid hall', 400);
  }
  // PartyServer takes the path segment as the room name without decoding it, so the name must be
  // URL-safe as written (the slug is restricted to lowercase letters, digits and hyphens).
  const roomName = hallRoomName(env.TEMPLE_SLUG, hall);
  const target = new URL(`/parties/${ROOM_ROUTE}/${roomName}`, url);
  const correlationId = crypto.randomUUID();
  const forwarded = new Request(target, request);
  forwarded.headers.set(CORRELATION_HEADER, correlationId);
  telemetry.with({ hall_id: hall, correlation_id: correlationId }).event('ws_request');
  const response = await routePartykitRequest(forwarded, env, { locationHint: LOCATION_HINT });
  return response ?? plain('Not found', 404);
}

/** Lets the page, if served from another allowed origin, read the answer. */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin !== null && allowedOrigins(env).has(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

/**
 * Answers `GET /api/halls`: the halls to list, and which hall a new visitor should join.
 * When the directory cannot be reached the answer is 503 and the browser tries halls in order.
 */
async function handleHalls(request: Request, env: Env): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(request, env),
  };
  if (!(await withinAllowance(env.HALLS_LIMITER, request))) {
    new Telemetry({ temple_id: env.TEMPLE_SLUG }).count('rejected_request', {
      reason: 'halls_rate',
    });
    return tooManyRequests();
  }
  const { count, maxPlayers, suggestSpread } = configFor(env).hall;
  try {
    const counts = await readHallCounts(env, Date.now());
    const body: HallsResponse = {
      halls: visibleHalls(counts, count, maxPlayers),
      suggestedHall: suggestHall(counts, {
        hallCount: count,
        maxPlayers,
        spread: suggestSpread,
        random: Math.random,
      }),
      hallCount: count,
      maxPlayers,
    };
    return Response.json(body, { headers });
  } catch {
    new Telemetry({ temple_id: env.TEMPLE_SLUG }).count('directory_unavailable', {
      during: 'list',
    });
    return Response.json({ error: 'directory_unavailable' }, { status: 503, headers });
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return plain('ok');
    }
    if (pathname === '/api/report') {
      const origin = request.headers.get('Origin');
      return handleReport(request, {
        originAllowed: origin !== null && allowedOrigins(env).has(origin),
        limiter: env.REPORT_LIMITER,
        telemetry: new Telemetry({ temple_id: env.TEMPLE_SLUG }),
      });
    }
    if (pathname === '/api/halls' && request.method === 'GET') {
      return handleHalls(request, env);
    }
    if (pathname === '/ws') {
      return handleSocket(request, env);
    }
    return plain('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
