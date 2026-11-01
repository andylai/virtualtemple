# Milestone M0 — Spike results

Last updated: 2026-11-01

Each spike answers one technical unknown from [plan.md](plan.md) before anything depends on it. All results below were obtained on a developer machine (macOS, Node 22, `wrangler dev` and the Workers test runtime), with no Cloudflare account.

| Spike | Question | Result |
|---|---|---|
| S1 | Does a PartyServer room run locally and exchange messages between two clients? | Pass |
| S2 | Does a hall survive Durable Object eviction (hibernation) with its players intact? | Pass |
| S3 | Can the Worker validate a request and forward a WebSocket to the right hall? | Pass, with one finding (name encoding) |
| S4 | Does the hall directory accept reports and answer reads from the Worker? | Pass |
| S5 | Does audio unlock after a tap on iOS Safari and Android Chrome? | Not done: needs a real phone and an audio layer (M5) |
| S6 | Does a 3D scene with 50 avatars hold 30 fps on a mid-range phone? | Not done: needs the 3D scene (M1) and a real phone |
| S7 | Can Durable Object and WebSocket behaviour be tested automatically, including simultaneous joins? | Pass |

## Findings

### S1 — Local room
- `pnpm dev` starts the Worker (`wrangler dev`, port 8787) and the web app (Vite, port 5173). The Worker needed no Cloudflare login.
- A browser page at `http://localhost:5173/?hall=1` connected through the Vite proxy to the Worker and the hall. A second client joining made the page show "2 people here", and a `hello` from the second client appeared in the page.

### S2 — Hibernation
- In the Workers test runtime, `evictAllDurableObjects()` hibernates the hall's sockets. After it, the hall was rebuilt (a new `incarnation` ID), per-connection state was restored from the WebSocket attachment, both players were still counted as admitted, and the second socket stayed open.
- Against a real local `wrangler dev` server, an idle gap of 25 seconds produced the same result: new incarnation, same state, both players still admitted.
- Attachment size limit: Cloudflare documents a maximum of 16,384 bytes (16 KiB) per connection ([Use WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). The local runtime accepted 8,000 bytes without error, so it does not prove the limit. Our per-player state (admitted flag, join time, ids, position, ritual) is well under 1 KB. Patch P-7 is resolved: store only small per-player state in the attachment, and anything larger in storage.

### S3 — Worker routing
- The Worker rejects a missing or foreign `Origin` (403), a non-WebSocket request (426), and a bad hall number (400) before touching a Durable Object. Valid requests are rewritten to `/parties/temple-room/<name>` and routed with `routePartykitRequest` and an `apac` location hint.
- **Finding:** PartyServer uses the path segment as the room name without decoding it. A name written as `temple%3Aflagship%3A4` reaches the hall as that literal text. Room names must be URL-safe as written, so the Worker does not encode them, and temple slugs are restricted to lowercase letters, digits and hyphens. Recorded in `AGENTS.md` and spec 5.1.

### S4 — Hall directory
- Halls report their count to a `HallDirectory` Durable Object (RPC), and `GET /api/halls` returns the counts in hall order. Out-of-order reports are ignored by timestamp. Throttling (`hall.reportIntervalSec`) and heartbeats arrive in M3.

### S7 — Test harness and the capacity race
- `@cloudflare/vitest-plugin` runs the Worker and its Durable Objects in the Workers runtime, including WebSockets and hibernation. The older package `@cloudflare/vitest-pool-workers` is deprecated and was replaced by this one.
- **Race test:** 60 visitors connecting at the same time to a hall with capacity 50 resulted in exactly 50 admitted and 10 refused with close code 4001.
- **Finding:** capacity must be checked against admitted connections, not open connections. An open connection is counted before its own check runs, so counting open connections would make many simultaneous joiners see each other and all be refused. The spike counts connections whose state says `admitted` and admits in the same synchronous step. Spec FR-6 and ADR-010 are updated.

## Setup findings (tooling)
- TypeScript must stay on 6.0.x: `typescript-eslint` supports TypeScript below 6.1.
- Vitest must stay on 4.1.x for the Cloudflare plugin.
- `pnpm install` initially skipped the native binding for Vite's bundler on this machine; `pnpm install --force` fixed it. If Vitest reports "Cannot find native binding", run that.
- pnpm 10 blocks install scripts by default; `esbuild` and `workerd` are allowed in the root `package.json` (`pnpm.onlyBuiltDependencies`).

## Still open
- S5 (iOS audio unlock) and S6 (3D performance on a phone) need a real device and the audio and 3D layers; they move into M1 (S6) and M5 (S5).
- Real placement and latency checks need a deployed preview, which needs a Cloudflare account (planned around M3).
