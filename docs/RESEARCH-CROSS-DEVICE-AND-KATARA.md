# Build a reachable Aang, then Katara

> **Status: research, not a commitment.** This is a fact-finding report (agent-researched, 2026-09-26/27) to hand to a Shadow session for planning. Joshua has not decided to build any of this yet and may change his mind on any part of it. Nothing here has been implemented or gated the way `PLAN.md`'s milestones are. Treat every recommendation as a starting point for discussion, not a spec to execute against.

**Bottom line.** Both goals can be built on the current codebase. Neither one works by copying the Core to another machine, and each depends on one shared piece of groundwork. That groundwork is a per-instance config layer, because the name "Joshua" appears 141 times, Toronto is hard-coded in 9 modules, and `memory.ts` never creates its own schema. It also needs a single-writer rule for memory, because two SQLite writers on a synced file are unsafe.

For Aang on the Mac (A), the stack runs on a 2017 Intel MacBook on Ventura, but only with version pins:
- Node 24 needs macOS 13.5 or later.
- Ollama must be pinned to 0.12.3 or older.
- Playwright must be pinned to 1.61, or pointed at the installed Chrome, because 1.62 and later ships no Chromium for macOS 13.

The Mac also needs its own Discord leadership logic, because Discord delivers every event to both processes that log in with the same token. And it runs an OS that stopped getting security updates in August 2025.

For Katara (B), the approach is:
- Use her own bot, her own server, and her own Google project.
- Put the couple chat in a third small Discord server that both bots join. Today the Core refuses to start unless the bot is in exactly one server, so that check must change.
- Build a native Swift overlay on her Mac, not Electron or Tauri.
- Use an ad-hoc-signed `.app` that Joshua installs in person.

**Top decisions:**
1. Joshua must explicitly re-open his recorded "I'm final about this" ruling before the Mac-Core is built.
2. New self-written skills should go to a staging folder, not the live skills folder.
3. The Mac-Core should stay logged out of Discord until it takes over. This is the simpler of the two options the research supports.

**Top risks:**
1. Double replies or missed messages during handover.
2. Standing-prompt bloat as capture rules, cadence rules and learned skills pile up.
3. An unpatched Mac holding tokens and browsing the web.
4. Katara on Joshua's Claude login, which the Consumer Terms forbid. This is an accepted risk.
5. Scope creep for a solo developer. There are roughly 14 phases below, and the plan says where to stop.

---

## Verified facts vs assumptions (read this first)

Throughout this report, **[repo]** means the fact was read directly from Joshua's repository (HEAD `81d106f`), **[web]** means a primary or official source fetched or quoted during research, **[snippet]** means a search-result snippet of an official page that could not be opened, and **[inferred]** means a design judgment or reasoned reading, not a sourced fact. Several official domains (playwright.dev, tailscale.com, discord.com, ollama.com, support.google.com, obsidian.md, arxiv.org) were blocked by the research proxy, so some claims rest on the projects' own GitHub source or on snippets. The claims that most need checking on real hardware are marked in the tables below.

| Claim | Status |
|---|---|
| Aang is a Node/TS Core, a C# .NET 10 Windows Body and an on-demand Panel, talking over `ws://127.0.0.1:47831/body` | [repo] `docs/PLAN.md:92-108`, `docs/PROTOCOL.md:1-6` |
| Phases C, E and P are retired; "I'm final about this" | [repo] `docs/ROADMAP.md:165-170, 413` |
| `memory.ts` opens `aang.db` only if it exists and contains no CREATE TABLE | [repo] `memory.ts:37-44` |
| Worker jobs, job-hunt sessions, and `applied.json`/`shortlist.json`/`drafts.json` are never written to memory | [repo] `core.ts:1371` is the only `saveTurn` call site |
| No contacts/people file exists in the repo | [repo] (grep). Joshua says one exists; it probably lives in `~/job-hunt-data` or the external `job-hunt` skill. **Unverified.** |
| The bot must be in exactly one Discord server or login throws | [repo] `discord-gateway.ts:29-31` |
| Two sessions with the same bot token both receive every event | [web] Discord gateway docs |
| Playwright 1.62+ has no Chromium download for macOS 12/13 | [web] Playwright source at each tag |
| Ollama ≥0.12.4 requires macOS 14 | [web] Ollama commit c68f367e |
| Node 24 x64 macOS needs ≥13.5 | [web] Node BUILDING.md |
| Ventura's last security update was 13.7.8 (Aug 2025); the 2017 MBP cannot officially run Sonoma | [web] Apple |
| embeddinggemma needs Ollama ≥0.11.10 | **Unverified** (ollama.com blocked) |
| Tailscale on Ventura works reliably after wake | **Unknown**. An open post-wake TCP bug exists on Tahoe |
| The Google app is "In production", unverified, 1 of 100 users | [repo] `docs/ROADMAP.md:61-64` |
| An unverified "In production" app keeps long-lived refresh tokens | [inferred]. Confirm in the console |
| Consumer Terms forbid making the account available to anyone else | [web] Consumer Terms, quoted below |
| A native Swift overlay reaches Windows-like memory (tens of MB) | [inferred]. No benchmark found |
| The repo has about 340 unit tests | [repo] regex count only; **not run**, because the sandbox lacked Node 24 |

---

## Aang today is a Shadow-only brain with a thin Mac bridge

The architecture was chosen by measurement:
- **The pet window** is a per-pixel-alpha layered window at **12-13 MB and 0.62% CPU**, against 153-158 MB for Electron ([docs/DECISIONS.md:8-44](docs/DECISIONS.md)).
- **The brain** runs as persistent Agent SDK lanes.
- **Memory** is one SQLite file with FTS5 plus 768-dimension embeddinggemma vectors from Ollama ([docs/MEMORY.md:20-72](docs/MEMORY.md)).

The Mac integration that exists is deliberately small ([src/Core/src/macsetup.ts](src/Core/src/macsetup.ts), [src/Core/src/hooks.ts:196-226](src/Core/src/hooks.ts)):
- Claude Code hooks on the Mac POST to the Shadow Core over Tailscale with a key.
- A Perl listener on the Mac can only bring Claude forward, or type one message into it.
- The ROADMAP still lists "The real Mac test" as not done ([docs/ROADMAP.md:57-58](docs/ROADMAP.md)).

The Shadow constraints are what make Aang forgetful and unreachable. There is a 4-hour session cap with reboots about 6x a day, "Nothing runs between sessions" ([docs/THE-PLAN.md:24-47](docs/THE-PLAN.md)), and Lite shuts down 30 minutes after the last input under terms that forbid working around it ([docs/ROADMAP.md:173-177](docs/ROADMAP.md)). The current mitigation is that **Discord holds his messages while Shadow is off and Aang answers them at next start**. `catchUp()` replays up to 50 messages per channel from a per-channel `lastSeen` stored in that Core's own `discord.json` ([src/Core/src/discord.ts:200-207](src/Core/src/discord.ts)).

### The Mac-Core is a revived Phase E and must be re-decided explicitly

The ROADMAP records **"Aang stays on the Shadow PC ... Phases C (Mac host), E (Core to the Mac) and P (Mac-native Body) are retired"**, justified by the Mac's specs ([docs/ROADMAP.md:165-170](docs/ROADMAP.md)). It adds "Retired and never to be built: C, E, P" ([docs/ROADMAP.md:413](docs/ROADMAP.md)). A standby Core that answers Discord while Shadow is off is a subset of retired Phase E. Phase E's text already specifies the right shape ([docs/ROADMAP.md:461-463](docs/ROADMAP.md)):
- Clone the repo and run the Core as a LaunchAgent.
- Keep a backup of `aang.db` on both sides.
- Treat Windows-only tools as "hands" that report "Shadow is off".
- Move secrets into the Keychain.

Retired Phase C adds a ready-made acceptance gate: **a LaunchAgent heartbeat under `caffeinate -ims` with no gap over 2 minutes across 72 hours** ([docs/ROADMAP.md:453-455](docs/ROADMAP.md)). The new scope is narrower than E: headless, with no Body, no shell, no file tools and no UI automation. The Mac's 8 GB also fits it (see below). Still, it reverses a written decision. **Joshua should record a new decision entry that supersedes the retirement for "headless standby only" and keeps C/E/P retired for everything else.**

## Part A: a headless standby that speaks only through Discord

### Recommended shape

```
                 Tailscale (TCP health checks, never ICMP)
 ┌──────────── Shadow PC (primary) ─────────────┐          ┌──── 2017 MBP (standby, lid open, AC) ────┐
 │ Body (C#)  ⇄ Core (full tools, 2 lanes)      │  GET     │ Core --role=standby (headless)           │
 │            │  Discord gateway: LOGGED IN     │ /health  │  Discord gateway: LOGGED OUT until       │
 │            │  aang.db (authoritative)        │◀────────▶│   takeover; then logs in, catches up     │
 │            │  /health {role, epoch, lastSeen}│ /yield   │  aang.db = read-only snapshot + journal  │
 │            └─ vault/ (git) ── push ──┐       │          │  tools: memory search, time, weather,    │
 └──────────────────────────────────────┼───────┘          │   WebSearch/WebFetch, Playwright on      │
                                        ▼                  │   demand (pinned), reminders             │
                           private git remote (GitHub)     │  vault/ (git) ── pull/commit/push        │
                           vault/ + job-hunt-data/ +       │  writes turns to vault/journal/mac/*.jsonl│
                           state/reminders.json            └──────────────────────────────────────────┘
                                        ▲
                      Discord (holds messages when both are off; phone push)
```

### Why the standby should stay logged out of Discord

Discord explicitly allows several sessions on the same shard, and **every session receives every event** ([discord-api-docs gateway](https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway.mdx)). If both Cores stay connected, each receives each message, both catch-up routines replay, both post a pinned deck (because `deckId` is stored per state directory), and button presses race to be acknowledged. The repo already shows that every one of those is a real code path ([repo audit §6]).

That leaves two options:
- **Keep both connected and gate every handler on a leader flag.** Takeover is fastest, but every handler must be gated, including buttons, catch-up, the morning brief, the deck, reminders and `scanApplied`.
- **Let only the leader log in.** This loses a few seconds to IDENTIFY and READY on takeover. Flapping also consumes identifies, which are capped at 1000 per 24 hours; exceeding the cap resets the token ([Discord gateway docs](https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway.mdx)).

Joshua's decision ("takes over only when Shadow is unreachable") fits the second option. **Recommendation: only the leader logs in, and message-ID dedupe is still required**, because the two Cores keep separate `lastSeen` state and a handover can replay or skip messages.

For cross-node dedupe with no shared database [inferred design], the leader marks each message it has handled with a bot reaction or a threaded reply. `catchUp` then skips any message that already carries the bot's own mark, and on a clean handback the leader passes its per-channel `lastSeen` in the `/health` payload.

### Heartbeat, not lease: what that choice costs

Joshua chose a heartbeat with no formal lease. The research supports adding the minimum that prevents split brain: an **epoch number** that a node increments when it takes leadership, and a rule that a node seeing a higher epoch steps down at once ([mac_core_intel §6], design inference, not a cited pattern).

The health check must be an **application-level HTTP GET over Tailscale TCP**. It should return the role, the epoch, the Discord gateway state, the age of the last event and `lastSeen`. A ping is not enough: an open Tailscale bug shows ICMP succeeding while TCP fails after wake ([tailscale #20859](https://github.com/tailscale/tailscale/issues/20859)).

Because Shadow reboots about 6x a day, short miss thresholds would hand over on every reboot. Proposed heuristics, all unverified:
- Heartbeat every 10 s.
- **Take over after about 3 minutes of misses.**
- **Fail back only after about 5-10 minutes** of Shadow being healthy.
- A minimum dwell time between role changes.

On failback, Shadow calls `/yield` on the Mac, waits for the Mac to confirm it has logged out, then logs in with epoch+1.

### Memory stays single-writer; the vault is the sync bus

SQLite in WAL mode needs shared memory on one host, so two Cores must never write the same `aang.db` through a sync service ([repo audit §3]). Binary databases also do not merge in git ([sync_memory_terms Q1]). The rule is **Shadow's `aang.db` is authoritative**:
1. The Mac holds a read-only snapshot, copied when it steps down, or pulled from Shadow on takeover when Shadow is reachable.
2. While leader, the Mac writes its own turns to append-only JSONL in the vault repo.
3. Shadow imports that JSONL with `saveTurn` at its next start.

Consolidation runs 20 s after start and would then pick up those turns ([core.ts:915](src/Core/src/core.ts)). **The Mac needs a schema bootstrap**, because `memory.ts` never creates tables and is simply "unavailable" without a database ([memory.ts:37-51](src/Core/src/memory.ts)).

Embeddings on Ventura need **Ollama pinned to 0.12.3 or older**, since 0.12.4 requires macOS 14 ([ollama commit c68f367e](https://github.com/ollama/ollama/commit/c68f367ef6688972de6798e631a7aa50c48af763)). That leaves a narrow and unverified window of 0.11.10-0.12.3 for embeddinggemma. The degraded path already exists: when Ollama is offline, `recall()` falls back to keyword FTS ([embed.ts:11-40](src/Core/src/embed.ts)). **Recommendation: ship Mac-Core v1 keyword-only and add embeddings only if the pinned Ollama works.**

### Warm session and "who's driving"

A long-lived streaming-input `query()` is the officially preferred long-running design. `startup()` pre-spawns the CLI and completes the handshake. `resume` works only on the same machine unless the JSONL transcript is copied ([Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions); [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript)). A cold `query()` was measured at about 12-13 s of overhead in Oct 2025, which may now be stale ([sdk-ts #34](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34)).

So the Mac-Core runs its own session. On takeover it prewarms and injects a short handoff block: the last N turns from its snapshot plus a one-line summary. The "who's driving" signal belongs in that same volatile tail of the prompt, and in the ready message ("On the MacBook. Shadow is off; no desktop tools"). The Discord deck's Status button should show the host and the epoch.

Claude CLI processes have open memory-leak reports, including 400-500 MB/min idle growth and a 16.7 GB host after 4 weeks ([#67433](https://github.com/anthropics/claude-code/issues/67433), [#86267](https://github.com/anthropics/claude-code/issues/86267)). **The Mac-Core should therefore recycle its CLI subprocess** above an RSS threshold or after N turns, then resume by ID.

### The 8 GB Intel Mac fits a headless Core if Playwright stays short-lived

Estimated resident memory:

| Component | Estimate | Basis |
|---|---|---|
| Warm Claude CLI | about 230-260 MB | [Agent SDK TS reference](https://code.claude.com/docs/en/agent-sdk/typescript) |
| Node and discord.js | about 100-200 MB | estimate, not measured |
| Headless Chrome while in use | about 300-500 MB | vendor rule of thumb, [browserless](https://www.browserless.io/blog/headless-chrome) |
| EmbeddingGemma, quantized | under 200 MB | [Google](https://developers.googleblog.com/en/introducing-embeddinggemma/) |

Playwright must be pinned to **1.61.x** (frozen Chromium 149, no browser security fixes) or use `channel: 'chrome'` with the installed Google Chrome. Chrome 151 still supports Ventura ([9to5Google](https://9to5google.com/2026/01/23/google-chrome-ending-support-for-macos-monterey-in-july-2026/)). Whether Playwright 1.62+ accepts that channel on macOS 13 is unverified ([Playwright registry @1.62](https://github.com/microsoft/playwright/blob/v1.62.0/packages/playwright-core/src/server/registry/index.ts)). Given the unpatched OS, **route ordinary lookups through WebSearch/WebFetch in the existing isolated web lane**, and launch Playwright only for pages that need a real browser.

### Keeping the MacBook awake

A closed lid forces sleep unless the Mac is in true clamshell mode (AC power, an external display and external input) or `pmset disablesleep 1` is set ([Macworld](https://www.macworld.com/article/673295/how-to-use-macbook-with-lid-closed-stop-closed-mac-sleeping.html); [lidrun](https://lidrun.com/blog/keep-mac-awake-when-lid-closed)). The recommended setup is **lid open, on AC**, with these settings. The flags are from memory; verify them with `man pmset`:
- `sudo pmset -c sleep 0 displaysleep 10 disksleep 0 standby 0 autopoweroff 0 powernap 0 tcpkeepalive 1 womp 1 autorestart 1`
- A LaunchAgent that runs `caffeinate -s` with KeepAlive.
- Auto-login, and automatic macOS updates turned off.

Leave Battery Health Management on. It holds the charge near 80% when the Mac is usually plugged in ([Apple](https://support.apple.com/en-us/102588)). Also watch a 2017 battery for swelling.

For recovery, discord.js detects zombie connections and resumes ([@discordjs/ws](https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts)), but silent hangs are reported ([#8486](https://github.com/discordjs/discord.js/issues/8486)). Add a wall-clock-gap watchdog: if the last event is older than a threshold, exit and let launchd KeepAlive restart the process.

### Reminders: one leader fires them

Reminders live in the Core's state directory ([core.ts:787](src/Core/src/core.ts)). If each node fires from its own copy, reminders fire twice or not at all. **Recommendation:**
1. Move `reminders.json` into the git-synced repo.
2. Only the leader fires reminders.
3. The leader marks each reminder fired and pushes immediately.
4. A node that takes over pulls first.
5. Reminders that came due during a total blackout (both machines off) are delivered late with a "missed at HH:MM" prefix, never silently dropped.

### Quota on a headless node

Saving mode lives only in memory and is set by the Body, so **a headless Mac-Core starts with saving off**, and Discord has no saving toggle ([repo audit §10]). Before the Mac-Core ships, the plan needs one of two fixes: persist the saving flag, or add a Discord toggle.

## Part A continued: capture, job-hunt memory and self-improving skills

### The Obsidian capture vault is plain markdown in git

Obsidian is not needed for the bot to write: a vault is a folder of markdown, and RAG tools read it straight from disk ([vault-rag](https://github.com/florianbellmann/vault-rag); [mdrag](https://github.com/orellazri/mdrag)). Obsidian is free for personal use and has been free for work use since Feb 2025 (secondary sources, e.g. [eesel](https://www.eesel.ai/blog/obsidian-pricing)). Joshua's design fits this well:
- One `#capture` channel.
- Auto-classification into chat, research or brainstorm.
- Long-running topic notes.
- A commit and push per note.
- Pickup only on request, with "which topic?" asked every time.

Git specifics:
- **Gitignore `.obsidian/workspace*.json` and `.trash/`.** The workspace file churns constantly and causes recurring conflicts ([obsidian-git #709](https://github.com/Vinzent03/obsidian-git/discussions/709)).
- Set `*.md text eol=lf` so notes do not churn between CRLF and LF across Windows and Mac.
- **The bot writes only files it owns**: a bot folder, dated appends, and frontmatter updates.
- Run `git pull --rebase --autostash` before each write and at takeover.
- On a push rejection, rebase and retry with backoff.
- On a rebase conflict, abort, write `conflict-<host>-<ts>.md`, and post to #log. Never auto-resolve.

(This is design inference built on community practice. [sync_memory_terms Q1])

Index the vault into a **separate, rebuildable `vault_index.sqlite`** per machine, never committed. Chunk by heading, key each chunk by (path, heading path, content hash), and re-embed only changed chunks. This is the pattern used by mdrag and similar tools ([mdrag](https://github.com/orellazri/mdrag)).

Classification and the save decision should run on the Quick lane. Substantive web lookups are saved as research notes with their source URLs. Content fetched from the web is stored as untrusted data and never becomes instructions.

### Job-hunt memory: close the three gaps the audit found

The job hunt runs as the external `job-hunt` skill in Claude Code sessions that Aang starts and follows through hooks. It is **not** run by the `do_task` worker, which was dropped as a fallback because it "has no Claude in Chrome" ([core.ts:1158-1162](src/Core/src/core.ts)). The trigger for indexing should therefore be the followed session's `Stop`/`SessionEnd` hook, plus the existing 60-second `applied.json` mtime poll ([discord.ts:165-171](src/Core/src/discord.ts)), rather than a "worker job".

Three gaps:
1. **Nothing in `~/job-hunt-data` reaches memory today** ([jobs.ts:310-324](src/Core/src/jobs.ts); [core.ts:1371](src/Core/src/core.ts)).
2. **A sweep run on the Mac writes `shortlist.json` to the Mac**, where the Shadow Core cannot see it, and nothing syncs the folder ([repo audit §4]). Fix: put `job-hunt-data` in its own private git repo, or in a subfolder of the synced repo, with the same pull, commit and push discipline.
3. The contacts/people file and the cadence and answer-bank notes Joshua describes are **not in the repo**. They probably live in the skill or the data folder. Confirm their paths before writing the indexer.

Index entries as structured "facts about applications" (company, role, date, status, next follow-up), not raw JSON. For email context, read live Gmail threads through the existing `gmail.readonly` path instead of keeping a duplicate email log. Sending stays behind `MailService.act()`, which requires the draft ID and the hash of the exact wording ([mail.ts:1-7](src/Core/src/mail.ts)).

Bake cadence rules into the standing prompt as **at most a handful of lines**. Follow-up 7-14 days after applying is the sourced norm ([Indeed](https://www.indeed.com/career-advice/finding-a-job/follow-up-on-job-application)). Put the full answer bank behind retrieval (see the prompt-budget section below).

**ToS flag:** LinkedIn's User Agreement bars bots and automated methods that access the service or send messages ([LinkedIn Help](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en)). Indeed bars automating Indeed Apply outside its official vendors ([Indeed Terms](https://www.indeed.com/legal), snippet). The current approve-then-apply flow, capped at 5 a day with a hard maximum of 8, therefore carries account risk on those two sites. **Recommendation** [inferred]: keep automated applying to employer ATS pages. On LinkedIn and Indeed, restrict the agent to research, tailoring and tracking, and have Joshua click Submit himself.

### Self-improving skills: the evidence argues against auto-activation

Joshua's design:
- Anthropic Agent Skills.
- Reflection at checkpoints, with consolidation and a quota cap.
- Wording/tone templates and classification/routing rules auto-activate, logged and revocable.
- Anything touching send, delete, spend or permissions always needs approval.
- Everything stored in the same skills folder, tagged Aang-authored.

The research weakens two parts of this.

**First, quality.** SkillsBench found **curated skills add +16.2 points, while self-generated skills score −1.3 points**, and even curated skills hurt 16 of 84 tasks ([SkillsBench](https://huggingface.co/papers/2602.12670), snippet). Gains also shrink toward the no-skill baseline as the library grows and retrieval becomes realistic ([arXiv 2604.04323](https://arxiv.org/abs/2604.04323v1), snippet).

**Second, safety.** The misevolution paper finds **unsafe artifacts "universal among evolved configurations"**. Three malicious tasks more than double carryover attack success, and benign updates do not reliably erase the learned risk ([arXiv 2608.12851](https://arxiv.org/abs/2608.12851), snippet). In the skills ecosystem, the ClawHavoc campaign compromised **about 1 in 5 ClawHub packages** ([SkillSieve](https://arxiv.org/html/2604.06550v1), snippet). Anthropic's own guidance is to use skills "only from trusted sources" and to "treat like installing software" ([Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)).

The "same skills folder" choice has a concrete, repo-specific problem. Aang's lanes load `settingSources: ['user']`, and `job-hunt` lives in `~/.claude/skills` ([core.ts:1016-1020](src/Core/src/core.ts)). **Any skill Aang writes there is also discovered by every Claude Code session Joshua runs**, including the job-hunt sessions that drive a logged-in Chrome. The SDK has no registration API, and skills are found only on the filesystem ([Agent SDK skills](https://code.claude.com/docs/en/agent-sdk/skills)). Two frontmatter features also raise the risk: `allowed-tools` lets a skill pre-approve tools for itself, and `` !`cmd` `` runs a shell command before the model reads the skill.

**Recommendation (Joshua decides):**
1. Aang writes to a staging folder outside every `settingSources` path, e.g. `~/Documents/Aang/skills/pending/`.
2. A one-tap Discord Approve button promotes a skill into an Aang-only folder under git, loaded through the explicit `skills: [...]` allowlist the code already uses.
3. Aang-authored skills are never written to `~/.claude/skills`.
4. Agent-authored skills may not contain `allowed-tools`, `` !`cmd` ``, URLs or scripts.
5. Record provenance frontmatter (origin, source sessions, taint web/email, version, approved_at).
6. Any trajectory that touched untrusted content is tainted, and anything tainted always needs review.

If Joshua keeps auto-activation for tone templates and routing rules, the minimum bar should be:
- The rule is proposed only from successful traces, with 3 or more occurrences in 14 days, or 2 corrections from Joshua.
- A replay of the source traces plus a 5-10 prompt golden set, with and without the change, graded in a separate context.
- The change activates only if it is no worse on any golden case.
- It is logged, and revocable by `git revert`.

(Design proposals from [self_improving_skills §7]; the thresholds are not sourced.)

Run reflection as a nightly-style batch at session start, the way Warp's scheduled improver proposes one small edit for review ([Claude blog: Warp](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude)). Skip it at or above 40% of the weekly quota, as consolidation already does. Cap the active library at about 20-30 skills.

### Standing-prompt bloat is the quietest top risk

Every feature above wants a line in the system prompt: capture rules, cadence rules, answer-bank rules, the host signal and learned templates. Instruction following degrades with instruction count: the best models reach **68% accuracy at 500 instructions**, with a bias toward earlier ones ([IFScale](https://arxiv.org/abs/2507.11538)). Anthropic recommends a minimal "right altitude" prompt plus just-in-time retrieval ([Anthropic Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Skill metadata costs about 100 tokens per skill, and a SKILL.md body should stay under 5k tokens ([Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)).

Prompt caching invalidates everything after any changed byte, in the order tools → system → messages. The minimum cacheable length is 1,024 tokens on Sonnet 5 and 4,096 on Haiku 4.5, and the default TTL is 5 minutes ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).

**Caps to adopt** [inferred, loosely grounded in IFScale and the Skills token budgets]:
- 15-25 hard rules.
- 1-2k tokens of standing facts (`profile.md` + `learned.md`), changed in batches at most once a day.
- A skills index with one line per skill.
- Everything else retrieved on demand.

**Order:** fixed tools, then persona, then standing facts, then the skills index, then volatile content last (time, host signal, handoff block, retrieved memories).

Add a unit test that fails when the static prefix exceeds its budget.

## Part B: Katara is a second tenant, not a second user of Aang

### Account: one accepted risk, documented once

The Consumer Terms state: **"You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else."** Anthropic may suspend "at any time without notice" on a suspected breach ([Consumer Terms](https://www.anthropic.com/legal/consumer-terms)). Quota is account-level, so Katara's use counts toward Aang's 40%/50% thresholds ([quota.ts:1-26](src/Core/src/quota.ts)).

Joshua has chosen to accept this risk. The cheapest compliant alternatives are:
- **Her own Pro at $20/mo.**
- A Team plan at 2 seats × $25 = $50/mo, or $40/mo billed annually.
- An API key, estimated at about $25-60/mo for a moderate workload.

([claude.com/pricing](https://claude.com/pricing); cost estimate in [sync_memory_terms Q5])

**Design requirement:** Katara's Core gets its own credential slot: its own Claude login or config directory, or an API key in her Keychain, selected by instance config. Switching to her own account then means signing in once, with no code change. (The exact SDK or CLI variable that isolates the login directory was not verified in this research; confirm it on Shadow.)

### Recommended shape

```
 Joshua's Discord server (Aang-bot)      "Couple" server (both humans + both bots)     Katara's Discord server (Katara-bot)
 #aang #capture #job-* ...               #us  ← the only shared data                   #katara #jobs #research #resume #drafts
          │                                    │ (Discord stores it; phones get push)                 │
   Aang Core (Shadow / Mac standby)  ◀── reads #us as quoted DATA ──▶   Katara Core (her Apple Silicon Mac)
   Body (Win) shows Momo                                                   Swift NSPanel Body shows Katara + Momo
                                                                           own dataDir/stateDir, own aang.db,
                                                                           own Google project/tokens (Keychain)
```

**Discord.** Bots cannot join group DMs ([discord-api-docs #426](https://github.com/discord/discord-api-docs/issues/426)). Relaying between two servers makes the conversation depend on bot uptime. A shared server with a couple channel is therefore the only design that meets both requirements: messages persist while both machines are off, and they reach both phones through Discord's normal push ([messaging_productivity §1]). The Core throws unless the bot is in **exactly one** server ([discord-gateway.ts:29-31](src/Core/src/discord-gateway.ts)), so two code changes are needed:
- **Replace that check with an explicit allowlist:** the home guild plus the couple guild.
- **Split the single-owner model** so the partner's messages in `#us` are ingested as data but never acted on as commands. Today non-owner messages are only logged and ignored ([discord.ts:225](src/Core/src/discord.ts)).

Each bot gets its own application and token. Channel permission overwrites keep each bot out of the other person's server. Unverified bots under 100 servers can enable Message Content without review ([Discord intent review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review)).

**Momo and the messenger.** When the Core's gateway sees a partner MESSAGE_CREATE in `#us`, it sends a new protocol message to its Body (e.g. `momo.show`). Unknown `t` values are ignored, so this is backward compatible ([docs/PROTOCOL.md](docs/PROTOCOL.md)). Clicking Momo opens a messenger panel filled from channel history, at 100 messages per page ([Discord channel API](https://discord.com/developers/docs/resources/channel)). Both Bodies need this: the C# Body on Shadow and the Swift Body on her Mac. Joshua's Mac-Core is headless, so Momo on his side exists only while Shadow is on, and his phone covers the rest.

**Open issue:** a bot cannot post as a human. The messenger's Send either posts through the bot with the sender labeled (possibly via a webhook's per-message username and avatar, which is unverified) or opens the channel in the Discord app. Decide this before building the messenger.

**Both AIs read the couple chat: safeguards.**
- Each bot stores `#us` in **its own owner's** memory database, never a shared store.
- Partner messages are wrapped as quoted data ("message from Katara:"), never as instructions (OWASP LLM01: [OWASP](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)).
- Links the partner pastes are fetched only when the owner asks.
- No tool action (email, post, file) is ever triggered by a partner message.
- Both people explicitly consent that the couple chat goes to Anthropic.
- A "private" prefix or a second channel that the bots ignore.
- Discord text is **not end-to-end encrypted**; Discord has "no current plans" to encrypt text ([Discord blog](https://discord.com/blog/every-voice-and-video-call-on-discord-is-now-end-to-end-encrypted)).
- Discord's Developer Policy forbids training on message content ([Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy), snippet). Inference-time use for the stated function appears allowed, but that reading is unverified.

### The Core separates cleanly by environment variables; identity does not

`AANG_DATA_DIR`, `AANG_STATE_DIR`, `AANG_PORT`, `AANG_OLLAMA`, `AANG_UNDO_DIR` and `AANG_TRASH_DIR` already isolate storage ([index.ts:6-13](src/Core/src/index.ts)). But these are compile-time constants:
- The persona ("You are Aang, Joshua's desktop companion", [voice.ts:9](src/Core/src/voice.ts)).
- The consolidation prompt.
- Toronto time zone and coordinates ([tools.ts:14-15](src/Core/src/tools.ts)).
- Joshua's job criteria ([jobs.ts:91-98](src/Core/src/jobs.ts)).
- The Windows-only setup scripts, including `google-setup.ps1`, which hard-codes his email ([tools/google-setup.ps1:48,70](tools/google-setup.ps1)).

The **config layer** (instance name, user name, time zone, location, persona file, criteria file, host label) is the shared prerequisite for Part B and for the "who's driving" signal in Part A.

Most of Katara's tools are platform-neutral and work unchanged: memory, mail, reminders, lists, jobs and Discord ([repo audit §2]). On her Mac, drop or stub the Windows-only modules (`run.ts`, `open.ts`, `screen.ts`, `uia.ts`). Without a Body they already degrade to "desktop not connected" ([core.ts:550](src/Core/src/core.ts)). Apple Silicon has none of the Ventura pins, so current Ollama (macOS 14+) and Playwright run normally.

**Google.** Give her **her own Google Cloud project**, publish it to "In production" (unverified) at once, and put her refresh token in the Keychain. Apps left in "Testing" get **refresh tokens that expire in 7 days** ([Google OAuth](https://developers.google.com/identity/protocols/oauth2), snippet; [DEV write-up](https://dev.to/just_a_side_project/my-oauth-tokens-kept-expiring-every-7-days-and-the-reason-was-a-dropdown-labeled-testing-47ni)). The personal-use exception (fewer than 100 users, all known to the developer) avoids verification ([Google Cloud Help](https://support.google.com/cloud/answer/13464323?hl=en), snippet).

Scopes:
- `gmail.readonly` and `gmail.compose` for mail, with the same draft → approve → send flow.
- `drive.file` for her resumes. Drive `files.export` converts Google Docs to PDF or DOCX, with a 10 MB export cap ([Drive export](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/export)).

Resumes should be single-column and ATS-safe, and she should submit .docx where it is accepted ([Jobscan](https://www.jobscan.co/blog/20-ats-friendly-resume-templates/), commercial source). The same LinkedIn and Indeed limits apply to her job hunt: the agent researches, tailors and tracks, and she submits.

### The overlay should be native Swift, and the installer an ad-hoc-signed app

Framework options:
- **Tauri** idles at about 30-40 MB and possibly more, because WKWebView's extra processes may be missed in its measurements. Its click-through is all-or-nothing ([tauri#11461](https://github.com/tauri-apps/tauri/issues/11461)).
- **Electron** idles at 200-300 MB ([gethopp](https://www.gethopp.app/blog/tauri-vs-electron)).
- **Native Swift/AppKit** is the only option likely to approach the Windows 12-13 MB target.

Build an accessory `NSPanel` (borderless, non-activating, clear background, `.canJoinAllSpaces` + `.fullScreenAuxiliary`). This follows the retired Phase P sketch ([docs/ROADMAP.md:505-507](docs/ROADMAP.md)); the exact flags are standard practice and unverified.

Transparent-pixel click-through has regressed on Sonoma and in the 26.3 RC ([Apple forums 737584](https://developer.apple.com/forums/thread/737584), [814798](https://developer.apple.com/forums/thread/814798)). So **poll `NSEvent.mouseLocation` and toggle `ignoresMouseEvents` from a per-frame alpha mask**, which mirrors the Windows approach. For the hotkey, use `RegisterEventHotKey` (the KeyboardShortcuts library), which needs **no Accessibility permission** ([KeyboardShortcuts](https://github.com/sindresorhus/keyboardshortcuts)). Avoid Option-only combinations ([FB15168205](https://github.com/feedback-assistant/reports/issues/552)).

Pre-decoding 118 frames at 224×224 costs about 23.7 MB (arithmetic). To save memory, decode per state or store frames at 112 px and scale up ×2 with nearest-neighbour.

**Sprites.** PixelLab exports individual frame PNGs, and users own commercial rights to their output, with no AI training allowed ([PixelLab terms](https://www.pixellab.ai/termsofservice), snippet). Generate at 112 or 224 px. Custom states (nap, think, spin, scooter, zip) need custom animations, because the presets do not cover them. Keep the `{state}_{i}.png` 224×224 layout. The asset path must become per-character, since `SPRITE.sha256` and `sprite-lock.test.ts` lock Aang's frames. Momo needs only a small state set (appear, idle, open, leave).

**Installer** (Joshua present):
1. Build a `.app` with Node bundled.
2. Ad-hoc sign it inside-out (`codesign -s -`). All arm64 code must be signed, or the kernel kills it with "Killed: 9" ([Eclectic Light](https://eclecticlight.co/2020/08/22/apple-silicon-macs-will-require-signed-code/)).
3. Approve it once through **System Settings > Privacy & Security > Open Anyway**. Sequoia removed the Control-click bypass ([AppleInsider](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia)).
4. Launch at login via `SMAppService.mainApp`, with the Swift app supervising the Node Core ([theevilbit](https://theevilbit.github.io/posts/smappservice/)).
5. Replace the PowerShell Discord and Google setup scripts with a Node first-run wizard that writes to the Keychain.

Ad-hoc signatures change on every build, so permission grants can reset. This is a reason to require no macOS permissions at all, or to pay $99/yr for a Developer ID if updates become painful. For updates, use git pull plus a build script, or a GitHub Releases zip. Sparkle's EdDSA works without a Developer ID ([Sparkle](https://sparkle-project.org/documentation/eddsa-migration/)).

## Ordered build plan with gates

The order puts shared prerequisites first and Shadow-only value next. The riskiest, least-used piece (the Mac standby) comes after cheap wins. **Stop points** mark where a solo developer can ship and pause. Gates follow PLAN.md's style: a measurable done-when, recorded with counts.

| # | Phase | Scope | Gate (done when) |
|---|---|---|---|
| **X0** | Baseline and re-decision | Run `npm test` / `tsc` in `src/Core` and `dotnet test tests/Body.Tests` on Shadow, and record the real counts (the audit's 340 unit tests / 27 Body facts are regex counts). Write the DECISIONS entry re-opening headless standby. Start backups (M5 not started): nightly copy of `aang.db` + stateDir to a second location. | All suites green with counts written into PLAN.md; a restore of `aang.db` from backup opens and `recall()` returns hits; decision entry committed. |
| **X1** | Config layer + schema bootstrap + prompt budget | Instance config (name, user, TZ, lat/lon, persona file, criteria file, host label, credential slot); `memory.ts` creates its schema when missing; static-prefix token budget test; cache-friendly prompt order. | Core boots on an empty data dir and creates the schema; the grep count of "Joshua" in `src/Core/src` falls to near zero outside config/persona files; prefix-budget test passes; a second instance boots on a different port without touching Aang's files. |
| **X2** | Capture vault (Shadow only) | Vault git repo, `.gitignore`/`.gitattributes`, `#capture` classify/save/"which topic?", per-note commit+push with conflict handling, `vault_index.sqlite` (heading chunks, hash-incremental). | 20 scripted captures produce the correct notes; a forced conflict produces a `conflict-*.md` plus a #log post and no data loss; re-index after editing 1 note re-embeds only that note's chunks; "let's pick up from Discord" always asks for a topic. **Stop point 1.** |
| **X3** | Job-hunt memory | Index `~/job-hunt-data` on session Stop/SessionEnd and on `applied.json` change; put `job-hunt-data` in git (fixes the Mac shortlist gap); locate the contacts/cadence/answer-bank files; cadence lines in the standing prompt within budget. | A new `applied.json` entry is answerable from memory within 2 min; a Mac-run sweep's `shortlist.json` produces #job-digest cards on Shadow; mail still sends only through `act()` with the hash (existing mail tests green). |
| **X4** | Mac host readiness | `sw_vers` ≥13.5 (update to 13.7.8 if needed); Tailscale; Node 24; pmset/caffeinate; FileVault and firewall on; scoped credentials only (no Google or Spotify tokens on the Mac unless needed; Discord token in the Keychain); pins recorded (Ollama ≤0.12.3 or none, Playwright 1.61 or `channel:'chrome'`). | **Retired Phase C gate reused:** LaunchAgent heartbeat, no gap >2 min across 72 h; the TCP health check from Shadow succeeds after a forced sleep/wake. Can run unattended during K1-K2. |
| **X5** | Mac-Core standby | `--role=standby`; `/health` + `/yield`; epoch; login-on-takeover; reaction/`lastSeen` dedupe; "who's driving"; Mac tool set only; reminders single-writer in git; turn journal → Shadow import; warm `startup()` + handoff block; RSS recycle + wall-clock watchdog; persisted saving flag. | 20 failover/failback drills (Shadow shutdown, Shadow reboot, Mac sleep, network cut) with **0 double replies, 0 lost messages, 0 double-fired reminders**; Mac-authored turns found by Shadow `recall()` after failback; shell/file tools absent on the Mac (test asserts it); first reply after takeover under an agreed latency. **Stop point 2.** |
| **K0** | Katara account and credential slot | Record the accepted risk once; instance config for Katara; credential slot selectable. | Switching her instance to a separate login or API key is a one-setting change, demonstrated once. |
| **K1** | Katara Core on her Mac (headless first) | Own dataDir/stateDir, own bot + server, own Google project in production, Keychain secrets, Node setup wizard, her criteria and persona. | She chats with Katara from her phone; Gmail triage and draft→approve→send work; a Google Doc exports to PDF/DOCX; no Aang file readable from her instance (test). |
| **K2** | Swift Body | NSPanel overlay, alpha-mask click-through, `RegisterEventHotKey`, PixelLab frames at 224, protocol v1 parity (hello/state/bubble/submit/stop/permission/ping/desk). | Resident memory and idle CPU measured and recorded against the Windows 12-13 MB / <1% baseline; click-through correct at 100 random points on/off the sprite; works over a full-screen app. |
| **K3** | Couple channel, Momo, messenger | Guild allowlist; owner/partner split; `#us` ingestion as data; `momo.show` in both Bodies; messenger send design chosen; consent and private-prefix rule. | Partner message → Momo on the other desktop in <5 s when on, phone push when off; a prompt-injection test message in `#us` triggers no tool call on either side; the private prefix is excluded from both memories. |
| **K4** | Installer and updates | Ad-hoc-signed `.app`, Open Anyway walkthrough, SMAppService, update script. | A clean install on her Mac with Joshua present in <30 min; an update does not require re-granting anything. **Stop point 3.** |
| **X6** | Self-improving skills | Staging folder, Discord approve/reject, provenance, taint, golden set, replay eval, quota-capped reflection, active cap, revert. | 0 agent-authored files under `~/.claude/skills`; every promoted skill has an eval record; a seeded "tainted" proposal is forced to review; reflection is skipped at ≥40% of the week. |

Two cross-cutting rules apply to every phase. **No phase is marked done without its gate numbers written into PLAN.md.** And **Discord stays the single front end**, which makes it a single point of failure. Its failure mode is at least benign (messages queue), and the Body bubble still works on Shadow. The plan should name a fallback notice channel (e.g. ntfy, [ntfy docs](https://docs.ntfy.sh/faq/)) but not build one until Discord actually fails.

## Decisions Joshua must re-confirm

1. **Re-open the retirement of Phase E for a headless standby only.** Record it in DECISIONS.md, and state that C and P remain retired.
2. **Standby logged out of Discord until takeover**, rather than always connected with leader gating. The research supports either; logging in only on takeover is simpler.
3. **Add an epoch number** to the heartbeat design. It is a minimal lease-like guard, not a formal lease.
4. **Self-written skills.** Choose one: (a) staging plus approval for everything (recommended), or (b) auto-activation for tone and routing only, after a golden-set replay. In either case, Aang never writes to `~/.claude/skills`.
5. **Playwright on the Mac:** pin 1.61, use the Chrome channel, or skip it in v1 and rely on WebSearch/WebFetch (recommended for the unpatched OS).
6. **Keyword-only memory search on the Mac in v1** vs trying the pinned Ollama.
7. **LinkedIn/Indeed:** stop automated submission there and keep it for employer ATS pages only.
8. **Couple chat in a third "Couple" server** (recommended), rather than inside either person's own server.
9. **Katara on his Claude login**, accepted once and in writing, with the credential slot built so switching is trivial.
10. **Order:** X0-X3 before any Mac work; Katara's K-phases before the Mac-Core, or after it.

## Open questions

- Where do the contacts/people, cadence and answer-bank files actually live, and does the Mac's copy of the `job-hunt` skill have the same "Handoff with Aang" section? ([jobs.ts:125-126](src/Core/src/jobs.ts))
- What is the Mac's exact `sw_vers`, and does embeddinggemma run on Ollama 0.12.3 on Intel Ventura?
- Does the current Tailscale build on Ventura survive sleep and wake? (The known open bug is on Tahoe.)
- Does Joshua's "In production", unverified Google app keep long-lived refresh tokens with restricted Gmail scopes? This is inferred, not confirmed.
- How does the messenger send: bot with a label, a webhook with username override (unverified), or a deep link to Discord?
- Which Claude plan is Joshua on? This decides how much headroom Katara's pooled use actually consumes.
- Does Katara consent to her couple-chat messages being sent to Anthropic by Aang, and does Joshua consent to the reverse?

## First thing to do on Shadow

Pull the repo at or after `81d106f`. Run `cd src/Core && npm install && npm test && npm run check`, then `dotnet test tests/Body.Tests`, and write the real pass counts into PLAN.md (the audit could not run them). Copy `~/Documents/Aang/aang.db` (after a WAL checkpoint) and `%APPDATA%\Aang` to a backup location, and prove a restore opens. Then answer decisions 1, 4 and 10 above in DECISIONS.md and begin X1, the config layer and schema bootstrap. Everything in both plans depends on it, and it is useful even if the Mac-Core is never built.

## Conclusion

The research changes the problem from "make Aang portable" to "make Aang multi-instance and single-writer." Once identity, time zone, credentials and schema come from config, and memory has one authoritative writer with a git-synced journal as the bus, the Mac standby and Katara are two uses of the same mechanism. Most of the novel risk sits at the edges of that mechanism:
- Discord's willingness to deliver every event to every session.
- A 2017 Mac that is pinned, unpatched and prone to sleep.
- A skills folder that Joshua's own Claude Code sessions also read.
- A couple chat that is untrusted input to two agents at once.

The highest-leverage move for a solo developer is to bank value on Shadow first: the capture vault and job-hunt memory. Hold the Mac-Core to the same measurable, drill-based gates that got Aang through M0-M4.

## Sources

**Repository (HEAD 81d106f):** docs/PLAN.md, docs/ROADMAP.md, docs/DECISIONS.md, docs/MEMORY.md, docs/THE-PLAN.md, docs/PROTOCOL.md, docs/DESIGN.md; src/Core/src/{index, core, memory, embed, consolidate, voice, tools, run, open, claude, worker, hooks, macsetup, discord, discord-gateway, discord-logic, jobs, mail, google, quota, route, reminders}.ts; tools/google-setup.ps1, tools/discord-setup.ps1; src/Body/*.cs; src/Core/test/.

**Platform and runtime:** [Node BUILDING.md v24](https://github.com/nodejs/node/blob/v24.x/BUILDING.md) · [Claude Code setup](https://code.claude.com/docs/en/setup) · [Agent SDK TS reference](https://code.claude.com/docs/en/agent-sdk/typescript) · [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions) · [Agent SDK streaming input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) · [sdk-ts #34](https://github.com/anthropics/claude-agent-sdk-typescript/issues/34) · [Claude Code #67433](https://github.com/anthropics/claude-code/issues/67433), [#86267](https://github.com/anthropics/claude-code/issues/86267) · [Playwright registry v1.61](https://github.com/microsoft/playwright/blob/v1.61.0/packages/playwright-core/src/server/registry/index.ts) / [v1.62](https://github.com/microsoft/playwright/blob/v1.62.0/packages/playwright-core/src/server/registry/index.ts) · [Ollama macOS doc](https://github.com/ollama/ollama/blob/main/docs/macos.md), [commit c68f367e](https://github.com/ollama/ollama/commit/c68f367ef6688972de6798e631a7aa50c48af763) · [EmbeddingGemma](https://developers.googleblog.com/en/introducing-embeddinggemma/) · [Apple Ventura 13.7.8](https://support.apple.com/en-us/124929) · [Apple Sonoma compatibility](https://support.apple.com/en-us/105113) · [Chrome and macOS 12](https://9to5google.com/2026/01/23/google-chrome-ending-support-for-macos-monterey-in-july-2026/) · [Tailscale #20859](https://github.com/tailscale/tailscale/issues/20859) · [Macworld clamshell](https://www.macworld.com/article/673295/how-to-use-macbook-with-lid-closed-stop-closed-mac-sleeping.html) · [Apple battery health (Intel)](https://support.apple.com/en-us/102588) · [browserless headless Chrome](https://www.browserless.io/blog/headless-chrome).

**Discord and messaging:** [Discord gateway docs](https://github.com/discord/discord-api-docs/blob/main/developers/events/gateway.mdx) · [@discordjs/ws shard](https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts) · [discord.js #8486](https://github.com/discordjs/discord.js/issues/8486) · [Bots and group DMs #426](https://github.com/discord/discord-api-docs/issues/426) · [Privileged intent review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review) · [Channel messages API](https://discord.com/developers/docs/resources/channel) · [Discord E2EE voice/video](https://discord.com/blog/every-voice-and-video-call-on-discord-is-now-end-to-end-encrypted) · [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy) · [OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) · [ntfy FAQ](https://docs.ntfy.sh/faq/).

**Sync, memory, prompts:** [obsidian-git](https://github.com/Vinzent03/obsidian-git), [discussion #709](https://github.com/Vinzent03/obsidian-git/discussions/709) · [Syncthing conflicts](https://docs.syncthing.net/users/syncing.html) · [mdrag](https://github.com/orellazri/mdrag) · [vault-rag](https://github.com/florianbellmann/vault-rag) · [IFScale](https://arxiv.org/abs/2507.11538) · [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

**Skills and self-improvement:** [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) · [Agent SDK skills](https://code.claude.com/docs/en/agent-sdk/skills) · [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) · [Hermes skills doc](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/skills.md) · [SkillsBench](https://huggingface.co/papers/2602.12670) · [Skills in the wild 2604.04323](https://arxiv.org/abs/2604.04323v1) · [Skill misevolution 2608.12851](https://arxiv.org/abs/2608.12851) · [SkillSieve / ClawHavoc](https://arxiv.org/html/2604.06550v1) · [OpenClaw security analysis](https://arxiv.org/html/2603.27517v3) · [Warp self-improving agents](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude).

**Accounts, Google, jobs:** [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) · [Claude Code legal](https://code.claude.com/docs/en/legal-and-compliance) · [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) · [SDK with Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) · [Claude pricing](https://claude.com/pricing) · [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) · [Google verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en) · [Drive files.export](https://developers.google.com/workspace/drive/api/reference/rest/v2/files/export) · [LinkedIn prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en) · [Indeed Terms](https://www.indeed.com/legal) · [Indeed follow-up guidance](https://www.indeed.com/career-advice/finding-a-job/follow-up-on-job-application) · [Jobscan ATS templates](https://www.jobscan.co/blog/20-ats-friendly-resume-templates/).

**macOS overlay and distribution:** [Apple forums 737584](https://developer.apple.com/forums/thread/737584), [814798](https://developer.apple.com/forums/thread/814798) · [tauri #11461](https://github.com/tauri-apps/tauri/issues/11461) · [Tauri vs Electron](https://www.gethopp.app/blog/tauri-vs-electron) · [KeyboardShortcuts](https://github.com/sindresorhus/keyboardshortcuts) · [FB15168205](https://github.com/feedback-assistant/reports/issues/552) · [Sequoia Gatekeeper change](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia) · [Apple Silicon signing](https://eclecticlight.co/2020/08/22/apple-silicon-macs-will-require-signed-code/) · [Node SEA](https://nodejs.org/docs/latest-v19.x/api/single-executable-applications.html) · [SMAppService notes](https://theevilbit.github.io/posts/smappservice/) · [Sparkle EdDSA](https://sparkle-project.org/documentation/eddsa-migration/) · [PixelLab terms](https://www.pixellab.ai/termsofservice) · [OpenAI hatch-pet spec](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md).
