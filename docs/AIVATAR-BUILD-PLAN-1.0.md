# AiVatar Build Plan 1.0

**Version 1.0** | Written 2026-10-01 | Owner: Joshua Bocas

The ordered, step-by-step plan for finishing Aang.

Every step says what to change, where, how to check it worked, and how to undo it.
Nothing here is a guess: every file and line number was read from the real code, and
every claim marked **[measured]** came from a test run on this machine.

**This document is the one you follow.** When it disagrees with an older doc, it wins,
except for `WHAT-IS-LEFT.md`, which remains the authority on *what exists*. This one is
the authority on *what order to do it in*.

---

## How to use this

Each step has a checkbox. Tick it only when the **Done when** line is true, not when the
edit is made. An edit that has not been checked is not finished.

Status markers used below:

| marker | meaning |
|---|---|
| `[ ]` | not started |
| `[~]` | in progress |
| `[x]` | done and verified |
| **BLOCKS** | something else cannot start until this is `[x]` |

**Where we are right now: PHASES 0, 1 AND 2 COMPLETE, plus an unplanned fix that turned out to
matter more than either, and 5.7 absorbed into 0.2. 2.5 PASSED: asked "whats my status with octup", Aang called Read and answered correctly from
applications.md. Two prompt faults found and fixed to get there, neither of them plumbing: voice.ts
told him to OFFER to look, and profile.md only told him to read the file if he already knew the
question was about the job hunt. Lindsay path resolved: there are TWO folders, `Lindsay's Job Hunt` in his own My Drive and `🎯 Lindsay's Job Hunt` shared by her; both are excluded by normalised name.**

### Found while verifying 0.1: Aang was being stalled mid-reply, for six days

Verifying 0.1 needed the turn log, which turned out to be stale since 2026-09-24. Chasing
that found a fault that was never in the plan and was doing real damage:

1. The supervisor disposed the `core.log` writer the moment a Core exited, while its two
   fire-and-forget reader tasks still held it. They threw into a bare `catch {}` and died,
   leaking the file handle.
2. The next spawn could not open `core.log`, and failed **after** `Process.Start`, so the
   Core ran with its output redirected into a pipe nobody was reading.
3. A full pipe stalls the writer. **Replies came back truncated** (one arrived as a single
   full stop) and metrics writes were skipped.
4. Every restart after the first leak failed identically, in silence, because the error
   went to `body.log`, which had died of the same cause.

Fixed in `4433220` (share the log file, drain the pipes even when the log cannot be opened,
await the readers before disposing) and `946567a` (a failed write now reports itself once,
then at each power of ten). Confirmed after the fix: `core.log` writing with full dates for
the first time since 2026-09-24, `turns.jsonl` recording again, and a whole reply.

**Two lessons worth carrying into the rest of this plan.** A "best effort" catch that
discards the reason is not best effort, it is a blindfold: this cost six days. And the
dateless `HH:mm:ss` stamps in `core.log` made a line from 2026-09-24 read exactly like one
from this morning, which sent the diagnosis in the wrong direction more than once. Step 5.1
already covers that and is now partly done.

### Caveat on the 0.1 saving: it only lands on a NEW session

Measured after the change, quick lane: 25,051 and 25,415 tokens against a 28,386 average.
That is about 3,300 saved, not the ~46,000 the probe showed, and the reason is in the same
records: `cacheRead` was 24,760 and 25,122. **A resumed session is still reading the prefix
built with the old tool list.** The full saving appears when a lane starts a genuinely new
session, which happens on its own once the current ones age out (`MAX_SESSION_AGE_DAYS`, 7
days) or sooner if the sessions are cleared deliberately. Nothing is wrong with the change;
the probe and the test both confirm it is applied.

---

## Ground rules

These are not optional. They come from mistakes already made in this project.

1. **One step, one commit.** Never bundle. If a step breaks something, the revert is one
   command. Commit message says what changed and why.

2. **Work on a branch, not `main`.**
   ```bash
   git checkout -b phase-0-quota-and-safety
   ```

3. **Run the targeted test, not the whole suite.** The suite costs real quota and has
   known pre-existing flakiness (`WHAT-IS-LEFT.md` §1.3). Each step below names the one
   test to run.

4. **A green test is not a working app.** For anything visual, build the Body, restart
   the real `Aang.exe`, and look at it. This rule exists because a visual pass was
   reported done from code alone and was wrong.

5. **`Aang.exe` locks the build.** Stop the process, build, start it, verify.
   ```bash
   powershell -NoProfile -Command "Get-Process Aang -ErrorAction SilentlyContinue | Stop-Process -Force"
   ```

6. **Never use PowerShell to write files with non-ASCII characters.** It corrupts UTF-8
   on this machine. Use the editor tools.

7. **Stop and ask when a step's Verify fails twice.** Do not improvise a third approach.

---

# PHASE 0: cheapest first, and the live risk

**Goal:** make every later conversation cheaper, and stop the one failure that is live
right now. Half a day.

**Entry:** nothing. Start here.
**Exit:** steps 0.1 to 0.4 all `[x]`.

---

### `[x]` 0.0 Commit what is already on disk  DONE 2026-10-01 (51c8daa)

There are six untracked files from the measurement work. Commit them before touching
code so the diff of real changes stays clean.

```bash
git add docs/HANDOFF-2-REVIEW.md docs/LOCAL-MODEL-PLAN.md docs/QUOTA-MEASURED.md docs/BUILD-PLAN.md tools/measure/
```

```bash
git commit -m "Measurement tools and the research verdicts they produced"
```

**Done when:** `git status --short` shows nothing untracked in `docs/` or `tools/`.

---

### `[x]` 0.1 Stop loading 40 tools Aang cannot use  DONE 2026-10-01 (21dd4b6)

**Why:** **[measured]** A live probe showed the engine loads every built-in tool into
every conversation. With all of them: 56,822 tokens. With only the three Aang needs:
3,904. The gap is **46,323 tokens on every single conversation start**, for tools like
`EnterPlanMode`, `CronCreate` and `ShowOnboardingRolePicker` that mean nothing to a
desktop pet. Full working in `QUOTA-MEASURED.md`.

Worse: `core.ts:1083` already *disallows* most of them. `disallowedTools` stops the model
calling a tool but does not stop the schema being sent. You pay for tools you have
forbidden.

**Where:** `src/Core/src/core.ts:1079-1083` (the chat lane options).

**The change:** add `onlyTools` to the chat lane options. The plumbing already exists
(`lane.ts:34` declares it, `lane.ts:136` passes it to the engine as `tools`) and two other
lanes already use it correctly: the web lane at `core.ts:1026` restricts itself to web tools
so a lane reading untrusted pages cannot see a shell, and the consolidate lane at
`core.ts:1048` passes an empty list because it is a pure text summariser. **The chat lanes
were the ones not using it.**

```ts
// Alongside allowedTools / disallowedTools at core.ts:1079
onlyTools: ['Read', 'Glob', 'Grep', 'Skill'],
```

**Why those four:** Read, Glob and Grep are the only file built-ins Aang's own code
references that are not already in `disallowedTools`. **`Skill` is the one that is easy to
miss**: `core.ts:1089` loads `skills: ['job-hunt']`, and without the Skill tool that skill
cannot be invoked. **[measured]** A probe of the engine's init message caught this before the
edit: the first draft was Read/Glob/Grep and would have broken the job search silently, with
no error and no failing test. `test/toolbudget.test.ts` now locks it. Verified by searching the whole Core for every built-in
name. `Bash`, `PowerShell`, `Write`, `Edit`, `NotebookEdit`, `WebSearch`, `WebFetch` and
the Playwright set are all already disallowed, so removing them loses nothing.

**Two things checked before recommending this, so you do not have to:**

1. **It does not filter Aang's own 53 tools.** **[measured]** A probe passing
   `tools: ['Read','Glob','Grep']` alongside a custom tool server returned
   `Glob, Grep, Read, mcp__probe__canary`. The custom tool survived. `tools:` restricts
   built-ins only.
2. **It does not contradict the 2026-09-20 finding** recorded at `core.ts:1070`, that web
   tools must be *disallowed* rather than merely left out of `allowedTools`. That finding
   is about a tool the model can still see and reach for. `tools:` removes it from the
   prompt entirely, so there is nothing to reach for. **Keep the `disallowedTools` list
   as well.** Belt and braces.

**Verify:**
```bash
cd src/Core && npm run check
```
Then start Aang, send one message, and read the newest line of the turn log:
```bash
node -e "const l=require('fs').readFileSync(process.env.APPDATA+'/Aang/turns.jsonl','utf8').trim().split('\n');console.log(JSON.parse(l[l.length-1]))"
```

**Done when:** `ctxTokens` on a fresh conversation is roughly **45,000 lower** than the
~62,000 baseline. Expect something near 17,000.

**Rollback:** delete the one line.

**Risk:** low. If Aang says he cannot do something he used to do, check whether it needed
a built-in beyond those three, and add it to the list.

---

### `[x]` 0.2 Memory that heals itself  DONE 2026-10-01 (e51666c)

**Why:** `memory.ts:39` reads `if (existsSync(file))`. If `aang.db` is missing or
unreadable, `this.db` stays `null`, one line goes to a console nobody reads, and **Aang
starts anyway with total amnesia and carries on talking normally.** He will not mention
it. After a power cut this is not hypothetical.

**[measured]** Note the backup itself is fine: restoring `backups/aang.db` into an empty
folder opens clean with all 412 turns, 13 facts and 391 embeddings. The brief's claim that
"the backup cannot be restored" was wrong. The silent start is the real problem.

**Where:** `src/Core/src/memory.ts:36-48`.

**The change:** when the database file is absent or fails to open, do not continue
silently. Set a flag the Core can read, and have the Core refuse to take a turn while it
is set, saying so plainly on the sprite.

Decide one of these first (**this is your call, it changes the code**):
- **(a) Refuse to run.** Safest. Aang says "I cannot find my memory, I am not going to
  pretend otherwise" and takes no turns.
- **(b) Run, but say so every turn** until it is fixed.

**Recommended: (a).** Silent amnesia is the worst of the three states, and a pet that
refuses once is easier to notice than one that quietly forgets you.

**Verify:**
```bash
cd src/Core && npm test -- test/memory.test.ts
```
Then prove it by hand: rename `aang.db`, start the Core, confirm it says so and does not
answer. Rename it back.

**Done when:** a missing database produces a visible message and no normal conversation.

**Rollback:** `git revert` the commit.

---

### `[x]` 0.3 Stop writing shell commands into the action log  DONE 2026-10-01

**Why:** `core.ts:504` writes `describeCall` output into `actions.jsonl`. **[verified]**
That includes full shell command lines (`tools.ts:333`, truncated at 70 characters) and
text Aang puts on your clipboard (`tools.ts:351`, 40 characters).

**This must land before step 4.3 (the "why did you do that" work)**, because that step
makes the log far more valuable to anyone who gets hold of it.

**Correction to the existing docs:** `PORT-TO-MAC.md:370` (finding M10) says this includes
clipboard text. That is only true for what Aang *writes* to the clipboard. What he *reads*
is not logged: `tools.ts:342` returns the fixed string `'read what you have copied'`.
Update M10 when you fix this.

**Where:** `src/Core/src/tools.ts:333` and `:351`.

**The change:** log the tool name and outcome, not the argument contents. A command
becomes `ran a shell command` in the log; the full text still appears in the permission
question Joshua sees, which is where it is actually needed.

**Verify:**
```bash
cd src/Core && npm test -- test/safety.test.ts
```
Then run a command through Aang and confirm `actions.jsonl` holds no command text.

**Done when:** no shell command text or clipboard text appears in a freshly written
`actions.jsonl` line.

---

### `[x]` 0.4 Stop the silent crash loop  DONE 2026-10-01 (6bdfb72)

**Why:** `CoreSupervisor.cs:98` backs off from 2s to 30s but has no burst limit. A Core
that dies at 61 seconds loops forever, quietly, and nothing tells you.

**Where:** `src/Body/CoreSupervisor.cs:98`.

**The change:** count deaths in a rolling five-minute window. After five, stop restarting
and show it on the pet.

**Verify:** build the Body and run the supervisor harness:
```bash
node tests/fakecore/supervisor.mjs
```

**Done when:** a Core that dies repeatedly stops being restarted and the pet shows it.

---

**PHASE 0 EXIT CHECK**

- [ ] 0.0 committed
- [ ] 0.1 cold start is ~17k tokens, not ~62k
- [ ] 0.2 missing memory is loud
- [ ] 0.3 no command text in the action log
- [ ] 0.4 crash loop stops after five

---

# PHASE 1: the two doors that must close before Drive

**Goal:** make it safe for Aang to read documents he did not write. Three hours.

**Entry:** Phase 0 done.
**Exit:** 1.1 and 1.2 both `[x]`. **Drive cannot start until then.**

**Why this phase exists:** Section 9.0 of your brief asks for 1,225 documents from Google
Drive to become readable. You asked whether the taint and permission rules cover file
contents. **They do not.** This phase is the answer.

---

### `[x]` 1.1 Reading a file must put Aang on guard  DONE 2026-10-01 (340e233)

**Why:** **[verified]** Exactly seven places in `core.ts` mark a turn as tainted:

| line | what taints the turn |
|---|---|
| 379 | reading mail or calendar |
| 452 | listing controls in a browser |
| 477 | pressing or filling a browser control |
| 599 | `read_window`, text off the screen |
| 651 | sending a picture to the phone |
| 700 | `look_at_window`, a screenshot |
| 1017 | `look_up_web` |

**Reading a file is not one of them.** So a poisoned web page makes every later action
ask again, and a poisoned *document* does not. After reading a hostile file, Aang can
still act on a remembered yes.

Today the risk is small because the files are yours. Drive is exactly what makes it real.

**Where:** the `Read`, `Glob` and `Grep` handling in `src/Core/src/core.ts`. These reach
`askPermission` but never set the flag.

**The change:** set `this.tainted = true` after a successful file read, the same way
`core.ts:599` does for the screen.

**Note the gating already exists.** `test/taint.test.ts:42-53` already asserts that `Read`
and `Glob` ask again *once the turn is tainted*. What is missing is that reading a file
does not itself cause the taint. You are completing a mechanism, not inventing one.

**Verify:**
```bash
cd src/Core && npm test -- test/taint.test.ts
```
Add a case: read a file, then attempt a trusted action, and assert it asks again.

**Done when:** the new test passes and `grep -c "tainted = true" src/Core/src/core.ts`
returns 8 or more.

---

### `[x]` 1.2 The exclusion list  DONE 2026-10-01

**Why:** `files.ts:35` refuses Aang's own state folder, his database, his undo copies, and
Windows / Program Files / ProgramData. **[verified]** It does **not** cover:

- `~/.ssh`: your keys
- `~/.claude`: your Claude credentials, and **722 session transcripts**
- `.env` files anywhere
- browser credential stores
- **`Lindsay's Job Hunt`**: someone else's data

That last one matters most. You gave a clear, permanent instruction about it. **Right now
that instruction exists only as words in a document.** Words are advice. A list in code is
a rule.

**Where:** `src/Core/src/files.ts:35`, the `refusal()` function.

**The change:** extend the refusal list. Use the existing `realish()` helper, which
resolves shortcuts, so a link named `notes.txt` pointing at `id_rsa` is still caught. That
helper exists precisely for this and is documented at `files.ts:15`.

**You must supply one thing:** the exact path of `Lindsay's Job Hunt`. It is on the
MacBook or inside Drive and cannot be seen from Shadow. **Do not guess it.** A wrong path
is a rule that does nothing.

**Verify:**
```bash
cd src/Core && npm test -- test/files.test.ts
```
Add a case per excluded path, including one reached through a shortcut.

**Done when:** every path above is refused, by direct path and via a shortcut.

---

**PHASE 1 EXIT CHECK**

- [ ] 1.1 file reads taint the turn, test proves it
- [ ] 1.2 all five exclusions refused, shortcut case included
- [ ] You have confirmed Lindsay's folder path

---

# PHASE 2: give him the documents

**Goal:** 1,225 documents, your resume, your tracker and your cover letters become
readable. Half a day.

**Entry:** Phase 1 complete. **Do not start otherwise.**
**Exit:** Aang can answer "which resume did I send Float".

---

### `[x]` 2.1 Drive signed in and mounted (G:, streaming)  DONE 2026-10-01

**[verified]** Drive for Desktop is **already installed** at
`C:\Program Files\Google\Drive File Stream\131.0.2.0`. It is not signed in and no drive is
mounted. So this is a sign-in, not an install.

**Mirror, not stream.** Streaming leaves placeholder files that Aang would read as empty.
Mirror keeps real files on disk.

**Before switching it on:** check the size of My Drive and compare against free space.
**[verified]** Shadow had 60 GB free at the time of writing. The size can only be read
once signed in, or from the MacBook.

**Done when:** a drive letter exists and `Aang Brain/profile.md` is readable from Shadow.

---

### `[x]` 2.2 Point Aang at the real Brain folder  DONE 2026-10-01 (ec02f16)

**[verified]** There are two copies of these files:

- `Documents/Aang/Brain/` on Shadow: a **hand-made copy**. Line 1 of `profile.md` says
  so: *"mirror of Drive > Aang Brain > profile.md"*.
- `Aang Brain/` in Drive: the original, five files.

**[verified]** `memory.ts:279-280` reads exactly two of them, `profile.md` and
`learned.md`, and **writes none**. That is the whole of `Brain/` in the source tree.

**So nothing can be overwritten.** The worry in your brief does not apply. The real problem
is quieter: once Drive is on there are two copies on one disk, and Aang keeps reading the
stale one.

**The change:** point `readText` at the Drive path. One line.

**Also fix a lie in the data:** `learned.md` begins *"auto-saved by Aang"*. **[verified]**
Nothing writes it. Whatever used to has been removed. Correct the header or delete it.

**Done when:** editing `profile.md` in Drive changes what Aang knows.

---

### `[x]` 2.3 Write the rules file  DONE 2026-10-01 (5026447)

A `CLAUDE.md` inside the Drive folder describing the structure and where new files go.
This is the one concrete technique worth copying from the source video, and it prevents
drift.

**Done when:** the file exists and names every top-level folder.

---

### `[x]` 2.4 Install Obsidian and point it at the vault  DONE 2026-10-01

**[verified]** Obsidian is **not installed** on Shadow. The vault lives inside the Drive
folder, so this cannot happen before 2.1.

**This is for you, not for Aang.** He reads the files straight off disk. Obsidian gives
you the graph view on the machine you actually use.

**One rule:** keep the vault open on one machine at a time. Two machines editing through a
sync service is what causes the conflicts Obsidian warns about. Since Aang never writes
there, the only conflict risk is you against yourself.

---

### `[x]` 2.5 Prove it works  PASSED 2026-10-01

Ask Aang the question this whole phase exists for:

> which resume did I send Float

**Done when:** he answers from the real file rather than saying he cannot see it.

**Do not build an index yet.** Your reversed instruction was correct and the evidence
supports it: a controlled study (MemDelta, arXiv 2606.29914) found a paid memory graph at
72.7% against plain retrieval at 73.9%, p = 1.0, at 50x the ingest cost. Plain search is
not a shortcut, it is the better-evidenced option.

**What failure looks like**, so you can recognise it: keyword search will answer "which
resume mentions retention" and fail on "which resume felt most senior", because the second
shares no words with the document. The signal is you rephrasing the same question three or
four times. That, not a hunch, is when an index earns its place.

---

# PHASE 3: let the local model read everything

**Goal:** turn 1,225 documents into facts Aang actually holds, without spending quota.

**Entry:** Phase 2 complete. There is nothing to read before that.
**Exit:** the facts table has meaningfully more than 5 rows, and they are true.

**Why this phase is last:** **[measured]** Aang has learned 5 facts in 414 conversations.
That is not a broken extractor. His 207 messages average **28 characters** ("morning",
"test", "are you there?"). Nearly half are 15 characters or less. There has never been
anything to learn from. The documents are the unlock, not the machinery.

---

### `[x]` 3.1 Wire in the local model  **DONE 2026-10-02 (3cd6422)**

Model: `hf.co/unsloth/Qwen3.5-35B-A3B-GGUF:UD-IQ3_XXS`, already installed, 13 GB, runs
fully on the GPU at 47.6 words/sec. It won a measured race against three alternatives.
Full results and the traps in `LOCAL-MODEL-PLAN.md`.

**Three rules, all from measurements:**

1. **The four-step rule.** **[measured]** Local handles jobs up to **4 tool calls**
   (3/3 at every count up to four). At five it scored **0/3** and failed the dangerous
   way every time: it stopped partway and replied as if it had finished. **This must be a
   counted rule in code, never the model's own judgement about whether it managed.**
2. **Thinking mode off.** **[measured]** The same question took 78 seconds with it on and
   2.8 seconds off. Some models ignore the off switch, so treat an empty answer as a
   failure rather than skipping it.
3. **No tools for the local model.** It reads text and writes text. Documents carry
   hostile instructions, and a reader that cannot act cannot be talked into acting. Only
   its summary moves on, marked as data.

**Done when:** the local model answers a test prompt through Aang's own code path.

---

### `[x]` 3.2 The WoW rule  **DONE 2026-10-02 (696604a)**

**[verified]** `screen.ts:83` already detects the game by process name (`wow`, `wowb`,
`wow-64`, plus Overwatch, Diablo, Valorant). The detection exists; nothing uses it for
this.

**The change:** game running means no local model loads. The GPU belongs to WoW. Queued
reading resumes on quit.

**Done when:** starting WoW prevents a local model load, and quitting resumes it.

---

### `[x]` 3.3 Read the documents  **DONE 2026-10-02 (82800da, 8a5b31e, 93cbba6)**

An overnight batch job: read each document, extract durable facts, write them to the facts
table for your approval.

**Nothing self-activates.** Per the standing rule, facts go into a holding pen and you
approve them. This is the same policy as skills.

**Done when:** you have approved a first batch and Aang can answer a question about your
job hunt from a document he read himself.

---

# PHASE 4: make him pleasant to use

**Goal:** the front end. **Nothing here blocks anything**, which is exactly why it belongs
in the gap while Phase 3 runs overnight.

**Entry:** 4.1 can happen any time, and should happen early. The rest fit around Phase 3.

---

### `[x]` 4.1 Look at what was already built  DONE 2026-10-01 (8c7652d, 058cce5): **do this in Phase 0, it is 20 minutes**

**Status: built, never seen.** The list rows and the carved-wood frame pass 40 tests but
nobody has watched them render.

**This is checking, not building.** It exists because a visual pass was reported done from
code alone and was wrong. The rule that earned, recorded at `NEXT.md:257`: *when a visual
pass is approved from a mockup, check against the mockup.*

Build, restart the real `Aang.exe`, send a message that should produce a list, and compare
against mockup D.

**Known soft spot:** the model *chose not to* produce a list the first time it was asked.
The instruction was strengthened, but that can never be a guarantee. Test it twice.

**Done when:** you have looked at it and said whether it matches.

---

### `[x]` 4.2 Typing that reads at a steady pace  DONE 2026-10-01

**Not built.** Replies arrive in bursts because the reveal speeds up based on how much
text is waiting. You already decided: a steady readable pace, click to dump the rest
instantly, the convention every RPG uses. `[typewriter reveal, StepReveal]`

---

### `[x]` 4.3 Scroll back through a conversation

**Not built.** Both voices distinguishable without reading a word: yours on recessed plum
with a `YOU` label, his on parchment. Conversations separated by natural time gaps,
archived in the Panel. The colours already exist in the theme and are currently used only
for buttons. `[scrollback, conversation view]`

---

### `[x]` 4.3b Reach back into the conversation

**Not built. Added 2026-10-01 from Joshua's mockup F.** Built BEFORE 4.4 and 4.5 by his
decision, because both of those touch the same window and would be partly redone.

Numbered 4.3b rather than renumbering 4.4 and 4.5, so nothing that already points at those
steps goes stale.

**The problem.** The desktop shows exactly one message. When Aang replies, the last reply is
gone. If he said something four turns ago and Joshua wants to act on it, Joshua retypes it.
The Panel has the full scrollback as of 4.3, but it is read-only: a message there is
something to read, not something to use. Aang's memory of the conversation is in the Core;
Joshua's pointer into it does not exist, so he cannot say "that one".

**His decisions, 2026-10-01:**

- The desktop rests on one reply, as now, and grows into the stack only when he scrolls up.
  It drops back when Aang answers again. Chosen so it stays small over the game.
- Pinned context stays until he removes it, as a chip above the type box.
- The right-click menu is: Reply to this, Add as context, Copy text, Forget this.
- Forget hides the turn and keeps the row, so "undo that" works, the same as forgetting a
  fact does today.

**Half of this was already approved on 2026-09-24** (see the reply/context design): proactive
messages carry a stable ID, a reply binds to a SPECIFIC message, a pending question never
expires and is resolved only by a real reply to it. That design has never been built. The
wire already carries `id` on every `bubble`, but `submit` has nowhere to put "this is about
message 847", so the binding has no path.

#### Core

- `[x]` **C1 Hide, do not delete.** Add `hidden INTEGER DEFAULT 0` to `turns` (a migration,
  guarded by a `PRAGMA table_info` check, not a bare `ALTER`). `history()` and the context
  assembly both skip hidden rows. `hideTurn(id)` / `unhideTurn(id)`.
- `[x]` **C2 Tell the Body which rows it is showing.** `saveTurn` currently returns nothing,
  so the Body never learns the database ids of the exchange on screen. Note the trap: the
  `id` already on a `bubble` message is the SUBMIT id, not the turn row id. Return both row
  ids and send `{ t: 'turn.saved', id, userTurn, aangTurn }`.
- `[x]` **C3 Carry the binding.** `submit` gains `replyTo?: number` and `context?: number[]`,
  both turn ids. The Core loads those rows and puts their text ahead of his message, so the
  model sees the quoted text and not an id it cannot resolve.
- `[x]` **C4 Proactive messages become real turns.** `announce()` sends straight to the bubble
  and `saveTurn` is called in exactly one place, the normal chat path, so nothing Aang says
  unprompted exists as a row. Without this, "reply to this" fails on precisely the messages
  he most wants to reply to. This is part 1 of the September design.

#### Body

- `[x]` **B1 The desktop stack.** Scrolling up past the current reply grows the bubble into
  the scrollback from mockup F; a new reply collapses it. `ConversationView` already draws
  this shape for the Panel, so the question to settle first is whether it can be reused
  inside a layered window or whether the bubble draws its own.
- `[x]` **B2 The menu, on the desktop.**
- `[x]` **B3 The menu, in the Panel.** Cheap: `ConversationView.Turn` only has to carry the
  `Id` that `history.reply` already sends and `PanelWindow` currently drops on the floor.
- `[x]` **B4 The chips.** Pinned context above the type box with an x; a reply shows a quoted
  strip above the box.

**Done 2026-10-01.** 7 Core tests in `reachback.test.ts`, and three captures looked at:
`snaps-bubble/stack/40_stack.png`, `snaps-bubble/pins/30_pins.png`,
`snaps-bubble/panel/20_panel_history.png`. Test flags `--stack-test` and `--pins-test`.

The schema drift test had to change with it: it compared a fresh database against his live one
read-only, which stopped being true the moment a column was added. It now opens a COPY of his
real file, so what it asserts is that his database ends up the right shape after migrating,
which is the thing that actually matters.

**Out of scope, on purpose:** Discord. It has replies natively, and its binding can be read
from `message_reference` later.

---

### `[x]` 4.4 A quiet signal when something is genuinely stuck  **DONE 2026-10-02**

**Not built.** When a Claude session is blocked waiting on you, Aang announces once then
goes quiet, which is the one state where something really is stopped. It needs a
persistent but quiet signal, distinct from the working glow, easy to ignore mid-raid.

---

### `[x]` 4.5 The smaller polish  **DONE 2026-10-03**

All not built. Previously marked parked; **unparked by your decision, 2026-10-01.**

- `[x]` 150ms crossfade between modes  **ALREADY BUILT** (InputWindow: FadeMs=150, lerped frame and chip colours, a 16ms timer that stops itself). Verified 2026-10-02, not rebuilt.
- `[x]` reveal-on-hover states  **DONE 2026-10-03.** Hovering the mode pill, the saving pill or the usage meter swaps the bars for a sentence saying what that control is. Short on purpose: the strip is a fixed 256 px and about twenty characters fit, so the key word goes first.
- `[x]` recompute layout when display scaling changes while running  **DONE 2026-10-02**
- `[x]` entity chips in the Panel  **DONE 2026-10-03.** Files and links in a message become chips you press to open the thing. The regex half only, deliberately: model-emitted tags cost tokens on every reply. A chip press sends `open.thing`, not a model turn, and still goes through the permission gate.
- `[~]` ~~a first-run "here's what I can do"~~  **DROPPED 2026-10-02, his call: "no welcome tour is needed what even is that???"** He has used Aang daily for weeks. A tour explains an app to someone meeting it for the first time, and that person does not exist here.
- `[x]` suggestion chips  **DONE 2026-10-03.** Three one-tap starters in the input box while it is empty, from what the Body already knows (jobs waiting, time of day) and never from the model. Tapping one fills the box rather than sending it.
- `[x]` the job card stack  **DONE 2026-10-03.** A Jobs tab: one card at a time, "1 of 3 waiting on you", triaged by keyboard (A apply, X skip, O open, Z undo) only while that tab has focus. New shared `Keycap` control so the Panel finally wears the same lipped buttons as the bubble. Save and snooze left out rather than faked: the card only has new/approved/skipped.

Each is small and independent. Do them in any order, one commit each.

---

### SKIPPED: the art

**Skipped by your decision, 2026-10-01.** Recorded here so it is not silently lost.

If you ever return to it, the research disagrees with the original diagnosis and would
save money: 118 frames across ten states is about 12 each, which is **not** a low count,
and shipped pixel-art games commonly use 2-frame idle loops. Choppiness at that count is
nearly always **timing**, not frame count. And "more things to do" is a data problem, not
an art problem: ten short micro-idles chosen at weighted random read as far more alive
than one long loop. Idle is about 90% of a desktop pet's screen time.

---

# PHASE 6: the cockpit  **PLANNED, NOT STARTED**

**Joshua's idea, first interviewed 2026-10-02 as "the player", re-interviewed and widened
2026-10-03 into the cockpit. His instruction on 2026-10-03: "i dont want to do this revamp yet
just finish planning it out all and deep researching its possibilities". So this section is the
plan and the research. Nothing here is built.**

The shape, in his words: Aang's bubble **expands** into a window - "this new dashboard this new
cockpit" - that takes whatever shape the content needs. A deck of research cards with thumbnails
and links. A page. A video in the corner. A job. And when there is nothing to show, it is the
small parchment bubble it is today.

The reason it matters is not decoration. **Aang currently cannot show you anything.** He can only
tell you. Read twenty trending repos and all he can do is write a wall of text. Give him a surface
and he can put the thing itself in front of you.

---

## The correction: it CAN be the bubble

**The 2026-10-02 entry said this was impossible. That was wrong, and the error is worth keeping
rather than quietly deleting.** It said:

> "It cannot be the speech bubble... Microsoft's own documentation is explicit that a child window
> - a browser, a video player - does not render into such a window."

The documentation does say that, and the first half of the sentence is true: a **child window**
cannot render into a per-pixel-alpha layered window. The mistake was treating "child window" as
the only way to put a browser on screen. It is not.

**WebView2 has a second hosting mode - visual hosting - where the browser renders into a
DirectComposition visual instead of a child window.** That is precisely what makes per-pixel alpha
and forwarded mouse input possible. From the internals of a project that ships it:

> "The browser renders into a DirectComposition visual instead of a child window
> (WS_EX_NOREDIRECTIONBITMAP), which is what makes true per-pixel alpha and forwarded mouse input
> possible at all."

**Working proof:** `maschine34675/WebOverlay` puts HTML panels and click-through HUDs over a
running game. One shared WebView2, raw COM. Its recipe:

- `WS_EX_NOREDIRECTIONBITMAP` so the compositor allocates no opaque surface
- `CoreWebView2CompositionController` with `RootVisualTarget` set to the app's own visual
- `DefaultBackgroundColor` alpha 0, so the page draws nothing where it paints nothing
- `WS_EX_TRANSPARENT` **together with** `WS_EX_LAYERED` for click-through, because transparent
  alone does not take a window out of hit-testing
- mouse input forwarded by hand with `SendMouseInput`

So the carved bubble can become a web page without giving up the shape, the transparency or the
click-through. **Joshua's choice, 2026-10-03: rebuild the bubble itself as a web page.**

---

## What he decided

**Scope.** Surface first, chrome later. The agreed destination is the CereBro browser he already
designed; the order is the surface (cards, pages, video) before the navigation furniture (rail,
omnibox, tabs). This is not a detour: once the bubble is a web page, the bubble IS the browser
engine, and the rail and omnibox are additive. Nothing is thrown away.

**Placement.** The bubble expands into it, so Aang stays the anchor and it always reads as him
showing you something rather than an app launching. He was unsure whether some content should
instead live in a fixed corner: "it depends on what it is and how it should behave". Resolve by
building the expand-from-Aang behaviour first and seeing what actually annoys him.

**The look is not up for redesign.** He said plainly, 2026-10-03: "I LOVE the weight of the
buttons currently they feel and look great lets keep this in mind." The lipped keycap button is a
border, an inset highlight and a gradient; it reproduces faithfully in CSS. **Take the exact
values out of `Theme.cs`, do not eyeball them.** The mahogany, the parchment, the carved frame and
the grain all come across the same way.

**Logins: real ones, safely.** He refused the easy answer - "there cant be a 'theres no way to do
this safely' there has to be a way" - and he was right. See the safety design below.

**Adoption: he is told, never acted for.** When Aang finds something good and open source he
writes up what it is, whether it is alive, its licence, and whether it applies - and stops.
Nothing is installed. Nothing of Aang's own code changes from something read on the internet.

---

## What is genuinely possible, with sources

**Real web pages, Aang-shaped, see-through, click-through, over the game.** Proven by WebOverlay.

**Any layout.** Cards, decks, grids, thumbnails, timelines, charts. Once it is a web page this is
CSS, which is the whole point: each new layout in the hand-drawn bubble is days of GDI work.

**Over WoW specifically - and the earlier worry was unfounded.** Joshua believed he played in
exclusive fullscreen, which would have minimised the game under any overlay. **WoW has not had
exclusive fullscreen since patch 8.0.1 in 2018**; the only modes are Windowed and Fullscreen
Windowed, which is borderless. His `Config.wtf` confirms it: `GxApi "D3D12"`, `GxMaximize "1"`, no
`GxWindow` override. The overlay can sit over his game.

**The page can call back into Aang.** `AddHostObjectToScript` and web messages mean a button ON a
card runs a real Aang action - save to vault, apply to this, remind me Thursday. This is the
difference between a television and a control panel, and it is the single capability that makes
this a cockpit rather than a viewer.

**Local pages with no web server.** A custom `aang://` scheme renders local content directly,
which means **his Obsidian notes, properly rendered, inside the bubble.**

**He can see what he showed.** `CapturePreviewAsync` photographs the window, so the same card can
go to Discord as an image.

**Picture-in-picture.** Video can pop out and float over the game independently of the bubble.

**Reliable extraction.** The Chrome DevTools Protocol is exposed, so Aang reads a page's real
structure rather than guessing from text. This is what makes "pull the thumbnail, title, stars,
licence and description" dependable instead of flaky.

**Also available and worth remembering:** print a page to PDF straight into the vault, drag a file
onto Aang, intercept web notifications, embed sites that normally refuse embedding, and
programmatic find-in-page.

**Downstream of "it is a web page":** the job hunt as real charts, quota over time, a live view of
a Claude Code session working, before/after diffs side by side, the vault graph.

---

## What is genuinely impossible

**Netflix, Disney+, Prime and other paid streaming. Not expensive - impossible.** Confirmed again
2026-10-03 and the reason is now precise: WebView2 supports PlayReady but **not Widevine** (open
feature request, `WebView2Feedback#4828`), and those services additionally require a vetting
programme called Verified Media Path that an app like Aang will not be admitted to. YouTube and
Twitch use no such protection and are fine. **Do not relitigate this without a Widevine
announcement.**

**Bot-detection evasion stays out.** Unchanged from 2026-10-02 and still right: the requirement
was never proven, and Patchright was rejected because evasion run from inside his own logged-in
session attaches the consequence to the identity he is job hunting with.

---

## Measured cost, and what still needs measuring

From `DECISIONS.md` D1, measured on this machine: a WebView2 host ran **7 processes, 165-166 MB,
10.9-12.5% CPU, 0.31 s startup**. The layered window uses about a tenth of the memory and four to
seven times less CPU. One earlier run reporting 18.7 GB and 177% CPU is treated as an anomaly and
excluded; it is disclosed rather than hidden.

**That CPU figure is the risk, and it is not yet the right measurement.** It was taken rendering
at 30 fps. An idle deck of cards should cost far less, and a video should cost more. **Before any
of this is committed to, measure three things separately while WoW is running: an idle card deck,
a scrolling page, and a playing video.** If an idle deck is not close to free, the whole design
needs rethinking, because the bubble is open most of the day.

**One browser, reused, never one per card.** Each WebView2 instance spawns its own set of
processes; the runtime binaries are shared between apps but the memory is not. Use a single
`CoreWebView2Environment` and a single control.

**Two other costs to accept:** driver frame-generation tools (AMD Fluid Motion Frames, Lossless
Scaling, NVIDIA Smooth Motion) can stutter while any overlay is up, and mouse input must be
forwarded by hand.

---

## The safety design

His standing rule: assume hostile input, least privilege, mediated access. A window that renders
arbitrary web pages is hostile input by definition. He wants his real logins anyway. Both are
satisfiable.

**The fear people usually name is the wrong one.** "A bad page steals your cookie" is already
solved: a page on one site cannot read another site's cookies. That is decades of browser
hardening and it is not the risk here.

**The real risk is specific to an agent: a page tells Aang to do something, and Aang does it while
signed in as Joshua.**

So:

**1. Two profiles, one runtime.** WebView2 supports multiple profiles under a single user data
folder - separate cookies, separate storage, no second runtime and no extra memory.

- **`signed-in`** - only ever navigates to a short allowlist Joshua actually signs into (GitHub,
  Reddit, YouTube). Nothing Aang found on the internet is ever opened here.
- **`sandbox`** - everything Aang found. Empty. No cookies, nothing of his. A poisoned page here
  is looking at a blank browser.

A research link **cannot** open in the signed-in profile. This is enforced in code, not by
convention: `NavigationStarting` can cancel any navigation before it loads, including redirects
and iframes.

**2. The injection defence already exists and is already live.** The taint rule - reading outside
content forces Aang to ask again before acting - is exactly the right protection, has been in
since September, and his own `core.log` shows it firing: `asking again for "write files": this
turn has read outside content`. Extend it to cover anything the window loads.

**3. Free hardening, because the API supports each one.** Downloads cancelled by default
(`DownloadStarting`), JavaScript dialogs suppressed (`ScriptDialogOpening`), camera, microphone
and location denied (`PermissionRequested`), screen-capture API blocked
(`ScreenCaptureStarting`), and Enhanced Security Mode raised on the `sandbox` profile.

**4. Chrome history and bookmarks: only on request, with a prompt each time.** His decision,
2026-10-03. Never read on Aang's own initiative. Note that for shows this is unnecessary - see
below.

---

## What already exists and must not be rebuilt

**"Get me Naruto" already works.** Simkl is connected right now (token verified 2026-10-03) and
the `watch_next` tool already answers "what am I watching", "where was I on X" and "put the next
one on", with the correct next episode number. MALSync and the Simkl extension mark episodes as he
watches; Aang only reads. **Simkl is a better source than browser history for this, because it
tracks episode numbers and bookmarks do not.** If it misses, that is a bug to fix, not a feature
to build.

**The Watch Shelf** from his CereBro design is the natural home for this once the surface exists.
Noted as a destination, not first-pass work.

**His CereBro browser is 118 files of finished art.** `app/client/public/browser-home/` holds
`aang-avatar-medallion.png`, `aang-dock.png`, bookmark cards and medallions for GitHub, Hacker
News, Reddit, X, YouTube and Obsidian, the left rail, the omnibox, tab and title-bar pieces.
`CEREBRO_DAILY_OS_BROWSER_CONTRACT.md` is the spec: left rail (Keep / Browser / Work / Sources /
Ledger / Basement), one bottom "Ask Aang" bar and deliberately no right-hand agent rail, a Watch
Shelf drawer, manual browsing needs no approval while agent-driven browsing does, receipts only
when asked. **Those rules already match Aang's.** CereBro is retired and Aang is its successor -
his words, 2026-10-03 - so this is the earlier draft of this product, to be borrowed from freely.

---

## Build order, when it starts

1. **Measure first.** Idle card deck, scrolling page, playing video, each with WoW running. Decide
   on evidence whether the bubble becomes a web page or stays as it is with a second window.
2. **The shell.** `WS_EX_NOREDIRECTIONBITMAP` window, composition-hosted WebView2, alpha 0
   background, mouse forwarding, click-through when idle. Prove the pet still looks and behaves
   exactly as it does now with an empty page in it.
3. **The theme in CSS**, lifted from `Theme.cs`. The keycap buttons are the acceptance test: put
   the old bubble and the new one side by side and only proceed if they match.
4. **One card type.** The research card, since Phase 7 produces them.
5. **The callback bridge** so a button on a card runs a real Aang action.
6. **Video**, then picture-in-picture.
7. **Chrome** - rail, omnibox, tabs, Watch Shelf - only once the surface has earned its keep.

Keep the old bubble behind a switch until he says the new one is better, judged on the real thing
rather than a mockup.

---

# PHASE 7: the research loop  **PLANNED, NOT STARTED**

**Joshua, 2026-10-03: "can we also get aang to weekly scan github or find something that shows
whats trending on github all time and weekly, then see if those things are helpful for him to
either adopt if theyre open source or learn from... not just that but what people are generally
doing with AI agents if something is coming up frequently to look into it like when harnesses
first started coming out i.e hermes open claw etc. Now people are talking about jev. The internet
is a wealth of knowlldeg in a time like this with tech like this."**

**This does NOT depend on Phase 6.** The digest can land in Discord, Obsidian and the bubble
today, and simply gets better when the window exists. Build it first; it is the cheaper half and
it is the half that produces the content the window was wanted for.

---

## The two halves

**1. The weekly sweep.** Aang goes and looks at what is trending, scores it against what Joshua is
actually doing, and surfaces the few things that matter.

**2. The drop box.** Joshua pastes a link and a shorthand note into Discord; Aang researches it
straight away and replies in a thread on that message.

---

## What he decided

**Sources.** GitHub trending (weekly and all-time), Hacker News, Reddit (LocalLLaMA and similar),
arXiv - plus, in his words, "any other sources for ai agents and ai media generation etc CLI stuff
MCP stuff anything trending".

**The filter: project-relevant, plus anything repeating.** Scored against his real work, and
separately, **anything mentioned three or more times across sources in a week is surfaced even if
it does not obviously apply yet.** That second rule is the whole point - it is how he would have
caught harnesses early, and it is why "people keep mentioning X" is worth saying out loud.

**What it is scored against:** Aang itself, the job hunt, WoW Forever, and CereBro and the older
repos. Important: **CereBro is not a separate project to score against - Aang IS CereBro's
successor** (his words: "aang and aivatar IS cerebro. Right? aang is the upgraded version Cerebro
has been retired for aivatar"). Same goals, so its old specs are inputs, not a different client.

**Depth: read it, then find out what others say about it.** Not a skim. What it is, who made it,
alive or dead, licence - and then what people report in practice, what goes wrong with it, whether
the hype is real. **This rule exists because of a specific near-miss:** Jev's headline 193x was a
vendor number; independently it is 1.7-25x. A skim would have repeated the 193x.

**Budget: moderate, about 5% of a week.** The local model does the first pass over everything;
Claude reads the shortlist and writes the verdicts. His GPU work is free, his Claude week is not.

**Adoption: he is told, never acted for.** Write-up and a verdict. Nothing installed, nothing of
Aang's own code changed from something read on the internet.

**Where the digest lands: all four.** A new Discord channel, the cockpit window once it exists, an
Obsidian note in the vault, and Aang simply bringing it up in the bubble when Joshua is not busy.
Same content, four doors.

**The drop box is a new channel: `#look-into-this`.** `#capture` stays as it is for recipes, lists
and notes to file. He chose the longer name deliberately - it is impossible to mistake for
anything else in the sidebar.

---

## What exists today, and the actual gap

**There is no link research anywhere.** Checked 2026-10-03: automatic URL handling exists in
`discord.ts` **only** inside `#job-inbox`, and only to score jobs - `if (channelName !==
'job-inbox') return false`. A TikTok or YouTube link dropped in `#capture` gets nothing special and
falls through to ordinary chat. The TikTok research he remembers happened because he asked in
conversation, not because anything noticed the link.

So nothing needs undoing. `#capture`'s topic already promises "notes, links. Aang files it", which
over-promises against what it does; either wire it up or correct the topic when `#look-into-this`
lands.

**The web lane already exists** and is already isolated, with `look_up_web` and a real browser for
pages WebFetch cannot render. The sweep rides on that rather than inventing a second one.

**The taint system already exists.** Everything read in the sweep is outside content and must set
it, so Aang re-asks before acting on anything he read. This is not new work, it is a rule to apply.

---

## Design notes

**Two browsers, not one.** For Aang *reading* the web fast and cheap, a headless engine; for
Joshua *watching*, WebView2. Lightpanda is built for exactly the reading half - roughly 8 MB per
instance against Chrome's ~200 MB, and 9x faster on their own benchmark. Treat that number as
directional: it is vendor-run, on demo pages, and their own figures show it stops scaling past
about 25 workers. **The sweep does not need 25 workers.** Start with plain HTTP and the existing
web lane; reach for a headless engine only if pages actually need JavaScript to read.

**Prefer APIs to scraping.** GitHub has a real API. Hacker News has a real API. arXiv has a real
API. Reddit has JSON endpoints. Scraping trending pages is the fallback, not the plan, and it is
also what breaks silently.

**The "three or more times" rule needs a memory.** It cannot work from one week in isolation -
something mentioned twice this week and twice last week is the signal. Keep a small table of
mentions by name and week, which is also what lets Aang say "this has been building for a month".

**Dedupe against what he already knows.** He has a 525-turn memory and a 73-note vault. A finding
he was told about in September is not news. Check both before surfacing.

**Say when something was already rejected.** Jev is the live example: if it trends again, the
right answer is "this came up before, here is why we passed, here is what changed" - not a fresh
write-up as though the earlier work never happened.

---

## Build order

1. **`#look-into-this`** and the drop handler. Smallest useful thing, and it is the one he will
   use daily. A link plus shorthand in, a threaded reply out.
2. **The mention table** - names and weeks - since the repeating rule depends on it.
3. **The weekly sweep**, APIs first, local model for the first pass.
4. **The digest**, to Discord and Obsidian, then the bubble.
5. **The card format**, shared with Phase 6 so the same finding renders in the window later.

---

## 7.6 Addons: tell him what is behind, and help him understand them

**Joshua, 2026-10-03: "can we also have aang hook into curseforge as well maybe? and let me know
when addons need updating or there are new trernding ones or ones thjat i dont have thjat i should
get and then him help me walk through what they are what they do why i need them and best ways to
setuop like im confused i can ask what do i do now? did i do it right? whats the best setting?"**

### What he decided

- **Notify, never install.** "Can he not just tell me in a Custom formatted message in a bubble
  right? surface a message - Hey XYZ needs an update or Hey theres a few updates for your addons."
  Aang does not download, swap or write anything into the game folder.
- **He can look at the screen when asked.** For "did I do it right?", with the permission prompt
  each time, which `look_at_window` already does. Not automatic, not continuous.
- **A quick scan on first startup**, not a background watcher.
- **Suggestions yes, a few, with reasons.** Same three-mentions rule as the rest of Phase 7.

### What already works, today, with no API and no key

Reading the installed addons and their versions, straight off disk. Verified 2026-10-03: 22 addons
under `_classic_beta_/Interface/AddOns`, each with a `.toc` carrying `## Version`.

**Better than that: the `.toc` files already carry their CurseForge project IDs.** Fifteen of the
22 have `## X-Curse-Project-ID`, including every one that matters - Leatrix Plus (94855), Leatrix
Maps (298842), RXPGuides (486246), BlizzMove (17809), BetterBlizzFrames (940950), WhatsTraining
(324944), GearQuest Forever (1698950), Talents Forever (1700435). So Aang already knows exactly
which project each addon is, locally. **The only missing piece is looking up the latest version
number for an id.**

Found on the first scan and still true: **his GearQuest Forever class modules are on 0.2.18-beta
while CurseForge's latest is v0.2.20-beta (29 September 2026)** - nine files about two releases
behind. That is the exact shape of thing this step exists to catch.

### The obstacle, and why it is only one obstacle

**CurseForge is closed at the edge.** Every unauthenticated request returns 403, including the
project page and both RSS paths - tested 2026-10-03. There is no scraping route, and looking for
one would be both fragile and against their terms.

**The API needs a key, applied for and reviewed by Overwolf, and they refuse competitors.** WowUp,
the most popular third-party addon manager there was, was denied under the clause forbidding
anything that competes "directly or indirectly" with CurseForge.

**But the shape Joshua chose is the approvable one, and that is not a coincidence.** An app that
downloads and installs addons competes with their app. One that reads what he already has, tells
him what is behind, explains it, and sends him to CurseForge to click download drives traffic
**to** them. That is a materially different application, and it is worth making in those words.

**Action for Joshua, and only he can do it:** apply for a CurseForge API key. It is free, it costs
nothing to be refused, and the application should say plainly that this is a read-only assistant
that notifies and explains, never downloads or installs.

**If the key never comes:** only BugSack carries a GitHub URL, so a GitHub-only fallback covers one
addon of 22 and is not worth building on its own. Everything else in this step still works - the
scan, the explaining, the screen-looking, the suggestions from the research loop - just without the
"a newer version exists" line.

### Build order

1. **Read the installed addons on startup.** Name, version, project id, folder. Free, local, no
   network. This alone lets him answer "what addons do I have" and "what does X do".
2. **The explaining half.** "What is this, why would I want it, what do the settings mean." This is
   conversation and needs no API at all, and it is the half he described in the most detail.
3. **"Did I do it right?"** - the existing `look_at_window`, pointed at WoW, with its own permission
   prompt. Nothing new to build except knowing to offer it.
4. **The version check**, once a key exists. One call per project id, cached, on startup only.
5. **The bubble card.** "Three of your addons have updates" with the names, what changed, and a
   button that opens the CurseForge page. Shares the card format with the rest of Phase 7.
6. **Suggestions**, through the research loop's existing filter rather than a second one.

### Settled

**"When Aang starts"** - his answer, 2026-10-03, asked directly. Not when WoW launches, which was my
guess and was wrong. So the scan runs once at Aang's startup and the result is held; it does not
re-check when the game opens.

**Applying for the key is his to do.** Drafted in full at `docs/CURSEFORGE-API-APPLICATION.md`,
ready to paste. He asked me to submit it; I did not, because it is an application in his name that
accepts a Terms of Service on his behalf.

---

## Open questions

- Which day the weekly sweep runs, and whether he wants it before or after the week's quota
  resets. Running it just after a reset costs him nothing he will miss.
- Whether a drop in `#look-into-this` should ever be allowed to cost more than a fixed ceiling.
  A single link that turns into an hour of reading is a real risk at 5% of a week.

# PHASE 5: the rest of the fixes

**Goal:** everything confirmed real but on nobody's critical path. Do it when you want.

- `[x]` 5.1 **Rotate the logs instead of deleting them.** DONE 2026-10-03. Body half was done in 0.4 (6bdfb72): `Log.Write` keeps one generation, stamps full dates, reports failures. `core.log` (written by the supervisor) still deletes past 1 MiB. `CoreSupervisor.cs:90` deletes
  the file past 1 MiB. With six restarts a day the evidence of an incident can vanish
  before you look.

  `core.log` now rotates to `core.log.1` instead of deleting, the same rule `Log.Write`
  already used for `body.log`. The timestamp half was already fixed: lines carry full
  dates. Verified live - padded the log past 1 MiB, started Aang, and the old file was
  preserved as `.1` with his real history intact rather than destroyed.

- `[x]` 5.2 **Handle SIGTERM.** DONE 2026-10-03 (3d8daf7). `index.ts:17` traps only `SIGINT`;
  `CoreSupervisor.cs:109` hard-kills with `Kill(entireProcessTree: true)`. So the cleanup
  that answers pending permission prompts and checkpoints the database almost never runs.

  **SIGTERM turned out to be the wrong mechanism.** Windows cannot send a real one from
  .NET - `Process.Kill` is always a hard terminate - so there is no signal to trap. The
  polite request goes over the WebSocket the Body already holds instead: a new
  `{ t: 'shutdown' }` message, routed to the one shutdown path in `index.ts`. The trap is
  still added for a Core started from a terminal. The Body waits three seconds, then
  `Dispose` hard-kills as the fallback for a wedged Core. Guarded against running twice and
  bounded by a five second timer: a Core that hangs on the way out is worse than the kill
  it replaces.

  **Testing it needed a new flag.** `taskkill` without `/F` never reaches the pet window,
  because it is a no-activate tool window, so the first two attempts proved nothing and
  looked like a broken feature. `--quit-after=N` does exactly what the tray's "Quit Aang"
  does. Confirmed: `closing: reason=ApplicationExitCall` and the Core's own "the Body is
  closing" 21ms apart.

- `[x]` 5.3 **Give actions a turn id, and add `aang why <turn_id>`.** DONE 2026-10-03.
  `actionlog.ts:10` has no id at all, so "why did you do that" can only be answered by
  comparing clocks.

  **A turn id could not work, and the reason matters.** Actions are recorded *during* a
  turn; the turn row does not exist until the reply is finished. There is no turn id to
  stamp at the time. Both sides carry the **request id** instead - `turns.req` (new column,
  migrated) and `ActionRec.req` - so the answer is a join, not a comparison of clocks.

  **Not a typed command, a question.** `aang why <turn_id>` would need him to know a
  number. It is a tool, `why_did_you_do_that`, so "why did you do that" works in plain
  English; with nothing pointed at it takes the newest request that actually *did*
  something, because three replies of chat since then do not change what "that" means. It
  answers with what he asked, what was done, and what was said back.

  **It says when it cannot answer** rather than inventing a reason: nothing recorded, a
  turn from before today that has no link, and a turn that did nothing at all are three
  different honest answers.

  **Found a silent bug while testing the migration.** `CREATE INDEX turns_req ON
  turns(req)` sat in SCHEMA, which ran *before* `ADDED_COLUMNS` added the column, so on an
  existing database the index failed with "no such column", nothing retried it, and it
  printed an alarming line on every boot. `migrate()` now does columns first, then tables.
  Verified on a copy of the live 525-turn database: column added, index created, integrity
  ok, old rows untouched with `req` empty, second run silent.

- `[x]` 5.4 **Close the honesty-check hole.** DONE 2026-10-03. `core.ts:87` is
  `if (!did.length) return reply;`, so when Aang did nothing but claims he did, grounding
  never runs. That is the worst case and the one not covered.

  **The fix in your brief does not work.** It says to consult `SAYS_FAILED` and `REFUSES`.
  Both detect a reply claiming *failure*; the uncovered case is a reply claiming
  *success* with an empty action record. Closing it needs a new "does this reply claim an
  action happened" detector, which is the risky kind, because a false positive rewrites a
  correct answer. **A day with test cases, not an hour.**

  **Decide first:** rewrite the reply, or just flag it? Flagging is safer.

  **Flagged, as decided.** New `CLAIMS_DID` in `core.ts`. The flag goes into the turn
  record where it can be counted and the detector tuned on real traffic; nothing he reads
  is touched. 5.3's `why_did_you_do_that` is the human-facing half - ask why, and it says
  plainly that nothing was done.

  **The second guard matters more than the regex.** It only fires when NO tools were used
  at all, because a reply saying "I checked and it is not there" used a tool that keeps no
  action record and is perfectly true. If zero tools ran, nothing can have been done.

  **The verb list is deliberately narrow.** `made`, `set`, `wrote` and `created` are all
  absent, however tempting: "I made a few assumptions", "I set out three options", "I
  wrote a short summary" are ordinary prose about the answer itself. Catching less is the
  right trade when the alternative is calling a truthful reply a lie.

  New `tests/fakecore/honesty.mjs`, 35 cases covering all four checks, no quota. Twelve of
  them are the prose that must NOT be flagged, which is the half that actually matters.

- `[x]` 5.4b **Close the OTHER honesty hole: claiming ignorance without looking.** DONE
  2026-10-02 (12deb1d). Sibling of 5.4, and the opposite direction: 5.4 is "did nothing, says
  it did"; this is "looked at nothing, says it does not know". Found live - asked why Obsidian
  was not set up, he replied that he had no details and that it was part of the rebuild still in
  progress. It had been set up the day before, pointed at a 68-note vault, and one file read
  would have said so. He called no tools at all.

  `GUESSED` in `core.ts` now sends such a reply back once, told that its previous answer looked
  nothing up. Gated on NO TOOLS USED, which is what keeps "I searched and it is not there"
  intact: that is an honest answer and must not cost a second turn out of his quota. Six such
  answers are pinned in `guessed.test.ts` as explicitly allowed.

  **This was the third attempt.** voice.ts has said it in prose since 2026-10-01 and was
  ignored each time. Prompts are not guarantees. This one is in code.

- `[x]` 5.4c **A failed turn is written down.** DONE 2026-10-02 (12deb1d). `saveTurn` ran only
  on the success path, so a turn that died left no row anywhere. His question about launching
  WoW from a Rainmeter button produced nothing, and afterwards a turn that had failed was
  indistinguishable from one never sent. `fail()` now records the exchange with a
  `failed-<lane>` tier and logs how long it ran before dying. Partial of 5.3 and 5.5: the
  `aang why` command and the six silent files are both still open.

- `[x]` 5.9 **The Google sign-in does not renew itself.** **DIAGNOSED 2026-10-02.** Found that day, NOT previously in
  this plan. `%APPDATA%\Aang\google.json` holds a valid `refreshToken` for his account, and the
  access token expired 2026-09-28 regardless. A refresh token exists precisely so he signs in
  once; the renewal is not firing. Re-running `tools\google-setup.cmd` fixes it for about a
  week and hides the real fault.

  **THE CAUSE, measured not guessed.** Attempting exactly the refresh Aang attempts returns HTTP 400,

  `invalid_grant`, "Token has been expired or revoked". The refresh logic in google.ts is correct and

  Google simply refused. A Cloud project whose OAuth consent screen is EXTERNAL and still in TESTING

  issues refresh tokens that expire after exactly 7 days, on a fixed clock, however often they are

  used. He signed in around 21 September; it died on the 28th.



  **THE FIX IS NOT IN THIS CODEBASE.** It is a dropdown: console.cloud.google.com, OAuth consent

  screen, publishing status Testing -> In production, then sign in once more. New credentials are

  generally needed afterwards, because the old ones can keep the 7-day behaviour.



  **WHAT CHANGED HERE: the message.** It said "run tools\google-setup.cmd again", which is true and

  useless - that buys another seven days and he is back the following week. It now names the real

  cause, says plainly it is not something he did, and gives the one-off fix.



  Blocks nothing. It gates Gmail read/compose and Calendar read only. Calendar has never come
  up once in 590 turns; email he used genuinely on 22-24 September and not since. Worth fixing
  before the next sign-in, so that sign-in is the last one.

- `[x]` 5.5 **Logging in the six silent files.** DONE 2026-10-03.

  **The premise was partly wrong, and counting `console.*` is why.** `discord.ts` is not
  silent: it logs through an injected `log`, which `startDiscord` defaults to
  `console.log`, so it reaches `core.log` like everything else. `core.log` has
  "discord: connected" in it right now. `quota.ts` and `activity.ts` are pure calculation
  with no failure path to report, and a log line in either would be noise. Counting
  `console.*` found files, not faults.

  **What was actually hidden, and is now said out loud:**
  - `jobs.ts` swallowed every parse failure into `catch { return [] }`. A file that does
    not exist yet and a file that has been corrupted produced identical silence, and the
    second one means his shortlist, his drafts, or every job card he has ever been shown
    was dropped on the floor with nothing written anywhere. Missing stays quiet; present
    but broken gets a line. Five places.
  - `protocol.ts` dropped any message it could not read, leaving no trace. That is the
    shape of fault that hides for a week: the Body sends something, the Core ignores it,
    and the symptom is a button that does nothing. Counted, loud once then at each power
    of ten, and it never logs the raw text, which may be whatever he just typed.
  - `claude.ts` returned "" for a transcript it could not read, which looked exactly like
    a session with nothing to report - including one sitting there waiting on him. Once
    per transcript, since it is called on a timer.

  **`turns.jsonl` had no size limit.** Now rotates at 4 MiB through a new shared
  `rotateIfBig` in `atomic.ts`, one generation, the same rule 5.1 settled on for the two
  logs. Deleting is the one thing it must not do.

  **`record()` was called from the success path only**, so `turns.jsonl` counted every
  turn that worked and none that failed - which makes the one number worth having, how
  often he is let down, impossible to get. `fail()` now records too, with a `failed` flag
  and zeroed token counts rather than guessed ones. Worker turns still produce no record;
  left alone deliberately, since a background job is not a turn he is waiting on.

  Seven checks on the rotation and the parser, no model and no quota spent.

- `[x]` 5.6 **Make the M5 gate test what it claims.** DONE 2026-10-03. 13/13.
  `tests/fakecore/supervisor.mjs` killed an **idle** Core and asserted only that something
  was listening again. The gate asks for mid-reply with the conversation preserved:
  different tests wearing the same name.

  **It also ran against his real memory.** No `isolatedEnv`, so the gate test pointed the
  Body at his live `aang.db` and state folder - a test scribbling on the thing it exists to
  protect. Now isolated, like the others.

  **Mid-reply, for free.** New `tests/fakecore/stub-claude.mjs` is a Claude that never
  answers. The SDK spawns it where the real CLI goes, so a turn sits genuinely in flight for
  about 19 seconds and the kill lands in the middle of a reply without a token of quota
  being spent. (`AANG_WARM=0` matters: the Core's silent warm-up turn otherwise holds the
  lane and the test's own message comes back `queued`.)

  **The Body half, stated honestly.** Killing the Body kills the Core by design - the job
  object at `CoreSupervisor.cs:30` exists so a crashed Body cannot orphan one. "Both
  recover" was never achievable. The test now asserts the real guarantee instead.

  **The gate was false, and the test proved it.** See 5.10.

- `[x]` 5.10 **A Core that died mid-reply lost what he had just said.** DONE 2026-10-03,
  found by 5.6 above. Not previously on any list.

  Both halves of a turn were written together by `saveTurn` once the reply finished, so
  between pressing Enter and the answer arriving - which can be minutes - his message
  existed only in memory. A crash in that window lost it outright, with no trace anywhere.
  The M5 gate had claimed this was safe since it was written.

  Fixed by splitting the save: `saveAsked` at submit, `saveReplied` when the answer exists.
  5.3 made this cheap, because both rows already carry the same `req`, which is what pairs
  them - they no longer need to be written in one go.

  Two details that are easy to get wrong, both deliberate:
  - The save happens **after** the prompt is built and sent. A row stored any earlier can be
    picked up by the recap and handed back to the model as context for answering itself.
  - The marker lives on the **submission**, not the Turn. An escalated or re-looked turn
    calls `begin()` again with the same submission and a fresh Turn, so a marker on the Turn
    would reset and store his message twice. Tested.

  Verified: the gate test went from 12/13 to 13/13 on exactly this check, and three checks
  cover the duplicate guard, the pairing and the ordering.

- `[x]` 5.7 **A way to create a database from nothing.** DONE in 0.2 (e51666c): `createDatabase()` in `schema.ts` is the third branch of the healing logic. **[verified]** There is no
  `CREATE TABLE` anywhere in the source tree and no `.sql` file. A fresh install on a new
  machine cannot work. Not urgent while this machine runs, but it is the real content of
  the item the brief called "the backup cannot be restored".

- `[x]` 5.8 **Delete the stray `$null` file.** DONE 2026-10-03. An empty file literally
  named `$null` was committed in `src/Core/`, from a mistyped shell redirect. Gone.

---

# Decisions still needed from you

These change the code, so they cannot be guessed.

| # | question | blocks | my recommendation |
|---|---|---|---|
| 1 | Missing memory: refuse to start, or run and say so every turn? | 0.2 | **Refuse.** Silent amnesia is the worst state. |
| 2 | Exact path of `Lindsay's Job Hunt` | **1.2, and therefore all of Drive** | Needs the MacBook. Do not guess it. |
| 3 | Size of My Drive versus free space | 2.1 | Needs the MacBook or a signed-in session. |
| 4 | Honesty check: rewrite the reply, or flag it? | 5.4 | **Flag.** Rewriting risks changing a correct answer. |
| 5 | Which cache rate your account is billed at | nothing, but it doubles the cost numbers | The billing page says. |

---

# Not doing, and why

Recorded so they do not quietly come back.

| | why |
|---|---|
| Rebuilding Aang on a different foundation | **[verified]** It would move you off your subscription onto metered API billing. |
| Context editing | **[verified]** Zero references in both the pinned and current engine packages. Its 84% headline came from a 100-turn run that would otherwise have run out of room; your lanes cap at 8 turns. |
| A local model as the main brain | **[measured]** Fails at 5 tool calls, 0/3. And the "Claude validates it" idea is refuted: a production study measured a verifier catch rate of 0.20 and a contribution of +1.5 points, and found using the frontier model as the checker *"eliminates most rescues."* |
| Replacing the router with a local model | Learned routers barely beat keyword rules, and injecting coding words flipped one router's decision 98% of the time. For something that reads your email, that is a security regression. |
| An LLM judge for voice | Needs 100-200 labels per failure mode, and a vanilla GPT-4o judge scores at chance (50.86%) on objectively decidable pairs. |
| An observability platform | `5.3` gives the answer you actually want without a second database and a Python process surviving six restarts a day. |
| A paid memory service | MemDelta: p = 1.0 against plain retrieval, at 50x the ingest cost. |
| A dashboard | `present_list` already exists, and Discord cards already give you the phone view. |
| Voice | Not your bottleneck. |
| Jev and `jev-audit` | The audit tool is 1 star, 1 commit, vendor-authored, and its default scan path is 722 of your transcripts. Jev itself is waitlist-gated. Get on the waitlist; it costs nothing. |

---

# Progress

Update this table as you go. It is the answer to "where are we".

| phase | what it gets you | status |
|---|---|---|
| 0 | cheaper conversations, no silent amnesia | `[x]` **done** |
| 1 | safe to read documents | `[x]` **done** |
| 2 | he can read your Drive | `[x]` **done** |
| 3 | he learns from it | `[ ]` **ready to start** |
| 4 | he is pleasant to use | `[x]` **done 2026-10-03** |
| 5 | the rest | `[x]` **done 2026-10-03** |
| 6 | the cockpit: he can SHOW you things, not just tell you | `[ ]` **planned, not started** |
| 7 | the research loop: he watches what is trending and tells you what matters | `[ ]` **planned, does not wait for 6** |
