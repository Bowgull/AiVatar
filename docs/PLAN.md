# Aang build plan

Goal: a finished desktop companion that feels good to chat with, never freezes, and stays cheap enough
to run beside WoW. Not a first version. Each milestone ends with a gate that must pass before the next
starts. Decisions and evidence: `docs/DECISIONS.md`.

## Status (2026-09-20)

| Milestone | State |
|---|---|
| M0 Foundations | Layout, protocol v1 (`docs/PROTOCOL.md`), 3 unit tests, measurement tooling: done. Core process not started (M2). |
| M1 Body renders Aang | Functionally complete. Gate results below. |
| M2 Core talks | Built and gated (below). Not yet reachable by Joshua: the Body has no input box until M3. |
| M3 Chat feels right | M3a (bubble) and M3b (input box, hotkey, click Aang, history, arrow/expand/scroll) built and gated: 27/27 real-input checks (tests/fakecore/typing.mjs), 18/18 Body unit tests. M3c built and gated: model chip, saving pill, week/5h meter with 40/50% colours, consent prompt, reconnect re-sends saving; 23/23 real-input checks (tests/fakecore/chip.mjs). Autostart built: the Body registers itself under Start with Windows on first run (tray toggle), starts the Core if nothing is listening, restarts it with a growing pause if it dies, and a job object kills the Core when the Body goes (6/6 in tests/fakecore/supervisor.mjs). Usage numbers hide behind a clickable gauge. Rainmeter Aang and AangEdge deactivated 2026-09-20 (files kept). Found and fixed by the tests: a click on Aang or his bubble while the input box was open was swallowed. Reply rating built: hovering a finished reply shows copy / good / not good on the bubble edge; a rating goes to the Core, which appends it with the turn to ratings.jsonl for the voice review (12/12 in tests/fakecore/rate.mjs). M3 complete. |
| M4-M5 | Not started. |

**M2 gate, measured against real Claude (Core in `src/Core`, TypeScript, pinned Agent SDK 0.3.278):**

| Gate | Result |
|---|---|
| Acknowledge within 100 ms | 1-2 ms |
| Plain Quick chat, first token within 800 ms | median 464 ms (min 444, max 497) with extended thinking disabled; 1,369 ms with it on |
| Tool turn (two model round trips) | first text about 1.4 s |
| Stop | bubble clears in 5-6 ms and the Core answers normally afterwards |
| Queue | second message reported as queued, answered in order |
| Live quota | real `rate_limit_event` numbers reach the Body (five-hour 15%, week 2% at test time) |
| Saving quota | opt-in only; bigger model needs consent, `once` grants a single turn |
| Grounding | time and weather come from tools and match them; memory answers state exactly what was and was not found; Aang says it cannot see itself |
| Voice lint | 0 of 10 live replies flagged |
| Context per turn | 2.0-5.7k tokens (26k with SDK defaults, 16k with the claude.ai connectors loaded) |
| Full stack on screen | 14 of 14 end-to-end checks with the real Body, reviewed by eye |
| Unit tests | 39 Core, 6 Body |

**Found and fixed while gating (each by a real run, not by reading code):**
- Private reasoning leaked into the bubble twice (`<thinking>` block, then invented `<system-warning>` text with mismatched tags). The sanitizer is now a state machine tested character by character as a stream. The leak is intermittent (about 1-2 in 12 turns, mostly the first plain turn after a tool call). An early belief that my own prompt sentence caused it did not survive a rerun, so prompt wording is not treated as a fix.
- `search_memory` ranked by recency, so stopwords buried the real match, and it could recall replies from the retired local models ("Taj Mahal is the tallest mountain"). It now ranks by relevance and excludes those replies.
- A malformed `submit` threw inside the message handler; `Core.stop()` hung while any client was connected. Both fixed and tested.
- A finished long reply showed its tail, starting mid-sentence. It now starts at the top and pages down.
- The live test wrote into Joshua's real memory; it now works on a copy.
- Aang claimed to see the screen and to have seen how it animates; the prompt, an example that taught this, and the linter were corrected.

**Not done, deliberately or not yet:** no fast-path commands (Claude handles everything, including typos, in about 0.5-1.5 s; actions come later); no full agent lane with web tools yet; semantic recall (embeddings) not ported, only full-text search; supervisor and autostart are M5.

**M1 gate, measured on the real Body with WoW running:**

| Gate | Result |
|---|---|
| Idle CPU <= 1% | 0.92% of one core with the idle loop animating at 6 fps; 0.31% floor when frozen (quiet) |
| Memory <= 150 MB | 20 MB private, 60 MB working set, 1 process |
| Startup <= 2 s | 0.4 s |
| Never steals focus | WoW stayed the foreground window in every run |
| Click-through | Sprite pixel catches; transparent pixels and a hidden bubble's area pass through to the game |
| Streaming steadiness | Automated test: earlier lines never re-wrap as text arrives |
| Ten animation states | All ten captured over live WoW; idle, think, talk, nap, zip and spin reviewed by eye |
| Quiet mode | A proactive message is held while quiet and delivered when quiet ends (reviewed by eye) |
| Drag, remembered position, single instance | Passed with real mouse input, including with WoW verifiably in front |
| Hotkey | Passed with real key input, but only after a fix (see below) |
| Protocol | Hello, ping/pong, presence, and unknown messages ignored: 21 of 21 scenario checks |

**Found and fixed while gating:**
- The foreground-process lookup used `Process.ProcessName`, which snapshots every process; it cost ~1.1% CPU when polled twice a second. Replaced with a cached `QueryFullProcessImageName`.
- Ctrl+Alt+A and Ctrl+Alt+Space are already taken by other programs here, so the hotkey silently failed. It is now configurable with a fallback list, defaults to Ctrl+Shift+Space, and the tray shows the one in use.
- My own test read "foreground WoW" while Notepad was really in front; the test now records the foreground window and mouse-capture state.

**Not yet verified (do not assume):**
- One drag test failed once (window did not move, no mouse events logged) while WoW was on a loading screen. Three later runs passed, including with WoW verifiably in front and no mouse capture. The cause is unconfirmed.
- DPI at 125% and 150%, multi-monitor, the tray icon's appearance, autostart, and the remaining animation states (look, scooter, walk, talk, hello) reviewed individually.
- All numbers are for the Body without the Core, the input window or the model chip; re-measure at every milestone.

## Commitments added by Joshua (2026-09-20)

1. **Speech bubble long-reply behavior.** Screenshot from Joshua: a long reply was cut mid-sentence and the tail
   was misaligned. Built (M3b), per Joshua's Zelda/N64 idea: the bubble fills 6 lines and cuts anywhere with
   "..." and a bobbing down-arrow; clicking it grows the bubble upward to ~12 lines with a scrollbar (wheel, drag,
   click track); it waits for the click (no auto-advance); Esc or a click outside closes it (Esc is swallowed
   while open so WoW's menu does not appear). Bubble and tail are one continuous outline. Verified by screenshots.
2. **Click into Aang and type, with keyboard shortcuts.** M3: click Aang (or the global hotkey) to open the input
   box; Enter sends, Esc stops or dismisses, Up recalls the last message, Ctrl+Enter for a new line, and shortcuts
   for the model chip and saving. Keys (built, per Joshua: ONE global hotkey): Ctrl+NumLock hides or reveals Aang. Everything else works while the box has focus or by mouse: click Aang to type; Enter send; Ctrl/Shift+Enter new line; Esc stop the reply, else close; Up/Down recall; click the chip to cycle Auto/Quick/Smart/Deep; click the saving pill; wheel scrolls an expanded bubble; Esc or click outside collapses it; on the consent prompt Enter allows once, Esc skips.
3. **Retire the Rainmeter Aang.** Condition: items 1 and 2 work, plus autostart of Core and Body (pulled forward
   from M5 so retirement is not blocked). Then the skin is deactivated and the old scripts kept in git history.

## What Aang is
- The chibi pixel-art pet on Joshua's desktop, playful and in character, with no AI slop.
- Understands the way Joshua actually writes (lowercase, typos, dropped apostrophes, vague references).
- Visible but quiet while WoW has focus. Speaks up unprompted only for **Claude Code session status**
  and **reminders/timers**. Never for anything else.
- Claude is the voice. Facts come from tools (time, weather, memory, app state), never from guessing.
- Model chip Auto/Quick/Smart/Deep; warning at 40% of the week, opt-in saving at 50%.

## Architecture (three processes, each restartable on its own)

    Core  (Node 24, TypeScript)        Body  (C# .NET 10)              Panel (on demand only)
    - Agent SDK, one persistent        - layered pet window            - settings, history,
      session per lane                 - sprite blits (118 frames)       memory approval,
    - router, grounding tools          - bubble + streaming text         reply rating
    - SQLite memory + embeddings       - input window (real text box)  - opens when needed,
    - quota from rate_limit_event      - model chip, quota meter         closes when done
    - reminders, hook receiver         - tray, hotkey, drag
    - supervisor + health              - WoW-focus quiet mode
              \______ localhost WebSocket, small versioned JSON protocol ______/

Rules that follow from the evidence:
- Body never links the SDK; Core never draws. If either dies the other survives and reconnects.
- The protocol is ours, not the SDK's, so an SDK change touches one file.
- Idle animation is event-driven; no frame loop when nothing moves.
- No blocking work on the Body's UI thread. Ever.

## Existing assets reused
- 118 pre-rendered 224x224 frames of the chibi Aang: idle 16, look 20, hello 12, nap 12, think 12,
  spin 16, talk 8, walk 8, scooter 8, zip 6 (`Rainmeter/Skins/BloodWired/@Resources/Images/aang/frames`).
- Memory: `Documents/Aang` (Brain/*.md, `chatlog.txt`, `aang.db` with 116+ embedded turns), migrated, not lost.
- `Capture.ps1` for screenshots, `Backup-Brain.ps1` for backups.

## Milestones and gates

**M0 Foundations.** Solution layout (`src/Body`, `src/Core`, `src/Shared`), protocol types with tests,
the measurement harness as an automated check. Gate: builds and tests pass; harness passes on an empty window.

**M1 Body renders Aang.** Layered window, all ten animation states, drag to move, remembered position,
tray, hotkey, WoW-focus quiet mode. Gate: a screenshot of every state reviewed by eye; automated hit
tests (sprite catches, transparent passes); idle CPU <= 1%; focus never stolen.

**M2 Core talks.** Persistent lean chat lane and full agent lane, streaming events, quota from the
stream, grounding tools, memory migration, safe fast-path commands, everything else to Claude. Gate:
protocol tests plus a live session; no fact stated that a tool did not return.

**M3 Chat feels right.** Streaming bubble text, explicit states (listening, thinking with elapsed time,
streaming, done, error with cause; never an empty bubble), input window, model chip, the 40%/50% quota
flow, reply rating. Gate: Joshua drives it for a session; screenshots at each step; eval thresholds met.

**M4 Proactive.** Claude Code hooks for session status, reminders and timers, master mute. Gate: tests
plus a real session where status appears and clears correctly.

**M5 Reliability and retirement.** Supervisor, autostart, crash recovery, backup to a signed-in
destination, packaging. Gate: kill Core mid-reply and kill Body mid-animation; both recover without
losing the conversation. Only then retire the Rainmeter Aang.

## Chat: feel targets and features (part of M3; each target is measured, not assumed)

Evidence: [streaming UX guidance](https://redis.io/blog/streaming-llm-responses/) (under 0.1 s feels
instant, keep first token near 800 ms, batch paints, typing indicator during the wait),
[chat UI guidance](https://www.setproduct.com/blog/ai-chat-interface-ui-design) (stop button by the
composer and hidden when done, auto-scroll only near the bottom, "jump to latest"), and
[chat UI features](https://www.uxpin.com/studio/blog/chat-user-interface-design/) (edit and resend, retry,
queued messages). The Agent SDK exposes streamed text and tool events, queued messages, interruption and
image input, so none of this needs a workaround.

Feel targets (M3 gate):
- Ack within 100 ms of Enter: Aang reacts and the bubble outline appears with the thinking dots.
- First token within 800 ms of send on the Quick lane, measured from stream event timestamps.
- Text paints in 30-60 ms batches; earlier lines never re-wrap (automated test on line positions).
- The bubble grows smoothly to a fixed number of lines, then scrolls; auto-scroll only within 100 px of
  the bottom, otherwise a "jump to latest" control.
- Hold time scales with reply length and pauses while the pointer is over the bubble or Joshua is typing.
- Tool use shows as a short receipt line ("checking the weather") from the streamed tool events, then
  clears.

Functionality, in priority order:
1. Stop: Esc or a button interrupts the turn within 500 ms.
2. Queue: typing while Aang answers queues the message in order, with edit and remove.
3. Edit last message and resend; retry an answer, optionally on a bigger model ("ask Smart instead").
4. Paste or drag a screenshot or file onto Aang.
5. Search past conversations by words or meaning (the SQLite memory already supports both).
6. Long answers open in the Panel (markdown, code with copy, links); the bubble shows the gist plus a chip.
7. Slash commands in the input box: /model, /save, /forget, /mute.
8. Copy, rate (feeds the voice eval) and pin as a guide.

Deliberately left out: generic suggested-follow-up chips (they are slop), voice (declined), and any
always-on screen watching. Chips appear only when there is a real choice to make.

## Voice and eval track (runs alongside M2-M3)
- **V0** Golden set of ~60 messages in Joshua's real style with expected intent and expected behavior,
  including vague referents and typos.
- **V1** Slop linter from the published tells, run on every reply and in the eval.
- **V2** Voice guide built from 3-5 diverse in-character examples with contrast pairs, in `<example>` tags.
- **V3** Score each Claude model on the set for understanding, slop, grounding and character, then a
  rating session with Joshua as the final judge. Nothing becomes a default without passing.

## Verification protocol (applies to every step)
1. Turn the real overlay on and run a real query through it.
2. Capture with `Capture.ps1`, check the exit code and that the file exists, then look at the image.
3. Prove the round trip from timestamps, and record CPU and memory while WoW is running.
4. If a check cannot be made visually, say so instead of claiming success.

## Known risks
- Anthropic policy change to `claude -p` / SDK billing or `--bare` default: pin the SDK, keep an offline fallback.
- The real app will cost more than the spike; re-measure at every milestone against the thresholds in D1.
- Custom text rendering must stay crisp under DPI scaling; test at 100%, 125%, 150%.
