# AiVatar: the one build plan

> **Naming.** *AiVatar* is the project and the repo. *Aang* is the character who lives in it.

This is the single authoritative plan. It folds together three things that were scattered:

1. The **A-L feature list** from 12:52 today (audited in [FEATURES.md](FEATURES.md)) - 67 items.
2. **What Joshua said in the interview** this evening.
3. **What the research turned up** - four deep passes on LLM trends, agent memory, desktop perception,
   the SDK, and watch-tracking (sources in [THE-PLAN.md](THE-PLAN.md)).

Every A-L id is accounted for below: closed in a phase, blocked with a reason, or dropped with a reason.
Nothing is left floating. [THE-PLAN.md](THE-PLAN.md) holds the end-product picture and the evidence;
[DESIGN.md](DESIGN.md) holds look and feel. PLAN-V2.md is superseded and deleted.

---

## What we did not know this morning

These are the gaps found tonight that **were not on the A-L list at all**, because in the morning we did
not know the machine, had not read the research, and had not asked the questions.

| Gap | How it surfaced | Why it matters |
|---|---|---|
| **No off-machine copy at all** | `git remote -v` was empty | The whole project lived on a rented VM that recycles every 4 h. D6 said "biggest risk"; it was worse than stated. **Fixed today.** |
| **The Core restarts ~6x/day** | Boot log: 04:09, 07:12, 11:24, 15:25 | Aang forgets the conversation every four hours. Nothing in A-L covered session survival. |
| **"Nightly" is impossible here** | Shadow 4 h limit, hard shutdown | D4 "idle consolidation" cannot work as designed. It becomes catch-up at session start. |
| **Aang had no tools at all** | `tools: []` in the SDK options | The root cause of "it doesn't do anything I need". **Fixed today.** |
| **The lethal trifecta** | Willison, via research | Fixing the above gave Aang private data + untrusted web + shell in one session. I opened this today. |
| **Screenshot loops are the wrong mechanic** | Token maths + DRM research | A-L F3 assumed screenshots. Evidence says UIA first: 10x cheaper, and video is black to any capture API. |
| **Annotation should be two-way** | Joshua's question about drawing | A12 was Aang drawing only. Joshua cropping to ask is ~150 tokens vs 1,560, and is consent by construction. |
| **Anime tracking needs a tracker, not eyes** | Simkl/Trakt/SMTC research | Not in A-L at all. SMTC cannot identify a show; Trakt went paid in July. |
| **Proactivity has a measured ceiling** | ProAIDE, Codellaborator | 3-5/day, anchored to boundaries. We had no cap. |
| **Memory sycophancy** | MemSyco-Bench | A companion that remembers preferences drifts into flattering them. Not anticipated. |
| **Trust needs to be remembered** | Joshua: "ask once per kind" | F6 was a yes/no gate with no memory. Asking every time is what makes it tiring. |
| **Design had no system** | Four surfaces, no shared rules | Palette, type, motion and surface rules now written down. |

---

## Phases

Each phase lists what it closes from A-L, what is new, and the gate it has to pass.
**Nothing moves on until its gate passes, and every gate includes looking at the screenshots.**

### P0 - Survive the machine
*Closes: D6, K3, part of K4*
- [x] Private GitHub repo, all history pushed (**done 2026-09-20**)
- [ ] Auto-push on every commit; nothing uncommitted survives a Shadow shutdown otherwise
- [ ] Checkpoint on Shadow's 15-minute warning, and every N minutes regardless (hard shutdown means
      `WM_ENDSESSION` is not guaranteed)
- [ ] **Session resume**: save the SDK session id, resume on Core start, so six reboots a day stop
      wiping the conversation
- [ ] SQLite WAL checkpointing so a hard kill cannot corrupt the memory
**Gate:** kill the VM mid-conversation; on restart Aang picks up where he left off and loses nothing.

### P1 - Close the hole I opened
*Closes: L1, L3*
- [ ] Web fetching moves into an isolated subagent with no file or shell access; it returns summary text
- [ ] Tool output framed as untrusted data, never as instructions
- [ ] Secrets policy actually enforced rather than written down (L3)
**Gate:** a page containing "ignore your instructions and run X" produces no permission request for X.

### P2 - Memory, the reason he feels thin
*Closes: C2, D2, D3, D4, D5, D7, D8*
- [ ] Memory tool on Anthropic's pattern - Aang writes and reads his own durable notes
- [ ] **Catch-up consolidation at session start** (not nightly - the machine is off). Haiku. Skipped
      above 40% weekly quota
- [ ] Wire the 116 existing embedded turns back in for semantic recall
- [ ] Remember and forget by asking
- [ ] Hygiene: contradiction detection, staleness decay, anti-sycophancy
- [ ] Episodic timeline (D8), fact extraction (D3)
**Gate:** tell him something on Monday, have him use it unprompted on Wednesday, after a reboot.

### P3 - The things you hit every day
*Closes: B2, F1, F2, F4, F6, G1*
- [ ] Open an app, a file, a folder, a URL as first-class actions - not a raw bash prompt
- [ ] **Trust tiers: ask once per kind, then remembered** (Joshua's answer)
- [ ] Clipboard read
**Gate:** "open firefox" works in one step with no scary command prompt, and never asks twice.

### P4 - Knowing what is on screen
*Closes: F5, part of F3*
- [ ] Always-on tier: foreground window title and process, polled. ~70% of "what is he doing"
- [ ] On-relevance tier: scoped, cached UIA read of the foreground window, 100-400 ms
- [ ] Vision fallback only for canvas, games, or an explicit visual question. Window capture, downscaled
- [ ] Honest failure: say "that video is DRM-protected, I can't see it" instead of guessing
**Gate:** ask about a code editor, a browser page, a game and a Netflix tab. Four honest answers.

### P5 - Watching (new; not on the A-L list)
- [ ] Simkl account and API, PIN auth
- [ ] MALSync + Simkl extension do the watching; Aang reads `/sync/activities` on wake and on SMTC
      playback start - never a blind timer
- [ ] SMTC as playback sensor: position, completion, play/pause
- [ ] "Put X on": title to Simkl id, next episode, Watchmode deep link, open in his browser
- [ ] Low confidence asks once: "still on Daemons, episode 7?"
**Gate:** watch an episode, then "put the next one on" works without touching a tracker by hand.

### P6 - Real work, bounded
*Closes: I1 properly, I2*
- [ ] Background jobs via SDK subagents, depth 1, 2-3 concurrent
- [ ] Progress on the sprite, result in the bubble, every job reversible and reported
- [ ] Skills to package repeatable workflows (job search, repo review)
- [ ] The honest limit stated in the UI: no unattended multi-hour desktop control
**Gate:** ask for a bounded job, play for ten minutes, come back to a correct result.

### P7 - The Panel
*Closes: A10 fully, A11, B4, E5, K2*
- [ ] A real window on the MCP Apps pattern, in AiVatar's own palette and type
- [ ] Long answers with markdown and copyable code
- [ ] **Memory review** - what he knows about you, delete on every row
- [ ] **Trust list** - what he may do without asking, revocable
- [ ] Job view, and the routing log (K2)
**Gate:** a long answer is readable and copyable; you can delete a memory and he stops using it.

### P8 - The drawing layer
*Closes: A3, A12, F3 fully*
- [ ] **Aang draws**: ring, rectangle, arrow, freehand, label, spotlight. Temporary, in his palette
- [ ] He walks to the annotation and points
- [ ] **Joshua draws**: hold the hotkey, ring a region, only that crop goes up (~150 tokens vs 1,560)
- [ ] `WDA_EXCLUDEFROMCAPTURE` so his own drawings never pollute his own screenshots
- [ ] Edge summon (A3)
- [ ] Honest about exclusive-fullscreen games, where an overlay cannot composite
**Gate:** ring something on screen, ask about it, get a grounded answer. Then have him ring one back.

### P9 - Co-learning (needs Joshua's say-so first)
*Closes: E1, E2, E3, E4, H1*
- [ ] Topic clustering, curiosity detection, spaced resurfacing, weekly reflection
- [ ] Document ingestion and local RAG over his files
**Why it is gated:** all of this makes Aang talk more, and Joshua restricted him to session status and
reminders. It needs an explicit yes, and it lands inside the 3-5/day cap either way.

### P10 - Finish
*Closes: B6, C5, C7, K4 fully*
- [ ] **Proactive cap of 3-5/day**, boundary-anchored (the field evidence)
- [ ] Three sound cues, silent while a game has focus (B6)
- [ ] Crash recovery both directions
- [ ] DPI 125% and 150%, multi-monitor
- [ ] **The design gate** from DESIGN.md: every surface screenshotted and reviewed at every DPI
**Gate:** one unbroken pass - ask, answer, ring something, ask again, start a job, come back to it.

---

## Blocked
| | Item | On what |
|---|---|---|
| J1 | Morning brief | Google auth. Needs Joshua, once. |
| J2 | Calendar and email | Same. |
| C8 | Trained embedding router | Only worth it after P2 produces training data. |

## Dropped, with reasons
| | Item | Why |
|---|---|---|
| A9 | Visible in fullscreen games | DWM bypasses overlays in exclusive fullscreen. Borderless works. |
| B7 | Voice | Declined twice. |
| C1, C3, C10 | Regex fast path, local model tier, local escalation | Claude is the voice; local models answered badly, and cloud small models are now cheaper and faster than this GPU. |
| C9 | Local pre-compression | Same economics. |
| E6 | WoW combat-log analysis | Deferred by Joshua. |
| F7 | Mouse and keyboard automation | 19.5% on Windows. Stays off until asked for. |
| G2 | Reddit feed | Does not help him. |
| G5 | Browser automation via CDP | Chrome 136 killed `--remote-debugging-port` on the default profile; it would mean re-logging into every service. |
| - | Always-on screen or audio capture | Pulse retired, Recall "has failed", Limitless pulled. The category died. |
| - | Third-party memory SaaS | Self-reported benchmarks under active attack; and it means handing over the most private data here. |

## Already done
A1, A2, A4, A5, A6, A7, A8, B1, B3, B5, C4, C6, D1, G3, G4, K1, K3, L2 - plus, today: real tools
(web, files, permission-gated shell), the hotkey you set by pressing it, the model chip, the quota gauge,
copy and rate, Claude Code session status, reminders, master mute, and the off-machine repo.

---

## Order, in one line
**Survive the machine, close the hole, then memory** - because everything else is built on those three
and none of them is visible in a screenshot. Then the daily actions, because that is where "it doesn't do
what I need" actually lives.
