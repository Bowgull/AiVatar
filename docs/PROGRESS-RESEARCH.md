# Progress bars that tell the truth: research and recommendation (2026-10-21)

The question: how does Aang show **real-time** progress, with **accurate** bars and **accurate** time left, for Claude
Code sessions, their helper agents, and CI runs?

Short answer, in four lines:

1. **Weight the bar by time, not by task count.** Today every to-do item is an equal slice. That is the Gradle mistake.
   Each item should get a slice the size of how long that *kind* of item usually takes.
2. **Learn those times from his own history** (per project, per kind of step, per CI workflow, per agent type), stored
   on disk, never guessed from the label alone and never asked of the model (models misjudge their own task times by 3-10x).
3. **Never move the bar backwards, and never fake motion during a stall.** When Claude adds steps, squeeze the rest of
   the bar instead of dropping it, and let the *time left* go up instead. When nothing has happened for too long,
   freeze the bar and say so.
4. **The wire is already fast enough** (2-14 ms measured from the mod to the Shell). The remaining work there is the
   slow tail, plus the heartbeats that stall detection needs.

Everything below explains why, with the formulas.

---

## 1. What the evidence says, briefly

**Perception research.**
- Myers (CHI '85): people want a progress indicator on long tasks even when it is inaccurate.
- Harrison et al. ("Rethinking the progress bar", UIST '07) tested nine bar shapes on 22 people.
  - Bars that **speed up towards the end** felt faster than linear.
  - Bars with **pauses near the end**, or that **slow down**, felt slowest.
  - Pauses early are forgiven. Pauses late are punished (the "peak-and-end" effect).
- Harrison, Yeo and Hudson ("Faster progress bars", CHI '10): a backwards-moving ripple on the bar made the wait feel
  about 10% shorter.
- NN/g: show percent-done for anything over about 10 seconds. If you can't estimate time, show *steps*
  ("3 of 7"). Say "about", pad the estimate, and start slow and finish fast rather than stall near the end.
- Microsoft's Windows progress-bar guidelines (the most detailed rules anyone has published):
  - Use a determinate bar for anything bounded, even if inaccurate.
  - Give each step a share proportional to how long that step usually takes.
  - Never back up and never restart the bar. **The time left may go up.**
  - Don't show a time left until it is accurate.
  - Don't sit at 99%; stay at about a third or less early on.
  - Show lack of progress: the bar must not move when nothing is happening.
  - Use yellow for "impeded or paused".

**How agents show progress today.**
- **Claude Code:** a to-do checklist (TodoWrite / Task tools), a spinner line with time spent and token count, and a
  status line fed `cost.total_duration_ms` and `total_api_duration_ms`.
- **Cursor:** since 1.2, agent-written to-do lists that it revises as it goes.
- **Codex CLI:** an `update_plan` tool with steps marked pending, in progress or completed, one in progress at a time.
  It became opt-in in Aug 2026.
- **Windsurf:** Cascade keeps a live plan file maintained by a background planning agent.
- **Devin:** a Progress tab of steps you can open into their commands.
- **Copilot coding agent:** status messages in the PR body plus a live session log.
- **None of them shows a time left.** Everyone stops at "checklist + live activity line". So Aang is not behind the
  field. It is trying to do something nobody ships, which is why the estimate needs real data behind it.

**Estimating durations.**
- **Gradle's** console percent is tasks done over tasks total, with no time weighting. Its own users complain that a
  4-minute test task counts the same as an instant resource copy, and the bar sits at 85% forever.
- **Jenkins** estimates a build as the average of its last ~3 successful builds. It is criticised for:
  - padding with failed builds;
  - ignoring parameters, so a quick run and a full run get blended (JENKINS-21099, JENKINS-63781).
- **tqdm and progressbar2** use an exponential moving average of speed. That works when every item is alike. To-do
  items are not alike, so a single pace (our median) is the wrong model.
- **Task durations are heavy-tailed, roughly lognormal** (project-management literature; software estimates fit a
  lognormal whose mean is about 1.6x its median). Two consequences:
  - average in log space;
  - once a step is late, its *remaining* time grows, so the honest time left can go up.
- **Joel Spolsky's Evidence-Based Scheduling:** keep the ratio of actual to estimated time, and run a Monte Carlo over
  it to get a p50 and p80 ship date. This is the right model for OVERALL.
- **Models misjudge their own task times.** Coding agents over-predict by about 3x (Claude) to 7-10x (GPT). Never ask
  Claude "how long will this take" and show the answer.

---

## 2. What we have, and what's wrong with it

### Our engine (claudeprogress.ts)

**Right:**
- Only real events move the bar.
- Pushed instantly.
- Working time pauses when the session is idle.
- "About" on every estimate.
- No list means no fake percent.
- One engine and one renderer for every surface.

These are good rules: keep them.

**Wrong, by the evidence:**

| What we do | Why it's wrong | Fix |
|---|---|---|
| Every to-do item is an equal slice (`done/total`) | The Gradle mistake: "commit" and "build the feature" weigh the same, so the bar races through the small ones and stalls on the big one | Slice size = expected time for that item (section 3) |
| Pace = median of *this session's* finished items, 2 min default | Nothing carries across sessions; the first item of every job has no estimate; one median for unlike items | Learned history per project and kind, shrunk towards broader averages |
| Creep goes straight to 60% of a slot, then eases and **stops at 90%** | This is "decelerate + late pause", the shape Harrison measured as *slowest*. It also looks identical to a stall, which is exactly his complaint in FINAL-AANG-BUILD ("no way to tell progress from a stall") | Time-based progress with an honest overrun curve, plus a separate stall state |
| A rewritten list **drops** the bar (with a note) | Microsoft: never back up | Squeeze the rest of the bar instead; the time left goes up and says why |
| Time left = remaining items × median − elapsed (capped) | Ignores the heavy tail: a late item shows "about 0 min" while it runs another 5 | Lognormal conditional remaining (section 3) |
| Waiting for his OK counts as working time | His lunch-length answers pollute the task durations we learn from | Stop the clock while an ask is open |
| Durations use arrival time | A batch replayed after a dropped post bunches up | Use the event's own `t` |
| Helper agents: start and end only | No liveness, no estimate; an agent dead for 20 min looks like one working | Agent tool calls as heartbeats; agent-type history for a bar |
| Tool lines ("Running the tests") have no duration | Tests and builds are the *most* repeatable thing in a session | Per-project command history gives a real sub-bar |

### His Waymark mod (build-xp)

**Why it "works well" for him:**
- **It always moves.** Elapsed versus expected, capped at 95%.
- **It has two levels:** OVERALL (the whole project) and CURRENT (the job in hand).
- **It shows concrete times** ("~42m left").
- **It covers CI**, which our engine ignores.
- **The OVERALL hours were written by a human who knows the work.** Those are good priors.

**What's wrong with it:**
- **Expected times come from regex on the label**, e.g. "P2" means 180 min and "fix" means 40 min. They never learn,
  even though `gh run list` already hands it every past CI duration for free.
- **The 95% cap and "any minute"** are the late-pause shape again. Once a job overruns, it says "any minute" forever:
  a confident lie.
- **It's purely wall-clock.** The bar fills while a session is idle, waiting on him, or dead. It cannot tell a stall
  from progress either.
- **Agent start = "first time I saw it"**, so a reload mid-run restarts the clock. **The 15 s poll** means updates
  lag by up to 15 s.
- **The roadmap is hand-ticked** ("status": "done" typed into JSON). It goes stale the moment he forgets.

**What to take from it:**
- the two-level OVERALL / CURRENT view;
- CI as a first-class job;
- human-weighted phases;
- always-moving bars when there is a basis for them;
- concrete time text.

---

## 3. The recommended model

### 3.1 Signals, ranked by what they tell us

| Signal (where it comes from) | Tells us | Used for |
|---|---|---|
| To-do list ticks (TodoWrite / Task tools / our `progress` tool, at tool START) | Structure + milestones | Bar jumps, slices, history samples |
| History on disk (section 3.3) | How long each kind of thing takes *here* | Slice sizes, time left |
| `tool.call` start/end (main loop) | What is running; per-command durations | Live line; command sub-bars; heartbeat |
| `tool.call` with `agentId` (helper agents) | The agent is alive and working | Agent heartbeat + "14 tool calls" |
| `turn.step` chunks (text/thinking/tool/input/stop) | The model is streaming right now; `stop.usage.output_tokens` | Heartbeat; "writing · 1.2k tokens" |
| `agent.spawn` / `turn.complete{agentId}` / `$.agent.list()` | Agent start, end, status (`failed`/`killed`) | Agent bars; failure colour |
| `turn.complete.durationMs`, `reason` | Exact turn length, error/abort | History; failed state |
| `session.compact` | A known pause (summarising) | "Tidying its memory" text; excluded from history |
| `session.measure` (context %) | A compaction is coming (above ~80%) | Add expected compaction time to time left |
| ExitPlanMode plan text (already in `ask.plan`) | The intended phases before any list | Provisional list; OVERALL phases |
| `gh run list` + `gh run view --json jobs` (steps with `started_at`/`completed_at`) | CI progress and every past duration | CI bars with real history |
| `classic.PermissionRequest` / asks | Blocked on Joshua, not stalled | Yellow "waiting for you"; clock stops |

**Not progress signals:**
- **Token counts:** nobody knows the total, so they are liveness only.
- **Context %:** it measures memory, not work.
- **Asking the model for an estimate:** off by 3-10x.

### 3.2 One unit: expected working time

Everything (to-do items, agents, CI steps, roadmap phases) gets an **expected duration** as a lognormal,
`(mu, sigma)` in log-milliseconds:
- the **median** is `exp(mu)`;
- the **mean** is `exp(mu + sigma²/2)`.

**Progress is time-weighted.** For a job with finished items `D`, a current item `c` with working time `e` spent on it,
and pending items `P`:

```
doneW    = sum of ACTUAL working durations of the items in D
curRem   = remaining(c, e)                       (below)
pendW    = sum over P of mean(item) × r          (r = this session's speed factor)
fraction = (doneW + e) / (doneW + e + curRem + pendW)
timeLeft = curRem + pendW
```

The bar and the time left come from the same numbers, so they can never disagree.
- A tick makes the bar jump, because `curRem` collapses to 0 and the next item starts.
- Between ticks it creeps because `e` grows.
- A heavy item gets a big slice.

**Remaining time of the current item (lognormal, conditional on it having already run `e`):**

```
z      = (ln e − mu) / sigma
median = exp( mu + sigma × Φ⁻¹( (1 + Φ(z)) / 2 ) )   // median of T given T > e
remaining(c, e) = median − e
```

- At `e = 0` this is the plain median.
- When the item runs late, the remaining time does **not** hit zero and sit there. It grows slowly, which is the
  truth for heavy-tailed work.
- The bar therefore keeps inching forward (fraction → 1 slowly) instead of slamming into a 90% wall. There is no cap
  constant to tune.
- Φ is the normal CDF (an erf approximation) and Φ⁻¹ is Acklam's approximation, about 25 lines between them. They run
  in the viewer every frame; the brain sends `(mu, sigma, r)` per item.

**Session speed factor `r`.** Once items finish, compare the actual times with their medians:

```
r = exp( sum over D of ln(actual_i / median_i)  /  (|D| + 2) )
```

The `+2` shrinks `r` towards 1, so one fast commit doesn't make the whole job look quick.
- `r` multiplies the pending medians: `mu_i += ln r`.
- This is Evidence-Based Scheduling in miniature: it learns that *today* Opus is running slow, or that this project is
  heavy.

**Time left as a range (brain-side, about once a second).**
- Run a Monte Carlo of 500 samples:
  - draw the current item from its lognormal *truncated at `e`*;
  - draw each pending item from its own lognormal (with `r` applied);
  - sum.
- Report the p50 as "about" and the p80 as the "maybe up to". 500 × 10 normal draws is microseconds.
- Section 4 says when the range is shown.

### 3.3 Learning durations from history

**What counts as a sample.** Every finished thing appends one line to `Documents\Aang\progress-history.jsonl`
(git-ignored, local only, ~100 bytes per line):

```
{ at, src: "task"|"agent"|"ci-run"|"ci-step"|"cmd"|"turn", project, kind, key, ms, model, effort, n_tools, ok }
```

- `ms` is **working time**. It excludes idle, paused, waiting on Joshua, and compaction.
- Only `ok` samples (finished, not aborted, not failed) feed estimates.
  - Jenkins pads with failures; that is the mistake to avoid.
  - Failed CI runs are kept separately, so a hung or timeout-length build doesn't poison the median.

**Stats file.** `progress-stats.json` keeps, per key:
- `n`;
- `meanLn` and `m2Ln` (Welford's running mean and variance of `ln ms`);
- the last 30 values.

It is rebuilt from the JSONL on start. Recent work matters more: use the last 30 values, or an EMA in log space with
α = 0.2.

**Keys, from narrow to broad (a hierarchy).** Pick the narrowest key with enough data, shrinking towards the broader
one:

| Source | Narrow → broad |
|---|---|
| to-do item | normalized label (lowercase, first 5 words) in project → project + kind → kind (all projects) → global |
| command | first 40 chars of the masked command in project ("npm test -- --run") → command family (`commandLabel`) → global |
| agent | subagent type + description kind → subagent type → global agent |
| CI run | repo + workflow + event type (push/PR) → repo + workflow |
| CI step | repo + workflow + job + step name |

**Shrinkage (empirical Bayes):** with parent `(mu_p, sigma_p)` and `n` samples of mean `m`:

```
mu    = (k × mu_p + n × m) / (k + n)          // k = 3
sigma = sqrt( (k × sigma_p² + n × s²) / (k + n) ),  floored at 0.35, ceiling 1.5
```

**Kind of a to-do item.**
- A small keyword table picks one of: `implement`, `test`, `build`, `research`, `review`, `commit`, `ci-wait`,
  `mockup`, `other`.
- This is wording, but it only picks the *prior*. It never moves the bar.
- It is still better than today's implicit guess that all items are equal.
- Once the item finishes, its real tool mix (edits, test runs, fetches) is logged too. A later version can re-label
  kinds from the mix instead of the words.

**Model.**
- Store `model` and `effort` on each sample.
- Keep a learned multiplier per model family against the same keys (Haiku vs Sonnet vs Opus).
- Don't split the keys by model until there are 30+ samples per family.

**Seed priors** (before any history; `sigma` = 0.9 for all):

| kind | median |
|---|---|
| implement | 4 min |
| test | 90 s |
| build | 60 s |
| research | 3 min |
| review | 2 min |
| commit | 30 s |
| mockup | 5 min |
| other | 2.5 min |

- Agents start at 3 min.
- CI starts at "no estimate" until 3 runs exist (the first poll backfills 20 past runs, so this is effectively instant).

### 3.4 Lists that change (rewrites)

When Claude rewrites its list, the model's `fraction` can drop. The display must not.

At the moment of the rewrite, remember:
- `a` = the fraction currently drawn;
- `m0` = the new model fraction.

From then on:

```
shown = a + (1 − a) × max(0, m − m0) / (1 − m0)
```

- The bar holds still for a moment, then fills the rest of the way at a pace that ends at 100% exactly when the work
  does.
- The **time left** jumps up honestly (Microsoft allows this), and the line says why once: "Claude added 3 steps",
  not "Claude rewrote its list".
- This replaces both the `rev`-drop rule and the viewer's `held` hack.

### 3.5 Stalls: telling progress from a stall

A job is **alive** while any of these arrive:
- a tool start or end;
- a `turn.step` chunk;
- a helper agent's tool call;
- an ask;
- a list change.

The mod adds a cheap heartbeat: while chunks stream, one `alive { outTok }` at most every 2 s.

The stall rule, per job, while `phase = working` and nothing is waiting on him:

```
silence = now − lastAlive
limit   = a tool is running?  max(60 s, 2 × p90 of that command's history, or 3 min if none)
          model streaming?    90 s   (API slow or retrying)
          neither?            60 s   (between steps: should be seconds)
stalled = silence > limit
```

While stalled:
- **the bar freezes**: no creep, `e` stops counting for display;
- the bar turns amber;
- the text says what we know, e.g. "No sign of life for 4 min · last: Running the tests".

The first heartbeat after a stall unfreezes the bar.

Separately:
- **Waiting for his answer** is yellow, "Waiting for your OK". It is not a stall, and it is not working time.
- **`$.agent.list()` reporting `failed` or `killed`**, or a turn ending with `reason: 'error'`, is red, the failed
  colour.

This directly answers his old note: motion now means progress, and stillness means stillness.

### 3.6 Helper agents

Each agent gets its own row:
- elapsed time measured from `agent.spawn` (the real start);
- a time-based fraction from the agent-type history, with the same `remaining()` formula;
- heartbeats from its own `tool.call`s (`agentId` set). Count them for the text: "Explore · mapping the code ·
  14 tool calls · about 1 min".

When the main loop is **blocked on a foreground agent**, the current to-do item's remaining time is at least the
agent's remaining time. Use the larger of the two.

Background agents don't block the item, so they don't feed its bar.

### 3.7 CI (GitHub Actions)

The brain gets a CI tracker. It runs where `gh` is signed in (the PC), for repos that he names or that a session
pushes to.

- **Polling:**
  - every 5 s while a run is `queued` or `in_progress` (`gh run watch` itself polls every 3 s);
  - every 60 s otherwise.
  - That is far inside GitHub's 5,000 requests per hour.
- **Backfill** the last 20 successful runs per workflow, plus their jobs and steps, once. These are the history.
- **Run bar = step-weighted.**
  - finished steps count at their actual time;
  - the running step uses `remaining()` from that step's own history;
  - pending steps use their medians.
  - It is the same formula as section 3.2, so CI looks and behaves exactly like a Claude job.
- **Queued** is its own state: "Waiting for a runner · 40 s". No bar until a runner starts.
- **Failures** come from `conclusion`. Rerun attempts are new samples only when they succeed.

### 3.8 OVERALL: the whole plan

Each project gets one roadmap file, `<repo>/.aang/roadmap.json`. It has the same shape as his Waymark `roadmap.json`:
phases, each with a human estimate in hours.

**Who keeps it current:**
- **Claude does, not Joshua.** The prompt section the mod already adds gets one more sentence: "If the project has
  .aang/roadmap.json, set a phase to running when you start it and done when it is finished."
- The brain watches the file (`fs.watch`), so the update is instant.
- When Claude shows a plan (ExitPlanMode), Aang offers to turn its numbered steps into the roadmap. That follows his
  ask-once rule.

**Calibration (Evidence-Based Scheduling):**
- Each finished phase records actual working hours against its estimate.
- The project's ratio is `R = geometric mean(actual / estimate)`, shrunk towards 1 with k = 2.

**The OVERALL numbers:**

```
overall  = (sum of estimates of done phases + estimate of the running phase × its live fraction) / sum of all estimates
timeLeft = (estimate of the running phase × (1 − its live fraction) + sum of estimates of todo phases) × R
```

- The running phase's live fraction comes from its session's job (section 3.2), matched by the phase id in the to-do
  list, or by the session's folder.
- Show the p50 and p80 from a Monte Carlo over the history of `R`, e.g. "about 6 h of build left, maybe 9".

OVERALL counts **build hours**, not calendar days. It does not tick while nobody is working on the project.

---

## 4. Display rules

**When to show a determinate bar (one that fills)**, any of:
- a to-do list with 2 or more items;
- a CI run with history;
- an agent type with 3 or more past runs;
- a roadmap.

**Otherwise show "activity-stepped" mode:**
- no percent and no fill;
- a row of small pips, one lighting per finished tool call;
- the live line and the elapsed time, e.g. "Working · 2 min · Editing bubble.js".
- Nothing spins (his rule). It moves only when something really happened.

**When to show a time left.** All of:
- (a) the estimate rests on real data: the narrowest key used has n ≥ 3, or at least one item of this job has
  finished;
- (b) the job has run at least 20 s;
- (c) it is not stalled.

Then:
- If p80 / p50 < 1.6, say "about 4 min".
- If it is wider, say a range: "4-7 min".
- If it is wider than 3x, say no number at all: "a while yet".

**Rounding** (Microsoft and NN/g: no false precision):

| time left | shown as |
|---|---|
| under 45 s | "under a minute" |
| under 10 min | whole minutes |
| under 1 h | nearest 5 min |
| 1 h and over | "1 h 15 min", to the nearest 15 min |

**Steadiness.**
- Recompute every second, but change the *words* only when:
  - the new figure differs by more than 15%;
  - or it has sat on the other side of a rounding step for 3 s.
- Update at least every 5 s.
- No bouncing.

**Never backwards:**
- The bar never decreases.
- Rewrites squeeze (section 3.4).
- Overruns crawl (section 3.2).
- Stalls freeze (section 3.5).
- **The time left may rise**, and when it jumps by more than 25% the line gives the reason once: "Claude added 3
  steps", "Taking longer than usual", "Tidying its memory".

**Early and late:**
- Before the first tick, the bar can't pass 1/3. Time weighting does this on its own; clamp as a backstop.
- 100% only on the real end (the last tick plus the turn ending, or the run's `completed`).

**Motion:**
- **Real events animate fast:** a tick fills its jump in 150-200 ms, ease-out. This is where the "speeds up at the
  end" feeling comes from honestly: every tick is a little sprint.
- **The last tick sweeps to 100%** and turns teal.
- **Creep is drawn from the model every animation frame.** No CSS tweens on width, because a 500 ms tween reads as lag.
- An optional slow, backwards-moving shimmer on a *working, not stalled* bar (Harrison '10, about 10% shorter-feeling).
  **Off when stalled**, so the shimmer itself becomes the liveness cue. Ask him; it is cosmetic.

**Text, everywhere the same (one renderer):**

```
[bar]  3 of 7 · about 6 min        ← jobs strip, rune ring tooltip, pop-out
Running the tests · npm test (40 s, usually 1 min 30 s)
2 helper agents: mapping the code (Explore, 14 calls), reviewing the diff
```

**Colours:**

| state | colour |
|---|---|
| working | the working colour |
| impeded (waiting for him, or paused) | yellow |
| stalled | amber, with the bar frozen |
| failed | red |
| done | teal |

---

## 5. Plumbing for under 150 ms end to end

Measured today: mod event to Shell socket in 2-14 ms. The data path already meets the budget. **Don't switch
transports:**
- the mod API has no WebSocket client (only `$.http.fetch`);
- loopback HTTP keep-alive costs about 1 ms;
- `socketPath` over a named pipe would save fractions of a millisecond.

The work is in the tail and in the page.

| Hop | Budget | What to change |
|---|---|---|
| Hook → post queue | < 1 ms | Nothing |
| Mod → brain (HTTP + HMAC) | < 5 ms p99 | **Take the `hello` proof off the event path.** Renew it in the background at 25 s instead of letting an expired proof add a round trip before an event. Cut `POST_MS` from 900 to 300 ms. **Keep the batch on failure** (retry once) instead of dropping it and forcing a snapshot, which loses timing. |
| Event ordering | | Add `seq` per session. When the brain sees a gap, it asks for a snapshot. |
| Brain apply + push | < 2 ms | Use the event's `t` for all clocks, not arrival time. Watch the event loop with `perf_hooks.monitorEventLoopDelay` and log when its p99 is above 20 ms (the old 2.4-3.2 s freezes would have shown up at once). |
| Brain → Shell → page | < 5 ms | Nothing (WebSocket, then IPC). |
| Page → pixels | ≤ 16 ms + ≤ 200 ms animation | No CSS width tweens; draw on the next animation frame. `backgroundThrottling: false` is already in SAFE_WEB_PREFERENCES. |

**Measure it properly.**
- Extend `AANG_PROGRESS_TRACE` with the page's paint time: the `requestAnimationFrame` after applying the message.
- Keep a rolling histogram per hop. Log p50/p95/p99 every 200 events.
- Fail the latency check if p99 from mod event to paint is over 150 ms.
- One PC, one clock, so the subtractions are exact.

---

## 6. Build list (in order)

| # | What | Why first | Effort |
|---|---|---|---|
| 1 | **Stall detection + heartbeats** (mod `alive`, agent tool calls as heartbeats, freeze + amber + text) and **the clock stops during asks** | Fixes the biggest lie ("moving = alive") with no history needed | 0.5 day |
| 2 | **Never-backwards squeeze** for rewrites and the **honest overrun curve** (`remaining()`), replacing the 90% slot cap | Removes the late-stall shape Harrison measured as slowest | 0.5 day |
| 3 | **History file + stats + key hierarchy + shrinkage**, written from tasks, commands, agents and turns (working time, `ok` only) | Everything accurate rests on this; start collecting now, since the data takes days to build up | 1 day |
| 4 | **Time-weighted fraction + time left + speed factor `r`** from the history, with the Monte Carlo range and the display rules in section 4 | The "accurate %" and "accurate time left" | 1 day |
| 5 | **Command sub-bars** (tests, builds: "40 s, usually 1 min 30 s") | Cheap, very repeatable, high value | 0.5 day |
| 6 | **CI tracker** in the brain (`gh`, backfill, step-weighted) shown as a job in the strip, rune and pop-out | Brings Waymark's best feature into Aang, with real history | 1 day |
| 7 | **Agent rows** with type history and tool-call counts; foreground agents feed the item's remaining time | | 0.5 day |
| 8 | **Plumbing tail:** background hello, `seq` + gap snapshot, keep the batch on failure, event-time clocks, event-loop monitor, paint-time trace + p99 check | Protects the < 150 ms budget | 0.5 day |
| 9 | **OVERALL** from `.aang/roadmap.json`, Claude keeping it current, calibration `R`, p50/p80 | The two-level view he likes in Waymark | 1 day |
| 10 | Optional: backwards shimmer while live (ask him first); plan-to-roadmap offer from ExitPlanMode | Polish | 0.5 day |

**Total about 7 days.** Items 1, 2 and 3 ship value on day one. Item 3 should land early because history takes days
to build up.

**Test budget** (his rule):
- unit tests on the pure math (`remaining`, shrinkage, squeeze, stall limits);
- one replay of a recorded session's events through the engine;
- one look at the real desktop.
- No live multi-session suites.

---

## 7. Where I disagree with our current design, plainly

- **"Never a guess from wording" is too strict, in the wrong place.** Equal slices are a guess too, and the worst one.
  Using wording to pick a *prior*, then correcting it with his own history, is far more accurate. Real events still
  move the bar; history just decides how far.
- **"Smooth creep capped at 90%" should go.** It is the slowest-feeling shape in the literature, and it hides stalls.
  Replace it with an honest overrun curve plus an explicit stall state.
- **Rewrites should never drop the bar.** Squeeze the rest of the bar and let the time left carry the bad news.
- **Waymark's label-regex durations should not be copied.** Copy its two-level view and its CI row, and feed both from
  history.
- **Don't put token counts or context % into the percentage.** They are liveness and memory, not progress.

---

## 8. Sources

**Perception and design**
- Harrison, Amento, Kuznetsov, Bell, "Rethinking the Progress Bar", UIST 2007: https://www.chrisharrison.net/index.php/Research/ProgressBars (PDF: https://www.chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf)
- Harrison, Yeo, Hudson, "Faster Progress Bars", CHI 2010: https://chrisharrison.net/index.php/Research/ProgressBars2
- Myers, "The Importance of Percent-Done Progress Indicators for Computer-Human Interfaces", CHI 1985 (summary): https://graphicsinterface.org/wp-content/uploads/gi1985-24.pdf
- Nielsen Norman Group, "Progress Indicators Make a Slow System Less Insufferable": https://www.nngroup.com/articles/progress-indicators/
- Microsoft, Windows UX guidelines, Progress Bars: https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars

**How agents show progress**
- Claude Code status line (cost.total_duration_ms, total_api_duration_ms): https://docs.anthropic.com/en/docs/claude-code/statusline
- Cursor 1.2 changelog (agent to-dos): https://cursor.com/changelog/1-2
- Codex CLI `update_plan` (secondary): https://codex.danielvaughan.com/2026/08/31/codex-cli-update-plan-tool-opt-in-external-planning-competing-surfaces/
- Windsurf Cascade planning: https://docs.windsurf.com/windsurf/cascade/cascade and https://docs.windsurf.com/windsurf/cascade/planning-mode
- Devin session tools / progress: https://docs.devin.ai/de/work-with-devin/devin-session-tools
- GitHub Copilot coding agent logs: https://docs.github.com/en/copilot/using-github-copilot/coding-agent/using-the-copilot-coding-agent-logs
- "Your Agents Are Not Time Aware" (agents over-predict task time 3-10x): https://www.greaterwrong.com/posts/eAbuPXbjakop5rSJx/your-agents-are-not-time-aware

**Estimating durations**
- Gradle forum on task-count percentages: https://discuss.gradle.org/t/gradle-in-particular-4-x-and-task-progress/23020
- Jenkins estimated duration issues: https://issues.jenkins.io/browse/JENKINS-21099 and https://issues.jenkins.io/browse/JENKINS-63781
- Buildkite community, estimated duration request: https://forum.buildkite.community/t/allow-an-estimated-duration-for-jobs-and-show-a-progress-indicator/2878
- GitHub REST, workflow jobs (step `started_at` / `completed_at`): https://docs.github.com/en/rest/actions/workflow-jobs
- "Built to Last or Built Too Fast? Evaluating Prediction Models for Build Times": https://arxiv.org/abs/1712.06796
- Timeout builds in CI (timeouts ~5x a normal build's length): https://rebels.cs.uwaterloo.ca/journalpaper/2024/04/08/characterizing-timeout-builds-in-continuous-integration.html
- tqdm smoothing (EMA, default 0.3) as mirrored: https://smpybandits.readthedocs.io/en/stable/docs/Environment.usetqdm.html ; progressbar2 SmoothingETA: https://progressbar-2.readthedocs.io/en/latest/widgets/smoothing-eta.html
- Lognormal task durations: https://eight2late.com/2008/03/04/on-the-inherent-uncertainty-of-project-tasks-estimates and https://thesearesystems.substack.com/p/task-estimation-conquering-hofstadters ; PMI Monte Carlo: https://www.pmi.org/learning/library/open-closed-monte-carlo-model-4892
- Joel Spolsky, Evidence-Based Scheduling: https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/

**Local (read for this note)**
- docs/COCKPIT-BUILD.md (the progress engine, C1/C2 wire format, THE PIVOT); docs/FINAL-AANG-BUILD.md ("no way to tell
  progress from a stall")
- src/Core/src/claudeprogress.ts, src/Core/src/claudelink.ts, src/Shell/pages/claudejobs.js
- claude-link/hooks/register.ts, claude-link/hooks/link.ts
- Claude Code 2.1.299 mod types (`turn.step` chunks incl. `stop.usage`, `turn.complete.durationMs`, `session.measure`,
  `session.compact`, `AgentInfo.status`, `$.http.fetch` with `socketPath`, no WebSocket client)
- Waymark build-xp mod: hooks/register.tsx, hooks/xp.ts, roadmap.json
