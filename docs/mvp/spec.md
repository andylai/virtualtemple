# Virtual Temple (Malaysia) — Phase 1 Technical Spec

Status: draft, derived from [intent.md](intent.md)
Last updated: 2026-11-01

Scope of this document: what to build for Phase 1 (one flagship temple). Section 13 lists what Phase 1 must prepare for the later multi-temple phase, but nothing from that phase is built here.

Wording: "must" is a requirement, "should" is a strong default, and "proposed default" is a number to tune after load testing. Every proposed default lives in configuration (section 4.3), not in code.

Terminology: visitors only ever see the words "hall" and "people". A hall is one live copy of the temple hall, with its own people, cushions and lamps. In code, one hall is one `TempleRoom` Durable Object. The words "room", "instance" and "server" are internal and never appear in user-facing text.

---

## 1. Goals and non-goals

### 1.1 Goals
- Anonymous visitors enter a shared 3D dharma hall with no login.
- Visitors see each other move and perform two rituals (greet with palms together, and bow), plus lighting a lamp.
- The server runs scheduled communal chanting at fixed Malaysia time (MYT) and special-day banners.
- Works on desktop and mobile browsers, and runs fully on a developer machine.
- The flagship temple is configuration (a manifest), not hard-coded, so Phase 2 can add temples without a rewrite.

### 1.2 Non-goals (Phase 1)
- Accounts, profiles, or any stored visitor data.
- Free-text chat or free-text blessings (would need moderation).
- Visit counter, analytics dashboards, moderation tooling (all need a database).
- Donation integration (see open question O-3).
- Temple uploads and multi-temple onboarding (intent.md section 11).
- Multi-region hall sharding.

---

## 2. Users and scenarios

| ID | Scenario | Outcome |
|---|---|---|
| S-1 | A visitor opens the link | Sees a loading screen, presses "Enter", and appears in the hall with a generated nickname. |
| S-2 | A visitor walks and does a ritual | Others see the avatar move and the ritual animation; a toast appears for them. |
| S-3 | It is 05:00 or 18:00 MYT | Everyone in the hall hears the chanting together. A joiner mid-chant starts at the correct position. |
| S-4 | It is a special day | A banner shows and an extra chanting slot runs. |
| S-5 | A visitor wants to meditate alone | Starts a timer, sits, and hears a bell at the end. |
| S-6 | A visitor invites a friend | Copies the invite link; the friend lands in the same hall. |
| S-7 | The hall is full | The visitor is placed in the next hall with space and sees a short message saying so. |
| S-8 | A visitor returns | Their nickname and audio settings are remembered in the browser. |
| S-9 | A visitor opens the plain link | The system places them in the first hall that has space. They never have to choose. |
| S-10 | A visitor wants a quieter or busier hall | Opens "Change hall", sees how many people are in each, and picks one. |

---

## 3. Functional requirements

FR numbers are stable IDs, not a running order. Requirements added after the first draft use numbers from FR-40.

### 3.1 Entry and identity
- FR-1: No login. The visitor presses "Enter" to start (also unlocks browser audio).
- FR-2: The server assigns a nickname built from two word IDs (an adjective and a noun) from the manifest's word lists. The client never sends free text as a nickname.
- FR-3: "Remember me": the browser keeps the visitor's nickname (the two word ids), the three volumes, the background-play and reduce-motion choices and the chosen language in `localStorage` under one key. Nothing else is stored, and no server stores anything. On a later visit the nickname is sent in `join`, and the server keeps it if both words exist and nobody has it. Whatever is read back is checked field by field and a bad or missing field falls back to its default, so edited or old data cannot cause harm; where storage is blocked (private windows) the page works as if nothing were remembered.
- FR-4: A "Leave" button closes the visitor's connection, silences the sound and shows a gentle exit screen ("Did you rest well?") with a "Stay again" button that joins a hall again. (A browser tab that is simply closed cannot show a screen.)
- FR-40: Reconnection. If the connection drops, the client reconnects automatically with a short back-off. The `welcome` message carries an opaque `resumeToken` (random, no personal data). A reconnect that presents the token within `hall.reconnectGraceSec` restores the same player, nickname and cushion. The grace period does not reserve a place in a full hall: if the hall is full on return, FR-7 applies. After the grace period the player is removed, and a later reconnect joins as a new player.
- FR-41: Idle handling. While the page is visible (including during the meditation timer) the client sends a `ping` every `net.pingSec`. A connection that has sent nothing for `hall.idleKickSec` has its cushion released and is closed with the `idle_timeout` code. The client then shows "You were away. Press Enter to return."

### 3.2 Halls
Visitors see halls named "Hall 1", "Hall 2" and so on, with a count of people. The names come from the translation files. All halls look the same and run the same chanting schedule.

- FR-5: Getting into a hall.
  - The plain link (no parameter) places the visitor in the first hall that is not full ("fill-first", so halls stay lively instead of many looking empty).
  - A link with a hall number, such as `?hall=2`, goes to that hall. `hall` is a whole number from 1 to `hall.count`, matching the "Hall 2" label.
  - Internally the Worker maps the hall to one Durable Object (section 5).
- FR-6: Each hall holds at most `hall.maxPlayers` people (proposed default 50). The hall itself makes the final decision on every join, so two visitors can never take the last place. The capacity check and the adding of the player happen in one synchronous step with no `await` between them, because a Durable Object can interleave other work at an `await`. The count is of admitted connections, meaning those that already passed this check, and not of merely open connections. Counting open connections would refuse everyone when many arrive at once, because each joiner would see all the others. It also comes from the live connections, not from a separate counter that could drift (confirmed by the simultaneous-joins test, spikes.md S7).
- FR-7: When the chosen hall is full, the client does not show an error. It joins the next hall with space (up to `hall.joinRetries` tries) and shows a short message such as "Hall 2 was full, so we placed you in Hall 3." If every hall is full, it shows "All halls are full right now. Please try again in a few minutes." with a "Try again" button. The refusal names the hall that most likely has space (`nextHall`), or says that none has (`all_halls_full`). A visitor never tries the same hall twice, and when a hint points at a hall already tried, the halls are tried in order.
- FR-8: "Change hall" is always available in the menu. It lists the halls that have people, plus the next empty one, for example "Hall 1 · 32 people", "Hall 2 · Full", "Hall 3 · 4 people". Picking one leaves the current hall and joins the new one. The nickname is kept if it is free, and any held cushion is released. Counts may be a few seconds old.
- FR-9: A live counter shows the number of people in the current hall, for example "18 people here".
- FR-10: "Invite a friend" copies a link to the current hall. If that hall is full when the friend opens it, FR-7 applies.

### 3.3 Movement
- FR-11: Click or tap to walk to a point; WASD and arrow keys on desktop (up and W walk towards the altar). The camera is fixed: one view that shows the whole hall, centred, and the visitor cannot rotate or zoom it. On a tall phone screen the camera sits further back so the whole hall still fits, and the view is fitted again when the screen shape changes. (Decision 2026-11-01; Sansa lets visitors orbit, but a fixed view keeps the hall always centred, avoids a tap being mistaken for a drag on phones, and means art only has to be made for one side.)
- FR-12: Movement is clamped to a walkable area defined in the hall template. The server rejects positions outside it.
- FR-13: The client sends its own position at a limited rate (`net.positionSendHz`, proposed default 8) and only when it has changed.
- FR-14: The server broadcasts a batched snapshot of all moved players at `net.snapshotHz` (proposed default 8).
- FR-15: The client smooths other players' movement by interpolating between snapshots, so slow network updates look continuous.

### 3.4 Rituals
Rituals are config entries in the manifest (id, key binding, animation, sound, duration, optional seat requirement). Phase 1 ships these three (prayer beads, which Sansa has, was dropped on 2026-11-01):

| Ritual id | Key | Behaviour |
|---|---|---|
| `greet` | 3 | Palms-together greeting animation at the current spot. |
| `bow` | 1, E, Space | Needs a free cushion. The server reserves the nearest free one and answers `ritual_walk`; the client auto-walks there; the bow begins when the visitor is within 0.6 m of it, and they are put exactly on the cushion. A "stop" button cancels (also any walking by hand). |
| `lamp` | L | Lights a lamp on the first free lamp place for `lamp.durationSec` (proposed default 300). The lamp places stand on a shelf on each side of the altar and are filled left, right, left, right, so the first lamps look balanced. Visible to everyone. |

- Naming: ritual ids (`greet`, `bow`, `lamp`) are neutral identifiers. The name a visitor sees, for example 合掌 (*hézhǎng*) or "palms together", comes from the translation files, so each language and tradition can use its own word.
- FR-16: A ritual request names a ritual id. The server accepts it only if the id is in the manifest. A request inside `ritual.cooldownMs` of the person's last start is ignored without an error. Starting a ritual ends the one before it, but a request that cannot be met (no cushion, lamp limit) changes nothing. The definitions (keys, duration, animation) are in code (`RITUALS` in `packages/shared`); the manifest chooses which a temple offers.
- FR-17: Cushion and lamp slots are server-authoritative, so two players are never given the same slot. If none is free, the server replies `no_slot_free` and the client shows a short message. A person who is refused is not counted as misbehaving: refusals for no free place or the lamp limit (`lamp_limit`, one lit lamp per person) are plain answers. A lamp is lit on the first free lamp place, stays lit for `lamp.durationSec` even if its owner leaves, and survives the hall being evicted from memory (it is kept in storage).
- FR-18: A ritual in progress ends on completion, on a stop request, when the person leaves, or, for a bow, when they get more than 1.2 m from their cushion. A person who never reaches their cushion gives it up after `ritual.walkTimeoutSec` (proposed 20 s); nobody is told, because nothing was shown.
- FR-19: Other players see the ritual animation on the performing avatar.

### 3.5 Activity toasts
- FR-20: When a player starts a ritual, other players see a toast with the performer's nickname and the ritual name, in the viewer's language.
- FR-21: Toasts are shown for `ui.toastSeconds` (proposed default 4) and then removed. The visible queue is capped at `ui.maxToasts` (proposed default 3); older ones are dropped. Nothing is stored.
- FR-22: Toasts use an `aria-live` region so screen readers announce them.

### 3.6 Audio
- FR-23: Three independent layers with their own volume sliders: ambient, chanting, and sound effects (bell, lamp).
- FR-24: Personal chanting can be played by the visitor between communal sessions. When a communal session starts, personal chanting stops and the shared chanting plays.
- FR-25: A "keep playing in background" toggle (off by default, to spare batteries) controls whether audio continues when the tab is hidden (best effort on mobile, which may still pause it). When sound was paused and comes back, the communal chanting is restarted at the right place for the time that passed.
- FR-26: Audio starts only after the visitor presses "Enter", to satisfy browser autoplay rules. The ambient layer starts then.
- FR-43: Placeholder sounds. Until real recordings exist, every sound is made in code (wind, a chant-like hum, a bell, a lamp chime). The manifest's audio paths name the real recordings; a recording that cannot be loaded (missing, or a page where the file should be) is replaced by its placeholder. A bell rings as the visitor's own bow begins and when a communal session begins on time; a chime rings when the visitor lights a lamp. Other people's rituals are seen, not heard.
- FR-44: The "Settings" button opens a panel with the three volume sliders and a button to play or stop the visitor's own chanting (which pauses while a communal session plays), plus the settings of FR-36.

### 3.7 Communal chanting

Launch scope: the flagship has no regular or special-day chanting slots. Settings omit the chanting volume slider, and the ritual dock still offers text for personal recitation.
- FR-27: The room reads the schedule (times plus time zone) from the manifest. When a session comes within `audio.preloadLeadSec` of starting (proposed 120 s), the server broadcasts `chanting_start` with the absolute start time in UTC milliseconds, the duration and the recording's id, and `chanting_end` when it is over. Announcing early is what lets browsers download the recording first (FR-42). The same session announced again changes nothing. The schedule is worked out from the clock on the temple's time zone, using the platform's own time zone support and no library, so nothing is stored and a hall that was unloaded from memory picks it up again. The session length is `audio.chantingDurationSec` in the manifest (the length of the recording; 300 s for the placeholder). Announcements go out from the alarm, so they can be up to `hall.sweepSec` late, which is harmless because the start time is absolute.
- FR-28: Audio is not streamed. Each client plays its own copy of the chanting file, offset by `now - startAt`.
- FR-29: A player who joins during a session, or within the lead time of one, receives it as `chanting` in the welcome message and starts at the right position. A recording shorter than the session repeats, and everyone is at the same place in it.
- FR-30: The client estimates the clock difference with the server from the welcome message's `serverTimeMs` and uses it for FR-28. An offset of under ~200 ms is acceptable.
- FR-42: Preloading. The client starts downloading the chanting audio `audio.preloadLeadSec` before a scheduled session, and on join when a session is active. If the file is not ready at `startAtMs`, the client starts playing from the correct offset as soon as it is ready, and never delays other listeners.

### 3.8 Special-day banner
Behaviour is described in intent.md section 3 ("Special-day banner"). Requirements:
- FR-31: The manifest contains `specialDays` entries (date, name, optional `extraChanting` times).
- FR-32: On join, the server compares today's date in MYT with the list and, on a match, includes `specialDay` in the welcome message. The client shows the banner from that message and never from its own clock.
- FR-33: For a special day, the room schedules the extra chanting times in addition to the regular ones.

### 3.9 Meditation timer
- FR-34: The visitor picks a duration from `meditation.options` (proposed 5, 10, 15 minutes), then sits on a cushion. The clock starts when they are on the cushion and is measured with timestamps, so a tab in the background still ends on time. A bell rings at the end and the visitor is stood up. The bell is booked on the audio clock when the timer starts, which is not slowed down in a background tab; while the tab is hidden and background play is off, the audio keeps running only for the bell (the ambient and chanting layers are silent). The tab's title shows the time left. Browsers that stop all audio in the background (some phones) may ring it only when the visitor returns; there is no system notification. A request that is refused (no cushion) or never turns into walking is dropped.
- FR-35: The timer runs in the browser only. Seating uses the ritual `sit` (not a button or a key): `ritual_start` with `sit` reserves the nearest free cushion exactly as `bow` does, and `ritual_stop` releases it. The hall holds a sitting for up to 20 minutes, more than the longest timer, and ends it when the person walks more than 1.2 m from the cushion or leaves. Others see the person sit and get a toast. (This replaces the separate `sit` and `stand` messages of the first draft.)

### 3.10 Settings and UI
- FR-36: A settings panel has the three volume sliders, the background-play toggle, a language selector (shown only when more than one language has translations), and "reduce motion" (which follows the device's setting until the visitor chooses; when on, avatars do not lean, bob or pulse). It also has a button to forget everything the browser remembers.
- FR-37: Credits for third-party assets are shown in an "About" panel, from the manifest's `credits` list (title, author, licence and an optional secure link). The panel also says what is stored in the browser. With no credits it says no third-party work is used yet.
- FR-38: The layout works at phone width, with touch controls and on-screen ritual buttons. The buttons form one bottom area that wraps onto more rows as the screen narrows, and the camera keeps the hall clear of that area's measured height. Tapping the floor walks; a drag does not scroll or zoom the page. Buttons are at least 44 px high and the layout respects the device's safe areas.
- FR-45: Accessibility. Panels are dialogs: focus moves into them, Tab stays inside, Escape or a tap outside closes them, and focus returns to the button that opened them. Space and Enter press a focused button instead of starting a ritual, and arrow keys on a slider do not walk the avatar. Messages about the visitor's own actions are announced; the people count is not (it changes too often). A text description of the hall and the controls (in the About panel) are available to screen readers.
- FR-46: Error and empty states. A crash shows a message with a reload button instead of a blank screen. An offline device and an interrupted 3D picture each show a short message. A model or picture that cannot be loaded is replaced by the placeholder, and a missing sound by the generated one, so a bad asset never breaks the hall.

### 3.11 Languages
- FR-39: All user-facing text comes from translation files. English is the first language; Malay and Chinese are added by supplying files, with no code changes. A language reaches visitors only when it has a catalog and the manifest lists it in `languages`, so a draft can sit in the repository unseen. The languages for launch are open question O-1.

---

## 4. Architecture

```
Browser
  1. -> Pages     (static app files)
  2. -> Worker    (WebSocket upgrade, room routing)
              3. -> Durable Object + PartyServer   (the live room)
Optional: R2 (large assets), D1/KV (later phases)
```

Details and rationale: intent.md section 4. The browser contacts Pages and the Worker separately; Pages does not call the Worker.

### 4.1 Components

| Component | Responsibility |
|---|---|
| Frontend (`apps/web`) | 3D scene, input, UI, audio, WebSocket client, interpolation. |
| Worker (`apps/worker`) | Validates the request, maps `hall` to a Durable Object, forwards the WebSocket, serves `GET /api/halls` (people per hall and the suggested hall) from the hall directory, takes `POST /api/report` (problems seen by browsers, section 8.5), applies per-address limits, and in the deployed environments also serves the built web app so that the page, sockets and API share one address. |
| Hall directory (`HallDirectory`, one Durable Object per temple) | Keeps the latest people count of each hall so the Worker can answer "which hall has space" without waking every hall (section 5.5). |
| Room (`TempleRoom`, PartyServer on a Durable Object) | Player list, positions, seats, lamps, schedule, broadcast. |
| Shared package (`packages/shared`) | Message types, validation schemas, manifest types, constants. |
| Room logic module | Plain TypeScript with no Cloudflare calls, so it is unit-testable. A thin adapter connects it to PartyServer. |

### 4.2 Technology
- Language: TypeScript, strict mode, on both sides.
- Frontend: Vite, Three.js (React Three Fiber if React is chosen, see O-6), a small state store, `partysocket` for the connection.
- Backend: Cloudflare Workers, Durable Objects, PartyServer, deployed to our own Cloudflare account. The hosted PartyKit platform is not used (it shut down on 2026-10-23).
- Local development: `wrangler dev` for the Worker and Durable Objects, Vite dev server for the frontend.

### 4.3 Configuration (no magic numbers)
All tunable values are in one config module, with environment overrides, and no value is hard-coded in logic.

| Key | Proposed default | Meaning |
|---|---|---|
| `hall.count` | 20 | Halls the temple offers. Empty halls cost nothing. |
| `hall.maxPlayers` | 50 | People per hall |
| `hall.joinRetries` | 5 | Halls tried automatically when one is full (raised for busy days) |
| `hall.reportIntervalSec` | 3 | Minimum gap between a hall's count reports to the directory |
| `hall.heartbeatSec` | 30 | An occupied hall repeats its report this often |
| `hall.suggestSpread` | 3 | The suggested hall is picked at random among this many halls with space (1 = strict fill-first) |
| `hall.idleKickSec` | 900 | A silent connection is closed after this long |
| `hall.reconnectGraceSec` | 60 | How long a dropped player's place is kept for a reconnect |
| `hall.joinTimeoutSec` | 10 | A connection that has not sent `join` is closed after this long |
| `hall.sweepSec` | 30 | How often the hall checks for idle connections and expired reconnect places while anyone is connected |
| `net.positionSendHz` | 8 | Client position updates per second |
| `net.snapshotHz` | 8 | Server snapshots per second |
| `net.maxMessageBytes` | 1024 | Largest accepted client message |
| `net.maxMessagesPerSecond` | 20 | Per-connection rate limit |
| `net.pingSec` | 30 | How often a visible page sends `ping` |
| `net.maxInvalidMessages` | 5 | Invalid, refused or too-frequent messages tolerated (within a minute) before the connection is closed |
| `ritual.cooldownMs` | 1500 | Minimum time between ritual requests |
| `ritual.walkTimeoutSec` | 20 | How long a cushion stays reserved for someone who has not reached it |
| `lamp.durationSec` | 300 | How long a lit lamp stays |
| `lamp.maxPerPlayer` | 1 | Lamps one player may keep lit |
| `ui.toastSeconds` | 4 | Toast lifetime |
| `ui.maxToasts` | 3 | Visible toasts |
| `meditation.options` | [5, 10, 15] | Minutes |
| `audio.defaultVolumes` | ambient 0.35, chanting 0.26, sfx 0.35 | Initial volumes |
| `audio.preloadLeadSec` | 120 | How early the chanting file starts downloading |

These numbers are starting points taken from the reference site's observed behaviour or chosen for the first test. Tune them after load testing.

---

## 5. Room model

### 5.1 Room identity
- Durable Object name: `temple:{slug}:{hall}`, where `hall` is the hall number. In Phase 1, `slug` is the flagship temple. Names must be URL-safe exactly as written, because PartyServer does not decode the path segment (spikes.md S3); slugs are lowercase letters, digits and hyphens. This keeps Phase 2 additive. The hall directory is `temple:{slug}:directory`.
- The Worker creates each room with an Asia-Pacific location hint, so the first visitor's location does not decide placement. Placement details: intent.md section 5.

### 5.2 State
Per room, held in memory and restorable after a wake-up:
- Players: id, nickname word IDs, avatar id, position, facing, current ritual, joined-at.
- Seats: cushion id → player id.
- Lamps: slot id → owner id, expires-at.
- Active chanting session: start time, duration, audio id.

Durable Objects can be evicted when idle, and with WebSocket hibernation they can be woken by a message while connections stay open. Requirement: the room must rebuild what it needs after a wake-up, for example from per-connection WebSocket attachments (or storage for the schedule). Losing a seat or lamp when the last player leaves is acceptable; losing the player list while players are still connected is not. Per-connection attachments are limited to 16 KiB; per-player state stays well under 1 KB, and anything larger goes in storage (spikes.md S2).

### 5.3 Scheduling
A Durable Object has one `alarm()`. The room keeps an ordered list of due events (ritual ends, walk timeouts, lamp expiries, and from M5 the chanting) in a `DueQueue`. Events due within about 8 seconds get an exact timer, so a greeting ends on time; later ones wait for the alarm, which comes at least every `hall.sweepSec` while anyone is connected, so they can be up to that late. The reason is that a pending timer keeps the hall awake and unable to hibernate. After the hall is evicted and rebuilt, the queue is rebuilt from the people's saved ritual state and the lamps in storage. All schedule times are computed from the manifest's time zone.

### 5.4 Broadcast
Position updates are collected and sent as one snapshot per tick, not one message per move. Ritual start/end, joins and leaves are sent immediately.

### 5.5 Hall assignment and counts
- **Directory:** each hall reports its people count to the hall directory whenever the count changes, at most once every `hall.reportIntervalSec`; a change inside the interval is reported at its end, so the last change is never left out. A hall that becomes full, or refuses someone, reports at once, so the next visitor is not sent to it. An occupied hall also repeats its report every `hall.heartbeatSec`, so a restarted directory recovers by itself. The directory treats a report older than three heartbeats as a hall that is gone. The Worker reads the directory, so it never wakes empty halls just to count them.
- **Flow for a visitor:**
  1. If the link names a hall, the client goes there. Otherwise, if this tab was in a hall before (its saved token names one), it goes back to that hall. Otherwise the client calls `GET /api/halls`, which answers `{ halls, suggestedHall, hallCount, maxPlayers }`: `halls` lists the halls with people plus the first empty one, each as `{ hall, count, full }`, and `suggestedHall` is one of the first `hall.suggestSpread` halls with space, chosen at random, so a burst of visitors does not all pick the same hall (null when every hall is full).
  2. The client opens the WebSocket to that hall and sends `join`.
  3. The hall makes the final check. If it is full, it tells the directory first, then replies with `error` `hall_full` and `nextHall` (or `all_halls_full` when no hall has space), and closes with code 4001.
  4. The client follows `nextHall` to a hall it has not tried, up to `hall.joinRetries` halls in all, and shows "Hall 2 was full, so we placed you in Hall 3."
  5. If `suggestedHall` is null or the hall says `all_halls_full`, the client shows the "all halls are full" message and does not connect.
- **Stale counts are fine,** because step 3 is authoritative. A stale count can only cause extra retries, never an overfull hall.
- **Directory unavailable:** `GET /api/halls` answers 503 (or does not answer within three seconds) and the client tries hall 1, then halls in order, up to `hall.joinRetries`. A refusal without a `nextHall` is handled the same way.
- **"Change hall"** fetches the same list and shows each hall as "Hall 2 · 18 people", "empty", "full" or "you are here"; full halls and the current hall cannot be picked. Moving drops the saved token (it belongs to the old hall) and keeps the nickname if it is free.
- `GET /api/halls` answers with `Cache-Control: no-store` and allows reading from the allowed origins only.
- The directory stores only a small table of numbers and needs no persistent storage.

### 5.6 Connections and admission
- A connection is open as soon as the WebSocket connects, but nobody is admitted until a valid `join` message is processed. Until then the connection is `pending`: it receives nothing about the hall, and it is closed after `hall.joinTimeoutSec`.
- Admission, the capacity check and storing the person in the connection's saved state are one synchronous step (FR-6). Reading a reconnect token from storage happens before that step.
- A person who drops is removed from the hall at once, so others see them leave. Their place is kept in storage under their resume token for `hall.reconnectGraceSec`; a reconnect with the token puts them back as the same person (new token issued each time, each token usable once). A hall that is full on return refuses them like anyone else.
- If a person reconnects before the hall has noticed their old connection closing, the old connection is closed with code 4005 and the person is taken over.
- Movement is sent in snapshots. A snapshot timer starts only when someone has moved, so a quiet hall can hibernate. Saved positions of moved people are written to their connections at each snapshot, so a person who stands still keeps their place after hibernation.
- One alarm per hall runs every `hall.sweepSec` while anyone is connected or waiting to reconnect, to close idle and join-timed-out connections and delete expired reconnect places. Logs carry `temple_id`, `hall_id` and `correlation_id`; the Worker creates the correlation id and passes it in the `x-correlation-id` header.

---

## 6. Protocol

JSON messages over one WebSocket. Every message has a `type`. Types and validation schemas live in `packages/shared`.

### 6.1 Client → server

| Type | Payload | Notes |
|---|---|---|
| `join` | `{ nickname?: { adjectiveId, nounId }, lang, resumeToken? }` | Sent once after connect. `resumeToken` is sent only when reconnecting (FR-40). |
| `move` | `{ x, z, facing }` | Rate limited; position must be inside the walkable area. |
| `ritual_start` | `{ ritualId }` | `ritualId` must be in the manifest. |
| `ritual_stop` | `{}` | Cancels the current ritual, or the walk to a cushion, and releases the cushion. |
| `ping` | `{}` | Sent every `net.pingSec` while the page is visible (FR-41). |

### 6.2 Server → client

| Type | Payload |
|---|---|
| `welcome` | `{ playerId, resumeToken, hall, nickname, avatarId, players[], lamps[], population, serverTimeMs, positionSendHz, pingSec, chanting?, specialDay? }` |
| `player_joined` / `player_left` | `{ player }` / `{ playerId }` |
| `snapshot` | `{ tick, moves: [{ playerId, x, z, facing }] }` |
| `ritual_started` | `{ playerId, ritualId, slotId? }`: the ritual is being performed now (for a bow, on arrival, with the cushion) |
| `ritual_walk` | `{ slotId, x, z, facing }`, only to the person who asked to bow |
| `ritual_ended` | `{ playerId }` |
| `lamp_lit` / `lamp_out` | `{ slotId, ownerId }` / `{ slotId }` |
| `population` | `{ count }` |
| `chanting_start` | `{ startAtMs, durationMs, audioId }`: a session is on or starts at `startAtMs`; sent early (FR-27) |
| `chanting_end` | `{}` |
| `error` | `{ code, nextHall? }` (`nextHall` only with `hall_full` and `all_halls_full`) with codes `hall_full`, `all_halls_full`, `invalid_message`, `rate_limited`, `no_slot_free`, `lamp_limit`, `not_allowed`, `idle_timeout` |

### 6.3 Validation rules
- Parse and validate every incoming message against its schema before using it. Unknown types, extra fields that change meaning, wrong types and oversize messages are rejected with `invalid_message`.
- All enum-like fields (`ritualId`, word IDs, `lang`) are checked against the manifest's allowed values before any write.
- Numbers are range-checked (position inside the walkable area; no NaN or infinity).
- Invalid, refused or too-frequent messages each count as a strike. After `net.maxInvalidMessages` strikes within a minute the server closes the connection.

Close codes the server uses (4000–4999 is the range reserved for applications):

| Code | Meaning | Browser reaction |
|---|---|---|
| 4001 | Hall is full | Show the full message; do not reconnect by itself |
| 4002 | Too many invalid messages | Show "disconnected"; do not reconnect by itself |
| 4003 | Idle too long | Show "You were away"; forget the saved token |
| 4004 | Never sent `join` in time | Show "disconnected" |
| 4005 | Replaced by a newer connection of the same person | Show "opened in another tab"; forget the saved token |
| anything else | Network drop | Reconnect with back-off (FR-40) |

---

## 7. Temple manifest (Phase 1)

One manifest ships with the app. The room, Worker and frontend read it through a typed loader.

```json
{
  "slug": "flagship",
  "name": { "en": "..." },
  "tradition": "TBD",
  "languages": ["en"],
  "timezone": "Asia/Kuala_Lumpur",
  "chantingSchedule": ["05:00", "18:00"],
  "specialDays": [
    { "date": "2027-05-20", "name": "Wesak Day", "extraChanting": ["09:00"] }
  ],
  "hall": {
    "template": "hall-classic",
    "walkableArea": "...",
    "cushions": ["..."],
    "lampSlots": ["..."],
    "slots": { "hallModel": null, "altarBackdrop": "...", "banner": "...", "plaque": "...", "statue": "..." }
  },
  "avatar": { "model": null },
  "audio": { "ambient": "...", "chanting": "...", "chantingDurationSec": 300, "sfx": { "bell": "...", "lamp": "..." } },
  "rituals": ["greet", "bow", "lamp", "sit"],
  "nicknames": { "adjectives": ["..."], "nouns": ["..."] },
  "credits": [],
  "donation": null
}
```

- Coordinates are in metres on the hall floor: `x` runs left to right and the altar is at the smaller-`z` end. `facing` is in degrees, with 0 facing the altar. The walkable area is a polygon; every cushion must lie inside it. Slots set to `null` use the blockout placeholder.
- Dates and values in the examples above are illustrative placeholders and have not been verified. Real special-day dates come from an official calendar and are checked by the religious advisor before launch.
- The manifest is validated at build time against a schema; an invalid manifest fails the build.
- Asset URLs are relative to an asset base URL from configuration (`VITE_ASSET_BASE_URL`: a path on this site or an `https://` address; anything else is ignored), so assets can move from `public/` to R2 without code changes.
- File types are checked by the schema: models (`hallModel`, `statue`, `avatar.model`) are `.glb`; pictures (`altarBackdrop`, `banner`, `plaque`) are `.webp`, `.png`, `.jpg` or `.ktx2`; sounds are `.opus`, `.ogg`, `.mp3` or `.m4a`.
- Authoring conventions for models: metres, Y up, the front facing +Z (glTF's own rule; the app turns people to face the altar). The hall model uses the manifest's coordinates with no offset. A statue's origin is the middle of its base and it is placed on the altar; the statue slot is used only while `hallModel` is null. A person's origin is at their feet. Draco mesh compression and KTX2 textures are supported, and their decoders are served from the app's own address. Pictures hang on the back wall at positions set in `hallLayout.ts`, which the real art will tune.

---

## 8. Non-functional requirements

### 8.1 Performance targets (proposed, verify on real devices)
- First interactive scene on a mid-range phone on 4G: within about 10 seconds, with a loading screen and progress.
- Hall model plus textures: kept within a download budget set once the art exists (target: low single-digit MB, using Draco mesh compression and KTX2 textures). Audio in Opus.
- Steady frame rate of 30 fps or better on mid-range phones; the pixel ratio is capped and shadows are limited.
- Server: one hall supports `hall.maxPlayers` with the default rates; confirm in the load test (section 11).

### 8.2 Latency
- Position and ritual events across regions are acceptable at roughly 100 ms extra (estimate, not measured). Interpolation hides it. Communal chanting does not depend on it (FR-28).

### 8.3 Security and abuse
- Every WebSocket connection is validated at the Worker: the `Origin` header is checked against the allowed origins from configuration, and `hall` must be a whole number from 1 to `hall.count` before a Durable Object is touched.
- Per-connection rate limits (`net.maxMessagesPerSecond`, `ritual.cooldownMs`) and a maximum message size.
- Per-address limits at the Worker on new connections, on the halls list and on problem reports (Workers Rate Limiting bindings, configured in `wrangler.jsonc` for the deployed environments only). They are generous because many mobile users share one address, and a failing limiter lets visitors through. Addresses are used as the limiter's key only and are never logged or stored.
- No user-generated text anywhere, which removes moderation and most injection risks. Nicknames are word IDs resolved on the server.
- No secrets in the client or in the repository; deploy credentials come from the environment.
- A Content-Security-Policy, sent from `apps/web/public/_headers`, allows scripts, styles, images, sound, workers and connections from the site's own address only (plus `'wasm-unsafe-eval'` for the model decoders, `blob:` for their workers, and `wss:` because some Safari versions do not treat `'self'` as covering sockets). It also sets `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and HSTS, and forbids framing. Every build checks the policy and fails on an inline script, an unsafe source, or an art address the policy does not list. The Worker's own answers carry `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- Known gap: someone with many addresses could fill every hall. See docs/mvp/operations.md for mitigations.

### 8.4 Privacy
- No accounts, no stored personal data. `localStorage` holds only nickname word IDs and audio settings.
- Logs never include IP addresses beyond what the platform records, and never include nicknames. See section 8.5.
- If any personal data is ever added, review it against Malaysia's PDPA first.

### 8.5 Observability
- Structured logs only, with `temple_id` on every entry and `hall_id` and `correlation_id` where there is a hall or a request. No `console.log` in production code paths. Logs go to the Worker's logs in the Cloudflare dashboard (open question O-9, decided in ADR-040).
- Metrics: active connections, joins, leaves, messages per second, rejected messages by reason, alarm runs, and errors. A hall that has people writes one `sweep` line every `hall.sweepSec` with its connections, population and the messages received since the last one, which gives the first, the fifth and the sixth without a line per message. The full list of events and fields is in docs/mvp/operations.md.
- The correlation ID is generated at the Worker and passed to the room.
- Browsers report problems (a crash, no WebGL, a lost 3D picture, an asset that failed, a connection that gave up) with `POST /api/report`: a body of at most 512 bytes holding a `kind` from a fixed list and an optional note of at most 200 characters, once per kind per page load. The Worker counts them by kind and browser family (for example `safari-mobile`), logs the note at warning level, and keeps nothing else about the visitor. The endpoint checks the origin, is rate limited per address, and answers 204 without a body.

### 8.6 Accessibility
- Keyboard-operable controls and visible focus.
- "Reduce motion" (also honours the system preference) lowers camera and avatar animation.
- Toasts announced via `aria-live`. Colour is never the only indicator.

### 8.7 Browser support
- Current versions of Chrome, Safari (including iOS) and Firefox, with WebGL 2. If WebGL fails to start, show a clear message.

---

## 9. Repository layout

```
/
  apps/
    web/            # frontend: src/{main,scene,ui,net,audio,store,i18n}
    worker/         # Worker + TempleRoom adapter (PartyServer)
  tools/
    load-test/      # scripted visitors for the load test
    deploy/         # checks the deploy configuration before wrangler deploy
  packages/
    shared/         # message types, schemas, manifest types, constants
    room-logic/     # plain TS room rules (no Cloudflare imports)
  manifests/
    flagship.json
  docs/
    mvp/{intent.md, spec.md}
  AGENTS.md         # ADRs (architectural decisions)
```

Limits from the project standards: no file over 800 lines and no method over 60 lines. Public and internal members get doc comments. No `*Manager`, `*Helper` or `*Util` names.

---

## 10. Local development
- One command starts the Worker (`wrangler dev`) and the frontend (Vite), with the frontend's WebSocket pointed at the local Worker.
- Two browser tabs (or a tab plus a phone on the same network) are enough to check multiplayer.
- Local runs do not reproduce placement hints, real latency or the real schedule; to test chanting, set a schedule time one or two minutes ahead through a local manifest override.

---

## 11. Testing

| Level | What | How |
|---|---|---|
| Unit | Room logic: join/leave, seat and lamp assignment, schedule ordering, special-day lookup, message validation, rate limiting | Test runner on `room-logic` and `shared`, no Cloudflare runtime needed |
| Integration | Worker + room end to end: connect, join, move, ritual, chanting broadcast, `hall_full` | Local runtime with scripted WebSocket clients |
| Client | Interpolation, i18n key coverage, settings persistence | Component and unit tests |
| Manual | Two tabs plus phone; audio on iOS Safari; chanting join mid-session | Checklist |
| Load | `hall.maxPlayers` scripted clients in one hall, then in several halls | Run against a deployed preview; record frame rates, latency and cost |

---

## 12. Milestones

1. **Skeleton:** repo layout, shared types, manifest loader, local dev command, empty scene with camera.
2. **Room core:** join/leave, population, movement snapshots, interpolation, with capsule avatars.
3. **Rituals:** greet, bow with cushions, lamp, toasts.
4. **Audio and schedule:** three layers, chanting sync, alarm scheduler, special-day banner.
5. **Extras:** meditation timer, copy link, remember me, hall assignment and "Change hall", exit screen.
6. **Polish:** mobile layout, i18n, accessibility, credits panel, real art swapped in.
7. **Hardening and launch:** load test, rate limits, CSP, observability, spend alerts, deploy.

---

## 13. Preparation for later phases (no work now beyond this)
- Scene, audio, languages and rituals come from the manifest, never from literals.
- Room names include the temple slug.
- Ritual behaviour is registered by id, so a temple's ritual set can differ.
- The hall is a template with replaceable slots.
- Logs and metrics carry `temple_id`.

---

## 14. Acceptance criteria

Phase 1 is done when all of these hold on a deployed preview:
1. Two phones and a desktop in the same room see each other move smoothly.
2. All four rituals work, never double-book a cushion or lamp slot, and produce the right toasts for others.
3. A scheduled chanting starts for everyone at the scheduled MYT time, and a late joiner hears it at the right position.
4. A configured special day shows the banner and runs the extra chanting.
5. A visitor opening the plain link lands in the first hall with space. When Hall 1 is full, the 51st visitor is placed in Hall 2 with a short message and no error.
5a. "Change hall" lists halls with people plus the next empty one, and switching keeps the nickname when it is free.
5b. When every hall is full, the visitor sees the "all halls are full" message with a "Try again" button.
5c. No user-visible text contains the words room, instance or server.
6. Meditation timer, copy link and remember me work as described.
7. Invalid, oversize and too-frequent messages are rejected and logged without crashing the room.
8. No free-text input exists anywhere, and no personal data is stored on the server.
9. The manifest drives the scene: swapping a slot image in the manifest changes the hall with no code change.
10. Load test results and the cost estimate for the target launch size are recorded.

---

## 15. Open questions

| ID | Question | Needed by |
|---|---|---|
| O-1 | Which language(s) at launch (English, Malay, Chinese)? | Milestone 6 |
| O-2 | Which tradition (Theravada or Mahayana)? This decides the statue, chanting, rituals and wording. | Milestone 1 (art brief) |
| O-3 | Donations in Phase 1 or later? Needs a legal review before any payment link. | Milestone 6 |
| O-4 | Commission original 3D assets, or start with placeholders and licensed open assets? | Milestone 1 |
| O-5 | Who is the religious advisor who signs off on rituals and wording? | Milestone 3 |
| O-6 | React Three Fiber (React) or plain Three.js for the frontend? | Milestone 1 |
| O-7 | Confirm the numbers in section 4.3 after the load test. Tool and a local run exist (docs/mvp/load-test.md); the deployed run is waiting for staging. | Milestone 8 |
| O-8 | Hall names: plain "Hall 1, Hall 2…" (proposed for Phase 1) or themed names? | Milestone 6 |
| O-9 | Where do logs and metrics go? **Decided for Phase 1: Cloudflare's own Workers logs** (ADR-040); only `Telemetry` changes if that moves. | Milestone 2 |

Decisions that change the architecture are recorded as ADRs in `AGENTS.md`.
