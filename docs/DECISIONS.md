# Decisions and the evidence behind them

Every entry says what was measured or read, where, and what it does not prove. Dated 2026-09-20.
The measurement tools are in `tools/` so any number here can be reproduced.

---

## D1. The pet window is a custom per-pixel-alpha layered window in C# (.NET 10)

### Method
One test harness (`tools/measure/harness.ps1`), run identically on every candidate **while WoW Classic
was running** on the Shadow VM (4 vCPU, 16 GB, RTX 2000 Ada, 1080p). Same window size (470x310), same
placement, same animation load (bobbing sprite plus a bubble). Thresholds were fixed before measuring:

| Threshold | Limit | Why |
|---|---|---|
| Private memory, all processes | <= 150 MB | The Rainmeter suite it replaces uses ~115 MB |
| CPU while animating | <= 2% of one core | Rainmeter averaged 50-62% of a core on 2026-09-20 |
| Startup to visible | <= 2 s | Should feel instant |
| Click-through | Transparent pixels pass clicks to the game; sprite and bubble catch them | Must not block WoW's UI |
| Z-order | Stays visible above WoW (borderless) | Must be seen while playing |
| Focus | Never takes focus from the game | Must not interrupt play |

### Results (WoW running)

| Candidate | Processes | Private MB | CPU @ 30 fps | CPU @ 12 fps | Warm start | Click-through |
|---|---|---|---|---|---|---|
| Electron 44.4 | 4 | 153-158 | 13-15% | 8.0% | 0.55 s | Works, but needs a hover-toggle workaround |
| WebView2 host (Tauri's engine) | 7 | 165-166 | 10.9-12.5% | 7.4% | 0.31 s | Not tested (opaque stand-in) |
| Native WPF (.NET 10) | 1 | 61-72 | 4.7% | 2.2% | 0.74 s | Per-pixel, done by the OS |
| **Custom layered window (C#, CPU blit)** | **1** | **12-13** | **0.62%** | **0.62%** | **0.3 s** | **Per-pixel, done by the OS** |

Layered-window frame-rate sensitivity: 1 fps 0.23%, 12 fps 0.62%, 30 fps 0.62%, 60 fps 2.77%.
Every candidate: no focus theft (WoW stayed the foreground window), topmost, layered, no-activate.

Only the custom layered window meets every threshold. WPF misses CPU at 30 fps and is borderline at 12.
Electron and WebView2 miss CPU by 4-7x and use 10x the memory of the layered window.

### Why the layered window wins
It draws pre-rendered frames on the CPU into a shared bitmap and hands it to Windows with
`UpdateLayeredWindow`. No GPU is involved, so WoW saturating the GPU cannot stall it, and Windows itself
treats fully transparent pixels as click-through, so there is no polling or hover-toggling state to get
wrong. It is the technique Rainmeter uses, without Rainmeter's shared single main thread that lets one
slow script freeze every skin.

### What this does NOT prove
- The spike animates a tiny canvas. The real app does more, so every absolute number will rise. The
  ranking should hold because the gaps are large, but the real app must be re-measured.
- Tauri was not built (it needs Rust and MSVC Build Tools). Its engine, WebView2, was measured through a
  stand-in host; the real Tauri host adds a small Rust process. Tauri's missing per-region click-through
  is reported by others ([article](https://dev.to/manasightgg/why-i-chose-tauri-v2-for-a-desktop-overlay-in-2026-597h))
  but was not measured here.
- Godot was not measured; the layered window already meets every threshold.
- CPU was sampled over 20-30 s and is noisy. The 12 fps and 30 fps layered runs read the same to two
  decimals, so treat both as roughly 0.6%.
- One WebView2 run at 30 fps read 16 processes, 18.7 GB private, 177% CPU. Two reruns gave 7 processes,
  165 MB, 11-12.5%. The first run is treated as an anomaly and excluded, and is disclosed here.
- The hit tests moved the real mouse cursor for about two seconds per run; nothing was clicked.
- A screenshot method bug was found and fixed: `PrintWindow` returned a gray box for the layered spike
  until it answered `WM_PRINT`. The gray box was a capture artifact, and the re-capture was checked by eye.

### Costs we accept
We own text layout, animation and DPI handling. Text input uses a separate small native window (real
IME, paste and undo) shown only while typing. Rich screens (settings, history, memory approval) open on
demand in their own window and are not resident, so the always-on part stays around 13 MB.

---

## D2. The brain is Claude, in a separate Node "Core" process, via the Agent SDK

### Evidence
- One persistent `claude` process answered message 2 in **2.1 s** (Haiku 4.5) versus ~4.5 s spawn-per-message,
  using 238 MB. The SDK docs call [streaming input mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
  "preferred": a long-lived process with queued messages, interruption and live output.
- The stream carries `rate_limit_event` with `unifiedWindows.five_hour` and `seven_day` utilization and
  reset times (measured: 1% and 0%). That is a real quota dial.
- Tokens of context per one-line chat turn (TypeScript SDK 0.3.278, Haiku 4.5): 26,103 with defaults,
  25,908 with `settingSources: []`, **7,983 with `tools: []`**. Plain `claude -p` was ~32.7k.
  So there are two lanes: a lean chat lane and a full agent lane.
- Local models failed on facts: `qwen3:1.7b` said "Taj Mahal is the tallest mountain", drifted into
  Polish, copied its own last reply in a loop, and invented "sunny days" weather. Joshua's verdict:
  "awful and get things wrong constantly". Published guidance agrees small models hallucinate more.
  `embeddinggemma` stays for recall and cache, where it measured well.

### Policy facts and risks
- Anthropic's June 15 move of `claude -p` / Agent SDK to a separate monthly credit is **paused, not
  cancelled** ([source](https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026)).
- The headless docs say `--bare`, which ignores subscription login, "will become the default for `-p` in a
  future release". Mitigation: build on the SDK, pin the version, keep an offline fallback.
- Subscription login is for personal use; the SDK docs say third parties may not offer claude.ai login.
- Consumer Terms section 2 forbids sharing account login. Joshua said his girlfriend sometimes uses his
  login; the risk was explained once. Aang reads the account-level quota from the stream and conserves.

---

## D3. Model switching and quota (Joshua's rule)

Chip beside the input: **Auto / Quick (Haiku 4.5) / Smart (Sonnet 5) / Deep (Opus 5)**, Auto by default.
Modeled on [ChatGPT's Auto plus Instant/Thinking/Pro picker](https://the-decoder.com/openai-overhauls-chatgpts-model-selection/)
and [Claude Code's `/model`](https://code.claude.com/docs/en/model-config) (switch and save, or this
session only; fallbacks last one turn; a consent prompt before anything bills extra).

- **40% of the week:** one calm warning line, no behavior change.
- **50% of the week:** Aang asks "Save quota?". Opt-in. On means Quick only, lean lane, no background work.
- While saving is on, picking Smart or Deep asks "use once, or turn saving off?".
- Every reply carries a small "answered by" label; fallbacks are labeled.
- One persistent session per lane, not model swaps inside one session (the docs warn that switching
  models affects the prompt cache).

---

## D4. Voice: in character, no AI slop, understands how Joshua writes

- Anthropic's guidance: [examples are "one of the most reliable ways to steer Claude's output format, tone,
  and structure"](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
  (3-5, relevant, diverse, in `<example>` tags), and to state what to do instead of what not to do.
  Occasional preambles that slip through can be stripped in post-processing.
- Slop is checkable. [Wikipedia's "Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
  lists concrete tells: words like "delve", "tapestry", "testament", "vibrant", "pivotal", "showcasing";
  "not just X, but Y" constructions; "serves as" in place of "is"; emoji as decoration; em-dash overuse;
  vague attribution; tacked-on "-ing" analysis. These become a deterministic linter that runs on every
  reply and in the eval.
- Joshua writes lowercase, drops apostrophes ("isnt", "cant", "youre"), makes typos ("dekstop", "modles",
  "buble"), runs sentences together, and uses vague referents ("the chibi", "whatever it's called").
  Claude interprets; a regex gate does not. Only exact, safe commands take a fast path.
- The earlier sample line "Hey there, friend! Ready to bend some tasks together today?" is exactly the
  slop to avoid: generic, emoji, forced pun.
