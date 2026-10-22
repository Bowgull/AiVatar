# Samara performance baseline (2026-10-20)

**What this is:** these numbers were measured, not guessed. No file under `src/` or `pages/` was changed.

- **Machine:** Shadow PC (AMD EPYC 9354, 8 cores, 59 Hz, scale 1), Electron 44.7.0, Chromium 152.
- **Test window:** Samara is drawn off screen. Native occlusion is switched off so it renders exactly like the visible window.
- **Restored session:** 6 tabs (two in a trail), 300 bookmarks (30 on the bar) with icons, block and phishing lists cached.

**How to run it (from `src/Shell`):**

| Harness | Command | What it measures |
|---|---|---|
| Main harness | `npx electron test/electron/perf-trace.ts` (add `PERF_RATE=4` for the throttled pass) | Everything below |
| Idle probe | `npx electron test/electron/perf-idle-probe.ts` | What draws while nothing happens |
| Cold profile | `npx electron test/electron/perf-cold-profile.ts` | A V8 CPU profile of the main process during cold start |

**Raw data:**

- Results: `test/electron/perf-out/results-1x.json` and `results-4x.json`, logs `log-1x.txt` and `log-4x.txt`.
- Kept Chromium traces (open in DevTools > Performance): `%TEMP%\samara-perf-traces\1x\` and `4x\`.

**What each interaction records:**

- **Frame renderer:** CDP `Performance.getMetrics` before and after.
- **Chromium trace:** `contentTracing` with `devtools.timeline` and `toplevel`, parsed for long tasks (> 50 ms) and busy time per process.
- **Main process:** wall time, `monitorEventLoopDelay` and `cpuUsage`.
- **Event counts:** every IPC message in each direction, every `view.setBounds`, `setVisible` and `capturePage`.
- **Method timings:** Samara's own methods, timed on the instance (`sendTabs`, `place`, `veilUp`, `snapshot` and others).
- **Frame times:** a `requestAnimationFrame` recorder plus Long Animation Frame and long-task observers inside the frame, tab-list layer and tab pages.

**Caveats:**

- **4x is uneven.** `Emulation.setCPUThrottlingRate 4` applies to every renderer, standing in for his 2-core Intel MacBook. Chromium throttles by suspending the thread in time slices, so short pieces of work (< 10 ms) are not always slowed. Totals over long windows (page loads, scrolling, resize, idle) are. In idle, the throttler itself shows 6–7 % CPU per tab process; that is an artifact. The main process cannot be throttled, so its numbers are the same in both columns. On the Mac it will be slower.
- **Only http pages were used.** The tabs are local http pages, so the 1.5 s password-box probe never ran against a page. Its cost was measured directly instead (0.2–0.5 ms per call).
- **Tracing adds overhead.** At 4x only the key steps were traced, because tracing every step made the run too slow.

---

## 1. The ten biggest costs, ranked

In this list, **frame** means Samara's band page (`browser.html`), **tray** means the tab-list layer (`browser.html?tray`) and **main** means the main process.

1. **Every new tab and every asleep-tab wake waits about 430 ms for nothing (measured).**
   - **The chain:**
     - `activate()` holds the old page on screen and hides the new one (`src/browser.ts:1850`).
     - `veilUp()` then sends `curtainShow(picture)` to the curtain (`src/browser.ts:1362`).
     - `curtainShow()` awaits `shot.decode()` (`pages/curtain.js:8`), and the curtain view is hidden.
     - In a hidden view that decode never settles. The probe was still waiting after 3,000 ms; without a picture it returns in 1 ms.
     - So `within(..., 400)` times out every time, and only then is the new tab shown.
   - **Effect:**
     - `veilUp` took 430–449 ms in every one of 20 wakes and 5 new tabs.
     - Small pages had finished loading at 120–270 ms, but their first paint landed at about 500 ms.
     - The "soft fade between pages" never actually shows whenever a picture exists: `curtainFade` was never called in any run.
   - **4x:** the same 400 ms timer, on top of slower loads (median wake 1.03 s, worst 1.9 s).
2. **Cold start blocks the main process for about 1.8–2.0 s, so the window appears about 2.8–3.0 s after launch (measured).**
   - **The long task:**
     - The ad blocker parses 3.2 MB of lists in one go: `ElectronBlocker.parse` at `src/skip/ads.ts:115`, started from `src/browser.ts:568`.
     - The one long main task was 1,795 ms (1x) and 1,993 ms (4x run).
     - The CPU profile puts about 950 ms in `@ghostery/adblocker` itself (the reverse-index `update` alone is 330 ms) plus 350 ms of garbage collection.
   - **Plus the phishing lists:**
     - `PhishCheck.start` (`src/browser.ts:552`) loads 15 MB of lists into a 414,000-entry Map.
     - That is about 440 ms of main time (`phish.ts:80` `mark` is 291 ms), spread out by `addSoftly`.
   - **Timeline (1x):**

     | Step | Time after launch |
     |---|---|
     | Constructor (sync) | 240–780 ms |
     | Frame created | 0.5 s |
     | Frame loaded | 2.7 s |
     | Frame first paint | 2.9 s |
     | Active tab painted | 3.2 s |

   - **Why it shows:** the window is only shown on `ready-to-show`, so he stares at nothing for about 3 s, and longer on the Mac.
3. **The frame redraws at 60 fps forever, even when nothing happens (measured).**
   - **Cause:** the loading bar's stripes, `.loading i::after{animation:ribs 1.6s linear infinite}` at `pages/browser.css:35-36`. They animate `background-position` on an element that is invisible (opacity 0) whenever no page is loading.
   - **Idle cost:**
     - 903 main frames and 1,808 paints in 15 s.
     - About 40 ms/s of frame main-thread time at 1x, and 50 ms/s in the 4x run.
     - The GPU composites every frame.
   - **Proof:** `perf-idle-probe.ts` shows 246 frames / 4 s as is, and **0 frames, 0 ms** with only that animation paused.
   - **Why it matters on the Mac:** this is the "always busy" cost on battery, and it competes with every real animation for the same frames.
4. **While an update waits, the update key's glow restyles and re-lays-out the band every frame (measured).**
   - **Cause:**
     - `upwarm` (text-shadow + filter) and `upwarmarrow` (drop-shadow filter), both infinite, at `pages/browser.css:591-594`.
     - From day 4, also `swellshake` and `swellring` (box-shadow), at `:596-598`.
   - **Cost:**
     - Idle frame work rises to 1.53 s per 15 s (1x) and 1.61 s per 15 s (4x run): about 10 % of a core.
     - 1,344 layouts and 1,345 style recalculations, plus GPU at 2.6 %.
   - An update was waiting on his machine for days in October, so this is a realistic state.
5. **Each tab-list message rebuilds part of the band, even when nothing changed (measured).**
   - **The send:**
     - `sendPane()` sends the full state (about 7.9 KB) to the frame **and** to the tab-list layer, even while that layer is hidden (`src/browser.ts:3034`).
     - A page load sends 9 + 9 messages, about 150 KB.
     - A wake sends 8; a live switch sends 1–2.
   - **Per message the frame does:**
     - 62 DOM changes, even when nothing changed:
       - `paintMarks` rebuilds 24 shelf buttons (`pages/browser.js:651`, `:825`).
       - `paintUrl` re-creates the address and resets `lock.innerHTML = SHIELD` (three images, `pages/browser.js:458`).
       - `.hidden` is re-assigned on about 12 elements.
     - 4.1–4.5 style and layout passes.
     - About 7–8 ms of frame task time (1x).
   - **Result:** about 70 ms of frame main-thread work per page load in bursts (1x), and 180–380 ms of frame style per heavy page load at 4x.
   - **A/B in the page:** skipping just the shelf rebuild cut the changes from 62 to 37 and layout from 1.5 to 0.9 ms per message. The rest comes from the repaint-everything handler.
6. **The band's resize observer turns any toggle of `hidden` into a native view move (measured).**
   - **The chain:**
     - `new MutationObserver(... report)` watches `hidden` on the whole body (`pages/browser.js:30`).
     - Setting `.hidden` to its current value still counts as a change, so it fires.
     - `report()` then forces a layout read (`getBoundingClientRect`, `browser.js:21,25`) and sends `browser:insets`.
     - That calls `setInsets` → `place()` → `view.setBounds` in main (`src/browser.ts:1289`, `:1297`).
   - **Measured:**
     - 10 unchanged tab-list messages caused 10 insets messages and 10 `setBounds` calls.
     - Pointing at 20 links caused 40 `browser:hover` messages, 40 insets messages and 40 `setBounds` calls. That is every link hover: `#linkpeek` toggles `hidden` (`browser.js:41`, `src/browser.ts:1555`).
     - A page load causes 10–11 `setBounds` calls; a live switch 2.
     - The LoAF entry blames `report` (forced layout 6 ms in a 132 ms frame at 4x).
7. **A picture of the page is taken whenever the mouse heads for the band (measured).**
   - **Where:** hovering the tab-list handle, the ⋯ key, the downloads key or the address slot runs `peek` (`pages/browser.js:266`, handle at `:279`).
   - **What it costs:**
     - `shotOf` does `capturePage`, `resize` and `toJPEG(80)` on main, then base64 (`src/browser.ts:333-341`).
     - 10–30 ms per picture; the first one took 150 ms.
     - The result is a 240 KB data URL sent to the frame and decoded there.
   - **Where it lands:**
     - Every over-page panel opens through this path (shield, update tray, ⋯ menu, downloads, star): 60–110 ms to settle at 1x, worst 155–310 ms.
     - The frame's worst frames all land here: 183 ms for the shield, 100 ms for downloads, 117–154 ms for a wake. These Long Animation Frames show no script and no style, which points to decoding or uploading the picture (**unverified**).
8. **Dark mode (Dark Reader) delays a heavy page's first paint (measured).**
   - Dark Reader (400 KB of script) is injected into every page at `dom-ready` (`src/browser.ts:1520`, `:949`).
   - **Heavy test page (1x):**
     - First paint 851–873 ms with dark on, versus 662–824 ms with it off.
     - Injection runs 410–530 ms in the tab.
     - Tab busy 762 ms with dark on, versus 687 ms off.
   - **At 4x:**
     - Injection 1.4–2.7 s, first paint up to 3.9 s.
     - Heavy page fully settled: 3.9–4.2 s with dark on, versus 2.0–2.7 s with it off.
9. **The tab-list layer is a second full copy of the band page (measured).**
   - **First open:** 188 ms (1x) and 541 ms (4x), with a 100 ms frame and 12 dropped frames at 4x. It builds all 990 nodes of the band, not just the list.
   - **Later opens:** 4–15 ms.
   - **Hover-open:** always about 410 ms, from the deliberate 400 ms wait (`browser.js` handle) plus the peek picture.
   - **While idle:** it stays alive and receives every message (item 5).
10. **Background timers wake every tab (measured).**
    - **Snapshot:**
      - `setInterval(snapshot, 8000)` (`src/browser.ts:1218`) asks every live tab for `window.scrollY` and writes the file, even when nothing changed.
      - 6 tab wake-ups and 6 IPC round trips every 8 s; 5–100 ms per run at 1x.
      - At 4x every run took about 806 ms because the throttled tabs miss the 800 ms deadline. On a slow Mac, scroll positions may then not be saved.
    - **Password-box probe:**
      - `setInterval(lookForLogin, 1500)` (`:1219`) runs a script in the active https tab: 0.2–0.5 ms, 0.67 per second.
    - These are cheap one by one. They add wake-ups, never jank.

**Not costly (measured):**

- Live tab switches: 7 ms (1x) and 27 ms (4x) to settle.
- Closing panels: about 15 ms.
- Scrolling: 90 wheel steps moved 9,000 px with 0 dropped frames at 1x. No Samara IPC or `setBounds` happens during a scroll. At 4x the long test page itself drops frames.
- Resize:
  - 2 `setBounds` per step (the resize handler plus the insets echo), 0.6 ms each.
  - 300 ms of main time over 40 steps.
  - No drops at 1x; at 4x, 6 dropped frames and 1.4 s of frame task time.
- The CSS itself: no `:has()`, no `backdrop-filter`, only 2 harmless universal selectors (`.drawer>*`, `.tidyfoot>*`), and 42 attribute selectors, none on `html` or `body`.
- No canvases are redrawn every frame (there are no canvases).

**Seen once, not reproduced (unverified):**

- The first Settings open in the very first run froze main for 1,861 ms. Main CPU in that window was 219 ms, so main was blocked rather than working.
- The likely cause is the first spawn of the 127 MB `bw.exe` (`settingsData` → `vault.state()` → `execFile`, `src/browser.ts:1622`, `src/vault.ts:35`), held up by an antivirus scan.
- In later runs the spawn was 5–10 ms synchronous, and Settings opened in 0.3 s (1x) and 0.57 s (4x).

## 2. Idle cost (6 live tabs, window open, nothing happening, 15 s)

| State | Frame main-thread | Frame frames / paints per s | Frame CPU % | GPU % | Main busy | IPC main→frame | IPC frame→main | Tab wake-ups |
|---|---|---|---|---|---|---|---|---|
| plain, 1x | 610 ms / 15 s (4 %) | 60 / 120 | 0.6 | 0.2 | 125 ms / 15 s | 0 /s | 0 /s | 12 `scrollY` probes (snapshot) |
| update waiting 5 days, 1x | 1,534 ms / 15 s (10 %) | 60 / 140, plus 90 layouts/s | 1.9 | 2.7 | 163 ms | 0 | 0 | 12 |
| tab list open, 1x | 639 ms / 15 s | 60 / 120 | 0.6 | 0.2 | 70 ms | 0 | 0 | 12 |
| plain, 4x run | 744 ms / 15 s | 60 | 6.4 (throttler) | 0.1 | 68 ms | 0 | 0 | 12 |
| update waiting, 4x run | 1,611 ms / 15 s | 60, plus 89 layouts/s | 7.3 (throttler) | 2.3 | n/a | 0 | 0 | 12 |

- **Idle IPC:** 0 messages per second in both directions. Every idle cost is in the frame drawing, not in messages.
- **Wake-up counts:** Windows does not report `idleWakeupsPerSecond` (always 0). Wake-ups are counted from the timers instead:
  - 0.67/s password probe (on https pages).
  - 0.125/s snapshot, which wakes every live tab.
  - 1/60 s sleep check.
  - 60/s frame redraw (the stripes animation).

## 3. Ranked fix list

| # | Fix | Expected gain | Risk | How to verify |
|---|---|---|---|---|
| 1 | Make the curtain never wait on a hidden view. Don't `await shot.decode()` in `curtainShow`, or show the curtain view before decoding, or use `onload` with a 50 ms cap. Then the fade works and `veilUp` stops timing out (`pages/curtain.js:8`, `src/browser.ts:1362`). | About −400 ms on every new tab and every asleep-tab wake. Small pages first-paint at about 150–250 ms instead of about 500 ms. The fade starts working. | Low to medium. The fade will now really show, so look at it once. | `perf-trace.ts`: `veilUp` asyncMs < 60, the `tabPainted` milestone < 300 ms for `/p/N`, `curtainFade` gets called. The probe line "curtainShow ... resolved". |
| 2 | Animate the stripes only while loading, e.g. `.loading.on i::after` or `animation-play-state:paused` unless `bar.on` (`pages/browser.css:35-36`, `browser.js:206-249`). | Idle frame work goes to about 0: no 60 fps redraw and no GPU frames at rest. About 40 ms/s of frame CPU saved at 1x, more on the Mac. | Low. | `perf-idle-probe.ts` "as is" shows 0 frames; `perf-trace` idle plain shows frames ≈ 0. |
| 3 | Make the update glow cheap: pulse a few times then rest, or fade a pre-drawn glow layer's opacity (composited) instead of animating `filter` and `text-shadow` (`browser.css:591-598`). | −1.4 s of frame work per 15 s while an update waits (about 10 % of a core), −2.4 % GPU. | Low, but it changes the look: ask him. | `perf-trace` idle "update waiting": layoutN ≈ 0, task < 0.2 s / 15 s. |
| 4 | Show the window first; build the ad blocker after first paint. Either defer `blockAds` until `ready-to-show`, or cache Ghostery's serialized engine (`blocker.serialize()` → `ElectronBlocker.deserialize`, typically tens of ms) instead of re-parsing 3.2 MB every launch. Load the phishing lists after paint, or in a worker (`src/browser.ts:552,568`, `src/skip/ads.ts:115`). | Cold start: window visible about 2 s sooner (2.9 s → about 0.8–1 s at 1x). No 1.8 s main-thread freeze. | Medium. Pages opened in the first second load before the blocker is on, so hold the restored tabs' loads until it is ready, or accept it. | `perf-cold-profile.ts` (adblocker self time), `perf-trace` cold detail `frameFCP`, main long tasks list. |
| 5 | Only repaint what changed on `browser:tabs`. Compare the marks list before rebuilding the shelf; set `lock.innerHTML` only when secure/insecure flips; only write `.hidden` when it differs. Don't send to the tab-list layer while it is hidden; send once when it opens (`browser.js:423-512`, `:651`, `:458`, `src/browser.ts:3034`). | About −60 % of frame work per message (62 → about 5 DOM changes). Half the IPC bytes per page load (150 KB → 75 KB). Fewer forced layouts. | Low. | `perf-trace` unit "sendTabs x40": mutsPerMsg < 10, styleN/layoutN ≈ 1 per message. Event summary `browser:tabs>tray` = 0 when the layer is closed. |
| 6 | Make `report()` look only at its own inputs: cache the last insets and send only on a real change; observe only the 4 chips plus the page box, not the whole body (`browser.js:20-30`). Keep `#linkpeek` out of it. | Link hovers: 0 IPC and 0 `setBounds` instead of 2 per hover. Page loads: −10 `setBounds`. | Low. | `perf-trace` "pointing at 20 links": insets 0, setBounds 0. |
| 7 | Take the page picture only when a panel really opens, or reuse one per page. Drop the hover-peek on the slot and ⋯ (or raise its 700 ms reuse window). Send a smaller picture (`toJPEG(60)` at half size for a still that sits under a panel) (`browser.js:266`, `src/browser.ts:333-345`). | −10–30 ms main per hover pass. Smaller decode, so the 100–183 ms worst frames should drop (**unverified**). | Low to medium (a picture taken at click time has to be ready fast). | `perf-trace` panel-open worst frame < 50 ms; capture count per hover = 0. |
| 8 | Dark mode: inject Dark Reader at `did-start-navigation`/`document-start` in its isolated world rather than at `dom-ready`, or keep a dark-site list so pages that are already dark skip it. | −200 ms first paint on heavy pages at 1x, about −1–2 s at 4x. | Medium (Dark Reader's own startup order). | `perf-trace` "heavy page, dark on" `tabPainted` close to "dark off". |
| 9 | Make the tab-list layer its own small page (list only, not the whole band), or create it at idle after start. | First open 541 ms → under 150 ms at 4x. Less memory. | Medium (same list code, shared). | `perf-trace` "open (first, builds layer)". |
| 10 | Snapshot only after a change (`changed()` already schedules one). Drop the 8 s interval, or skip it when nothing changed and read `scrollY` only from the active tab. Stop the password probe while the window is not focused. | 6 tab wake-ups per 8 s → 0 at rest. Scroll positions are saved on the Mac too (the 800 ms deadline is missed at 4x). | Low. Keep one save on close, which already exists. | `perf-trace` idle: execjs 0 per 15 s. |

**Also:** move the Bitwarden `bw status` check in Settings off the opening path (start it after the page has drawn). The 1.86 s freeze is **unverified**, but the fix is cheap.

## 4. Static audit

**CSS:**

- No `:has()`, no `backdrop-filter`.
- Universal selectors: 2, both harmless.
- Attribute selectors: 42, mostly `[aria-expanded]` and `[data-*]`; none on `html` or `body`.
- `box-shadow` declarations: 77; the large blurred ones are on panels that open rarely.
- **Animations of properties the compositor can't do alone (not transform or opacity):**

  | Animation | What it animates | When it runs | Where |
  |---|---|---|---|
  | `ribs` | background-position | infinite, always (item 3) | `:35-40` |
  | `upwarm` / `upwarmarrow` | text-shadow, filter | infinite while an update waits | `:591-594` |
  | `swellring` | box-shadow | infinite from day 4 | `:597` |
  | `popglow` | drop-shadow filter | infinite while a popup is blocked | `:235-236` |
  | `vpulse` | box-shadow | once | `:177` |

- **Transitions on layout properties:**
  - `.dlkey` and `.upkey` width (.22 s), `:489`, `:576`.
  - `.rnd` top, `:15`.
  - Menu and download rows padding-left, `:390`, `:505`.
  - Download bar width, `:521`.
  - All of these are short and rare.

**Layout reads in `browser.js` (13):**

| Line | Read | Where it runs |
|---|---|---|
| 21, 25 | `getBoundingClientRect` | `report()`, on every `hidden` change (item 6) |
| 60 | `getBoundingClientRect` | `trayRect` |
| 232 | `getBoundingClientRect` | star panel |
| 331 | `getBoundingClientRect` | `placeSuggest`, on every suggestion repaint, so every keystroke |
| 587, 934 | `getBoundingClientRect` | tab and trail menus |
| 742 | `getBoundingClientRect` | shield panel |
| 831 | `offsetWidth` (forced) | key pulse, in the tab-list handler |
| 965, 969 | `getBoundingClientRect` | `landing()`, every row, on every `dragover`: a loop |
| 1122 | `offsetWidth` (forced) | `barStart` |
| 1236 | `getBoundingClientRect` | update tray `place` |

- None of these sit inside a `requestAnimationFrame` loop. The worst are `report` (frequent) and `landing` (a loop during drags; drags were not measured).

**Timers:**

| Timer | Where | Runs |
|---|---|---|
| snapshot every 8 s | `src/browser.ts:1218` | always (item 10) |
| `sleepIdle` every 60 s | `:1218` | always, trivial |
| `lookForLogin` every 1.5 s | `:1219` | always (item 10) |
| lantern icon, 10 × 55 ms | `:1138` | at open; `setIcon` 51 ms in profile |
| icon fetch | `:490` | 5 s after start |
| `creepT` every 200 ms | `browser.js:1125` | only while a page loads |
| `tidyTick` every 500 ms | `browser.js:165` | only during a tidy |

**IPC:**

- **Idle:** 0 messages per second.
- **Live switch:** 1–2 `browser:tabs` messages (about 8 KB each), 1 insets message, 2 `setBounds`, 6 `setVisible`.
- **Asleep wake:** 8 tab-list messages (62 KB), 9 insets messages, 10 `setBounds`.
- **Heavy page load:** 18 tab-list messages (149 KB, half of them to the hidden layer), 10 insets messages, 11 `setBounds`.
- **Link hover:** 1 hover message + 1 insets message + 1 `setBounds` per hover.

**`capturePage`:**

- On every peek and every over-page panel open (item 7).
- On every new tab and every wake, for the curtain (`veilUpInner` → `shotOf(from)`). That picture is wasted, because the curtain never shows (item 1).

---

## 5. Tables per interaction (median of n, normal / 4x)

**What the columns mean:**

- **visual:** time until both the frame's DOM and the step's own condition had settled. The condition is, for example: tab painted and curtain down, picture hidden, or layer shown.
- **main busy:** traced main-thread task time in the window (`-` = not traced at 4x).
- **ELD max:** worst main event-loop delay.
- **frame style/layout/script/task:** CDP deltas.
- **long tasks:** frame tasks > 50 ms (trace).
- **worst frame / dropped:** from the frame's rAF recorder.
- **tab busy:** traced task time of the active tab.
- **tabs msgs:** `browser:tabs` to frame + layer.
- **4x durations:** short ones are noisy (see the caveat at the top).

#### 1-cold

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| new+open (6 tabs restored) | 1x | 1 | 3193.1 / 3193.1 | 542.2 | 2668.5 | 53.8 | - / - / - / - | - / - | 0 | - / - | 172.6 | 8 (60.3) | 10 | 0 |
| new+open (6 tabs restored) | 4x | 1 | 3196.8 / 3196.8 | 849.6 | 2880.8 | 71.6 | - / - / - / - | - / - | 6 (202.5) | - / - | 204.2 | 8 (60.3) | 10 | 0 |

#### 2-switch

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| asleep tab (wakes) | 1x | 10 | 805.9 / 1331.6 | 7.6 | 55.8 | 50.4 | 17.2 / 6 / 5.6 / 101.6 | 56 / 6 | 0 | 116.8 / 0 | 210 | 8 (62) | 10 | 12.3 |
| asleep tab (wakes) | 4x | 10 | 1032.8 / 1908.7 | 6.9 | - | 25.4 | 62 / 41 / 17.1 / 374.5 | 68 / 9 | 0 | 133.5 / 4 | - | 8 (62) | 10 | 13 |
| live tab | 1x | 10 | 6.8 / 8.9 | 3.9 | 12.7 | 41.2 | 2.1 / 0.9 / 1.2 / 21.6 | 24 / 1 | 0 | 16.9 / 0 | 2 | 1 (7.7) | 2 | 0 |
| live tab | 4x | 10 | 26.9 / 49.2 | 4.7 | 14.4 | 26.9 | 8.9 / 5.2 / 4.7 / 68.1 | 24 / 2 | 0 | 17.3 / 0 | 4.9 | 1 (7.7) | 2 | 0 |

#### 3-tray

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| open (first, builds layer) | 1x | 1 | 187.8 / 187.8 | 0.1 | 65 | 17.2 | 4.5 / 2.1 / 3.1 / 51.4 | 40 / 3 | 0 | 100.1 / 5 | 1.2 | 4 (31) | 4 | 0 |
| open (first, builds layer) | 4x | 1 | 540.6 / 540.6 | 0.1 | 61.1 | 17.6 | 13.4 / 7.7 / 37.3 / 277.8 | 56 / 3 | 1 (61.4) | 66.8 / 12 | 12.8 | 4 (31) | 4 | 0 |
| close | 1x | 4 | 1.5 / 2.2 | 0.1 | 7.8 | 28.4 | 2.2 / 0.1 / 1 / 19.2 | 22 / 1 | 0 | 16.8 / 0 | 0.2 | 0 (0) | 0 | 0 |
| close | 4x | 4 | 2.2 / 11 | 0 | - | 20.8 | 2.8 / 0.2 / 0.9 / 17.1 | 21 / 1 | 0 | 33.3 / 0 | - | 0 (0) | 0 | 0 |
| open (click) | 1x | 3 | 3.8 / 5.9 | 0.1 | 10 | 39.3 | 3.8 / 1 / 2 / 29.8 | 31 / 2 | 0 | 16.8 / 0 | 0.4 | 2 (15.5) | 3 | 0 |
| open (click) | 4x | 3 | 12.1 / 15.3 | 0 | - | 47.1 | 3.7 / 1 / 2.3 / 25.1 | 29 / 2 | 0 | 22.2 / 0 | - | 2 (15.5) | 3 | 0 |
| open (hover: peek + 400ms) | 1x | 3 | 410.8 / 417.5 | 0 | 27.4 | 37.3 | 6 / 1 / 3.2 / 47 | 52 / 2 | 0 | 17.7 / 0 | 0.3 | 2 (15.5) | 2 | 18.1 |
| open (hover: peek + 400ms) | 4x | 3 | 418.6 / 419.6 | 0 | - | 16.5 | 6 / 1 / 3.2 / 41.7 | 53 / 2 | 0 | 33.4 / 0 | - | 2 (15.5) | 2 | 18 |

#### 2-switch

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| live tab, from open list | 1x | 10 | 8.5 / 12.3 | 0 | 12 | 28.6 | 2.9 / 0.9 / 1.3 / 24.4 | 24 / 1 | 0 | 16.8 / 0 | 2.3 | 2 (15.5) | 2 | 0 |
| live tab, from open list | 4x | 10 | 41.9 / 88.8 | 0 | - | 16.5 | 2.6 / 0.9 / 1.3 / 22.8 | 25 / 1 | 0 | 33.4 / 0 | - | 2 (15.5) | 2 | 0 |

#### 4-shield

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| site panel open | 1x | 3 | 71.2 / 234.5 | 0 | 50 | 26.4 | 3.1 / 1.1 / 2.5 / 28.1 | 29 / 3 | 0 | 183.5 / 0 | 1.2 | 0 (0) | 3 | 11.9 |
| site panel open | 4x | 3 | 62.4 / 310 | 0 | 46.3 | 26.1 | 4.1 / 1.5 / 3.8 / 29 | 30 / 3 | 0 | 183.4 / 0 | 8.6 | 0 (0) | 3 | 16.5 |
| site panel close | 1x | 5 | 15.5 / 16 | 0 | 9.7 | 22 | 2.2 / 0.2 / 1.4 / 18.4 | 23 / 1 | 0 | 17.8 / 0 | 1 | 0 (0) | 3 | 0 |
| site panel close | 4x | 5 | 15.5 / 15.8 | 0 | - | 16.1 | 2.2 / 0.2 / 2.1 / 16.3 | 22 / 1 | 0 | 16.8 / 0 | - | 0 (0) | 3 | 0 |
| site panel open (after hover peek) | 1x | 2 | 30.4 / 42.8 | 0 | 10.9 | 32.3 | 2.5 / 0.6 / 1.6 / 21 | 27 / 2 | 0 | 16.8 / 0 | 1.7 | 0 (0) | 3 | 0 |
| site panel open (after hover peek) | 4x | 2 | 30.7 / 46.3 | 0 | - | 16.2 | 4.8 / 0.6 / 2.3 / 28.6 | 27 / 2 | 0 | 17 / 0 | - | 0 (0) | 3 | 0 |

#### 5-uptray

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| update tray open | 1x | 3 | 74.2 / 108.8 | 0 | 47.8 | 20.2 | 4.6 / 2.2 / 2.3 / 36.6 | 30 / 6 | 0 | 50 / 0 | 1 | 0 (0) | 2 | 25.6 |
| update tray open | 4x | 3 | 66.9 / 93.2 | 0 | 33.5 | 16.5 | 7.5 / 1.1 / 2.9 / 36.1 | 29 / 6 | 0 | 33.5 / 0 | 1.5 | 0 (0) | 2 | 23.1 |
| update tray close | 1x | 3 | 15.5 / 15.9 | 0 | 11.5 | 18.5 | 5.5 / 4.6 / 1.8 / 32.6 | 22 / 19 | 0 | 16.8 / 0 | 1.2 | 0 (0) | 3 | 0 |
| update tray close | 4x | 3 | 15.5 / 15.7 | 0 | - | 16.3 | 8.6 / 3.4 / 2 / 38.7 | 31 / 20 | 0 | 16.8 / 0 | - | 0 (0) | 3 | 0 |

#### 6-menu

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dots menu open | 1x | 3 | 62.7 / 69.5 | 0 | 25.4 | 18.8 | 6.1 / 6.4 / 1.9 / 43.3 | 28 / 28 | 0 | 16.8 / 0 | 1.1 | 0 (0) | 2 | 23.8 |
| dots menu open | 4x | 3 | 62.2 / 62.3 | 0 | 22.6 | 18.7 | 12.4 / 9 / 2.3 / 54.9 | 28 / 28 | 0 | 18.6 / 0 | 3 | 0 (0) | 2 | 18.7 |
| dots menu close | 1x | 3 | 15.2 / 15.5 | 0 | 10.4 | 16.8 | 4.5 / 4.1 / 1.2 / 33.5 | 22 / 22 | 0 | 16.8 / 0 | 0.8 | 0 (0) | 3 | 0 |
| dots menu close | 4x | 3 | 15.4 / 15.5 | 0 | - | 16.1 | 10.2 / 5.1 / 2.5 / 49.8 | 23 / 23 | 0 | 17.9 / 0 | - | 0 (0) | 3 | 0 |

#### 6-downloads

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| downloads tray open | 1x | 3 | 76 / 155.3 | 0 | 48.3 | 21 | 6.9 / 6.5 / 1.8 / 50.6 | 28 / 28 | 0 | 100.2 / 0 | 0.9 | 0 (0) | 2 | 18.7 |
| downloads tray open | 4x | 3 | 93.2 / 200.5 | 0 | 58.8 | 16.1 | 13.9 / 11.9 / 3 / 63.2 | 30 / 30 | 0 | 100.1 / 0 | 9.8 | 0 (0) | 2 | 29.7 |
| downloads tray close | 1x | 3 | 16.1 / 17.1 | 0 | 9.9 | 17.3 | 6.8 / 5.3 / 1.5 / 42.9 | 23 / 23 | 0 | 16.8 / 0 | 1 | 0 (0) | 3 | 0 |
| downloads tray close | 4x | 3 | 15.4 / 15.5 | 0 | - | 16.2 | 107.9 / 62.9 / 1.2 / 432.3 | 276 / 276 | 0 | 33.4 / 0 | - | 0 (0) | 3 | 0 |

#### 6-bookmark

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| star + name panel open | 1x | 1 | 62.2 / 62.2 | 0 | 39.8 | 31.4 | 8.3 / 9 / 2.4 / 60.5 | 32 / 31 | 0 | 16.8 / 0 | 6.7 | 2 (15.9) | 3 | 18.2 |
| star + name panel open | 4x | 1 | 93.2 / 93.2 | 0 | 71.6 | 16 | 25.7 / 11.8 / 4.7 / 131.5 | 39 / 38 | 0 | 33.2 / 1 | 4 | 2 (15.9) | 3 | 16.9 |
| star + name panel close | 1x | 1 | 7.4 / 7.4 | 0 | 13.4 | 23.1 | 6.3 / 5.7 / 1.7 / 50.4 | 25 / 25 | 0 | 16.8 / 0 | 0.8 | 2 (15.9) | 4 | 0 |
| star + name panel close | 4x | 1 | 15 / 15 | 0 | - | 16.1 | 5.4 / 4.7 / 4.8 / 70.1 | 21 / 21 | 0 | 33.4 / 2 | - | 2 (15.9) | 4 | 0 |

#### 4-shield

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| peek (capture+JPEG) | 1x | 4 | 0 / 0 | 0.2 | 16.3 | 19.9 | 4.1 / 3.1 / 0 / 17.2 | 18 / 18 | 0 | - / - | 0.2 | 0 (0) | 0 | 19.5 |
| peek (capture+JPEG) | 4x | 4 | 0 / 0 | 0.2 | - | 16.1 | 5.1 / 3.1 / 0 / 16.7 | 17 / 17 | 0 | - / - | - | 0 (0) | 0 | 20.1 |

#### 7-newtab

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heavy page, dark on | 1x | 3 | 1199.7 / 1208.2 | 8.6 | 131.3 | 56.2 | 35.5 / 23.4 / 6.4 / 196.6 | 103 / 98 | 0 | 33.3 / 0 | 761.6 | 18 (148.6) | 11 | 14.7 |
| heavy page, dark on | 4x | 3 | 3917 / 4239.8 | 8 | 217.4 | 47.3 | 183.1 / 98.1 / 14.4 / 741.7 | 453 / 436 | 0 | 66.8 / 15 | 4779 | 18 (148.6) | 11 | 24.2 |
| close that tab | 1x | 5 | 8.6 / 10.6 | 6.4 | 18.8 | 27.3 | 9.7 / 8.5 / 1.5 / 53.3 | 29 / 29 | 0 | 17 / 0 | 4.8 | 2 (15.9) | 2 | 0 |
| close that tab | 4x | 5 | 42.3 / 91.9 | 5.4 | - | 37.8 | 8.6 / 6.2 / 1.6 / 44.7 | 29 / 29 | 0 | 66.8 / 1 | - | 2 (15.9) | 2 | 0 |

#### 8-scroll

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wheel x90, dark on | 1x | 1 | 0 / 0 | 0.3 | 158.5 | 35.8 | 58.5 / 40.6 / 10.6 / 291.8 | 175 / 175 | 0 | 16.8 / 0 | 153.8 | 0 (0) | 0 | 0 |
| wheel x90, dark on | 4x | 1 | 0 / 0 | 0.3 | 109 | 40.5 | 235.7 / 193.6 / 40.2 / 1482.4 | 724 / 724 | 1 (50.8) | 66.7 / 15 | 593 | 0 (0) | 0 | 0 |
| pointing at 20 links | 1x | 1 | 2462 / 2462 | 0.3 | 64.4 | 25.2 | 78.3 / 61.5 / 22.7 / 359.8 | 218 / 218 | 0 | 16.8 / 0 | 32.5 | 0 (0) | 40 | 0 |
| pointing at 20 links | 4x | 1 | 2422.8 / 2422.8 | 0.2 | - | 17 | 63.7 / 47.7 / 17.5 / 331.7 | 218 / 218 | 0 | 16.8 / 0 | - | 0 (0) | 40 | 0 |

#### 7-newtab

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heavy page, dark off | 1x | 2 | 1291.1 / 1335.6 | 8.7 | 116.6 | 38.2 | 49.3 / 28.1 / 5.5 / 200.8 | 100 / 95 | 0 | 16.8 / 0 | 687.2 | 18 (148.7) | 11 | 11.1 |
| heavy page, dark off | 4x | 2 | 1982.7 / 2740.9 | 6.9 | 201.6 | 29.5 | 196.7 / 116.8 / 8.8 / 665.4 | 431 / 421 | 0 | 66.8 / 7 | 908.8 | 20 (165.2) | 12 | 13.5 |

#### 8-scroll

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wheel x90, dark off | 1x | 1 | 0 / 0 | 0.2 | 94.6 | 19.8 | 62.6 / 41.5 / 14.9 / 307.6 | 172 / 172 | 0 | 16.9 / 0 | 146.7 | 0 (0) | 0 | 0 |
| wheel x90, dark off | 4x | 1 | 0 / 0 | 0.2 | - | 58.9 | 41.7 / 32.2 / 6.5 / 240.2 | 167 / 167 | 0 | 66.8 / 16 | - | 0 (0) | 0 | 0 |

#### 9-resize

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 steps then back | 1x | 1 | 0 / 0 | 3.4 | 300.8 | 23 | 37.2 / 33.3 / 8 / 216.9 | 139 / 139 | 0 | 16.8 / 0 | 63 | 0 (0) | 80 | 0 |
| 20 steps then back | 4x | 1 | 0 / 0 | 3.5 | 312.3 | 20.5 | 272.2 / 206.1 / 43 / 1398.6 | 726 / 726 | 0 | 50.1 / 6 | 187 | 0 (0) | 77 | 0 |

#### 10-settings

| interaction | rate | n | visual ms (med/max) | main sync ms | main busy ms | main ELD max | frame style/layout/script/task ms | frame style#/layout# | frame long tasks (max ms) | frame worst frame ms / dropped | tab busy ms | tabs msgs (KB) | setBounds | capture ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| open (first) | 1x | 1 | 298 / 298 | 11.2 | 84.7 | 34.5 | 25.4 / 20.7 / 3.8 / 131.2 | 73 / 73 | 0 | 16.9 / 0 | 169.1 | 2 (16.3) | 2 | 0 |
| open (first) | 4x | 1 | 572.4 / 572.4 | 11 | 84.1 | 17.9 | 30.3 / 21.6 / 2.8 / 149 | 80 / 80 | 0 | 83.3 / 13 | 195 | 2 (16.3) | 2 | 0 |
| switch back to it | 1x | 1 | 10 / 10 | 4.4 | 13.8 | 42.4 | 11 / 12.8 / 3.5 / 72.4 | 38 / 38 | 0 | 16.8 / 0 | 21.5 | 2 (16.3) | 2 | 0 |
| switch back to it | 4x | 1 | 18.6 / 18.6 | 2.8 | - | 16.9 | 9.9 / 9.7 / 1.7 / 50.8 | 34 / 34 | 0 | 33.4 / 2 | - | 2 (16.3) | 2 | 0 |



## 6. After the fixes (2026-10-20, normal CPU, same harness)

Built: curtain never waits on a hidden view; loading stripes only while loading; update glow as an opacity pulse;
ready-built ad blocker kept on disk; address and bookmarks repaint only on change; page position sent only when it
moves; hidden tab list gets no messages and is built 3 s after the window shows; no page picture on address-bar
hover; tab-list hover wait 0.25 s (his pick); tabs saved only when something changed, asking only the tabs he used.
Not done: dark mode earlier (would flash white before pages darken), tab list as its own small page.

| | Before | After |
|---|---|---|
| Curtain picture (hidden view) | never finished, 400 ms timeout | 3 ms |
| Waking a tab (median of 10) | ~800 ms | ~530 ms |
| Frame work per tab switch | ~22 ms, 2 page moves | ~12 ms, 1 page move |
| Heavy page load | 1.2-1.3 s, 18 messages, 11 page moves | 0.96-1.1 s, 9 messages, 2 page moves |
| Tab list, first open | 188 ms | 10 ms |
| Tab list, hover open | ~410 ms | ~265 ms |
| Idle, no update | 60 redraws/s, frame 0.6% CPU | 0 redraws, frame 0% |
| Idle, update waiting | frame 1.9% CPU, GPU 2.7% | frame 0.4%, GPU 1.8% |
| Ad blocker on start (2nd launch on) | ~900 ms freeze every launch | 36 ms (adcache-check) |

The cold-start row in perf-trace still shows the full build, because the harness starts from an empty folder every run.

## 7. Cold start on his Mac (2026-10-22, MacBook Pro 2017, 2-core i5, 8 GB)

His report: "laggy, slow, takes forever to load and refresh, the tab bar glitches". Measured with
`test/electron/startup-check.ts` (a restored session, front tab a long dark page he had scrolled 3,000 px down, four
asleep; WARM=1 = a normal restart, none = the first start with nothing kept; KEEPTABS=1 = from the tabs the last run
saved). A screen recording of his real Samara starting (scratch only) showed the near-white page area, then the page
at the top, then the jump to his spot.

**Causes, from a CPU profile of the main process** (which also serves Samara's own pages, so any stall there holds up
the window and the band):
- Phishing lists read into a 414,000-entry Map on every start: ~0.8 s plus ~1 s of garbage collection.
- Ad blocker: each paused site (the 7 call sites included) applied as its own engine update, ~0.5 s; and once a day the
  first start waited for 5 list downloads and a ~1.8 s rebuild on the main process.
- Scroll put back only at `did-finish-load` (every picture loaded): the page sat at the top for up to ~15 s, then jumped.
- The page area painted `#f6f3ee` until the page drew, a white flash on dark sites.
- Found on the way: Ghostery ignores `@@||site^$document` for a page's own requests, so "let ads through here" (and the
  call sites) never worked. Now `@@*$domain=site` (test/electron/adrefresh-check.ts proves it against the real lists).

**Fixes:** phishing lists kept as sorted 64-bit fingerprints (index-v1.bin, read in ~5 ms, built in steps when a list
changes); kept ad lists used at once even when a day old, fresh ones fetched and built in a worker thread
(skip/adbuild-worker.mjs) and swapped in with the same paused sites; pauses applied in one update; Chromium's own page
state saved per tab (`navigationHistory.restore`) so the page draws where he left it, with a dom-ready fallback; the
page area painted the page's own last colour.

| On his Mac | Before | After |
|---|---|---|
| First start: window shown | 8.7-9.6 s | 1.1-1.5 s |
| First start: page drawn | 12.9-15.9 s | 1.9-2.9 s |
| First start: longest main-process freeze | 3.2-6.3 s | 0.4-0.5 s |
| Normal restart: window shown | 2.0-2.9 s | 1.1-1.5 s |
| Normal restart: page drawn | 2.9-4.0 s | 1.9-2.4 s |
| Back at his scroll spot | 17-18 s (a jump) | on the first frame |
| Page area before the page draws | near-white | the page's own colour |
| A day-old start of the ad blocker | ~1 s (waited for downloads) | ~60 ms |
| Phishing lists on start | ~0.8 s + GC | ~5 ms |

Not covered here (needs the PC or his eyes): the castLabs engine and Widevine wait in macmain (stock Electron in the
harness), the real window on his screen, and Windows.
