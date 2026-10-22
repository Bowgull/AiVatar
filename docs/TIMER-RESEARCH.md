# Timer: smoother sand, exact time, lighter, softer sounds, better hands-on (2026-10-22)

## v2 (same day): his notes on v1, and what changed
"The timer itself looks like shit... the design makes the sands hard to see as they move." "Do any of these sounds
clash?" "Paused: it SMOOTHLY rotates sideways, and back." "Pause on click, + whatever and X on hover, restart on hold?"
"New timer and Rename on right-click? Multiple timers. Names more apparent. A design language pass."

- **Art + engine: `sheet-67/glass2.js`** (replaces `sand.js` on the sheet). 27x35 hourglass (v1: 15x25), 85 grains (v1: 43).
  Legibility rules: DARK glass inside (#0d1317..#1d2a32, lighter down each bulb's middle) behind LIGHT sand (cream to
  amber, 4 shades; the darkest sand is brighter than the lightest glass); round onion bulbs; a one-pixel stream that is
  the brightest thing; grey-teal glass wall with a right rim light and a left specular streak drawn OVER the sand.
  Frames in Samara's wood ramps (band.png / tray.png), dark-wood edges never black: **A walnut** (brass beads,
  recommended), **B brass caps**, **C lantern**.
- **Top sand forms a crater**: the falling-sand rule alone eats the top from the sides; v2 takes the top grain of the
  column standing highest above a gentle V centred on the neck. Piles settle at about 1-in-2 (a sideways slide when the
  slope is steeper), not the rule's 45 degrees.
- **Pause turns it on its side**: a spring (k 160, damping 19: about 0.5 s, a hair of overshoot), drawn with a simplified
  RotSprite (Scale2x three times = 8x, rotate, sample back on the art grid; https://info.sonicretro.org/RotSprite ,
  https://godotshaders.com/shader/rotsprite-like-algorithm-for-cleaner-pixel-art-rotation): whole art pixels, palette
  colours only, every frame. Gravity follows the screen's down, so the sand slides as it tips. rAF only while turning.
- **Restart = hold the glass 0.6 s** (gold pixel ring); it turns right over (180). Sand that hadn't fallen is now in the
  bottom and pours back up the stream (rewind) instead of jumping.
- **Controls**: click glass = pause/go on (at time's up: Again); hover = +1 / +5 / hold-X (pause key dropped: the glass
  does it); scroll = +/-1 min; right-click = New timer (5/10/25/45 + Custom field) / Rename (inline on the nameplate) /
  Restart / Stop (hold), plus the family's rows (See-through, Pin, Click through, Pull apart) when joined. Rename and
  Custom need the keyboard: the window takes focus only while that field is open.
- **Names**: a carved nameplate (dark wood, two brass pins, Figtree 700 14px) above a 26px Figtree 800 time. The glass sits
  in a dark recessed slot so the wood frame reads against the wood plate.
- **Sounds, measured** (pitch tracking + peak/RMS from the files): the chimes use C, D, E, G, A and never repeat a note.
  v1's time's-up (E-G-C marimba) = Job complete's climb and last note (clash); today a timer plays the old
  `needs-you.wav` at -5 dBFS (10 dB over the set); v1 bowl on G4 = the first note of Question and Permission (mild);
  v1 notch F#6 out of key. v2: **A clock strike** F5 x3 evenly (peak -15, RMS -24.5), **B bowl** on F4 2.6 s,
  again = F5 x3 + F6, flip = low F4 knock + pour (-20), notch = F6 tick (-26).


His ask: "Look at the timer and make it have more smooth motion; get a more accurate engine that's lightweight for the
sands - I don't want to be sucking up GPU and CPU; and sounds and interactions of the timer as well. Go big."

Mockup: `docs/cockpit/sheet-67-timer.html` (every hourglass on it is the proposed engine running live).
Engine: `docs/cockpit/sheet-67/sand.js`. Sounds: `docs/cockpit/sheet-67/make-sounds.mjs` -> `sheet-67/*.mp3`.
Picks for him: **pause look A/B** and **time's-up sound A/B** (recommended A and A).

## 1. What today's timer costs, and why (measured on the Shadow, off-screen Electron, 2026-10-22)

Harness: real `TimerWindows` from `src/Shell/src/timerwin.ts` (frameless, transparent, 220x170, off screen, never
focused), next to an empty window of the same kind, the note page, and the proposed engine. `app.getAppMetrics()` per
renderer + CDP `Performance.getMetrics`, 8-12 s windows, `CalculateNativeWinOcclusion` off so everything paints.

| One window | Private memory | Renderer CPU | DOM nodes | Main-thread work per 10 s |
|---|---|---|---|---|
| Today's `timer.html` | **63-75 MB** (40-46 MB right after a forced GC) | 0.31-0.35% | **18,700-25,300** | 390-610 ms |
| Proposed engine, at the desk | **31 MB** | 0.16-0.18% | 43-53 | 130-160 ms |
| Proposed engine, calm (game) | 31-33 MB | **0.02%** | 43-53 | 17 ms |
| Empty transparent window | 24 MB | 0% | 4-8 | 0 |
| Note page (for scale) | 26 MB | 0% | 38-44 | 0 |

GPU process (all windows, solo runs): today 0.21-0.26%, proposed at the desk 0.29%. Both well under 1%.

**Why today's timer is fat:** `hourglass.js draw()` rebuilds the whole SVG with `innerHTML` - **364 `<rect>` elements,
23.7 KB of markup, ~1.0 ms per draw** - and `timer.js` calls it from `setInterval(paint, 200)`, 5 times a second, even
though nothing visible changes most ticks. That is ~1,800 new DOM nodes a second; the old ones wait for Blink's garbage
collector, so the node count sits at 18-25 thousand and private memory at 63-75 MB (a forced GC drops it to ~45 MB,
then it climbs again). Fonts (3 small woff2) and the wood PNG are not the cause. Stopping the paint loop takes CPU to 0;
a loop that only rewrites the digits every 200 ms still costs 0.13% for a change that happens once a second. The
`drop-shadow` filter on the SVG is re-rastered with every redraw too.

Other findings in the code:
- **The end is invisible.** `Timers.due()` removes a finished timer from the list, `timer.state` goes out without it, and
  `TimerWindows.sync()` destroys the window: the plate vanishes the instant time is up. Only Aang's card is left.
- **Up to a second late.** `fireTimers()` runs on a 1 s `setInterval` in the brain, so the ring lands 0-999 ms after 0:00.
- **The loud sound.** `timer.done` in the Body calls `TriggerUrgent()` = the old `needs-you.wav` through
  `System.Media.SoundPlayer` (no volume) - the one he called too loud/sharp on 2026-10-21. The wooden chimes
  (`Chimes.Play`, with his volume slider) never play for a timer.
- **The clock text** is rewritten every 200 ms, and `fmt()` floors the seconds, so 0:00 shows for up to a second before
  the end.
- Esc in `timer.js` can never fire: the window is `focusable: false`.

## 2. Research (sources)

**Timer accuracy**
- Chrome throttles timers: visible pages only clamp nested timers to 4 ms; hidden pages run timers once a second; after
  5 min hidden + chained timers + silence, once a minute ("intensive throttling"). rAF is the advice for animation.
  https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- Electron `backgroundThrottling` (default true) governs timers/animation when a window is backgrounded and drives the
  Page Visibility API. https://www.electronjs.org/docs/latest/api/structures/web-preferences
- On Windows, an occluded Chromium window is treated like a background tab (rendering stops, JS throttled). Only
  visible opaque windows count as occluders; a locked screen occludes everything.
  https://chromium.googlesource.com/chromium/src/+/6f5bc048e043a8868bf6450caa992284f63a94de/docs/windows_native_window_occlusion_tracking.md
- `Date.now()` is wall clock (can jump); whether `performance.now()` counts sleep differs by OS/browser.
  https://github.com/nodejs/node/issues/47724 , https://blog.persistent.info/2016/11/performance-now-sleep.html
- => Keep ONE absolute end time in the brain (already the case), draw from `left = end - Date.now()`, schedule the next
  repaint for the next whole second, re-sync after resume / clock change, and ring from the brain, never the renderer.

**Cheap pixel sand**
- Falling sand rule: try down, then diagonally down; scan from the bottom; alternate/randomise left-right so piles don't
  lean. https://dev.to/sheng_li_d33a3b71c2b2ac45/build-a-tiny-falling-sand-simulator-with-javascript-and-canvas-513i ,
  https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/
- Colour cycling (pixels stay put, colours step through a palette ramp) is the 90s way to fake flow for almost nothing.
  https://en.wikipedia.org/wiki/Color_cycling , https://80.lv/articles/color-cycling-from-the-90s-returns-with-html5
- `image-rendering: pixelated` gives nearest-neighbour scaling. https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering
- Canvas cost scales with pixel count, SVG/DOM cost with element count; rebuilding SVG per frame is a poor fit.
  https://news.ycombinator.com/item?id=2701609 (dated; our own measurement above is the real evidence)
- No source found for a 15x25 hourglass sim; "mass = time, sand only shows it" is our own design.

**Timer apps**
- iOS Clock: several labelled timers, presets, "When Timer Ends" sound, Live Activity with pause/stop.
  https://appleinsider.com/inside/ios-17/tips/how-to-set-multiple-timers-on-your-iphone-in-ios-17
- Google Clock: gradually increasing timer volume; a ringing timer has equal-sized +1:00 and Stop; multiple timers + presets.
  https://9to5google.com/2023/01/23/google-clock-7-4-alarm-timer/ , https://9to5google.com/2026/09/03/google-clock-timers-redesign/
- Scroll-to-add, flip-to-restart, hold-to-stop: no source found; ours, from his hotkeys rule (change by HOLD, never a
  plain click, 2026-10-22) and from the real hourglass.

**Gentle alarms**
- Melodic alarms linked to less grogginess than harsh tones (small study). https://www.rmit.edu.au/news/all-news/2020/feb/melodic-alarms
- Alarm-fatigue guidance: fewer non-actionable repeats, lower volume. https://www.apsf.org/wp-content/uploads/newsletters/2023/3802/APSF3802-2023-6-a07-medical-alarms.pdf
- Full-screen detection: `SHQueryUserNotificationState` (BUSY / D3D full screen / presentation); borderless games may
  not report BUSY, so the pet's own WoW check stays the source.
  https://learn.microsoft.com/en-us/windows/win32/api/shellapi/ne-shellapi-query_user_notification_state

## 3. The design

### The sand engine (`sheet-67/sand.js`)
- **Time is the brain's.** The page gets `{total, end, paused}` (as today). Grains landed = `floor(elapsed/total x 43)`;
  a grain leaves the neck exactly its fall-time before it is due, so the last grain lands on 0:00. The sand never keeps
  time; it can't drift.
- **Sheet 17's hourglass, unchanged** (15x25, approved 2026-10-12). Each grain is one art pixel, 43 grains (the top bulb).
- **Motion:** grains tumble by the falling-sand rule inside each bulb (seeded random, so a timer always looks the same);
  the top drains from the neck so a crater forms; a falling grain accelerates (1 then 2 rows a frame); the pile builds a
  hill; the stream is colour-cycled down the neck (4-step ramp). Each grain keeps its own shade, and a grain with open
  glass above catches the light, so moving sand reads as moving.
- **Paint only on change:** one tiny canvas, `putImageData`, drawn at a whole number of device pixels per art pixel
  (`round(scale x devicePixelRatio)`), so it stays crisp at 125%/150% too. No DOM churn, no CSS filter on the art (bake
  the shadow into the plate later).
- **Frame budget:** 10 fps while something moves (stream, a falling or tumbling grain); between grains in calm mode it
  sleeps until the next grain is due (`setTimeout`, not a polling interval).
- **Calm** (a game in front - the pet's existing quiet state, or `prefers-reduced-motion`): the stream stands still;
  grains still drop, one short burst per grain. Measured 0.02% CPU.
- **Hidden** (`visibilitychange`: minimised, occluded, locked): no timers at all; on return it rebuilds the exact picture
  instantly (deterministic fast-forward) instead of replaying.
- **+/- time:** grains flow back UP the stream (+) or drop through (-), up to 3 per frame; more than 6 off = snap.
- **Digits:** once a second, scheduled for the moment the shown second changes; ceil-rounded, so 0:00 appears exactly at
  the end. Figtree 800 tabular (his 2026-10-22 call: the squashed pixel font is unreadable on numbers).
- **Shapes:** plate (2x), column (3x alone, 2x when two share a column), strip (1x, one line). Sand colour per timer:
  gold, sea, plum.

### The end moment
Last grains drip singly -> stream stops -> last grain lands at 0:00 -> a diagonal glint crosses the pile (1.2 s, once)
-> the plate hops twice (CSS, 0.55 s, once) with the chime -> the keys stay up: **Again** (turn it over: on its side,
then upside down, the pile falls into the top and it runs again), **+5** (turned over for 5 min), **hold X** (close).
Aang's card keeps **Got it / 5 more**; either answer closes both.
Needs a brain change: a finished timer stays in the list as `done` (with `doneAt`) until Got it / Again / X, or 10 min.

### Sounds (sheet 67 row 4)
- **A Wooden timer (recommended):** a breath of sand + E5-G5-C6 on the marimba, 1.7 s, peak -14 dBFS (family level).
- **B Air temple bowl:** one struck G4 bowl, partials 2.76x/5.4x/8.9x, two fundamentals beating at ~1.6 Hz, 3.4 s.
- **Ignored for 1 minute:** A's climb + one step up, +3 dB (peak -11). Then silent; the mark stays.
- Small sounds: **flip** (knock + 0.45 s pour, -20 dBFS), **notch** (one scroll step, -26 dBFS).
- Played by the Body through `Chimes.Play` (his volume slider + chimes toggle) - add `times-up` to `Chimes.Names`; stop
  using `SfxNeedsYou` for timers. Rules unchanged: Mute = silent; in a game it rings ONCE (he set it, Body comment from
  sheet 17) and the card waits; no repeat in a game. Who-speaks rule unaffected (the timer is his, not Claude's).

### Interactions (his rules: hold where accidents matter, one chat door = Aang, nothing that takes WoW's keyboard)
| Do | Does |
|---|---|
| Hover | keys come up (today's rhythm): +1, II, hold-X |
| Click the hourglass | pause / go on; at the end = Again |
| Scroll on it | +/-1 min (Shift 5), "+1:00" chip, notch sound; floor 10 s; sent to the brain as one `timer.act {adjust: ms}` after 400 ms quiet |
| Hold X (0.6 s, bar fills) | stop |
| Drag | moves; family snaps (unchanged) |
| Right-click | today's menu + **Sound**: chime / bowl / none (per timer) |
| New / rename / presets | tell Aang; no typing box on the timer |

Pause look - **A (recommended):** laid on its side; the sand slides over in each bulb (the engine's gravity turns with
it). **B:** stays standing, stream stops, time greys, PAUSED under it.

## 4. Build steps (when he picks)
1. Shell page: replace `hourglass.js` SVG + `setInterval(200)` with `sand.js` + `secondly()`; Figtree digits; scroll,
   hold-X, click-to-pause, end keys; `timer:calm` from the pet's quiet state; drop the `drop-shadow` filter.
2. Brain (`src/Core/src/timers.ts`, `core.ts`): `adjust` and `again` actions; finished timers kept as `done` until
   answered / 10 min; ring with a `setTimeout` armed for the earliest end (the 1 s tick stays as a backstop).
3. Body: `times-up` (+ `-again`) WAVs in `assets/aang/sfx/chimes`, through `Chimes.Play`; one repeat after 60 s at the
   desk only.
4. `timerwin.ts`: `powerMonitor 'resume'` -> resend `timer:data`; keep the window when the timer is `done`.
5. Test once (his test budget): the off-screen harness numbers above (target <= 35 MB private, < 0.25% CPU desk,
   ~0% calm), then one real timer on his desktop through Aang.

Measurement harnesses used: scratch copies of `measure.ts` / `measure2.ts` (same method as
`src/Shell/test/electron/family-timer-check.ts`), `docs/cockpit/sheet-67/shots.mjs` (sheet pictures, the end-moment frames,
and a hands-on check: scroll +1:00, pause lays it on its side, time's up shows Again / +5 / X).
