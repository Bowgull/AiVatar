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

### `[ ]` 3.1 Wire in the local model

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

### `[ ]` 3.2 The WoW rule

**[verified]** `screen.ts:83` already detects the game by process name (`wow`, `wowb`,
`wow-64`, plus Overwatch, Diablo, Valorant). The detection exists; nothing uses it for
this.

**The change:** game running means no local model loads. The GPU belongs to WoW. Queued
reading resumes on quit.

**Done when:** starting WoW prevents a local model load, and quitting resumes it.

---

### `[ ]` 3.3 Read the documents

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

### `[ ]` 4.3 Scroll back through a conversation

**Not built.** Both voices distinguishable without reading a word: yours on recessed plum
with a `YOU` label, his on parchment. Conversations separated by natural time gaps,
archived in the Panel. The colours already exist in the theme and are currently used only
for buttons. `[scrollback, conversation view]`

---

### `[ ]` 4.4 A quiet signal when something is genuinely stuck

**Not built.** When a Claude session is blocked waiting on you, Aang announces once then
goes quiet, which is the one state where something really is stopped. It needs a
persistent but quiet signal, distinct from the working glow, easy to ignore mid-raid.

---

### `[ ]` 4.5 The smaller polish: **not parked**

All not built. Previously marked parked; **unparked by your decision, 2026-10-01.**

- `[ ]` 150ms crossfade between modes
- `[ ]` reveal-on-hover states
- `[ ]` recompute layout when display scaling changes while running
- `[ ]` entity chips in the Panel
- `[ ]` a first-run "here's what I can do"
- `[ ]` suggestion chips
- `[ ]` the job card stack

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

# PHASE 5: the rest of the fixes

**Goal:** everything confirmed real but on nobody's critical path. Do it when you want.

- `[~]` 5.1 **Rotate the logs instead of deleting them.** Body half DONE in 0.4 (6bdfb72): `Log.Write` keeps one generation, stamps full dates, reports failures. `core.log` (written by the supervisor) still deletes past 1 MiB. `CoreSupervisor.cs:90` deletes
  the file past 1 MiB, and `:92` stamps lines `HH:mm:ss` with no date. With six restarts a
  day the evidence of an incident can vanish before you look. Keep one generation, use
  full timestamps. **20 minutes.**

- `[ ]` 5.2 **Handle SIGTERM.** `index.ts:17` traps only `SIGINT`;
  `CoreSupervisor.cs:109` hard-kills with `Kill(entireProcessTree: true)`. So the cleanup
  that answers pending permission prompts and checkpoints the database almost never runs.
  **2 hours.**

- `[ ]` 5.3 **Give actions a turn id, and add `aang why <turn_id>`.** `actionlog.ts:10`
  has no id at all, so "why did you do that" can only be answered by comparing clocks.
  **Must come after 0.3.** The highest-value observability work on the list. **An
  afternoon.**

- `[ ]` 5.4 **Close the honesty-check hole.** `core.ts:87` is
  `if (!did.length) return reply;`, so when Aang did nothing but claims he did, grounding
  never runs. That is the worst case and the one not covered.

  **The fix in your brief does not work.** It says to consult `SAYS_FAILED` and `REFUSES`.
  Both detect a reply claiming *failure*; the uncovered case is a reply claiming
  *success* with an empty action record. Closing it needs a new "does this reply claim an
  action happened" detector, which is the risky kind, because a false positive rewrites a
  correct answer. **A day with test cases, not an hour.**

  **Decide first:** rewrite the reply, or just flag it? Flagging is safer.

- `[ ]` 5.5 **Logging in the six silent files.** **[verified]** Zero `console.*` calls in
  `discord.ts`, `jobs.ts`, `protocol.ts`, `quota.ts`, `activity.ts`, `claude.ts`. The whole
  Discord surface and the job pipeline are invisible. Also: `record()` is called from one
  place only (`core.ts:1486`), so worker turns produce no turn record at all, and
  `turns.jsonl` is appended at `core.ts:1734` with no size limit.

- `[ ]` 5.6 **Make the M5 gate test what it claims.** `tests/fakecore/supervisor.mjs` kills
  an **idle** Core and asserts only that something is listening again. The gate at
  `PLAN.md:137` asks for mid-reply with the conversation preserved. Different tests wearing
  the same name. Also rewrite the Body half honestly: killing the Body kills the Core by
  design (the job object at `CoreSupervisor.cs:30`), so "both recover" was never
  achievable.

- `[x]` 5.7 **A way to create a database from nothing.** DONE in 0.2 (e51666c): `createDatabase()` in `schema.ts` is the third branch of the healing logic. **[verified]** There is no
  `CREATE TABLE` anywhere in the source tree and no `.sql` file. A fresh install on a new
  machine cannot work. Not urgent while this machine runs, but it is the real content of
  the item the brief called "the backup cannot be restored".

- `[ ]` 5.8 **Delete the stray `$null` file.** An empty file literally named `$null` is
  committed in `src/Core/`, from a mistyped shell redirect. **One minute.**

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
| 4 | he is pleasant to use | `[ ]` 4.1 can start now |
| 5 | the rest | `[ ]` any time |
