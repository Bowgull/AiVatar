# Aang: the whole thing

> **Naming.** *AiVatar* is the project and the repo. *Aang* is the character who lives in it:
> the sprite, the voice, the name Joshua talks to. Code, config and the protocol keep saying Aang.

The complete end-product picture, 2026-09-20. Supersedes PLAN-V2.md. Every claim is either something
Joshua said, or measured on this machine, or cited. Where evidence killed an idea, the idea is listed as
dead with the reason, because the dead ends are half the value of this document.

---

## 1. What Aang is

A pixel Aang who lives on the desktop and is an extension of Claude: he knows Joshua, remembers
everything, can see what is on screen when it matters, can act on the machine, and speaks up only when
it is worth it. Invoked, not ambient. Playful, in character, no AI slop.

He is not a chat window with a sprite. The sprite is the point: he can stand next to the thing he is
talking about, walk to it, and circle it.

---

## 2. The machine he lives on (this changes everything)

Measured on this box, 2026-09-20:

| | |
|---|---|
| Host | Blade **Shadow Computer** - a rented cloud PC, not Joshua's hardware |
| CPU / RAM | 4 cores of an EPYC 9354, **16 GB** |
| GPU | NVIDIA RTX 2000 Ada |
| Session limit | **4 hours**, hard shutdown with 15 and 5 minute warnings |
| Reboots observed today | 04:09, 07:12, 11:24, 15:25 - **four times in one day** |
| Disk | **Persists** across sessions (yesterday's chatlog survived today's reboots) |
| Off-machine copy | **None.** `git remote -v` was empty until today |

Three consequences, and they are not negotiable:

1. **Nothing runs between sessions.** Anything "nightly" is impossible on this box. Work that would have
   run overnight runs **at the start of the next session**, catching up on what happened since the last.
2. **The Core restarts about six times a day.** The SDK session must be saved and resumed by id, or Aang
   forgets the conversation every four hours.
3. **The disk is rented.** Off-machine backup is not a nice-to-have, it is the difference between this
   existing and not. A private GitHub repo, pushed on every commit.

Also: a game will take 8-12 GB of the 16 GB. Anything resident while he plays must stay **under ~2 GB**.

---

## 3. Joshua's two questions, answered

### "Annotation instead of asking what he sees - lighter?"

**They are different axes, and the answer to both is yes, but not as a swap.** Perception is input.
Annotation is output. You cannot replace one with the other.

But the instinct underneath is right, and it is the single best call in this document: **read structure,
don't stare at pixels.**

- A 1920x1080 screenshot is **1,560 visual tokens** standard-tier, **2,691** on high-res models
  ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). One frame every 10 s
  for a 4-hour session is 1,440 frames: **$19 on Opus, $2.25 on Haiku**. A screenshot loop is the
  seductive, expensive, worse option.
- Anthropic's own browser tooling tells you to **prefer `read_page` over `screenshot`** for token
  efficiency ([browser use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)).
- **Chrome 138 (Aug 2025) turned native UIA on by default**
  ([Chrome blog](https://developer.chrome.com/blog/windows-uia-support-update)), which kills the old
  "accessibility slows Chrome down" objection. Reading the window tree is now cheap and reliable.
- Pure-pixel grounding is still the weak link: the best model on ScreenSpot-Pro is **67.9%**
  ([arXiv 2512.22047](https://arxiv.org/pdf/2512.22047)), and WindowsAgentArena's best does **19.5% vs
  74.5% human** using vision *and* UIA *and* pixel detectors together.
- **Video is the exception that settles it:** hardware DRM (Widevine L1, PlayReady SL3000) returns a
  **black rectangle** to any capture API. Screenshots of Netflix in Edge are literally black. UIA still
  gives the title and the player controls.

**So: UIA first, vision rarely.** Three tiers:
1. Always on, nearly free: foreground window title and process, polled. Answers ~70% of "what is he
   doing" - tab titles, filenames, video names, game names.
2. On relevance: a scoped, cached UIA read of *the foreground window only* when he talks to Aang and the
   question sounds like it is about the screen. 100-400 ms, not the 3-26 s a whole-desktop dump costs.
3. Vision fallback: only when UIA returns a canvas, a game, or nothing, or he asks a visual question.
   Capture the **window**, downscale to 1280x720 (~1,180 tokens), and expect black frames on DRM video.

**And annotation is worth building** - as the payoff, not the substitute. UIA hands you bounding
rectangles for free, so once tier 2 exists, a click-through layered overlay that rings an element and
lets Aang walk to it is a few days' work. It is the one thing a pixel pet can do that a chat window
cannot. Microsoft shipped the same idea as Copilot Vision **Highlights** in May 2026. Caveats: it will
not draw over exclusive-fullscreen games (borderless is fine), and the overlay must set
`WDA_EXCLUDEFROMCAPTURE` so it does not appear in Aang's own screenshots.

There is a second, quieter reason annotation matters: it lets low-precision perception be *safe*. A pet
that rings a thing and asks "that one?" turns a wrong guess into a moment of charm instead of a wrong click.

### "Remember where I am in an anime, and put it on for me"

**Aang should not watch the screen for this. He should read a tracker that fills itself in.**

What the research settled:

- **Trakt is out.** On 2026-07-30 Trakt made API app creation VIP-only and deleted existing free-tier
  apps with no announcement; users report the Create button still fails after paying
  ([trakt/trakt-api#897](https://github.com/trakt/trakt-api/issues/897)).
- **Simkl is the right spine.** Free, self-serve, covers **anime + TV + film in one list**, has a **PIN
  auth flow** (no callback server) and **tokens that do not expire**, at [api.simkl.org](https://api.simkl.org).
- **Windows SMTC is the wrong tool for identity.** It reports the *process*, so everything in a browser
  is just "Chrome", and anime sites do not populate `navigator.mediaSession`
  ([MALSync#4038](https://github.com/MALSync/MALSync/issues/4038), open since Jul 2026). It *is* an
  excellent playback sensor: position, duration, play/pause. Use it for "something is playing, 87%
  through", never for "which episode". (Verified today: the API loads on this machine.)
- **Window titles work for Crunchyroll and fail for Netflix**, which does not put the episode in the title.
- **Nobody has solved this extension-free.** Every desktop scrobbler that exists handles local players
  only. That absence is evidence.

So the shape is: **a browser extension does the watching, Simkl is the shared bus, Aang reads Simkl.**

- **Tier 0**: Simkl account + MALSync + the Simkl extension. Aang polls `/sync/activities` on wake and
  when SMTC says playback started - never on a blind timer, which Simkl's rules forbid. Covers
  Crunchyroll and Netflix, which is most anime.
- **Tier 1**: SMTC for playback state and completion, window title for identity where it is informative.
  When confidence is low Aang **asks once**: "still on Daemons, episode 7?" For a companion that is a
  conversation, not a chore.
- **Tier 2**, only if Disney+ and Prime matter: a tiny extension posting `{site, show, episode, position}`
  to Aang on localhost. It is the only way to get those two.

**"Put Daemons of the Shadow Realm up"**: resolve the title to a Simkl id, next episode = last watched + 1,
resolve the platform through **Watchmode** (the only free source of real episode-level deep links; TMDB's
`watch/providers` is free but returns no deep links), cache the per-show URL on first use, then
`ShellExecute` the URL in his browser. **No service lets you set a resume position** - but every one of
them resumes server-side when you open the page, which is exactly what he does by hand today.

Hard line: observe locally, write through official APIs, open URLs in his browser. **Never script the
streaming site.** Netflix's ToS forbids automated access.

---

## 4. The finished product

### Front end - what Joshua sees

- **The sprite.** Ten animation states, per-pixel alpha, click-through where transparent, ~0.7% of one
  core. Never steals focus. Quiet while WoW has focus.
- **The bubble.** Streaming text, thinking dots inside 100 ms, tool receipts ("checking the weather"),
  "...v" to expand to 12 lines with a scrollbar, copy and rate on hover, yes/no buttons when there is a
  real decision. Buttons appear only for decisions - Joshua's rule.
- **The input box.** Click Aang or press the hotkey **he chose by pressing it**. Enter sends,
  Ctrl+Enter newline, Esc stops, Up/Down recall.
- **The strip.** Model chip (Auto/Quick/Smart/Deep), saving-quota pill, and a usage gauge whose numbers
  hide behind a click.
- **Mark rings.** Aang draws on the screen to show you a thing, and walks to it.
- **The Panel.** A real window for long answers, diffs, dashboards, memory review and the trust list.
  Built on the **MCP Apps** pattern (the first official MCP extension, 26 Jan 2026) so tool results can
  render clickable UI instead of text.
- **One global hotkey.** Hide and reveal. Nothing else is global.

### Back end - how it works

    Body (C# .NET 10)              Core (TypeScript, Node 24)          Off-box
    - layered window, sprite       - Agent SDK, one session per lane   - private GitHub repo
    - bubble, input, chip          - session id saved and resumed      - (backup, every commit)
    - UIA perception tiers         - memory: notes, recall, catch-up
    - Mark overlay                 - tools, permission gate
    - tray, hotkey, drag           - Simkl, Watchmode, web
    - SMTC playback sensor         - Claude Code hook receiver
              \____ localhost WebSocket, versioned JSON protocol ____/

- **Memory.** A memory tool Aang writes to himself, on Anthropic's pattern - context editing plus a
  memory tool measured at **+39% on a 100-turn eval with 84% fewer tokens**
  ([context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).
  **Catch-up consolidation at session start**, not nightly, because this machine is off overnight; the
  technique is worth **+18% accuracy at ~2.5x lower cost per query**
  ([arXiv 2504.13171](https://arxiv.org/html/2504.13171v1)). The 116 embedded turns already in the
  database get wired back in for semantic recall. Guards: contradiction detection, staleness decay, and
  an anti-sycophancy rule, because **memory sycophancy** is a named 2026 failure mode
  ([MemSyco-Bench](https://arxiv.org/pdf/2607.01071)) - a companion that remembers your preferences
  drifts toward flattering them.
- **Trust.** Ask once per kind of action, then remembered. Joshua's answer. Read-only tools never ask.
- **Real work.** Bounded background jobs via SDK subagents, depth 1, 2-3 concurrent. Honest limit stated
  in the UI: no unattended multi-hour desktop control. OSWorld 2.0 long-horizon best is **31.4%**
  ([arXiv 2606.29537](https://arxiv.org/abs/2606.29537)); Windows control is **19.5%**. Short bounded
  jobs are real; "rebuild my app while I raid" is a demo.
- **Proactive.** Claude Code status, reminders, and nothing else. Anchored to boundaries - commit, build
  end, session end, idle - because engagement is set by timing: **post-commit 52%, mid-task 31% with 62%
  dismissal** ([ProAIDE](https://arxiv.org/html/2601.10253v1)). **Hard cap 3-5 a day.** Held entirely
  while he games or mutes.
- **Security.** Web fetching happens in an isolated subagent with no file or shell access that returns
  plain summary text. Right now Aang has private data + untrusted web content + shell, which is the
  **lethal trifecta** ([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)) and is
  architectural, not fixable by prompting.
- **Local models.** Embeddings and intent gating only, under 2 GB resident. Cloud small models are now
  cheaper and faster than this GPU, and the local models answered badly when tested here.

---

## 5. Build order

| | Why it is here |
|---|---|
| **0. Off-machine backup** | Everything lives on a rented VM that recycles every 4 hours. Doing now. |
| **1. Close the trifecta** | I opened it this afternoon. Isolate web fetching before anything builds on it. |
| **2. Session resume + catch-up memory** | Six restarts a day currently wipe his memory of the conversation. This is why he feels thin. |
| **3. Memory proper** | Memory tool, semantic recall wired back, remember/forget, sycophancy guards. |
| **4. Daily regressions** | Open an app/file/URL as real actions, trust tiers, clipboard. From FEATURES.md. |
| **5. Perception tier 1-2** | Window title always-on, scoped UIA on relevance. |
| **6. Anime and watching** | Simkl + extension + Watchmode. Sits after 3 because it is a memory problem. |
| **7. Bounded background jobs** | Subagents. |
| **8. Panel as real UI** | MCP Apps. Unlocks memory review and the trust list too. |
| **9. Mark rings and edge summon** | Needs 5 for accurate rectangles. The charm payoff. |
| **10. Vision fallback, proactive cap, crash recovery** | The finishing. |

## 6. Not doing, and why

- **Always-on screen or audio capture.** ChatGPT Pulse retired 17 Jun 2026; Microsoft says Recall "has
  failed"; Limitless was bought and pulled. The category died.
- **A screenshot loop.** $19 a session on a top model, black frames on DRM video, and not even more
  accurate.
- **Voice.** Declined twice.
- **Trakt.** Paywalled, and reportedly broken after paying.
- **Scripting streaming sites.** Against Netflix's ToS. Deep links only.
- **Third-party memory SaaS.** Self-reported benchmarks under active attack in 2026, and it would mean
  handing the most private data here to a vendor.
- **Local generation.** Cloud small models are cheaper and faster; local ones answered badly.
- **Unattended computer use.** 19.5% on Windows is not a feature.
- **Reddit feed.** It was on the old list. It does not help him.
