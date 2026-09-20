# Memory: the strongest version that costs almost nothing

> Constraint from Joshua: no new subscriptions, and do not burn the weekly or session limits.
> He shares the account with his girlfriend, so quota is real.

Measured on this machine, 2026-09-20, not assumed.

## What is already here

| Asset | State | Cost |
|---|---|---|
| `aang.db` | **208 turns, 148 embeddings** (768-dim), plus `facts`, `topics`, `cache`, `journal` tables | free |
| `embeddinggemma` via Ollama | **768 dims, 42 ms warm**, 0.63 GB on GPU | free |
| `qwen3:0.6b` / `qwen3:1.7b` | 1.59 GB, **107 tok/s**, 472 ms for a short extraction | free |
| SQLite FTS5 + bm25 | already wired into `search_memory` | free |

The infrastructure for free memory is already installed. It is simply not being used: **nothing reads the
148 embeddings**, and the `facts` and `topics` tables are inert.

## The measurement that changed the design

I tested local fact extraction rather than assuming it. `qwen3:1.7b`, asked to pull durable facts from
"im building cerebro still, and aang. i play wow most nights with my girlfriend", returned:

    ["im building cerebro still", "and aang", "i play wow most nights with my girlfriend"]

Valid JSON, 472 ms, free - and useless. It split the sentence instead of understanding it. "and aang" is
not a fact. This matches what Joshua already found: the local models are awful at anything requiring
judgement.

**So: local for finding, cloud for understanding.** That split is the whole design.

## The architecture

    ┌─ FREE, never touches the API ──────────────────────────────┐
    │  embeddinggemma  ->  768-dim vector        42 ms           │
    │  SQLite: FTS5 keyword + cosine over vectors               │
    │  retrieval, ranking, dedupe, staleness decay              │
    └────────────────────────────────────────────────────────────┘
                              │  a small, relevant slice
                              v
    ┌─ PAID, but already paid for ───────────────────────────────┐
    │  the turn Joshua asked for. Aang writes memories with a    │
    │  tool call inside a turn that is happening anyway.         │
    │  Marginal cost of remembering: zero extra calls.           │
    └────────────────────────────────────────────────────────────┘
                              │  once per session
                              v
    ┌─ PAID, and tiny ───────────────────────────────────────────┐
    │  catch-up consolidation on Haiku at session start:         │
    │  read the last session, write facts, topics, open threads  │
    │  ~3k in / ~300 out. Skipped above 40% of the week.         │
    └────────────────────────────────────────────────────────────┘

### 1. Retrieval is free, forever
Every message Joshua sends gets embedded locally in 42 ms and matched against everything he has ever
said, by meaning and by keyword. **Zero API cost, zero quota, works offline.** This is the part that makes
him feel like he remembers, and it never costs anything.

### 2. Writing memories costs nothing extra
Aang writes his own notes with a tool call *during a turn that is already happening*. No second model
call, no background job. The understanding is already paid for; we just stop throwing it away.

### 3. Consolidation is the only new spend, and it is negligible
Once per session start (this machine reboots ~6x/day): read what happened last session, write durable
facts, update topics, note open threads. About 3,000 tokens in and 300 out on Haiku. Six of those a day
is a rounding error against a Max weekly allowance, and it is **skipped automatically above 40% of the
week** - the rule Joshua already set.

Local `qwen3` does a first pass to decide *whether there is anything worth consolidating at all*, so a
quiet session costs nothing.

### 4. Memory makes the bill smaller, not bigger
This is the part that is counter-intuitive and it is the strongest argument for doing it.

Without memory, a long session carries its whole history in context and every turn pays for it again.
With retrieval plus context editing, each turn carries a small relevant slice instead. Anthropic's own
disclosed evaluation: **+39% task performance with 84% fewer tokens** over 100 turns
([context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).

Memory is the cheapest thing here. Not having it is what is expensive.

### 5. Nothing new to subscribe to
Everything above is already installed and free. The other services in the plan are free tiers too:
Simkl (free, non-commercial), Watchmode (free tier), TMDB (free), GitHub (free private repos).
**No new subscription is required for any of this.**

## Guards, because remembering badly is worse than forgetting

- **Contradiction**: a new fact that conflicts with an old one supersedes it; the old one is kept with an
  end date rather than deleted, so "you used to say X" still works.
- **Staleness**: facts decay in retrieval weight over time unless re-confirmed. "He is job searching" in
  March should not outrank "he started a job" in August.
- **Anti-sycophancy**: remembered preferences must not become agreement. **Memory sycophancy** is a named
  2026 failure mode ([MemSyco-Bench](https://arxiv.org/pdf/2607.01071)) - a companion that knows what you
  like drifts into telling you what you want to hear. Joshua has asked for push-back in nearly every
  message today; a memory system that quietly erodes that would be a regression disguised as a feature.
- **Visible and deletable**: the Panel shows every fact Aang holds, with a delete on each row. If he
  cannot see it and remove it, it is not memory, it is surveillance.

## What this buys, in his words
- "the chibi is doing that thing again" resolves to the right thing, from three days ago.
- After a Shadow reboot he picks up mid-conversation instead of starting over.
- "where was I" has a real answer, across repos and sessions.
- He never has to explain twice who his girlfriend is, what CereBro is, or that he plays WoW at night.

## Cost summary
| Part | Cost |
|---|---|
| Embedding every message | **zero** - local, 42 ms |
| Semantic + keyword retrieval | **zero** - SQLite |
| Writing a memory | **zero extra** - inside a turn already paid for |
| Catch-up consolidation | ~3.3k tokens on Haiku, ~6x/day, skipped above 40% week |
| Net effect on quota | **negative** - context editing cuts far more than consolidation adds |
