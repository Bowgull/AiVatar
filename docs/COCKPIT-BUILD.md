# The one cockpit, and Claude both ways (build plan, 2026-10-21)

His ask, repeated "for ages": **one dynamic cockpit bubble**. Everything Aang shows lives inside one bubble with one
layout engine, and Claude sessions are seen, answered and driven from it. Interviewed and decided on 2026-10-21 over
sheets 45 to 47. Mockups: `docs/cockpit/sheet-46-one-cockpit.html` (the cockpit, look **B Lantern** picked),
`sheet-45g-click-aang.html` (jobs, tracking, the purple message key, replies, multiple choice), `sheet-45f-bar.html`
(the progress bar and its task list), `sheet-45d-frames.html` (colours per mark), `sheet-45e-ways.html` (the ticks and
skull), `sheet-47-mockups-trail.html` (Samara's Mockups trail). Sounds: `sounds-45b.html` (wooden chimes, picked).

## What he decided (do not reopen)

**The cockpit**
- One object: the typing area is the bubble's bottom edge. One window: hands-off (not focusable) when Aang speaks by
  himself, takes the keyboard only when opened (notes already do this). Ctrl+Plus or a click on Aang opens it, typing ready.
- Zones, bottom to top: typing area, jobs strip, pinned (the most urgent thing waiting, "N MORE"), conversation.
  The conversation IS the scroll-back (sheet 41 merges in): day slips of cards, newest at the bottom.
- Unasked: just his one line, small. Click opens the cockpit around it.
- Sizes: grows to about two thirds of the screen when opened, lower with WoW in front; width follows content
  (~440 chat, wider for a video or the brief, up to about half the screen). Never past the screen. Never a scroll bar:
  the conversation scrolls inside and the gold arrow bobs while there is more below. Only the conversation gives up room.
- Motion: springy 0.5 s for opening, ~0.3 s for small changes, cards fade up as they arrive.
- Look: **Lantern** (dark pixel wood, each part of the day a parchment slip, rounded frame). Looks are skins on one engine.
- A Samara-style right-click menu in the bubble and the scroll-back. Clicking outside closes things (an opened row, a
  menu) like any normal interface; Esc too.
- Every message is built from the same parts: who (Aang, or Claude with the session tag), words, choices (the FFX glove,
  plum number keys, "Something else"), keys, details, Claude's words. A new kind of thing later = a new card.
- Stays outside the bubble: the wheel, pulled-out notes and timers, Samara and the pop-out, the pet marks.
- Docked behaviour: already designed and working; keep it.

**Claude, both ways**
- Watch every Claude session on the PC and the Mac, **including sessions he starts himself straight in Claude** (his ask, 2026-10-21): every one shows in the jobs list with its PC/MAC chip and can be tracked or untracked. Existing rules stay: marks only on the machine he is at, hold in WoW,
  Discord when away.
- Aang translates both ways: Claude's ask becomes a plain decision with keys; his answer becomes a precise instruction;
  Claude's exact words one click away. Multiple choice: glove rows with Claude's explanation, BEST tag; several picks =
  boxes + "Send N picks"; several questions = "QUESTION 2 OF 3" with Back.
- Permissions from the bubble: Allow / Always / No / No, and...
- Talking to a session: in the same conversation, tagged (Claude's real app icon + session name); tapping the tag filters.
  The purple key on a job points the typing area at that session: **Send now** (slips in at Claude's next step) or
  **After this task** (Aang holds it until the current to-do task is ticked).
- Jobs strip: ONE tracked bar (the job he started last), up to two; "N other jobs running" opens a list with Track this;
  when a tracked job finishes the next running one takes its place. The bar: overall %, time left, a notch per task, the
  current task's piece glowing (45f soft pill, sea/honey, never harsh gold). Click unfolds the task list (the tracker)
  with Pause, model switch and Open in Claude. Click the % and it flips to "N% WEEK" (quota for that job).
- Marks and glows, one colour each (45d): working honey, permission/needs-you pale blue (blocking only), question
  lavender "?", plan ready sage scroll, step done small sea tick, job complete bigger terracotta tick, paused slate,
  failed coral skull. Marks sit just above his head. Nothing else over his head; he stays in calm idle while Claude works.
- Step done = quiet plaque + tiny tick sound; JOB COMPLETE only when every task is done (ribbon, chime).
- Start jobs from Aang: just tell him / right-click Aang / "pick Waymark back up". Trust asked once per job (Ask me /
  Trust edits / Full trust), remembered per project with a change link; plan first by size, "plan it" always wins;
  which machine asked once per project. Pause/Play after a shutdown: automatic, manual behind the job's menu.
- The Claude name in Aang's words is always a link (Claude's icon), opening that exact session.
- Sounds: the wooden chime set (sounds-45b), plus a volume slider and mute in Settings.
- Samara's band gets the job chip.
- Not in this build (he left them out): stop a job, change trust mid-job, failed-job history, GitHub test runs inside tasks, Discord cards.

## Build order

- **C0 Samara Mockups trail** (sheet 47): BUILT 2026-10-21 (688973f): versions, history, broom, branches.
  **Send a mockup to Aang** (his yes, 2026-10-21): right-click a mockup, a version or a branch -> Send to Aang; the
  picture, its notes and the exact version travel as a chip (Samara side being built). **Aang remembers mockups** you
  attach, by name, branch and version with a one-line summary (not the pictures), so "the cockpit mockup" works next week:
  part of C2 (the brain). In the cockpit (C3/C4) the chip sits on the typing area and the purple key passes it to a session.
- **C1 The link add-on, checked first.** A Claude Code mod/plugin on the PC and the Mac that loads into EVERY session.
  Check before anything else that it does: PermissionRequest `decision`, answering AskUserQuestion, reading the to-do
  list (TaskCreated/TaskCompleted), `$.prompt.submit` to resume, model switch, `turn.abort` for Pause, and the deep link
  `claude://claude.ai/epitaxy/<sessionId>` to open a session. Talks only to Aang's hook server on this PC (or the Mac's
  locked listener), with the per-run key; nothing else may answer for him.
- **C2 The brain:** a job tracker per session (tasks, progress, time left, quota), the waiting queue in priority order,
  translation both ways (fast model), "after this task" holding, tracked jobs.
- **C3 The cockpit engine:** one window, the zones, measuring and the size rules, focus switching, the Lantern skin,
  right-click menu, click-out and Esc, every existing message moved onto the card parts (asks, plans, brief, videos,
  timers dial, notes board, the scroll-back). Carry every behaviour on the parity list (NEW-BUBBLE-PARITY-AUDIT.md).
- **C4 Claude in the cockpit:** pinned waiting cards, the jobs strip, tracking, the purple key, tagged messages, the % flip.
- **C5 Marks, glows and sounds:** new marks, colours, wooden chimes, volume and mute.
- **C6 Starting and resuming jobs.**
- **C7 Samara's band chip.**

Every step: tests for what was built only (his test budget), commit and push, a whats-new line, the Mac through the
UPDATE key with the one-line warning first.

## C1/C2 wire format (built 2026-10-21)

**The mod** is `claude-link/` (name `aang-link`), loaded into every Claude Code session on this PC through
`CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. The brain's side is
`src/Core/src/claudelink.ts` (JobTracker, LinkDoor) on the HookServer (127.0.0.1:47832, loopback only, no Origin,
this machine's Host name). PC only; the Mac is not linked yet.

What the mod can and cannot do (checked against the 2.1.299 types and binary):
- Reports: session id, folder, model, turn start/end, usage after each turn (context %, rate limits, cost), and the
  to-do list from TodoWrite and TaskCreate/TaskUpdate/TaskList (main loop only).
- Permissions, questions, plans: a `classic.PermissionRequest` hook. Claude Code runs those hooks *beside* its own
  dialog (terminal and desktop app alike), so the dialog is never hidden or delayed; whichever he answers first wins.
  An answer in Claude's own dialog takes Aang's card down when that tool call ends (there is no earlier signal).
  Not raised for the few "person only" safety checks: those stay in Claude only.
- A plugin cannot press Claude's dialog (`ui.press` never reaches it: the engine draws the permission dialog alone).
- Messages: mid-turn `$.session.append` (Claude reads it at its next step; not shown as a typed prompt), idle
  `$.prompt.submit`. Pause = `$.turn.abort`. Play = a short prompt. Model = `$.command.run('/model <name>')`.

**The lock.** The brain writes a fresh key each run to `link.key` in his Aang folder (`C:\Users\Shadow\Documents\Aang`,
git-ignored, deleted on a clean stop). Every mod request carries `x-aang-link-ts` (ms) and
`x-aang-link-sig = HMAC-SHA256(key, "req\n" + ts + "\n" + METHOD + "\n" + path?query + "\n" + body)` (hex; within
2 minutes). Before sending anything the mod asks `GET /link/hello?n=<nonce>` and needs
`{ proof: HMAC(key, "hello\n" + nonce) }`. Every item handed back carries
`mac = HMAC(key, nonce + "\n" + session + "\n" + id + "\n" + kind + "\n" + body)` for the nonce of that same poll;
the mod acts on nothing else. The mod builds HMAC from `crypto.subtle.digest` (its only WebCrypto).

**Mod -> brain** `POST /link/event`, body `{ session, cwd, model?, type, ... }`, answered 204:
- `start`; `turn.start { prompt }`; `turn.end { aborted, usage: { contextPercent?, rateLimits[{ kind, percentUsed,
  resetsAt? }], costUsd? } }`; `todos { todos: [{ text, status: pending|in_progress|completed, active? }] }`;
  `model`; `end { reason }`
- `ask { id, kind: permission|question|plan, tool, summary, input (exact JSON, 2000 chars), canAlways, questions?, plan? }`
- `resolved { id }` (answered in Claude itself)

**Brain -> mod** (long polls, held up to 25 s, answer `{ items: [{ id, kind, body, mac }] }`, `body` a JSON string):
- `GET /link/wait?s=<session>&n=<nonce>`: `inbox { text }`, `pause {}`, `play { text? }`, `model { model }`
- `GET /link/answer?s=<session>&r=<ask id>&n=<nonce>`: `answer { decision: allow|always|deny|deny-message, message? }`
  or `answer { answers: { "<question text>": "<label(s) or his words>" } }`, or `gone {}` (no longer waiting)

**Brain -> Shell** (`ToBody`):
- `{ t: 'claude.jobs', jobs: Job[] }`, newest activity first. Job = `{ id, machine: 'pc', cwd, project, model,
  phase: working|idle|paused|ended, startedAt, lastActivity, prompt, tasks: [{ text, status, active? }],
  current, percent (0-100|null), etaMs (|null), usage, open: 'claude://claude.ai/epitaxy/<id>', held }`
- `{ t: 'claude.wait', items: WaitItem[] }`, permission > question > plan, oldest first. WaitItem = `{ id, session,
  project, kind, tool, summary, input, questions?, plan?, canAlways, at }`
- `{ t: 'claude.said', of, ok, why? }`: whether his last claude.* message was taken, and the plain reason if not.

**Shell -> brain** (`FromBody`, accepted from the Shell only):
- `{ t: 'claude.answer', id, decision?, message?, answers? }`
- `{ t: 'claude.send', session, text, when: 'now' | 'after' }` (after = held until the task in progress is ticked;
  with no to-do list, until the turn ends)
- `{ t: 'claude.pause', session }`, `{ t: 'claude.play', session, text? }`, `{ t: 'claude.model', session, model }`

In the brain: `core.claudeJobs.list()`, `.waiting()`, `.answer(id, a)`, `.send(session, text, when)`, `.pause()`,
`.play()`, `.setModel()`. Not built here: the fast-model translation both ways, tracked jobs, quota per job.

### Plain words (2026-10-21)
- Every new waiting item is rewritten in the background (src/Core/src/plainwords.ts): `WaitItem.plain` (one everyday sentence) and, for a single question, `options[i].plain`. A fresh `claude.wait` carries them a few seconds later; the bubble shows `plain` when set, else `summary`. Exact input stays one click away.
- His words to a session (`claude.send`, `deny-message`, a question answer that is not one of Claude's labels) are made precise first, with his own words kept under them. Picked labels (several joined with ", ") go untouched.
- Qwen on this PC first (free, steps aside in a game), Claude's quick model only as the fallback.

## The progress engine (v3, built 2026-10-21 from docs/PROGRESS-RESEARCH.md)

His asks: every progress bar in Aang "airtight and real time", accurate bars and an accurate time left, the working
drop-down saying in plain (slightly technical) words what the session is doing right now; then (v3, "yes build it, go
big") everything in the research's build list. Code: `src/Core/src/progressmath.ts` (the arithmetic),
`src/Core/src/progresshistory.ts` (how long things take here), `src/Core/src/claudeprogress.ts` (the keepers and the
live line), `src/Core/src/claudeci.ts` (CI), `src/Core/src/claudelink.ts` (the tracker), `src/Shell/pages/progressmath.js`
(the Shell's line-for-line copy of the arithmetic, checked against the brain's in `progressmath.test.ts`),
`src/Shell/pages/claudejobs.js` (the one renderer), `claude-link/hooks/` (the reports).

**The rules** (the same list heads claudeprogress.ts):
1. Only real events move a bar: a task ticked, the list changed, a tool starting or ending, a turn starting or ending.
   Between events the bar creeps by working time, against how long that kind of item usually takes HERE.
2. Weighted by time, not by count (the Gradle mistake): every item's slice is its expected duration, a lognormal
   `(mu, sigma)` in log-ms from his history (below). `fraction = (doneW + e) / (doneW + e + curRem + pendW)`, time left
   `= curRem + pendW`, the same numbers, so they never disagree. `doneW` = the finished items' real working time; `e` =
   working time on the item in hand; `curRem` = the median of its lognormal given it has already run `e`, less `e` (the
   honest overrun curve: a late item keeps inching, never "about 0 min"); `pendW` = the pending items' means times the
   session's speed factor `r = exp(sum ln(actual/median) / (n + 2))`. Before the first tick the bar can't pass a third.
   A foreground helper agent puts a floor under `curRem`. 100% only with every item ticked.
3. Never backwards: a rewritten list keeps the bar where it was drawn (`a`) and fills the rest at a pace that ends at
   100% with the work: `shown = a + (1 - a) * max(0, m - m0) / (1 - m0)` (`sq` on the wire). The time left may rise; when
   it jumps over 25% on a list already under way the line says why once: "Claude added 3 steps", "Tidying its memory",
   "Taking longer than usual". The 90% slot cap and the "Claude rewrote its list" drop are gone.
4. Stillness means stillness: a job is alive while tools start or end, the model streams (the mod's `alive` heartbeat,
   at most every 2 s), a helper agent calls a tool or streams, an ask comes, or the list changes. Silence past the limit
   (60 s between steps, 90 s while streaming, twice a running command's p90, at least a minute, 3 min with no history)
   freezes the bar where the stall began, turns it amber and says "No sign of life for N min"; the live line says
   "Last: Running the tests (6 min)". The first heartbeat unfreezes it. Waiting for his OK is his "needs you" blue and
   not working time (the clock stops while any ask is open); compaction is a known pause, also off the clock. A turn
   that ends in an error is red until the next turn; a failed helper agent shows red for 30 s. Done is teal.
5. Honest: no list (or one item) = no percent: the still track with a lit pip per finished tool call, and "Working";
   never a spinner. A time left only when EARNED: real data (a key on its chain with 3+ samples covering most of what is
   left, or an item of this job finished), 20 s of working time, not stalled. Words from a seeded Monte Carlo (500 draws:
   the item in hand truncated at `e`, the pending ones with `r`): p80/p50 under 1.6 "about 4 min left", up to 3x a range
   "4-7 min left", wider "a while yet". Rounded: under 45 s "under a minute", under 10 min whole minutes, under an hour
   the nearest 5, then "1 h 15 min". Steady: the words change only past 15%, or after 3 s on the other side of a
   rounding step (at least every 5 s).
6. Real time: the mod tells a to-do tick at the to-do tool's START, tool start/end, streaming (`turn.step`) and
   heartbeats; it never waits (what is said while a post is out rides the next post). The brain pushes on the next turn
   of its event loop (`LinkPusher`; tool chatter spaced 16 ms); every viewer draws from the numbers every frame
   (`kick()` on news). Measured: event -> Shell socket 2-14 ms; event -> page paint p99 23 ms in progress-check.ts.
7. Every session keeps a list (his decision): the mod's prompt paragraph asks for a to-do list on any job with more
   than one step. The mod's `progress` tool is now offered in EVERY session: where there is no built-in to-do tool it
   carries the list (and the plan); where TodoWrite exists it is offered for the phase plan only (shorter description).
   One more sentence asks for the plan on multi-phase projects.
8. Survives restarts: a mod meeting a new brain sends a `snapshot` (list, turn, tools, helpers, waits read-only, plan);
   the brain reads Claude Code's transcripts (claudescan.ts) so older sessions show read-only; the history and the
   plans live on disk.
9. One engine, one look: the bubble's job card, Samara's rune (ring and panel) and the pop-out all draw from
   `liveProgress`, `livePill`, `liveText`, `describeNow`, `liveOverall` and `liveRows` (claudejobs.js). The rune ring
   turns a dimmed amber on a stall (working is already his amber there).

**History** (`progress-history.jsonl` in his Aang folder, git-ignored there, local only). One line per finished thing,
about 100 bytes: `{ at, s: task|cmd|agent|ci-run|ci-step|turn|phase, p, k, key, ms, m?, ok, x?, est?, id? }`. Working
time only, event times (the mod's `t`), never arrival times. Only `ok` samples teach (a failed CI run is kept apart so a
hung build can't poison the median; a command he was asked about mid-run teaches nothing). Nothing secret: a to-do label
lower-cased, masked, first 5 words, at most 60 characters; a command its first 40 masked characters; no contents,
prompts or paths. Bounded: past 6,000 lines it is cut to the newest 5,000. Stats are rebuilt from the file on start
(the last 30 values per key). Keys, narrow to broad, each shrunk towards the broader one (k = 3, sigma kept 0.35-1.5):
to-do item = label in project -> project + kind -> kind everywhere -> seed prior (implement 4 min, test 90 s, build
60 s, research 3 min, review 2 min, commit 30 s, mockup 5 min, other 2.5 min; sigma 0.9; the kind from a small keyword
table, which only picks the prior); command = its start in project -> its family (`commandLabel`) in project -> the
family everywhere (no history = no sub-bar); agent = type + task kind -> type -> every agent -> 3 min; CI run = repo +
workflow + event -> repo + workflow; CI step = repo + workflow + job + step. A lone tick teaches its label (several
ticked at once do not: a shared time is a guess). A per-model-family multiplier (shrunk k = 5) nudges fresh estimates.

**OVERALL** (the two levels from his Waymark mod). Claude passes `plan: { phases: [{ label, hours, status }] }` to the
progress tool and keeps it current; the brain keeps each project's plan in `progress-plans.json` with the working time
each phase has had (summed across the project's sessions at every turn end, so a phase can span sessions and days).
A phase that finishes with time behind it becomes a `phase` history line; `R` = geometric mean of actual/estimate,
shrunk to 1 (k = 2). `overall = (done estimates + running estimate x its live fraction) / all estimates`, time left
`= (running x (1 - fraction) + todo) x R`; the running phase's fraction is time-based (its working time against its
calibrated estimate, the same overrun curve; one session's to-do list is one turn, not a phase). p50/p80 from a
bootstrap of his past ratios (3+) or a spread round R: "phase 2 of 5 · about 6 h of build left, maybe 9". Build hours,
never calendar time: it does not tick while nobody works on the project.

**CI** (claudeci.ts). Only where `gh` is installed and the session's folder has a GitHub remote. Once per repo: the last
20 runs (history) and the steps of up to 10 good ones. After a session pushes: a look 3 s later, then every 5 s for up to
2 minutes until the new run shows. While a run is queued or in progress: every 5 s. Otherwise nothing. One `gh` at a
time, 15 s limit each, never on the event path. A run's bar is step-weighted from each step's own history (the slowest
job is the run's), or the run as one item once its workflow has 3 runs; a queued run has no bar ("waiting for a runner").
A finished run is learned once (by id) and stays on the card for 2 minutes.

**Plumbing.** The mod: every event carries `gen` (its load) and `sq` (a number); a post that fails or takes over 300 ms
(was 900) is tried once more before anything is dropped; the hello proof is renewed in the background every 25 s so an
event never waits on it. The brain: a number seen before is dropped (a retry that got through twice); a gap pushes a
MAC'd `resync` item, and the mod answers with a snapshot. Every clock runs on the event's `t` (bounded to the last 10
minutes). The brain's event loop is watched (`monitorEventLoopDelay`): a p99 over 20 ms in a 30 s window is logged.
With `AANG_PROGRESS_TRACE=1`, session -> brain and event -> paint p50/p95/p99 are logged every 200 events.
progress-check.ts fails if event -> paint p99 is over 150 ms.

**Wire (v3).** Mod -> brain, added: `alive { outTok? | agent }`; `agent.tool { id }` (a helper agent's tool call);
`agent.start { ..., bg? }`; `agent.end { id, ok }`; `tool.end { id, ok }`; `turn.end { ..., reason }`;
`compact { on }`; `plan { phases }`; `snapshot { ..., plan? }`; every event `gen`, `sq`. Brain -> mod: `resync {}`.
Brain -> Shell, on every Job:
- `progress` (null = no list): `{ v: 3, done, total, cur, at, e, jobW, doneW, curEst: { mu, sigma } | null, pend: [{ mu,
  sigma }], r, earned, sq: { a, m0 } | null, note: { text, at } | null, aliveAt, stallMs, running, rev, rewroteAt,
  elapsedMs, paceMs: null }`. `percent` = the bar when sent; `etaMs` = the time left when earned, else null.
- `activity: { now, since, agents: [{ id, kind, what, since, calls, aliveAt, est, n, fg, failed?, endedAt?, done?,
  total? }], tool: { since, est, n, usual } | null, pips, aliveAt, stallMs }`.

**Helper agents (sheet 58, his pick C, 2026-10-21).** Each helper is a small row tucked under its job's bar, always in
view, the same in the bubble's card, Samara's rune panel and the pop-out (claudejobs.js `liveAgents`, styled once in
cockpit.css `.agc`): its type icon (six hand-pixelled 10x10 icons: Research, Explore, Build, Check, Design, Plan), the
type and what it is doing, its own thin bar, and its % or time. The type comes from ONE classifier (`agentType`:
subagent type first, then its words). The bar is honest: its own to-do list when it keeps one (the mod sends
`agent.todos { id, done, total }`, counts only, from TodoWrite or the progress tool), else its time against its type's
usual once the history has 3 runs (paler), else the still track with a pip per tool call; failed is red. Three rows at
most, then "+N more". Helpers are never jobs. No count anywhere: no number on Aang's mark, and the rune's gold job-count
pip is gone (his words: "I don't care about the numbers at all").
- `failed`, `plan: { phases, runE, at, running, R, ratios } | null`, `ci: [{ id, repo, workflow, title, url, status,
  conclusion, createdAt, startedAt, step, stepNo, steps, progress }]`.

**Where v3 differs from the research, and why.** OVERALL comes from the plan Claude passes to the progress tool (his build
list), not a `.aang/roadmap.json` file. Stats are rebuilt in memory from the history file on start, not kept in a second
`progress-stats.json` (one file to keep bounded). The headline time left is the deterministic `curRem + pendW` (so it
matches the bar exactly); the Monte Carlo decides only "about" / range / "a while yet" and the range's top. Waiting on
him is his blue, not yellow, and the rune shows a stall as dimmed amber, because those colours were his own picks. The
expected-compaction add-on (context over 80%) and the plan-to-roadmap offer from ExitPlanMode are not built; the
backwards shimmer is cosmetic and waits for his yes.

**Other bars in Aang** (checked 2026-10-21): Samara's page-loading bar (browser.js) already follows the same idea (real
load milestones, a creep capped at 90%, never back) and is another builder's file; the downloads ring fills from real
bytes; the week/five-hour bars in the typing area are measurements, not job progress; timers count real time; the engine
update key and the Waymark refresh have no bar at all. None needed converting. Re-checked 2026-10-21: the bubble's job
strip, the job pop-out and Samara's rune (ring and panel) all draw from the one engine and move on the brain's message
itself (claudejobs.js `kick`, jobpop.js, rune.js), with no polling.

## THE PIVOT (2026-10-21, evening) - read this before anything above

The wooden "one cockpit" (C3, sheet 46 Lantern, AANG_COCKPIT) was built, tried on his real desktop, and REJECTED:
"it doesn't make sense that Aang would have a full wooden speech bubble", "I prefer the chat box being separate".
What he has always meant by "one dynamic bubble / bubble engine":

- **A living speech bubble** off Aang's head (sheet 53, look **B**: light parchment, comic tail; its wood rim and
  corner studs are being redone on sheet 54). ONE engine reshapes it for whatever he says: a one-liner stays tiny, a
  question grows keys, Claude's multiple choice grows the answer rows, a job's progress, the brief, a video; then it
  shrinks back. Grow ~520 ms spring with slight overshoot, shrink ~340 ms, pieces fade in ~55 ms apart.
- **The typing box is separate** (the old InputBox window under Aang).
- **Clicking Aang = just the chat box.** Only if he spoke in the last **5 minutes** does that line sit above the box
  with an "N MIN AGO" stamp. History: the wheel over Aang, his right-click menu, or asking. No OLDER key anywhere.
- **Claude jobs live in his working mark** (the 3-dot icon over his head); clicking it grows the bubble with the jobs.
- **Inside the bubble** (sheet 51 picks, approved via sheet 53): choices = each answer its own box, the pointed-at
  answer plum with white text, the slim finger (G1), teal BEST, no number keys (arrows + Enter); "Styled" type roles
  (no carved first letters); paper per kind in the history with the label growing in on hover (sheet 48).
- **Aura:** sheet 51 **A soft falloff** (pure haze, breathing in size and brightness), only on marks that want him.
- **Mark colours (final):** working #f0a64a, needs you #7cc4ff, question #b07cff, plan #f3e2b8 (cream scroll), step
  #ffc8a8 (peach), job complete #3fc4b4 (teal tick, no circle), paused #6f7787, failed #e8443a.
- **Who speaks when:** Claude Code in front = Aang silent (held, not dropped); Aang is the only thing that interrupts;
  Samara's rune is a gauge only, never chimes. "Nice" exists ONLY on a popped-out job; elsewhere a finished job shows
  teal ~4 s and folds away.
- **Samara rune** (built): Claude-logo starburst on a stone, ring fills with live progress, one rune + a number for
  several jobs, numbers hide while its rounded drop-down is open; drop-down = live description + to-do list.
- **Job pop-out** (sheet 52, approved, not built): borderless sleek job bubble, one pin icon that looks clearly
  different when pinned, see-through slider appears on hover by the pin and keeps his fade, long-press to tear off
  (strip closes the gap Mac-like), drag onto Aang to put it back (the bubble just grows, no placeholder), JOB COMPLETE +
  "Nice" closes it.
- **Progress engine** (built, claudeprogress.ts): only real events move bars; never backwards except a rewritten list
  (said once); smooth creep inside the current task capped below its end; pushed instantly; no list = no percent.
- **Process lesson:** mockups are REAL renders of the product page; Claude checks every picture and then the real
  desktop (a fresh Shell: Samara keeps an old one alive) before telling him it works.

### The speech bubble, built (2026-10-21)
- Cockpit OFF by default again (`AANG_COCKPIT=1` brings it back; code kept). The one bubble + the separate InputBox.
- Look B lives in bubble.css's sheet 53 block (lifted from test/electron/speech-shots.ts). The rim is a placeholder:
  the `.wrap.rimB` custom properties (paper, ink, width) and the empty `#skin g.rim` group (balloon.js, outline on
  `data-d`) are the only places sheet 54's wood rim and studs need to touch.
- Click Aang (`typebox`): main.ts opens the box and sends `bubble:recall 'recent'`; the page shows his line from the
  last 5 minutes as a small line with an "N MIN AGO" stamp (a waiting Aang question comes back first), which goes when
  the box closes (`bubble:dismiss 'boxclosed'`). The bubble sits 14 px higher while the box is open.
- Click the working mark: the pet sends the same `typebox` (src/Body untouched); main.ts tells it apart by the cursor
  being over the mark's spot above his head (ClaudeMarks.cs geometry) and sends `bubble:recall 'jobs'`: a waiting
  Claude question card first, else every running job as a folded bar ("Claude is on two jobs."). Click out shrinks it.
- Check: test/electron/speech-bubble-check.ts (pictures in test/electron/perf-out/speech/).
- Comic lettering (built 2026-10-22, POPOUTS-NOTES-RESEARCH.md section 1's table): bubble.js `letterWhole` (whole
  messages: width by length band, balanced/pretty breaks, balloon hugs the longest line, short plain ones centred on
  22 px), `widenAtThird` (a narrow streamed reply widens only at line 3; lines 1-2 frozen as hard breaks), line-step
  growth on the 520 ms spring, bold italic emphasis, tail aimed at his mouth (balloon.js MOUTH_FROM_HEAD, reach still
  0.75). Check: test/electron/lettering-check.ts.

### Notes: Aang notices things (DECIDED 2026-10-22)
- He does NOT want notes hidden from Aang. Keep forAang, and add Qwen-run noticing: one line, click opens the note,
  per-note "Aang can bring this up" toggle. Full rules: docs/POPOUTS-NOTES-RESEARCH.md, last section. Mockup: sheet 60.
