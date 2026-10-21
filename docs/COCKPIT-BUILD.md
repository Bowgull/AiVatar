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

## The progress engine (built 2026-10-21)

His asks: every progress bar in Aang "airtight and real time", and the working drop-down saying in plain (slightly
technical) words what the session is doing right now, then the to-do list. Code: `src/Core/src/claudeprogress.ts`
(the numbers and the live line), `src/Shell/pages/claudejobs.js` (the one renderer), `claude-link/hooks/` (the reports).

**The rules** (the same list heads claudeprogress.ts):
1. Only real events move a bar: a task ticked, the to-do list rewritten, a tool starting or ending, a turn starting or
   ending. Never a guess from wording.
2. Never backwards, except when Claude rewrites its to-do list (fewer or different tasks, or a task un-ticked): then the
   bar may drop, `rev` goes up, and the job says "Claude rewrote its list" for a few seconds. A viewer holds the
   furthest it has drawn and only lets go when `rev` changed.
3. Smooth between ticks: inside the task in hand the bar creeps by the pace so far (median working time per finished
   task; 2 minutes before any has finished), straight up to 60% of a pace, then easing, never past 90% of that task's
   slot. Computed by the viewer every frame from the brain's numbers, so it moves without the brain sending anything.
   Working time stops while the session is idle between turns or paused.
4. Real time (supercharged 2026-10-21): the mod tells a to-do tick at the to-do tool's START (its input already holds
   the new list), tool start/end, and Claude starting to write, think or stream a tool call (`turn.step`). It never
   waits: an event goes on the wire at once, and whatever is said while a post is out rides the next post together.
   The brain pushes on the next turn of its event loop (`LinkPusher`); only tool chatter is spaced 16 ms apart, ticks
   and turns never wait. The pages move every bar the moment the news lands (`kick()`), not at the next 90 ms breath;
   the rune fills on the message and creeps on a 100 ms step drawn on an animation frame. No polling for state.
   Measured: event -> Shell socket 2-14 ms (was 87-115 ms, plus 2.4-3.2 s freezes from the session-name lookup walking
   all of Claude-Data). `AANG_PROGRESS_TRACE=1` logs every hop (brain, Shell, page).
5. Honest: no to-do list = no percent: an empty, STILL bar and ring with "Working" (nothing spins or sweeps); a
   one-step turn with no list fills to complete when it ends (`Job.finished`); time left only once there is a real
   pace; every estimate says "about".
7. Every session keeps a list (his decision, 2026-10-21): the mod adds one short paragraph at the end of every
   session's system prompt asking for a to-do list on any job with more than one step, ticked as it goes. Sessions
   with no built-in to-do tool (the Claude desktop app's) get the mod's own `progress` tool, answered by the mod and
   told to Aang like TodoWrite.
8. Survives restarts (2026-10-21): a mod meeting a brain it has not told anything (new key) sends a `snapshot` at once
   (list, turn, tools and helpers running, waits, those read-only). The brain also reads Claude Code's transcripts
   (claudescan.ts: touched in the last 30 min, last 200 KB, a few facts only, helpers and Aang's own lanes skipped) on
   start and every 10 s, so sessions from before the mod show too, `source: 'transcript'`, read-only until their mod
   talks.
6. One engine, one look: the Core computes the numbers; the Shell has one model and one live renderer
   (`progressModel`, `liveProgress`, `livePill`, `liveText`, `describeNow`, exported from claudejobs.js) for the jobs
   strip, the job cards, Samara's rune panel and the pop-out. The pet's marks read the same tracker.

**Wire additions.** Mod -> brain: `tool.start { id, tool, detail }` (detail: the safe bits only, `cmd` = a command's
first 60 characters after masking anything key- or token-like, `desc`, `file` = a file's name only, `pattern`, `where`,
`site` = a host name, `query`, `agent`, `kind`, `server`, `name`, `skill`; never file contents; the to-do tools are not
reported), `tool.end { id }` (main loop only), `agent.start { id, kind, what }` (from `agent.spawn`), `agent.end { id }`
(the agent's own `turn.complete`). The brain masks secrets again. Added 2026-10-21: every event carries `t` (when it
happened in the session); `step { what: text|thinking|tool, tool? }`; `snapshot { phase, todos, tools, agents, asks }`;
a post may hold `{ session, cwd, events: [...] }` once the brain's hello says `v: 2`. Brain -> Shell: `claude.jobs`
carries `lat { ev, rx, tx, type }` (the Shell adds `sh`); a Job carries `finished` and `source`; a wait may be
`readonly`. Brain -> Shell, on every Job:
- `progress: { done, total, cur, elapsedMs, at, paceMs|null, rev, rewroteAt|null } | null` (null = no to-do list).
  `percent` and `etaMs` stay, worked out from the same numbers (ticked tasks only).
- `activity: { now, since, agents: [{ kind, what, since }] }`. `now` comes from a small table (no model call):
  "Running the tests · npm test -- --run", "Editing bubble.js", "Searching the code for "pill(" in pages",
  "Reading a web page · github.com", "Using Samara · browser read", "Thinking" between tools, "Waiting for your OK"
  while a permission is up, "Paused". The card adds "(12 s)" and "1 helper agent: reviewing the diff".

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
