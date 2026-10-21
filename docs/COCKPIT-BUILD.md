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
