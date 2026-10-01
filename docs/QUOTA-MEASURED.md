# What Aang actually spends

Measured 2026-09-30. Every number here came from `tools/measure/quota.mjs` (the real
turn log) or `tools/measure/prefix.mjs` (live probes against the real engine). Nothing
here is an estimate unless it says so.

Reproduce:

```bash
node tools/measure/quota.mjs
```

```bash
node tools/measure/prefix.mjs
```

## The one-line version

**82% of what Aang pays at the start of a conversation is for engine tools he has
already forbidden himself from using.** Fixing it saves about 57,900 billed token
equivalents every time a new conversation starts.

## First, a mistake worth keeping

The first read of the turn log said the quick lane had zero cache reads across 24
turns, which would have meant the cheap lane was paying full price for 28k of context
every turn. That was wrong. `cacheReadTokens` was only added to the logging on
2026-09-24 and every quick-lane record predates it. The field is **absent**, not zero.
`undefined` became `0` in arithmetic and a missing measurement turned into a dramatic
finding.

`quota.mjs` now separates "measured as zero" from "never measured" everywhere, prints
coverage before any cost, and refuses to fold an unmeasured turn into a total.

**The quick lane's cache behaviour is still unknown.** 0 of its 24 logged turns carry
cache fields. Nothing below describes the quick lane.

## How billing actually works

A token is not a token. Against the base input rate:

| | rate |
|---|---|
| ordinary uncached input | 1x |
| cache write, 5 minute lifetime | 1.25x |
| **cache write, 1 hour lifetime** | **2x** |
| cache read | 0.1x |

So everything below is in **billed token equivalents**, the number that moves the quota.

### CORRECTION, 2026-09-30: the multiplier below is probably too low

Every "billed" number in this document was computed at **1.25x**. That is likely wrong,
and the real cost is likely higher.

Anthropic's prompt caching docs give a default that depends on how you log in:
**unset means 1 hour on a Claude subscription, 5 minutes on an API key.** Checked in
this repo:

- `promptCacheTtl` is **not set anywhere** in Aang's source, nor in
  `~/.claude/settings.json`, so the default applies.
- `ANTHROPIC_API_KEY` appears nowhere in the source. Aang signs in through the Claude
  desktop app's bundled `claude.exe` (`Log Aang in to Claude.cmd`), which is
  subscription auth.

So Aang is probably already on the **1 hour, 2x** default. If so:

| | at 1.25x (as printed) | at 2x (likely real) |
|---|---|---|
| the wasted one-turn write | 80,148 | **128,236** |
| total billed equivalents | 320,886 | ~417,000 |

**I cannot settle this from the turn log.** It records token counts, not the rate
applied to them, and the two TTLs produce identical token counts. Confirming it needs
either the billing page or `estimated_cache_write_usd`, which the SDK exposes but Aang
does not record.

**Two consequences.**

1. **The cold-start problem is worse than stated below, not better.** A 2x premium on a
   62k prefix is ~124k billed equivalents to say hello, not ~78k. The fix in "The fix"
   section gets correspondingly more valuable.
2. **One lever I was going to recommend is already pulled.** Switching to the 1 hour TTL
   for bursty use is not available as an improvement, because it is already the default.
   The reverse question is now the live one: for a pet used in short bursts with gaps
   over an hour, the 2x write is paid repeatedly and never read back. Forcing
   `promptCacheTtl: '5m'` would cut the write premium from 2x to 1.25x. Whether that
   helps depends entirely on how often bursts fall inside one hour, which the quick lane
   data cannot answer because it is unmeasured.

The token counts everywhere below are measured and correct. Only the billed conversions
are in doubt.

## What the turn log says

34 turns, 2026-09-20 to 2026-09-25. Only 10 carry cache data, all smart lane.

| lane | turns | measured | avg ctx | billed/turn | cache saved |
|---|---|---|---|---|---|
| quick | 24 | 0 | 28,386 | not measured | - |
| smart | 10 | 10 | 89,312 | 32,089 | 64% |

Caching is working where it is measured: 893,124 raw input tokens billed as 320,886
equivalents, a 64% saving.

The problem is the cold start. Sessions:

| start | turns | written | read | billed | |
|---|---|---|---|---|---|
| 2026-09-24 12:43 | 5 | 63,553 | 439,890 | 123,446 | |
| 2026-09-24 13:53 | 4 | 73,675 | 251,860 | 117,290 | |
| 2026-09-25 01:53 | 1 | 64,118 | 0 | 80,150 | **write never read** |

That last row is one message. It paid the 1.25x premium to build a 64k cache, then the
session ended before anything read it. 80,150 billed equivalents to answer once.

**That single wasted write is 25% of all measured spend in the log.**

The cache expires 5 minutes after the write. A desktop companion is used in short
bursts through a day, so this is the normal case, not an outlier.

## Where the 62k prefix goes

Accounted for locally, before Joshua says a word:

| | tokens | how |
|---|---|---|
| system prompt (`voice.ts`) | ~2,700 | measured |
| Aang's own 53 tools | ~5,100 | measured off the real MCP server |
| memory | ~6,000 | |
| **accounted for** | **~13,800** | |
| **unaccounted for** | **~48,000** | |

Three live probes, same tiny system prompt in each, so the only variable is tooling:

| tools given | input tokens |
|---|---|
| every built-in (what Aang loads today) | **56,822** |
| the 8 a companion might plausibly use | 10,499 |
| `Read`, `Glob`, `Grep` plus one MCP tool | **3,904** |

The gap is **46,323 tokens per cold start**, which matches the ~48k of arithmetic
almost exactly. It is the engine's built-in tool schemas.

The shipped `sdk-tools.d.ts` declares about forty built-ins. Among them:
`EnterPlanMode`, `ExitPlanMode`, `Workflow`, `CronCreate`, `CronDelete`, `CronList`,
`ScheduleWakeup`, `RemoteTrigger`, `Artifact`, `EnterWorktree`, `ExitWorktree`,
`ShowOnboardingRolePicker`, `ProposeSkills`, `ProposeGoal`, `ReportFindings`,
`SendFeedback`, `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList`, `Monitor`.

None of these mean anything inside a desktop companion.

## The part that stings

`core.ts:1083` already disallows most of them:

```
disallowedTools: [...WEB_TOOLS, ...BUILTIN_SHELL, ...BUILTIN_WRITE, ...]
```

That is `WebSearch`, `WebFetch`, every Playwright tool, `Bash`, `PowerShell`,
`BashOutput`, `KillShell`, `Write`, `Edit`, `NotebookEdit`.

**`disallowedTools` blocks the model from calling a tool. It does not stop the schema
being sent.** Aang is paying full freight, at the 1.25x write rate, on every cold
start, for the definitions of tools he has explicitly forbidden.

## The fix

`tools:` is a different switch from `allowedTools` and `disallowedTools`. It controls
what gets **loaded at all**, so the schema never enters the prefix. `lane.ts:133`
already plumbs it through as `onlyTools`; nothing uses it.

The chat lanes need `Read`, `Glob`, `Grep` from the built-ins. Everything else built-in
is either disallowed already or never referenced anywhere in Core.

Expected prefix after the change:

```
  Read/Glob/Grep      ~3,800
  Aang's 53 tools     ~5,100
  system prompt       ~2,700
  memory              ~6,000
  -------------------------
  about 17,600, against about 62,000 today
```

**About 45,000 fewer input tokens per cold start, or roughly 56,000 billed equivalents
saved every time a conversation starts.** Applied to the three cold starts in the
measured log, that is more than half of all recorded spend.

### Two things checked before recommending it

1. **Does `tools:` also filter MCP tools?** If it did, restricting it would silently
   take away all 53 of Aang's own tools. It does not. The third probe passed
   `tools: ['Read','Glob','Grep']` alongside a custom MCP server and the init message
   came back `Glob, Grep, Read, mcp__probe__canary`. The MCP tool survived. `tools:`
   restricts built-ins only.

2. **Does this contradict the 2026-09-20 finding?** `core.ts:1070` records that web
   tools must be *disallowed* rather than merely left out of `allowedTools`, because
   left out, the model still sees them, reaches for `WebFetch`, gets refused and gives
   up instead of using `look_up_web`. That finding stands and is not contradicted.
   It is about `allowedTools`, where the schema is still sent and the model can still
   see the tool. `tools:` removes the tool from the prefix entirely, so there is
   nothing left to reach for. Keep the `disallowedTools` list as belt and braces.

## Still open

- **The quick lane is unmeasured.** 24 of 24 turns have no cache data. It runs 71% of
  traffic. Its cache behaviour should be measured before anything is concluded about it.
- **Output tokens are not in the turn log at all.** No output cost appears anywhere
  above. Worth logging.
- **The 5 minute cache TTL against bursty use.** Anthropic offers a 1 hour TTL at a 2x
  write rate instead of 1.25x. For a companion talked to several times an hour, one
  write per hour at 2x beats one write per burst at 1.25x. Break-even is about 1.6
  bursts per hour. Not yet measured against real usage.
- **Which lanes beyond chat need which built-ins.** The worker lane (`core.ts:171`)
  and `look_up_web` were not probed.
