# AiVatar Build Plan 1.0

**Version 1.1** | Written 2026-10-01, revised 2026-10-04 | Owner: Joshua Bocas

**What changed in 1.1:** Phase 6 rewritten from scratch (Electron instead of WebView2, the video
pop-out, paid video proven to play on Shadow, the everyday browser, a critical path and 29 steps).
Phase 8 steps 4 and 6 now live in Phase 6. The file keeps its `1.0` name so `CLAUDE.md` still points
at it.

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

**Where we are right now (2026-10-04): PHASES 0 TO 5 COMPLETE. PHASE 7 MOSTLY BUILT. PHASE 6
DESIGNED IN FULL, NOT STARTED: the next step is 6.1, measuring over WoW. Today's Aang is frozen as
the git tag `aang-v1-before-rebuild` and pushed to GitHub.**

**History, 2026-10-01: PHASES 0, 1 AND 2 COMPLETE, plus an unplanned fix that turned out to
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

# PHASE 6: the cockpit, the pop-out and the browser  **DESIGNED IN FULL, NOT STARTED**

**Rewritten 2026-10-04 for plan version 1.1.** The 2026-10-03 version of this phase was built on
WebView2 and said paid streaming was impossible. Both are now wrong: the engine is **Electron**, and
paid streaming **played over WoW on this machine**, which he watched himself. This version replaces it.

**Where the reasons live.** Every decision behind this phase, numbered 1 to 36, and the reasoning for
each, is in `docs/COCKPIT-PLAN.md`. This phase holds the **order** and the **steps**. The approved
mockups are `docs/cockpit/sheet-1-language.html` to `sheet-4-popout.html`. Test results are in
`docs/BROWSER-TESTS-2026-10-04.md`. The engineering view is `docs/BROWSER-ENGINEERING-ASSESSMENT.md`.

**What it gets him, in his order of use:**
1. **The video pop-out over WoW.** What he will use most (decision 27).
2. **Aang that can finally format what he says.** The biggest daily win.
3. **His own everyday browser**, eventually his default (decision 26).

**Entry:** phases 0 to 5 done (they are).
**Exit:** every step below `[x]`, and he has used the browser as his default for a week without
going back to Chrome for anything not on the "kept in Chrome" list.

---

## Five facts that shape every step

1. **This PC is a Shadow cloud PC, played on his MacBook.** His screen is itself a video stream.
   Paid video is blocked by Shadow (error S:102) unless the window drawing it has hardware
   acceleration off, which is Shadow's own documented fix and is tested. **Paid video can never be
   checked by screenshot here; every screenshot of it is black. He looks.**
2. **The engine is Electron, two runtimes.** Stock Electron for everything; castLabs Electron (with
   Widevine) for paid video. Tested: castLabs `44.5.1+wvcus`, Widevine `4.10.3050.0`.
3. **Built together** (decision 28), in dependency order. Nothing is built "first and decided later".
4. **Each step ships looking finished** (decision 6). No half-moved stretches.
5. **The pet sprite and the tray menu stay C#.** Nothing else on Windows can do them.

---

## How "done" works in this phase

Every step's **Done when** includes these, on top of its own line. They come from his zero-drift
rule and they are not optional.

1. Screenshot the matching mockup sheet. Screenshot the real build showing the same thing, with
   `tools/measure/Capture.ps1` and the `tests/fakecore/look-*.mjs` drivers.
2. Put them side by side in one image and show him.
3. Name every difference out loud, as a fix or a reason. If the mockup was wrong, fix the mockup
   first, then re-check the step.
4. **Paid video and feel are checked by his eyes**, never by screenshot: button travel, the fade, how
   the pop-out behaves mid-fight.
5. One step, one commit, hash written next to the tick (ground rule 1).

---

## The critical path

**Each arrow blocks the next. Everything not on a line can be done in any gap.**

```
6.0 safety net
 -> 6.1 MEASURE OVER WOW            (can kill the design)
 -> 6.2 the shell exists            (blocks every Electron step)
     |
     |-> 6.3 pop-out window -> 6.4 paid video -> 6.5 controls          = POP-OUT USABLE
     |        -> QUOTA GATE (read the meter, project the rest)
     |
     |-> 6.10 keycaps match -> 6.11 rich replies -> 6.12 new bubble      = AANG CAN FORMAT
     |
     |-> 6.19 tab positioning -> 6.20 browser shell -> 6.21 never lose a tab
              -> 6.22 protection -> 6.26 a week as second browser -> 6.27 DEFAULT
```

**Off the path, any gap:** 6.6 to 6.9 (skipping, "put X on", Simkl marking, the Mac helper), 6.13 to
6.18 (the rest of the cockpit), 6.23 to 6.25 (his stuff, extras, Aang's intelligence in the
browser), 6.28 (upkeep).

**Why this order, plainly:** the pop-out goes first because it is what he will use most **and**
it is where the two riskiest unknowns live, the overlay over WoW and paid video on Shadow. If either
fails, better to know in week one. Rich replies come next because they are the biggest daily win and
need no browser features. The browser comes last because it is the most work and the least used of
the three, and the default-browser switch is flipped only after a week of real use.

---

### `[x]` 6.0 The safety net  DONE 2026-10-04 (tag `aang-v1-before-rebuild`, pushed)

**Why:** he wants to be able to say "let's go back to the old one" (decision 36).

**The change:** today's working Aang frozen as git tag **`aang-v1-before-rebuild`** at `658f02d`,
**pushed to GitHub** and verified there. Still owed, and part of 6.2: the first time the new Shell
starts, it copies `%APPDATA%\Aang` and the database to a dated snapshot **before touching anything**,
because old code cannot always read data the new code has changed.

**To go back:** close the new Aang, `git checkout aang-v1-before-rebuild`, rebuild, restore the
snapshot. Only one Aang runs at a time: both want port 47831 and the tray.

---

### `[ ]` 6.1 Measure over WoW, before building anything  **BLOCKS everything in this phase**

**Why:** the old plan named this as the one measurement that could kill the design, and it was
never taken. The research since adds the thing gamers actually complain about: **video stuttering
while a game has focus**, from background throttling, hardware acceleration and NVIDIA Instant
Replay. And everything here runs on Shadow's GPU, re-encoded into Shadow's stream.

**Where:** throwaway scripts in the scratchpad, like the 2026-10-04 tests. Results to
`docs/BROWSER-TESTS-2026-10-04.md`, new section.

**The change:** with WoW running in a raid-like scene, measure each of these for two minutes:
1. Nothing extra open (baseline).
2. An idle Electron window open.
3. A page scrolling.
4. YouTube playing in a see-through always-on-top window, `backgroundThrottling: false`.
5. The Widevine test stream in castLabs with hardware acceleration off.

For each: CPU, GPU and RAM of the Electron processes (`typeperf`), and **WoW's frame pacing with
PresentMon**. Run 4 twice, with NVIDIA Instant Replay on and off.

**Verify:** the numbers are in the doc, and he plays through runs 4 and 5 and says how WoW feels.

**Done when:** an idle window costs close to nothing, **and** WoW's frame pacing in runs 4 and 5 is
within noise of the baseline or has a named fix that brings it there, **and** he says it feels the same.

**If it fails:** stop, and decide with him. Options in order: the Mac's own picture-in-picture for
video (no build at all), a smaller or lower-rate pop-out, or no overlay. **Do not build 6.3 onward on
a failed 6.1.**

---

### `[ ]` 6.2 The shell exists  **BLOCKS every Electron step**

**Why:** every window in this phase is Electron, and none of it exists yet.

**Where:** new `src/Shell/` (main process, preload, pages). Supervised from `src/Body/CoreSupervisor.cs`
the way the Core already is. Talks to the Core over the existing WebSocket; **the protocol does not
change**.

**The change:**
- An Electron app the tray starts, restarts if it dies, and stops on quit. A crash in it must never
  take down the pet or the Core.
- **Before any real sign-in**, the fuses: `EnableCookieEncryption` on, `RunAsNode` off, Node options
  and the inspector off, archive integrity on (`@electron/fuses`). Cookie encryption **cannot be
  turned on later** without losing every login.
- Every web view: `sandbox`, `contextIsolation`, no `nodeIntegration`, permissions denied by default,
  `setWindowOpenHandler` denying new windows, IPC sender checked.
- The data snapshot from 6.0, on first start only.
- **Settle one thing by test, not assumption:** whether the Shell's TypeScript runs directly like the
  Core's does, or needs `tsc` first. The Core runs `.ts` under Node with no build step; Electron's
  bundled Node may or may not.

**Verify:** start Aang from the tray; kill the Shell from Task Manager; the tray restarts it within
seconds and the pet never flickers. Then run Electron's own checklist against it once with
`electronegativity` as an audit.

**Done when:** the Shell starts, survives being killed, reaches the Core, the snapshot exists, and the
fuses are confirmed set on the built app.

**Rollback:** remove the supervisor entry; the C# Body runs exactly as today.

---

## The pop-out: what he will use most

Mockup: **`sheet-4-popout.html`**. Decisions 27 and 29 to 34.

### `[ ]` 6.3 The pop-out window  **BLOCKS 6.4, 6.5**

**Why:** decision 27.

**Where:** `src/Shell/popout/`.

**The change:**
- Always on top. **A normal clickable window** (decision 32): click it to use it, click WoW to go back.
- Drag the wooden bar to move; drag any edge or corner to resize; **16:9 worked out by Aang**, not
  trusted to Windows (`setAspectRatio` does not apply to code-set sizes, tested).
- **Opens at the size and place he last left it.** First time only: the right-hand side, the only
  quiet part of a WoW screen. Snaps flush near a screen edge. Size presets are shortcuts only.
- **One pop-out at a time** (decision 34).
- **Stutter defences from day one**, from 6.1: `backgroundThrottling: false`, hidden fully rather than
  made transparent when not in use.
- Video embeds served from a tiny page on `127.0.0.1`. **Direct YouTube embeds fail with Error 153**
  (tested); Twitch needs `parent=127.0.0.1` and at least 400 by 300.
- `electron-overlay-window` to follow the WoW window, **only if** it works on WoW (untested; proven on
  Path of Exile).

**Verify:** YouTube and a Twitch stream in the pop-out over WoW; drag, resize, close, reopen.

**Done when:** it reopens exactly where and how big he left it, plays both, and the sheet 4 side by
side matches section 1.

**Rollback:** delete `src/Shell/popout/`.

---

### `[ ]` 6.4 Paid video  **BLOCKS nothing else, but is on the path to "pop-out usable"**

**Why:** decisions 29 and 30. His anime is on Prime, in the Crunchyroll section.

**Where:** a castLabs runtime for the pop-out only, `src/Shell/drm/`.

**The change:** castLabs Electron, `app.disableHardwareAcceleration()` **in that process only**, the
Widevine module ready before the first page (`components.whenReady()`). Try the narrower switch
`disable-direct-composition-video-overlays` too: if it also gets past Shadow, prefer it, because it
keeps acceleration for everything except the protected video. An allow-list of paid services; nothing
else ever loads in this runtime, because castLabs lags security fixes by weeks.

**Verify:** Crunchyroll, then Prime, with **his** accounts. **He looks.** Read the player's error code
if anything is black: that is the licence, not the window.

**Done when:** an episode of his plays over WoW and he says it plays cleanly.

**Blocked on him:** signing in to Prime and Crunchyroll in the pop-out himself (Aang never types a
password). **Netflix waits for his free castLabs EVS signup** (decision 31); Netflix rejects
development builds (error M7121-1331).

**Rollback:** the paid services fall back to the Mac helper (6.9) or Chrome.

---

### `[ ]` 6.5 The controls

**Why:** he plays with a raid going on; the buttons are big for that reason.

**The change:** play and pause (the only gold key), the scrub groove, volume, the **see-through
slider** (one continuous slider with a percentage, the bars never fade), fullscreen, the resize
corner, the send-to-MacBook keycap. **Controls and wood fade two seconds after the mouse stops and
come back on hover; never while paused.** Settings panel as drawn: always on top, remember size,
fade controls, smooth video, clicks go through to the game (off).

**Done when:** sheet 4 sections 2, 3 and 7 match side by side, and the fade feels right to him.

---

### `--` QUOTA GATE, after 6.5

Read the Claude usage meter. 6.1 to 6.5 are the most typical kind of work in this phase, so the
rate per step projects the rest. **Write the projection here and decide with him whether to
continue at the same pace.** The engineering assessment could not estimate this honestly in advance.

---

### `[ ]` 6.6 Skipping

**Why:** he asked. Research tested each source live.

**The change**, each with an on/off switch and an honest reliability tag, as drawn:

| Skip | Source | Reliability |
|---|---|---|
| Anime openings and endings | **AniSkip**, free, no key, `GET /v2/skip-times/{malId}/{ep}?types=op&types=ed&episodeLength=0`. Title to MAL id via AniList; absolute episode to season via `erengy/anime-relations` (one bundled file). Cache everything: the backend has been dormant since 2024 | Solid |
| Intros and recaps | Press the service's own Skip button. Prime `.atvwebplayersdk-skipelement-button`, Netflix `.watch-video--skip-content-button` (Netflix's needs the React handler, not `.click()`) | Solid on Prime, Netflix fragile |
| YouTube sponsor bits | SponsorBlock, hashed-prefix lookup, through the IFrame API | Solid |
| YouTube ads | Ghostery's engine **with uBlock's lists**, not its prebuilt EasyList, refreshed automatically | Breaks every few weeks |
| Twitch ads | `ryanbr/TwitchAdSolutions` `vaft`. **Off by default.** Its own notes say the result is a 360p picture for the ad break | Shaky |

**Every skip shows a plaque for three seconds with Undo.** Nothing is skipped silently.

**Blocked on him:** whether Twitch ad blocking is worth turning on.

---

### `[ ]` 6.7 "Put X on"

**Why:** the reason the pop-out is useful without hunting for things.

**The change:** one `watch()` tool, not several (tool-choice accuracy collapses on long shelves;
Qwen is cleanest at five tools or fewer). Code matches his words first; Qwen fills in the gaps with
thinking off; **the Streaming Availability API** finds where it is in Canada, with audio languages so
**dub** is a data lookup; Twitch via `twurple`; YouTube by handle (1 quota unit, not 100). Where it
opens: the pop-out if a game is up, a tab if not, **never moved by itself** (way 6 removed). The dub
preference is a table, per show then per category then global, **not** conversation memory.

**Off the path, but uses Phase 8 thinking:** extraction stays in Qwen's fast mode; nothing here needs
the slow thinking mode.

---

### `[ ]` 6.8 Aang marks what he watched

**Why:** Simkl's extension tracks only Netflix and Crunchyroll, and **nothing tracks Prime**, where
his anime plays. When Aang opens the episode he already knows what it is.

**The change:** `POST /sync/history` on finish, `/scrobble/start|stop` around playback, **never a
heartbeat** (prohibited, 45 to 135 times the cost), anime by **absolute** episode number. Needs the
`media:write` scope, which `tools/simkl-setup.ps1` now asks for.

**Blocked on him:** his Simkl list is empty, and his sign-in predates the scope; one re-run of setup.

---

### `[ ]` 6.9 The Mac helper

**Why:** decision 35. A fallback for paid video and a way to watch on the Mac by choice.

**The change:** one small background helper on the MacBook that does exactly one thing: open an
approved link in picture-in-picture. **Listens only on the Mac's Tailscale address `100.83.81.65`.**
Only messages signed by Aang. Only `https` links from sites he approves. Logs every request. Not a Mac
port: no pet, no brain.

**Blocked on him:** installing it on the Mac.

---

## Aang can format what he says

Mockups: **`sheet-1-language.html`** and **`sheet-2-surfaces.html`**.

### `[ ]` 6.10 The keycaps match  **BLOCKS 6.11**

**Why:** "I LOVE the weight of the buttons currently". If CSS cannot match them, stop and think.

**The change:** `docs/cockpit/cockpit.css` checked against `Theme.cs` value by value. `Theme.Lip` is
3 px and stays 3 px. Old and new buttons side by side.

**Done when:** he cannot tell the old keycap from the new one by feel or look.

---

### `[ ]` 6.11 Rich replies  **BLOCKS 6.12**

**Why:** the biggest daily win. `voice.ts` line 18 forbids formatting because the GDI bubble cannot
draw it; a lint strips any markdown. The result is walls of prose.

**The change:** rewrite line 18 rather than delete it, with his rule: **structure only when it earns
it.** "It is 3:14" stays one line; several jobs, a comparison, steps or findings get headings, rows
and colour. The lint stays for the old bubble until 6.12 replaces it. Dividers follow sheet 1's
hierarchy: forged end-caps between topics, carved grooves between items.

**Done when:** the three-jobs example from the old plan comes out as sheet 1's reply, side by side.

---

### `[ ]` 6.12 The new bubble

**The change:** the bubble as a see-through Electron window beside the C# pet. Normal mouse
behaviour; no click-through dependency. The old GDI bubble stays in the code until **he** judges the
new one better on the real thing, then it goes.

---

### `[ ]` 6.13 Several things waiting, and the plan before acting

**Why:** today a new message **replaces** the last, so three things needing him means he sees one.
And plan-before-action is the single biggest gap the research found.

**Shared with Phase 8 step 4** (the live checklist). Build it once, here.

---

### `[ ]` 6.14 Buttons on answers that act

The callback bridge: a button on a card runs a real Aang action through the existing trust gate.

### `[ ]` 6.15 Window 2: the scroll back and the seven tabs

What I know, What I may do, What I did, Drafts, Jobs, History, Settings, rebuilt in the look. **If
this stalls the phase, split it out.** That is the correct retreat, not a failure.

### `[ ]` 6.16 The palette move and the local model on the strip

Qwen takes the purple; the three Claude modes move to the warm end. **A `Local` mode on the pill** and
a `[local]` marker. **This is Phase 8 step 6; do it once, here.**

### `[ ]` 6.17 Snip, hotkey grab, drag and drop

### `[ ]` 6.18 Search over everything, charts, side by side, the live job view

---

## The browser

Mockup: **`sheet-3-browser.html`**, which still shows a horizontal tab strip and must be redrawn with
a **vertical tab rail** before 6.20. Its section 2 is superseded by sheet 4.

### `[ ]` 6.19 The tab positioning layer  **BLOCKS 6.20**

**Why:** no layout library can hold an Electron browser view; they lay out page elements, and a
`WebContentsView` is not one. The piece that turns "where a tab should be" into "where the view is",
with Windows monitor scaling and drag, **exists nowhere and is written by hand.**

**Done when:** a view tracks a resizing, dragging layout with no tearing at his scaling.

### `[ ]` 6.20 The browser shell  **BLOCKS 6.21**

**Vertical tab rail** (the chunky style forces it: thick outlines eat width faster than flat tabs),
address bar that searches and never carries commands, back and forward, reopen closed tab, find, zoom.
Borrowed from **Min** (Apache-2.0) and Tree Style Tab's tree logic.

### `[ ]` 6.21 Never lose a tab  **BLOCKS 6.22**

Continuous snapshots of each tab; the same snapshot powers crash restore, sleeping tabs and update
restarts (`electron-updater` closes windows before `before-quit`, so save-on-quit cannot be trusted).
**Every call into a tab has a timeout: calling a crashed one hangs** (tested). A crashed tab gets a
"this page crashed, reload" plate.

### `[ ]` 6.22 Protection  **BLOCKS 6.26**

Ghostery with a visible per-site pause; phishing lists (Phishing.Database, URLhaus, OpenPhish) on
every load; downloads marked so Defender scans them; **passkeys hidden** so sites fall back to a
password and code, because passkeys hang in Electron and poison later attempts (tested). Approvals as
**chips** for routine asks and a **lever** for serious ones, always in the carved chrome, never in the
page area.

### `[ ]` 6.23 His stuff

Bitwarden filling from the main process (Min's adapter), Floccus bookmarks and open tabs with the Mac,
one-time bookmark import. Passwords reach Bitwarden through each Mac browser's own Export button.

### `[ ]` 6.24 Everyday extras

Downloads list, print, PDF, a screen-share picker for calls, spellcheck.

### `[ ]` 6.25 Aang inside the browser

Reader and summariser (Readability, Turndown, Qwen); searchable reading memory (SQLite FTS5 plus
sqlite-vec); a labelled element index borrowed from Vimium's link hints, so "click B7" is how he acts;
five tools or fewer; trails (Horse Browser) and mark as done (SigmaOS); the agent on **its own
profile**, never the one with his logins.

### `[ ]` 6.26 A week as the second browser  **BLOCKS 6.27**

He uses it alongside Chrome for a week. Every site that breaks goes on a list. That list decides
what stays in Chrome.

### `[ ]` 6.27 The default browser

Register (StartMenuInternet, Capabilities, RegisteredApplications, all per-user), harden incoming
links against the known attack where a link smuggles in startup instructions (`--` before `%1`,
`http` and `https` only, real URL parsing), then open Windows Settings for **him** to click "Set
default". Windows does not let an app set itself, and that is fine.

**Kept in Chrome, on purpose:** sites that insist on passkeys, the odd blocked Google sign-in (if Aang
is the default, "open in your default browser" sends it back to Aang), and anything caught in a
security-patch gap.

### `[ ]` 6.28 Upkeep, automated

Electron and castLabs upgrades flagged automatically; filter lists refreshed daily; a monthly check on
whether the Windows passkey bridge (`@clerk/electron-passkeys`, 0.0.3) is ready.

---

## What would make this a mistake

- **If 6.1 fails** and no fix brings WoW back to normal. That ends the overlay; the Mac's own
  picture-in-picture is the fallback.
- **If the keycaps do not come across.** The one thing he has said plainly that he loves.
- **If the quota gate after 6.5 projects more than he will spend.** Then the browser shrinks, not the
  pop-out.
- **If upkeep starts eating weeks.** Small browsers die of month-six maintenance, not month-one
  features. Watch the time each Electron upgrade takes.
- **If Google starts blocking Electron's sign-in.** It works today because Google does not recognise
  the name, not because Google allows it.

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

# PHASE 8: let the local model do more  **DESIGNED, NOT STARTED**

**Found 2026-10-03, while answering "does Hermes have any use in Aang". It does not - but looking
cost nothing and turned up this, which is worth more than Hermes was.**

## The finding

`LOCAL-MODEL-PLAN.md` says local handles up to 4 tool calls and Claude takes 5 or more, because
Qwen3.5-35B scored 0/3 at five steps. That is reproducible and it was right.

**It is also only true with thinking OFF, which is how `local.ts` calls the model.** Same model, same
card, same `steprace.mjs`:

| Qwen3.5-35B-A3B | 1 | 2 | 3 | 4 | 5 steps |
|---|---|---|---|---|---|
| `THINK=off` (as Aang runs it) | 3/3 | 3/3 | 3/3 | 3/3 | **0/3** |
| thinking on | 5/5 | 5/5 | 5/5 | 5/5 | **5/5** |

Timed on the five-step job: **thinking on takes 50 seconds and calls all five tools in the right
order. Thinking off takes 4 seconds, calls four, stops before the last, and reports success.**

So the 4-step ceiling was never the model. It was us. Work currently handed to Claude can run on his
own card for nothing, at about fifty seconds a job.

**Hermes-4-14B was raced for this and is not needed.** It also passes five steps, but it is 8x slower
and it failed the TWO-step job 0/5 by answering from its own head without calling a tool at all.

## The trap this must not fall into

From the cascade research: **if the signal for "did the cheap model fail?" is wrong, you pay twice** -
the local attempt and the Claude call. "A 70% cheap-tier route with a 50% false-fail rate is worse
than always using the expensive model."

**So the number that decides whether this was worth building is NET quota saved, not how often it
routed local.** Measure it from the start or there is no way to know.

## What he decided, 2026-10-03

**Where it applies: background and proactive work only.** The sweep, reading documents, vetting job
links, the addon check, anything Aang starts himself. Never a question he is sitting in front of -
the latency research puts anything over 1.5 s at "sluggish", and fifty seconds is thirty times that.
This is also where the cascade trap is weakest: nobody is waiting, so a failed local attempt costs
time nobody feels.

**How failure is caught: the honesty check he already built.** Step 5.4's `CLAIMS_DID` flags a reply
claiming something was done when the action record is empty. "Stopped early and replied as if
finished" IS "claims it did something, did nothing" - the detector already exists, it is mechanical,
it costs nothing, and it was written for exactly this shape of lie. His own plan insists the handoff
be code and never the model's own judgement, which rules out asking it; and having Claude verify every
answer is the cascade trap written down.

**Escalation is silent, with an icon.** Local tries, the check catches a false finish, Claude redoes
it, and he sees the right answer with a small mark saying it was handed over. No question, no
interruption.

**Two minutes, then give up.** Comfortably past the ~50 s a five-step job takes, short enough that a
looping model cannot hold the card all afternoon.

**While a game is running: small jobs only, never the slow ones.** `gpu.ts` already refuses the local
model mid-game. Quick extraction may run; multi-step thinking waits until he stops playing. A
50-second GPU job during a raid is the one thing that would make Aang feel like a problem.

**Near the quota limit: a switch, never automatic.** He may flip it, or Aang may ask, but Aang does
not change his own behaviour because the week is nearly gone. Predictability beats cleverness.

**A `Local` mode on the pill.** Auto | Local | Quick | Smart | Deep. He picks it when he wants
something done for free and does not mind waiting. This touches `Mode` in `protocol.ts`, `pickLane`,
and the mode chip in `InputWindow`.

**A `[local]` marker on every reply local produced.** Quiet and always there, so he learns over time
what it can handle alone.

**Research drops split in two.** Local reads the page and pulls the facts; Claude judges whether it
matters and writes the verdict. The verdict is the part he reads, and a 14B-class model writing it is
the weakest link.

## The UI, and what Aang is missing

The agents winning in 2026 share five things: plan before action, diff before write, tool calls as the
primary surface, a stop button that actually stops, and a token meter that does not lie. Measured:

| | Aang today |
|---|---|
| token meter that does not lie | **better than most** - ten segments, week and 5-hour, a pace tick |
| stop that actually stops | exists and works |
| diff before write | partial - permission names the file and undo exists, but there is no preview |
| tool calls as the primary surface | **partial, and wrong for long jobs** |
| plan before action | **missing entirely** |

**The fourth is the one that breaks a 50-second job.** Each `tool` event currently REPLACES the dots
label: "checking the time" is overwritten by "searching your memory", overwritten again, and at the
end there is nothing. For a four-second turn that is fine. For fifty seconds it is the worst case -
motion with no memory, and no way to tell progress from a stall.

**The fix is a live checklist, which is what Claude Code does and what the research recommends.** Show
the steps; tick them off. `StructuredList` with per-row `ChipTone` is already a list of rows with
status colours, so the drawing exists.

**His choice: a line in the bubble, the detail in the Panel.** Glanceable on the desktop, the whole
picture a click away - the pattern Claude Code and Cursor both use.

```
Working on that myself                    [local]
  done   checked the time
  done   searched what you said about Float
  now    reading your screen
         set a reminder
         show you the list
```

Worth knowing from the research, because it changes how this should feel: **people rate a slower
answer as MORE thoughtful, not broken - but only when they can see something happening.** A spinner
for fifty seconds reads as stuck; five ticking steps read as deliberation.

## Build order

1. **A net-saving counter first.** Local attempts, local successes, escalations, and Claude turns
   avoided. Without it there is no way to know whether any of the rest was worth it, and the research
   is explicit that the headline routing rate lies.
2. **`thinkHard` on `askLocal`** - thinking on, 2-minute timeout, refused mid-game like the rest.
3. **Route background work through it**, with `CLAIMS_DID` as the escalation signal.
4. **The checklist**: emit the plan as a `StructuredList`, update rows from the existing `tool` events.
   **Moved to Phase 6 step 6.13 in plan 1.1**, built once in the new bubble.
5. **The `[local]` marker and the handover icon.**
6. **The `Local` mode on the pill.** **Moved to Phase 6 step 6.16 in plan 1.1**, with the palette move.
7. **Split the research drops** - local reads, Claude judges.

## What would make this a mistake

- **If the escalation rate is high.** Pay twice often enough and this costs more than it saves. The
  counter from step 1 is what tells him, and the honest answer may be to turn it off.
- **If `CLAIMS_DID` misses the silent stop.** It was built for a reply claiming an action with an
  empty record; a local model that stops early may instead say something vague that claims nothing. If
  so it needs widening, and that is the risky kind of change - a false positive escalates work that
  was fine.
- **If 50 seconds turns out to be optimistic.** One job, one shape, measured once. A longer or messier
  job may be much worse, and nothing here has measured that.

---

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
| 6 | Sign in to Prime and Crunchyroll yourself, in the pop-out | 6.4 | Aang never types a password. Thirty seconds each. |
| 7 | The free castLabs EVS signup, in your name | Netflix in 6.4 | **Agreed 2026-10-04**, at build time. Until then, Netflix goes to the Mac. |
| 8 | Turn Twitch ad blocking on? | 6.6 | **Leave it off.** It gives a 360p picture for the ad break and breaks constantly. |
| 9 | Re-run `tools/simkl-setup.cmd` once | 6.8 | Your sign-in predates the write permission, and your list is empty. |
| 10 | Install the Mac helper on the MacBook | 6.9 | Needs your hands on the Mac. |
| 11 | Go or stop at the quota gate after 6.5 | the rest of Phase 6 | Decide on the measured rate, not on a guess. |

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
| WebView2 for the cockpit | Cannot play Widevine (`WebView2Feedback#4828`), and Google blocks sign-in inside it. Replaced by Electron, 2026-10-04. |
| Ghost mode and edit mode on the pop-out | His decision 32: it is a normal clickable window. The old version relied on mouse sensing over a click-through window, which Electron marked "not planned" on Windows. |
| A video jumping into the pop-out by itself | His call, 2026-10-04: never. |
| Importing logged-in sessions from the Mac | Chrome ties sessions to a key in the Mac's security chip that cannot be copied; Firefox sessions fail on a new machine. Saves three minutes, once. |
| Horizontal tabs | The chunky style eats width faster than flat tabs, so it fails sooner. Vertical only. |
| Our own browser engine | Ladybird, funded with a full-time team, plans a stable release in 2028. |
| Getting paid video past Shadow by any route other than Shadow's own fix | Shadow's documented fix works; nothing else is needed or wanted. |
| Jev and `jev-audit` | The audit tool is 1 star, 1 commit, vendor-authored, and its default scan path is 722 of your transcripts. Jev itself is waitlist-gated. Get on the waitlist; it costs nothing. |

---

# Progress

Update this table as you go. It is the answer to "where are we".

| phase | what it gets you | status |
|---|---|---|
| 0 | cheaper conversations, no silent amnesia | `[x]` **done** |
| 1 | safe to read documents | `[x]` **done** |
| 2 | he can read your Drive | `[x]` **done** |
| 3 | he learns from it | `[x]` **done 2026-10-02** (3.1, 3.2, 3.3 all ticked; 1,188 notes indexed) |
| 4 | he is pleasant to use | `[x]` **done 2026-10-03** |
| 5 | the rest | `[x]` **done 2026-10-03** |
| 6 | the video pop-out over WoW, Aang that can FORMAT what he says, and his own everyday browser | `[ ]` **rewritten 2026-10-04 (plan 1.1): 29 steps, critical path, not started.** 6.0 done (safety tag pushed). Next: **6.1, measure over WoW** |
| 7 | the research loop: he watches what is trending and tells you what matters | `[~]` **mostly BUILT 2026-10-03** - sweep, mentions, addon check and digest all run live. Left: the #look-into-this channel and the digest reaching Discord |
| 8 | the local model does more, so fewer turns reach Claude | `[ ]` **designed, not started** |
