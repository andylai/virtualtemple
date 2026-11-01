# Virtual Temple (Malaysia) — MVP Intent

Status: analysis and architecture phase. No code written yet.
Last updated: 2026-11-01

## 1. Intent

Build an online Buddhist virtual temple for a Malaysian audience, inspired by the viral Korean site **산사 (Sansa)** — https://sansatemple.com/?room=maru-48&instance=0&region=apac.

Visitors enter anonymously, walk around a shared 3D dharma hall with other live visitors, and take part in simple devotional rituals in a calm, low-pressure space.

## 2. Reference: what Sansa does

| Area | Observed behaviour |
|---|---|
| Entry | No login. Auto-generated nickname (e.g. "편안한 나무"). Gentle exit screen ("편안히 쉬어 가셨나요") with a re-enter button. |
| World | 3D hanok dharma hall: gilt Buddha tapestry, floor cushions, chibi avatars in monk robes. |
| Multiplayer | Live shared rooms. URL params `room`, `instance`, `region` select the room, shard and region. A server-select modal shows each server's occupancy ("same hall on any server"). Live population counter. |
| Social feed | Toasts for others' actions ("포근한 안개님이 합장으로 인사했어요"). |
| Rituals | **합장** (hapjang, palms-together greeting, key 3), **절하기** (bow, keys 1/E/Space; auto-walks to a free cushion, "멈추기" to stop), **염주** (prayer beads, key 2; not in our hall, see spec 3.4). |
| Movement | Click-to-walk, WASD/arrow keys, drag to orbit, wheel to zoom. (Our hall uses one fixed camera instead; see spec FR-11.) |
| Audio | Three layers: ambient (wind/birds), chanting, SFX (bell/bead). Background-playback toggle. |
| Communal chanting | Scheduled 예불 daily 05:00 and 18:00 Korea time. Personal listening ends and everyone hears it together. |
| Donations | "공양미 보태기" modal with KakaoPay QR and Buy Me a Coffee. |
| Credits | Chanting CC BY 4.0 (공유마당); Buddha statues from National Museum of Korea 3D scans (공공누리 Type 1), re-rigged and re-textured. |
| Responsive | Full mobile layout. |

Inferred stack: Three.js (likely React Three Fiber), Vite, Cloudflare hosting/RUM, a single WebGL canvas. The realtime backend is not visible in the network log.

## 3. MVP scope

In scope:
- Anonymous entry with a generated nickname.
- One 3D hall with placeholder avatars and assets.
- Shared live rooms: movement sync, population counter, action toasts.
- Two rituals: greet (palms together) and bow. (Sansa also has prayer beads; we dropped it on 2026-11-01.) The ritual id is neutral (`greet`); the displayed name comes from each language's translation file.
- Ambient audio, chanting and SFX, with volume controls.
- Scheduled communal chanting at fixed Malaysia time (MYT) slots, started by the server.
- Hall assignment: the plain link places the visitor in the first hall with space, so they never have to choose. A "Change hall" list shows each hall's people count. A link with `?hall=N` goes to that hall, and a full hall overflows to the next one. Visitors only ever see the words "hall" and "people".
- Mobile-responsive layout.
- A temple manifest that drives the scene, so the single launch temple is configuration, not hard-coded (see section 11).
- Meditation timer: the visitor picks 5, 10 or 15 minutes, sits on a cushion, and a bell rings at the end. Runs in the browser only.
- Invite-a-friend button: copies a link to the current hall (with its `hall` number) so visitors can invite others into the same hall.
- Remember me: nickname and audio settings kept in the browser's local storage. No account, nothing stored on the server.
- Special-day banner: a banner and an extra chanting slot on Wesak Day and the 1st and 15th lunar days. The dates and times live in the temple manifest.
- Light a lamp: an extra ritual that places a lit lamp in the hall for a few minutes, visible to others. Added as a config entry in the pluggable ritual system, with no new backend.

Kept out of Phase 1 on purpose: free-text chat or blessings (would need moderation) and a visit counter (needs a database).

Out of scope for the MVP (optional later):
- Persistent accounts or profiles.
- Donation integration (see section 8).
- Multi-language UI beyond a first language choice.
- Moderation tooling and analytics dashboards.
- Multi-region room sharding.

### Special-day banner: how it works without a database

The special days are a list in the temple manifest, a JSON file built into the app at deploy time:

```json
"specialDays": [
  { "date": "2027-05-20", "name": "Wesak Day", "extraChanting": ["09:00"] },
  { "date": "2027-01-08", "name": "1st lunar day" }
]
```

1. The manifest is bundled into both the frontend and the Worker.
2. When a visitor joins a room, the server compares today's date in MYT with the list. If it matches, the special day is included in the server's welcome message.
3. The frontend shows the banner from that message. The server decides what "today" is, so a wrong device clock cannot show the banner on the wrong day.
4. The room's Durable Object reads `extraChanting` and sets an extra `alarm()` for that day.

The dates in the example above are illustrative placeholders and have not been verified against a calendar.

Dates: the 1st and 15th lunar days and Wesak Day move each year on the Gregorian calendar. For the launch year, pre-fill the dates in the file by hand and set a yearly reminder to update it. A lunar-calendar library is an option later, but adds a dependency, and the Wesak date may still need a manual check.

Trade-off: changing a date or adding a special day means editing the file and redeploying. That is acceptable for a handful of dates a year. Letting temple staff edit special days themselves, without a developer, needs a database (D1) and an admin screen, which belongs in Phase 3 (section 11).

## 4. Chosen architecture (all Cloudflare)

```
Browser
  1. -> Pages     (static app files: HTML, JS, CSS)
  2. -> Worker    (opens a WebSocket)
              3. -> Durable Object + PartyServer   (the live room)
Optional: R2 (3D models, audio), D1 / KV (tallies, stats)
```

Key point: the browser talks to Pages and the Worker separately. Pages does not call the Worker. (Cloudflare's Workers Static Assets can serve the static files from the same Worker; the flow is the same.)

| Piece | Role |
|---|---|
| **Pages** | Serves the frontend bundle. Free tier. |
| **Worker** | Stateless router. Reads the room ID and forwards the WebSocket upgrade to the right Durable Object. |
| **Durable Object** | Stateful, single-threaded compute per room. Holds the player list and positions in memory and fans out messages. Uses WebSocket hibernation and `alarm()` for the scheduled chanting. |
| **PartyServer** | Library on top of Durable Objects with a simple room model (`onConnect`, `onMessage`, `onClose`). It is the successor to PartyKit. |
| **R2** | Object storage for large 3D models and audio, with free egress. |
| **D1 / KV** | Optional. Only needed for the donation tally, visitor count, moderation and analytics. Not needed for the MVP. |

PartyKit note: the hosted PartyKit platform shuts down on 2026-10-23. Use PartyServer deployed to our own Cloudflare account.

Room sketch (`TempleRoom`):
- `onConnect`: assign nickname and avatar, broadcast the population count.
- `onMessage`: relay position, bow and greet events.
- `onClose`: update the population count.
- `alarm()`: broadcast the communal chanting start at 05:00 and 18:00 MYT.

### Why not the alternatives
- **Colyseus:** a good room-based multiplayer framework, but it needs a persistent Node host (Fly.io, Railway, VPS, Fargate). It cannot run on Workers' V8 isolates. A better fit only if we leave Cloudflare.
- **AWS / GCP:** Workers is roughly Lambda or Cloud Functions, R2 is S3 or GCS, Pages is Amplify or Firebase Hosting, D1 is RDS or Cloud SQL, KV is DynamoDB or Firestore. A Durable Object has no single-service equivalent, which is why Cloudflare suits this app.

## 5. Durable Object placement and latency

- A Durable Object runs in one data center. It is created near the first requester, or per a **location hint**, and **never moves** afterwards.
- Hints (`apac`, and reportedly `apac-ne` and `apac-se`) are best effort and only honoured at creation. Jurisdictions (e.g. `eu`, `fedramp`) are hard constraints and do not include APAC.
- A Korean user connecting to a Southeast Asia room goes browser -> nearest Cloudflare edge -> Cloudflare backbone -> the Durable Object. Estimated extra round trip: about 60–100 ms (an estimate, not measured). This is fine for slow walking and discrete ritual events.
- Static assets still load from the nearest edge. Only the live room connection travels the distance.
- The synced chanting is not streamed. The server sends a scheduled start time and each browser plays its own copy, so a 100 ms offset is inaudible.

Decisions:
1. Create rooms with an APAC location hint so the first visitor's location does not decide placement.
2. No multi-region at launch. Southeast Asia is close enough for Singapore, Thailand and Indonesia.
3. If real international traffic appears, add region to the room ID (as Sansa's `region=apac` does). Each pool gets its own hint, at the cost of separating the groups.
4. Client-side interpolation of avatar movement and low-frequency position updates.

## 6. Cost estimate

| Item | Cost |
|---|---|
| Workers Paid plan (required for Durable Objects) | $5/month minimum |
| Durable Object requests | 1M/month included, then $0.15 per million |
| Pages | Free |
| R2 | Free tier, no egress fees |
| MVP | about $6/month |
| Small launch | about $6–18/month |
| Viral spike | about $35–170+/month |

Mitigations: spend alerts, Draco/KTX2 texture and mesh compression, Opus audio, CDN caching of assets.

## 7. Pre-material needed before a real build

**Art and audio**
- 3D hall model, Buddha statue, cushions, avatar and robes (licensed, or commissioned). Sansa's assets must not be copied.
- Chanting audio for the chosen tradition, plus ambient and SFX (bell, lamp), all with clear licences.
- Compressed formats prepared: glTF with Draco/KTX2, audio in Opus.

**Content decisions**
- Tradition: Theravada or Mahayana (affects the statue, chanting, rituals and wording).
- Languages: BM, English, Chinese (and which first).
- Nickname word lists in the chosen languages.
- Communal chanting schedule in MYT.
- Religious advisor sign-off on rituals and wording.

**Operations**
- A Cloudflare account on the Workers Paid plan, with spend alerts.
- A domain name.

## 8. Malaysia-specific considerations

- **Donations:** Malaysian rails such as DuitNow QR, Touch 'n Go and GrabPay instead of KakaoPay. Needs legal and compliance review before launch.
- **PDPA:** Malaysia's Personal Data Protection Act applies if any personal data is collected. Anonymous entry keeps this minimal; avoid logging PII, and follow the project coding standards for logging and PII.
- **Religious sensitivity:** advisor sign-off, respectful wording, no gamification that trivialises the rituals.
- **Time zone:** all scheduled events are defined in MYT (UTC+8).

## 9. Open questions

1. Which tradition and language(s) for the first release?
2. Commission original 3D assets, or start with placeholders and licensed open assets?
3. Will donations be in the MVP, or deferred?
4. Single Malaysia-focused room pool, or region-sharded from day one?
5. Who is the religious advisor?

## 10. Proposed next steps

1. Confirm the open questions above.
2. Scaffold the MVP in this repo: Vite + Three.js/React Three Fiber frontend, a PartyServer `TempleRoom`, placeholder assets, and the Cloudflare config (`wrangler`).
3. Wire up the movement, population and ritual events, then the scheduled chanting alarm.
4. Test with real latency from Malaysia and Korea, and tune the hints and update rates.

## 11. Future phase: multi-temple platform

**Decision:** temple uploads are not part of Phase 1. They open only after the Phase 1 launch. Phase 1 only has to be designed so this phase does not force a rewrite.

### Vision
Malaysian temples can create their own virtual temple: pick a hall template, upload their own photos and details, and open a room for their community.

### How a temple is "built"
Photos cannot be turned into a walkable 3D hall automatically. The planned approach:

| Option | Description | Phase |
|---|---|---|
| **A. Template + photos** | Choose a hall layout from a template library, then upload photos for the altar backdrop, banners, plaque and statue image. | First (Phase 3) |
| **B. 360° photo room** | Upload a 360° panorama; avatars and rituals are layered on top. | Optional, later |
| **C. Scanned 3D** | Photogrammetry or Gaussian-splat scan of the real hall. | Advanced, later |
| **D. AI image-to-3D** | Generate models from photos. | Experimental only |

### Phase 1 preparation (the only work needed now)
1. **Temple manifest:** one data file (JSON) per temple drives the scene. Phase 1 ships exactly one manifest.
2. **Namespaced hall IDs:** `temple:{slug}:{hall}`. Every temple gets its own halls, population and schedule.
3. **Config-driven assets and text:** asset URLs come from the manifest, under a per-temple folder in R2. UI text goes through a translation layer.
4. **Pluggable rituals:** each ritual is a config entry (name, key, animation, sound), not hard-coded logic.
5. **Per-temple schedule:** chanting times are stored with a time zone in the manifest and drive the `alarm()`.
6. **Template-based hall:** build the Phase 1 hall as a template with replaceable slots (altar backdrop, banners, plaque, statue image).

Draft manifest fields:

```json
{
  "slug": "example-temple",
  "name": { "en": "...", "ms": "...", "zh": "..." },
  "tradition": "mahayana",
  "languages": ["en", "ms", "zh"],
  "timezone": "Asia/Kuala_Lumpur",
  "chantingSchedule": ["05:00", "18:00"],
  "hall": {
    "template": "hall-classic",
    "slots": {
      "altarBackdrop": "assets/{slug}/altar.webp",
      "banner": "assets/{slug}/banner.webp",
      "plaque": "assets/{slug}/plaque.webp",
      "statue": "statue-guanyin"
    }
  },
  "audio": { "ambient": "...", "chanting": "...", "sfx": "..." },
  "rituals": ["greet", "bow", "lamp"],
  "donation": { "type": "link", "url": "..." }
}
```

### Phase plan
1. **Phase 1 (MVP):** one flagship temple, manifest-driven. No uploads.
2. **Phase 2 (pilot):** 2–3 temples onboarded by us. We apply their photos by hand.
3. **Phase 3 (self-service):** temple admin login, upload, preview and approval.
4. **Phase 4 (advanced):** 360° or scanned halls and more templates.

### What Phase 3 will add
- **Database (D1):** `temples`, `temple_admins`, `uploads` (status: pending, approved, rejected), `manifests` (versioned).
- **Auth for temple staff:** visitors stay anonymous. Auth provider to be decided.
- **Upload pipeline:** signed direct uploads to R2, automatic resize and compression, size and format limits, all uploads treated as untrusted.
- **Review step:** every upload is approved by us before it goes live.
- **Directory page:** a landing page listing temples.
- **Per-temple donations:** start by linking out to each temple's own payment page.

### Risks to settle before Phase 2
- **Verifying temples:** how to confirm an uploader represents the temple (registration documents, a contact call).
- **Photo rights and consent:** the temple must own the photos; identifiable worshippers or monks need consent.
- **Traditions in scope:** Mahayana, Theravada and others differ in rituals. Decide whether Taoist or Hindu temples are in scope.
- **Donations:** money going to many temples needs legal review.
- **Cost control:** per-temple storage and upload limits. Durable Objects only cost money while a room is active.

## Sources

- [Sansa](https://sansatemple.com/?room=maru-48&instance=0&region=apac)
- [Durable Objects data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Durable Objects data localization how-to](https://developers.cloudflare.com/data-localization/how-to/durable-objects/index.md)
