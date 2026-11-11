# Mobile experience review (2026-11-11)

Reviewed at commit `a64abd6` on branch `analysis/mobile-experience`: the web app's source, and the
live site (`stillhere.mettahome.top`) in a browser emulating a 375×812 portrait phone. Nothing was
checked on a physical phone, so the iOS Safari items are from the code and need confirming on a
device.

## Findings, most important first

### 1. The hall is small on a portrait phone

In "Whole hall" the picture is about 180 px tall on an 812 px screen (roughly 22% of the height),
with empty bands above and below it. An avatar is about 25 px tall. "Altar view" raises that to
about 35%. The wide artwork (1672×941) is fitted by width, so a tall screen cannot fill.

Options, cheapest first:

- Make "Altar view" taller still (it is 145% of the width today) and let the visitor drag sideways.
- Follow the visitor's own avatar in the closer view instead of always centring on the altar.
- Commission a portrait composition of the live hall, as was done for the welcome screen (ADR-047).

### 2. "Altar view" can hide the visitor's own avatar

The closer view clips the sides of the hall. A visitor standing near a side wall (where people are
placed on arrival) is cut off and cannot see themself. Seen on the live site: joined at the right
edge, switched to "Altar view", own avatar gone.

Fix with the same change as above (follow the avatar), or switch back to "Whole hall" when the
visitor's position is outside the clipped area.

### 3. Three of the four sounds are missing, and each costs a wasted request

The manifest names `audio/bell.opus`, `audio/lamp.opus` and `audio/chanting.opus`, but only
`ambient.opus` exists. The site's single-page fallback answers those addresses with `index.html`
and status 200. The code checks the content type, so it falls back to the placeholder sound
correctly, but every visit makes three pointless requests, and the bell and lamp are still the
synthetic placeholders.

Fix: add the recordings, or set the manifest entries so no request is made until they exist.

### 4. The background sound may not play on older iPhones, and is 4 MB

`ambient.opus` is Opus in an Ogg container (4.1 MB). Safari only gained Ogg Opus decoding in
recent versions (18.4, as far as I know: confirm on a device). On older iOS `decodeAudioData`
would fail and the visitor silently gets the synthetic hum instead. 4 MB is also heavy on mobile
data, and it is fetched and decoded in one piece.

Fix: ship an AAC (`.m4a`) alternative and choose by `canPlayType`, and re-encode the loop shorter
or at a lower bitrate (a 60 to 90 second mono loop at 48 kbps is about 0.5 MB).

### 5. The 3D canvas redraws every frame even when nothing moves

`<Canvas>` uses the default frame loop, so the phone's GPU draws 60 frames a second during a
15-minute meditation where the picture never changes. That costs battery and heat. The avatars
already set their poses imperatively, so a `frameloop="demand"` canvas that is invalidated while
someone walks or a ritual runs would cut this to near zero when the hall is still.

### 6. The screen can go dark during meditation

There is no Screen Wake Lock request. A phone that sleeps mid-session suspends the page, and the
closing bell depends on the audio clock still running (ADR-033). Requesting a wake lock while the
meditation timer runs (and releasing it afterwards) is a small change. Needs a device test.

### 7. Invite copies a link instead of opening the share sheet

`InviteButton` uses `navigator.clipboard`. On a phone, `navigator.share` opens the system sheet
(WhatsApp and others), which is how a Malaysian audience would actually pass the link on. Keep the
clipboard as the fallback. Related: `og:image` is still not set, so a shared link has no preview
picture.

### 8. It cannot be added to the home screen properly

There is no web app manifest, no `apple-touch-icon` and only an SVG favicon. Adding these (and
`display: standalone`) gives a full-screen temple without the browser bars, which also helps
finding 1. No service worker is needed for this.

### 9. Art and sound are revalidated on every visit

`/assets/*` is cached for a year, but `/art/*` and `/audio/*` are served with
`max-age=0, must-revalidate`. They change rarely. A day-long cache with
`stale-while-revalidate`, or content-hashed names, saves round trips on slow connections.

### 10. Images are larger than they need to be

- `welcome-altar-portrait.jpg` 276 kB and `flagship-hall.jpg` 293 kB are baseline JPEG. WebP or
  AVIF at the same size would be roughly half.
- `seated-buddha.png` is 401 kB and is only used by the fallback geometry (`BuddhaRelief`), not by
  the painted hall. Check that it is not fetched in the normal path.
- The welcome picture is the largest thing on first paint and has no `fetchpriority="high"` or
  preload.

### 11. First-load JavaScript is 365 kB of a 400 kB budget

The budget has 35 kB left. Most of it is three.js. The chanting texts (Heart Sutra, mantras) and
the panels behind "More" could be loaded on first use.

### 12. Smaller items

- `.meditation button` is 36 px tall: below the 44 px touch target used elsewhere.
- The hall header shows the nickname on its own wrapped line at 375 px; fine, but it pushes the
  reserved top area.
- Cloudflare injects its analytics beacon, which the Content-Security-Policy blocks, so every page
  load logs a console error. Turn the beacon off for the zone or accept the noise.
- No haptic feedback on rituals (`navigator.vibrate` on Android only; optional).
- `THREE.Clock` deprecation warning in the console.

## Suggested order

1. Findings 2 and 3 (bugs, small).
2. Findings 6 and 7 (small, visible to visitors).
3. Finding 1 (the biggest improvement, needs a design decision).
4. Findings 4 and 5 (audio format and battery; need a real iPhone to confirm).
5. Findings 8 to 11 (polish and load time).

## Not covered

Real devices, screen readers, landscape phones, tablets, slow-network timing, and frame rate with
many visitors on a mid-range Android phone (`?debug=1&stress=50` exists for that).
