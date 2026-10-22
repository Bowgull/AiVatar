# Performance sweep (2026-10-22)

His ask: "I don't want to be sucking up GPU and CPU with this build... keep features alive but improve where needed."

**The short answer:** at rest, Aang is already light. Everything Aang runs together (pet, brain, Shell and its 13
helper processes) used about **4.5 % of one core (0.55 % of the PC)** and almost no graphics card with Samara closed.
The real costs are elsewhere: **video in Samara** (about half a core and a third of the card's video engines while a
Twitch stream played), **memory** (the Shell holds ~770 MB with Samara closed), the **pet redrawing its whole window 20
times a second** while a Claude job works, and **Qwen holding 13 GB of the card** for up to 5 minutes after a job.

Branch `perf/sweep` (worktree `AangApp-wt-perf`). Nothing here is live until he merges, rebuilds Release and restarts.

---

## How it was measured

Read-only, on his live session (Release `Aang.exe`, brain, castLabs Shell), nothing clicked, no keys sent:

- **CPU:** `TotalProcessorTime` deltas per process over 57-60 s (8 vCPU EPYC). "% core" = share of one core.
- **GPU:** `\GPU Engine(*)\Utilization Percentage`, 6 samples x 9 s, mapped to pids through `pid_N` in the instance name.
- **Memory / handles / threads:** `Get-Process` (private bytes and working set).
- **Windows:** `EnumWindows` on the Shell and pet pids (size, visible, layered, topmost); renderers mapped by start time
  and `--renderer-client-id`.
- **Brain scan:** the real `TranscriptScan` timed with `process.cpuUsage()` against his real `~/.claude/projects`.
- **Ollama:** `ollama ps` (nothing resident at the time), `nvidia-smi`.

Two states were caught: **Samara open on a live Twitch stream** (it was already playing; nothing was started) and,
a few minutes later, **Samara closed, idle**. Cemu was running during the idle sample (it owned the card: 29 % on its
graphics engine); WoW was not running.

### Raw numbers

| Process | Twitch playing in Samara | Samara closed, idle | Memory (private) |
|---|---|---|---|
| Shell GPU process | **24.0 % core**; card: video decode **17.5 %**, 3D **14.5 %** | 0.15 % | 226-301 MB |
| Twitch tab renderer | **21.1 % core** | (closed) | 406 MB |
| Samara frame renderer | **5.2 % core** | (closed) | 50 MB |
| Shell main | 1.0 % | 0.3 % | 194 MB |
| Bubble renderer (hidden) | 0.5 % | 0.3 % | 41 MB |
| 7 other hidden renderers | 0-0.2 % each | 0-0.05 % | 24-31 MB each (~190 MB) |
| **Aang.exe (pet)** | 1.3 % | **1.8-2.4 %** | 45-49 MB |
| **Brain (node)** | 1.4 % | **1.3-1.4 %** | 143 MB |
| Ollama | 0 % | 0 % | 89 MB, **no model resident** |
| **Shell tree total** | | | **773 MB private** (14 processes), 1.6 GB working set |

Not Aang, but seen on the card at idle: Rainmeter (BloodWired skin) **9 % 3D**, the Claude desktop app 6 % 3D,
ShadowStreamer (the cloud PC's own video encoder) 22-33 %.

---

## Ranked table

| # | Thing | Measured cost | Why | Fix | Status | Risk |
|---|---|---|---|---|---|---|
| 1 | **Video playing in Samara** (Twitch, full window) | ~50 % of one core (6 % of the PC) + 17 % video-decode + 14 % 3D on the card | Hardware decode, then every frame composited by the GPU: video overlays are off for the whole engine (`main.ts:67`), because Shadow cannot capture an overlay (6.1). Plus Twitch's own page (chat). | None safe from our side: overlays must stay off for Shadow. The 5 % in Samara's own frame during playback is NOT explained (see P1). | Proposed (P1) | - |
| 2 | **Shell memory** | 773 MB private with Samara closed: main 194, GPU 226, 8 hidden pre-built renderers ~230 | Bubble, input, wheel, menus, rune layer, page menu etc. are built hidden at start so they open instantly; each is its own ~25-40 MB process. | **Done:** the Discord card window now closes after 60 s idle (it stayed forever after the first card). Proposed (P2): build rarely-used windows on first use and drop them after a while. | Part done | Low / P2 medium |
| 3 | **Pet redraw** | 1.3-2.4 % of a core, steady, the biggest idle CPU user; ~45 MB/s of bitmap handed to the compositor | While any Claude job works (nearly always for him) the pet redraws its **whole 770x740 window 20x a second** for the breathing glow, though only the 336x336 around Aang changes. | Proposed (P3): send only the changed rectangle (`UpdateLayeredWindowIndirect` with a dirty rect), est. ~5x less to the compositor and ~half the CPU. **Done:** the WoW process-list poll (290 processes) now only runs while he is docked, every 3 s instead of 1.5 s. | Part done | P3 medium (his pet, needs his eyes) |
| 4 | **Brain transcript scan** | **150-190 ms CPU every 10 s = 1.5 % of a core**, i.e. nearly all of the brain's idle CPU | Stat-ed all 658 Claude transcripts every 10 s to find the 3 fresh ones. | **Done:** Windows tells the brain which files changed (one recursive directory watch); a pass looks only at known + changed files (measured **~3 ms**), and the full walk runs every 3 min as a safety net. | Done | Low: no watch = old behaviour |
| 5 | **Qwen holding the card** | **13 GB of 15 GB VRAM** for up to 5 min after a local job, even into a WoW session | Ollama keeps a model 5 min; only the *next* local job noticed the game and unloaded it. | **Done:** the moment the pet reports WoW in front (quiet), the brain unloads Qwen (`keep_alive: 0`, a no-op when not loaded; a job mid-answer finishes first). | Done | Low |
| 6 | **Cemu not counted as a game** | A Qwen job while he plays Cemu would load 13 GB beside it | `GAME_PROCESS` (gpu.ts) and `looksVisual` (screen.ts) knew WoW, Overwatch, etc., not Cemu. | **Done:** `cemu` added to both lists (and the test that keeps them in step). | Done | Low |
| 7 | **Samara password probe** | A script run in the front tab every 1.5 s, all day, behind WoW or minimised | `lookForLogin` (item 10 of samara-perf-baseline.md, never done). | **Done:** only while a Samara window has the focus; the key still appears within 1.5 s of coming back. | Done | Low |
| 8 | Ollama embeddings cold start | First memory search after 5 idle min: model load > 3 s timeout, so keyword-only search for 2 min | embeddinggemma uses Ollama's default 5 min keep-alive. | Proposed (P4) | Proposed | Low |
| 9 | Hidden windows never throttle | ~0 measured now | `backgroundThrottling: false` is in `SAFE_WEB_PREFERENCES`, so every hidden window's timers and CSS animations run at full speed. | Proposed (P5) | Proposed | Medium |
| 10 | See-through windows over the game | Not measured today; 6.1 measured a see-through window costing the card 29 % -> 47 % | Notes, timers, pinned snips, Claude job cards and the bubble are all `transparent: true`. | Proposed (P6) | Proposed | - |
| 11 | Family "pulled apart" shimmy | (not measured) | `familywin.ts:688`: a 16 ms main-process timer that moves windows 60x a second for as long as a group stays pulled apart. | **Left for the family agent** (that file is theirs). Suggest: shimmy a few times, then rest. | Listed | - |
| 12 | Timer pop-out | 82-86 MB each (2x other pop-outs, TASKBAR-POPOUTS-RESEARCH) + `setInterval(paint, 200)` | The timer page. | **Left for the timer redesign agent.** Suggest: paint once a second unless under a minute; stop while hidden. | Listed | - |
| 13 | Brain event-loop monitor | negligible | `monitorEventLoopDelay` at 20 ms resolution (50 timer wake-ups a second). | Leave: tuned on purpose 2026-10-21. | No change | - |
| 14 | Rainmeter BloodWired skin | 9 % of the card's 3D at idle | Not Aang. | His call (P7). | - | - |

---

## Before and after (estimates from the measurements above)

| | Before | After |
|---|---|---|
| Brain at rest | ~1.4 % of a core | **~0.2-0.3 %** (scan ~3 ms per 10 s + watch events + one 160 ms walk per 3 min) |
| Pet at rest, undocked | 1.8-2.4 % | ~1.6-2.2 % (process-list poll gone); **~0.8-1 %** more with P3 |
| Card window | ~25-35 MB held forever after the first card | released 60 s after the last card |
| Samara in the background | front tab woken every 1.5 s | not woken |
| VRAM when tabbing into WoW after a Qwen job | up to 13 GB held for up to 5 min | given back at once |
| All of Aang at rest | ~4.5 % of one core (0.55 % of the PC) | **~3 % of one core (~0.4 % of the PC)** |

---

## What was changed (branch `perf/sweep`)

- `src/Core/src/claudescan.ts`: watch-driven transcript scan + 3-minute full walk; `stop()` closes the watch.
  Test: `test/claudescan.test.ts` (new case: a session started after the walk is found through the watch, a helper's
  deeper transcript is ignored, an append is picked up). 8/8 pass.
- `src/Core/src/core.ts` (`presence`): unload Qwen as quiet turns on. Test: `test/gameunload.test.ts` (a fake Ollama;
  once on entering, not again while in the game, again after leaving and coming back). Pass.
  Note: `proactive.test.ts` also sends `quiet: true`, so it now sends one harmless unload to the real Ollama.
- `src/Core/src/gpu.ts`, `src/Core/src/screen.ts`: `cemu` in both game lists. Test: `test/gpu.test.ts`, 5/5 pass.
- `src/Shell/src/browser.ts` (`lookForLogin`): only while a Samara window has the focus.
- `src/Shell/src/cardrender.ts`: window released after 60 s idle (`idleMs` option), rebuilt on the next card.
  Check: `npx electron test/electron/card-idle-check.ts` (off screen), all pass.
- `src/Body/PetWindow.cs`: WoW poll only while docked, every 3 s. Debug build in the worktree: 0 errors.
- Type checks: `tsc -p .` clean in Core and Shell.

---

## Proposals that need his say

- **P1. Find the 5 % in Samara's frame during a stream.** Its own frame (tabs and band, not the page) used 5 % of a
  core while Twitch played. Suspects: Twitch's ad frames firing "loading" over and over (each one redraws the tab list
  and restarts the loading stripes), or a looping glow. Next step: one `perf-trace` run on a live stream. Costs his
  machine a minute of video; no quota.
- **P2. Build rarely-used windows on first use, drop them when idle** (wheel, Aang menu, family menu, rune layer, page
  menu): about 25-35 MB each, ~150 MB in all. Trade: the first open after a while takes ~150-300 ms instead of instant.
  The bubble and typing box stay pre-built.
- **P3. Pet: redraw only what changed.** Same pixels on screen; ~5x less handed to the compositor. Needs a look at the
  Debug pet on his desktop (docked and standing, glow, Claude mark, old bubble mode) before it goes live. Cheaper
  alternative: breathe the glow at 10 fps instead of 20 while WoW is in front.
- **P4. Embeddings warm.** Keep embeddinggemma (0.6 GB) loaded 30 min instead of 5 outside games, so memory searches
  stop falling back to keywords after a quiet spell; unload it with Qwen when a game starts.
- **P5. Let hidden windows sleep.** Turn background throttling back on for windows that are hidden (menus, card,
  wheel, hidden bubble), keep it off for the pop-out and anything that must keep moving over WoW. Measured gain today is
  ~0, so this is insurance against a future looping animation, with some risk to "rAF stalls" behaviour the bubble
  already works around.
- **P6. Opaque over the game.** The video pop-out already defaults to opaque (6.1). Notes, timers and pinned snips
  could draw opaque while WoW is in front and go see-through again outside it. Changes their look over the game.
- **P7. Not Aang:** Rainmeter's BloodWired skin uses ~9 % of the card's 3D engine all the time.
- **Pet quiet for Cemu:** the pet's quiet mode only knows WoW (`QuietProcessPrefixes = { "Wow" }` in his settings).
  Add Cemu if he wants Aang to hold his messages while he plays it.
