# Privacy and PDPA self-check (M8-6)

This is a developer's check of what the temple does with data, written so that a lawyer can review it quickly. It is **not legal advice** and does not say the temple complies with Malaysia's Personal Data Protection Act 2010 (PDPA). The public privacy note and terms ([apps/web/public](../../apps/web/public)) are drafts until that review is done; the production deploy refuses while they are.

## What data exists

| Data | Where | Personal? | How long | Why |
|---|---|---|---|---|
| Nickname word ids, volumes, settings | The visitor's browser (`localStorage`, key `temple.preferences`) | No: two words picked from a list; nothing that identifies a person | Until the visitor presses "Forget my name and settings" or clears the browser | So the next visit feels the same |
| Nickname words and a random player id, position, ritual | Memory of the hall's Durable Object while connected; the nickname words are sent from the browser on joining | No | While connected | To show people to each other |
| Reconnect place (random token, player state) | Durable Object storage | No | `hall.reconnectGraceSec` (60 s), then deleted | To let a dropped phone rejoin |
| Lit lamps (slot, owner id) | Durable Object storage | No | `lamp.durationSec` | To keep lamps lit across a hall's sleep |
| Logs: joins, leaves, counts, refusals, errors | Cloudflare Workers Logs | No: random ids, hall numbers, counts; no names, nicknames, addresses or text | Cloudflare's log retention for the plan | Running and fixing the service |
| Problem reports from the page: kind, short technical note | Same logs | No: the note is an error name and message from our own code; the browser is reduced to a family such as `chrome-mobile` | Same | Finding browser problems |
| IP address | Cloudflare's network, and the rate limiter's key | Possibly personal data, handled by Cloudflare as the platform | Per Cloudflare's policy | Delivering the page, stopping abuse |

There are no accounts, no free-text input anywhere, no cookies set by the site, no advertising and no analytics service. No data is sold or shared. Nothing is sent to any third party by the page (the policy allows only the site's own address).

## Against the PDPA's principles

| Principle | Where it stands |
|---|---|
| General: consent and processing | No personal data of visitors is collected by the temple. The one open point is the IP address handled by the hosting provider: the lawyer should say whether the note's wording is enough. |
| Notice and choice | The privacy note explains the above and is linked from About. It is a draft. |
| Disclosure | Nothing is disclosed to third parties by the temple. Cloudflare processes traffic as the platform. |
| Security | HTTPS everywhere, HSTS, Content-Security-Policy, origin checks, limits, no secrets in the page. |
| Retention | Short and automatic, as in the table. |
| Data integrity | Nothing personal is held. |
| Access | Nothing personal is held that could be looked up for a person; the visitor can erase the browser copy themselves. |

## Questions for the lawyer

1. Is the IP address handled by Cloudflare (and passed as a rate-limit key that we never see or store) within what the note says, or does the PDPA need more (for example a statement about transfer outside Malaysia, since Cloudflare serves from the nearest location)?
2. Does an anonymous nickname, shown to others, with a random id, count as personal data? We believe not.
3. Is the draft terms text adequate for a free devotional service, and does it need Malay as well as English (the PDPA requires notices in both national language and English)? The note is English only for now.
4. If donations are ever added (open question O-3), what changes: registration, payment provider terms, tax-receipt wording.

## If any personal data is ever added

Stop and review first: accounts, email, free-text chat, analytics, donations or a log destination outside Cloudflare. Each changes the table above and the notice, and a new ADR is needed.
