# The research behind the list

*Companion to `WHAT-IS-LEFT.md`. Five research threads, 2026-09-28: what others have already solved, what it costs, and where the plan was wrong.*

**How to read this.** Your rule was *"study how others solved it, then build our own."* So this is mostly techniques and lessons, not libraries to install. Where a finding **contradicts** something in the plan or something you believed, it's marked **CHANGES THE PLAN** — those are the valuable bits.

Everything here came from public sources. Where something couldn't be verified, it says so rather than guessing.

---

# 1. The desktop pet

## CHANGES THE PLAN: the Mac click-through problem isn't real

The plan said transparent click-through has "regressed" on macOS and needs a workaround — polling the mouse position and toggling based on a transparency mask.

**That's wrong, and building it would cause the very bug it's meant to fix.**

A plain macOS window that isn't opaque and has a clear background **already hit-tests per-pixel against transparency, natively**. Clicks pass through transparent pixels and land on the character. You get it for free.

The trap: **assigning the "ignore mouse events" property at all — to true *or* false — switches the window to all-or-nothing hit testing and destroys it.** That single line is the entire bug. Every project that ended up polling the mouse did so because a framework underneath them had already set that property. One real example: a change in Electron 7 started setting it on every window, silently killing per-pixel click-through, and the fix was to patch that call into a no-op. Another: a pet app found its game framework re-deriving the property on every mouse movement, clobbering the app's intent.

**For Katara:** write the window non-opaque with a clear background, and **never touch that property**. In pure Swift there's no framework in the way. Keep the polling approach documented as a plan B only — it costs real battery, and at least one project has a fix specifically to undo that drain.

## CHANGES THE PLAN: more frames is probably the wrong fix

You said Aang is choppy and wants more frames. The research disagrees, and this one could save you $50–100 and get a better result.

118 frames across 10 states is **~12 frames per state**. That is not a low frame count. Shipped pixel-art games commonly use **2-frame idle loops with 200–400ms holds**, and run character animation at **8–12 frames per second**. Above about 15 fps you lose the pixel-art read entirely. Worse: *"a 12-frame walk cycle often looks worse than a 4-frame one, because any inconsistency is three times as visible."*

**Two much more likely causes of what you're seeing:**

1. **The timer.** The standard Windows Forms timer runs off the message pump with roughly 15.6ms granularity and no drift correction. That alone reads as choppy regardless of frame count. *Fix: drive animation off a monotonic clock, calculate which frame the elapsed time implies rather than incrementing a counter, and drop frames instead of sliding.*
2. **Even playback intervals.** Holding every frame the same length is the single biggest cause of animation that's simultaneously choppy and lifeless. Real animators hold long on the key pose and move fast through the transition.

**What actually buys life, per frame spent:** uneven hold times; easing in and out (frames bunched at the extremes); more frames in the wind-up and the recovery, fewer in the fast middle; one stretched "smear" frame replacing three in-betweens; squash and stretch over 2–3 frames while preserving volume; and **secondary motion** — anything trailing, like clothing or a held object, moving *later* than the body. That last one is the cheapest personality-per-pixel available.

**Recommendation: fix the timing first, and only then decide whether you still need frames.**

## CHANGES THE PLAN: "more things to do" is a data problem, not an art problem

Idle is roughly **90% of a desktop pet's screen time**. The answer isn't one longer loop — it's **ten short micro-idles picked at weighted random**: blink, ear twitch, head turn, look toward the cursor, a stretch every few minutes. Ten 3-frame micro-idles read as far more alive than one 30-frame loop, and cost a fraction of the art.

**The model worth stealing is Shimeji's** — the most-copied desktop pet AI there is. Two layers:

- **Actions** — low-level, frame by frame: a sequence of poses, each with an image, an **anchor point**, a velocity and a duration. The anchor is why a pet can change shape mid-animation without jittering — you'll want this for scooter and spin.
- **Behaviours** — high-level intents that choose an action, each carrying a **frequency weight** (zero disables it) and a **condition** checked against the current environment.

Weighted-random selection over condition-gated behaviours is precisely the "alive and unpredictable rather than looping" quality you're after, and it's **data-driven — a new behaviour is a new row, not new code.**

Two more ideas worth lifting, both from a very close cousin of Aang (an Electron desktop pet with 12 states): **staged idle decay** — idle 60s → yawn → doze → collapse → sleep, each stage reversible the moment you interact — and **eye tracking toward the cursor** layered over whatever idle is playing. Cursor tracking is the highest ratio of aliveness to effort available.

## Projects worth reading

Star counts from GitHub's `desktop-pet` topic, 2026-09-28.

| Project | Stars | Built in | Licence | Why it matters to you |
|---|---|---|---|---|
| **BongoCat** | 23.7k | Rust + webview | MIT | Its hardest-fought code is cross-platform click-through. Also the anti-model — a webview pet is exactly the bloat you avoided. |
| **VPet** | 6.8k | C# / WPF | Apache-2.0 | Animation as a **3-axis matrix** (~32 types × 4 states × 3 variants) with a mod-loadable pack format. A better mental model than your flat ten states. |
| **clawd-on-desk** | 6.3k | Electron | AGPL-3.0 | The closest living cousin: 12 states, eye tracking, staged sleep. Steal the ideas, not the code — AGPL. |
| **agentpet** | 369 | **Swift on macOS** | MIT | The nearest thing to your Katara plan that actually exists, and permissively licensed. Worth reading before you write a line of Swift. |
| **OpenPets** | 1.2k | TypeScript | unverified | Separates *engine* from *character pack*. Do this early and Katara/Momo cost content, not code. |
| **Shijima-Qt / libshijima** | — | C++ | GPL-3.0 | Clean-room Shimeji engine — **and now archived.** A perfect illustration of your own "someone abandons their repo" argument. Borrow the model, never the code. |
| **Mate-Engine** | 3.7k | Unity + native plugin | mixed, some copyrighted | **Don't read the source** if you care about licence hygiene. Useful only as proof that a native plugin layer is the normal shape for a Mac port. |

**One structural recommendation:** define a single **pet-pack format** — a sprite atlas plus one behaviour file — shared by the C# and Swift engines. OpenPets, VPet and agentpet all converged on this independently. It means **Momo is a data file, not a third codebase.**

## Staying visible over WoW — three separate facts

1. **Exclusive fullscreen cannot be overlaid.** Not a permissions problem — the game's frames bypass the desktop compositor entirely, so there is no window stack to sit in. No API fixes this. **Use Borderless Windowed**, which WoW supports natively; on Windows 10/11 the old performance penalty for borderless is largely gone (per Microsoft's own DirectX team).
2. **Anti-cheat cares about injection, not visibility.** A separate top-level window the OS composites is the same thing Discord's overlay or a Windows notification does. What gets flagged is code *inside* the game process — hooks, injected graphics calls, memory reads. Aang does none of that. *Honest caveat: no vendor statement explicitly blessing external overlays was found; the "hundreds of tools coexist fine" claim traced back to a marketing page.*
3. **Staying on top needs re-asserting.** Always-on-top alone loses races against a game that re-asserts it on focus. The common pattern is a low-frequency re-assert plus a hook on foreground-window changes, with the no-activate and tool-window flags so you never steal focus. Widely used, but folklore-level — no canonical reference implementation found.

## Memory, if it matters

118 frames at 224×224 is **~23.7MB** if all are decoded and resident — double Aang's entire current footprint, so you're almost certainly decoding lazily already. Two improvements: pack frames into **one atlas image**, decoded once, blitting sub-rectangles (fewer decoder starts, better cache behaviour); or keep only the current state decoded and decode on transition, since transitions are rare relative to frames.

---

# 2. Making him remember

## CHANGES THE PLAN: your fact bug is architectural, and the fix is well established

The research is unambiguous: **deriving a single key from a noun is a lossy hash of a whole proposition.** No stop-word list fixes it, because the collision space *is* the problem. **Every serious system has abandoned key-based supersession.** Three replacements, cheapest first — and you should do all three.

### Fix one, free and deterministic: typed facts with declared cardinality

Store facts as **subject–relationship–object** instead of key→text. Your collision was between two different relationships that happened to share a surface word. As structured rows, `(Joshua, plays, WoW)` and `(Joshua, plays, guitar)` are simply different.

Then declare, per relationship, whether it can hold one value or many. `employer` is single-valued — a new one replaces the old. `hobby` is multi-valued — a new one just adds.

**The consequence is the important part: most contradiction checks become decidable with no AI call at all.** Pure logic, running free on your own machine. This is the cheapest correctness win available and it alone kills most of the bug.

### Fix two: similarity finds candidates, a model decides the relationship

The pattern used by the best-known open memory system, and it's the direct fix. Don't compute a key. For each new fact: find the 5–10 most *semantically similar* existing facts, hand that small set plus the new fact to a model, and get back one instruction per affected memory — **ADD / UPDATE / DELETE / NOOP**.

The property that fixes your bug: **similarity decides what competes, a model decides what wins.** "Plays WoW most nights" and "plays guitar" are nowhere near each other in meaning, so they never compete in the first place.

*Known failure mode, designed around up front:* that project has open reports of its resolver silently deleting memories the user still wanted. **Mitigation: never hard-delete. Soft-retire with a reason and a pointer to the fact that replaced it — which is what you already do. Keep that. Only fix what triggers it.**

### Fix three: two kinds of time

The most sophisticated approach keeps **four timestamps** per fact: when it became true and stopped being true in the real world, and when Aang learned and unlearned it. A contradicted fact isn't deleted — its "stopped being true" is set to the moment the new one started.

That's what lets a system answer *"what did I believe in March"* and *"what's true now"* from one table. For you it's a small change with a large payoff: **replace the retired boolean with valid-from and valid-to columns.**

**On the evidence:** the benchmark that actually tests knowledge updates and time reasoning is LongMemEval (arXiv 2410.10813). Vendor-reported scores between competing systems are *not* comparable across protocols — treat published margins as one team's claim. What *is* well established: nobody serious uses key-collision-prone supersession, and time-validity windows are implemented by only one major system.

## CHANGES THE PLAN: your caching instinct was right, and there's a named trap

Your constraint — retrieved memories ride in the message, never the instructions — is exactly the documented best practice. One changed character in the cached prefix invalidates everything after it.

**The named anti-patterns to check for:** retrieved chunks injected into the system block; user-specific details in the system prefix; and the classic silent killer — **a timestamp or "current time" line baked into the cacheable part.** Worth checking Aang for that third one today.

**On when to retrieve:** don't always-retrieve, and don't rely on the model choosing to search (the documented weakness of that approach: if it doesn't call the tool, the memory is simply lost). The practical heuristic that needs no classifier: **always run the search, but gate *injection* on quality** — drop anything below an absolute similarity floor, cap at 3–5 items and a hard token budget, and if nothing clears the floor, inject nothing. That's how you avoid flooding context: a relevance floor and a hard cap, not a bigger search.

## The search ranking fix is one line

Your positional interleave is the known-bad baseline. The standard fix is **Reciprocal Rank Fusion**: score each result as the sum of `1 / (60 + its rank in each list)`. `k=60` is the near-universal default.

It beat every alternative in the original 2009 paper and it is what Elasticsearch, OpenSearch, Weaviate, Qdrant and Azure all ship as their default. Score-based alternatives exist that preserve magnitude better, but **neither universally beats rank fusion**, and rank fusion is more stable when your index grows or your embedding model changes — which it eventually will.

**Ship rank fusion with k=60. One line, removes the pathology.**

## Moving memory housekeeping onto your own GPU

The architectural template has a name — **sleep-time compute**: a background agent sharing the same store, running while the machine is idle, on a model that costs nothing per token.

**Models people actually use for this in 2026:** Qwen3 8B is the consensus pick for reliable structured output at this size; Gemma 3 12B is strong at summarising within 8–12GB of video memory; Granite 3.3 8B is Apache-licensed and explicitly tuned for extraction work. Above 16GB, a 14B or a small mixture-of-experts closes most of the remaining gap.

**The wiring detail that decides whether this works:** you already run Ollama for embeddings — use the same server with its **JSON schema enforcement**. Guaranteed-valid structured output is the single feature that makes 8B extraction usable. Free-text parsing at 8B is where people get burned. *(Gotcha: on reasoning-capable models, turn thinking off, or your JSON ends up in the reasoning channel.)*

**Honest quality split, and it maps neatly onto your quota problem:** per-fact extraction and ADD/UPDATE/DELETE decisions against a small candidate set are narrow, schema-bounded tasks where 8B is genuinely adequate — **move that local and run it always.** Multi-step consolidation (merging a month into a coherent narrative, spotting subtle indirect contradictions) is where the sub-14B ceiling still shows — **keep a weekly deep pass on the frontier model**, where the cost is bounded and predictable.

One contrarian finding worth knowing: at least one 2026 paper argues keeping raw text verbatim can beat lossy fact extraction on cost-per-correct-answer. **Don't delete raw conversations once facts are extracted.**

## Projects worth reading

| Project | Licence | The one idea to steal |
|---|---|---|
| **Mem0** | Apache-2.0 | The whole ADD/UPDATE/DELETE/NOOP decision loop. Their prompt design is public. |
| **Graphiti / Zep** | Apache-2.0 | Two kinds of time. Invalidate by writing a timestamp, never by deleting. |
| **Letta (MemGPT)** | Apache-2.0 | Sleep-time consolidation as a background agent on a cheaper model. |
| **A-MEM** | MIT | New facts *enrich* related old ones instead of replacing them. |
| **Memobase** | Apache-2.0 | Typed profile slots — a key that structurally cannot collide with another. |
| **Cognee** | Apache-2.0 | Extraction, enrichment and retrieval as separate stages on different models. |

---

# 3. Being reachable when Shadow is off

This thread found the most, and it substantially changes how to think about the MacBook question.

## CHANGES THE PLAN: there's a route that deletes the whole problem

**Discord can POST directly to a web address instead of holding an open connection.** No gateway login at all — which means **no dual-login problem, no leader election, no identify quota, no split brain.** It runs free on Cloudflare.

**The catch, stated plainly:** it only delivers **slash commands and button presses**, not ordinary typed messages. So talking to Aang while out would mean `/ask something` instead of just typing.

If that trade is acceptable, **it deletes four of the five hard problems below outright.** It deserves serious thought before committing to the MacBook build.

## CHANGES THE PLAN: the MacBook plan has a failure mode that makes things worse

Discord caps connection attempts at **1,000 per 24 hours**. Exceed it and every session is killed **and your bot token is reset.**

This isn't theoretical. A real incident: a Discord integration with no reconnect guard fell back to full re-connection on every retry, burned the entire daily allowance, and had its token reset — **on multiple consecutive days in production.**

**The arithmetic for you:** a handover costs one connection. Flapping every 2 minutes is 720/day — survivable, but one bad night from a reset. **So: hard-cap handovers (say 6/hour, 30/day) and refuse to promote past the cap.** Also register a second bot as a cold spare, so a token reset isn't a dead weekend.

**The blunt conclusion from this thread:** a flapping leader that resets your token makes Aang *less* available than doing nothing at all.

## CHANGES THE PLAN: don't do leader election — two machines can't

**Two nodes cannot do correct leader election.** A majority of two doesn't exist, so every two-node scheme is a heuristic trading availability against split-brain.

But your situation isn't symmetric — Shadow is authoritative, the Mac is a standby. So **don't elect. Use a lease Shadow grants itself:**

- Shadow publishes `leader = shadow, epoch = N, expires in 45s`.
- The Mac connects only after **three consecutive** expired or unreachable readings.
- Shadow on startup **always** takes leadership and increases the epoch. The Mac sees a newer number and stands down immediately.
- **Timers are deliberately asymmetric:** the Mac promotes slowly (60–90s of confirmed silence) and demotes instantly. That turns "two leaders" from a standoff into a short, bounded window.
- Since Shadow shuts down on a *timer*, add a **graceful handoff** — on shutdown it publishes "nobody is leader, epoch N+1" and closes its connection. The Mac takes over in seconds in the normal case, and the slow timer only covers actual crashes.

**Fencing is not optional.** Stamp the epoch on every message sent and every memory write, and reject anything carrying a stale one. Without it you don't have a safe design, you have a split-brain bug on a delay.

**Skip Raft libraries.** A two-node Raft cluster tolerates zero failures — strictly worse than the above.

## CONFIRMED: never health-check with a ping

The Tailscale bug is real and documented. After a Mac sleeps and wakes, the network extension can fail while **ping keeps succeeding and TCP is dead** — and it persists until reboot. Related reports cover DNS stalling for minutes after wake.

**Consequence:** check health by opening a real connection and reading an application-level reply containing the current epoch and a fresh timestamp. Anything less and the Mac will promote itself against a living Shadow, or refuse to promote against a dead one.

## The single highest-value item here — and it helps you today

**Discord supports an idempotency token on sending messages.** Send the same one twice within the window and you get the original message back instead of a duplicate.

**Derive it deterministically from the message being answered.** Then if Shadow and the Mac both answer the same thing during a brief double-leader window, they collapse into one post rather than two.

This makes the worst-case failure **cosmetic instead of embarrassing** — and along with the catch-up fix below, it is **useful to Shadow on its own, even if the standby is never built.**

**The catch-up bug to avoid:** a replay handler that overwrites its "last seen" marker with each replayed message will move it *backwards* and re-deliver everything on the next sweep. The marker update must always take the **maximum** of old and new. This is a documented real bug in a shipping project.

Belt and braces: a processed-message table with a uniqueness constraint, checked before handling. And a cheap trick that genuinely works — **the handler adds a 👀 reaction first; if adding fails because it's already there, someone else owns it.** Not atomic, but it collapses the race to milliseconds and you can *see* it working.

## If you do use the MacBook as a server

- **Caffeinate does not survive a closed lid** — it blocks *idle* sleep, and lid-close is a hardware event that assertions never see. The actual lever is a system-wide sleep disable setting, which persists and must be undone explicitly. On Intel Macs it genuinely holds a closed lid (the "hardware always wins" caveat you'll read is Apple Silicon behaviour).
- Also set: no disk sleep, wake on network, and **restart automatically after a power failure.**
- **Auto-restart uses a system-level startup job, and needs a throttle interval** (60s or more) so a crash loop doesn't become a connection loop. *This is exactly where the restart problem and the token-reset problem meet, and it's the most likely way you lose the token.*
- **Silent hangs are the real failure mode** — auto-restart only catches processes that actually *exit*. Add a heartbeat file the bot touches every 30 seconds and a separate small job that kills it if the file goes stale.
- **Full-disk encryption plus auto-restart is a trap:** after an unattended reboot an encrypted Mac won't reach the login screen without the passphrase, so nothing starts. Only planned reboots can be authorised in advance.
- **The honest security note.** That machine's OS stopped receiving updates in August 2025 and never will again. It would hold a Discord token and an Anthropic key. What actually helps: **don't browse the web on it at all**, Tailscale-only access with no port forwarding, run as a non-admin user, and keep its credentials scoped and separately revocable from Shadow's. *(Patching it to a newer macOS via community tools was considered and isn't worth it — a 2017 Touch Bar model has a chip that made this historically painful, and you'd be maintaining a second fragile thing.)*

## Sharing memory between two machines

**The hard rule: never put the database in a file-sync service and write it from two machines.** Sync services copy the journal files out of step with the main file, which corrupts it even without concurrent access.

For two machines, best fit first:

- **Single writer plus an append-only journal — recommended.** Each machine owns its own file. The standby writes only a log of what it did, one line per event, stamped with the epoch and the message ID. Shadow replays it on next start. Conflicts are structurally impossible. Boring, and it works.
- **Litestream** — continuous streaming to cloud storage, single-writer by design, replica is read-only. Good if you want the Mac to *read* recent memory without owning it; needs an S3-compatible target (a free tier covers this). It's disaster recovery, not failover — **and it's a strong candidate for item 0.1, the backup, entirely separately from any Mac plan.**
- **LiteFS** — same single-writer model, adds a filesystem dependency on macOS you don't want.
- **rqlite / dqlite** — real failover, but two nodes means no quorum, and you'd rewrite every query. Overkill.
- **cr-sqlite** — the only option that genuinely merges concurrent writes. Costs ~2.5× on inserts, changes your schema, still young. Only justified if you truly want both machines writing. You don't.
- **Git as the bus** — fine for config, notes and the journal. Terrible for the binary database.

## Every option, honestly compared

| Option | Cost | Complexity | Verdict |
|---|---|---|---|
| **Do nothing** | £0 | none | Messages queue, Aang answers at startup. Already built. |
| **A "got it" acknowledger** on a free host | £0 | low | ~100 lines that only post *"got it, Aang's asleep, I'll answer when he's up"* and journal it. No model, no memory, no shared database, no meaningful leader election — if it double-posts, who cares. **The 80% answer at 10% of the work.** |
| **Discord's web-address route** | £0 | medium | Deletes the dual-login problem entirely. Costs you plain typing — `/ask` only. |
| **A spare Raspberry Pi** | £0 if owned | medium | Ideal if one's in a drawer. ~3W. Buying one beats a year of any rented server, but it's spend. |
| **Free cloud tier** | £0 | medium | Genuinely free and always on, but providers reclaim idle instances and the relevant free tier was cut back in mid-2026. |
| **Push notifications (ntfy)** | £0 | low | An alerting layer — *"Mac took over"*, *"Shadow died"* — not a responder. Useful alongside anything else. |
| **The MacBook standby** | £0 + ~£60/yr electricity | **high** | The only option that gives real answers while you're out. Also the only one needing everything above done correctly. |

**The thread's own recommendation, and it's a fair one:** the MacBook plan is buildable and every piece is known-good, but it's **four hard problems stacked**. If the goal is *"reachable"*, the acknowledger or the web-address route gets most of the value at almost none of the risk. If the goal is genuinely *"Aang answers while I'm out"*, build it — **but in this order**: idempotent sends, then the catch-up fix, then real TCP health checks, then the asymmetric lease with fencing and a hard handover cap, then journal replay instead of a shared database. **The first two are worth doing this week regardless.**

---

# 4. The art, priced

*Checked 2026-09-28.*

## PixelLab's prices

**Important caveat: the pricing page loads its numbers by script and returned nothing.** The subscription figures below come from third-party comparisons and a review, **not from PixelLab directly — confirm them on the live page before paying.** The per-generation prices *are* published as plain text and are reliable.

**Subscriptions (unverified):** roughly $12/mo for 2,000 credits, $24/mo for 5,000, $50/mo for 10,000.

**The trap that decides everything:** a basic generation costs **1 credit**, but the newer high-quality models cost **40 credits each**. So $12 is really ~50 good generations a month and $24 is ~125. **Every tool you actually need — interpolation, style-matching — is in the expensive band.**

**Per-generation prices (verified):** animation from text $0.022–0.042 (max 256×256, up to 16 frames); skeleton animation $0.044–0.062; eight rotations $0.029–0.038; and the ones that matter to you — **interpolation and style-matched generation at $0.095–0.185 each.** A cheaper style-reference tool exists but caps at 200×200, too small for your 224px frames.

## What it can and can't do

**Can:** generate in-between frames to smooth existing animation (exactly your stated complaint); work *from* an existing character to make new poses and states; and match a **new** character to an **existing** one's style — which is the Katara path. Your 224×224 fits inside the 256 animation ceiling, but only just.

**Can't, and this matters:** **frame count collapses as size grows.** A 32×32 sprite gets 16 frames per request; a 128×128 sprite gets **4**. At 224×224 expect roughly 4 frames per request — so every 12-frame state is three or more requests, **with no guarantee they're continuous with each other.**

**The known weakness is consistency**, which is precisely what a character set needs: *"the second frame is where a tool gives itself away — the proportions shift."* Holding a consistent one-pixel outline across a sprite set is called out as the hardest thing for a generator to do. A reviewer also notes results are notably worse at small sizes and that outdated tutorials mean burning credits while learning the settings.

*Honesty note: no genuine forum threads on PixelLab could be surfaced — searches returned marketing pages and SEO listicles. The consistency criticisms come from a comparison guide and a review, not from users.*

## What your three jobs would cost

Assumptions stated plainly: 224×224, ~12 frames per state, interpolation at $0.14 a call, and **a 3× retry multiplier — because AI pixel art at this size will not land first time.** That multiplier is really the whole estimate.

| Job | Clean | Realistic |
|---|---|---|
| Smooth Aang's 10 existing states (~110 gaps) | $15 | **~$46** |
| Katara, full character, 10 states | $15 | **$45–75** |
| Momo, 4 states | $3 | **$9–15** |

**Total: roughly $70–140 in per-generation costs, or $24–72 for two to three months of the mid subscription tier.** Budget **$50–100 all in.**

## The alternatives

| Option | Cost | For a developer? |
|---|---|---|
| **Aseprite** | **$20 once** | The default answer. Onion skinning, tag-based states, sprite-sheet export, and a scripting API you'd actually enjoy. **PixelLab ships as an Aseprite extension, so this isn't either/or.** |
| **LibreSprite** | Free (GPL) | Most of Aseprite's workflow at zero cost. Older codebase. |
| **Pixelorama** | Free, open source | Actively developed. |
| **Retro Diffusion** | **$20 once** | Runs **locally**, inside Aseprite. Strongest licensing story here — output is unambiguously yours. |
| **Sprixen** | $10/mo | Has a "style lock" aimed at exactly the consistency problem. |
| **Scenario / Leonardo** | $12–15/mo | Best consistency via custom-trained models, **but free tiers are non-commercial and neither does animation.** |
| **A human pixel artist** | $15–50/hr; **$20–70 per character** for an idle/walk/attack set; extra animations $10+ each | Genuinely competitive for a *stylistically coherent* Katara. **Momo's four states might be $40–80 total.** |

## Rights

PixelLab's FAQ permits commercial use with one restriction — **don't train models on the output** — and says images aren't stored. **The actual terms of service couldn't be loaded, so the FAQ is the source, not the contract. Read it before shipping.** Retro Diffusion generates locally so output is yours. Scenario and Leonardo free tiers are non-commercial — **nothing from them can ship.** With a human, negotiate rights explicitly and in writing; many commissions default to personal use only.

## The recommendation

**Buy Aseprite ($20). Fix the frame timing and add micro-idles before generating a single new frame.** Then, if you still want AI generation, spend one month of the mid tier (~$24) on interpolation and on **Momo — where the stakes are low enough that consistency failures are survivable.** Consider a human for Katara if matching Aang's style matters more than speed.

---

# 5. The job hunt

This thread found the most directly useful material of all five. Your architecture turns out to be *right* — two large, actively maintained projects independently arrived at the same shape. But several of your specific choices are now the outlier position.

## CHANGES THE PLAN: someone built your job hunt, at 100× the engineering, and it's MIT

**`career-ops-hq/career-ops`** — **72,966 stars, MIT licence, pushed hourly**, created April 2026. It runs *inside* an AI coding CLI (Claude Code among them), ships as a skill, and is local-first. Which is to say: **it is architecturally the same thing you built**, which is a genuine validation of your instincts.

What it has that you don't: **103 provider modules**, including dedicated ones for **Ashby, Greenhouse, Lever, BambooHR, Rippling and Workday — every ATS you target — plus Canada's own Job Bank**, which is directly relevant to Toronto.

**And here is the finding that matters most:** every one of those providers reads a **public, zero-authentication JSON or RSS endpoint. No browser at all.**

Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Rippling, Workday, iCIMS and more all publish open job-board endpoints. **If your sweep currently drives Chrome to *find* postings, that is wasted risk and wasted quota.** Browsers should be reserved for the apply step alone. This is free robustness sitting on the table.

Worth reading directly: their `docs/APPLY_AUTOFILL.md`, `docs/AUTOMATION.md`, and `providers/ADDING_A_PROVIDER.md`.

The second project, **`MadsLorentzen/ai-job-search`** (44,307 stars, MIT, active, only 6 open issues), is the same idea for Danish boards. Its *shape* is the lesson: one skill per board, a typed command-line tool under each, with real tests. The author's own funnel — 69 applications, 20 first interviews, 1 offer.

## CHANGES THE PLAN: your auto-submit is now the outlier

Both leading projects **deliberately never submit.** career-ops states it plainly: *"Career-Ops never submits. The agent prepares the responses, selects the options, types the text fields. You always click Submit."*

That's a product stance, not a technical limitation — and it has hardened into a norm across the open-source world in the last year.

You've accepted the risk and that's your call. But two things are worth knowing. First, the only credible causal study on AI-assisted applications (arXiv 2509.25054, a difference-in-differences study of a real labour platform) found that **time spent editing the draft correlated positively with success**, while the advantage from text-similarity alone **fell 51%** as employers shifted weight to verifiable history. Read that as: *your human-approval step is the part doing the work.* Second, the submit click is where the liability sits.

## CHANGES THE PLAN: the cheapest improvement available is a knock-out pre-scan

Before drafting anything, career-ops scans the form for disqualifying questions — work authorisation, years of experience, degree, salary floor — checks them against the profile, and **halts** rather than burning tokens tailoring for a role that will be auto-rejected on a form field.

**This is the single highest-value thing you could add**, and it matters doubly for you because of your quota. Ashby ships these as configurable auto-reject rules, so this *is* where automatic rejection genuinely happens.

Two more cheap wins from the same project: a **liveness check** that drops expired postings before you open a tab, and a **zero-token triage pass** — a read/write-only prompt that shortlists freshly scanned URLs against your profile *before* any token-spending evaluation.

## CONFIRMED: the ATS rejection myth

**"75% of resumes are rejected by an ATS before a human sees them" is folklore.** It traces to a ~2012 marketing claim by Preptel, a resume-optimisation startup that shut down in 2013. No methodology, no sample, never published. The figure drifts between 70%, 75% and 88% because **there was never a source.**

What evidence exists points the other way: a structured study of 25 US recruiters across 10+ ATS platforms found **92% said their system does not auto-reject** on formatting, design, gaps or keywords. (Small sample, honestly disclaimed by its authors.)

**What actually auto-rejects is knock-out questions** — employer-configured form fields. They act on *what you type into the form*, not on your document. Hence the pre-scan above.

**On formatting, there is real evidence** — a scan of 22,901 resume PDFs: 32.7% used tables (parsed in unpredictable order), 22.1% put contact details in headers or footers (many parsers only read the body layer), 8.8% were true two-column (parsers read across and fuse unrelated sections). Only 5.8% were clean. **But "PDF fails, always use .docx" is folklore** — both parse fine; failure tracks layout complexity, not file type.

Stronger than any parser argument: eye-tracking of 30 recruiters found a **7.4-second** average initial scan, with multi-column layouts performing worst. **Keep the layout simple for the human, not the robot.**

Also folklore, and not to be cited: "tailoring doubles interviews," and any "aim for a 75% match score" advice — no published validation links those scores to interview rates.

## CHANGES THE PLAN: your LinkedIn risk is real but you're measuring the wrong thing

**Your volume is not your exposure.** LinkedIn added a product-enforced Easy Apply cap of roughly **50 per 24 hours** (unpublished, reported since around August 2025). Your 5/day with a hard 8 sits an order of magnitude below it.

**What actually gets accounts banned, in every readable first-hand account: profile-view and search velocity, and new-account signals.** Not applying. One documented case: a user manually searched ~55 colleagues' names, got a passport-verification demand, then a permanent ban with no explanation given.

**No first-hand account of a ban specifically for Easy Apply automation could be found anywhere.**

But when enforcement does land it is severe: **appeals routinely fail, and there is no human to reach.** Everything quantified about "safe thresholds" — the 15/day rules, the fingerprinting advice — traces back to companies selling automation. Treat it all as marketing.

**So the practical guidance is:** your application cap is fine. **Watch what else the session does** — profile views, searches, connection requests. That's the exposure.

**Legally, your personal risk is effectively nil.** Every LinkedIn defendant has been a commercial operation using fake accounts at scale. No reported action against an individual job seeker. Scraping isn't a crime — it's a contract breach that LinkedIn sues *companies* over.

**Indeed: stop trying.** As of July 2026 every request returns a 403 behind a Cloudflare verification wall — datacentre, residential and stealth alike, even the bare homepage. The consequence isn't an account ban, it's that **you simply never get through.** Drop it and spend the effort on the 103 providers that answer without a fight.

## CHANGES THE PLAN: Katara doubles your fingerprint exposure

A second instance means a second LinkedIn account, driven the same way, from the same machine and network. **Worth thinking through before it's built**, given enforcement is opaque, permanent and un-appealable.

## The graveyard, and what it tells you

This space rots faster than almost any other. Do not build on these:

| Project | Stars | State |
|---|---|---|
| **AIHawk** | ~30k | **Gone.** The famous auto-applier now redirects to the author's *anti-detection stealth browser* product. He abandoned the job applier and pivoted to selling undetectability. **The loudest signal in this entire space.** |
| **JobSpy** | 4,361 | **Seven months cold.** Still the most-recommended scraper on Reddit. 67 open issues including "Indeed scraper hangs indefinitely" and "description empty for LinkedIn," all untouched. |
| **JobFunnel** | 2,192 | Archived. |
| **open-resume** | 8,908 | Dead since 2024, 145 open issues — but its resume-parser source is still the best free reference for how a parser actually sees a PDF. |
| Four LinkedIn Easy Apply bots | 175–1,151 | All dead, 2023–2025. |
| **ApplyPilot** | 1,650 | 78 open issues including "doesn't work out of the box" and config keys silently never read. Impressive README, broken product. |

The one LinkedIn bot still actively patched (`GodsScion/Auto_job_applier_linkedIn`, 2,880 stars, MIT) tells the story through its issue titles: *"Harden LinkedIn job parsing and pagination against DOM changes."* Constant firefighting against a hostile site. **That is the maintenance cost of the LinkedIn path, permanently.**

## Known landmines in the ATSs you target

From career-ops' own field notes — you'll hit these if you haven't:

- **Lever** pops a captcha when checkboxes or radio buttons are clicked programmatically. Their fix: fill text and dropdowns only, hand checkboxes and the captcha to the human.
- **Ashby** merges candidates by email — reapplying silently collides with your existing profile. Pre-check and warn.
- **Workable** re-renders constantly and invalidates element references; paste via clipboard and re-find the element immediately before each paste.
- **Greenhouse, Ashby and Lever dropdowns** rebuild the page on every keystroke. Type character by character and re-scan; never hold onto a reference. Never read a 1,000-option dropdown into context — set it by value.
- **Workday is unsolved by anyone.** Dynamic element IDs, no stable selectors, per-company account creation. Every open-source attempt covers basic contact fields and nothing more.
- **No maintained BambooHR or Rippling form-filler exists anywhere.** You may be ahead of the field there — which also means nobody will fix it for you.

## The market context, which is worth knowing

Applications per job are up **111%** since 2022 (≈115 → 244); applications per recruiter up **~412%** while recruiting teams shrank 55%. Greenhouse's CEO calls it the "AI doom loop." 65% of hiring managers report catching deceptive AI use, and 38% of candidates now walk away from AI interviews.

Also relevant to how you use this: **Anthropic banned AI on job applications in February 2025, then reversed in July 2025 to actively encourage it.** The live-interview ban stayed.

## Follow-up timing: there is no evidence base

Be warned that this area is almost entirely folklore. The commonly cited "follow up within a week for a 30% lift" and the "2023 study of 1,200 job seekers" have **no locatable primary sources.**

The only solid numbers run the *other* direction — recruiters emailing candidates: a first email gets ~8% reply, one follow-up roughly doubles it, a third adds ~4%, a fourth adds ~1%; roughly 6-day intervals; three messages total is optimal. Directionally suggestive, not transferable.

**Don't encode follow-up cadence as if it were science.**

---

# What to do with this, in one page

The findings that would change what you build:

1. **Read `career-ops` before touching the job hunt again.** 73k stars, MIT, active hourly, same architecture you invented — with ready-made modules for all six of your ATSs plus Canada's Job Bank, all reading **public JSON APIs with no browser.** If your sweep drives Chrome to *find* jobs, that's wasted risk and wasted quota.
2. **Add a knock-out pre-scan.** Check the disqualifying form questions *before* spending tokens tailoring. Cheapest high-value addition available, and it directly protects your quota.
3. **Don't build the Mac click-through workaround.** It doesn't just cost effort — it causes the bug it's meant to prevent. Never touch that one property and per-pixel click-through works natively.
4. **Fix animation timing before buying frames.** A monotonic clock, uneven holds, easing, and ten micro-idles. Likely saves $50–100 *and* gets a better result than interpolation would.
5. **Fix the fact bug with typed relationships and declared cardinality first.** Free, deterministic, runs on your own machine, kills most of the collapse. Then add similarity-plus-a-model for the rest. Never hard-delete.
6. **Two MacBook prerequisites are worth doing this week regardless** — idempotent sends and the maximum-watermark catch-up fix. They improve Shadow on its own, and they decide whether a future handover is cosmetic or embarrassing.
7. **Consider Discord's web-address route before committing to the MacBook.** If you'd accept typing `/ask` while out, it deletes four of five hard problems for free.
8. **Your LinkedIn caution is aimed at the wrong thing.** Your 5–8 applications a day sit an order of magnitude under LinkedIn's own ~50/day cap. The documented ban triggers are **profile-view and search velocity**. Watch what else the session does. And drop Indeed — it's been returning a hard block to everyone since July 2026.

Three sentences worth keeping:

> **A flapping standby that resets your bot token would make Aang less available than doing nothing at all.**
>
> **The most famous job-application bot in the world abandoned job applications and pivoted to selling anti-detection software.** That's the clearest available statement about where that path leads.
>
> **The "75% of resumes are rejected by robots" figure came from a startup's 2012 marketing and the startup died in 2013.** What actually auto-rejects is the form questions, which is a thing you can check for free.
