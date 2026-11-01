# Virtual Temple (Malaysia) — Phase 1 Implementation Plan

Status: draft, derived from [spec.md](spec.md) and [intent.md](intent.md). M0 is mostly done (section 13).
Last updated: 2026-11-01

This plan says what to build, in what order, how to check each step, and what could go wrong. It does not repeat requirements; the spec is the source of truth. Task IDs (for example `M2-3`) are for referring to work in commits and reviews.

Sizes are rough and uncalibrated, for one developer coding by hand: S = about a day, M = 2–4 days, L = about 1–2 weeks, XL = about 2–3 weeks.

---

## 1. Assumptions

- One developer (or a very small team) building in this repository, which has no code yet.
- Stack as in spec section 4.2: TypeScript (strict), Vite, Three.js, Cloudflare Workers, Durable Objects, PartyServer.
- React with React Three Fiber for the frontend. This is a provisional choice for open question O-6; if O-6 goes the other way, only the `apps/web` scene and UI tasks change.
- pnpm workspaces for the monorepo, Vitest for tests, Zod for message and manifest validation. Both are proposed (ADR-006, ADR-007 below) and kept to a minimum of dependencies.
- Art and audio are placeholders until the art track delivers real assets. Nothing in the code depends on the final art.
- No CI host is known yet. The pipeline steps are defined (section 8) and can be set up on any host.
- No Cloudflare account is needed to build and test locally (confirmed in M0). One is needed for the first preview deployment, planned around M3.

---

## 2. Before building: spec patches and decisions

### 2.1 Spec patches to make first (from the spec review and the race-condition discussion)

| ID | Patch | Why |
|---|---|---|
| P-1 | Join check and add happen in one synchronous step with no `await` between them; the count comes from live WebSocket connections and does not count the joiner twice. | Prevents two visitors taking the last place. |
| P-2 | `hall_full` reply names the next hall with space and carries fresh counts; the Worker may suggest a random hall among the first few with space; `hall.joinRetries` is raised for surges. | Stops a stampede on a stale suggestion. |
| P-3 | Reconnection rule: auto-reconnect, rejoin as the same player within a grace period, otherwise rejoin as new. | Phones drop connections often. |
| P-4 | Idle timeout (`hall.idleKickSec`) that frees seats and, later, disconnects. | An away tab must not hold a cushion forever. |
| P-5 | Chanting preload rule: preload before the scheduled time; a client that is not ready joins mid-way when ready. | Defines late-loading behaviour. |
| P-6 | Replace the illustrative dates (Wesak Day and lunar-day examples) with verified dates, or mark every date in examples as "example only". | They were not checked against a calendar. |
| P-7 | Note that hibernation recovery depends on per-connection attachment size limits, to be checked in spike S2. | Avoids building on an unverified assumption. |

These are done in task M0-1.

### 2.2 Decisions needed (from spec section 15)

| Open question | Needed by | Plan if still open |
|---|---|---|
| O-2 Tradition | Start of art work (M1) | Build with neutral placeholders; the manifest swaps statue and audio. |
| O-6 React Three Fiber or plain Three.js | M1 | Use React Three Fiber. |
| O-4 Original or placeholder assets | M1 | Use placeholders. |
| O-1 Launch languages | M7 | Ship English; add others through translation files. |
| O-5 Religious advisor | M4 | Block the public launch (M8), not development. |
| O-3 Donations | M7 | Out of Phase 1 unless decided. |
| O-8 Hall names | M7 | "Hall 1, Hall 2…" |
| O-7 Config numbers | M8 | Use the proposed defaults until the load test. |
| O-9 Where logs and metrics go (for example New Relic or Cloudflare's own tools) | M2 | Write structured logs through one logger module, so the destination can change later. |

---

## 3. Parallel tracks

Two non-code tracks run alongside the milestones:

- **Art and audio track:** art brief once O-2 is decided; hall model, statue, cushions, lamp rack, avatar with greet/bow/lamp animations; ambient, chanting and SFX audio with clear licences; credits list. Delivered as files plus manifest entries (M7 swaps them in).
- **Content track:** nickname word lists, translations, ritual names per language, chanting schedule, verified special-day dates for the launch year, religious advisor review of wording.

---

## 4. Milestones

Dependencies: M0 → M1 → M2 → M3, M2 → M4 → M5, M1 → M6, then M3–M6 → M7 → M8. M6 can run in parallel with M4 and M5.

Mapping to the spec's milestone list: spec 1 = M1, spec 2 = M2, hall assignment from spec 5 is pulled forward to M3 because joining depends on it, spec 3 = M4, spec 4 = M5, rest of spec 5 = M6, spec 6 = M7, spec 7 = M8.

### M0 — Foundations and spikes (M)

Goal: a working repo and answers to the technical unknowns before anything depends on them.

| Task | Description | Output |
|---|---|---|
| M0-1 | Apply spec patches P-1 to P-7. | Updated `spec.md` |
| M0-2 | Create the pnpm workspace: `apps/web`, `apps/worker`, `packages/shared`, `packages/room-logic`, `manifests/`. Strict `tsconfig` base, ESLint, Prettier, Vitest. Scripts: `dev` (Worker plus Vite), `typecheck`, `lint`, `test`, `build`. | Repo builds and runs empty |
| M0-3 | `AGENTS.md` with the ADR log and the initial ADRs (section 9). | `AGENTS.md` |
| M0-4 | Spike S1: PartyServer room running locally; two tabs exchange messages. | Notes |
| M0-5 | Spike S2: hibernation. Evict and wake a room with connections open; recover players from connection attachments; record the size limit. | Notes |
| M0-6 | Spike S3: Worker forwards a WebSocket to a Durable Object, with the Origin check. | Notes |
| M0-7 | Spike S4: hall directory Durable Object accepting reports and answering reads from the Worker. | Notes |
| M0-8 | Spike S5: audio unlock after a click on iOS Safari and Android Chrome; background-playback behaviour. | Notes |
| M0-9 | Spike S6: a React Three Fiber scene with 50 capsule avatars on a mid-range phone; record fps. Moved to M1 (needs the 3D scene and a phone). | Notes |
| M0-10 | Spike S7: confirm how to test Durable Objects and WebSockets automatically, including simultaneous joins. | Notes, test harness |

Spike results go in `docs/mvp/spikes.md`. If a spike fails, update the affected ADR and the spec before moving on.

Done when: `pnpm dev` starts both apps, `pnpm test` runs (even with no tests yet), and each spike has a recorded result.

### M1 — Skeleton (S)

| Task | Description |
|---|---|
| M1-1 | `packages/shared`: config module (all `hall.*`, `net.*`, `ritual.*`, `lamp.*`, `ui.*`, `meditation.*`, `audio.*` keys from spec section 4.3, with environment overrides); constants; TSDoc comments. |
| M1-2 | Manifest types, Zod schema, build-time validator, and `manifests/flagship.json` with placeholder values. An invalid manifest fails the build. |
| M1-3 | `apps/web`: app shell, loading screen with progress, "Enter" button, empty R3F scene with orbit camera and a placeholder floor. |
| M1-4 | i18n scaffold: translation files (English), a `t()` helper, a check that every key used exists. |
| M1-5 | Blockout hall: a box-shaped placeholder hall (floor, altar, cushions, lamp rack) and the hall template format that defines the walkable area, cushion positions and lamp slots in the manifest. Real art replaces it later through manifest slots. |
| M1-6 | Bundle-size budget checked in CI, so mobile load time does not drift. |
| M1-7 | Spike S6: 50 capsule avatars in a React Three Fiber scene on a mid-range phone; record the frame rate. |

Done when: the app opens, shows the loading screen, and enters an empty scene; the manifest and config validate in CI.

### M2 — Hall core (L)

Goal: people can join one hall, see each other move, and leave.

| Task | Description |
|---|---|
| M2-1 | `packages/shared`: Zod schemas and TypeScript types for every client and server message (spec section 6), plus error codes. |
| M2-2 | `packages/room-logic`: player registry; `join` with the capacity check and add done in one synchronous step (P-1); nickname assignment from word IDs with the in-use fallback; leave; population count. No Cloudflare imports. |
| M2-3 | `packages/room-logic`: movement handling (walkable-area clamp, rate limiting), the `moved` set, and snapshot building. |
| M2-4 | `apps/worker`: request validation (Origin, `hall` is a whole number from 1 to `hall.count`), correlation ID, forwarding to the hall Durable Object. |
| M2-5 | `apps/worker`: `TempleRoom` adapter wiring PartyServer events to `room-logic`, with state recovery after hibernation wake-up (spike S2), and the snapshot timer. |
| M2-6 | `apps/web/net`: WebSocket client with schema-validated incoming messages, `welcome` handling, reconnect with grace period (P-3). |
| M2-7 | `apps/web/scene`: capsule avatars, click-to-walk and WASD/arrow movement, camera orbit and zoom, position sending at `net.positionSendHz`, interpolation of other players between snapshots. |
| M2-8 | Population counter and idle timeout (P-4). |
| M2-9 | Structured logging (`correlation_id`, `temple_id`, `hall_id`) and basic metrics hooks. |

Tests:
- Unit: capacity check, nickname fallback, clamp, rate limit, snapshot content.
- Integration: join, move and leave end to end with scripted clients; **60 simultaneous joins to a hall capped at 50 admit exactly 50 and refuse 10**; invalid and oversize messages are refused without crashing the hall.

Done when: two browsers and a phone see each other move smoothly in one hall, and the race test passes.

### M3 — Halls: directory, assignment, Change hall (M)

| Task | Description |
|---|---|
| M3-1 | `HallDirectory` Durable Object: receives count reports, keeps a table of numbers, ignores older reports, answers reads. |
| M3-2 | Halls report their count on change (at most every `hall.reportIntervalSec`) and as a heartbeat (`hall.heartbeatSec`). |
| M3-3 | `GET /api/halls`: counts, full flags and `suggestedHall` (first hall with space, optionally random among the first few, P-2). |
| M3-4 | `hall_full` reply carries fresh counts and the next hall with space; `all_halls_full` handling. |
| M3-5 | Client join flow: read the link, call `GET /api/halls`, connect, retry up to `hall.joinRetries`, fall back to trying halls 1, 2, 3 in order if the directory is unavailable. |
| M3-6 | UI: "Hall 2 was full…" message, "All halls are full" screen with "Try again", "Change hall" list, "Invite a friend" button. All text from translation files, with no "room", "instance" or "server" in visitor-facing text. |

Tests:
- Unit: directory ordering and staleness; suggestion logic.
- Integration: plain link lands in Hall 1; the 51st visitor lands in Hall 2; all halls full shows the message; directory down falls back correctly.
- Stampede test: 100 near-simultaneous joins across 3 halls with a stale directory; nobody is stranded while any hall has space.

Done when: spec acceptance criteria 5, 5a, 5b and 5c pass.

### M4 — Rituals (L)

| Task | Description |
|---|---|
| M4-1 | Ritual registry in `room-logic`, built from the manifest (`greet`, `bow`, `lamp`), with cooldowns and validation of the ritual ID. |
| M4-2 | Seats: server-assigned cushions; `bow` and `sit` reserve one, `ritual_stop`, `stand` and leaving release it; `no_slot_free` handling. |
| M4-3 | Lamps: server-assigned slots, owner limit, expiry after `lamp.durationSec`. |
| M4-4 | Scheduler in the room: an ordered list of due events (lamp expiries now, chanting next in M5) and a single `alarm()` always armed for the earliest one. |
| M4-5 | Client: key bindings (1, 2, 3, E, Space, L), on-screen buttons, auto-walk to the assigned cushion, stop button, placeholder animations. |
| M4-6 | Activity toasts: `aria-live` region, `ui.toastSeconds`, `ui.maxToasts`, text from translation files. |

Tests:
- Unit: two clients never get the same cushion or lamp slot, including under simultaneous requests; expiry ordering; cooldown.
- Integration: ritual events reach others; leaving frees the seat.

Done when: spec acceptance criterion 2 passes.

### M5 — Audio and schedule (L)

| Task | Description |
|---|---|
| M5-1 | Audio engine: three layers (ambient, chanting, SFX) with separate volumes, defaults from config, unlock on "Enter". |
| M5-2 | SFX hooks for bell and lamp. Personal chanting that stops when a communal session starts. |
| M5-3 | Time handling for Malaysia time (MYT): compute the next scheduled time from the manifest's time zone without a heavy dependency; fully unit-tested with a fake clock. |
| M5-4 | Room: schedule regular chanting and special-day chanting on the shared scheduler; broadcast `chanting_start` and `chanting_end`; include any active session in `welcome`. |
| M5-5 | Client: clock offset from `serverTimeMs`, play chanting at `now − startAt`, preload before the start time and handle a late-loading client (P-5). |
| M5-6 | Special days: server lookup on join, `specialDay` in `welcome`, banner in the UI, extra chanting times. |

Tests:
- Unit with a fake clock: next-time calculation, day rollover, special-day lookup, a scheduler with many due events.
- Integration: schedule set one minute ahead; everyone gets `chanting_start`; a late joiner gets the right offset.

Done when: spec acceptance criteria 3 and 4 pass on a local run with a shortened schedule.

### M6 — Extras (M)

| Task | Description |
|---|---|
| M6-1 | Meditation timer (5, 10, 15 minutes) using `sit` and `stand`; bell at the end; correct after the tab was in the background (use timestamps, not a countdown). |
| M6-2 | "Remember me": nickname word IDs and audio settings in `localStorage`, wrapped in try/catch; the page works if storage is unavailable. |
| M6-3 | Exit screen with "stay again". |
| M6-4 | Settings panel (volumes, background play, language, reduce motion) and the credits "About" panel. |

Done when: spec acceptance criteria 6 and 8 pass.

### M7 — Polish (L)

| Task | Description |
|---|---|
| M7-1 | Mobile layout and touch controls: tap to walk, pinch to zoom, on-screen ritual buttons. |
| M7-2 | Asset pipeline: glTF with Draco and KTX2 compression, audio converted to Opus, asset base URL from config. |
| M7-3 | Swap in the real hall, statue, avatar and audio through manifest slots, with no code change (acceptance criterion 9). |
| M7-4 | Performance pass: pixel-ratio cap, limit on drawn avatars, light and shadow budget, memory check on a mid-range phone. |
| M7-5 | Accessibility pass: keyboard operation, focus, reduced motion, screen-reader announcements. |
| M7-6 | Translations for the launch languages; browser matrix (Chrome, Safari including iOS, Firefox). |
| M7-7 | Error and empty states (no WebGL, assets fail to load, offline) and share previews (page title, description and preview image for links shared in chat apps). |

Done when: it meets the spec's performance and accessibility targets on real devices.

### M8 — Hardening and launch (M)

| Task | Description |
|---|---|
| M8-1 | Load test with scripted clients: one full hall, then several halls, then a join stampede; record fps, latency, error rates and cost. Tune the numbers in spec section 4.3 (open question O-7). |
| M8-2 | Security: Content-Security-Policy, final rate limits, origin allow-list for production. |
| M8-3 | Observability: dashboards or queries for connections, joins, rejected messages, alarm runs and errors. |
| M8-4 | Production setup: Cloudflare account on the Workers Paid plan, spend alert, domain, Pages project, Worker deployment, Durable Object migrations. |
| M8-5 | Runbook, launch checklist and rollback steps. Confirm the religious advisor's sign-off (O-5) and the donation decision (O-3). |
| M8-6 | Privacy note and terms page, and a PDPA check, even though only `localStorage` is used. |

Done when: all ten acceptance criteria in spec section 14 pass on the deployed preview and the launch checklist is complete.

---

## 5. Task order inside the critical path

1. M0-2 → M0-4 → M0-5 (the repo and the hall core are blocked by these)
2. M1-1, M1-2 → M2-1 → M2-2 → M2-5 → M2-6 → M2-7
3. M3-1 → M3-3 → M3-5
4. M4-4 (scheduler) before M4-3 and M5-4
5. Art arrives for M7-3; everything before it runs on placeholders.

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| PartyServer API changes, or the library disappears (as PartyKit's hosted platform did) | Rework of the room adapter | Keep PartyServer behind the thin adapter (ADR-003); room logic stays plain TypeScript. |
| Hibernation wake-up loses players | Visitors see an empty hall | Spike S2 first; test eviction and wake in M2. |
| One alarm per Durable Object | Missed lamp expiry or chanting | One scheduler that always arms the earliest event; tested in M4 and M5. |
| iOS audio rules or background playback | No sound for iPhone users | Spike S5; "Enter" unlock; document the limitation. |
| 3D performance on low-end phones | Unusable on part of the audience | Spike S6; budgets in M7; a lower-quality mode if needed. |
| Stale directory sends a crowd to one hall | Visitors stranded despite free halls | P-2 mitigations plus the stampede test in M3 and M8. |
| Cost higher than estimated | Surprise bill | Spend alert at M8-4; load test before launch; tune `net.positionSendHz`. |
| Unverified special-day dates | Banner on the wrong day | P-6; the religious advisor checks the launch-year dates. |
| Art or advisor sign-off delayed | Launch slips | Development uses placeholders; sign-off gates only M8-5. |
| Directory is one extra component | More to build and run | Small table, no storage; fall back to ordered tries if it is down. |

---

## 7. Testing summary

| Level | Where | Tool |
|---|---|---|
| Unit | `room-logic`, `shared`, scheduler, time handling | Vitest, fake clock |
| Integration | Worker plus hall plus directory with scripted WebSocket clients | Vitest against the local runtime |
| Client | Interpolation, i18n key coverage, settings storage | Vitest, component tests |
| Manual | Two tabs plus a phone; iOS audio; late joiner during chanting | Checklist per milestone |
| Load | Full hall, several halls, join stampede | Scripted clients against a deployed preview |

Rule: bug fixes in `room-logic` come with a failing test first.

---

## 8. Delivery pipeline

- **Environments:** local (`wrangler dev` plus Vite), preview (a deployed copy for testing and the load test), production.
- **CI steps:** install, typecheck, lint, test, build, manifest validation. A failure blocks merging.
- **Branches and commits:** small branches per task; commit messages reference the task ID (for example `M2-2: add capacity check`).
- **Configuration:** environment overrides for config values; deploy credentials only from the environment; nothing secret in the repository.
- **Deploy:** Pages for the frontend, Worker plus Durable Objects through `wrangler`, with Durable Object migrations checked in.

---

## 9. ADRs to record in AGENTS.md

| ID | Decision |
|---|---|
| ADR-001 | TypeScript (strict) for frontend and backend. |
| ADR-002 | Cloudflare Workers, Durable Objects and PartyServer; not Colyseus or a self-hosted server. |
| ADR-003 | Room rules live in a separate `room-logic` package with no Cloudflare imports; PartyServer is only an adapter. |
| ADR-004 | A hall directory Durable Object tracks hall counts; the hall's own check is authoritative. |
| ADR-005 | Manifest-driven temple (assets, rituals, schedule, languages), to allow the multi-temple phase. |
| ADR-006 | pnpm workspaces monorepo. |
| ADR-007 | Zod for message and manifest validation. |
| ADR-008 | No user-generated text; nicknames are word IDs resolved on the server. |
| ADR-009 | Single scheduler per hall because a Durable Object has one alarm. |

---

## 10. Definition of done (every task)

- Typecheck, lint and tests pass in CI.
- New behaviour has tests; the spec requirement it implements is named in the commit or PR.
- No placeholder or stub code left without a linked follow-up.
- No magic numbers: values come from the config module or the manifest.
- Public and internal members have TSDoc comments that explain why.
- No file over 800 lines and no method over 60 lines; no `*Manager`, `*Helper` or `*Util` names.
- Input from outside is validated before use; no free-text input exists.
- Logs are structured, carry the required IDs, and contain no personal data.
- Any deviation from these rules or any new pattern is recorded as an ADR in `AGENTS.md`.

---

## 11. Estimate

| Milestone | Size |
|---|---|
| M0 Foundations and spikes | L |
| M1 Skeleton | S |
| M2 Hall core | XL |
| M3 Halls: directory, assignment, Change hall | L |
| M4 Rituals | L |
| M5 Audio and schedule | L |
| M6 Extras | M |
| M7 Polish | L |
| M8 Hardening and launch | L |

Roughly 12–16 weeks for one developer coding by hand (about 66 working days at the sizes above, with M6 parallel to M4 and M5), with the first honest recalibration after M2. This excludes art, audio licensing, translation, the religious advisor's review and waiting for decisions, which run in the parallel tracks and may be the real critical path.

If AI writes most of the code, the coding time shrinks a lot and elapsed time is set by review, real-device testing, art and sign-offs instead. A rough guess is 1–2 weeks to a feature-complete version with placeholder art, which is an estimate to check against actual progress after M2.

---

## 12. Not in this plan

Temple uploads and multi-temple onboarding (intent.md section 11), donations (unless O-3 is decided), accounts, chat, a visit counter and multi-region hall sharding.

---

## 13. M0 status (2026-11-01)

| Task | Status |
|---|---|
| M0-1 Spec patches P-1 to P-7 | Done. P-7 resolved by the documented 16 KiB attachment limit; P-6 handled by marking example dates as illustrative. |
| M0-2 Workspace and tooling | Done: `pnpm dev`, `typecheck`, `lint`, `test`, `format:check` all run. |
| M0-3 `AGENTS.md` with ADRs | Done, with `CLAUDE.md` importing it and a short README. ADR-010 and ADR-011 were added from the spikes. |
| M0-4 Spike S1 (local room) | Pass |
| M0-5 Spike S2 (hibernation) | Pass |
| M0-6 Spike S3 (Worker forwarding, Origin check) | Pass, with the name-encoding finding |
| M0-7 Spike S4 (hall directory) | Pass |
| M0-8 Spike S5 (iOS audio) | Not done; needs a real phone and the audio layer, moves to M5 |
| M0-9 Spike S6 (3D performance) | Not done; moved to M1 as M1-7 |
| M0-10 Spike S7 (test harness) | Pass: 60 simultaneous joins into a 50-person hall admit exactly 50 |

Details and findings: [spikes.md](spikes.md). The code from the spikes (`TempleRoom`, `HallDirectory`, Worker routing, a throwaway web page) is real and tested, and M2 and M3 build on it.

Next: M1 (skeleton, including the blockout hall and the phone performance spike).

---

## 14. M1 status (2026-11-01)

| Task | Status |
|---|---|
| M1-1 Config module | Done: `packages/shared/src/config.ts`, validated defaults with environment overrides; the Worker now reads its limits through it. |
| M1-2 Manifest | Done: Zod schema with cross-field checks (cushions inside the walkable area, unique ids, real dates, safe asset paths), `manifests/flagship.json`, and a test that validates every file in `manifests/`. |
| M1-3 App shell | Done: loading card, Enter button, WebGL check with a clear message, orbit camera, pixel ratio capped at 2. Audio unlock on Enter arrives with M5. |
| M1-4 i18n | Done: English catalog, `t()`, language pick from the browser, type-checked catalogs and a test that every used key exists. |
| M1-5 Blockout hall | Done: floor, three walls, altar, statue, 12 cushions and 8 lamp places on a shelf either side of the altar (changed in M4), all drawn from the manifest. |
| M1-6 Bundle budget | Done: checked on every build; 334 kB measured, 400 kB allowed. |
| M1-7 Spike S6 | Partly done: 50 stand-ins run at the display limit on desktop; the real-phone check is still open (see spikes.md). |

The throwaway M0 web page (`SpikePage`) was removed. The Worker spike code and its tests remain and are reused in M2. Until M2, the web app does not talk to the Worker, so two browser tabs no longer show each other.

Next: M2 (hall core: people join one hall, see each other move, and leave).

---

## 15. M2 status (2026-11-01)

| Task | Status |
|---|---|
| M2-1 Message protocol | Done: Zod schemas for every client and server message in `packages/shared/src/messages.ts`, with size, range and unknown-field checks. |
| M2-2 Player registry, nicknames | Done: `PlayerRegistry` (admission with capacity check, readmit, restore, remove), nickname picker that accepts only word ids, spawn near the entrance. |
| M2-3 Movement and rate limit | Done: walkable-area check, normalised facing, moved set drained into snapshots, token-bucket limiter. |
| M2-4 Worker routing | Done: Origin and hall checks, correlation id passed to the hall. |
| M2-5 Hall adapter | Done: `TempleRoom` with join/move/ping, restore after hibernation, on-demand snapshot timer, reconnect storage, takeover of stale connections. |
| M2-6 Browser connection | Done: `HallConnection` with reconnect and back-off, resume token in `sessionStorage`, pings only while the page is visible, close-code handling. |
| M2-7 Walking and players | Done: click-to-walk and keyboard walking with wall sliding, camera follows, other people smoothed between snapshots. |
| M2-8 Population and idle | Done: HUD with hall, count and nickname; idle and join timeouts. |
| M2-9 Logging | Done: structured logs with `temple_id`, `hall_id`, `correlation_id`; counters logged for rejected messages, refusals and closes. Destination still open (O-9). |

Tests: 172 in total (shared 66, room-logic 26, web 56, worker 24). The worker tests run in the Workers runtime and cover joining, nickname handling, movement and batching, 60 simultaneous joins into a 50-person hall, bad and oversize messages, rate limits, reconnect (including one-use tokens, expiry and takeover), idle and join timeouts, hibernation, and the directory.

Checked by hand in the desktop browser: joining, the HUD, seeing a scripted second visitor walk, walking by clicking the floor (the second visitor received the path), and reconnecting after a server restart (the same person came back). Not checked visually: the "hall is full", "away" and "reconnecting" screens (the browser pane was hidden and paused rendering); they are covered by the connection tests and the status mapping.

Notes for later: the browser connection uses the default config values for the hall count; M3 replaces the `?hall=N` default with hall assignment. The SelfAvatar has no ritual animations yet (M4).

Next: M3 (halls: directory, assignment, Change hall).

---

## 16. M3 status (2026-11-01)

| Task | Status |
|---|---|
| M3-1 Hall directory | Done: reports with timestamps (older ones ignored), counts that drop a hall after three silent heartbeats, small RPC returning `{ hall, count }` pairs. |
| M3-2 Throttled reports and heartbeat | Done: at most one report per `hall.reportIntervalSec` with a trailing report, heartbeat from the alarm while occupied, immediate report when a hall is full or refuses someone. |
| M3-3 `GET /api/halls` | Done: halls with people plus the first empty one, `suggestedHall` (spread over the first three halls with space), `no-store`, CORS for allowed origins, 503 when the directory is down. |
| M3-4 Refusal hints | Done: `hall_full` with `nextHall`, `all_halls_full` with `nextHall: null`, both closing with 4001. |
| M3-5 Join flow | Done: link hall, then the tab's last hall, then the suggestion; follows hints without repeating a hall; falls back to hall order; shows "all halls full" without connecting when nothing has space. |
| M3-6 UI | Built: placed-in-another-hall message, all-halls-full and hall-full screens with Try again, Change hall list, Invite a friend. **Not yet checked visually** (the browser pane was hidden). |

Tests: 226 in total (shared 73, room-logic 38, web 82, worker 33). The worker tests now include the directory (throttle, trailing report, stale hall, heartbeat), the halls API, refusal hints, the case where every hall is full, and a 160-visitor burst that places everyone without overfilling any hall. The burst test first failed (2 of 160 stranded): refused visitors bounced between full halls because the directory learned a hall was full a second late. Reporting at once when full or refusing, and never retrying a tried hall, fixed it; four further runs were clean.

Known limits: the directory is in memory, so after it restarts every hall looks empty until it next reports (up to one heartbeat), and visitors may be sent to a full hall and follow a hint. `GET /api/halls` has no rate limit yet (M8). Hall names are plain "Hall N" (open question O-8).

Next: M4 (rituals: greet, bow with cushions, lamp, and the activity toasts).

---

## 17. M4 status (2026-11-01)

| Task | Status |
|---|---|
| M4-1 Ritual registry | Done: definitions in `packages/shared` (`RITUALS`), the temple's manifest chooses which are offered; cooldown per person, unknown or unoffered rituals refused. |
| M4-2 Seats | Done: `RitualEngine` hands out the nearest free cushion, reserves it, starts the bow on arrival and puts the person on the cushion, frees it when stopped, finished, walked away from, abandoned or when the person leaves. |
| M4-3 Lamps | Done: first free lamp place, one lit lamp per person, expiry after `lamp.durationSec`, kept in storage so lamps survive hibernation. |
| M4-4 Scheduler | Done as `DueQueue` plus exact timers for short events and the alarm for long ones (ADR-021). Chanting joins it in M5. |
| M4-5 Client | Built: keys 3, 1/E/Space, 2, L; ritual buttons and a Stop button; walking to the cushion; walking by hand cancels a bow; placeholder animations (lean, bob, pulse); lamps glow when lit. |
| M4-6 Toasts | Built: toasts for other people's rituals with `aria-live`, at most `ui.maxToasts`, gone after `ui.toastSeconds`. |

Also done: `TempleRoom` was split (connection state, directory reporter, ritual wiring) to stay under the file-size limit.

Tests: 299 in total (shared 80, room-logic 64, web 106, worker 49). The ritual tests run in the Workers runtime and cover greet, cooldown, bow (reserve, arrive, walk away, stop, leave, timeout, all cushions taken, hibernation), lamps (light, one per person, rack full, expiry after eviction, owner leaves) and bad requests. They were flaky at first because of the tests, not the code (a walk timeout applies to everyone still walking; an eviction waits for pending timers); fixed, then six clean runs. A scripted greet, bow and lamp against the real running servers also behaved correctly.

Not checked visually: the browser pane was hidden, so the buttons, toasts, bow animation, lamp glow and cushion snapping have not been seen on screen. Logic behind them is tested (poses, state, toasts, labels).

Known limits: the animations are placeholders; sounds for bell and lamp arrive with M5; the meditation timer (`sit`/`stand`) is M6.

Next: M5 (audio, the chanting schedule and the special-day banner).

### Camera change (2026-11-01, during M4)

The hall appeared in the upper part of the screen after entering, because the camera followed the avatar's spawn at the entrance (measured: the middle of the hall sat at +0.49 of the screen height with the top cut off, and a phone showed about a third of the width). On the user's suggestion the orbiting camera was replaced with one fixed view (ADR-024): `frameHall` finds the closest camera position that fits the whole hall inside 92% of the screen, looking at a point 1 m above the middle of the floor. A test checks that the whole hall fits, and is centred top to bottom within 0.1 of the screen, on wide, laptop, square and tall screens. Orbit and zoom and the camera follow were removed; M7-1 no longer needs "pinch to zoom". Not yet seen on screen (the browser pane is hidden).

### Framing and lamp places (2026-11-01, after the first screenshot)

The first fixed view ran the hall's near edge under the buttons and looked steep. Changes: the camera now looks down at 24 degrees (was about 33) with a narrower lens (38 degrees, was 50), so the walls slope in less and the hall reads as a wide flat room; the blockout walls are 3.5 m tall (was 5), which let the hall fill more of the width; and `frameHall` keeps the hall clear of a reserved strip for the buttons (66 px, or 150 px on a phone) and the text (24 px), centring it in what is left. Measured with a test helper: on a 1440 x 800 screen the hall spans 43 to 1397 px across and has 100 px free below it; on a 1000 x 520 screen it spans 83 to 917 px with 82 px free below; on a 390 x 780 phone it spans the full width. The view has not been checked on screen again.

On the user's request the eight lamp places moved from a rack along the right wall to a shelf on each side of the altar (four each), filled left, right, left, right. The lamp ids are unchanged, so nothing else depends on the old positions.

### Prayer beads removed (2026-11-01)

On the user's request the prayer-beads ritual (key 2) was removed: its definition, animation, button, toast text, sound file entry (`audio.sfx.beads`) and tests are gone, and the manifest offers `greet`, `bow` and `lamp`. Key 2 now does nothing. The spec, intent and plan were updated to match. Adding it back later means a definition in `RITUALS`, an id in `RITUAL_IDS`, a pose, two texts and a manifest entry.
