# Pop-out performance baseline (2026-10-20)

**What this is:** measured, not guessed, with the same method as `samara-perf-baseline.md`. No file under `src/` or `pages/` was changed.

- **Machine:** Shadow PC (AMD EPYC 9354, 8 cores, 59 Hz, scale 1), Electron 44.7.0.
- **What ran:** the real `Popout` and the real "take the tab with you" path: Samara's frame sends `browser:popout`, then `lend()`, `openTab()`, the close key, `returnTab()` and `giveBack()`. It used the real `wirePopout` and `wireBrowser`.
- **The video:** a local http page shaped like YouTube, playing a 1920x1080 30 fps VP9 clip with a silent audio track, looped (`%TEMP%\popout-perf-media\clip1080.webm`). The page has sound on; Electron muted the tab's output. No network was used.
- **Safe for his desktop:** windows are drawn off screen (x = -6000) with native occlusion off. The cursor is a fake point set by the harness. No OS input was sent. The hotkey, pin and hide were called as functions.

**How to run it (from `src/Shell`):**

- 1x: `npx electron test/electron/popout-perf.ts`
- 4x: `PERF_RATE=4 npx electron test/electron/popout-perf.ts`

**Raw data:** `test/electron/perf-out/popout-1x.json`, `popout-4x.json` and the logs `popout-log-*.txt`.

**Caveats:**

- **The cursor wake fakes the pointer.** The pointer was faked, so the wake path ran through the 150 ms cursor poll, exactly as it does when a lent page swallows the mouse.
- **4x throttles only the renderers.** In OS CPU terms the throttler shows each renderer near 80–100 % at 4x; that is an artifact. Use the CDP task times at 4x. The main and GPU processes are not throttled.
- **See-through was not checked on screen.** The window is off screen, so the cost of DWM compositing a see-through (layered) window was **not** measured (**unverified**). The old on-screen 6.1 measurement is the only number for that.
- **Interaction numbers carry the frame recorder.** A `requestAnimationFrame` recorder ran during interactions (not during idle), so the task ms there include its overhead. The counts (IPC, view moves, layouts) are exact.
- **Open and close are measured from the click to "settled."** "Settled" means the pop-out shows, the page is pinned bare, and the controls have their first state.

---

## 1. Numbers per interaction (median of runs, 1x / 4x)

| Interaction | Time to settle | Main thread | Pop-out page | Lent tab | Native work / messages |
|---|---|---|---|---|---|
| **Open from a tab (lend)**, 3 runs | 560–575 ms / 572–575 ms | 131–150 ms busy; spawn 14–17 ms **blocking** | page loaded at 157–192 ms / 236–308 ms | 15–18 dropped rAF frames, worst gap 200 ms (1st run) | 8–11 view moves, 5–7 `popout:stage`, 1 PowerShell spawn |
| **Close (give back)** | 279–294 ms / 282–299 ms | 27–42 ms | (destroyed) | **267–284 ms frozen** (15–16 dropped frames) | 2 view moves |
| **Wake** (pointer moves over) | 78–94 ms (cursor-poll latency, up to 150 ms) | 10–13 ms | 1.4–1.8 ms style, 1 layout | 2 relayouts | 1–3 `popout:stage` + view moves |
| **Fade out** (2 s after the last move) | 2 s timer, then an instant snap | ~40 ms | 1 layout | **2 relayouts** (picture 786x441 → 786x514) | **4 `popout:stage` + 4 view moves** |
| **Resize**, 40 steps | (drag) | 267–297 ms / 343–360 ms busy; 37–43 ms / 63–71 ms in `setBounds` | 40 layouts, 40 paints; task 101 / 238 ms | **80 layouts** (2 per step); task 104–108 / 265–290 ms | **80 view moves** (2 per step), 40 `popout:stage`, 80 `getContentSize` |
| **See-through drag**, 30 moves | (drag) | 46–53 ms; `setOpacity` 0.08 ms each | 31 forced layouts, 60 paints; task 79–94 / 218–224 ms | 0 | 30 `popout:opacity` **plus 31 `popout:stage` + 31 view moves** |
| **Pin / unpin**, incl. the 2 s notice and re-fade | `setIgnoreMouseEvents` 0.1 ms | 21–27 ms | 44 style recalcs, 3 layouts; task 49–76 / 165–225 ms | 4–5 relayouts | **9 `popout:stage` + 9 view moves** each |
| **Hide** (hotkey function) | 3.7 ms sync (`hide()` 3.6 ms) | 9–11 ms | – | keeps playing | 0 |
| **Show** | 4.6 ms / 8.4 ms sync | 15–19 ms | – | picture back next frame | 0 |
| **Skip plaque** (seek + 3 s plaque) | fired 1.2–1.8 s after the segments arrived (state poll) | small | 24 style recalcs, 1 layout | seek | 1 `popout:tabcmd`; **4 `popout:stage` + 4 view moves** (from `transitionend`) |
| **`diag()`** (the only `capturePage`) | 2 captures, 25–59 ms | on demand only (the Mac's "look from the PC") | – | – | never periodic |

**Open, step by step (1x, run 2):**

| Step | Time after the click |
|---|---|
| Tab removed from Samara | 2.4 ms |
| Pop-out window created | 10 ms |
| BARE_CSS inserted and FOCUS_JS pinned the player | 45–48 ms (first try every time) |
| Window shown | 48 ms |
| softEdge PowerShell spawn | 29 ms (14–17 ms of it blocks main) |
| Pop-out page loaded, first stage set (picture visible) | 157 ms |
| `popout:chrome` | 174 ms |
| First `popout:tabstate` (controls right) | 558 ms |

From about 3 ms to about 160 ms (4x: up to 310 ms) **the video is on screen nowhere**: the view is added at the default stage `{width:0, height:0}`.

---

## 2. Top causes, ranked (file:line)

1. **Every fade, wake, pin notice and pointer move resizes the native picture view; most of these are no-ops (measured).**
   - **The fade** collapses the bar and controls rows instantly: `.frame.faded{grid-template-rows:0 1fr 0 0}` at `pages/popout.css:134`. So the stage grows from 441 to 514 px tall and the lent page relayouts twice per fade cycle.
   - **Three listeners each re-send the stage:**
     - the ResizeObserver (`pages/popout.js:241`)
     - the `transitionend` listener (`:242`), which fires for the bar, both control rows, the key-press `top` transition and the skip plaque
     - a MutationObserver on `class` (`:244`)
   - **Each send runs on main:** `sayStage()` does a forced `getBoundingClientRect` (`:240`) and sends `popout:stage`. Main then runs `setStage()`, which calls `getContentSize` and `view.setBounds` even when nothing changed (`src/popout.ts:73-79`).
   - **Measured:** 4 view moves per fade, 1–3 per wake, 9 per pin or unpin, 4 per skip plaque.
   - **Every pointer move:** `showChrome()` (`popout.js:204-210`) runs on every `pointermove`, `pointerdown`, `wheel` and `keydown` (`:212-214`). It calls `classList.remove('faded')` even when the class is absent, and the MutationObserver still fires on that. So each pointer move over the pop-out costs 1 IPC, 1 forced layout and 1 native `setBounds`. The 30-move slider drag measured 31 of each, about 7 ms of pop-out page work per move at 4x.
2. **The fade is not a fade (measured, look).** The rows snap to 0 at once: the bar measured 34 px, then 4 px right after `faded`, still 4 px at 100 ms. So the 0.35 s opacity transition (`popout.css:132`) plays on a strip nobody can see. The picture also jumps size, re-letterboxing the video each time. The `border-radius` transition (`:135`) is dead, because `:159-160` set the radius to 0 in both states.
3. **Resize does the work twice per step (measured).**
   - `follow()` sets the view synchronously (`src/popout.ts:87-93`, from `resize` at `:257`). Then the page's ResizeObserver echo sets it again through IPC (`popout.js:241` → `setStage`).
   - **Per 40 steps:** 80 `setBounds` (37–43 ms of main at 1x, 63–71 ms at 4x), 80 `getContentSize` and 80 lent-page layouts.
   - No long tasks and at most 1 dropped video frame, so it is not janky here. On the 2-core Mac it is double the work for nothing.
4. **Opening shows no picture for about 110–260 ms, and the controls are blank until about 550 ms (measured).**
   - The view starts at the default stage `{x:0, y:34, width:0, height:0}` (`src/popout.ts:70`, `:102`). It gets a size only when the freshly created pop-out page loads and reports, at 157–192 ms (236–308 ms at 4x).
   - The first state arrives only on the first 500 ms tick (`src/popout.ts:120-126`), so there is no immediate poll.
   - Each open builds a new window and page, because `close()` destroys it (`:447-455`). That is window creation, page load, `lockDown` and `softEdge` every time.
5. **Every open blocks main 14–17 ms to spawn PowerShell (measured).** `softEdge()` (`src/winedge.ts`, called at `src/popout.ts:245`) spawns `powershell.exe` with `Add-Type` for one DWM call. The child process's own CPU was not measured (**unverified**; typically several hundred ms on another core).
6. **Closing freezes the video about 270 ms (measured, deliberate).**
   - `giveBack()` keeps the view hidden for a fixed 250 ms so the site re-lays itself out out of sight (`src/browser.ts:2483-2485`).
   - Measured: a 267–284 ms worst frame gap and 15–16 dropped frames in the tab.
   - `src/browser.ts` is being edited by another session; these line numbers may move.
7. **Two main-process timers run for the whole life of a lent tab (measured, small).**
   - **State poll:** `executeJavaScript` into the tab plus `popout:tabstate` to the page, 2 per second (`src/popout.ts:120-126`). It runs while hidden and while paused (29–30 per 15 s in both states).
   - **Cursor poll:** every 150 ms, `getCursorScreenPoint` + `getBounds` (`:111-118`). It returns early while hidden or pinned, but keeps ticking.
   - **A/B, both timers stopped:**
     - Pop-out page task: 8.4 → 1.6 ms per 15 s (1x) and 38 → 9.5 ms (4x).
     - Tab task: 30.6 → 18.1 ms (1x) and 88 → 58 ms (4x).
     - Main: within noise (73–121 ms busy per 15 s in all variants).
   - **Not measured:** when a page has no live video (`STATE_JS` returns null), the poll re-runs FOCUS_JS (a DOM walk that rewrites attributes up the tree) every 500 ms, forever (`:124`). Its cost on a heavy page is **unverified**.

**Not costly (measured):**

- `setOpacity`: 0.08 ms per call.
- `setIgnoreMouseEvents`: 0.1 ms.
- `hide()` / `show()`: 3–8 ms.
- `paintControls` on each tabstate: 0 frames and 0 paints in the pop-out page, because its targets are hidden.
- `diag()`: on demand only.

**No WoW or foreground checks** exist in `popout.ts` or `popoutipc.ts`. The only polling near the pop-out outside it is `watchBusy` every 250 ms in `src/main.ts:562`, which checks `popout.window.isVisible()` for Ctrl+Alt+P; that check was not measured.

## 3. Idle while a video plays (15 s, 1x; OS CPU = % of one core, all threads)

| State | Main | Pop-out page | Lent tab | GPU process | Pop-out frames | IPC / s | execJS into tab / s | Video fps (dropped) |
|---|---|---|---|---|---|---|---|---|
| Same video in Samara, no pop-out (baseline) | 0.9 % | – | 3.3 % | 11.4 % | – | 0 | 0 | 32 (0) |
| **Pop-out, controls faded** | 0.6 % | 0.1 % (8.4 ms task) | 4.7 % | 11.3 % | **0** | 1.9 tabstate | 1.9 (+6.4 `getBounds`/s) | 31 (2) |
| Controls always shown | 1.6 % | 0 % | 3.5 % | 12.6 % | 0 | 1.9 | 1.9 | 31 (6) |
| See-through 60 % (off screen) | 1.5 % | 0 % | 2.2 % | 12.9 % | 0 | 1.9 | 1.9 | 31 (10) |
| **Hidden** (hotkey) | 1.3 % | 0 % | 2.5 % | **0.8 %** | 0 | **1.9 (still)** | **1.9 (still)** | 19, still playing |
| Video paused | 1.7 % | 0.1 % | 0.3 % | 0.2 % | 0 | **1.9 (still)** | **1.9 (still)** | 0 |
| A/B: both timers stopped | 1.6 % | 0.1 % (1.6 ms task) | 2.9 % | 12.8 % | 0 | 0 | 0 | 31 (9) |

- **The pop-out itself costs almost nothing at rest.** It has no animations, no rAF and no redraws; the trace shows 0 frames and 0 paints in its page while faded. The cost of a playing pop-out is the video, and it equals playing the same video inside Samara.
- **Hiding is the real saver:** GPU 11 % → under 1 %.
- **Dropped video frames** vary 0–17 per 465 in every state. They cannot be pinned on the pop-out (noise).
- **4x anomaly (unverified):** at 4x, hidden, the tab's task time jumped to 577 ms per 15 s (25 ms at 1x). It is a throttled background tab; the cause was not checked.

## 4. Ranked fix list

| # | Fix | Gain | Risk | Look? | How to verify |
|---|---|---|---|---|---|
| 1 | Stop the no-op stage traffic. `showChrome()`: only remove `faded` if present (`popout.js:206`). `sayStage()`: send only if the rect changed (cache it). `setStage()`: skip `setBounds` when equal (`popout.ts:73-79`). Drop the MutationObserver or `transitionend` duplicate (keep the ResizeObserver). | Pointer moves and slider drags: 31 → 0 IPC, view moves and forced layouts per 30 moves. Fade 4 → 1, pin 9 → 2, plaque 4 → 0. About 7 ms per move saved at 4x. | Low | No | `popout-perf.ts`: `5-see` stage = 0, viewBounds = 0; `3-fade` stage ≤ 1; `6-pin` ≤ 2 |
| 2 | Give the view its picture before the page loads. Compute the initial stage from `getContentSize()` and the known bar (as `follow()` does) in `openTab` (`popout.ts:102`). Poll the state once immediately instead of waiting 500 ms (`:120`). | Picture gap on open about 110–260 ms → about 0. Controls right at about 50 ms instead of about 550 ms. | Low | No | `1-open` extra: tab rAF max < 50 ms; `firstTabstate` < 100 |
| 3 | Keep the pop-out window: hide it on close instead of `destroy()`, and reuse it on the next open (`popout.ts:447-455`). With #2, open becomes window show + addChildView. It also removes the per-open `softEdge` spawn. | Open about 560 → about 60 ms. −15 ms main block and −1 PowerShell start per open. | Medium: state must reset cleanly (pinned, opacity, segments, settings). Memory about 30–50 MB kept (**unverified**). | No | `1-open` settledMs, spawn = 0 after the first |
| 4 | Resize: set the view once per step. Skip `follow()`'s setBounds when the page's echo will match, or skip the echo while a drag is in progress (`popout.ts:87-93`, `popout.js:241`). | 80 → 40 `setBounds` and lent-page layouts per 40 steps. About −20 ms main at 1x, −35 ms at 4x. | Low to medium: his 2026-10-13 lag fix relies on `follow()` being synchronous, so keep that one. | No | `4-resize` viewBounds = 40, tab layoutN ≈ 40 |
| 5 | Pause the state poll while hidden or paused (back off to 2 s), and stop the cursor interval while hidden or pinned instead of returning early. Cap the FOCUS_JS re-pin retries when the page has no video (`popout.ts:111-126`). | Hidden or paused: 2 tab wake-ups/s → 0.5 or 0. Avoids an endless DOM walk on video-less pages. | Low | No | `2-idle` hidden/paused: execjs ≤ 0.5/s |
| 6 | `softEdge`: one call with no PowerShell, or reuse a single long-lived helper (`src/winedge.ts`). | −14–17 ms main block per new window (pop-out, Samara, timers). | Low to medium (native call path) | No | spawn count/ms in `1-open` |
| 7 | Make the fade a real fade or an honest snap. Today the rows collapse at once, so the 0.35 s opacity fade is invisible and the picture jumps (`popout.css:132-136`). Options: (a) drop the dead transitions (cheapest, same look as now); (b) a real fade, which needs the bar and controls to stay in place while fading and collapse after the fade (1 view move, at the end); (c) controls over the picture in their own small view. | (a) nothing measurable. (b) the same 1 view move, but it looks smooth. | (b)/(c) **change the look: ask him** | **Yes** for (b)/(c) | Probe "what the fade looks like": bar height steps down over 350 ms |
| 8 | Close: replace the fixed 250 ms hidden wait with "show after the tab's first frame at the new size" (one `resize` + rAF from the tab), with 250 ms as the cap (`browser.ts:2484`). | Frozen picture on close about 270 → about 50 ms (**unverified**). | Medium: the odd resize he saw on 2026-10-12 could come back. `browser.ts` is under concurrent edit. | Possibly (a brief re-layout) | `1-open` close: tab rAF max < 80 ms |

## 5. Static audit (`pages/popout.css`, `popout.js`, `player.js`, `skipper.js`)

- **CSS:**
  - 71 rules, 0 `:has()`, 0 `@keyframes`, no infinite animations. 1 universal selector (`*{box-sizing}` reset, harmless). No `backdrop-filter`, no animated `filter` or `box-shadow`.
  - `getAnimations()` on the live page: none running.
  - **Transitions:**

    | Rule | What it animates | Composited? | Note |
    |---|---|---|---|
    | `.bar` / `.ctrl` | opacity .35 s | yes | invisible, cause 2 |
    | `.frame` | border-radius .35 s | – | dead |
    | `.ico` | `top` + box-shadow .05 s | no (layout) | on press only; its `transitionend` re-sends the stage |
    | `.skip` | opacity + transform .18 s | yes | good |

  - **The one layout change that matters:** `grid-template-rows` switching on `.faded` (`:134`).
- **Layout reads in `popout.js`:**

  | Line | Read | When |
  |---|---|---|
  | 61 | `getBoundingClientRect` (`along`) | each groove pointer event, right after the previous move's style writes, so forced |
  | 232 | `offsetHeight` (`reportChrome`) | once, with a class toggle around it |
  | 240 | `getBoundingClientRect` (`sayStage`) | on every class mutation, resize and `transitionend` (cause 1) |

  None run in a rAF loop.
- **Timers:**

  | Timer | Where | Runs |
  |---|---|---|
  | Cursor poll every 150 ms | `popout.ts:111` | always while lent |
  | State poll every 500 ms | `popout.ts:120` | always while lent |
  | Focus retries, 10 × 500 ms | `popout.ts:136-145` | open only; succeeded first try in all runs |
  | `afterDrag` debounce 180 ms, then 250 ms | `popout.ts:328`, `:349` | after drags |
  | Fade timer, 2 s | `popout.js:209` | while playing |
  | Pin notice, 2 s | `popout.js:131` | after pin/unpin |
  | YouTube embed "listening" retries, 500 ms × ≤ 11 | `player.js:55` | embed path only, not measured (needs network) |
  | Plaque, 3 s | `skipper.js:51` | per skip |

- **`capturePage`:** only in `diag()` (`popout.ts:441-443`), on request from the Mac. It is not periodic.

**Not measured:** the YouTube/Twitch iframe embed path (needs network), and paid services in the castLabs window.

**Note for him:** one harness run had a typo in the test file. Electron's "App threw an error during load" box may have shown on his screen for up to about 10 minutes, until the run's timeout closed it. The file is now syntax-checked before every run.

## On his Mac (2026-10-22, MacBook Pro 2017, 2-core i5)

His report: "videos in the pop-out are laggy; putting them in the pop-out and taking them off, no smooth transition".
Measured ON SCREEN with `test/electron/popout-film.ts` (real AangBrowser, Popout and wiring, a local 1080p30 VP9 clip,
the video's own presented frames via requestVideoFrameCallback, 3 open/close cycles; FILM=<file> also films the
screen; SKIP=capture,radius,focus,css,poll switches pieces off). A two-window probe showed that moving a playing
view between windows, the bare-page CSS, the page picture and the window hiding do not stall the video on this Mac.

| | Before | After |
|---|---|---|
| Close: video back in Samara | 561-565 ms (Samara showed its "playing in the pop-out" plate) | 3-5 ms |
| First open: picture settled with its frame | ~1.2 s (window built on the click, picture bare meanwhile) | ~10 ms (built hidden when a video starts) |
| Samara stepping aside (Mac) | the Dock's minimize animation and back | a 150 ms fade out and in |
| Video while popping out | 5-8 frames per 1/4 s (smooth) | the same |

Causes and fixes: the page was unpinned and paused only after it had left the pop-out, and a hidden page answered in
~0.55 s; now it is done while still on screen (the pop-out goes see-through at once), then the page goes home and the
pop-out hides together (`returnTab`, `close`). The pop-out is built ahead (`prewarm`, on `media-started-playing`).
On the Mac `tuckFor` fades Samara instead of minimizing; Windows keeps minimize. The video still comes home paused
(his rule, reconfirmed 2026-10-22).
