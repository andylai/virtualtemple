# AGENTS.md

Guide for anyone (people or AI tools) working in this repository.

## Project

An online Buddhist virtual temple for a Malaysian audience: anonymous visitors share a 3D hall and perform simple rituals. Phase 1 is one flagship temple. Read these first:

- [docs/mvp/intent.md](docs/mvp/intent.md) — why and what
- [docs/mvp/spec.md](docs/mvp/spec.md) — requirements (source of truth)
- [docs/mvp/plan.md](docs/mvp/plan.md) — milestones and tasks
- [docs/mvp/spikes.md](docs/mvp/spikes.md) — results of the M0 technical spikes

## Runtime and tools

- Node.js 22 or newer, pnpm 10 (`corepack enable` if pnpm is missing).
- TypeScript is pinned to `~6.0.x` because `typescript-eslint` does not yet support TypeScript 7.
- Vitest is pinned to `~4.1.x` because `@cloudflare/vitest-plugin` requires Vitest 4.1 or newer within the 4.x line.
- Cloudflare Workers, Durable Objects and PartyServer. Local development needs no Cloudflare account or login.

## Commands

```bash
pnpm install        # install everything
pnpm dev            # Worker on :8787 and web app on :5173 (the web app proxies /ws and /api)
pnpm test           # unit and Workers-runtime tests in every package
pnpm typecheck      # TypeScript strict mode in every package
pnpm lint           # ESLint
pnpm format:check   # Prettier
```

After changing `apps/worker/wrangler.jsonc`, regenerate bindings types: `pnpm --filter @temple/worker types`.

`pnpm dev` runs the Worker and the web app together. Open `http://localhost:5173/?hall=1` in two tabs, press Enter in each, and walk with WASD, the arrow keys, or a click on the floor. The web app alone (the Worker is only needed after you press Enter): `pnpm --filter @temple/web dev`. Add `?debug=1&stress=50` for the frame-rate overlay and 50 stand-in avatars. For a phone on the same Wi-Fi use `pnpm --filter @temple/web dev:lan` and open the Network URL it prints.

`pnpm build` also checks the JavaScript size against `apps/web/bundle-budget.json`.

## Layout

```
apps/web            frontend: Vite + React + React Three Fiber (app shell, blockout hall, i18n)
apps/worker         Worker, TempleRoom (hall) and HallDirectory Durable Objects
packages/shared     message types, constants, validation helpers used by both sides
packages/room-logic plain TypeScript room rules with no Cloudflare imports (unit-testable)
manifests/          temple manifests (flagship.json); every file is validated by a test
docs/mvp/           intent, spec, plan, spikes
```

## Conventions

- Terminology: visitors only see "hall" and "people". "room", "instance" and "server" stay internal (spec 3.2).
- No magic numbers or magic strings: tunable values live in the config module (`packages/shared/src/config.ts`, spec 4.3) or the manifest; visual sizes and colours are named constants. The Worker reads its limits through `loadConfig(env)`, so `wrangler dev --var HALL_MAX_PLAYERS:2` overrides a default.
- Visitor-facing text goes through `t('key')`; add the key to `apps/web/src/i18n/en.ts`. A test fails if the source uses a key that does not exist, and the types fail if a language misses a key.
- Validate all external input (messages, URL parameters, manifest) before use. There is no free-text input anywhere.
- Structured logging only, no `console.log` (ESLint enforces `no-console`). Log fields: `correlation_id`, `temple_id`, `hall_id`. Never log personal data.
- Public and internal members have TSDoc comments that explain why, not what.
- Files stay under 800 lines and functions under 60 lines (ESLint enforces both).
- No `*Manager`, `*Helper` or `*Util` names.
- Room rules go in `packages/room-logic`; the PartyServer class in `apps/worker` is only an adapter.
- All logging goes through `apps/worker/src/telemetry.ts` (the one file allowed to use the console). Test files and build scripts are exempt from the function-length and console rules respectively; production code is not.
- Durable Object names must be URL-safe as written: PartyServer does not decode the path segment (see spikes.md S1). Temple slugs are lowercase letters, digits and hyphens.
- Any deviation from these rules or any new pattern is recorded below as an ADR.

## Architectural decisions

- ADR-001 — TypeScript (strict) for frontend and backend — The browser requires JavaScript, Workers run it natively, and shared message types keep client and server in step.
- ADR-002 — Cloudflare Workers, Durable Objects and PartyServer; not Colyseus or a self-hosted server — A hall maps to one Durable Object, there are no servers to run, and the hosted PartyKit platform shut down on 2026-10-23.
- ADR-003 — Room rules live in `packages/room-logic` with no Cloudflare imports; PartyServer is only an adapter — Rules are unit-testable and a platform or library change touches only the adapter.
- ADR-004 — A `HallDirectory` Durable Object tracks hall counts; the hall's own check is authoritative — The Worker can pick a hall without waking every hall, and stale counts can only cause retries, never an overfull hall.
- ADR-005 — The temple is a manifest (assets, rituals, schedule, languages) — Phase 2 adds temples by adding data, not code.
- ADR-006 — pnpm workspaces monorepo — Shared packages with strict dependency boundaries and fast installs.
- ADR-007 — Zod for config, manifest and message validation — One schema gives both runtime validation and TypeScript types; the bundle budget (ADR-012) keeps its size in check.
- ADR-008 — No user-generated text; nicknames are word IDs resolved on the server — Removes moderation and most injection risks.
- ADR-009 — One scheduler per hall — A Durable Object has a single `alarm()`, so all due events share one ordered list armed for the earliest.
- ADR-010 — Capacity counts admitted connections, not open connections — Counting open connections rejects everyone when many arrive at once because each joiner sees the others; confirmed by the 60-into-50 test (spikes.md S7).
- ADR-011 — Tests run in the Workers runtime with `@cloudflare/vitest-plugin` — Durable Object and WebSocket behaviour, including hibernation, is exercised for real instead of mocked (spikes.md S7).
- ADR-012 — A gzip bundle budget is enforced on every web build — Mobile load time depends on JavaScript size; the budget is set from the measured size plus headroom (334 kB measured, 400 kB allowed at M1) and raised only on purpose.
- ADR-013 — Hall geometry (walkable area, cushions, lamp slots) lives in the manifest and the blockout hall is drawn from it — Real art and other temples change data, not code (spec 7, intent 11).
- ADR-014 — A person is admitted by a valid `join` message, not by the connection opening — The `join` carries the remembered nickname and reconnect token, and unadmitted connections receive nothing about the hall and are closed after a timeout.
- ADR-015 — Movement snapshots run on demand with a timer that starts when someone moves — A pending timer would keep the Durable Object awake; starting it only on movement lets a quiet hall hibernate. Positions are saved into the connections at each snapshot so still people survive hibernation.
- ADR-016 — A dropped person's place is kept in Durable Object storage for a grace period under a one-use token — The in-memory registry is lost on hibernation and the connection (with its saved state) is gone after a drop, so storage is the only place that survives both.
- ADR-017 — A hall that becomes full, or refuses someone, reports to the directory at once instead of waiting for the throttle — A burst of visitors who all asked the directory before it knew a hall was full would otherwise bounce between full halls and run out of tries (found by the 160-visitor burst test).
- ADR-018 — A refused visitor never retries a hall it already tried, and a hint that points at one is replaced by the first hall not yet tried — Hints come from a directory that can lag, so the client must not rely on them to end a chain of refusals.
- ADR-019 — The saved reconnect token records which hall it belongs to — A tab that reloads on a plain link goes back to its hall and resumes its place; a token is never sent to a different hall.
