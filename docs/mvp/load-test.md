# Load test and cost (M8-1, spec 11, acceptance criterion 10)

The scripted visitors live in [tools/load-test](../../tools/load-test). They connect the way the browser does (same origin check, same `join`, same walking rate, the same follow-the-hint rule), so the test exercises the real Worker and halls.

```bash
pnpm loadtest --target https://<staging address> --scenario hall --clients 50 --duration 120 --out hall.json
pnpm loadtest --target https://<staging address> --scenario halls --halls 10 --clients 50 --duration 180 --out halls.json
pnpm loadtest --target https://<staging address> --scenario stampede --clients 500 --spread-ms 0 --duration 30 --out stampede.json
```

| Scenario | What it does | What to read |
|---|---|---|
| `hall` | One hall filled to `--clients`, everyone walks at `positionSendHz`, a random person starts a quick ritual about every 20 s, one probe pair times a move. | Join time, snapshots per second, move-to-snapshot latency, refusals. |
| `halls` | The same in `--halls` halls at once. | The same, with several Durable Objects busy together. |
| `stampede` | `--clients` visitors arrive at once and each joins like the browser: ask `/api/halls`, try the suggested hall, follow `nextHall`, at most `--join-retries` halls. | How many are placed, how many tries it took, whether any gave up. |

`--origin` sets the `Origin` header when the target is not the page's own address (for example `http://localhost:5173` against a local Worker). A target with a production rate limit (`CONNECT_LIMITER`, 60 connections a minute per address) will refuse a single machine running hundreds of visitors with HTTP 429. That is the limiter working. For a stampede from one machine, run the test against staging after raising the limit there, or from several machines; then put the limit back.

## Pass criteria

Taken from the spec's targets; the run is recorded in the table below, per target.

- A full hall (`hall.maxPlayers`, 50) joins with no failures and no refusals other than ritual answers (`no_slot_free`, `lamp_limit`).
- Move-to-snapshot latency: p95 under about 300 ms measured from the same region (spec 8.2 expects about 100 ms extra across regions).
- Join time: p95 under 2 s for a hall with people, and under 5 s in a stampede.
- A stampede of 3 times the free places in the first halls places everyone who can be placed, and no one is placed twice or refused while another hall has room.
- Several full halls at once keep the same latency as one.

## Results

### Local run, 2026-11-03 (tool and Worker on one laptop)

`wrangler dev` (workerd) on the same machine as the 250 scripted visitors. Useful for checking the tool and the rules; **not** a measurement of production, because both compete for one CPU and there is no network between them.

| Run | Placed | Join time (p50 / p95 / max) | Snapshots per second per visitor | Move to snapshot (p50 / p95 / max) | Sent by a visitor | Received by a visitor |
|---|---|---|---|---|---|---|
| `hall`, 50 visitors, 20 s | 50 of 50 | 23 / 32 / 80 ms | 5.3 | 133 / 155 / 155 ms | 6.4 messages/s | 11.7 messages/s, 28 kB/s |
| `halls`, 5 halls × 50, 30 s | 250 of 250 | 29 / 491 / 571 ms | 4.3 to 5.6 | 138 / 2488 / 2504 ms (70 probes) | about 6.4 messages/s | about 9.4 messages/s |
| `stampede`, 200 at once | 200 of 200 | 201 / 378 / 423 ms | n/a | n/a | n/a | n/a |

The stampede placed 50, 50, 50, 18, 14 and 18 people in halls 1 to 6: 150 on the first try and 50 on the second, nobody turned away, and no hall went over 50.

Ritual answers during the runs were `no_slot_free` and `lamp_limit`, the expected refusals when 50 people try the same 12 cushions and 1 lamp each. There were no `invalid_message`, `rate_limited` or unexpected closes, and all connections ended with code 1000.

What to take from it:

- The rules hold under load: no hall over `maxPlayers`, no double booking, stampede placement works.
- A visitor receives about 28 kB/s in a full hall, because every snapshot lists everyone who moved, in JSON. That is fine on 4G and costs nothing on Cloudflare (outgoing messages are free). If phones on weak links struggle, the next step is a smaller snapshot format (shorter ids, fewer decimals); not done, because nothing shows it is needed yet.
- Snapshots arrive at 4.3 to 5.6 per second per visitor, not the configured 8: the hall takes a snapshot only while someone is moving, and the tool's walkers pause between targets. Not investigated further; compare on the deployed run.
- The 2.5 s worst case in the five-hall run is probably the single laptop (the tool's one Node process was driving 250 sockets). Repeat on staging before reading anything into it.

### Deployed staging run

**Not run yet.** It needs the staging deployment (see [operations.md](operations.md)). Record it here when done: the three commands above, from a machine in Malaysia or Singapore and from one far away, plus the Cloudflare dashboard's request and duration figures for the same hour, so the cost model below can be checked against the real bill.

## Cost estimate

Prices from [Cloudflare's Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing) (checked 2026-11-03; check again before relying on them): Workers Paid plan $5 a month; Durable Object requests 1 million included then $0.15 per million; incoming WebSocket messages count 20 to 1 as requests; outgoing messages are free; duration 400,000 GB-s included then $12.50 per million GB-s, counted at 128 MB per object.

Assumptions (replace with the deployed run's numbers):

- A visitor sends 3 messages a second on average (8 positions a second while walking, about a quarter of the time, plus pings and rituals; the local run's walkers, who never stop, sent 6.4).
- Halls are about 60% full, and each active hall is billed for duration for the whole peak period (no hibernation), which is the cautious reading.
- Peak lasts the stated hours a day for 30 days; static files, the halls list and the report endpoint are far smaller and are left out. Log storage is not priced.

| Peak concurrent visitors | Peak hours a day | Halls busy | Billable requests a month | Duration a month | Estimated bill |
|---|---|---|---|---|---|
| 100 | 4 | 4 | 6.5 million | 221,000 GB-s | about $6 |
| 500 | 4 | 17 | 32 million | 940,000 GB-s | about $17 |
| 1,000 (every hall full, the capacity) | 4 | 20 | 65 million | 1.1 million GB-s | about $23 |
| 1,000 (every hall full) | 24 | 20 | 389 million | 6.6 million GB-s | about $141 (upper bound) |

The launch size has not been decided, so the table gives sizes rather than one number. **Decision needed:** the target number of concurrent visitors at launch and on a special day, and the spend alert to set against it (operations.md).

Cost levers, if the bill is higher than planned: `net.positionSendHz` (halves the incoming messages when halved), `hall.idleKickSec`, and `hall.count`.
