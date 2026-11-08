# Operations: deploy, observe, run, roll back (M8-2 to M8-5)

Everything here that touches Cloudflare needs an account, so it is written as steps for a person. The repository side (configuration, checks, limits, logs) is done and tested.

## 1. How it is deployed

One Worker serves everything: the built web app as static assets, `/ws` (halls), `/api/halls`, `/api/report` and `/health`. The page and the sockets share one address, so there is no cross-origin traffic, `ALLOWED_ORIGINS` is just that address, and the Content-Security-Policy can say `'self'` (ADR-036).

| Environment | Name | Address | Used for |
|---|---|---|---|
| (top level) | `virtual-temple` | localhost | Development and tests only. Never deployed. |
| `staging` | `virtual-temple-staging` | `*.workers.dev` | Load test, acceptance checks, advisor review. |
| `production` | `virtual-temple` | the temple's own domain | The public temple. |

Both are configured in [apps/worker/wrangler.jsonc](../../apps/worker/wrangler.jsonc). Wrangler does not inherit bindings, so each environment repeats the Durable Object bindings and migrations; `pnpm deploy:check` (tests in `tools/deploy`) fails if they drift apart.

## 2. One-time setup (a person, in Cloudflare)

1. Create or choose the Cloudflare account that will own the temple. Put it on the **Workers Paid plan** (Durable Objects need it).
2. **Spend alert:** Billing → Notifications → add a usage-based billing notification, set at about twice the monthly estimate in [load-test.md](load-test.md), to the people who can act. Cloudflare has no hard spending cap, so the alert and the weekly look at the dashboard are the control.
3. Choose the domain and add it to the account (it must be a Cloudflare zone for `custom_domain` routes). Turn on **Always Use HTTPS** and HSTS for the zone (the site's headers also send `Strict-Transport-Security`).
4. `npx wrangler login` on the machine that deploys, or create an API token limited to Workers on this account for CI. Never put the token in the repository.
5. Replace every `CHANGE-ME` in `apps/worker/wrangler.jsonc`: the staging `workers.dev` address (it contains your account's subdomain) and, for production, the domain in `routes` and `ALLOWED_ORIGINS`.
6. Add the privacy contact address to the combined pages, `apps/web/public/terms.html` and `terms-zh.html`.

## 3. Deploying

```bash
pnpm deploy:staging      # builds, checks the configuration, deploys the Worker with the site
pnpm deploy:production   # the same for the public temple
```

`pnpm deploy:check <staging|production>` is the gate, and it refuses while:

- any `CHANGE-ME` is left in that environment's configuration;
- the environment does not match the top level (bindings, migrations), allows an origin that is not `https`, lacks a rate limiter, does not route `/ws`, `/api/*`, `/health` to the Worker, or has logs off;
- the build has not been run;
- for **production only**, the privacy note or terms still carry the draft notice or the placeholder contact address.

The build itself fails on a script written into the page, a policy that allows too much, or an art address the policy does not list (`apps/web/scripts/check-headers.mjs`), and on a first-load JavaScript size over the budget.

The first deploy creates the Durable Object classes through migration `v1`. **Migrations are one-way:** a later change to class names or storage kind needs a new migration entry, never an edit of `v1`, and cannot be undone by a rollback. Nothing in M8 changes them.

## 4. Limits and protections that exist

| Where | What | Setting |
|---|---|---|
| Worker, per address | New hall connections | `CONNECT_LIMITER`: 60 a minute |
| Worker, per address | Halls list | `HALLS_LIMITER`: 120 a minute |
| Worker, per address | Problem reports | `REPORT_LIMITER`: 10 a minute |
| Worker | Origin must be in `ALLOWED_ORIGINS`; `hall` must be 1 to `hall.count` | `wrangler.jsonc`, `hall.count` |
| Hall, per connection | Message rate, size, invalid-message strikes, ritual cooldown | `net.maxMessagesPerSecond`, `net.maxMessageBytes`, `net.maxInvalidMessages`, `ritual.cooldownMs` |
| Page | Content-Security-Policy and other headers | `apps/web/public/_headers` |

The per-address limits are generous on purpose: many Malaysian mobile users share one address behind carrier-grade NAT, and a tight limit would shut out real visitors. A limiter that fails never blocks anyone. Tune them from the logs (`rejected_request` with reason `connect_rate`, `halls_rate`, `report_rate`) after launch.

**Known gap:** an attacker with many addresses could still fill the 1,000 places. The mitigations, in the order to try them, are a Cloudflare WAF rate-limiting or managed-challenge rule on `/ws` (dashboard, no code), lowering `HALL_COUNT`, and later a Turnstile check on entry. Judge the risk against the donation and audience decisions before launch; it is listed in the checklist.

## 5. Observability (M8-3)

Logs are structured JSON, one line per event, written only through `apps/worker/src/telemetry.ts`. With `observability.enabled` they land in the Worker's **Logs** in the Cloudflare dashboard, where they can be filtered on any field (the destination decision, open question O-9; only the `Telemetry` class changes if it moves). Every line has `temple_id`; hall lines add `hall_id` and `correlation_id`. Counters are lines with `event: "metric"`, a `metric` name and labels.

| What to watch | Event or metric | Fields |
|---|---|---|
| People in a hall, connections, message rate, alarm runs | `sweep` (once per 30 s while a hall is occupied) | `population`, `connections`, `messages_since_last_sweep`, `remaining_graces` |
| Joins and leaves | `joined`, `left` | `population`, `returning`, `code`, `kept` |
| Connections opened | `connection_opened`, `ws_request` | |
| Visitors refused | metric `refused` | `reason` (`hall_full`) |
| Rejected messages | metric `rejected_message`; event `closed_for_misbehaviour` (warning) | `reason` |
| Closed by the server | metric `closed` | `reason` (`join_timeout`, `idle`) |
| Rejected requests | metric `rejected_request` | `reason`: `origin`, `hall`, `connect_rate`, `halls_rate`, `report_rate`, `report_size`, `report_invalid` |
| Rituals | metrics `ritual_started`, `ritual_refused`, `ritual_ignored` | `ritual`, `reason` |
| Directory trouble | metric `directory_unavailable` | `during` |
| Browser problems | metric `client_problem`; event `client_problem_detail` (warning) | `kind`, `browser` (for example `safari-mobile`), `detail` |
| Server errors | events `connection_error`, `unhandled_exception` (error), metric `send_failed` | `error_name`, `error_message` |
| Hall woke after sleeping | `restored_after_wake` | `people` |

Never log names, nicknames, message text or addresses (spec 8.4). Reports from browsers carry only a kind and a short technical note and are counted by browser family.

Look at weekly, and during any event: `client_problem` by `kind` and `browser` (a spike on `safari-mobile` means a Safari problem), `rejected_request` by reason, `unhandled_exception`, `directory_unavailable`, `refused` with `hall_full` (halls filling), and `sweep` population against `hall.count × hall.maxPlayers`. The dashboard's own Durable Object and Worker pages show requests, duration and errors for the cost check. These queries have not been run on a live account yet; adjust the field names there if the dashboard shows them differently.

## 6. Runbook

**Visitors report "cannot connect" or the page never leaves "joining".**
1. Open `/health` on the site. No `ok` means the Worker is down or the route is wrong: check Cloudflare status, then the latest deploy (section 7).
2. Logs: `rejected_request` with `origin` means `ALLOWED_ORIGINS` does not list the address the page is on (a new domain, or `www`); fix the variable and redeploy. `connect_rate` bursts mean a limiter is catching real visitors: raise `CONNECT_LIMITER` and redeploy.
3. `unhandled_exception` or `connection_error`: read `error_name` and `error_message`; roll back if it started with a deploy.

**"All halls are full" shows.** Check `sweep` populations. If the halls really are full, raise `HALL_COUNT` (a variable, no migration) and redeploy; if they are not, the directory may be stale: look for `directory_unavailable`, and it recovers by itself within `hall.heartbeatSec × 3` after a restart.

**The halls list is slow or answers 503.** The page falls back to trying halls in order. Check `directory_unavailable`. A restart of the directory empties its table until each occupied hall reports again (30 s).

**The chanting did not start on time.** The schedule is worked out from the manifest and the clock (ADR-025). Confirm the manifest's `chantingSchedule` and `timezone`, and that the deployed manifest is the one expected (`manifests/flagship.json` is bundled at build time, so a change needs a deploy). **Before launch, restore the chanting times that were set for testing** (see the checklist).

**A visitor reports something offensive.** There is no user-written text, so only nicknames (chosen from the manifest's word lists) and behaviour exist. Remove the word from the manifest and redeploy; use the WAF to block an abusive address range.

**The bill is higher than expected.** Compare requests and duration with [load-test.md](load-test.md). First look for one hall or address with abnormal traffic (`sweep` message counts, `rejected_request`), then lower `net.positionSendHz`, and consider a WAF rule.

## 7. Rolling back

- **Worker code and site:** `npx wrangler rollback --env production` (from `apps/worker`) returns to the previous deployed version; `npx wrangler versions list --env production` shows what exists. The site's static files should go back with it, because they are deployed as part of the version; confirm on staging the first time.
- **Variables and limits** are part of the version too (they live in `wrangler.jsonc`); fix the file and redeploy for a lasting change.
- **Durable Object storage** is not rolled back. What it holds (reconnect places, lamps, chanting state) is small and short-lived, so a wrong state clears itself within minutes; if not, `HALL_RECONNECT_GRACE_SEC` can be lowered temporarily.
- **Migrations cannot be rolled back.** Do not edit `v1`. Any change of Durable Object classes goes through staging first.
- After any rollback, confirm `/health`, join a hall on a phone, and look at the logs for new errors.

## 8. Launch checklist

Technical, in the repository (done):
- [x] Content-Security-Policy and security headers, checked on every build and in a browser (no violations; the decoders' WebAssembly and blob workers are allowed by the policy but were not exercised with a real compressed model: test one on staging).
- [x] Origin allow-list, hall validation, per-connection and per-address limits.
- [x] Logs and problem reports in place (section 5).
- [x] Deploy gate and CI.

Needs a person or a decision (blocks the public launch):
- [ ] Cloudflare account on the Workers Paid plan, spend alert set (section 2). **Owner: you.**
- [ ] Domain chosen and added; `CHANGE-ME` replaced; staging deployed.
- [ ] Staging load test recorded in [load-test.md](load-test.md), with the target size decided (O-7), the numbers in spec 4.3 confirmed or changed, and the cost compared with the bill.
- [ ] Acceptance criteria 1 to 10 (spec 14) walked through on staging, including two phones and a desktop together, iOS Safari audio, confirmation that the flagship has no scheduled chanting and the chant readers open, and a model with Draco or KTX2 compression under the policy.
- [ ] **Religious advisor sign-off (O-5)** on rituals, wording and the chanting; and the tradition decision (O-2) reflected in the art and audio.
- [ ] **Donation decision (O-3):** Phase 1 has no payments. If that stays, nothing to do; if not, a legal review comes first.
- [ ] Languages (O-1): native review of the Malay and Chinese drafts, then list them in the manifest.
- [ ] Privacy note and terms reviewed by a lawyer ([privacy-check.md](privacy-check.md)); draft notices removed; contact address added. The production deploy refuses until this is done.
- [ ] **Restore test values before launch:** `lamp.durationSec` (spec says 300; the code default is 30), and any other values changed for testing. Check `git log -p manifests/flagship.json packages/shared/src/config.ts`.
- [ ] Share preview image (needs a designed picture and the real address; `og:image` is not set yet).
- [ ] A person on call for the first days, and the runbook read once by them.
- [ ] The risk of the 1,000 places being filled by an abuser (section 4) accepted or mitigated.
