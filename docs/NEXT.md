> **SUPERSEDED (2026-10-04).** This is history. The one plan is [`FINAL-AANG-BUILD.md`](FINAL-AANG-BUILD.md): every item here was checked against the code and either built, folded in as a step there, or written into its "Not doing" table with the reason (decision 47). Do not act on this document.

# Aang: the plan

Rewritten 2026-09-24, after the decision to keep the brain on Shadow. This supersedes the previous version of
this file. `PORT-TO-MAC.md` is now **history**: its verification table and security audit are still accurate and
still worth reading, but its porting map describes a move that is no longer happening. `ROADMAP.md` is older
still. This file is the current plan.

---

## What changed, and what it deleted

The brain stays on Shadow. You do not need Aang alive while you are away, so Shadow's 4-hour session cap and its
30-minutes-after-last-input shutdown are acceptable: Discord queues messages and he answers them when you next
sit down. The Mac pet is dropped.

Those two decisions together delete, permanently:

- The host-neutral Core port (machine identity, per-pet routing, per-pet state across roughly twenty fields)
- The Swift/AppKit Mac pet
- The LaunchAgent, Keychain, macOS TCC permissions and the sandbox work
- Mac sign-in scripts for Google, Spotify and Simkl
- The 8 GB RAM budget, the lane and worker caps, and that whole decision
- In-process embeddings and the entire `onnxruntime-node` darwin-x64 problem. **Ollama keeps working on Shadow**,
  unchanged, at 768 dimensions, so the existing 335 vectors stay valid and nothing needs re-embedding.
- Most of the two-pet security findings (R3, R4, R7), which only mattered with two desktops connected
- FileVault and Tailnet Lock as *Aang* decisions. They are now just your own Mac preferences.

It also turns one bug back into a feature: `CoreSupervisor` starting a local Core when nothing is listening is
**correct** now, not a second-brain hazard. The one-brain lock drops to low priority.

What survives from the port document, because it was never really about the Mac:

- Every security fix. They are live bugs on Shadow today.
- The backup gap: `aang.db` still has no off-machine copy at all.
- Schema versioning and fresh-database creation, which is what makes a restore possible.
- The memory quality work: the fact-retirement bug, automatic recall, evals.
- The worker-lane process leak.
- The stale docs.

---

## Settled

| Decision | Answer |
|---|---|
| Brain host | Shadow, permanently. Desk-only assistant. |
| Mac pet | Dropped. |
| Mac's role | Secondary machine Aang can reach over the existing Tailscale bridge. |
| Discord "Yes" | Means once. Standing "always" grants only from the desktop pet. |
| PIN | 4 digits, remembered for 30 minutes after a correct entry. |
| PIN covers | Sending email, sending a file, and any "always" grant asked for from Discord. |
| `gmail.compose` | Keep as-is. |
| Obsidian: untagged notes | **Not indexed.** He should never answer confidently from something you never validated. |
| Obsidian: `privacy_class: private` | **Never indexed at all.** Not filtered at output, excluded from the index, so there is nothing to leak. |
| Aang writing into the vault | No. Read-only, and only tagged notes. |
| Crash recovery | Accepted as-is. A pet crash is visible immediately; you restart it. |
| Annotation | Both directions. |
| Annotation: you point | Hotkey then drag is a crop; hotkey then a click with no drag is the whole screen. Asking him works too. |
| Annotation: he points | Fades on its own after a few seconds. |
| Scrollback | Gap-based conversations, all archived in the Panel, bubble scrolls the current one. |
| Mac reach | Headless helper, three tiers, including real commands. Designed and approved 2026-09-24, see Phase 5. |
| Decisions record | Stay in the repo. The vault gets one AiVatar bridge note pointing at it, per the GitHub Repository Import Method. One source of truth. |
| Shadow Always On | Declined. Desk-only stands. |
| Bubble style | **D, rich.** Carved frame, header plaque, grain, colour ranking, icon tags, buttons with a lip. Picked 2026-09-24 after C was judged too timid. Scales down: a one-line answer stays one line. |
| Icon and colour rule | Two independent channels. **Icon says what kind of thing this is; colour says how it is doing.** An icon never changes meaning, a colour never changes meaning. |
| Discord cards | Text embed with a gold stripe and emoji tags for everyday things; a rendered image that matches the desktop for the big ones (job reports, interview briefs). |
| Button behaviour | Do the thing, file it in Discord, say where it went with a link. Never a forced jump to Discord. |
| Discord tidying | Allowed, but anything destructive (move, rename, archive) is proposed as a batch and approved first. Creating is ask-first as already planned. |
| Typewriter reveal | Always, at a steady cadence, and a click in the bubble dumps the rest instantly. The RPG contract. |
| Eval scoring | Split. Tool choice and recall are ordinary automated tests; voice and tone are yours to judge. |
| Local consolidation model | Chosen by measurement on the real GPU once the eval exists, not from a spec sheet. |
| Packaging | Dropped for now. Revisit when Aang is ready for it. |

---

## Phase 0: Stability

**0a. The typing glitch.** `InputWindow.cs:116` calls `Grow()` on every `TextChanged`, so every keystroke.
`Grow()` at `:125-133` unconditionally rebuilds the window's clip `Region` and calls `Invalidate()` even when the
line count has not changed, and the Form sets no double buffering anywhere. Every character therefore forces a
synchronous, undoubled-buffered GDI+ repaint of the gradient, halo pen, mode frame and strip.
Fix: move the `Region` rebuild inside `if (h != Height)`, and turn on double buffering.
*Gate:* type a long message fast, no stutter, the box still grows and shrinks at the right line boundaries.

**0b. The worker-lane leak — fixed 2026-09-24.** `core.ts:160`. Background job lanes were never closed, not on
completion, not on stop, not even in `stop()`. Fixed with a `closeWorker(id)` helper, called from every terminal
branch of `runTask` (failed, needs-you, done) and from `stopTask`, plus a sweep in `stop()` itself for a job
still `working` at shutdown. Nothing is lost: `workerLane()` already resumes by session id
(`resumeId: t.sessionId`, persisted in `tasks.json`), so a later `tell_task` just pays a fresh process start,
exactly like any other resumed lane already does.

**0d. The Body test suite did not compile — fixed 2026-09-24.** `Outline(6)` was called as a static in
`BubbleWrapTests.cs`, but it is an instance method. Fixed by constructing a `BubbleView` first, matching every
other test in the file. **That fix surfaced five real, previously invisible failures**, all one root cause: the
`Long` test fixture predates the 2026-09-23 readability change (`WideAfterLines` 4 to 1, `LineH` 21 to 23),
which promotes any multi-line reply to the wider bubble. At the *narrow* width the fixture wrapped to 8 lines,
matching its own comment; at the *wide* width `Show()` actually uses, it only needed 5, one short of the 6-line
collapse threshold, so `More`, `Expand()`, the long-reply hold and the ellipsis test all silently broke and
nothing caught it because the suite had not compiled. Not a `BubbleView` regression: the wrap logic was doing
exactly what the readability fix intended. Fixed by lengthening `Long` and verifying the new wrap count with a
throwaway diagnostic test before committing to it (now 8 lines wide, comfortable margin). One more stale
assertion found in the same test: it measured the ellipsis fit with a hardcoded `Bahnschrift` font at 11pt,
which the body font stopped being on 2026-09-22, and against the narrow `MaxTextW` constant rather than the
wide width `Ellipsize()` actually guarantees against. Fixed to measure with `Theme.Font(Theme.Face, Theme.BodyPx)`
and the real effective width. All 37 tests pass.

**0e. The Core test suite is flaky when run in full, and it predates every change in this file.** Confirmed by
controlled comparison against unmodified `main` (2026-09-24): 7 failures are consistent across baseline and
every run since (`jobs.test.ts`, `organise.test.ts`, `doers.test.ts`, `uia.test.ts` — all native-window/UIA-
flavoured, plausibly environment-dependent). 3 more (`away.test.ts`'s "done" tier test, `hardkill.test.ts`'s
"stops promptly" and "port free after stop") flip between passing and failing across otherwise-identical runs
of the same code, which rules out any single change as the cause — almost certainly hardcoded ports colliding
across test files under the full suite's concurrency, not a logic bug. Every test in this set passes cleanly
in isolation. Not fixed here; worth a real pass (randomised or per-file ports) before the suite is trusted for
anything beyond "did I just break the thing I touched."

**0c. Loose ends:**
- **The `withAnnounced` test bug — fixed 2026-09-24, and it was two bugs, not one.** The test's mocked lane
  never fired a completion event (missing the `core.onLaneEvent(...)` pattern every other mocked-lane test in
  the file uses), so `this.active` never cleared and the assertion genuinely failed at `sent[1]`, not `sent[2]`
  as first thought. But that is not why it hung for minutes: `begin()`'s turn watchdog (`TURN_TIMEOUT_MS`,
  120 s) was never `.unref()`'d and `stop()` never cleared it, so the dangling timer eventually fired,
  re-queued the stuck submission, started a second uncompletable turn with its own 120 s watchdog, and
  cascaded — confirmed at 240.5 s wall time on one isolated run, almost exactly 2× the timeout. Fixed in three
  places: the watchdog is now `.unref()`'d, `stop()` explicitly clears `this.active`'s watchdog, and the test's
  mock now fires `onLaneEvent` after each submit like its neighbours. The whole file now runs in under 5
  seconds. This was a real production robustness gap independent of the test: a mid-turn shutdown left a live
  timer that could fire against a torn-down Core.
- **"Only count Claude Code as working once a session really started" — fixed 2026-09-24.**
  `workingNow()` (`core.ts`) was counting `Launched.state === 'waiting'` as working, but `'waiting'` is set
  unconditionally the instant `startClaude()` opens the window (`core.ts:1550`, before Enter is ever pressed)
  and the state machine (`nextState()` in `claude.ts`) never re-enters `'waiting'` once a real hook fires — it
  only ever produces `'working'`, `'needs you'`, `'done'`, or `'ended'`. So for a `Launched` job, `'waiting'`
  unambiguously and always meant "typed in, not started," exactly matching its own doc comment, and the glow
  was turning on before anything had actually run. Fixed to only count `state === 'working'`. The
  `HookTracker`/`hooks.sessions` side was unaffected — its own `'waiting'` phase only ever comes from a real
  hook event, which only a genuinely running session can send. The existing test that encoded the old (buggy)
  behaviour was updated to assert the fix directly: typed-but-not-started is not working, started-for-real is.
  Noted in passing, not fixed here since it was not what was asked: a session in `'needs you'` — the one state
  that most needs the glow, since it is Claude genuinely blocked on him — is still not folded into this signal
  at all; it is only ever announced once as a proactive message.
- **The docked thinking state — built 2026-09-24, needs eyes-on confirmation like 0a did.** All three pieces
  from the approved design:
  - **Dot masking**: `DrawPeeking` now clears the sprite's baked-in "..." box (`ThinkDotsBox`, verified-safe
    148,48,30,10 in frame-local space) on a fresh clone every draw, before rotation, with
    `CompositingMode.SourceCopy` so it actually overwrites alpha rather than blending onto it. The locked
    source sprite is never touched.
  - **Typewriter dots on the yellow marker**: `IconNews`'s existing hand-pixelled dot art (row 3, indices 3/6/9)
    is now phased in via `IconNewsWithDots(dots)` rather than always fully drawn, no new art. `dots` comes
    straight from `anim.Frame / 3` (clamped 0-3) — the sprite's own 8fps/12-frame think cycle is the clock, not
    a separate timer, so it cannot drift out of step with the glow the sprite already carries. Badge icons
    (needs-you/done/plain news) are unaffected, unchanged.
  - **Click explains and routes**: `ExplainAndGoToWorking()` mirrors the existing `GoToHeldSession()` pattern
    (which already handled badges) but for the continuous `claudeWorking` signal, which previously had neither
    half — clicking while only that marker showed did nothing at all. Now it shows a short bubble with what's
    running and brings that Claude window forward, here or on the Mac. Badge still outranks it, same as what
    is drawn.
  - All 37 Body tests still pass. **Confirmed working by Josh in the real docked view, 2026-09-24** ("his
    docked state works perfectly excellent").

**0g. MAJOR FINDING, not yet fixed: a resumed Claude Code session does not reliably pick up a changed system
prompt.** Found diagnosing why `present_list` (below) wasn't firing: three identical live attempts across a
full Core restart with an edited `voice.ts` produced near-identical replies with `cacheReadTokens` around
66,000 and only 300-500 new tokens each time - clear evidence the resumed conversation was still running on
cached context from before the edit. Confirmed, not just suspected: clearing the `smart` lane's saved session
id in `sessions.json` and forcing a genuinely new session made the identical prompt work immediately. **Every
prompt or voice change ever made to Aang may have been silently inert on any session that was mid-conversation
rather than freshly started.** Not root-caused yet (does the SDK's `resume` option ignore a changed
`systemPrompt` by design, or is this specifically a prompt-cache behavior), and not fixed generally - only
worked around once, by hand, for this one test. Needs real investigation: likely a hash of the system prompt
kept alongside each session id, so a changed prompt forces a fresh session automatically instead of silently
resuming a stale one.

**0f. Found immediately after, same area: the think state dropped out under a fullscreen game — fixed
2026-09-24.** Tabbing into WoW fullscreen with a job running left the yellow marker animating correctly but the
sprite itself fell back to idle, no wind, no glow, and never recovered. Root cause: `ApplyQuiet()` (`PetWindow.cs`,
fires the instant quiet mode toggles on focus change) called `anim.Play("idle")` directly, bypassing the
`PlayRest()` helper that exists specifically to stop exactly this. Idle loops forever and never "finishes," so
nothing ever called `PlayRest()` again afterward to restore `think` — even though `claudeWorking` had never
actually stopped being true. This directly contradicted the very next line's own comment: a working session is
what quiet mode should not be able to hide. Fixed by routing that call, and one more defensively-equivalent one
in the main tick loop, through `PlayRest()`. All 37 Body tests still pass. **Confirmed working by Josh in the
real docked view, 2026-09-24** ("works perfectly great fix"). Phase 0 is now fully closed.

---

## Phase 1: The bubble

This is the oldest complaint and the one you see every day, so it goes early. It is also entirely self-contained
Body work, so it does not block on anything else.

**The diagnosis.** `voice.ts:18` instructs the model to write plain text with no markdown, but the linter below
it never strips markdown. It strips leaked reasoning, stage directions, emoji, closing offers and exclamation
marks. Meanwhile `BubbleView.cs` has no markdown parser: `Wrap()` splits on spaces and `DrawString` paints each
line in one font. So when the model emits `**` anyway, nothing catches it and nothing renders it. The file's own
comment says prompts are not guarantees. That principle was applied to four other failure modes and never to
this one.

**1a. Strip markdown in the linter, always — done 2026-09-24.** A `stripMarkdown()` pass added to `voice.ts`,
run right after the stage-direction fix and before emoji/exclamation handling: headers, blockquotes, fenced and
inline code, bold/italic (word-bounded so `file_names.ts` survives), links (kept as text, plus the URL only when
it differs from the display text), list markers (converted to a plain bullet, not just deleted, so items do not
run together), and the literal `--` the model reaches for as an ASCII em dash (the voice already bans the real
character; this is its look-alike). Not a markdown parser, a safety net for the shapes actually seen in real
replies. 10 new tests in `voice.test.ts`, including the exact reported complaint verbatim
(`**Three** jobs... -- the Shopify one closes Friday.`); all 25 pass. Checked for collateral effects: only
`route.test.ts` exercises `lint()` elsewhere in the suite, still 10/10.

**1b. The chosen style: D, rich.** Mockups A through F are on the canvas. C was built first and judged too
timid: still brown text on beige with boxes round it, using none of the carved-wood language already sitting in
`Theme.cs` for the tray menu. D uses it: a carved frame with a gold bevel, a recessed header plaque, grain on the
parchment, colour ranking results, an icon tag per row, a deadline banner, and buttons with a real lip (`Lip = 3`,
defined in the theme and currently unused). Every colour in it already exists in `Theme.cs`; no new palette.

**It must scale down, and that is the risk.** Board E exists to prove it: a one-line answer is parchment and a
tail with no frame furniture, and the plaque only appears when something is genuinely urgent, its colour saying
which tier. If every trivial reply gets the full treatment, "it is 3:14" ends up in a carved frame and looks
absurd.

**The icon and colour rule.** Two independent channels, the same discipline `Theme.cs` already applies to colour
alone. Icon = what kind of thing this is: briefcase a job, envelope email, calendar a meeting, document a file,
clock a deadline, bell a reminder, brackets a Claude session, globe a link, book a remembered fact. Colour = how
it is doing: green good, gold normal, orange careful, red stop, grey inactive. Neither ever changes meaning. The
first draft of D got this wrong, giving three jobs three different icons, which made the icon decorate the row
instead of naming it.

**What this costs in the Core — built 2026-09-24.** A new `present_list` tool (`tools.ts`, next to
`create_job_card`), model-driven per the design decision: the model calls it alongside its own short prose
whenever a reply is naturally list-shaped, capped at 5 items server-side (`z.array(...).max(5)`), with a
`moreCount` for anything beyond that so nothing is silently dropped. One `icon` per list, not per item (fixed a
mistake from the D mockup's first draft: three jobs each got a different icon, which made the icon decorate the
row instead of naming it). New wire types in `protocol.ts` (`StructuredList`/`StructuredItem`/`ListIcon`/
`ChipTone`) so the exact same shape can feed a Discord card later without a second design pass. `core.ts` mirrors
the existing `turnActions` pattern: a `pendingList` field reset per submission, set by the tool, attached to the
turn's own final `bubble` message when it completes - never leaks into a later turn that never called it (tested
directly in `routing.test.ts`). The full inventory of icon kinds: job, email, meeting, file, deadline, reminder,
session, link, memory. Chip tone reuses `Theme.cs`'s existing five-way vocabulary (good/normal/careful/stop/
inactive) rather than inventing a new one.

**The Body side, also built.** `BubbleView.cs` gained a `Rows` property (named to avoid colliding with the
`List<T>` type already used in the file for `lines`) that grows the bubble's own height to fit, exactly the way
`Asking`'s setter already does for permission choices. Rows draw below the text as a subtle carved-feeling block:
icon, title, subtitle, an optional colour-coded chip, capped at 5 so it never needs its own scrollbar, with a
plain "N more" line under them when `moreCount` is set. `PetWindow.cs`'s existing pixel-icon drawing (`DrawIcon`,
previously private and only serving the docked marker) was pulled out into a new shared `PixelIcon.cs` so the
bubble's rows and the docked marker draw from the same icon language rather than two. Nine new hand-authored
glyphs, one per icon kind - a first pass built by reasoning about the pixel grid, not by seeing it render, the
same honest caveat as everything else visual in this project: it needs real eyes before it counts as finished.
40 Body tests pass (3 new, covering grow-to-fit, reset-on-a-new-reply, and clear).

**And then it shipped looking nothing like D, which is worth writing down rather than quietly fixing.** Joshua,
seeing the first real render: "This is NOTHING like what you proposed in D. Not even close." He was right. What
got built was the *mechanism* - the tool, the wire format, rows that grow the bubble, icons, chips - on top of
the bubble's existing flat ink fill and plain rounded rows. What made D look like D was never the mechanism: it
was the carved wood frame, the grain, and colour that ranks the rows. None of that was built, and the work was
still reported as "style D," which is the actual mistake here - not the missing pixels, but calling it done
while the part he had actually picked was missing. **The rule this earns: when a visual pass is approved from a
mockup, the frame and the texture are the deliverable, not the data plumbing underneath it. Report what is
missing by name.**

**The frame, built for real 2026-09-24 (`BubbleView.cs`).** The bubble's outer fill stopped being flat
`Theme.InkFill` and became a top-lit `Wood1`->`Wood2` gradient with fixed diagonal grain streaks, clipped to the
bubble's own outline so the tail carries the wood too. `Theme.Wood1/Wood2/WoodGrain/WoodPlaque` had existed in
the theme since the tray menu was built and the bubble - the surface Aang actually speaks through - had never
used any of them. A second, much fainter grain pass at a different spacing goes on the parchment inset, so the
reading surface has texture without fighting the text. `DrawGrain` takes the colour and spacing as arguments
precisely so those two passes share one implementation and cannot drift apart. Rows changed from a flat wash to
a two-stop gradient with a hairline border, a recessed `WoodPlaque` icon slot with a gold edge (the icon sits
*in* something now instead of floating on the row), and a 3px left stripe carrying `ChipColor(item.ChipTone)` -
so the colour ranking reads down the list even on rows with no chip, which was D's whole point. `fillC` is gone
from the file; nothing uses it. 40/40 Body tests still pass.

*Still not verified by Joshua in the real UI* - the rows only appear when a reply actually calls `present_list`,
so this needs one more live test before it counts as finished. Same standing rule as everything else visual
here: a green build is not a look.

**Real-world check found a real gap, and it was diagnosed from the actual log, not guessed.** First live test
("give me a short test list of three fake items...") came back as one plain sentence, no rows. `turns.jsonl`
confirmed the turn ran on `smart` (which has the tool) and made `"tools":[]` - so the model simply chose not to
call it, not a routing or rendering bug. Read as `voice.ts`'s own stated philosophy predicts: "prompts are not
guarantees." The instruction was soft and had no worked example, and "jobs found, files, results" plausibly read
as *real search results only*, not explicitly-fake test data. Strengthened both the inline instruction (two or
more named things, even made up, every time) and added a worked `<example>` using this exact failed case,
matching the file's own established convention (examples steer tone most reliably, per the file's opening
comment). **Unlike the markdown fix, this cannot be made deterministic** - there is no linter equivalent for
"the model chose not to call a tool." It is now better-prompted, not guaranteed. Needs a second real check.

**1b-iii. Conversation view (board F).** Both voices in the scrollback: yours on recessed plum with a `YOU`
label, his on parchment. Distinguishable without reading a word, and it reuses `Plum`/`PlumEdge`, already in the
theme as "the quiet alternative" and currently only used for buttons.

**1b-ii. The typewriter reveal, which is mostly already built.** `BubbleView.cs:84-88` already holds `full` and
`shown`, and `StepReveal()` at `:254-262` already reveals text a few characters at a time. The reason it reads as
bursty rather than as a typewriter is the cadence: `shown + Math.Max(2, backlog / 6)` accelerates with the
backlog, so a long reply arrives almost at once. Two changes: a steady readable rate instead of a
backlog-proportional one, and a click anywhere in the bubble sets `shown = full.Length` to dump the rest. That
second part is what makes "always on" bearable, and it is the convention every RPG uses.

*The one real risk:* at a fixed rate, a reply the model produces faster than you can read will leave the reveal
running after the model has finished. The click is the release valve, so the rate should be tuned to be
comfortable rather than slow.

**1c. Scrollback.** A conversation is a run of turns with no long gap between them. All conversations archived in
the Panel, which already has a History tab reading `memory.history`. The bubble scrolls the current conversation
only, which keeps it bounded and keeps it honest. The UI should not imply that scrolling up shows what Aang still
has in context; those are different things.

---

## Phase 2: Security

Before attachments and calendar writes land, because both are new untrusted surface. Full evidence in
`PORT-TO-MAC.md` section 2.5.

1. **Authenticate the local WebSocket.** Any web page you open can currently ask it for every fact Aang holds,
   200 past turns, and every pending email draft, with no model and no injection involved. Reject any connection
   carrying an `Origin` header, require a per-boot token, bind permission replies to the socket that was asked.
2. **Gate `look_up_web`** (`tools.ts:439`). The only side-effecting tool that never asks.
3. **Make `files.ts` deny reads as well as writes**, and cover `Brain/*.md`, the key files and
   `~/.claude/settings.json`. One "always, write files" grant currently reaches Aang's own system prompt.
4. **Fix the hands, look and clipboard reply matching** so a reply is bound to the socket that was asked.
5. Then: real command parsing in `trust.ts`, gate the eleven ungated tools, session-scoped taint covering
   transcripts and Discord attachments, show the whole draft before approval, `SuppressEmbeds`, and the PIN.
6. **The four Mac bridge fixes**, small and independent, and prerequisites for Phase 5. Today the shared key sits
   in the launchd plist's `ProgramArguments` (`macsetup.ts:133`) so any local process can read it with `ps`; the
   comparison at `macsetup.ts:40` is not constant-time; the peer check accepts any `100.x` address rather than
   pinning Shadow; and the key travels in the URL (`core.ts:833`, `:845`).

---

## Phase 3: Discord conversation and job-prep

- **Reply system.** Stable ids on Aang's proactive messages, replies bind to a specific one, pending questions
  never expire and resolve only on a real answer. This is the foundation; build it first.
- **A `job-prep` Task type** off the existing `TaskStore`, with a deliberately narrow tool shelf: read mail, read
  attachments, propose a meeting, post and update a card. No shell, no general file write, no `run`, no
  `look_up_web`. Bound to its own Discord channel, resumable so follow-up questions days later still work,
  archived after inactivity.
- **`read_attachment`.** Download from Gmail, extract text, keep the file under a new protected folder. Gated on
  every download, taints the turn on ingest.
- **`propose_meeting`** plus the new `calendar.events` scope. Requires re-consent mid-build. Proposed, shown,
  PIN-approved, then sent.
- **Ask-first channel creation**, extended to categories.
- **Discord tidying**, which is the part that needs its own gate: creating is additive and safe, but moving,
  renaming and archiving are not. He proposes a batch ("archive these three dead job channels, put these two
  under Interviews") and nothing moves until it is approved.
- **Cards that match the desktop.** Everyday cards are ordinary embeds with a gold accent stripe and the same
  emoji-as-icon tags the bubble uses, so they stay readable, copyable and fine on a phone. Discord allows no
  fonts, backgrounds, borders or layout control, so for the big ones (job reports, interview briefs) Aang renders
  the card himself with GDI+ and attaches it as an image, with real Discord buttons underneath for the actions.
  The image is the bonus, never the substance.
- **Buttons do the thing and file it.** Pressing DRAFT IT on the desktop drafts it, files the card in the right
  Discord channel, and tells you where it went with a link you can take or ignore. No forced context switch when
  you are already at your desk.
- Any message posted in a job's channel continues that job, the same way `claude.reply` already works.

---

## Phase 4: Memory and intelligence

Ordered deliberately. The eval comes first, because without it every change below is a guess.

**4a. A 30-prompt eval, built from the real 354 turns.** Scored in two halves, deliberately. Tool choice and
recall are objectively checkable in code (did it call the tool the prompt needed, did it surface the fact it
should have), so they become ordinary tests that run any time and catch regressions for free. Voice and tone need
a human eye and get looked at occasionally, not every run. An automated judge is explicitly **not** used for the
objective half: the LOCOMO audit found one accepting 63% of intentionally wrong answers, and optimizing against a
scorer you cannot trust is worse than not measuring.

**4b. Read `ratings.jsonl`.** Written at `core.ts:1449`, read nowhere. Free signal currently on the floor.

**4c. Fix the fact system.** The database holds 9 facts, 8 retired, 1 alive. `keyNoun` (`memory.ts:425`) takes the
first word over two characters and retires any fact starting with the same one. Replace it with the
ADD/UPDATE/DELETE/NOOP decision. Adopt the mechanism because of the bug visible in the real data, not because of
the published benchmarks, which are genuinely contested. Keep superseding rather than deleting, and **keep the raw
turns retrievable** so extracted facts never become the only memory.

**4d. Automatic recall.** Top facts and turns injected into the user message, not the system prompt, so the prompt
cache survives. Roughly 2% token overhead. The real cost is making `begin()` async.

**4e. Move consolidation onto a local model.** Approved 2026-09-24, after weighing a 28B abliterated Qwen and
rejecting it (see below). `consolidate.ts` currently spends Claude tokens summarizing conversations and is gated
to stop above 40% weekly usage (`consolidate.ts:19`), so memory stops improving exactly when he has been used
most. Fact extraction is the same shape. Both are bounded, mechanical jobs where a local model is adequate, and
moving them off Claude frees frontier tokens for real conversation. Target something in the 7-8B range, which
sits alongside embeddinggemma without fighting WoW for the GPU.

**The model is chosen by measurement, not from a spec sheet.** Once 4a exists, run two or three candidates on the
real GPU against it and keep whichever extracts facts most reliably at a footprint that does not compete with a
game. This depends on 4a, so it cannot start first.

*Rejected, with reasons, so it is not revisited by accident:* a 28B abliterated model (`orcarouter/Qwen3.8-27B-Uncensored`)
would not plug into the Agent SDK without rebuilding tool calling, the permission callback, session resume and
streaming; it would be worse than Haiku 4.5 at tool selection, which is already Aang's weakest point; BF16 is
55.6 GB and a quality quantization needs roughly 16-17 GB of VRAM; and its refusal behaviour has been
deliberately removed, which is the wrong property for the decision loop of an agent that is about to get command
execution on a second machine (Phase 5). The model card itself says it is not for deployment without additional
safety layers.

**4f. Reconsider the Quick lane.** `REFUSES`, `ACT` and `QUICK_TOOLS` are three separate workarounds for one root
cause: Haiku gives up and picks the wrong tools. Quick is a quota decision, not an intelligence one. Run a week
with all three lanes exercised, read the real numbers out of `turns.jsonl`, then decide. Right now that file holds
24 records, all Quick, and the cache fields did not exist when they were written.

---

## Phase 5: The Mac helper

Approved 2026-09-24. A headless program on the Mac, no sprite and no window, that Aang on Shadow can reach over
the existing Tailscale bridge. This deliberately changes the earlier "no general remote-access door" rule, so it
is designed to be attacked.

**The risk in one sentence:** Aang reads your email, so if he can run commands on the Mac, one poisoned email is
code execution on your second machine. Everything here exists to break that sentence.

**Three tiers, matched to the size of the task.**

1. **Fixed verbs, no repeat approval.** Open a named app, screenshot, read a window, bring Claude forward. A
   closed list; no argument reaches a shell. This covers most real use and carries almost no risk.
2. **Real commands: always asked, never remembered.** Arbitrary commands are allowed, but every one asks at
   Shadow first and shows the exact string. **No standing trust on the Mac, ever.** The reasoning is specific: you
   are not sitting at that machine, so a wrong command is invisible to you, and you are not working there
   constantly, so asking every time costs little. It is also the direct fix for the `trust.ts` hole where
   approving `git` once silently approves `git status; rm -rf anything`.
3. **Multi-step work goes to Claude Code on the Mac**, which already has its own permission model and sandboxing.
   Reusing that beats rebuilding a second one badly.

**Non-negotiable, whichever tier:**

- Phase 2 first, including the four bridge fixes. The Mac can only trust "Josh approved this" if Shadow's
  approval gate is sound, and today any web page can answer Aang's permission prompts.
- Run commands inside `@anthropic-ai/sandbox-runtime` (writes denied by default, network default-deny). It must be
  verified on the real Intel machine and **must fail closed** if it will not run there.
- **Never run while tainted.** If the turn has read email, a web page or the screen, the command path refuses.
- A deny-list the helper enforces **itself**, even if Shadow asks: no `sudo`, no `launchctl`, no writes to
  `~/Library/LaunchAgents`, `~/.zshrc`, `~/.ssh` or `~/.claude/settings.json`, and no `security` command.
- Every command logged to `#log` with what ran and what came back.

---

## Phase 6: Annotation

Both directions, on Shadow, using primitives the Body already has: layered transparent windows, click-through hit
testing, and `Look.Capture`.

- **You point.** A hotkey arms it. Drag a box and he receives that crop; click without dragging and he receives
  the whole screen. Asking him out loud does the same thing. Cropping is the default because it is *more accurate*,
  not only cheaper: a full 1920-wide screen is downscaled to 1568 before he sees it, which is exactly where small
  UI text stops being readable.
- **He points.** A highlight drawn over the screen that fades after a few seconds. No dismissing, and no stale
  marks left sitting over a window that has since moved.

---

## Phase 7: Backups, M5 leftovers, and the docs

- **The backup gap, which is the real one.** `Brain/*.md` and the chat logs are pushed to a private GitHub repo.
  `aang.db`, which holds every turn, every embedding and every fact, is gitignored and has **no off-machine copy at
  all**. The data repo also has no post-commit hook and is currently sitting one commit unpushed. Fix that first.
  Then snapshots: `VACUUM INTO`, `PRAGMA integrity_check` on the output, encrypted off-machine, with a "backup ok"
  line to `#log` and an alarm if none has run in 12 hours.
- **Schema versioning and fresh-database creation.** The production schema exists only in the live file and in test
  fixtures, and `PRAGMA user_version` is 0. Nothing in `src/` can create a database. This is what makes a restore
  actually work.
- **M5 leftovers:** autostart confirmed after a real reboot, and the kill-Body-mid-animation gate. Crash recovery
  is closed as accepted. **Packaging is dropped** until Aang is ready for it, but the folder assumption it was
  hiding is worth one hour: `CoreSupervisor.FindCoreDir()` walks up looking for `src/Core`, so renaming or moving
  the repo folder silently stops the Core from starting. Make that path explicit and configurable.
- **The docs.** `ROADMAP.md` marks six built things as open and says 45 tools when there are 52. `FEATURES.md`'s
  header count is wrong in five of six cells. `PROTOCOL.md` documents 13 of 30 message types and gets
  `permission.reply`'s shape wrong. `PORT-TO-MAC.md` needs a header saying it is history.

---

## Order

1. **Phase 0a**, the typing glitch. An hour, and it is felt every day.
2. **Phase 1**, the bubble, now that style D is picked.
3. **Phase 2**, security. Before Phase 3 introduces attachments and calendar writes, and before Phase 5 gives
   Aang hands on a second machine.
4. **Phase 3**, the Discord feature.
5. **Phase 4**, memory, starting with the eval.
6. **Phase 5**, the Mac helper.
7. **Phase 6**, annotation.
8. **Phase 7**, backups and cleanup, with the `aang.db` backup pulled forward if it worries you.

Nothing is blocking a start.
