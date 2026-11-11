# AGENTS.md

Guide for anyone (people or AI tools) working in this repository.

## Project

An online Buddhist virtual temple for a Malaysian audience: anonymous visitors share a 3D hall and perform simple rituals. Phase 1 is one flagship temple. Read these first:

- [docs/mvp/intent.md](docs/mvp/intent.md) — why and what
- [docs/mvp/spec.md](docs/mvp/spec.md) — requirements (source of truth)
- [docs/mvp/plan.md](docs/mvp/plan.md) — milestones and tasks
- [docs/mvp/spikes.md](docs/mvp/spikes.md) — results of the M0 technical spikes

## Plan before coding

1. Review the relevant files and requirements. Read-only investigation is fine at this stage.
2. Show the user a short plan covering what will change, any decisions they need to make, and how the work will be verified.
3. Wait for the user’s approval before editing code or running commands that make changes. If the user revises the plan, confirm the revised scope before starting.
4. After implementation, report what changed and which checks passed.

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

Operations (see [docs/mvp/operations.md](docs/mvp/operations.md) and [docs/mvp/load-test.md](docs/mvp/load-test.md)):

```bash
pnpm loadtest --target https://<address> --scenario hall|halls|stampede   # scripted visitors
pnpm deploy:check staging|production   # refuses while the configuration is not ready
pnpm deploy:staging                    # build, check, wrangler deploy --env staging
pnpm deploy:production                 # the same for the public temple
```

`pnpm build` also checks the JavaScript the page downloads first against `apps/web/bundle-budget.json` (code fetched later, such as the model loaders, is listed but not counted), and the Content-Security-Policy in `apps/web/public/_headers`.

## Layout

```
apps/web            frontend: Vite + React + React Three Fiber (app shell, blockout hall, i18n)
apps/worker         Worker, TempleRoom (hall) and HallDirectory Durable Objects
packages/shared     message types, constants, validation helpers used by both sides
packages/room-logic plain TypeScript room rules with no Cloudflare imports (unit-testable)
tools/load-test     scripted visitors for the load test (tsx, ws)
tools/deploy        checks apps/worker/wrangler.jsonc before a deploy
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
- ADR-020 — Ritual definitions (keys, duration, animation) live in code; the manifest only chooses which a temple offers — The behaviour has to be implemented anyway, and a temple should not be able to break the rules by editing data.
- ADR-021 — Short events use an exact timer and long ones wait for the alarm — A pending timer keeps a Durable Object awake, so only events due within about 8 seconds get one; a lit lamp or a reserved cushion (20 s) waits for the alarm and can be up to one sweep period late. This refines ADR-009.
- ADR-022 — A bow begins on arrival at the cushion, not on request — The server reserves the cushion on request but others should see a bow only when the avatar is on the cushion; the server then puts the person exactly on it.
- ADR-023 — Refusals that are not the visitor's fault (no free place, lamp limit) are answers, not strikes — Otherwise a visitor who presses a key a few times would be disconnected for misbehaving.
- ADR-024 — The hall is seen from one fixed camera, fitted to the screen, with no rotation or zoom — The whole hall is always centred, a tap cannot be mistaken for a drag on phones, movement keys always mean the same screen direction, and art is made for one side only. The camera is placed by `frameHall` in `apps/web/src/scene/framing.ts`, which keeps the hall clear of a strip reserved for the buttons and a test checks on wide, laptop, square and tall screens (look-down angle 24 degrees, lens 38 degrees).
- ADR-025 — Chanting sessions are announced early with an absolute start time, and the schedule is worked out from the clock, not stored — Browsers need the recording before the start, every browser starts it at the same place on the server's clock, a late announcement is harmless, and a hall unloaded from memory loses nothing. Time zones use the platform's `Intl`, not a library; Malaysia has no daylight saving and a test checks a place that does.
- ADR-026 — Placeholder sounds are made in code and a recording that cannot be loaded falls back to them — No binary assets are needed in the repository yet, the sounds are deterministic and testable, and real recordings replace them through the manifest without code changes.
- ADR-027 — Audio is a small engine with the browser's audio replaced by a fake in tests — The rules for communal chanting (start on time, join in the middle, late download, taking over from personal chanting) are tested without a browser.
- ADR-028 — The browser remembers only what the visitor chose, checked field by field when read back, and works without storage — A single `localStorage` key holds the nickname's word ids, volumes and settings. Nothing is kept on the server, so there is no personal data to protect, and a "forget" button clears it.
- ADR-029 — Meditation seating is a ritual (`sit`) that reuses the cushion rules of the bow, and the timer lives in the browser — The cushion handling (nearest free, one owner, freed on leaving or walking away, hibernation) is already tested; the hall only needs a longer hold time, and a timer based on timestamps is correct even when the tab is asleep.
- ADR-030 — Sound goes quiet in the background unless the visitor allows it, and communal chanting is restarted at the right place afterwards — The audio clock stops while suspended, so a source that simply resumed would be behind everyone else.
- ADR-031 — One bottom dock and one top stack hold all the buttons and messages, and the camera reserves the dock's measured height — Separate fixed elements overlapped on phones; the dock reports its real height (it changes with language and screen width) and `frameHall` keeps the hall clear of it, with an estimate until it is measured.
- ADR-032 — Panels share one `Overlay` that behaves as a dialog, and keys meant for a control are not also acted on by the hall — Keyboard and screen-reader use needs focus to move into a panel and back, and Space on a focused button or arrows on a slider must not start a bow or walk the avatar (`keyTargets.ts`).
- ADR-033 — The meditation bell is booked on the audio clock; a hidden tab keeps the clock running but silences every layer except sound effects — Ordinary timers are slowed in background tabs, and the bell must still ring on time without background chanting playing against the visitor's choice.
- ADR-034 — Models and pictures come from manifest slots, load lazily, and fall back to the placeholder — Real art then replaces the placeholder with no code change (acceptance criterion 9); the loaders and decoders (Draco, KTX2) are separate downloads fetched only when a manifest names a model, so the placeholder temple does not pay for them, and the bundle budget counts only the first download.
- ADR-035 — A language is offered only when it has a catalog and the manifest lists it — Draft translations can be kept in the repository without reaching visitors before review.
- ADR-036 — One Worker serves the built web app and the API on one address (Workers static assets), instead of a Pages project plus a Worker — The page, the sockets and the API share an origin, so there is no cross-origin traffic, `ALLOWED_ORIGINS` is one address, the Content-Security-Policy can say `'self'`, and there is one deploy and one rollback. This replaces the plan's "Pages project" in M8-4.
- ADR-037 — Per-address limits use Workers Rate Limiting bindings declared only in the staging and production environments, and a failing limiter lets visitors through — Local development and tests need no account, many Malaysian mobile users share one address so the limits are generous, and refusing everyone because a limiter broke is worse than refusing no one.
- ADR-038 — The Content-Security-Policy is a static `_headers` file checked on every build — A policy that is only reviewed by eye drifts. The build fails on an inline script, an unsafe source or an art address the policy lacks, and the deployed policy is the one tested.
- ADR-039 — Browsers report problems as a fixed kind plus a short note, once per kind per page, and the server counts them by browser family — The page needs an error signal without a log service or personal data: no stack traces, no addresses, no free-form fields (the schema is strict), and a failing page cannot loop on reporting.
- ADR-040 — Logs and metrics go to Cloudflare Workers logs as structured JSON through `Telemetry`; gauges are carried by the periodic `sweep` line — Resolves O-9 for Phase 1 with nothing to run or pay for beyond the plan. A line per message would swamp the logs, so message rates ride on the sweep. Moving the destination changes only `telemetry.ts`.
- ADR-041 — Terms and a short privacy notice share one page per language and open in the hall. Production checks both published versions for draft markers and contact placeholders. Review and add a privacy contact before removing the markers.
- ADR-042 — Operational tools are workspace packages under `tools/`, run with `tsx` and tested with Vitest — The load test and the deploy check must reuse the shared message schemas and be held to the same lint, typecheck and test rules as the product.

- ADR-043 — The procedural avatar has separate waist, leg and two-segment arm pivots — A standing bow keeps the feet planted, and fixed shoulders with bent elbows let the palms meet at the chest. Meditation blends to folded legs under the robe and hands in the lap. Poses use the existing ritual clock for every visitor; reduced motion shows a held ritual pose and suppresses walking swings and pulses.

- ADR-044 — The fixed camera hall uses local altar relief artwork, generated walnut floor grain, and geometry for furniture and architecture — The design stays close to the approved artwork with one small texture for the statue while retaining walkable geometry and the manifest's model overrides. A narrower 25-degree lens reduces perspective shrinkage at the altar while retaining the same fixed view direction (refines ADR-024). The ritual dock stays visible and the hall header's More disclosure groups secondary actions around their existing dialogs.

- ADR-045 — The flagship's fixed view uses the approved hall artwork behind the live 3D avatars — One calibrated camera keeps taps, visitors and cushion positions aligned with the illustration at every screen size. The opaque scene avoids cutout edges on the Buddha. Lanterns are painted unlit, and a soft highlight lights the permanent altar pair and active ritual lamps at their matching artwork positions. Manifest art overrides and the fallback geometry keep their existing path.

- ADR-046 — Personal recitations are named recordings in the manifest and share the existing chanting audio layer — A track can be listed before its recording is available, but playback requires a recording with attribution and never substitutes a synthetic hum. The dock shortcut owns personal playback; the same audio engine fades the background and gives scheduled communal chanting priority.

- ADR-047 — The portrait welcome screen uses its own altar illustration, and the ritual dock wraps with larger labels — A portrait composition gives the altar room before entry without cropping the wide hall artwork. The live view still fits the whole hall and reserves the measured dock height for floor taps.

- ADR-048 — The illustrated hall offers an optional Altar view in portrait — The closer view clips one enlarged stage so artwork, lamps, avatars and floor taps all share the same projection. Whole hall is the default and restores access to the side aisles (refines ADR-024 and ADR-045).
