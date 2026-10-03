# The local model plan

Decided 2026-09-30. Every number here was measured on this machine (RTX 2000 Ada,
15.3 GB, 256 GB/s, 70 W; AMD EPYC 4 cores, 16 GB RAM), not taken from a website or a
maker's benchmark.

Reproduce any of it:

```bash
THINK=off node tools/measure/modelrace.mjs <model>
```

```bash
THINK=off REPS=3 node tools/measure/steprace.mjs <model>
```

```bash
THINK=off node --experimental-strip-types tools/measure/voicerace.mjs <model>
```

## The one rule

**Local handles jobs up to 4 tool calls. Claude takes 5 or more.**

> **CORRECTED 2026-10-03. That line is true only with THINKING OFF, which is how Aang calls the
> model - so it was never a limit of the model, it was a limit of how we were using it.**
>
> Same model, same card, same test, one switch:
>
> | Qwen3.5-35B-A3B | 1 | 2 | 3 | 4 | 5 steps |
> |---|---|---|---|---|---|
> | `THINK=off` (as Aang runs it) | 3/3 | 3/3 | 3/3 | 3/3 | **0/3** |
> | thinking on | 5/5 | 5/5 | 5/5 | 5/5 | **5/5** |
>
> Timed on the five-step job: thinking on takes **50 seconds and calls all five tools in order**;
> thinking off takes **4 seconds, calls four, and stops before the last one** - then replies as if it
> had finished, which is the failure described below.
>
> So the five-step work currently handed to Claude CAN be done locally, for nothing, at about fifty
> seconds a job. That is a real quota saving and it needs no new model: Hermes-4-14B was raced for
> this and is not needed - it also passes five steps, but it is 8x slower and it failed the TWO-step
> job 0/5 by inventing an answer without calling a tool at all.
>
> **Not yet acted on - it changes the architecture, which is Joshua's call.** The open problem is that
> the step count is not known before the job starts, so "use thinking for 5+ steps" cannot be a rule
> decided in advance. And fifty seconds is a long time to sit in front of a bubble, so this probably
> belongs to background and proactive work rather than to a turn he is waiting on.

That line was measured three separate times. It is not a judgement call, and it must be
enforced in code, because of how the failure looks (see "The failure mode" below).

## The model

`hf.co/unsloth/Qwen3.5-35B-A3B-GGUF:UD-IQ3_XXS`, 13 GB, 100% on GPU, 47.6 words/sec.

A mixture-of-experts model: 35B of knowledge, only 3B working at a time, which is why it
is both big and fast on a small card.

### It was raced against the obvious alternatives and won

| | **Qwen3.5 35B (chosen)** | Qwen3.6 35B | Qwen3.5 9B full quality |
|---|---|---|---|
| memory | 13.2 GB | 13.2 GB | 9.3 GB |
| speed | **47.6 w/s** | 37.7 | 17.7 |
| facts found | **7/8** | 6/8 | **7/8** |
| voice clean | 5/6 | **6/6** | **6/6** |
| steps before breaking | **4** | flaky at 3 | 4, shaky |

**The newer 3.6 is not an upgrade.** Slower, found fewer facts, and it failed at 3 steps
while passing at 4, which is random rather than merely weaker. An unreliable limit is
worse than a lower one, because no line can be drawn through it.

Also raced and rejected earlier: `gemma4:12b` (vaguer on screenshots, no tool calling),
`gpt-oss:20b` (returns empty answers, thinking cannot be switched off), `Qwen3.6-27B` at
3-bit (15 GB, spills to CPU, 6.9 words/sec).

## What local owns

| job | why it qualifies |
|---|---|
| deciding what a message needs | 23/25 correct on real messages from his history |
| pulling facts out of documents | 7/8, kept 0 junk |
| reading the screen cheaply | `qwen3-vl:8b-instruct`, 4.7 s per look, free |
| one to four tool calls | 3/3 at every step count up to four |
| bulk reading of Drive documents | the actual point; see below |

## What Claude owns

| job | why |
|---|---|
| anything 5+ tool calls | 0/3 at five steps |
| every reply Joshua reads | the character is the product |
| permission and trust decisions | hostile input reaches these |
| recovering when a tool fails | small models get stuck, they do not just fail |

## The failure mode, and why the rule must be code

At five steps the model does not error, stall or apologise. **It stops partway through
and replies as if it had finished.** Three runs out of three, the same way.

That is the dangerous shape of failure: a confident report of work that did not happen.
So the handoff to Claude has to be a counted, mechanical rule, never the local model's
own judgement about whether it managed.

## The traps, all learned the hard way

- **Thinking mode costs 28x.** The same question took 78 seconds with thinking on and
  2.8 seconds off. Some models ignore `think: false` entirely (`qwen3-vl:8b` did, and
  returned an empty answer after burning its whole budget). Always use an `instruct`
  build where one exists, and always treat an empty answer as a failure rather than
  skipping it.
- **"Fits" means loads, not runs.** Check `ollama ps` for the CPU/GPU split. Anything
  within about 1 GB of the card's memory will spill onto the processor and crawl.
- **Which squeezed file matters enormously.** The same model scored 73% on one 3-bit
  build and 54% on another. Use Unsloth's dynamic (`UD-`) builds via
  `ollama pull hf.co/unsloth/<repo>:<quant>`. Ollama's own `qwen3.6:27b` is 17 GB and
  will not fit.
- **The squeeze tax lands on the wrong thing.** Published measurement: 4-bit costs 1-3%
  on simple work but 10-15% on messy multi-step work. The tests that look good here
  (facts, routing, voice) measure the part that survives. There is no fix on this card:
  the 4-bit build is 17.7 GB.
- **Fit-checker websites are wrong.** WillItRunAI said Gemma 4 12B "will not fit" at
  15.7 GB; it ran at 8.1 GB. They disagree with each other and with the card. Only
  LocalScore has real measurements, and only for three old models.

## Why any of this matters

Not for routing. Learned routers barely beat keyword rules, and they fail badly on
hostile input (injecting coding words flipped one router's decision 98% of the time).

Not for being Aang. Local voice was clean on the linter but generic in character.

**It matters for reading.** The moment Google Drive is on, there are 1,225 documents to
get through. Doing that with Claude would be enormous. Locally it is a free overnight
job, and Claude only ever sees the short version.

Until then there is nothing for it to read. His 207 messages average 28 characters
("morning", "test", "are you there?"), which is why Aang has learned only 5 facts in
414 conversations. **The documents are the unlock, not the model.**

## Safety rule

**The local model gets no tools of its own.** It reads text and writes text. Documents
can carry hostile instructions, and a reader that cannot act cannot be talked into
acting. Only its summary moves on, marked as data.

## The WoW rule

`screen.ts:83` already detects the game by process name. Wire it: **game running means
no local model loads.** The GPU belongs to WoW. Queued reading resumes on quit.

## Order

This is the last step, not the first. It needs the documents, which need Drive, which
needs the two security fixes (file reads must mark a turn tainted, and the exclusion
list must cover `Lindsay's Job Hunt` and the key stores). See `HANDOFF-2-REVIEW.md`.
