import { CORRELATION_HEADER, directoryName, hallRoomName, parseHallNumber } from '@temple/shared';
import { routePartykitRequest } from 'partyserver';
import { configFor } from './config';
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
    return new Response('Origin not allowed', { status: 403 });
  }
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }
  const url = new URL(request.url);
  const hall = parseHallNumber(url.searchParams.get('hall'), configFor(env).hall.count);
  if (hall === null) {
    telemetry.count('rejected_request', { reason: 'hall' });
    return new Response('Invalid hall', { status: 400 });
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
  return response ?? new Response('Not found', { status: 404 });
}

async function handleHalls(env: Env): Promise<Response> {
  const directory = env.HallDirectory.getByName(directoryName(env.TEMPLE_SLUG));
  return Response.json(await directory.list());
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return new Response('ok');
    }
    if (pathname === '/api/halls' && request.method === 'GET') {
      return handleHalls(env);
    }
    if (pathname === '/ws') {
      return handleSocket(request, env);
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
