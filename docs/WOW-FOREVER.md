# Making Aang an expert on WoW: Forever

*Research and plan, 2026-09-28. Plain English first, with the real technical names attached so you can search for them.*

---

## The headline: Forever is not a Classic engine

**The single most important finding, confirmed twice.**

The client reports version `1.60.1`, interface number `16001`, flavour `wow_classic_beta`. That looks like vanilla. **It isn't.** WoW: Forever is the **modern retail engine** (the 12.x / Midnight line) with Classic content on top. The version number is cosmetic.

**Proof from your own machine.** Your Forever Dungeon Journal addon calls `C_QuestLog`, `C_Item`, `C_TooltipInfo`, `C_Map.SetUserWaypoint` and `EncounterJournal`. None exist in vanilla. Independently, a community addon toolkit captured the API surface and found ~6,045 functions — retail-sized — with the project ID returning the modern value.

**Why it matters in every direction:**

- Modern APIs are available. Retail code mostly ports; Classic code mostly breaks.
- The combat log is in **modern format** (advanced format 22), so retail parsers apply and vanilla ones don't.
- Old Classic addons load then misbehave, calling functions that no longer exist (`GetSpellInfo`, `GetItemInfo` reported gone on build 69913). Addons showing "out of date" usually just need their interface number declared.
- **It brings the modern engine's restrictions too** — the next finding.

### Dates that shape everything

| | |
|---|---|
| Beta opened | 17 September 2026 |
| Current build | **1.60.1.70009**, 24 Sept (confirmed live from Blizzard's own endpoint) |
| Build cadence | **Five builds in eight days** — one every one to two days |
| Beta ends | ~21 October 2026 *(reported, not confirmed by Blizzard)* |
| Launch | **4 November 2026** *(reported, not confirmed by Blizzard)* |

---

## Why damage meters don't work — and won't

You said "when the addons do finally work." **For damage meters, that day isn't coming** in the old form.

The modern engine has a **Secret Values** regime. `COMBAT_LOG_EVENT_UNFILTERED` is removed from the addon-accessible surface, and `CombatLogGetCurrentEventInfo()` returns values an addon may *display* but not read, compare or sum. Deliberate design, not a beta bug.

Blizzard ships its own meter instead, server-validated, exposed through `C_DamageMeter` — **secret during combat, readable out of combat**. Details! and Skada survive only by reading that. The clearest confirmation is an addon called Forever Details Meter, which states outright: *"On this engine, `COMBAT_LOG_EVENT_UNFILTERED` is forbidden to addons. Data comes from `C_DamageMeter`."*

WeakAuras' author has reportedly stopped porting. DBM and BigWigs are porting with reduced features.

**So no addon can hand Aang your DPS mid-fight. Ever.**

**But the clean route is untouched:** the client still writes `Logs/WoWCombatLog.txt` itself, via `/combatlog` plus `/console advancedCombatLogging 1`. Secret Values restricts the *addon API*, not the game writing its own file. Modern format, so existing retail parsers apply.

**Consequence:** combat analysis happens **after the fight, from the log file** — not live. You chose to do this later, after the wiki works. Right order.

---

## Where the data comes from

### The three sources that matter

**1. Blizzard's own version endpoint — the patch watcher.**

```
http://us.patch.battle.net/wow_classic_beta/versions
```

No key, no auth, plain HTTP. Returns the live build for every region. **Verified working** — returned `1.60.1.70009` across all four regions. This is how Aang knows a patch landed. Poll hourly, watch the sequence number.

**2. `wago.tools` — the game's actual internal data, per build.**

```
https://wago.tools/db2/ItemSparse/csv?build=1.60.1.70009
https://wago.tools/db2/SpellName/csv?build=1.60.1.69977
```

**Verified working on your exact builds**, and older builds are archived — which is what makes diffing possible. The spell table came back vanilla-sized rather than retail-sized, confirming the build parameter is genuinely honoured.

Authoritative for items, spells, quests and talents: Blizzard's own data, not a community guess.

*Caveat: their `robots.txt` formally allows only the homepage. The export paths work but aren't crawl-blessed. Fetch politely, cache hard, don't hammer it.*

**3. `warcraft.wiki.gg` — the best-licensed prose source.**

A real MediaWiki API at `/api.php`, **CC BY-SA 4.0** — redistribution and commercial use permitted with attribution. 345,000 articles, and the Forever article is substantial and properly cited. This is where narrative knowledge comes from, legitimately.

### Wowhead is off-limits

**Their `robots.txt` explicitly disallows `anthropic-ai`, `Claude-Web` and `ClaudeBot` from the entire site.** Fandom's terms also prohibit scraping without written permission, including for software development.

They do have a rich per-item JSON endpoint (`nether.wowhead.com/forever/tooltip/item/{id}`) and it's genuinely the best per-item data available — but it isn't ours to automate against. **Use wago.tools**, which is the same underlying data from the source.

### The best community shortcut

**`github.com/alcaras/forever-ref`** — a static reference built from the client's own data tables via wago.tools, plus Questie's quest/NPC/spawn database and addon-recorded vendor, drop and trainer data. Rebuilt daily by an automated job. **Publishes compressed JSON snapshots per build, so the diffing is already done.** Git-cloneable, no scraping.

If one thing gets read first, it's this.

### Ranked community sites

All snapshot the same underlying data, so they disagree on counts (17.6k vs 21.9k vs 31.8k items) because they snapshot different builds and count different things. **Don't trust any single number.**

| Site | Good for | Build stamp |
|---|---|---|
| **60.tools** | Widest coverage — items, spells, talents, quests, NPCs, maps, BiS, gear planner. Says **3,225 items changed from Classic** | 1.60.1.70009 |
| **foreverchanges.pro** | **Change-diffing specialist** — 743 talent and spell changes, 111 talents Classic never had. Auto-extracted | 1.60.1.70009 |
| **wowforevertalents.com** | Best provenance of the talent sites; diffs against Classic Era explicitly | 1.60.1.70009 |
| **wowf.io** | Broadest editorial; most recently updated site seen | 28 Sep |
| **wowsrc.com** | *"An independent, non-commercial WoW Forever fan site. Crawl it freely."* — friendliest terms of any | — |
| **wow-forever.gg**, **thewowdb.com**, **foreverdb.net** | Large databases; thewowdb has a live auction-house price tracker | 1.60.1.70009 |
| **wowforeverbuilds.com** | Community-voted build guides with named authors | 1.60.1, stalest |
| **quissy.tv** | A creator, not a database. Editorial context only | — |

Nearly all have an internal `/api/` explicitly disallowed to crawlers — private, not public. Don't plan on them.

**`wowclassicdatabase.com` has no Forever content** — Classic only. It was in your addon's list as a Classic cross-check.

### Blizzard's official API is a dead end here

Classic namespaces exist (`static-classic-{region}`) but cover only races, classes, items, creatures and media. **No quests, no spells, no encounter data, no character profiles.** No evidence any beta or Forever namespace exists. Rate limits are generous (36,000/hour) but there's nothing worth the OAuth setup.

*Their developer terms returned a 404 — caching and redistribution rules unverified. Worth a direct read before relying on it.*

---

## How Aang learns what you're doing in-game

**The fundamental constraint:** WoW addons are sandboxed Lua with **no network access and no filesystem access**. An addon cannot send Aang a message. This shapes every option.

### The channels, compared

**SavedVariables — simple, slow.** An addon writes a `.lua` file Aang watches. The catch: **the game only writes it on logout, disconnect, quit or `/reload`.** There's no way to force a flush — reportedly deliberate, to prevent botting. Latency is "until your next reload": minutes to hours. Fine for "what's in my bags", useless for "what am I fighting".

**The pixel channel — live, and already built for your exact client.**

**`github.com/chelinho139/wow-ai`** (MIT, ~113 stars) is **tested on WoW: Forever 1.60.1.69913 and .69977, TOC 16001** — your client, your build family. The addon draws its outgoing message as a strip of coloured 4-pixel squares in a screen corner; a small program screen-captures that corner **four times a second** and decodes it. Replies come back by writing into a pool of pre-made load-on-demand addon files the game loads on a timer.

Its README states: *"Nothing here injects code, reads game memory, or generates input. The addon uses documented addon APIs only."*

**That's most of the hard part solved.** Related: `efskap/WoWCerealize` (MIT) adds packet numbering and checksums; `alex-berliner/LibSerpix` is a reusable library for the same trick.

**The combat log file** — best channel for fight data, after the fact.

**Screenshots** — an addon can call `Screenshot()` to make the game write a PNG on demand.

### What an addon can read on this engine

Since it's modern: quest log and objectives (`C_QuestLog`), bags and equipped gear, talents, target name/health/level, zone and coordinates, group members, buffs and debuffs, cooldowns, chat, money, reputation. Tooltips through `C_TooltipInfo` — which is how you get **authoritative current item stats straight from the client**.

**Not readable:** the combat log (Secret Values), and anything protected like casting or moving — which is exactly what keeps this safe.

### Screenshots and annotations: you asked, and the answer is mostly no

**For structured facts, an addon beats screen-reading on every axis.** Screen-reading gives fuzzy text of whatever is visible; an addon gives exact quest IDs, objective counts and completion flags, free, always. WoW's font at 11–13px on textured backgrounds is a poor OCR target — the one WoW-specific OCR project (`geo-tp/wow-ocr`) exists precisely *because* generic OCR fails, and needed a custom-trained model.

**Where a screenshot earns its place:** occasional whole-scene understanding — one cropped image to a vision model returning "you're in Westfall fighting Defias, health low". Worth doing **on demand, not on a loop**. A full 1920×1080 screenshot costs roughly 1,500–2,500 tokens; a cropped 400×200 region costs a few hundred. Given your quota, crop hard and cap it.

**Verdict: build the addon bridge, not an OCR pipeline.** Screenshots stay an occasional extra.

### The rules, and where the line actually is

Blizzard's licence prohibits cheats, bots, hacks, and — the clause that matters — *"any unauthorized process or software that intercepts, collects, reads, or 'mines' information generated or stored by the Platform."* It also states the client may monitor your computer's memory for unauthorised programs.

| | |
|---|---|
| **Safe** | An addon using documented APIs. Reading SavedVariables, the combat log, or screenshots *from disk*. A separate window drawn on top by Windows. |
| **Banned outright** | Reading or writing game memory. DLL injection. Sending fake input into the game window — that's "automated control". Packet interception. |
| **Genuinely grey** | Screen capture with OCR, and the pixel channel. No Blizzard statement either way; a forum question about pixel-reading got no official reply. |

**Practical read:** reading a file the game itself wrote, after the fact, is settled-safe by a decade of precedent — Warcraft Logs and Details! uploaders are universal and effectively endorsed. Warden targets injection and memory patching, not sibling windows. The pixel channel is *probably* fine and is what the working projects do, but **it's the one thing nobody can promise.** It's your real account, so that's worth knowing before we use it.

**Never send input. Never touch the process.** Output-only is the safe envelope.

---

## How to store it

### Numbers in a table, prose in a search index

The research is unusually clear. A benchmark paper (arXiv 2408.14717) found that on realistic mixed questions, **both plain database-querying and plain semantic search answer 20% or fewer correctly.** Each covers only half the problem.

- **Structured game data — items, quests, drops, talents — goes in a proper table**, keyed by Blizzard's own IDs. "Is this an upgrade" is arithmetic over rows, and semantic search is structurally bad at numbers and exact IDs.
- **Narrative knowledge — strategy, how a fight works, why a build is good — goes in the search index.**
- **A small set of hand-written queries** (`get_item`, `compare_items`, `quest_chain`, `loot_for_npc`) that Aang calls, rather than letting a model write its own database queries. That's what the working projects do, and it removes a whole class of errors.

**Skip the knowledge graph.** Relationships here are shallow and already identified, and Blizzard hands you integer IDs — so you get the entity-matching problem that graphs exist to solve, solved for free.

**The single best structural decision:** keep volatile numbers **out of** the search index. Index the stable prose; resolve every number at query time from the table. Then a Blizzard retune changes **zero** embeddings.

### It lives separately from Aang's memory

**Decided, consistent with the earlier Obsidian ruling (2026-09-23).** Game knowledge gets its own database, wiped and rebuilt on any patch, never touching personal memory. Two reasons: tens of thousands of game rows would swamp 354 conversations, and a bad rebuild must never damage what Aang knows about you.

The Obsidian vault in the plan is a different thing — **your** captured notes, in your words, indexed read-only, never written to by Aang. 30,000 generated item files in your notes app is exactly the "buries his own thinking in generated noise" failure that decision avoided.

### Your patch-watching idea, formalised

**You proposed this and it beats every alternative I offered.** Because Blizzard publishes the build number free and wago.tools archives per build, the staleness problem dissolves for anything in the game files:

1. Poll the version endpoint hourly.
2. Build number changed → pull the new tables.
3. **Diff against the previous build.**
4. That diff *is* the patch notes — precisely what changed, before anyone writes an article about it.

The research independently called this "the single highest-value ingestion artefact for this project."

**It also gives you the patch alerts you asked for.** Because Aang knows your class and gear, the diff becomes *"they changed three of your talents last night"* rather than a wall of notes.

**The half it doesn't cover** is community knowledge — strategy, build opinions, player-observed drop rates. None of that is in the game files. **You chose a weekly re-check** of the main community sites for that half.

### When sources disagree

Five community sites will contradict each other. The established approach — a real field called *truth discovery*, canonical algorithm TruthFinder (KDD 2007) — is reliability-weighted voting rather than majority rule, **with one correction that matters here: detect copying.** Five sites agreeing usually means four reprinted one, and in the WoW ecosystem nearly everything reprints Wowhead.

Practical version: weight by source class — **live game client > extracted game data > community site > forum post** — and let the client adjudicate when it can.

### The live client is the best source, when available

Your running game can be asked authoritative questions — real current item stats, real current quest reward — but only while you're playing and only about what you can see. Treat it as an expensive, authoritative, intermittent source and everything else as a cache of it. When the client observes something, that observation **overrides every website**.

Useful trick: keep a **want-list** of facts Aang is least sure about, and have the addon opportunistically check those IDs whenever they appear on screen. That turns intermittency into a slow background crawl.

**One real risk to design against:** when your data contradicts what the model already believes about WoW — and it has read the entire vanilla internet — it may quietly revert to what it "knows". This is documented (arXiv 2403.08319), and **larger models are more prone to it, not less.** The fix is labelling provenance inline in the context and requiring answers to restate which build a number came from.

---

## The plan

Built to your answers: addon private first and published later, build during the beta, wiki before meters, alerts about changes that affect you.

| Stage | What | Why |
|---|---|---|
| **1** | **Patch watcher.** Poll Blizzard's version endpoint, pull wago.tools tables on change, store per build, diff. | Free, no game needed, and everything depends on it. Standalone value on day one. |
| **2** | **The data tables.** Items, spells, quests, talents, drops in their own database with proper IDs, stamped with the build they came from. | Answers "is this an upgrade" and "where does this quest go" with arithmetic, not guessing. |
| **3** | **Ask Aang.** A handful of query tools plus the narrative index. Read `alcaras/forever-ref` first and take its extraction approach. | This is the wiki working. Everything else builds on it. |
| **4** | **Patch alerts that matter to you.** The diff, filtered by your class and gear, through the proactive system he already has. | Falls out of stage 1 nearly free, and you'd notice it daily. |
| **5** | **The addon bridge.** Read `chelinho139/wow-ai` first — tested on your exact client. Private build. | Aang stops needing to be told what you're doing. |
| **6** | **Weekly community refresh.** Strategy and builds from the sites above, labelled as opinion with a date. | The half patch-diffing can't cover. |
| **7** | **Combat log analysis.** Tail `WoWCombatLog.txt`, parse, report after the fight. | Deliberately last, per your call. |
| **8** | **Publish the addon**, if it's worth publishing — after launch, once the API stops moving. | Your stated preference. |

**On stage 7, when you get there:** the traps are well documented — pet damage attribution, absorbs not being heals, double-counting periodic and direct damage, and choosing between "active time" and "encounter time" as the denominator. Enable advanced logging, key everything on full unique IDs rather than names, and stream the file rather than loading it — it grows to gigabytes. `WoWAnalyzer` (AGPL) is the closest existing thing to written coaching, and **nobody has yet fed logs to an AI for advice.** Genuinely open ground.

---

## What could not be verified

Stated plainly, because a confident wrong answer is the failure this whole document is designed against.

- **Launch and beta-end dates** come from community sites, not Blizzard. Blizzard's own news pages are script-rendered and could not be read.
- **Blizzard's developer API terms of use** returned a 404. Nothing about caching or redistribution is confirmed.
- **Whether Warcraft Logs supports Forever** — unknown.
- **Whether the combat log flushes live or in blocks** on this client. Matters a lot for stage 7, and it's cheap to test: turn on `/combatlog`, hit a dummy, watch the file size every second.
- **Whether `C_DamageMeter` data can be read out of combat and exported.** Nobody has demonstrated it.
- **Whether healing addons work on Forever** — HealBot, VuhDo, Grid2 status unconfirmed.
- Several "WoW Forever" domains that surfaced in searching look like automatically generated filler. Nothing from them was treated as fact.
