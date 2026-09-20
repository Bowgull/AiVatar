# Aang build plan

Goal: a finished desktop companion that feels good to chat with, never freezes, and stays cheap enough
to run beside WoW. Not a first version. Each milestone ends with a gate that must pass before the next
starts. Decisions and evidence: `docs/DECISIONS.md`.

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
