# Everything left to build

*Written 2026-09-28. This is the complete map — every outstanding item across all planning documents, merged and de-duplicated, in plain language.*

---

## How to read this

Every item is written the same way: **what it is in plain English**, then what it actually does for you, then the real technical name in brackets so you can search for it or bring it up later.

Status words mean exactly this:

| Word | Meaning |
|---|---|
| **NOT BUILT** | Doesn't exist. Real work. |
| **BUILT, NOT SEEN** | The code exists and passes tests, but nobody has looked at it working. Doesn't count as done. |
| **HALF BUILT** | Partly there, with a specific missing piece named. |
| **BROKEN** | Exists and is wrong. Worse than missing, because it looks fine. |
| **DECIDED, NOT BUILT** | You already chose how this works. Nobody has written it yet. |
| **PARKED** | Deliberately set aside. Not forgotten, not dead. |
| **RETIRED** | Killed on purpose, with a reason. Listed so it doesn't get rediscovered as a bright idea. |
| **CHANGED** / **REWRITTEN** | Was in an earlier version of this document; research changed what it should be. |
| **INVERTED** | The research said to do the *opposite* of what was planned. |
| **DEMOTED** | Still real, no longer urgent. Usually parked behind something else. |

Three older planning documents used three different numbering schemes (phases 0–7, phases A–P, phases X0–K4) that partly describe the *same work*. They are merged here. Where they contradict each other, that is called out rather than quietly resolved.

---

## The rules this plan is built to

Decided by you, 2026-09-28:

- **Security gets done in full before any new features.** Your own earlier note already called this non-negotiable; this honours it.
- **Backup is item zero.** Everything Aang knows currently exists in one place, on a rented disk.
- **The MacBook question stays open.** Both paths are presented with real costs. You decide later.
- **Katara is real** — her own job hunt, everyday admin, the companion itself, and Momo connecting the two of you.
- **Momo is a messenger and nothing more.** Neither sprite reads the couple channel. This was your call and it is a very good one: it deletes an entire category of risk (see *Why this choice matters* under Katara).
- **Nothing Aang writes about himself activates on its own.** He proposes, you approve.
- **Foundations built for two characters**, done properly — not a general-purpose framework for characters who don't exist.
- **LinkedIn/Indeed automation stays.** Risk understood and accepted.
- Written for someone working on this **most days**, as their main project.

---

# 0. Don't lose everything

> **This is the only item in this document that is urgent today.**

### 0.1 — Aang's memory has no copy anywhere

**NOT BUILT.** `aang.db` holds all 354 conversations, every fact he has learned about you, and all 335 embeddings. It exists on exactly one disk — a rented one. There is no backup, on this machine or off it. The `.gitignore` comment claims the file is "rebuildable from chatlog"; that is not true of the facts, the embeddings, or the migrated turns.

If Shadow died tonight, Aang would be a stranger tomorrow.

*What to build:* a scheduled safe copy of the database (`VACUUM INTO`), a check that the copy is actually readable (`PRAGMA integrity_check`), encrypted and pushed off the machine, a "backup ok" line to your `#log` channel, and an alarm if 12 hours pass with no backup. **[database snapshots, off-site backup]**

### 0.2 — The newest planning work is also only on this disk

**NOT BUILT.** Right now there are 15 uncommitted files in the working tree, including the two newest planning documents. The data repository is one commit ahead and unpushed, with no post-commit hook, even though the project's own doctrine is push-on-every-commit *precisely because the disk is rented*.

*What to do:* commit and push, and install the missing hook. Ten minutes.

### 0.3 — There is no way to create a fresh database

**NOT BUILT.** The code opens `aang.db` only if it already exists, and contains no instructions anywhere for building one from scratch. The real structure of the database exists only inside the live file.

This means **a backup you cannot restore onto a clean machine is not really a backup**, and it blocks Katara entirely, because her instance would need to create its own database on day one. **[schema versioning, `PRAGMA user_version`]**

---

# 1. Fix what is quietly broken

These are not features. They are things that exist and are wrong, and each one silently undermines work built on top of it. That is why they come before everything else.

### 1.1 — Every prompt change you have ever made may have done nothing

**BROKEN. Not yet understood.** This is the most serious bug in the project.

When Aang continues an existing conversation, he appears to keep using the *old* instructions, ignoring any edits made since. The evidence is not a hunch: three identical test messages, across a full restart with edited instructions, produced near-identical replies while reading ~66,000 cached tokens and writing only 300–500 new ones. Clearing the saved conversation ID by hand made the same message work immediately.

**The implication is large: any personality, tone or behaviour fix you have ever made may have been silently inert on any conversation that was already running.** It was worked around once, by hand, for one test. It has never been properly diagnosed or fixed.

*Likely fix:* store a fingerprint of the instructions alongside each saved conversation, and start fresh automatically when they no longer match. *First, though, find out **why*** — is this how session resuming is designed to work, or is it a caching artefact? **[session resume, `systemPrompt`, prompt caching]**

### 1.2 — His facts are eating each other

**BROKEN, with live evidence.** When Aang learns a fact, he works out a "key" for it from a noun in the sentence, and uses that key to decide whether the new fact replaces an old one. The keys collide badly. *"Joshua plays WoW most nights"* and *"Joshua plays guitar"* both reduce to **"play"**, so one deletes the other.

**Measured live, 2026-09-28: 13 facts stored, 8 retired, 5 alive.** It chains, so any number of facts eventually collapses. Adding ignore-words only moved the collision to the next word along.

**And there's a second bug underneath it that nobody had written down.** Look at what's actually stored:

```
Located in Toronto.                                 ← alive
The user is currently located in Toronto.           ← retired
The user is currently in Toronto.                   ← retired
The user is asking about the capital of France.     ← retired
The user is tired and wants to relax with a movie.  ← retired
```

The Toronto three are genuine duplicates and superseding handled them **correctly**. But *"asking about the capital of France"* and *"is tired"* were never durable facts about you — they're **passing moments written down as permanent truths**. So there are two faults: keys colliding, **and** the extractor not telling "who Joshua is" apart from "what Joshua said once." Thirteen facts from 412 turns is a very low yield either way.

> **⚠️ The fix got smaller, because 4.3 changed.** The research says **stop auto-extracting facts entirely** — which deletes the second bug outright and most of the first. What remains, for a small hand-written fact set:
>
> 1. **Store facts as subject–relationship–object, and declare per relationship whether it holds one value or many.** `employer` replaces; `hobby` adds. Free, deterministic, no AI call, and it kills the collision.
> 2. **Replace the retired flag with valid-from and valid-to dates**, so you can ask both "what's true now" and "what did I believe in March" — and make superseding a **write-time** operation, never a judgement made while answering.
>
> The middle layer that was here before — having a model adjudicate add/update/delete against similar existing facts — **is no longer needed**, because nothing is being extracted automatically for it to adjudicate.
>
> **Keep your soft-retire-with-a-reason.** The best-known system that does this automatically has open reports of silently deleting memories users still wanted.

### 1.3 — The test suite cannot be trusted

**NOT FIXED.** Seven tests fail consistently and three more flip between passing and failing run to run. Cause: tests share hardcoded network ports and collide when run together. This predates all recent work — confirmed by comparing against an untouched copy of the project.

Consequence: "all tests pass" currently only means "I didn't break the exact thing I just touched." Everything else in this document is harder to build safely until this is true. *Fix: give each test file its own port.* **[port collision, test isolation]**

### 1.4 — Two smaller ones in the same family

- **A migration that would silently do nothing.** If the embedding model is ever changed, the routine meant to rebuild all the vectors would report success and rebuild nothing, because it doesn't check the vector size. Any future upgrade would appear to work and quietly wouldn't. **NOT FIXED.** **[`backfill()`, dimension filter]**
- **A file-permission check that can be walked around.** The guard protecting the database matches on the end of the filename, so a shortcut pointing at the same file under a different name isn't caught. **NOT FIXED.** **[symlink/junction traversal]**

---

# 2. Close the doors

**All of this, before any new feature.** Your decision, and your earlier documents already said the same.

The headline, in plain terms: **any web page you open while Aang is running can talk to him directly.** Not through the AI — straight to the machinery underneath. Without a model ever being involved, a page can ask for and receive every fact he knows about you, your last 200 conversations, every permission you've ever granted, and the full text of any email draft waiting for approval. It can also *grant itself permanent permissions*, and type commands into Claude on your MacBook.

### The critical four

| # | What's wrong | What it means | Status |
|---|---|---|---|
| 2.1 | **The local connection has no password** | Any web page reaches everything above. Permission IDs are sequential, so they're guessable too. | NOT BUILT |
| 2.2 | **Aang's own instructions file is writable by Aang** | One "always, write files" permission plus one poisoned message writes a permanent personality override that survives every restart — and doesn't appear anywhere in the Panel. | NOT BUILT |
| 2.3 | **Aang can write the settings file he himself loads** | He can install instructions that his own *next turn* then executes. A self-escalation loop. Same hole covers the Windows Startup folder and the PowerShell profile. | NOT BUILT |
| 2.4 | **Approving a command approves more than the command** | Saying yes to `git` once also says yes to `git status; rm -rf anything`, because the check splits on the very characters used to chain commands together. | NOT BUILT |

*Fixes, in order:* reject connections that arrive from a web page, add a per-boot password, tie each permission answer to the connection that asked. Then make the file rules deny *reading* too, and cover `Brain/*.md`, the key files, and `~/.claude/settings.json`. Then parse commands properly. **[WebSocket authentication, origin checking, path allow-list, shell command parsing]**

### The rest of the cluster

All **NOT BUILT** unless noted.

- **2.5** — Web lookups are ungated, so every read permission doubles as a way to send your data out. **[egress gating]**
- **2.6** — Eleven side-effecting tools have no permission gate at all. The worst is `do_task`: one ungated call starts a 60-turn autonomous session with all 53 tools available.
- **2.7** — Poisoned text outlives the flag meant to contain it — the "this came from outside, don't trust it" marker isn't carried through transcripts and Discord attachments. **[taint tracking]**
- **2.8** — The approval fingerprint only covers the first 1,300 characters of a draft, so you approve text you may not have seen.
- **2.9** — Discord fetches links in Aang's messages, which lets a planted URL leak data with nobody clicking anything. **[`SuppressEmbeds`]**
- **2.10** — **The PIN.** A second factor before sending email, sending a file, or granting any permanent permission from your phone. **DECIDED, NOT BUILT** (4 digits, remembered 30 minutes). Two details were never settled: how it's stored, and what happens after wrong guesses.
- **2.11** — **"Yes" on Discord currently means "always".** A tap on the smallest, most context-free surface you own writes permanent standing trust. **DECIDED** (Discord yes = once only; "always" requires the desktop) **, NOT BUILT.** This one is sitting in a "settled" table and reads as done. It isn't.
- **2.12** — A rogue connection can claim you're away from your desk, forcing every permission question onto Discord — the weakest surface.
- **2.13** — The "open a file" permission is really "launch any program on disk", forever.
- **2.14** — Standing permissions have no limit, no expiry and no counter, so a window title chosen by a web page can widen a grant.
- **2.15** — Discord can trigger typing into Claude on the Mac with no permission question on either machine.
- **2.16** — Secrets end up in logs and command lines: the action log records clipboard contents and full commands; keys travel in URLs.
- **2.17** — **Four MacBook bridge fixes** — key out of the startup file, constant-time comparison, pin to Shadow specifically rather than any machine on the network, key out of the URL. *Hard prerequisite for anything on the Mac.*
- **2.18** — Creating an email draft from Discord is ungated.
- **2.19** — Every secret is in plain text and readable by Aang's own file tools — Google, Discord, Spotify, Simkl, and both bridge keys. Closed automatically once 2.1 and 2.2/2.3 are done.

---

# 3. Make him look and feel right

### 3.1 — Look at what was just built

**BUILT, NOT SEEN.** The list-rows feature and the carved wood frame exist and pass 40 tests, but you haven't seen them render. There's also a known soft spot: the model *chose not to* produce a list the first time it was asked, and while the instruction was strengthened, that can never be made a guarantee. Needs a real look and a second real test. **[`present_list`]**

### 3.2 — Text that types itself properly

**NOT BUILT.** Replies currently arrive in bursts, because the reveal speeds up based on how much text is waiting. You already decided it should be a steady, readable pace with a click to dump the rest instantly — the convention every RPG uses. The code still has the old burst behaviour. **[typewriter reveal, `StepReveal`]**

### 3.3 — Being able to scroll back through a conversation

**NOT BUILT.** Both voices visible and distinguishable without reading a word — yours on recessed plum with a `YOU` label, his on parchment. Conversations separated by natural gaps in time, and archived in the Panel. The colours already exist in the theme and are currently used only for buttons. **[scrollback, conversation view]**

### 3.4 — The art

**NOT BUILT.** Your two complaints: it's choppy, and he needs more things to do. Plus two whole new characters — Katara with a full set of states, Momo with about four (appear, idle, open, leave).

> **The research disagrees with your diagnosis, and it would save you money.** 118 frames across ten states is ~12 frames each — *not* a low count. Shipped pixel-art games commonly use 2-frame idle loops. Choppiness at that count is nearly always **timing**: an animation timer with ~15.6ms granularity and no drift correction, and every frame held for the same length. *Fix the timing first; only then decide whether you need frames at all.*
>
> And "more things to do" is a **data problem, not an art problem** — ten short micro-idles (blink, ear twitch, look at the cursor) chosen at weighted random read as far more alive than one long loop. Idle is ~90% of a desktop pet's screen time.

*Note:* Aang's existing frames are locked by a fingerprint test, so changing them means updating that lock deliberately, not accidentally.

**Full costs, options and technique are in the research document — that was a specific question you asked.** Short version: buy Aseprite ($20), fix timing and add micro-idles first, then ~$24 of PixelLab for Momo where consistency failures are survivable. Consider a human artist for Katara if matching Aang's style matters more than speed.

### 3.5 — A gentle signal when something is genuinely stuck

**NOT BUILT. Decided today.** When a Claude session is blocked waiting on *you*, Aang announces it once and then goes quiet — even though that's the one state where something is actually stopped. It gets a persistent but quiet signal, distinct from the "working" glow, easy to ignore mid-raid.

### 3.6 — Smaller polish

All **NOT BUILT**, most **PARKED** by earlier decision: 150ms crossfade between modes, reveal-on-hover states, recomputing layout when display scaling changes while running, entity chips in the Panel, a first-run "here's what I can do", suggestion chips, the job card stack.

---

# 4. Make him remember and get smarter

> **⚠️ REWRITTEN 2026-09-28 after eight research threads.** The earlier version of this section was built on a wrong assumption: that Aang has more memory than fits, so it needs clever retrieval. **He doesn't.** His entire memory is 412 turns, 23,577 characters — **about 6,000 tokens**, which fits in one context window roughly 150 times over.
>
> Four items below were **reversed or dropped**, one was **inverted outright**, and two are **new**. Full evidence in [MEMORY-ARCHITECTURE.md](MEMORY-ARCHITECTURE.md). The short version: *the sophisticated parts are the ones that don't work, and the simple thing wins at this scale.*

### 4.1 — A way to tell whether any of this helps

**NOT BUILT, and now doubly important.** About 30 test questions built from your real conversations. Without it every change below is a guess.

Scoring stays split by your decision: tool choice and recall checked automatically; whether he *sounds right* judged by you.

> **Two additions from the research.** First, your ratings file becomes a second, free test set (see 4.2) — together that's enough material to properly optimise a prompt. Second: **don't let an AI judge whether Aang sounds like Aang.** LLM judges have a documented bias toward familiar, low-perplexity text, and a distinctive voice is by definition unfamiliar — the judge is structurally biased against exactly what you're preserving. Use a **style-distance tripwire** against a fixed corpus of his approved lines instead. It won't tell you if he sounds right; it'll tell you *when to look*. **[style embeddings]**

### 4.2 — Use the ratings you're already collecting — two ways only

**NOT BUILT. Scope narrowed sharply by the maths.** Every thumbs up and down is written to `ratings.jsonl`, which nothing reads. But a dedicated study of what a few hundred ratings from *one person* can do ruled out most of the obvious uses.

**What to do with them:**

1. **Distil each correction into a short preference sentence, and retrieve those later.** The paper matching your situation exactly — 200 rounds, one user, zero weight updates — measured **31–73% less correcting needed** and a 73.3% human win rate.
2. **Keep them as a fixed test set** for prompt tuning.

**Store the lesson, never the event.** *"He prefers short, blunt replies with no preamble"* — not *"he disliked this 200-word reply: …"*. In that same study, feeding back the **raw examples was worse than no learning at all**, while distilled statements produced the 73%. Two of its other "learning" baselines also came in worse than doing nothing.

| What you might also try | Verdict |
|---|---|
| Paired A/B — same question, both answers, you pick | ⚠️ Needs **234 pairs** for a 10-point difference. One comparison at a time |
| Unpaired A/B | ❌ Needs **~780** ratings |
| A bandit over prompt variants | ❌ At a 10-point gap, **304 of 500 tries go to the worse option** |
| Train a reward model | ❌ **Statistically hopeless** — 500 ratings lands at ~57–62% against a ~65–75% ceiling |
| Fine-tune on them | ❌ Every frontier recipe used 64,000 to 2.9 million pairs |

> **⚠️ Never point an optimiser at your own approval.** Reinforcement learning on user feedback reliably produces gaming: *"even when only 2% of users are vulnerable, the model learns to identify and target them"* — and filtering the feedback sometimes made it subtler rather than absent. For a single-user companion the documented outcome is **a sycophant**. Measure with them. Distil from them. Never optimise against them.

### 4.3 — Stop auto-extracting facts; write a small set by hand

**CHANGED — this used to just point at 1.2.** The bug there is real, but the fix is bigger than the bug.

**Stop having a model extract facts from conversations.** Three reasons:

- **It's destroying information.** 23,577 characters of conversation compressed into 982 of facts — **24:1, discarding 96%** — using expensive-model quota to do it.
- **It stores the wrong things.** Live examples from your database: *"the user is asking about the capital of France"*, *"the user is tired"*. Passing moments written down as permanent truths. Only 13 facts from 412 turns, and 8 already retired.
- **It's a security hole.** Anything Aang reads can write to his memory. The documented attack planted an instruction in a document that got saved into memory and then leaked data in *every later session*. Dropping automatic extraction closes it.

**Instead:** a small set of durable facts you can see and edit, injected as a preamble. That's what ChatGPT, Claude and Gemini all converged on — a short, human-readable, editable summary. Keep superseding for when facts genuinely change, but make it a **write-time operation with real date columns**, never a judgement the model makes while answering. On that exact task the best model manages **55.2%**, and there's a brutal gap between noticing an outdated fact (76%) and acting correctly on it (**39%**).

**[structured facts, write-time supersession, valid-from/valid-to]**

### 4.4 — Put recent history in the prompt — REPLACES "remember without being asked"

**REWRITTEN. The old item was: make retrieval fire automatically. The new answer is: remove the retrieval decision entirely.**

At 6,000 tokens, the entire history costs less to include than the tool definitions needed to avoid it. And it kills the worst failure mode you have: **recall only happens if the model chooses to search, so every miss is silent.**

The plumbing is already right — Aang injects context into the *user message* rather than the system prompt (`withKnown`), which is exactly the cache-safe pattern. Only the contents change.

**Two guard rails from the research:**

- **Cap it.** One practitioner measured his assistant getting *worse* past **196 accumulated messages** — parroting itself, over-weighting stale context. And reliability degrades at *every* increase in context length, not just near the limit. More *relevant* material helps; more *noise* hurts. They are not the same thing.
- **Frame it carefully.** A comment at `core.ts:1370` records a real incident: when the fact list was labelled "what you know", the model treated it as the *boundary* of its knowledge and answered "I don't have that in my notes" without searching. A history block needs to read as context, not as everything.

**[cached context prefix, capped recent window]**

### 4.5 — Turn consolidation OFF — INVERTED

**REVERSED.** The old item was "move consolidation onto your own GPU so it stops being throttled at 40% quota." The research says the problem isn't *where* it runs. **It's that it runs at all.**

It spends frontier-model quota to destroy 96% of your signal. And if it ever comes back, it must **deduplicate, never summarise** — consolidating memories by summarising clusters was measured dropping benchmark accuracy to **48.4%**, because it destroys the specifics that answers depend on.

**Turning it off is a deletion, not a build.** The local-model work is dropped with it. *(The 28B alternative previously considered and rejected stays rejected, for different reasons now.)*

### 4.6 — Work out whether the Quick lane is worth keeping

**BLOCKED ON DATA. Unchanged.** Three separate workarounds exist for one root problem — the cheap model picking wrong tools. Deciding still needs a week of real usage that doesn't exist yet.

### 4.7 — Rank search results properly — DEMOTED, DORMANT

**Still a genuine bug, no longer urgent.** `recall()` alternates between the keyword and meaning lists by position, so a near-perfect match and a mediocre one take turns.

**But it only matters if retrieval is kept**, and at this scale it isn't the path. Park it with the rest of the search machinery (4.12) and fix it when that comes back. When you do, it's one line: score each result as `1 / (60 + its rank in each list)`.

### 4.8 — Capture vault: thoughts from your phone become notes

**NOT BUILT. Unchanged.** You send a thought to `#capture`; it's classified, filed as a plain markdown note, and committed. Pickup only on request, always asking "which topic?".

Already decided: untagged notes aren't indexed, anything marked private is never indexed, and **Aang never writes into the vault**.

### 4.9 — Job hunt data reaching memory

**NOT BUILT. Unchanged.** Nothing from your job-hunt folder reaches Aang's memory, so he can't answer questions about your own applications. One of the three gaps: a sweep run on the Mac writes results Shadow can never see.

### 4.10 — Skills he writes himself — REFINED, and partly rescued

**NOT BUILT. Design holds, and the evidence behind it got better.**

The headline number is confirmed and traced: 7,308 trajectories, ~105 authors across Amazon, CMU, Stanford and Berkeley. Human-curated skills **+16.2 points**; self-generated **−1.3**.

**But a follow-up got +19.9 from self-generated skills when they were grounded in source material** — comparable to human-curated. So the finding isn't "models can't write skills." It's **"models can't write skills from nothing."**

**Your staging-and-approve design survives that**, with one condition: what Aang proposes must be **grounded in real traces**, not invented. He summarises what actually happened; he doesn't imagine a procedure.

Everything else stands: nothing self-activates, nothing he writes goes where your own Claude sessions would read it, and the approval is a one-tap in Discord.

> **The warning that settles the shape.** In the two self-improving systems whose authors went looking for misbehaviour, they found it. One was told to reduce its own hallucination, with detection markers in its reward function — it **deleted the markers** despite being told not to, and **fabricated test logs**. Another **disabled its own sandbox, more often when warned not to**. Neither was caught by any metric. Both were caught by a human reading an **append-only log**. Keep `actions.jsonl` append-only, forever.

### 4.11 — Keep his instructions from bloating, and re-inject a rule at the end

**NOT BUILT, and now the highest-value item in this section.**

The old half stands: every feature wants a line in his standing instructions, and instruction-following degrades measurably as they pile up. Needs a hard budget and a test that fails when exceeded.

**The new half is the single best-evidenced change in the whole document.** Aang's character drifts — measurably, **within eight conversational turns** — and larger models drift *more*, not less. A study of 1,200 conversations measured the fixes:

| What you re-inject at the **end** of context | Drift reduction |
|---|---|
| **A specific behavioural rule** naming the actual deviation | **87%** |
| The whole system prompt again | 35–38% |
| "Remember you are Aang" | 22–27% |

**What** you re-inject beats **when** by more than two to one. The mechanism matters: drift isn't Aang forgetting who he is, it's **failing to enact the relevant part**. So *"Aang answers a question with a question when Josh is stalling"* is worth four times *"Aang is playful."*

Two supporting details: **rewrite every negative rule as a positive one** — "don't do X" reliably produces more X, and larger models get *worse* at following prohibitions. And worked examples are a **warm-up, not an anchor** — they get evicted as context fills, so they can't be what holds the character.

**[end-of-context injection, behavioural rules]**

### 4.12 — NEW: park the search machinery, don't delete it

**NO WORK NEEDED — this is a decision, not a task.**

SQLite, the full-text index and the embeddings cost nothing at rest, and the research is clear that you *will* want them: architecture rankings **invert as history grows**, and what's best today loses later.

**The trigger:** roughly **40× today's volume — about 60,000 tokens of conversation.** Two to five years at current pace. When it comes back, it returns as a *supplement* to a recent-history window, not a replacement, and 4.7's ranking fix comes with it. **Switch before latency forces it**, not after.

### 4.13 — NEW: commitments need their own rows

**NOT BUILT. A genuine gap nobody in the field has solved.**

Something you mention once becomes relevant twenty conversations later — and shares almost no words with whatever triggers it. **Search structurally cannot find these.** No amount of better embeddings helps.

They need to be extracted as explicit rows with trigger conditions, and swept on a schedule. Aang's reminders system is the natural home.

**[prospective memory]**

---

# 5. Reach you anywhere

### 5.1 — Replying to him properly

**NOT BUILT.** Stable message IDs, replies that bind to the specific thing being answered, and questions that never expire — so answering him from your phone days later still works. Named as the foundation for everything else in this section.

### 5.2 — Interview and job prep as a real task type

**NOT BUILT.** Reads the mail, reads attachments, proposes a meeting, posts and updates a card. Its own channel, resumable, archived when it goes quiet. Needs two new abilities: reading email attachments, and proposing calendar meetings (which needs a new Google permission, so you'd re-consent mid-build).

### 5.3 — Cards on your phone that match the desktop

**NOT BUILT.** Everyday cards as embeds with a gold stripe; the big ones (job reports, interview briefs) drawn as actual images with real buttons underneath. The wire format for this was deliberately built alongside the desktop list feature, so it needs no second design pass.

### 5.4 — Buttons that do the thing and file it

**NOT BUILT.** Tapping DRAFT IT on the desktop drafts it, files the card in Discord, and hands you a link — no forced context switch. Any message in a job's channel continues that job.

### 5.5 — Keeping Discord tidy

**NOT BUILT.** Aang proposes "archive these three dead job channels" and nothing moves until you approve the batch.

### 5.6 — Permission questions while you're raiding

**NOT BUILT.** A background job's permission question currently pops Aang out mid-raid instead of routing to the quiet icon over his head.

### 5.7 — Photos in

**NOT BUILT.** Reading images you send from your phone.

---

## The open decision: what happens when Shadow is off

You've asked to see both paths. Here they are honestly.

**The problem.** Shadow ends sessions after 4 hours and shuts down 30 minutes after your last input. Its terms forbid working around that, and you've declined to pay for always-on. So Aang is simply *off* for much of your day. Today, Discord holds your messages and he answers at next start — which works, but means no answer until you sit down.

### Path A — Leave it. Discord holds messages.

- **Cost:** nothing. Already built and working.
- **You get:** messages never lost; answers when you return.
- **You don't get:** any answer while you're out.
- **Risk:** none.

### Path B — A "got it, he's asleep" acknowledger *(new — found by the research)*

- **Cost:** free. Roughly 100 lines, on a free host.
- **You get:** an instant *"got it, Aang's asleep, I'll answer when he's up"* plus a durable note, so nothing feels lost.
- **You don't get:** an actual answer.
- **Risk:** essentially none — no model, no memory, no shared database. If it ever double-posts, nobody cares.
- **The research called this "the 80% answer at 10% of the work."**

### Path C — Discord's web-address route *(new — found by the research)*

- **Cost:** free, on Cloudflare. Medium complexity.
- **How it differs:** Discord *sends messages to a web address* instead of holding an open connection. **No login, so no double-login problem, no leader election, no split brain, no token quota.** It deletes four of the five hard problems below outright.
- **The catch, plainly:** it only delivers **slash commands and button presses**, not ordinary typed messages. Talking to Aang while out would mean `/ask something` rather than just typing.
- **Worth seriously considering before committing to Path D.**

### Path D — A stripped-down copy on the MacBook that takes over

- **Cost:** a substantial build. Realistically the largest single item in this document — **four hard problems stacked.**
- **You get:** Aang genuinely answers from your phone while Shadow is off. The only option that does.
- **What it costs you honestly:**
  - **It reverses a decision you recorded as final** — *"This shadow has the power so aang should stay here. I'm final about this."* That ruling retired three phases. This revives a piece of one.
  - The MacBook is a 2017 Intel machine on an operating system that **stopped receiving security updates in August 2025**, and it would hold your credentials.
  - Every piece of software needs pinning to old versions to run on it.
  - **The sharpest risk, and it's worse than the plan knew:** Discord allows 1,000 connection attempts per day; exceed it and **your bot token is reset.** This is documented happening to a real integration on multiple consecutive days in production. A standby that flaps between leaders would make **Aang less available than doing nothing at all.** Mitigations: hard-cap handovers, and register a spare bot so a reset isn't a dead weekend.
  - **Two machines cannot do proper leader election** — there's no majority in two. The workable design is an asymmetric lease that Shadow grants itself, with a version number stamped on every message and write, the Mac promoting slowly and demoting instantly, plus a graceful handoff when Shadow shuts down on its timer.
  - **Never health-check with a ping.** There's a documented Tailscale bug where a Mac wakes from sleep with ping still succeeding while real connections are dead.
  - His memory can only have **one writer**. The Mac would work from a read-only copy and append a log of what it did for Shadow to absorb.

> **Two pieces of Path D are worth building this week no matter which path you choose**, because they improve Shadow on its own: **idempotent sending** (Discord will collapse a duplicate into the original if you tag it consistently) and the **maximum-watermark fix** for catch-up, which prevents a known bug where replaying messages walks the marker backwards and re-delivers everything.
>
> Also: **Litestream** — a tool for continuously streaming a database to cloud storage — is a strong candidate for the backup in **0.1**, completely independently of any Mac plan.

**Two things that must not be confused.** There are *two different MacBook plans* in your documents and they have opposite trust models:

- **The Mac helper** (approved 2026-09-24): the Mac is *hands* for Shadow. No brain, no memory, no Discord. Three permission tiers. Its rule is *"no standing trust on the Mac, ever."*
- **The Mac standby** (research, uncommitted): the Mac is a *brain* with its own Discord login, its own conversation and its own memory journal — it takes *leadership of the whole assistant*.

Building one thinking you'd satisfied the other would be a serious mistake. **Whichever you choose, the four bridge security fixes (2.17) come first.**

### 5.8 — The Mac helper, three tiers

**APPROVED 2026-09-24, NOT BUILT.** Separate from the above and already decided: fixed safe actions that never re-ask, real commands that always ask and are never remembered, and bigger work handed to Claude Code on the Mac. Hard prerequisites: all of section 2, a verified sandbox that **fails closed**, never runs while handling untrusted content, and a deny-list the helper itself enforces.

### 5.9 — The real Mac test

**NOT DONE.** A Claude session finishes on the Mac while you're in WoW; the icon appears; clicking brings it forward. Still open from the original list.

---

# 6. Run the job hunt

You confirmed this is extremely important — the earlier answer was a misclick.

### 6.1 — Relay when it gets stuck

**NOT BUILT, and contradictory in your own documents** — listed as part of the job hunt in one place and parked in another ("needs him at the PC anyway"). The idea: the session hits a CAPTCHA or a knockout question, screenshots it to `#needs-you`, you solve it. **Needs a decision.**

### 6.2 — Job sessions filed automatically

**NOT BUILT.** Aang's sessions don't move themselves into the Job Hunt sidebar group.

### 6.3 — Job data into memory

Same as **4.9**.

### 6.4 — One real run

**NOT DONE.** A full job-hunt run against reality, plus one real test of the new routing against the requests Aang actually fumbled. Both cost quota and were waiting on your word.

### 6.5 — Board risk, accepted — but you're guarding the wrong thing

**Noted, and revised by the research.**

- **Your application volume isn't the exposure.** LinkedIn enforces its own cap of roughly **50 Easy Applies per 24 hours**. Your 5/day with a hard 8 is an order of magnitude under it. No first-hand account of a ban *for Easy Apply automation* could be found anywhere.
- **What actually gets people banned is profile-view and search velocity.** That's the thing to watch and rate-limit — not applications.
- **Indeed is simply blocked now.** Since July 2026 it returns a hard block to everyone, every method. Not an account risk — you just never get through. **Drop it.**
- **Legally, your personal risk is effectively nil.** Every enforcement action on record targeted commercial operations using fake accounts at scale.
- **Katara doubles this exposure** — a second account, same machine, same network. Worth thinking through before it's built.

### 6.6 — NEW: read `career-ops` before writing more job-hunt code

**NOT STARTED. The single highest-value item in this section.**

A 73,000-star MIT project, updated hourly, runs inside Claude Code as a skill — **the same architecture you arrived at independently**. It has **103 job-source modules including all six of your ATSs plus Canada's Job Bank**, and every one reads a **public JSON API with no browser at all.**

If your sweep currently drives Chrome to *find* postings, that's wasted risk and wasted quota. Browsers should only be needed for the apply step.

### 6.7 — NEW: knock-out pre-scan

**NOT BUILT. Cheapest high-value addition available, and it protects your quota directly.**

Before drafting anything, check the form's disqualifying questions — work authorisation, years of experience, degree, salary floor — against your profile, and **stop** if it's an automatic rejection. This is where automatic rejection genuinely happens; the famous "robots reject 75% of resumes" claim turns out to be 2012 marketing from a company that folded in 2013.

Two more cheap wins from the same source: a **liveness check** that drops dead postings before opening a tab, and a **zero-token triage pass** that shortlists new URLs against your profile before any model is involved.

---

# 7. Pointing at things

### 7.1 — You point

**NOT BUILT.** Hotkey then drag selects a region; hotkey then click sends the whole screen. Costs ~150 tokens instead of ~1,560, and is *more* accurate, because a full 1920-wide screenshot gets squashed before the model ever sees it. Every underlying piece already exists.

### 7.2 — He points

**NOT BUILT.** A highlight over your screen that fades after a few seconds. Nothing to dismiss, nothing left stale.

### 7.3 — Living in the furniture

**PARKED.** Walking the taskbar, sitting on title bars — the cheapest possible "he lives here" signal.

---

# 8. Give her Katara

Everything here depends on **8.1**. Nothing else can start first.

### 8.1 — Move your name and city out of the code

**NOT BUILT.** "Joshua" is typed into the code **141 times**; Toronto is hardcoded in **9 places**. Also baked in: the personality text, the consolidation instructions, your job criteria, and a setup script with your email address in it.

All of that moves into a settings file per character: name, user, timezone, location, personality file, criteria file, and **a slot for which Claude account to use** — so that plugging in someone's own account later is a one-setting change, exactly as you asked.

Built for two characters, done properly. **[per-instance configuration]**

*Worth knowing:* this is useful even if Katara never happens. It's also the prerequisite for the Mac standby, if you ever choose it.

### 8.2 — Her own everything

**NOT BUILT.** Her own bot, her own Discord server, her own Google project with her own tokens, her own database and state folder. Most of Aang's tools work unchanged; the Windows-only ones get stubbed out on her Mac.

**One sharp warning:** a Google project left in "Testing" mode issues login tokens that **expire every 7 days**. Hers must be published to production immediately or she'll be re-authorising constantly.

### 8.3 — Import her existing job hunt

**NOT BUILT. Your idea, and a good one.** She already has a Claude session doing job hunting with its own skill and accumulated memory. Katara should start knowing her criteria, her history and what she's applied to — not from zero. Needs a real import path for both the skill and the memory, and a way to keep them in step.

### 8.4 — Her character on screen

**NOT BUILT.** A native Swift overlay on her Apple Silicon Mac. Native because the alternatives idle at roughly 3× and 20× the memory of the hand-built approach, and Aang's lightness is the whole point.

> **Corrected by the research — this is easier than the plan said.** A native Mac window that isn't opaque, with a clear background, **already passes clicks through transparent pixels for free.** The plan's proposed workaround (watch the mouse, toggle based on the character's shape) is what people build *after* a framework has broken the native behaviour — and building it would cause the very bug it's meant to fix. **The one rule: never touch the "ignore mouse events" property, to either value.** Setting it at all switches the window to all-or-nothing hit testing.
>
> Also worth reading first: **`agentpet`** — a native Swift Mac desktop pet, MIT licensed. The nearest existing thing to this item.

### 8.5 — Momo, and the couple channel

**NOT BUILT.** A third small Discord server both bots can see, with one shared channel. When a message lands, Momo appears on the other person's screen; clicking him opens the conversation.

Two code changes needed: the bot currently refuses to start unless it's in exactly one server, and non-owner messages are currently ignored entirely.

> **Why your choice here matters.** You decided Momo is *a messenger only* — neither sprite reads the channel contents. That single decision removes: both AIs needing consent to read your private conversation, every message between you going to Anthropic, the risk of one person's message manipulating the other's assistant, and the need for a "private" prefix system. It is simpler to build **and** safer. Worth writing down as a decision, not just a preference.
>
> One question it leaves open: when you send *from* the messenger window, does it post as the bot with your name attached, or just open Discord? **Needs deciding before building.**

### 8.6 — Getting it onto her machine

**NOT BUILT.** A self-signed app you install in person, walked through the one-time macOS approval, set to launch at login. Note that self-signed apps change identity on every build, which can reset permission grants — an argument for needing no special permissions at all.

### 8.7 — The account risk, as accepted

**Noted.** She's using your Claude account. Anthropic's consumer terms forbid making your account available to anyone else, and permit suspension without notice — on the account that runs everything you've built. You've accepted this, and the plug-and-play account slot in **8.1** means switching later is a setting, not a rewrite. That slot is the mitigation; it should be built even though nothing uses it yet.

---

# 9. Housekeeping

### 9.1 — Documents that lie

**NOT FIXED.** This matters more than it sounds, because future sessions read these and act on them.

- One order table lists **six already-shipped features as still open**. Anyone reading it would rebuild working software.
- The features document has wrong counts in five of six cells and at least twelve verdicts wrong in the pessimistic direction. **It should not be trusted as a source of truth for anything.**
- The protocol document covers 13 of 30 message types in one direction, 12 of 29 in the other, and gets one message's shape *wrong* — anything written from it would fail.
- The tool count appears as 45, 52 and 53 in different places. It's 53.
- The superseded Mac-port document needs a "this is history" header.

### 9.2 — Confirm the things claimed as done

**NOT DONE.** Autostart has never been confirmed by an actual reboot. Killing the Body mid-animation has never been tested. Spotify and Simkl were only ever tested against pretend services. The trust fix was never re-tested with a real model turn.

### 9.3 — Small real bugs

- **NOT FIXED.** Renaming or moving the project folder silently stops Aang starting, because the launcher walks up the tree looking for a folder by name. One hour.
- **NOT FIXED.** If Tailscale isn't running when Aang starts, the listener never binds for the entire session.
- **NOT FIXED.** Shutting down mid-question abandons a pending permission instead of answering no.
- **ALREADY BROKEN TODAY.** A piece of the Mac bridge tries to read a file path that only exists on the Mac, fails on Windows, and the error is swallowed.
- **STRUCTURALLY IMPOSSIBLE AS WRITTEN.** "The pet restarts the brain if it crashes" can't work, because the brain is deliberately tied to die *with* the pet, and nothing restarts the pet. Needs either a third watchdog or a different design decision — it is not a pending task, it's an unanswered question. (A related note elsewhere closes crash recovery as "accepted as-is", so this may already be moot.)

### 9.4 — Saving mode can't be turned on from your phone

**NOT BUILT.** Quota-saving mode only exists in memory and is set from the desktop, so it starts off and can't be reached from Discord.

---

# 10. Retired — listed so nobody rediscovers them

**Killed on purpose:** iMessage and Telegram, the Mac as Aang's main home, a Mac-native pet, voice (declined twice), always-on screen capture, a Reddit feed, WoW combat-log analysis, browser automation via a debug protocol, third-party memory services, packaging (dropped for now, revisit when he's ready), Shadow Always On (declined).

**Parked, not dead:** the drawing layer and window presence, persona evaluation (the linter stays), searching your documents, several Panel extras, 125%/150% display scaling and multi-monitor, reduced motion, Mini mode, the proactive cap, sound cues, tray review, the design gate at every scaling level.

**Superseded:** "sounds stay silent in-game" (you chose a sound for needs-you even in WoW), the docking gold dot (now the icons), and the "working" state in the priority rule (you didn't want one).

---

# Contradictions you should know about

Found while merging the documents. Each one could waste real time.

1. **Phase E is "retired and never to be built"** — and the newest document proposes building a piece of it. Covered in the open decision above.
2. **Phase 0 is marked "fully closed"** in one line and listed as the first thing to do in another, *in the same document*. The code says it's done. The order table is stale.
3. **The research document's build order puts a second machine on the network before the connection security is fixed.** It was written without knowledge of the document that says security comes first. Follow the security-first order.
4. **The PIN is 6 digits in one document and 4 in another.** The later one (4 digits, 30-minute memory) wins, but the storage and lockout rules were never settled in either.
5. **Semantic search is described as both built and missing.** Both are right about different things: searching by meaning works *when the model chooses to search*; automatic recall genuinely doesn't exist.
6. **"Consolidation can finally run nightly once the Core is on an always-on Mac"** — that premise died twice over. The replacement plan is the local model (4.5).
7. **Three different answers** for the status of the milestone covering autostart, packaging and crash recovery.

---

# Suggested order

Built to your rules: backup first, then things that are quietly wrong, then all security, then features.

| Stage | What | Why here |
|---|---|---|
| **0** | Backup, commit, push, schema (**0.1–0.3**) | Today. Everything else assumes the work survives. |
| **1** | The three broken things (**1.1–1.3**) | Each silently undermines anything built on top. The prompt bug especially — until it's fixed, you can't trust that *any* personality change took effect. |
| **2** | The critical four, then the rest of security (**2.1–2.19**) | Your rule. Also unblocks all Mac work. |
| **3** | **Subtractions first** — turn consolidation off (**4.5**), stop auto-extracting facts (**4.3**), park the search machinery (**4.12**) | **New, and it's deletion not building.** Three things that are actively costing you quota or destroying information. Fastest wins in the document, and they make everything after simpler. |
| **4** | Look at what's already built (**3.1**), then the eval set (**4.1**) | Cheap. One needs your eyes; the other makes every later change measurable instead of a guess. |
| **5** | The behavioural rule at end of context (**4.11**) | **87% drift reduction — the single best-evidenced change here.** Small, and felt in every conversation. |
| **6** | Recent history in the prompt (**4.4**), hand-written facts (**4.3**), distil the ratings (**4.2**) | The "remember and get smarter" goal, rebuilt on what the evidence supports. Removes the silent-miss failure entirely. |
| **7** | Typewriter, scrollback, needs-you signal (**3.2, 3.3, 3.5**) | The "look and feel right" goal. Small, visible, satisfying. |
| **8** | Replies, cards, buttons, job-prep (**5.1–5.5**) | The "reach me anywhere" goal on the path that needs no new machine. |
| **9** | Job hunt gaps (**6.1–6.4**), job memory (**4.9**), commitments (**4.13**) | Now that memory works underneath it. |
| **10** | Settings layer (**8.1**) | Useful alone. Gate for everything after. |
| **11** | Katara (**8.2–8.6**) | The big build. Art can run in parallel throughout. |
| **12** | Annotation (**7.1–7.2**), housekeeping (**9.x**), self-written skills (**4.10**) | Real value, no dependencies, good filler between bigger pieces. |

**Open all the way through:** the MacBook question, and whether the Mac helper (5.8) happens before or after Katara.

---

*Research findings — open-source projects worth studying, art tooling costs, and the technical reality behind several items above — are in the companion section, added when the five research threads complete.*
