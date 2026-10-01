# Independent review of the handoff brief

Finished 2026-09-30. Every claim checked against the real code (file and line) or a real
source (URL). Where I disagree with you or with your MacBook session, I say so and show
the evidence.

## Five lines

1. Seven of your eight broken things are confirmed exactly. **Number 1.1 is wrong: the
   backup restores fine.** The real problem is that a missing database makes Aang boot
   with silent amnesia and never mention it.
2. **Two security gaps not in your brief block section 9.0**: reading a file does not mark
   a turn as tainted, and nothing in code excludes `Lindsay's Job Hunt`.
3. **Eight numbers in the brief are wrong**, including three percentages that do not exist
   in their cited papers. Everything else, including all your statistics, checked out.
4. **Do not install `jev-audit`** (1 star, 1 commit, reads your API keys, defaults to
   scanning 722 of your transcripts) and do not adopt Jev. Context editing is genuinely
   unavailable in the Agent SDK, verified against both package versions.
5. Your reversal on plain file search over an embedding index is **right and
   evidence-backed**, and steps 1 and 2 really are an afternoon, once the two security
   fixes land.

## Questions, before any of this starts

### Only you can decide

1. **When memory is missing, should Aang refuse to start, or start with a visible "I have
   no memory" state?** I lean refuse. Silent amnesia is live today and is the worst of the
   three options.
2. **Does section 9.0 still go ahead given the taint gap?** My recommendation is yes, but
   only after items 0.2 and 0.3 in the build order. If you want Drive sooner, say so and I
   will tell you the narrowest safe subset.
3. **Is closing the honesty-check hole worth a rule that could occasionally rewrite a
   correct answer?** The safe version flags instead of rewriting. Your call which.
4. **Do you want the four skills built at all this round?** They are Tier 3 and everything
   above them is cheaper and more certain.

### Needs checking on the MacBook

5. **The total size of My Drive.** You asked for this number before mirror mode goes on
   and I cannot see it from Shadow. Shadow has 74 GB free.
6. **The exact path of `Lindsay's Job Hunt`.** I have to exclude it in code and I have
   never seen it.
7. **Whether `Aang Brain/memory.txt` in Drive holds anything you want.** Nothing reads it
   here.
8. **Which cache rate your account is billed at.** This changes my cost numbers by about
   double. The billing page will say.

### Useful, but I can proceed without

9. Delete the stale hand-made `Brain/` copy once Drive is on, or keep it as an offline
   fallback?
10. Do you want the `embeddinggemma` routing experiment run? It costs zero quota and
    answers whether a local classifier is worth anything, using your own 412 turns.

---

Started 2026-09-30. Every claim checked against the real code or a real source.
Where I disagree with the brief or with the MacBook session, I say so and show why.

Status: Part 1 and the Part 9 file facts are done. Parts 2 to 8 in progress.

---

# PART 1: the eight broken things

Seven of eight confirmed. One is wrong in an important way, and one is worse than
described.

## 1.1 "The backup cannot be restored": PARTLY WRONG, and the real problem is different

**The claim is wrong.** The backup restores fine. I tested it: copied
`backups/aang.db` into an empty folder and opened it.

```
integrity   : ok
tables      : cache, embeddings, facts, journal, meta, topics, turns,
              turns_fts (+5 FTS shadow tables)
turns       : 412 rows
facts       : 13 rows
embeddings  : 391 rows
```

Restoring is one file copy. "A backup you cannot restore is theatre" does not apply.

**Three real problems, none of which the brief named:**

1. **Nothing can create a database from nothing.** I searched the whole source tree
   for `CREATE TABLE` in any casing, and for `.sql` files. There are none. So a fresh
   install on a new machine cannot work. Where the current `aang.db` came from is not
   in the repo. This matters for the eventual move to a Mac mini, not for restoring.

2. **The failure is silent, and this is the actual danger.** `memory.ts:38` reads
   `if (existsSync(file))`. If `aang.db` is missing or unreadable, `this.db` stays
   `null`, one line goes to a console nobody reads, and **Aang boots anyway with total
   amnesia and carries on talking normally.** He will not say anything is wrong. After
   the power cut during this session, that is not hypothetical.

3. `PRAGMA user_version` is 0, as claimed. Confirmed.

**My verdict:** still worth doing, still early, but the work is different. Priority
order: refuse to boot silently without memory (one hour, prevents the worst outcome),
then a restore test, then `createDatabase()` for the fresh-install case.

## 1.2 "The honesty check has a hole": CONFIRMED, and the proposed fix does not close it

`core.ts:87` is exactly `if (!did.length) return reply;`.

So when Aang did nothing at all but the reply claims he did, grounding never runs.
That is the worst case and it is the one case not covered.

**Where I disagree with the fix.** The brief says to consult `SAYS_FAILED` and
`REFUSES` on that path. That does not work. Both of those detect a reply that claims
*failure*. On the empty path the danger is a reply that claims *success*. There is
nothing in the action record to contradict it, because the record is empty.

Closing it needs a new detector: does this reply claim an action happened? If yes and
nothing was recorded, rewrite it. That is a new regex and it is the risky kind, because
a false positive rewrites a correct answer. Worth doing, but it is a day with test
cases, not an hour.

## 1.3 "Only SIGINT is handled": CONFIRMED exactly

`index.ts:17` traps `SIGINT` and nothing else. `CoreSupervisor.cs:109` calls
`child.Kill(entireProcessTree: true)`. There is also a kill-on-close job object at
`CoreSupervisor.cs:30`.

So the cleanup path that answers pending permission prompts and checkpoints the
database almost never runs. Confirmed as described.

## 1.4 "Nothing can be joined together": CONFIRMED exactly

`actionlog.ts:10`:

```ts
export interface ActionRec { ts: string; tool: string; did: string; ok: boolean; note: string }
```

No id, no `turn_id`. So "why did you do that" can only be answered by comparing clocks.
Agreed this is the highest-value observability work on the list.

## 1.5 "Crash logs are deleted, not rotated": CONFIRMED exactly

`CoreSupervisor.cs:90` is `File.Delete(logPath)` once the file passes 1 MiB.
`CoreSupervisor.cs:92` stamps lines `{DateTime.Now:HH:mm:ss}`, with no date.

Twenty minutes, as estimated.

## 1.6 "Secrets are being written to disk": CONFIRMED, but narrower than stated

The line moved. It is now `core.ts:504`, not `:481`.

What actually reaches `actions.jsonl`, via `describeCall` (`tools.ts:324`):

| leaks | detail |
|---|---|
| full shell command lines | `tools.ts:333`, truncated at 70 characters |
| text Aang PUTS on the clipboard | `tools.ts:351`, truncated at 40 characters |
| text typed into a control | `fill_control` |

**What does NOT leak, contrary to finding M10 in `PORT-TO-MAC.md:370`:** what Aang
*reads* from the clipboard. `tools.ts:342` returns the fixed string
`'read what you have copied'` with no content. M10 says "includes clipboard text",
which is true only for what Aang writes, not what he reads. Worth correcting in that
doc so the fix is scoped right.

Live exposure today is small: `actions.jsonl` holds 45 lines and one mentions a
command. The mechanism is real, the accumulated damage is not yet.

Still a security fix. Agreed it outranks the logging items.

## 1.7 "Silent gaps in logging": CONFIRMED exactly, every part

Zero `console.*` calls in all six files named:

```
discord.ts 0   jobs.ts 0   protocol.ts 0
quota.ts   0   activity.ts 0   claude.ts 0
```

(`core.ts` has 27 and `memory.ts` has 7, so the pattern is real, not a house style.)

`record()` is called from exactly one place, `core.ts:1486`, the chat path. Worker
turns produce no `TurnRecord`, confirmed.

`turns.jsonl` is appended at `core.ts:1734` with no size check anywhere. Confirmed.

## 1.8 "The M5 gate has never actually been run": CONFIRMED exactly

`tests/fakecore/supervisor.mjs` runs `taskkill /PID <pid> /T /F` against a Core that
has just started and is doing nothing, then asserts only that something is listening
again and that the pid changed. There is no mid-reply kill and no check that the
conversation survived.

The brief is right that these are two different tests wearing the same name, and right
that the honest version of the Body half is "relaunch by hand and assert the Core
resumes the same conversation", because the job object at `CoreSupervisor.cs:30`
guarantees killing the Body kills the Core.

---

# The file facts, checked on this machine (feeds Part 9)

These gate the biggest decisions in the brief, so I checked them first.

## Google Drive is already installed on Shadow, but not signed in

`C:\Program Files\Google\Drive File Stream\131.0.2.0` exists. It is **not running** and
**no Drive is mounted**. The only drive is `C:`. The only cloud folder present is
`C:\Users\Shadow\OneDrive`.

So step 1 of section 9.0 is not "install Google Drive". It is "sign in and switch it to
mirror mode". That is smaller than the brief assumes.

**I still cannot tell you the size of My Drive**, which the brief asks for before
turning mirror on. That number is only visible once signed in, or from the MacBook.
Shadow has 74 GB free on C:.

## The Brain folder already exists on Shadow, and it is a hand-made copy

`C:\Users\Shadow\Documents\Aang\Brain\` contains four files:

```
job-search.md   learned.md   profile.md   projects.md
```

The first line of `profile.md` says it plainly:

> `# Aang Brain profile (mirror of Drive > Aang Brain > profile.md)`

So the relationship the brief asks about is: **someone already hand-copied the Drive
folder onto Shadow.** The Drive original has five files (it also has `memory.txt`).

## Aang reads two of them and writes none

`memory.ts:279-280`:

```ts
profile(): string { return this.readText('Brain/profile.md'); }
learned(): string { return this.readText('Brain/learned.md'); }
```

That is the only place `Brain/` appears in the entire source tree. So:

- `projects.md`, `job-search.md` and `memory.txt` are read by **nothing**.
- **Aang never writes to any of them.** `readText` is read-only and there is no writer.

**This kills the overwrite risk.** The brief says "work out the relationship before
anything overwrites anything". Nothing can overwrite anything, because Aang has no
write path into that folder.

One correction to the data itself: `learned.md` begins
`# Learned about Joshua (auto-saved by Aang; edit or delete lines freely)`. **That is
no longer true.** Nothing auto-saves it. Whatever wrote it has been removed. The file
is hand-maintained now and the header is lying about it.

## What this means for turning mirror mode on

Mirror mode puts My Drive at a new path, something like `G:\My Drive\`. It will not
land on top of `Documents\Aang\Brain\`, so nothing gets clobbered on day one.

The problem is quieter: there will then be **two copies of the Brain files on one
disk**, and Aang will keep reading the stale hand-made one while you edit the real one
in Drive. That drift is the thing to fix, and it is a one-line change to point
`readText` at the Drive path once mirror is on.

---

## Questions from Part 1 and the file facts

**Only you can decide these:**

1. When memory is missing, should Aang refuse to start and say so on the sprite, or
   start with a visible "I have no memory right now" state? Refusing is safer. Starting
   is friendlier. I lean refuse, because silent amnesia is the worst of the three.
2. Is closing the 1.2 hole worth a rewrite rule that could occasionally rewrite a
   correct answer? The safe version flags instead of rewriting.

**Needs checking on the MacBook:**

3. The total size of My Drive. I cannot see it from Shadow and the brief asks for the
   number before mirror mode goes on.
4. Whether `Aang Brain/memory.txt` in Drive contains anything you want kept. Nothing
   reads it here.

**Useful, but I can proceed without:**

5. Do you want the stale hand-made `Brain/` copy deleted once Drive mirror is on, or
   kept as a fallback for when Drive is offline?

---

# PART 2: things you said you got wrong

## 2.1 The three skill numbers: VERIFIED, they are real papers

You asked specifically whether these came from a paper, a measurement someone ran, or
something a Claude session asserted, because you had had a decision reversed twice on
them.

They are papers.

| number | source |
|---|---|
| curated skills +16.2 | arXiv 2602.12670 |
| self-generated minus 1.3 | arXiv 2602.12670 |
| self-generated but grounded +19.9 | arXiv 2608.23417 |

So the reversal was justified. Grounded really does beat hand-written in the published
results, and your revised position (Aang may propose a skill only from evidence it can
cite) is what the papers actually support.

**One caution.** These are two different papers measuring on their own setups. The +19.9
and the +16.2 are not directly comparable to each other, and neither was measured on
anything resembling one person's desktop assistant. Treat the direction as supported and
the magnitudes as not transferable.

## 2.3 Observability sizing: specs check out, sequencing argument is right

Langfuse does ask for roughly 4 cores and 16 GiB with a mandatory ClickHouse. On a
4 vCPU / 16 GB box also running WoW, that is the whole machine. Phoenix is a single
process with SQLite at 1 to 2 GiB, Elastic License 2.0, free to self-host.

**I agree with your reframing and would go further.** "A viewer over unjoinable data is
still unjoinable data" is exactly right, and 1.4 is confirmed: `ActionRec` has no id at
all. Do 1.4 first. After that my honest read is that Phoenix is still not worth a second
database and a Python process surviving six restarts a day, for one user. The
`aang why <turn_id>` command gives you the answer you actually want, where you already
are.

## 2.4 No LLM judge: CONFIRMED, with one correction to your number

JudgeBench is real (arXiv 2410.12784, ICLR 2025) and **50.86% is the exact figure in the
paper.**

**But it is not "a strong judge."** 50.86 is a vanilla-prompted GPT-4o, the weakest
frontier configuration in that table. In the same table Claude 3.5 Sonnet scores 64.2,
o1-preview 75.43, o3-mini (high) 80.86.

So the claim as written is attackable. Say "a vanilla GPT-4o judge scores at chance" and
it is solid. The decision does not change.

On the style tripwire your reasoning is correct: `embeddinggemma` is a semantic embedder,
so distance from it measures topic, not voice. Ranker not gate, agreed.

---

# PART 3: how to know whether a change helped

**Every claim in this section checked out.** This is the most solid part of the brief.

| claim | verdict |
|---|---|
| ICML 2025, 95% interval gets 92.5% real coverage at n=100 | CONFIRMED verbatim, arXiv 2503.01747 |
| Anthropic clustered vs naive standard errors differ 3.05x | CONFIRMED, arXiv 2411.00640 Table 4 |
| AI Agents That Matter, calling more raises accuracy | CONFIRMED, arXiv 2407.01502 |
| Opus 4.5 CORE-Bench 42% to 95% by fixing the eval | CONFIRMED, Anthropic's own post |
| `claude plugin eval` runs each case with the change removed | CONFIRMED |
| it runs each case 3 times by default | CONFIRMED |
| graders: regex, tool_used, tool_order, file_exists, llm, baseline | CONFIRMED, exactly those six |
| Wilson over Wald at small n | CONFIRMED, Brown/Cai/DasGupta 2001 |

**Both your arithmetic claims are exactly right**, which I had computed rather than
trusted:

- Wilson interval for 24/30 is **62.69% to 90.49%**. Your "roughly 63% to 90%" is
  accurate. The wrong interval (Wald) gives 65.69% to 94.31%: narrower and shifted up.
- Six discordant pairs all one way gives two-sided p = 2 x (1/2)^6 = **0.03125**, which
  clears 0.05. Five gives 0.0625, which does not. **Six is indeed the minimum.**

One extra number worth having: at n=30 and a true 90% score, the Wald interval achieves
only **80.9% actual coverage** against a nominal 95%. That is the concrete reason to
report counts.

**Where the 3.05x needs care:** that is the worst case in Anthropic's table (DROP).
RACE-H is 1.10x. "Roughly 3x" is the ceiling, not the typical case.

---

# PART 4: what Aang cannot do

## 4.3 "Paying full price for context": the answer to your direct question is NO

You asked whether context editing is still unavailable in the Agent SDK.

**Still true, and this was checked properly rather than recalled.** Both the pinned
0.3.278 and the current 0.3.285 tarballs were downloaded and grepped:

```
context_management / contextManagement    0 hits
clear_tool_uses                           0 hits
memory_20250818                           0 hits
```

The only `context_management` string in the package is in `bridge.mjs`, set to `null`
inside a response constructor. The SDK never sends one. Corroborated by an open,
unanswered tracking issue (claude-agent-sdk-python#581).

**The memory tool is also unavailable**, same check, zero hits.

### The 84% does not transfer, and you should not plan around it

The announcement is real. Exact wording: *"In a 100-turn web search evaluation, context
editing enabled agents to complete workflows that would otherwise fail due to context
exhaustion, while reducing token consumption by 84%."*

That is an **unpublished internal eval**, on a **100-turn web-search agent**, whose runs
**would otherwise have run out of context**. It is the best case for the mechanism. Your
60-turn workers that finish inside the window would save far less, possibly nothing.

**So this item is not "the cheapest item here" and it is not "about a day."** It is not
available at all without abandoning the Agent SDK harness. I would drop it.

### What is available instead, and it is better

1. **`getContextUsage()` is already in your pinned version.** It returns token
   attribution by tool, skill, agent and message. That is the instrument for finding
   where the 60 turns actually go. Measure before optimising.
2. **The prefix fix I measured** (see `QUOTA-MEASURED.md`): about 46,000 input tokens
   saved per cold start, three lines, verified safe. That is the real version of this
   item.
3. Autocompaction exists and is configurable through settings, but only fires when the
   window fills. It is a safety net, not a spend control.

### A correction to my own earlier work

I reported the prefix saving in "billed equivalents" using a 1.25x cache-write rate.
That is probably wrong. The default cache lifetime is **1 hour at 2x on a Claude
subscription** and 5 minutes at 1.25x on an API key. Aang sets no TTL anywhere and signs
in through the desktop app, so it is probably on the 2x rate. The measured token counts
are unaffected; the cost conversion roughly doubles, which makes the cold-start problem
worse, not better. Details in `QUOTA-MEASURED.md`.

---

# PART 5: standing decisions

## 5.4 Jev: I agree with you, and the audit tool should not be installed

You asked me to install `jev-audit` and argue if the evidence disagreed. **I stopped
before installing.**

### The audit tool

| | |
|---|---|
| stars | **1** |
| commits | **1** |
| contributors | **1** (`chaseai-yt`, the vendor-adjacent author) |
| age | 10 days |
| licence | MIT |

It trips three of the four stop conditions you set:

1. **It reads credentials from the environment.** `check_connection.py` calls
   `os.environ.get` on `OPENROUTER_API_KEY` and `TYPESAFE_API_KEY`. That alone was your
   stated tripwire.
2. **Almost nobody has looked at it.** One star, one commit, one author, and that author
   has a commercial interest in the answer it produces.
3. **The install is fetch-and-execute** (`npx skills add ...`), unpinned, no checksum.
   And what installs is a *prompt*: a `SKILL.md` instructing an agent to read your files
   and write a report. A dependency audit does not cover instruction injection.

To its credit the scripts do not exfiltrate anything, and `SKILL.md` explicitly says not
to send your history to Jev.

**But the design has a structural hole its own docs admit:** the script inventories your
history and then an agent reads excerpts into its context. The exfiltration path is the
agent, not the script. `SKILL.md` says so: local files do not make this a local analysis.

Its default scan path is `~/.claude/projects`. On this machine that holds **722 transcript
files**, including this project's. Pointing it there is exactly what you told me not to
do.

**If you still want the analysis:** `history_inventory.py` is about 20 KB of
dependency-free standard library. Rewriting it locally is an afternoon, pointed at a fake
fixture.

### Jev itself

**The evidence supports your position.**

- Closed hosted API. No self-hosted option anywhere in the docs.
- Their privacy policy does commit to **no training** on your inputs. Credit where due.
- Retention is **open ended**: "as long as reasonably necessary... or otherwise in
  support of our business or commercial purposes." No fixed period, no published
  sub-processor list.
- Routed via OpenRouter, that is a **second** third party in the path.

### The "193x faster, 445x cheaper" number is a vendor number

The Tom's Hardware headline says "**claims to be**" and attributes the figures to
TypeSafe rather than verifying them. They come from TypeSafe's own launch post, which
concedes in its own words that these are "on the higher end of real world gains" and that
the evals "were made by individuals on our model capabilities team."

What was measured: **TypeSafe's own workflow evals**, deliberately chosen to contain many
independent parallel questions, against a baseline of **frontier chat models at high
reasoning effort**. Comparing a purpose-built classifier to a frontier generative model
on classification is close to a category error.

Independent re-measurement of the single-decision case, which is what routing is:
**roughly 1.7x to 25x**, not 193x. The cost advantage does look real and large. The speed
advantage for your use is single to low double digits.

**Verdict: do not adopt Jev. Do not install jev-audit.**

## 5.4b The local classifier: a more interesting answer than I expected

You asked whether a small local model on the GPU could do the routing job for free and
privately. Two separate literature searches came back, and they point in different
directions depending on **how** you use the local model. This distinction matters and the
brief does not make it.

### Using a small model the obvious way (ask it to name the tier) is bad

The closest published analogue to your exact task is a study of six-route front-door
routing (arXiv 2604.02367):

| model | accuracy |
|---|---|
| Qwen2.5-3B | 0.783 |
| **Qwen2.5-1.5B** | **0.400** |
| Phi-4-mini | 0.518 |
| DeepSeek-V3 (671B, API) | 0.830 |

Its conclusion: *"No model meets the pre-registered viable region."* A 1.5B model at 0.40
on six classes is barely above a good guess. A 41-model survey (arXiv 2607.27421) agrees:
Qwen2-1.5B aggregates 0.512, Llama-3.2-1B 0.279, Qwen2.5-0.5B 0.274.

There is also a specific trap for your installed models: **qwen3:0.6b and qwen3:1.7b are
hybrid-reasoning models.** In that survey, a 1.5B reasoning model scored **0.000** on one
dataset, not because it could not classify but because its thinking trace ate the entire
output budget before it emitted a label.

### Using the embedder you already have is genuinely strong

`embeddinggemma` plus a plain logistic regression is a different technique with much
better numbers:

- **91.45 on Banking77**, which is a **77-class** problem. Fully fine-tuned BERT gets
  93.66. A frozen 308M encoder is within about two points of a fine-tuned one.
- **About 15 ms per classification**, against roughly 300 to 1,500 ms for generating a
  label.
- **Calibrated probabilities**, which is the part that matters most. A generative model's
  self-reported confidence is not usable as an escalate-or-not threshold. Logistic
  regression `predict_proba` is.
- A Bank of England paper (arXiv 2408.03414) puts the crossover at **60 to 75 labelled
  examples per class** to beat GPT-4 zero-shot, on 2 to 4 class problems, which is your
  regime.

You have three lanes and 412 already-routed turns. That is enough labels.

### So does it beat regex plus Haiku?

**Not clearly, and I would still not replace the router.** The routing literature is
blunt about this: a 21-method comparison (arXiv 2608.23023) found *"Learned routers often
fail to beat simply always calling the strongest model"*, and that run-to-run noise of
5.37% **exceeds most reported routing gains**. A static task-type rule captured 72% of
everything available.

There is also a security reason specific to Aang. A robustness study (arXiv 2504.07113)
found that injecting math or coding keywords flipped a learned router's decision **98% of
the time**, and that on adversarial prompts the learned router sent only 4% to the strong
model, where jailbreaks then succeeded 100% of the time. For something that reads your
email, your screen and web pages, a router that quietly sends hostile input to the least
defended lane is a security regression.

**Verdict: keep regex plus Haiku.** But the offline experiment is now well supported and
costs zero quota: embed your 412 already-routed turns with `embeddinggemma`, fit a
logistic regression, and measure how often it agrees with what the current router
decided. If agreement is high you have a free, calibrated confidence signal you could use
for an "I am not sure, escalate" path, which is something regex cannot give you. If it is
low, you have learned that cheaply.

One implementation detail that is easy to get wrong: `embeddinggemma` needs a
task-specific prefix, `task: classification | query: {text}`. The retrieval prefix, or
none, costs accuracy.

---

# PART 6: what not to build

Your do-not-build list is **well supported**. But eight numbers in the brief are wrong and
should be corrected before anyone quotes them back at you.

## The list itself: I agree with all of it

| item | verdict |
|---|---|
| no paid memory service | supported, though partly by interested parties |
| no LLM judge, no style gate | supported |
| counts not percentages | supported |
| no bandits, reward models, fine-tuning | supported |
| no observability platform | supported |
| no durable-execution framework | supported |
| adopt almost no MCP | supported |
| no SSH door | your call, and a good one |

## Eight numbers to fix

| you wrote | actually |
|---|---|
| MCPTox "over 60%" | **36.5% average.** Over 60% only for weak models (o1-mini 72.8%, GPT-4o-mini 61.8%). Claude 3.7 Sonnet was the *best* performer |
| "best trigger is a job finishing" | **best was a multi-line code change (73.1%)**; program execution was third at 66.7% |
| when-to-speak "55 to 68% F1" | **roughly 52 to 66%.** Nothing reaches 68. Source is ProactiveBench, arXiv 2410.12361 |
| OpenAI briefings "retired June 2026" | **announced 17 June, retired 1 July 2026** |
| claudex-loop "2,639 stars, MIT" | **2,663 today**; LICENSE is MIT text but GitHub shows "Other" because of a credit preamble |
| LinkedIn "community ones violate ToS" | true for the **scrapers**; servers built on LinkedIn's official APIs do not violate section 8.2 |
| OSWorld 2.0 "20.6% / 54.8%" | correct, but that is the **best single agent** (Claude Opus 4.8, about 318 tool calls), not a field average |
| Brave "every AI browser analysed" | that post examined **two products**. The claim holds across Brave's wider series, not from one paper |

The three percentages matter most, because you would have been quoting a number that does
not exist, which is the exact thing you said had burned you twice.

## Where the memory evidence is weaker than it looks

All three memory numbers are confirmed, but note who published them:

- The 74.0% filesystem result is **Letta's own blog**, a vendor publishing a result that
  undercuts a competitor.
- The 6.4% LoCoMo error audit is **a Substack post by a company in the memory space**, not
  peer reviewed. It is specific and credible: 99 score-corrupting errors across 1,540
  questions, 24 speaker misattributions.
- **MemDelta (arXiv 2606.29914) is the one properly controlled study**, and it is the one
  that carries your argument: Mem0 at 72.7% against cloud RAG at 73.9%, p = 1.0, at 50x
  the write cost.

I looked for independent counter-evidence and found none. Zep and Mem0 publish mutually
contradictory numbers about each other on different models and judges.

**The conclusion is right. Lean on MemDelta, not the vendor blogs.**

## Two MCP numbers not to stack

40.55% (no auth) comes from a scan of **7,973 live remote servers**. 5.5% (tool poisoning)
comes from **1,899 open-source repos**. Different populations. Do not add them or imply
they describe the same set.

The `postmark-mcp` backdoor is **confirmed exactly**: clean through 1.0.15, a single BCC
line added in 1.0.16 on 17 September 2025, about 1,500 weekly downloads.

## On the source of all this

Chase Hannegan is a real person: former Marine Corps pilot, MBA and MS CS from Chicago
Booth, about 174K YouTube subscribers. `claudex-loop` is a genuine, well-starred repo with
a coherent method, which is more than most AI channels produce.

But the business model is audience monetisation: paid communities, a masterclass, agency
coaching with upsells. **Judge the repo on its merits and discount the claims made about
it in videos.** That is roughly what you already did by taking the method and not the
subscription.

On your specific question: **Codex CLI does work on pay-per-use API credit.** An API key
billed at standard rates needs no ChatGPT subscription. The limitation is that Codex cloud
features still require ChatGPT sign-in. So adopting the two files without a monthly fee is
achievable.

**The blind-spot caveat you asked me to be honest about:** two sessions of the same model
do share failure modes. Running the adversarial pass on a genuinely different model is the
version that works. Without Codex, the honest description is "a second opinion from the
same mind", which still catches carelessness but will not catch a shared misconception.

---

# PART 7: where Aang is already ahead

Checked, and these are real. Do not regress them.

## The hash-gated send is stronger than the brief claims

`mail.ts:1-7` is worth quoting because the design is unusually good:

> there is no send tool at all. The model can only PROPOSE a draft; a proposal becomes a
> card with buttons; and the only code path that sends is `MailService.act()`, which needs
> the id AND the hash of the exact wording on the card.

The brief says "hash-gated send". The stronger and more accurate statement is **there is
no send capability for the model to reach at all.** That is a different and better
property: not a gate the model could be argued past, but an absent tool. Keep it that way.

## Trust granularity is real and finer than described

`uia.ts:51-59` confirmed. Two independent reasons to ask every time rather than once per
app:

- **any browser**, because "the page decides what its buttons are called"
- **any risky control name**, matched against a long list covering send, pay, buy,
  delete, install, sign in, publish, agree, authorize, share, reply and more

This is genuinely finer than what ships in commercial assistants. Agreed.

## groundReply

Confirmed as described, and it is the right idea. Fix its hole (1.2) but do not weaken it.
Note the fix is harder than the brief thinks, for the reason given in Part 1.

## Proactivity restraint

The underlying study is confirmed (398 instances, 53.3 / 34.7 / 12.1). **The trigger claim
is wrong** as noted in Part 6: the best trigger was a multi-line code change, not a job
finishing. The paper's actual principle is to intervene at a task boundary, which supports
the same design, so the conclusion survives the correction.

---

# PART 8: context

- **OSWorld 2.0 numbers confirmed**, with the caveat that 20.6% / 54.8% is the **best
  single agent**, not a field average. Your design implication (bounded steps with you at
  the end, not unattended hour-long runs) is the right one and I would not change it.
- **Claude in Chrome injection numbers confirmed**, with one asterisk: 0% with full
  protections is true for Opus 5, not universally across the model family.
- **Brave's conclusion about local deployment is exactly right and worth keeping**: a
  local model reading untrusted content is as exposed as a cloud one, because the problem
  is mixing trusted instructions and untrusted content in one context. That principle
  applies directly to the Drive plan below.
- **The SDK pin**: 0.3.278 against 0.3.285. I checked what changed. **Nothing relevant to
  context, caching or token use.** Not urgent, agreed. One thing you already have at your
  pinned version: `getContextUsage()`, which reports token attribution by tool, skill and
  message.

---

# PART 9: what changes because Shadow is the brain

## 9.0 Google Drive on Shadow

### The facts, checked here

Covered in Part 1 above: Drive is **already installed** (`C:\Program Files\Google\Drive
File Stream\131.0.2.0`) but **not signed in and not mounted**. The Brain folder has
**already been hand-copied** to `Documents\Aang\Brain\`. Aang reads two of those files and
**writes none of them**, so nothing can be overwritten.

I still cannot give you the size of My Drive. That needs the MacBook or a signed-in
session. Shadow has 74 GB free on C:.

### THE SECURITY GATE: your taint rules do NOT cover file contents

You asked me to confirm whether they do, and to say what changes if not.

**They do not.** This is the most important finding in this review.

Exactly seven places in the code mark a turn as tainted:

| line | what taints the turn |
|---|---|
| `core.ts:379` | reading mail or calendar |
| `core.ts:452` | listing controls in a browser |
| `core.ts:477` | pressing or filling a control in a browser |
| `core.ts:599` | `read_window`, text off the screen |
| `core.ts:651` | sending a picture to your phone |
| `core.ts:700` | `look_at_window`, a screenshot |
| `core.ts:1017` | `look_up_web` |

**Reading a file is not one of them.**

So the protection is asymmetric. A poisoned web page marks the turn, and every later
action re-asks rather than using a remembered yes. A poisoned **document** does not. After
reading a hostile file, Aang can still act on a remembered yes: run a command, open
something, put text on your clipboard, without asking again.

Today that is a small risk, because the files on Shadow are your own and Aang only reads
what he is pointed at. **Section 9.0 is exactly what turns it into a real one**: 1,225
markdown files synced from the internet, including documents written by other people,
become a new place for hostile instructions to hide. You identified that risk yourself.
The code does not currently cover it.

**The fix is small.** File reads should set `tainted = true` the same way `read_window`
does. That is one line per read path. Note `taint.test.ts` already tests that Read and
Glob re-ask **when already tainted**, so the gating exists; what is missing is that
reading a file does not itself cause the taint.

### The second gap: the refusal list is too short

`files.ts:35` refuses reads and writes under Aang's own state folder, his database, his
undo copies, and Windows / Program Files / ProgramData. That is sensible as far as it
goes.

**It does not cover:**

- `~/.ssh` (your keys)
- `~/.claude` (your Claude credentials, and **722 session transcripts** on this machine)
- `.env` files anywhere
- browser credential stores
- **`Lindsay's Job Hunt`**, which you asked to be excluded explicitly and permanently

The last one matters most for 9.0. You gave a clear instruction about someone else's data
and there is currently no code that honours it. A folder exclusion list is the right
shape, and it should be a denylist in code rather than a line in a prompt, because a
prompt is advice and code is a rule.

### My answer on the retrieval method: you are right, and I was wrong before

You reversed your earlier instruction and said to do plain file navigation rather than
build an embedding index. **I agree, and the evidence supports you.** The controlled study
(MemDelta, arXiv 2606.29914) found a paid memory graph at 72.7% against plain retrieval at
73.9% with p = 1.0, at 50x the ingest cost. Plain search is not a shortcut here, it is the
better-evidenced option.

**On your honest-estimate question:** yes, steps 1 and 2 really are an afternoon, not the
2 to 4 days previously estimated for an indexer, **provided the two security fixes above
land first**. Aang already has `list_folder`, `Read`, `Glob` and `Grep`. Giving him a
folder is configuration, not construction.

**What failure looks like**, so you can recognise it: your own prediction is right.
Keyword search will answer "which resume mentions retention" and will fail on "which
resume felt most senior", because the second has no shared words with the document. The
signal to watch for is you rephrasing the same question three or four times and still not
getting it. That, not a hunch, is when an index earns its place.

### On the Google Docs scope (step 2)

The narrowest scope that makes the 70 `.gdoc` pointers readable is
`drive.readonly`, or `documents.readonly` if you only want Docs and not Drive listing.
**My honest read: not worth it yet.** Your important resume already exists as a real PDF
and .docx, which step 1 makes readable for free. Adding a read scope to a token that
already reaches Gmail widens what one stolen token gets. Revisit if step 1 shows you are
genuinely missing something.

## 9.1 and 9.2 The vault and the split files

Largely answered by 9.0. Two things to add.

**On the Obsidian sync-conflict worry:** it is real but narrow. Obsidian's own guidance is
that two machines editing the same vault through a file sync service can produce conflicts
when both are open at once. Since Aang **writes nothing** into the vault today, and you
would be the only writer, the conflict risk is between your MacBook and Shadow, not
between you and Aang. Keeping the vault open on one machine at a time is enough.

**On 9.2, "is the job-hunt answer reachable from Shadow?"** Once Drive is mirrored, yes.
"Which resume did I send Float" becomes answerable because the tracker, the cover letters
and the resume versions all land on this disk. Before mirroring, no. So 9.2's worry that
4.1 is "blocked until the files and the brain are on the same machine" is correct, and
9.0 is precisely what unblocks it.

## 9.3 The GPU and the Jev question

Covered in Part 5 above. Short version: **embeddings are indeed a non-issue on this
machine**, and you were right that classification is a different task from generating
facts. But the routing literature says learned routers barely beat simple rules, and
prompting a small model to name a tier scores badly (0.40 on the closest published
analogue). The one genuinely promising option is `embeddinggemma` plus logistic
regression, which is strong and calibrated, and the experiment costs zero quota. Details
and the specific trap about qwen3's thinking mode are in Part 5.

## 9.4 Voice

One honest paragraph, as asked.

The situation genuinely is different from the one you rejected. The brain is now on the
machine where your hands are on the keyboard, and Whisper plus Kokoro is fully local, so
neither the privacy objection nor the latency objection from the general case applies.
**But hands-busy is not actually your bottleneck.** Your stated goals are knowing your
stuff, doing more for you, and the job hunt. None of those are gated on being able to talk
while raiding. Speech recognition in a room with game audio playing is also the hard case,
not the easy one, and getting it wrong means Aang acts on a misheard sentence. **My read:
still no.** Dropping it unless you say otherwise.

## 9.5 The dashboard

You said you are not reversing the decision, and asked whether anything cheap gets most of
the benefit inside what exists.

**Yes, and it is already built.** `present_list` is a structured-list output tool that is
already in the tool set. The cheap version of "deliverables land in one place" is to have
skills end by producing a list or a file in a known folder, and have Aang show it. That is
a habit, not a product. The Discord card surface already gives you the phone half.

**So: no dashboard, and nothing new needs building.** Use `present_list` and a conventional
output folder.

---

# THE BUILD ORDER

Reconciled with `WHAT-IS-LEFT.md`'s rule that security comes first. Two items jump the
queue and I flag them as such, because you asked me to say if anything did.

## Tier 0: before anything widens what Aang can reach

| # | what | why | time |
|---|---|---|---|
| 0.1 | **Refuse to run with no memory**, or say so loudly on the sprite | Silent amnesia is the worst failure mode and it is live today | 1 hour |
| 0.2 | **File reads must mark the turn tainted** (`core.ts`, one line per read path) | **BLOCKS 9.0.** Without it, a hostile document is a hole the web already has a door on | 1 hour |
| 0.3 | **Extend the refusal list**: `~/.ssh`, `~/.claude`, `.env`, browser stores, and **`Lindsay's Job Hunt`** | **BLOCKS 9.0.** You gave an explicit instruction about someone else's data and no code honours it | 2 hours |
| 0.4 | **Stop writing shell commands and clipboard text into `actions.jsonl`** (1.6) | Security, and it must land before 1.4 makes the log more valuable to steal | 2 hours |
| 0.5 | **Crash-loop burst limit** (4.8) | A Core dying at 61 seconds loops forever, quietly | 1 hour |

**0.2 and 0.3 are new. They are not in your brief.** They jump the queue because section
9.0 cannot safely happen without them.

## Tier 1: cheap, high value, low risk

| # | what | why | time |
|---|---|---|---|
| 1.1 | **The prefix fix** (`tools:` in `lane.ts`) | ~46,000 input tokens saved per cold start, measured and verified safe | 30 min |
| 1.2 | **Rotate `core.log` instead of deleting, full timestamps** (1.5) | Evidence survives | 20 min |
| 1.3 | **Handle SIGTERM** (1.3) | Cleanup currently almost never runs | 2 hours |
| 1.4 | **`turn_id` on actions, and `aang why <turn_id>`** (1.4) | The highest-value observability work, as you said | 1 afternoon |

## Tier 2: honesty and recovery

| # | what | time |
|---|---|---|
| 2.1 | Close the `groundReply` hole (1.2), the real version with a claims-an-action detector | 1 day |
| 2.2 | Pending-turn journal (4.7) | half a day |
| 2.3 | Worker turns get `TurnRecord`s; logging in the six silent files; cap `turns.jsonl` (1.7) | half a day |
| 2.4 | Fix the M5 gate to test what it claims (1.8) | half a day |
| 2.5 | A `createDatabase()` for fresh installs, plus a restore test (the real 1.1) | half a day |

## Tier 3: capability, only after Tier 0

| # | what | time |
|---|---|---|
| 3.1 | Sign into Drive, mirror mode, verify size first | 1 hour |
| 3.2 | Point `readText` at the Drive Brain folder, retire the hand-made copy | 30 min |
| 3.3 | A rules file in the Drive folder describing structure | 1 hour |
| 3.4 | Four hand-written skills from real history (2.1), switched off until you approve each | 1 day |
| 3.5 | Scheduled jobs you declare (4.5) | 1 day |

## Not doing, with reasons

| | why |
|---|---|
| Jev, and `jev-audit` | closed third party, open-ended retention; the audit tool is 1 star / 1 commit and reads API keys |
| Context editing (4.3) | not available in the Agent SDK, verified against both package versions |
| Replacing the router with a local model | the literature says learned routers barely beat rules, and they fail adversarially |
| An LLM judge, or the style tripwire as a gate | JudgeBench, and the wrong distance metric |
| Phoenix or any observability platform | 1.4 gives you the answer without a second database |
| A paid memory service | MemDelta, p = 1.0 at 50x the cost |
| A dashboard | `present_list` already exists |
| Voice | not your bottleneck |
| Google Docs read scope (9.0 step 2) | widens a token that already reaches Gmail; the resume exists as PDF and .docx anyway |

---

# SECURITY REVIEW OF MY OWN CONCLUSIONS

You asked for the new attack surface each accepted item creates, and what I would fix
given one more day.

| item | new attack surface | mitigation |
|---|---|---|
| **The prefix fix (1.1)** | **Reduces surface.** Forty tools the model can no longer see or reach. The risk is the opposite one: removing a tool Aang genuinely needs, so he improvises worse | Keep the existing `disallowedTools` list as belt and braces. Roll back by deleting one line |
| **`turn_id` and `aang why` (1.4)** | The action log becomes far more valuable to an attacker, because it now correlates what you said with what was done | **This is why 0.4 must land first.** Ordering is the mitigation |
| **Drive access (3.1)** | Large. 1,225 documents become a place hostile text can hide, reaching a turn that can then run commands | Gated entirely on 0.2 and 0.3. Do not start 3.1 until both are merged and tested |
| **Skills from evidence (3.4)** | Aang writing skills is Aang expanding its own capabilities, the same shape as the settings self-escalation you flagged | Off by default, one approval per skill, and the draft must cite the sessions it came from |
| **Scheduled jobs (3.5)** | A job running unattended acts with a remembered yes and nobody watching | Scheduled jobs should start untrusted every time, never inheriting a trust decision from a live conversation |
| **Pending-turn journal (2.2)** | Writes one more file containing message metadata | Keep it in `%APPDATA%`, never the synced vault |

## What I would fix given one more day

**The file-read taint gap (0.2).** It is one line per read path, it is the difference
between "documents are safe to read" and "documents are an unguarded door", and it is the
single thing standing between you and the item you called the highest real-life value on
the list. Everything else here can wait a week. That cannot, if 9.0 is going ahead.

## Where I might be wrong

- **I could not settle which cache rate Aang is billed at.** The token counts are
  measured; the cost conversion is inferred from how Aang signs in. If you check the
  billing page and it says 5 minutes, my corrected numbers are too high.
- **The prefix fix was measured on throwaway lanes, not on Aang himself.** The mechanism
  is verified (the MCP canary survived) but I have not run it through the real Core. Test
  on the quick lane first, where the blast radius is smallest.
- **I did not probe the worker lane or the web lane** for their prefix cost. They may need
  a different tool list.
- **The `Lindsay's Job Hunt` exclusion cannot be verified from here.** I have never seen
  that folder. The path must come from you or the MacBook.
