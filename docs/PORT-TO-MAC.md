> **SUPERSEDED (2026-10-04).** This is history. The one plan is [`FINAL-AANG-BUILD.md`](FINAL-AANG-BUILD.md): every item here was checked against the code and either built, folded in as a step there, or written into its "Not doing" table with the reason (decision 47). Do not act on this document.

# Porting Aang to the MacBook

Written 2026-09-23 against `main` at `81d106f`. Nothing in the repo was changed to produce this. Every code
claim below carries a `file:line`; every external claim carries a URL; anything I could not source is labelled
**inference** or **no source found**.

This reverses the ROADMAP note at `docs/ROADMAP.md:164-166` ("Aang stays on the Shadow PC... I'm final about
this") and revives the text of retired Phases C, E and P.

---

## 0. Questions I need answered before any of this starts

### 0A. Decisions only you can make

**A1. The MacBook is the weakest part of this plan, and it blocks everything.** (blocks all steps)

You are proposing to move the component that reads your email, your web pages and your screen onto a machine
that Apple stopped patching in August 2025 and listed obsolete on 2026-08-31, with 43% battery health and
14 GB free of 128 GB. Every other security decision in this document is downstream of that one fact. A
Node 24 build exists for it (macOS 13.5 is the floor, you have 13.7.8, and Intel macOS is Tier 1 in Node 24,
[nodejs BUILDING.md](https://raw.githubusercontent.com/nodejs/node/v24.x/BUILDING.md)), but Node 24 is likely
the **last** major with Tier-1 Intel macOS binaries: on `main` it is already downgraded to Experimental
([PR #63055](https://github.com/nodejs/node/pull/63055)). So this machine has a visible end date as a host.

Options:
- **(a)** Proceed as planned. Compensate with Tailscale grants, FileVault, the sandbox and the step-1 fixes.
- **(b)** Buy the used M1 Mac mini **first** and skip the MacBook as brain host entirely.
- **(c)** Proceed, but with a date: MacBook as brain until X, mini by then.

**My recommendation is (b) if a mini is within reach now.** Every step below has to be done exactly once
either way, the porting work is identical, and doing the host prep twice (step 0, step 4) on a machine with
14 GB free and a failing battery is the expensive path. The "restore a backup and swap" design you asked for
is good, but not needing it is better. This is the single biggest decision here and I will not assume it.

**A2. FileVault on means Aang is down after every reboot, and you cannot fix that remotely.** (blocks step 0
and 4)

A user LaunchAgent needs a logged-in user. The Standalone Tailscale client also does not run before login
(Tailscale's own variant table gives "Run before login: no" for both App Store and Standalone; only the
headless open-source `tailscaled` says yes,
[macos-variants](https://tailscale.com/kb/1065/macos-variants)). With FileVault on, the disk is not even
unlocked until you type the password at the machine. So: **any reboot or power cut while you are away kills
Aang until you physically log in.** There is no remote recovery, and a general remote-access door is out of
scope by your own rule.

Options: (a) FileVault on, accept manual login after any reboot; (b) FileVault off plus auto-login, accept
that anyone with the laptop has everything, including `google.json` and `discord.token` in plaintext;
(c) FileVault on with `tailscaled` headless instead of the GUI client, which still does not solve the
LaunchAgent, so it does not actually help.

**Recommendation: (a).** You are away sometimes, not always, and (b) trades a real and permanent weakness for
convenience. But you should decide knowing the cost, because it contradicts "the brain is always there".

**A3. Proactive messages with two pets open.** (blocks step 2)

`announce()` sends to every desktop socket (`core.ts:1488` via `sendTo`, `core.ts:1103`). With two pets, every
unprompted line appears twice. Which pet should get it?

Options: the machine you last touched (the `desk` message at `protocol.ts:86` and `core.ts:1147` already
carries exactly this signal, it is just collapsed into one global `atDesk` flag at `core.ts:1093`); both; the
Mac always. **Recommendation: last-touched, falling back to the Mac, falling back to Discord** (the existing
`whereHeIs()` rule at `core.ts:1098-1102`, made per-device). Confirm.

**A4. Who may answer a permission prompt.** (blocks steps 1 and 2)

Today any socket can answer any prompt: `core.ts:1228` never looks at which socket replied, and
`answerPermission` (`core.ts:1669-1675`) matches on id alone. The fix binds the answer to the socket that was
asked. But if the question was asked on Shadow and you have walked to the Mac, should it follow you?

**Recommendation:** ask on the pet the request came from (`askPermission` already does this at
`core.ts:1636`); if no answer in 60 seconds and a different pet reports you active, invalidate the first
question and re-ask there. Slightly more code, and it keeps one question live at a time. Yes or no.

**A5. "Yes" in Discord currently means "always, forever".** (blocks step 1)

`discord-gateway.ts:165` sends `choice: allow ? 'always' : 'no'`, and `core.ts:1651` writes that straight into
standing trust. Meanwhile `core.ts:1636` routes questions to Discord whenever you are away. So the surface
with the shortest question (1300 characters for mail, `mail.ts:208`) and the least context is the only one
that writes permanent grants. This is a live bug, not a move problem.

Options: (a) Discord Yes means once, with a separate Always button; (b) Discord Yes means once, and "always"
can only be granted at a desktop; (c) leave it. **Recommendation: (b).**

**A6. The PIN.** (blocks step 1)

You said sending an email or a file from Discord needs a PIN on top of the tap. I need four answers: length;
where it lives; lockout policy; and what it covers.

**Recommendation:** 6 digits; stored as a scrypt hash in `stateDir` (not the Keychain, because a
launchd-started process reading the Keychain can block on a GUI prompt with nobody there to answer it);
5 wrong tries then 15 minutes locked; covers (i) sending email, (ii) `send_to_phone`, and (iii) any "always"
grant requested from Discord. Confirm or change each.

**A7. Obsidian: what happens to a note with no `retrieval_status`.** (blocks step 5; your question (a))

Your own doctrine answers this. `20_Knowledge/Ops/RAG Ready Knowledge Map.md` says, in a callout:
"Retrieval uses validated current knowledge. It does not learn from the whole archive by default." Treating a
missing field as include contradicts that sentence directly.

**Recommendation: exclude, and print a report.** The indexer names every note it skipped for a missing field,
so the gap is visible instead of silent, and you either fix the frontmatter or accept the exclusion. Agree?

**A8. Obsidian: `privacy_class` is the question you did not ask, and it is the important one.** (blocks step 5;
answers your question (b))

I read `10_Projects/Raven/Raven Private Browser Boundary.md` in your vault. It carries
`retrieval_status: include` **and** `privacy_class: private`, and its own text says Raven data "does not enter
normal Obsidian or Google Drive" and "does not appear in... handoff summaries". Aang answers into Discord,
which is someone else's server, and drafts emails. Your metadata contract lists `privacy_class` as a required
field but never says what retrieval should do with it.

Options: (a) index `private` notes but never let them be quoted into Discord or into an email draft, desktop
only; (b) do not index them at all; (c) no restriction. **Recommendation: (a).** That also answers Raven: its
6 notes index, and the privacy rule handles the exposure. Your call.

**A9. Aang's own decisions into `20_Knowledge/Decisions`.** (your question (c))

**Recommendation: yes, using `80_Templates/CereBro Decision.md`, but written by a Claude Code session you run,
never by Aang the agent.** That keeps "Aang does not write into my vault" literally true rather than
approximately true, and it is the distinction that makes the rule enforceable. Agree?

**A10. Tailnet Lock: I recommend NOT doing it, which deviates from your list.**

With two devices, both must be signing nodes (minimum two,
[Tailnet Lock](https://tailscale.com/kb/1226/tailnet-lock)), and "If you lose your disablement secrets, and
you did not provide one to Tailscale support, the tailnet cannot be recovered." Your second signing node is a
2017 MacBook with a failing battery. The threat it defends against is Tailscale itself being compromised; the
isolation you actually asked for comes from the grants in step 0. **The failure mode is worse than the
threat.** Your call, since it is on your list.

**A11. Capability I want to take away, and what it costs.** (blocks step 2)

On 8 GB I want to cap chat lanes at 2 live (today 3, `core.ts:1017`) and background jobs at 1 (today
`MAX_RUNNING = 2`, `worker.ts:35`). Cost: switching to a third lane costs a process restart, which is cheap
because session resume already exists (`core.ts:1050`, `sessions.ts`); and two jobs cannot run at once.
Accept, or keep 3 and 2 and let macOS swap? See the RAM budget in section 5.

**A12. `gmail.compose` can send email by itself.** (blocks step 1)

`tools/google-setup.ps1:39` requests `gmail.compose`, which authorises `messages.send`. The only thing between
an injected turn and a sent email is in-process code: the hash gate at `mail.ts:187` and the prompt at
`core.ts:386`. I can price a narrower scope, but it changes what Aang can do with drafts. Do you want that
priced, or do you want to keep compose and rely on the PIN plus the hash gate?

### 0B. Things I need you to check on the MacBook

These are the ones that change the plan, not just fill it in. Full commands in section 9.

- **B1.** Does `@anthropic-ai/sandbox-runtime` actually run on Intel macOS 13? Anthropic states no minimum
  macOS version and makes no Intel claim; its macOS path is JavaScript plus the system `sandbox-exec`, which
  is formally deprecated in its own man page. If it does not run, step 1's sandbox line is void and I need to
  know before I plan around it. (blocks step 1 and step 4)
- **B2.** Real free disk after a cleanup pass. 14 GB is not enough for `node_modules`, a Playwright Chromium,
  an embedding model, backups and macOS swap. (blocks step 4)
- **B3.** The 22 colour groups in `.obsidian/graph.json`, so the AiVatar group I add follows the existing
  path-keyed pattern instead of inventing one. (blocks step 5)
- **B4.** How many of the 68 notes actually carry `retrieval_status` and `privacy_class`. This decides whether
  A7 excludes 3 notes or 50. (blocks step 5)
- **B5.** Free RAM at idle with your normal apps open. My budget in section 5 assumes about 3 GB for macOS and
  I would rather measure it. (blocks step 4)
- **B6.** Which Tailscale build is installed (Standalone, App Store, or open-source). The App Store one is
  sandboxed and its local API behaves differently. (blocks step 0)
- **B7.** Whether `~/.claude/settings.json` on the Mac has anything of yours besides Aang's five hooks, since
  step 4 rewrites that file. (blocks step 4)

### 0C. Things I would like but can proceed without

- **C1.** Which Mac mini you are considering, and its RAM. 8 GB versus 16 GB changes section 5 entirely.
- **C2.** Whether the Mac pet should ship as a real signed `.app` bundle. macOS grants Accessibility and
  Screen Recording to a *binary*, and a bare command-line tool launched by launchd is the known-bad case for
  making those permissions stick. A proper bundle is more work and far less fragile. (affects step 6)
- **C3.** Whether the Discord bot is in any server other than yours.

---

## 1. What this actually is, in plain English

Right now Aang is one program on the Shadow PC. It holds the memory, talks to Claude, and does things to the
machine directly: it runs PowerShell, it reads the registry to find apps, it launches a screen reader
executable. The pet on your screen is a thin window that draws Aang and forwards your typing.

Moving the brain to the MacBook breaks that arrangement in a specific way: the brain will be on one machine
and your hands will be on another. So the work is not "copy the folder across". It is three things:

1. **Teach the brain that there are two machines.** Today it says "the desktop" and means one computer
   (`core.ts:550`, `:626`, `:675`, `:717`). Every pet needs a name, and everything the brain sends has to be
   addressed to one of them.
2. **Stop the brain touching any machine directly.** Everything it does to a computer today (open an app, read
   a window, run a command, read the clipboard) has to become a request to a pet, which does it and reports
   back. That is roughly 17 tools, not the 6 the retired Phase E listed.
3. **Make it impossible for two brains to run.** The Windows pet currently starts a brain whenever nothing is
   listening on its own machine (`CoreSupervisor.cs:79`, which only checks `127.0.0.1`). After the move it
   would start a second one on top of the Mac's, and both would log into the same Discord bot and answer you
   twice with two different memories.

**The biggest risks, in order.**

- **The host itself.** An unpatched OS on a dying laptop, holding your mail token, your Discord token and
  every conversation you have had. See A1 and A2.
- **Eleven live security holes on Shadow today**, four of which I would call critical. The worst needs no
  model, no injection and no permission: any web page you open can connect to Aang's WebSocket and ask it for
  every fact it holds, your last 200 conversation turns, and the full text of every pending email draft
  (`core.ts:1164-1165`, `core.ts:406-418`, `memory.ts:305`). These exist now, on the machine you are using.
  They get worse when the socket has to cross a network.
- **8 GB of RAM.** Every model lane is a separate Claude process. I measured one at 221 MB and the Core itself
  at 278 MB on your machine right now. Add a headless Chromium and an embedding model and it is tight.
- **Memory silently switching off.** `memory.ts:39` only opens `aang.db` if the file already exists, and
  nothing in the repo creates the tables. On a fresh Mac, Aang would run with no memory at all and never say
  so.

**What changes for you day to day.**

- Aang keeps running when Shadow is off, which is the whole point. Discord reaches him at any hour.
- Two Aangs on screen if you want them, one on each machine, and you choose.
- Things that touch a computer go to the machine you asked from. When Shadow is off, they go to the Mac.
- Sending an email or a file from Discord gains a PIN.
- After a MacBook reboot, you have to log in at the machine before Aang comes back (A2).
- Memory resets at the move, which you have already accepted. `Brain/profile.md` and `~/job-hunt-data` carry
  over.

---

## 2. Verification table

Verdicts are CONFIRMED / DENIED / PARTLY / CAN'T VERIFY. Line numbers in your list were close but often off;
the real ones are given.

### 2.1 Routing and two pets

| ID | Verdict | Evidence and correction |
|---|---|---|
| R1 | **CONFIRMED**, understated | `core.ts:867` `new WebSocketServer({ host: '127.0.0.1', port: this.cfg.port, path: '/body' })`. `onConnection` (`core.ts:1067-1078`) registers only `message` and `error`: no `verifyClient`, no Origin check, no token, no `close` handler. **Corrections:** the port is not hard-coded in the Core, `index.ts:8` reads `AANG_PORT`. And the real blocker is the opposite of the stated risk: `127.0.0.1` means a Windows pet **cannot reach a Mac Core at all**. The moment that bind opens up, "no authentication" stops being theoretical, because an unauthenticated `submit` reaches a lane holding `mcp__aang__run`. Also `parseFromBody` (`protocol.ts:128-134`) validates only `typeof v.t === 'string'` then blind-casts. |
| R2 | **CONFIRMED**, understated | `protocol.ts:84`, `core.ts:1142`, defaults at `core.ts:1095` and `:1104`. **Correction:** `v` and `pid` *are* sent (`CoreLink.cs:35`) and thrown away; the hello case never reads them, and there is no protocol version check. Worse than "no identity": an unknown socket is silently promoted to **desktop**, the kind that receives `hands.request`, `look.request`, `clipboard.request` and permission prompts. |
| R3 | **CONFIRMED**, with three corrections | Real lines: `toTurn` `core.ts:1106`; announcements `core.ts:1488`; held messages `core.ts:1594`; permission prompts `core.ts:1636` and `:1657`; hands/look/clipboard `core.ts:556`, `:601`, `:724`. **(1)** `handsPending` is a `Map` keyed by id (`core.ts:543`), not a single slot; only `looking` (`:592`) and `clipboard` (`:713`) are. **(2)** Far worse than "first reply wins": `PetWindow.cs:416-417` dispatches `hands.request` unconditionally, so a close, force-quit, arrange, media key or clipboard-set **fires on both machines** and one result is reported. `look.request` screenshots both, and the Core keeps whichever arrives first, so Aang can describe the wrong computer's screen with full confidence. **(3)** The single `looking` slot also starves: `core.ts:626`, `:675`, `:1500` all bail if it is set. |
| R4 | **CONFIRMED**, understated | `core.ts:1220-1227` (presence), `:1244` (mute), `:1147` (`desk`), `:744` (`ActivityLog`). Both pets push presence on connect and on every foreground poll (`PetWindow.cs:224`, `:523`, `:585`). **Correction:** the consequence is not just "last pet wins". `activity.record` stores an **HWND** (`core.ts:1225`) which `readScreen` hands to `AangReader.exe` running in the Core's own process (`core.ts:574`, `screen.ts:19-20`, `:57-62`). Pet B's window handle used on the Core's machine is a meaningless integer, and on a Mac the reader does not exist at all. |
| R5 | **CONFIRMED** | `core.ts:1218` → `stopActive` `core.ts:1365` `if (!t \|\| !t.sub \|\| (id && t.sub.id !== id)) return;` so an absent id skips the guard. `core.ts:1228` never consults `ws`. **Additions:** the Windows pet always sends an id (`PetWindow.cs:903`), but **Discord sends `stop` with no id** (`discord-gateway.ts` `stop()`), so a Discord tap kills whichever pet's turn is live. And a Discord yes writes a standing grant (A5). |
| R6 | **CONFIRMED**, understated | `{t:'ping'}` exists (`protocol.ts:40`) and the pet answers (`PetWindow.cs:460-461`), but nothing in `src/Core/src` ever sends it and `ws.ping()` is never called. No `close` handler, no heartbeat. **Correction:** `clientsOf` filters on `readyState === OPEN` (`core.ts:1095`), which stays OPEN through a power cut until TCP keepalive expires, hours later. So `whereHeIs()` keeps returning `desktop`, `atDesk` stays `true`, and **everything proactive goes into the void instead of to Discord**; every permission question blocks for the full `PERMISSION_TIMEOUT_MS = 120_000` (`core.ts:129`) before being refused. |
| R7 | **PARTLY** | Right instinct, wrong lines, wrong certainty. Learning is `core.ts:878` `if (remote) this.macAddr = from;`; the early return is `core.ts:843`; the "unreachable" string is `core.ts:1207`. **`runOnMac` will not reliably return false:** `macAddr` is now persisted in `mac.json` (`core.ts:817`, `:825`), so a Mac-hosted Core starts holding the Mac's own address and POSTs to its own listener, which accepts any `^100\.` peer (`macsetup.ts:40`). **What the claim misses is worse:** `remote` is used as a synonym for "is the MacBook" in three places and all three invert. `core.ts:878` would repoint `macAddr` at **Shadow**, which runs no listener; `core.ts:882` labels a Windows session as running on the Mac; `core.ts:906` rewrites its announcement to "Claude Code on the MacBook" and a click then tries to bring Claude forward on the wrong machine. The failure is mislabelling plus address poisoning, not a clean "unreachable". |

### 2.2 Windows pet

| ID | Verdict | Evidence and correction |
|---|---|---|
| B1 | **CONFIRMED** | `PetWindow.cs:31` `new CoreLink(new Uri("ws://127.0.0.1:47831/body"))`; `CoreLink.cs:35` sends `{t:"hello", v:1, pid:...}`. **Correction:** the address is hard-coded in **two** places, `PetWindow.cs:31` and `PetWindow.cs:256` (`new CoreSupervisor(47831, ...)`). `Config` (`Support.cs:102-131`) has no core URL or port field and there is no command-line override, so pointing the pet at a Mac needs a code change and a rebuild. `CoreLink.cs:43` also reconnects every 1.5 s forever with a swallowed exception. |
| B2 | **PARTLY** | Mechanism confirmed: `CoreSupervisor.cs:79` `if (PortInUse())`, and `PortInUse` (`:63`) probes **`127.0.0.1` only**, so a Mac Core is invisible to it. Gated by `--no-core` (`PetWindow.cs:173`, `:252-259`); autostart is a Startup-folder shortcut turned on automatically on first run (`Support.cs:16-38`, `PetWindow.cs:254`). **Correction on Discord:** the start is not unconditional, `index.ts:22-24` gates on `discord.token` existing. And two Cores on the *same* host cannot both reach it, because `core.start()` rejects on `EADDRINUSE` and `index.ts:19` is a top-level await, so the second process dies first. The real risk is the **cross-machine** case: Mac Core plus Windows-local Core, each binding its own loopback, each finding its own token file, both connecting the same bot, and you get every Discord message answered twice by two brains with divergent memory. |

### 2.3 Tools that assume Windows

| ID | Verdict | Evidence and correction |
|---|---|---|
| T1 | **CONFIRMED** | `run.ts:21` `spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command', command], ...)`. **Correction:** it fails **closed and loudly**, not silently. `spawn ENOENT` reaches `run.ts:36` and returns "Could not run it: spawn powershell.exe ENOENT". It is also the only shell path, since the SDK's own shell tools are disallowed outright (`tools.ts:258`, used at `core.ts:1039`). |
| T2 | **CONFIRMED**, incomplete | `reg.exe` `open.ts:51` and `:137`; `where.exe` `:94`; `Get-StartApps` via powershell `:107-108`; `.lnk` via `WScript.Shell` `:237-238`; `explorer.exe` `:209`, `:214`, `:222`. **What it misses:** `open.ts:32` classifies paths by drive letter or UNC, and `START_MENUS` (`:61-64`) resolves to non-existent paths on macOS whose `readdirSync` throws and is swallowed (`:69`). Net result: `findApp` always returns null and `open` answers "X is not installed: it is not in the Start menu, the App Paths registry or on PATH" (`open.ts:186`) for **every app**. Confidently wrong, not an error. |
| T3 | **CONFIRMED**, both halves | `claude.ts:98` `spawn('rundll32.exe', ['url.dll,FileProtocolHandler', ...])`, with a comment at `:96-97` saying `explorer.exe` was already tried and failed, so there is no fallback. Transcript read at `claude.ts:114-116`, called from **two** places, `claude.ts:163` and `hooks.ts:130`. **Correction:** this is **already broken today**. `core.ts:877-882` marks tailnet hook events as `host: 'mac'`, but `hooks.ts:130` reads `transcript_path` unconditionally, so the Mac's transcript path is read on Windows, fails, and `lastSaid` stays empty (swallowed at `claude.ts:124`). The move inverts the failure rather than creating it. |
| T4 | **PARTLY** | `read_window` is right: `screen.ts:19-20` resolves `AangReader.exe` (overridable via `AANG_READER`), `:62` spawns it with `--hwnd`, and `Reader.csproj:11-12` is `net10.0-windows` with `UseWPF`, so it cannot even be built on macOS. **But `uia.ts:35` does not use an hwnd.** `uia.ts:30-33` builds `['--act','--app', a.app,'--do', a.do, ...]`, driven by an app name or title fragment the model supplies (`tools.ts:559-567`). Both fail closed: `screen.ts:57` and `uia.ts:29` check `existsSync` and return "the window reader is not built". |
| T5 | **PARTLY** | `files.ts:28-31` **CONFIRMED**: `SystemRoot`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData` all fall back to literal `C:\` strings that can never match a POSIX path, so `/System`, `/Library`, `/usr`, `/Applications` are all writable. `phone.ts:55-59` **CONFIRMED**: no Keychain paths, no `~/Library/Application Support`. `organise.ts:30-31` **overstated**: six of its ten names (`Documents`, `Desktop`, `Downloads`, `Pictures`, `Music`) do exist on macOS; what is missing is `Library`, `Applications`, `Movies` and `Public`, so a whole-`~/Library` delete passes `tooBroad`. `uia.ts:51` **confirmed in code but moot**: `BROWSERS` has no `safari` and `Google Chrome` will never equal `chrome`, but `runAct` short-circuits at `uia.ts:29` because the reader does not exist, so the hole is latent. `phone.ts:75` **overstated**: `.sh`, `.py` and `.jar` *are* covered; `.app`, `.pkg`, `.dmg`, `.command`, `.scpt`, `.workflow` are not. |
| T6 | **CONFIRMED**, and more | All six cited spots are real: `tools.ts:151`, `:470`, `:487`, `:507`, `:569`, `:586-587`. **Additions:** the system prompt itself teaches PowerShell (`voice.ts:22-23`), and `worker.ts:38` hardcodes "Joshua's Windows PC (a Shadow cloud PC)" into the worker prompt. Confirmed: **no tool reports which host it runs on**, and `what_im_doing` reports the *pet's* window, not the Core's machine. |

### 2.4 Data and lifecycle

| ID | Verdict | Evidence and correction |
|---|---|---|
| D1 | **CONFIRMED** | `index.ts:10`; `files.ts:15-16`; `organise.ts:16-17`. **Mitigating correction:** all four have environment overrides (`AANG_STATE_DIR`, `AANG_DATA_DIR`, `AANG_UNDO_DIR`, `AANG_TRASH_DIR`). This is a plist fix, not a code fix. `dataDir` (`~/Documents/Aang`) already works on macOS unchanged. |
| D2 | **CONFIRMED** | `memory.ts:37-44`: `if (existsSync(file))` with no `else`. Every method guards on `if (!this.db)` and no log line is emitted on the not-exists path (`memory.ts:46` only fires on a throw). **Where the schema lives today: nowhere in `src/`.** The only `CREATE TABLE` statements in the repo are in tests, and `test/safety.test.ts:49` says so outright. I read the live schema out of `aang.db` directly: `turns`, index `turns_ts`, `turns_fts` (fts5), `embeddings`, `facts`, `meta`, plus three dead tables (`cache`, `topics`, `journal`) referenced nowhere in `src/`. `PRAGMA user_version` is **0**. See step 2f for the fix. |
| D3 | **CONFIRMED** | `index.ts:17` is the only signal handler. **What is actually lost** (`core.ts:945-961`): a pending permission is abandoned rather than answered no; `reminders.stop()`; `hookServer.stop()`; lane `close()` so SDK children leak; and the one that matters, `memory.close()` (`memory.ts:404`) which runs `PRAGMA wal_checkpoint(TRUNCATE)`. Mitigated by the 5-minute checkpoint at `core.ts:918`, so the real exposure is an unbounded `aang.db-wal` over long uptimes, not lost turns. |
| D4 | **CONFIRMED** on the pin; framing needs correcting | `package.json:16` pins `0.3.278` exactly. The SDK ships **eight optional per-platform packages**, and I confirmed from `package-lock.json` that `@anthropic-ai/claude-agent-sdk-darwin-x64` exists with `"os":["darwin"],"cpu":["x64"],"optional":true`. So this is "reinstall `node_modules`, do not copy it", not "no Mac build". **Zero packages in the lockfile have install scripts.** `package-lock.json` is tracked, so `npm ci` works. **The real risk the claim misses** is Playwright: `playwright-core` downloads Chromium at runtime into `~/Library/Caches/ms-playwright`, and `tools.ts:239` forces `--browser chromium`. Carets: `discord.js ^14.27.0`, `ws ^8.18.0`, `zod ^4.0.0` (the sharpest, it feeds every tool schema at `tools.ts:3`). |
| D5 | **CONFIRMED**, scope corrected | `core.ts:1046` `settingSources: ['user'], skills: ['job-hunt'], cwd: this.selfCwd()`. **Scope:** only the three chat lanes. Worker, web and consolidate lanes stay isolated. The hooks half is confirmed by the code's own comments at `core.ts:728-735` and `:872-876`. **Allow rules: CAN'T VERIFY** from this repo; nothing here reads `permissions.allow`. **New hazard:** `macsetup.ts:80` writes Aang's own hooks into `~/.claude/settings.json` on the Mac. Once the Core is on that Mac, its chat lanes will load those hooks and POST their own turns to its own hook server. The guard is an **exact unnormalised string compare** (`core.ts:876`), which macOS can break via `/private/var` symlink resolution or case folding. |
| D6 | **CONFIRMED**, and the proposed replacement **does not work as written** | `embed.ts:11-13` confirmed, with an `AANG_OLLAMA` override. Storage: `embeddings(turn_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL)`, little-endian float32, unit-normalised (`embed.ts:44-51`, `:62-66`), similarity is a raw dot product. `memory.ts:262` filters `WHERE e.dim = ?`, so a dimension change makes old rows invisible rather than deleting them. **The blocker:** current `@huggingface/transformers` (v4.3.0) depends on `onnxruntime-node` 1.30.0, which ships **no darwin-x64 binary at all** ([1.30.0 file listing](https://unpkg.com/onnxruntime-node@1.30.0/?meta) contains only `bin/napi-v6/darwin/arm64/`). Tracked at [onnxruntime#27961](https://github.com/microsoft/onnxruntime/issues/27961), open, and downstream at [transformers.js#1634](https://github.com/huggingface/transformers.js/issues/1634). Node has no WASM fallback: `backends/onnx.js` imports `onnxruntime-node` unconditionally and sets `supportedDevices = ['cpu']`. Last good versions with an x64 binary are [1.22.0](https://unpkg.com/onnxruntime-node@1.22.0/?meta) and [1.23.2](https://unpkg.com/onnxruntime-node@1.23.2/?meta). Do not use ORT 1.21.x: [#24579](https://github.com/microsoft/onnxruntime/issues/24579) is a process-exit mutex abort, explicitly macOS 12/13 and explicitly x86-64. See section 6 for the model I recommend instead. |
| D7 | **PARTLY. The facts half is wrong, and the code says so.** | System prompt built once: **CONFIRMED**, `core.ts:786`, read from `Brain/profile.md` and `Brain/learned.md` (`memory.ts:219-223`), never rebuilt. Consolidation once at ~20 s and never rescheduled: **CONFIRMED**, `core.ts:941`, and `catchUp` is called from nowhere else. **But facts are deliberately NOT in the system prompt: DENIED.** `core.ts:782-785` is a comment explaining exactly why they were taken out on 2026-09-20; they travel per message via `withKnown` (`core.ts:1332-1340`), tracked per lane in `shownFacts` (`:1324`). The alarming implication, stale facts pinned for a session, is already solved. Three other timers *do* recur: checkpoint (`:918`), mail brief (`:924`), nudge and stale-launch sweep (`:927`). |
| D8 | **CONFIRMED, and worse** | `core.ts:952-953` in `stop()`. Lanes: chat, capped at 3 (`core.ts:1017-1057`); worker, `MAX_RUNNING = 2` concurrent; web, singleton plus a Playwright MCP child spawning headless Chromium; consolidate, transient and correctly closed in a `finally` (`core.ts:1007`). Each is one `query()` (`lane.ts:113-148`), one Claude child process, one in-process MCP server. **The finding the claim misses: `this.workers` (`core.ts:160`) is never closed anywhere**, not on completion (`:196-216`), not on `stopTask` (`:226-234`, which only calls `interrupt()`), not in `stop()`. Every background job leaks a warm SDK process for the life of the Core. Invisible on 16 GB Windows; on 8 GB it is the most likely cause of an out-of-memory. |
| D9 | **CONFIRMED** | `hooks.ts:222-229`, `tailnetAddress()` at `:12-20` enumerates once. If Tailscale is not up at Core start, the tailnet listener never binds and `setupFor` returns null for the whole run (`core.ts:859-860`). On a laptop that sleeps and changes networks this is materially worse than on a desktop. |
| D10 | **PARTLY**; the citation is a comment about past behaviour | `core.ts:698-700` is a comment saying the cwd *used to be* the data folder; the code now uses `os.homedir()`. **Answering the real questions:** the data folder **is** a git repo, remote `https://github.com/Bowgull/aang-data.git`, which I confirmed is **private**. **Nothing in the Core commits or pushes** (grep for `git commit|git add|git push` across `src/` returns only doc text and test fixtures). There is no schedule. The auto-push `post-commit` hook exists only in the **app** repo (`tools/git-hooks/post-commit`); the data repo's `.git/hooks/` has nothing but samples, and it is currently **1 commit ahead, unpushed**. **`Backup-Brain.ps1` does not exist**; it appears once, at `docs/PLAN.md:114`, as an aspiration. |

### 2.5 Security

Severity is my judgement of real-world risk to you specifically, given what is actually in `trust.json` today.

| ID | Verdict | Sev | Evidence and correction |
|---|---|---|---|
| S1 | **CONFIRMED, worse** | high | `trust.ts:70` splits on `[\s\|;&]+`, which are precisely the chaining operators, and `run.ts:21` uses PowerShell where `;` chains unconditionally. The `-c alias` route is real but unnecessary: `git status; rm -r C:\Users\Shadow\Documents` is enough, and it walks straight past the deny-list at `trust.ts:90` because that only inspects the first word. `trust.ts:66` also strips a leading `cd ... &&`, so the trusted program can be picked from the middle of a line. The approval text truncates at 70 characters (`tools.ts:329`, `:342`), so the first question already hides the tail. High rather than critical only because `trust.json` currently holds just `open links`. |
| S2 | **CONFIRMED** | critical | `tools.ts:439-445` calls `lookUpWeb` directly; `core.ts:972-991` sets taint and asks the web lane; `kindOf` has no case for it (`trust.ts:79-130`). The web lane has `WebFetch` plus Playwright `browser_navigate`. This is the egress that turns every read permission into an exfiltration permission. |
| S3 | **CONFIRMED** | high | `core.ts:1280` `if (!this.tasks.running().length) this.tainted = false;` inside `begin()`. **Correction:** worse than "session history". Each lane is a *persistent, resumed* SDK session (`core.ts:1050`, `lane.ts:138`), so poisoned text survives Core restarts while the flag protecting against it clears on the next message. |
| S4 | **CONFIRMED** | high | `tools.ts:446-453` with no gate, no `kindOf` case. Facts go into every lane via `withKnown` (`core.ts:1332-1339`). **Correction:** `forget` is equally ungated (`tools.ts:454-463`), and there is a worse poisoning target, see M2 below. |
| S5 | **CONFIRMED** | high | The complete list of `this.tainted = true` is `core.ts:362`, `:435`, `:460`, `:576`, `:628`, `:677`, `:973`. SDK `Read`/`Glob`/`Grep` are gated (`trust.ts:85`) but never set taint. `claude_code_status` (`tools.ts:645-646` → `hooks.ts:130`) splices attacker-reachable transcript text in with no taint and no fencing. Discord attachments (`discord.ts:252-271`) likewise. |
| S6 | **CONFIRMED** | medium | `tools.ts:374` (700), `mail.ts:208` (1300). **Correction, and it inverts the guarantee:** `mail.ts:187` binds the send to `hashDraft(d)`, the hash of the **whole** body including the part the card never rendered. So "what he approves is what is sent" becomes "what he approves is a hash over text he saw a prefix of". |
| S7 | **CONFIRMED, and the worst finding here** | critical | `core.ts:867`, `:1067-1078`, `protocol.ts:128-134`. A browser WebSocket is not subject to CORS, so any page you open gets the full `FromBody` surface: `{t:'panel'}` (`core.ts:1164` → `:406-418`) returns every fact, every trust grant, the activity log and every open draft body; `{t:'history'}` (`:1165` → `memory.ts:305`) returns 200 past turns; `{t:'permission.reply',choice:'always'}` writes standing trust; `{t:'submit'}` puts an arbitrary prompt into the model; `{t:'mac.run'}` types arbitrary text into Claude on your Mac; `{t:'hello',client:'discord'}` makes that page the sink for screenshots and file bytes. Hook server: `hooks.ts:198-202` checks the key **only** when not loopback, and `hooks.ts:209` parses JSON regardless of `Content-Type`, and `text/plain` is a CORS-simple request needing no preflight. Permission ids are sequential (`core.ts:1640`). |
| S8 | **CONFIRMED** | medium | `core.ts:877-878`, persisted at `:822-827`. Any tailnet peer holding `hook.key` permanently repoints `/front` and `/run`. Keys in URLs: `core.ts:833`, `:845`, over plain HTTP; `macsetup.ts:93` puts `hook.key` in the Mac's settings.json curl line. |
| S9 | **CONFIRMED** | high | `macsetup.ts:62-70`: activate Claude, `delay 1.5`, `keystroke "n" using {command down}`, `delay 0.8`, `keystroke theText`, `keystroke return`. A fixed 1.5 s race with no verification of the frontmost app, driving an `osascript` granted Accessibility. Key in argv: `macsetup.ts:24` and `:133` (the launchd plist `ProgramArguments`), readable by any local process via `ps`. **Additions:** `macsetup.ts:40` uses a non-constant-time Perl `eq`, and the peer check is `$peer =~ /^100\./`, meaning any tailnet host rather than a pinned address. |
| S10 | **CONFIRMED** | medium | `discord-gateway.ts:112` sets `allowedMentions` and `SuppressNotifications` but never `SuppressEmbeds`; `:119` (`edit`) sets no flags at all. Job-card text (`discord.ts:624`) and transcript announcements (`core.ts:906-908`) are attacker-influenced, and Discord's servers fetch any URL in them for a preview. Clickless exfiltration. |
| S11 | **CONFIRMED** | high | `files.ts:22-33` covers `stateDir`, `aang.db`, `UNDO_DIR` and the Windows system folders, and **nothing else in `dataDir`**. I confirmed on disk that `hook.key` and `mac-front.key` are both readable and writable. `hooks.ts:192-197` does return the `/mac-setup` branch before the key check at `:198-202`. **Correction:** the `mac-setup.code` route also needs the file to be under 30 minutes old and `hookServer.tailnet` non-null (`core.ts:853-862`), so the simpler attack skips it entirely: `Read` the key files and exfiltrate via `look_up_web`. |
| S12 | **CONFIRMED** | high | `tools/google-setup.ps1:39` requests `gmail.compose`, which authorises `messages.send`. The only barrier is in-process. `google-setup.ps1:70-74` writes `clientSecret` and `refreshToken` in plaintext to `%APPDATA%\Aang\google.json`, which is present on disk. |
| S13 | **PARTLY** | medium / high | Vacuous as stated: `files.ts` is Windows-only by construction and there is no macOS write path from the Core today. **The real exposure is that Aang installs the persistence itself:** `macsetup.ts:112-141` writes `~/.claude/settings.json`, `~/Library/LaunchAgents/com.aang.listener.plist` and `~/Library/Application Support/AangListener/`, served over plain HTTP behind a one-time code. **And the Windows equivalent is real and was missed, see M17.** |
| S14 | **PARTLY, mostly DENIED** | low | `tools.ts:239` is version-pinned, `package.json` pins `0.0.82` exactly, the lockfile has the integrity entry and `node_modules/@playwright/mcp` exists, so npx resolves locally and there is no runtime fetch under normal operation. **Residual risk:** `lane.ts:122` sets no `cwd` for the web lane, so the MCP child inherits `process.cwd()`; if that ever sits outside the install tree, npx silently installs from the registry at web-lookup time. Carets float only under `npm install`, not `npm ci`. |

### 2.6 Memory and intelligence

| ID | Verdict | Evidence and correction |
|---|---|---|
| M1 | **CONFIRMED** that the docs rely on it, in four places | `docs/MEMORY.md:77-79` ("+39% task performance with 84% fewer tokens over 100 turns"), `docs/MEMORY.md:114` (the whole cost argument: "Net effect on quota: negative"), `docs/THE-PLAN.md:167-169` (framed slightly differently, as context editing plus a memory tool), and `docs/ROADMAP.md:747` where the number is used as a phase name with no source. *Availability in the Agent SDK: see section 6, item 12.* |
| M2 | **CONFIRMED**, and visible in your live database | `memory.ts:425-429` `keyNoun` returns **the first token longer than 2 characters not in `SKIP`**, with a trailing `s` stripped. It is positional, not semantic: the first surviving *word*, verb or adjective included. `findContradiction` (`:130-131`) linear-scans and returns the first live fact whose first word matches, and `remember` (`:111-112`) retires it unconditionally. So "Joshua plays WoW most nights" and "Joshua plays guitar" both reduce to `play`. It chains: each new fact retires the current survivor, so N facts collapse to 1. **Live evidence: I queried `aang.db` read-only. 9 facts, 8 retired, 1 live.** Adding `user`/`users` to `SKIP` (`:424`) only moved the collision one word right: ids 7, 8 and 9 all now key on `asking`, ids 1 and 2 both on `located`. The mechanism is unfixed, only shifted. |
| M3 | **CONFIRMED** | `Memory.recall()` has exactly one caller in `src/`: `tools.ts:420`, inside `search_memory`. What **is** injected per turn is composed in `begin()` at `core.ts:1281-1283`: `withAnnounced` (only if Aang spoke unprompted within 10 minutes), `withRecap` (only on a lane handoff), `withKnown` (only when the fact list changed since this lane last saw it), `withWaiting` (only if a job is waiting). On a steady-state turn, **nothing at all is prepended**. A new wrapper in that same chain lands in the SDK user message at `lane.ts:157` and never in the cached system prompt, which is the right place. **Cost the claim does not price:** `begin()` is synchronous and `recall()` is async (`memory.ts:256`), so `begin()` and its caller must become async. And `withKnown`'s "only when changed" trick is not available, because recalled turns differ every message. |
| M4 | **CANNOT BE ANSWERED FROM YOUR DATA. The fields have never been written.** | The log is `%APPDATA%\Aang\turns.jsonl` (written at `core.ts:1682`), not in the data folder. It holds **24 records in total**, all on the `quick` lane, spanning 2026-09-20 to 2026-09-22. `Object.keys` on every one of them gives `ts,id,lane,user,reply,ms,ttftMs,ackMs,ctxTokens,tools,fixed,flags`: **`cacheReadTokens` and `cacheWriteTokens` are absent from all 24.** The split was added at `lane.ts:256` on 2026-09-22, after the newest record. What the data *does* say: median input on `quick` is **25,096 tokens**, range 2,763 to 85,538, so there is real context to cache. You need at least one run per lane after that change before this question has an answer. *Cacheable-prefix minimums: see section 6, item 13.* |
| M5 | **CONFIRMED** | `memory.ts:240-249`, comment and all: `for (let i = 0; i < Math.max(words.length, vector.length) && out.length < limit; i++) { for (const h of [vector[i], words[i]]) ... }`. A positional round-robin, vector first, deduped on `ts + text.slice(0,40)`. **The reason to change it is stronger than "RRF is better":** the two lists are scored on incomparable axes, cosine with a 0.55 floor (`memory.ts:254`, `:266-267`) versus FTS5 `ORDER BY rank` (`:291`), so interleaving treats a 0.99 hit and a 0.56 hit identically. See section 6, item 8. |

### 2.7 Backups and Obsidian

| ID | Verdict | Evidence and correction |
|---|---|---|
| O1 | **No production code writes `Brain/`. But five tools can.** | `Brain` appears in `src/` at exactly two production lines, `memory.ts:222` and `:223`, both reads. `consolidate.ts` touches no files at all; it writes through `memory.remember()` into the `facts` table (`consolidate.ts:128`). Every other hit is test scaffolding. **However:** `files.ts:26` protects only `path.join(dataDir,'aang.db')`, not `dataDir` itself, so `write_file`, `edit_file`, `move_file`, `copy_file` and `delete_file` can all target `Brain/profile.md`, and `write_file`/`edit_file` are ask-once-then-trusted. So the answer to your question is: **Aang has no code path that writes there, but he has five tools that can, and one yes unlocks them.** Since `profile.md` and `learned.md` are baked into the system prompt (`core.ts:786`), that is a system-prompt rewrite, not a note edit. Fix in step 1. |
| O1b | Design is in step 5. It is about 150 lines, not 100. | See section 3, step 5. |
| O2 | **Yes, the encrypted cloud copy respects your rule, and it is stronger than what you do today.** | The rule as written (`ROADMAP.md:154-155`) already admits "and in the private repo": GitHub is someone else's server, and `Brain/*.md`, `Logs/chatlog.txt`, `memory.txt` and `history.txt` are pushed there **in plaintext**. A restic repo is the same trust boundary with AES-256-CTR plus Poly1305-AES client-side encryption and an scrypt-derived key that never leaves the machine ([restic references](https://restic.readthedocs.io/en/stable/100_references.html)). Strictly better. Mechanics and corrections in step 5. |
| O3 | **CONFIRMED as written, but the reason is obsolete and the real gap is the opposite one.** | `docs/FEATURES.md:62`: "BLOCK neither Drive nor OneDrive is signed in on this machine". That reason is dead: Google is signed in (`ROADMAP.md:60-64`) and the project moved to git anyway (`ROADMAP.md:90`, `:518-519`). **The measured truth:** `Brain/*.md` (four files, about 1.5 KB) **are** tracked and pushed to a private repo. `aang.db` is gitignored (`.gitignore:48 *.db`) and has **no off-machine copy at all**, and that database is where every turn, embedding and fact lives. The `.gitignore` comment calls it "rebuildable from chatlog", which is not true of `facts`, `embeddings` or the migrated `turns`. The data repo also has no post-commit hook and is sitting 1 commit ahead, unpushed. So D6 should read PART, with the irreplaceable half unbacked. |

### 2.8 Roadmap and M5

| ID | Verdict | Evidence and correction |
|---|---|---|
| P1 | **CONFIRMED retired; E's hands list is badly incomplete** | Retirement stated at `ROADMAP.md:78`, `:164-166`, `:197`, `:413`. E's list (`ROADMAP.md:463`) names six: `what_im_doing`, `read_window`, `look_at_window`, `open`, clipboard, Hands. **Every item you asked about is genuinely missing, and more:** the Q1 file tools (`list_folder`, `move_file`, `copy_file`, `make_folder`, `delete_file`, `copy_to_clipboard`), file writing (`write_file`, `edit_file`, `undo_file_change`), Q2 UIA (`list_controls`, `press_control`, `fill_control`), `send_to_phone`, `start_claude`, `play_music` and `watch_next`, AangInbox (`discord-gateway.ts:193`), and **`run`, the single most machine-bound tool of all**. That is roughly **17 machine-bound tools versus the six E names**. The cause is chronological: E predates the Q1 and Q2 work of 2026-09-21. Also stale in C: "Set the Charge Limit to 80%" is an Apple Silicon feature, hence AlDente on an Intel Mac; and Screen Sharing plus Claude remote control are now out of scope by your own rule. |
| P2 | **PARTLY: 3 of your 4 "done" hold, the 4th is half done; all 4 "left" hold, one is harder than you think** | Supervisor **done** (`CoreSupervisor.cs:13-31`, wired `PetWindow.cs:256`). Autostart **done** (`Support.cs:15`, tray toggle `PetWindow.cs:1886-1888`, moved from the Run key to the Startup folder because the Run key never fired, `ROADMAP.md:530-533`). Rainmeter retirement **done by doc attestation only** (`PLAN.md:14`); the install is outside the repo. GitHub backup **PART**: the app repo auto-pushes, the data repo does not, and `aang.db` is excluded (see O3). Crash recovery in the pet's direction: **open, and structurally impossible as phrased**, because `CoreSupervisor.cs:9-11` ties the Core to a kill-on-close job object so it dies *with* the Body, and nothing anywhere restarts the Body. It needs a third watchdog or a different job-object choice, so it is a design decision, not a pending task. Reboot-confirmed autostart: **open** (`ROADMAP.md:532` ticks it as built, not verified). Packaging: **open** (`Body.csproj` has no `PublishSingleFile`, `SelfContained` or `Version`, and `CoreSupervisor.cs:36-40` still walks up to a build tree). Kill-Body-mid-animation gate: **open**; only the kill-Core half has a recorded pass (`ROADMAP.md:536-538`). |
| P3 | **CONFIRMED stale, all four, with numbers** | **ROADMAP `:181-197`**: six rows say `open` for work that is built (I Email, J Panel, K Background jobs, L Simkl, N Memory depth, G′ Job hunt), several of them contradicted 100 lines earlier in the same file. `ROADMAP.md:26` says "about 45" tools; there are **52** (`core.ts:1036` agrees), mirrored in code at `route.ts:16`. `ROADMAP.md:708-711` still lists J1 and J2 as blocked on Google auth, which is done. **PLAN `:16`**: "M5 | Not started" is contradicted two lines above it at `:14`, and the whole table is stamped "Status (2026-09-20)", predating Discord, the worker, mail, jobs, UIA, the file tools and the Mac bridge. `PLAN.md:43` also says semantic recall is "not ported", but `searchByMeaning` exists. **FEATURES counts**: the header at `:11` claims 23 OK / 9 PART / 14 GONE / 9 NO / 5 DROP / 3 BLOCK, summing to 63; the file actually contains 67 rows counting 22 / 6 / 18 / 12 / 6 / 3. Wrong in five of six cells. At least twelve verdicts are also stale in the pessimistic direction (D2, D3, D4, D5, D7, F1-F4, A11, I2, J1, J2 are all built). **PROTOCOL.md**: `:56` promises it is updated in the same commit as any protocol change; it documents **13 `ToBody` against 30** and **12 `FromBody` against 29**. Worse, `:39` gives `permission.reply` as `{id, allow}` when the real shape is `{id, choice}` (`protocol.ts:98`), so a client written from the doc fails the trust flow. And `:61` says the hook server is "loopback only", which stopped being true when it started binding the Tailscale address. |

### 2.9 What the audit missed

Ranked. Every one of these is live on Shadow today.

1. **M1: the WebSocket leaks your entire memory and inbox with no model involved.** `{"t":"panel"}` and
   `{"t":"history"}` from any page return every fact, every standing permission, the action log, 200
   conversation turns, and the full body of every pending email draft. No taint, no linter, no prompt, no log
   line. `core.ts:1164-1165`, `:406-418`, `memory.ts:305`. **Critical.**
2. **M2: `Brain/profile.md` and `learned.md` are writable and go into the system prompt.** `memory.ts:219-223`
   → `core.ts:786`. One "always, write files" and an injected turn installs a permanent system-prompt override
   that survives every restart and is invisible in the Panel's fact list. **Critical.**
3. **M17: `~/.claude/settings.json` on Windows is writable and is loaded by Aang's own lanes.** `files.ts`
   does not cover `C:\Users\Shadow\.claude\`, and `core.ts:1046` sets `settingSources: ['user']`. A
   `write_file` there installs hooks that **Aang's own next turn executes**. Same gap covers the Startup folder
   and the PowerShell profile. **Critical, and it is a self-escalation loop.**
4. **M7: confused deputy on hands, look and clipboard.** `core.ts:1091` and `:1104` default an unidentified
   socket to `desktop`; `core.ts:556`, `:601`, `:724` broadcast to every desktop socket; and `core.ts:1229-1243`
   match replies on **id only**, never on which socket was asked. So a rogue page-driven socket receives your
   screenshots *and* can answer first with fabricated clipboard contents and fabricated screenshots, which flow
   into the model as "his screen". **Critical.**
5. **M9: plaintext secrets are readable by the agent's own read path.** `google.json` (refresh token and client
   secret), `discord.token`, `spotify.json`, `simkl.json`, `hook.key`, `mac-front.key`. `phone.ts:55-68` blocks
   *sending* them and `files.ts:25` blocks *writing* `stateDir`, but nothing blocks **reading** them, and
   `look_up_web` is ungated. Two standing permissions and the whole credential set leaves. **Critical as a chain.**
6. **M4: eleven tools with side effects never reach `askPermission`**, because the gate lives inside `Core`
   methods and these handlers do the work themselves: `look_up_web` (`tools.ts:439`), `remember` (`:446`),
   `forget` (`:454`), `set_reminder` (`:647`), `cancel_reminder` (`:667`), `list_folder` (`:568`, reads any
   folder on disk), `create_job_card` (`:513`), `mail_draft` (`:540`), `undo_last` (`:552`, **rewrites files**),
   `revoke_permission` (`:556`), and `do_task`/`tell_task`/`stop_task`. **`do_task` is the worst:** one ungated
   tool call spawns a lane with all 52 tools, `maxTurns: 60` and a 30-minute timeout. The per-action gates still
   fire inside it, but the decision to run a 60-turn autonomous agent on attacker-supplied instructions is never
   put to you. **High.**
7. **M3: `open` is an arbitrary-program launcher gated as "open files".** `open.ts:119` accepts any existing
   drive-letter path, `:179-183` classifies it as `path`, `:218`/`:222` spawns it, and `trust.ts:96` calls that
   "open files". One yes on opening a document authorises launching any executable on disk, forever. This
   defeats the launcher refusal at `core.ts:1617-1620`, which exists specifically to stop that. `kindOf` also
   ignores the `with` argument entirely. **High.**
8. **M5: Discord's Yes always means always** (see A5). **M8: `atDesk` is attacker-settable**
   (`core.ts:1147`), so a rogue socket sends `{"t":"desk","active":false}` and forces every subsequent
   permission question onto the surface where Yes means always. **High as a pair.**
9. **M6: standing trust has no scope, TTL or counter.** `trust.ts:43-49` is a bare key lookup; the stored
   `example` is never compared against anything; and `trust.ts:113-117` keys `act in <app>` on a model-supplied
   string, so a page-chosen window title widens the grant. **Medium.**
10. **M16: what Discord can trigger that the desktop gate would catch.** `deck:job` reaches `runOnMac`
    (`discord.ts:678` → `discord-gateway.ts:166` → `core.ts:1148`) and types arbitrary text into Claude on the
    Mac **with no permission question on either machine**. `JOB_HUNT_RE` (`core.ts:1196-1212`) fires before
    routing and before any gate. **High.**
11. **M10: secrets in argv, URLs and logs.** `core.ts:833`, `:845`; `macsetup.ts:133` and `:93`; and
    `core.ts:481` writes `describeCall` of tool input into `actions.jsonl`, which includes clipboard text,
    `fill_control` text and full `run` commands. **Medium.**
12. **M11: constant-time comparison is inconsistent.** Correct at `hooks.ts:23` and `core.ts:857`; not at
    `macsetup.ts:40`, where the key also arrives in the request line. **Low-medium.**
13. **M15: `mail_draft` on Discord is entirely ungated on creation** (`core.ts:381-383` has no
    `askPermission`; only the desktop branch asks at `:386`). **Medium.**

**Things I checked that are clean, so you do not spend time on them:** path traversal
(`files.ts:22-33` and `organise.ts:34` both `path.resolve` first; `phone.ts:82-85` sanitises attachment names);
command construction (`open.ts:108` and `:238` escape `'` as `''` correctly for PowerShell single quotes;
`uia.ts:33` passes fill text as base64); and the keys were never committed (`.gitignore` has covered
`hook.key`, `mac-front.key` and `mac-setup.code` from the start, and `git log --all -- <keys>` is empty).
One soft spot: `files.ts:26` is a suffix regex over `existsSync` paths, so a junction or symlink reaching the
same file under a different name is not caught.

**Three findings of my own, from measuring rather than reading:**

- **The production schema exists only in test fixtures and in the live file.** `PRAGMA user_version` is `0`,
  and the test DDL is itself incomplete (it omits `cache`, `topics`, `journal` and the `turns_ts` index).
  There is no migration story at all.
- **A re-embed is 371 vectors, not "everything".** I counted: 354 turns, 335 embeddings (all 768-dim), 9 facts,
  31 topic centroids, 5 cache rows. Total database 2.8 MB. This changes the cost of a dimension change from
  scary to trivial.
- **`backfill()` would silently do nothing after a model change.** `memory.ts:366-389` selects on
  `LEFT JOIN embeddings ... WHERE e.turn_id IS NULL` and **does not filter on `dim`**, so every turn already
  looks done. `coverage()` (`:392-399`) counts all rows regardless of `dim` too, so it would over-report. That
  `LEFT JOIN` is the load-bearing line for any migration and it is wrong for one.

---

## 3. The porting map

I kept your ordering. It is right: host prep, then fix what is bleeding, then make the Core portable while it
is still somewhere you can debug it, then move, then the extras. Two changes, both explained in place: the
security fixes in step 1 are split so the four critical ones land first, and **step 2 gains a "one brain"
lock** before anything else, because every later step assumes it.

Notation: **Where** is which machine the work happens on. **Gate** is how you know it worked. **Back out** is
how to undo it.

### Step 0. Prepare the Mac

| | |
|---|---|
| **Where** | MacBook |
| **Depends on** | A1, A2, B2, B6 |

- **0a. Free the disk.** 14 GB is not workable: `node_modules` plus a Playwright Chromium plus an embedding
  model plus backups plus macOS swap will not fit with room to breathe. Target 30 GB free. Measure first (B2).
- **0b. AlDente for a charge cap.** Intel Macs have no native Charge Limit; that is an Apple Silicon feature,
  which is why the retired Phase C text (`ROADMAP.md:453`) is wrong here. Cap at 80%.
- **0c. Sleep.** Never sleep on AC, sleep on battery, which is already your setting. Do **not** reach for
  `caffeinate` as the mechanism; an assertion that never releases is a battery-killer on a 43%-health cell.
- **0d. FileVault and the firewall on.** Read A2 first: FileVault has a real cost here.
- **0e. Tailscale tags and a port-scoped grant.** Tag both devices and allow only the two ports:

  ```json
  { "tagOwners": { "tag:aang-brain": ["bocas.joshua@gmail.com"],
                   "tag:aang-pet":   ["bocas.joshua@gmail.com"] },
    "grants": [ { "src": ["tag:aang-pet"], "dst": ["tag:aang-brain"], "ip": ["tcp:47831", "tcp:47832"] } ] }
  ```

  Grants are the current form and are feature-complete with ACLs
  ([grants vs acls](https://tailscale.com/kb/1467/grants-vs-acls)); the syntax for `ip` is documented at
  [grants syntax](https://tailscale.com/docs/reference/syntax/grants). **Check your existing policy for a
  wildcard default rule first**, or the grant changes nothing (inference: new tailnets historically shipped
  one).

  **Correction to your plan, and it matters:** you proposed checking `tailscale whois` to authenticate the
  caller. Tagging a device **removes user identity** ("Applying a tag to a device removes any user-based
  authentication", [tags](https://tailscale.com/kb/1068/tags)), and Serve's identity headers are explicitly
  "not populated for traffic originating from tagged devices"
  ([Serve](https://tailscale.com/docs/features/tailscale-serve)). So tags and `whois`-style identity are
  mutually exclusive. Use the grant as the enforcement and a per-device token in the app layer as the
  identity. See step 2c.
- **0f. Tailnet Lock: see A10. My recommendation is to skip it.**
- **0g. Discord 2FA on, bot kept private.**

**Gate.** From Shadow, `nc -vz <mac-tailscale-ip> 47831` succeeds and `nc -vz <mac> 22` fails. Disk shows the
target free space. AlDente holds at 80% over a day.
**Back out.** Revert the policy file (Tailscale keeps versions); turn FileVault off (slow, but possible);
uninstall AlDente.
**Risk.** Low, except FileVault, which is a one-way door in practice because decrypting takes hours.

### Step 1. Security fixes, on Shadow, before anything moves

These are live bugs on the machine you are using now. They are first because every one of them gets worse when
the socket crosses a network. Each needs a **refusal test**: a test that proves the bad thing is now refused,
not just that the good thing still works.

**1a (critical). Authenticate the local transports.**
- Generate a per-boot token into `stateDir`; the pet and the Discord bridge present it in `hello`.
- Add `verifyClient` at `core.ts:867` that **rejects any request carrying an `Origin` header at all**. A
  browser always sends `Origin` on a WebSocket upgrade and a native client does not, so this one check closes
  every browser-origin attack in M1, M7 and M8 outright.
- Additionally require the token in a request header. **A browser cannot set custom headers on a WebSocket**,
  which makes this structurally impossible for a page to satisfy, and `ClientWebSocket` on the pet side can
  (`CoreLink.cs:32`, via `Options.SetRequestHeader`). Two independent checks, both of which a page fails.
- Require the key on loopback too at `hooks.ts:199`, and reject a hook POST whose `Content-Type` is not
  `application/json` (that alone forces a CORS preflight a page cannot pass).
- Bind request and reply together: `core.ts:1229-1243` must check the socket, not just the id, and
  `answerPermission` (`core.ts:1669`) must record which socket was asked. Make permission ids random
  (`core.ts:1640`).
- Reject unknown `t` values and validate field types in `parseFromBody` (`protocol.ts:128-134`).

*Refusal test:* a test client that connects with an `Origin` header is rejected; one with no token is
rejected; a second socket answering another socket's permission id is ignored.

**1b (critical). Close the egress.** Put `look_up_web` (`tools.ts:439`) behind `askPermission` with the
resolved destination in the question, and **refuse it outright while `tainted`**, which is the rule
`core.ts:1631` already applies to everything that acts. Without this, every read permission is an
exfiltration permission.
*Refusal test:* after a `mail_read`, a `look_up_web` call is refused with a reason naming taint.

**1c (critical). Make `refusal()` a read-and-write deny list.** `files.ts:22-33` today is write-only and
covers four Windows folders. Add `Brain/*.md`, `hook.key`, `mac-front.key`, `mac-setup.code`, `~/.claude/`,
the Startup folder, `.ssh`, `.aws`, `.gnupg`, and **apply it to `Read`/`Glob`/`Grep`/`list_folder` and to
`run` output as well as to writes**. `phone.ts:55-68` already has most of the right patterns wired to the
wrong door. This single change collapses findings 2, 3 and 5 of section 2.9.
*Refusal test:* `Read` of `google.json` is refused; `write_file` to `Brain/profile.md` is refused;
`write_file` to `~/.claude/settings.json` is refused.

**1d (high). Trust that means what it says.**
- Replace `programOf` (`trust.ts:65-73`) with a real parse: refuse any command containing `;`, `&&`, `||`, a
  pipe or a backtick, and run through `execFile` with an argv array rather than handing a string to a shell.
  Always ask for an interpreter (`node`, `python`, `pwsh`, `osascript`, `bash`).
- Scope `open` properly (`trust.ts:93-98`): an executable target is never "open files", and the `with`
  argument must be part of the trust key.
- Give trust records a scope and a re-confirm interval (`trust.ts:43-49`).
*Refusal test:* `git status; whoami` asks even when `run git` is trusted.

**1e (high). Gate the ungated.** Route the eleven tools in finding 6 of section 2.9 through `askPermission`.
`do_task` in particular should put "start a background agent that can use every tool for up to 60 turns" to
you as its own question.

**1f (high). The taint flag.** Make it session-scoped rather than turn-scoped (`core.ts:1280`), and set it for
SDK `Read`/`Grep`, for `claude_code_status` transcript text (`hooks.ts:130`) and for Discord attachments
(`discord.ts:252-271`). Gate `remember` when tainted.

**1g (medium). Show the whole draft** (`tools.ts:374`, `mail.ts:208`), or hash only what was shown. Right now
the hash gate guarantees the opposite of what it was built to guarantee.

**1h (medium). `SuppressEmbeds` on every Discord send and edit** (`discord-gateway.ts:112`, `:119`).

**1i. The Discord PIN** (A6), and **Discord Yes means once** (A5).

| | |
|---|---|
| **Where** | Shadow repo |
| **Depends on** | A4, A5, A6, A12 |
| **Gate** | Every refusal test above passes, and the existing suites still pass. Then one real session where you do normal things and nothing extra asks. |
| **Back out** | Each is an independent commit; revert individually. |
| **Risk** | Medium. 1d will make Aang ask more often than it does now; that is the point, but it will feel different. |

### Step 2. Make the Core host-neutral, while it is still on Shadow

This is the bulk of the work, and doing it here means you can debug it with both machines in front of you.

**2a. One brain, structurally.** Before anything else. The Core takes an exclusive lock on
`<dataDir>/brain.lock` holding host, pid and start time, and **refuses to start if it is held**. Discord start
(`index.ts:22-24`) becomes conditional on holding that lock. Removing `CoreSupervisor` (step 3) is necessary
but not sufficient: you could double-click `node` yourself, or restore a backup onto the mini while the
MacBook is still up.

**2b. Machine identity.** `hello` gains `deviceId`, `name`, `os` and a **capability list**. See section 6 item
1 for why capabilities rather than a platform flag. Every `ToBody` message gains a target device.

**2c. Per-pet state.** The twenty-odd single-slot fields listed in section 2.9 become per-device: `looking`,
`clipboard`, `handsPending`, `bodyQuiet`, `atDesk`, `activity`, `pending`, `hushUntil`, and the presence and
mute handling at `core.ts:1220-1227` and `:1244`. `whereHeIs()` (`core.ts:1098-1102`) returns a device, not a
boolean. Resolves A3.

**2d. Bind and authenticate over Tailscale.** `core.ts:867` binds the Mac's tailnet address (never `0.0.0.0`,
or the local network reaches it regardless of the grant), keeps the `Origin` rejection and the token from 1a,
adds `maxPayload` of 1 MiB, a 15-second `ws.ping()` with a dead-socket sweep (fixes R6), and a `close`
handler.

**2e. Mac safety lists and neutral tool text.** `files.ts`, `organise.ts`, `uia.ts`, `phone.ts` and
`trust.ts:90` all get macOS entries (T5). Tool descriptions become per-target text generated from the target
device's capabilities rather than hardcoded `C:\` strings (T6), including `voice.ts:22-23` and `worker.ts:38`.

**2f. Schema versioning and fresh-database creation.** The `Memory` constructor creates the file and runs the
DDL when it does not exist, sets `PRAGMA user_version`, and migrates forward. Commit the real schema (section
2.4, D2), skipping the three dead tables. **This is the fix that stops memory silently switching off on a
fresh Mac.**

**2g. Lifecycle.** `SIGTERM` and `SIGHUP` handlers calling `core.stop()` (D3). Close idle lanes and **close
worker lanes when a task ends** (D8, the leak). Reschedule consolidation on a real clock instead of a
one-shot 20-second timer (D7). Take `profile.md` and `learned.md` **out** of the system prompt rather than
rebuilding it, see section 6 item 3. Retry `tailnetAddress()` instead of checking once (D9). Rotate
`turns.jsonl` and `actions.jsonl`, which append without limit.

**2h. In-process embeddings.** See section 6 item 5. This is not the model you proposed.

**2i. Explicit Mac folders** in the LaunchAgent environment: `AANG_DATA_DIR`, `AANG_STATE_DIR`,
`AANG_UNDO_DIR`, `AANG_TRASH_DIR` (D1). No code change needed.

| | |
|---|---|
| **Where** | Shadow repo |
| **Depends on** | Step 1, A2, A3, A11 |
| **Gate** | Two pets connected at once on Shadow (run the pet twice, second with `--no-core`): a question typed in pet A streams only into pet A; a `hands` request runs on exactly one machine; killing pet B's process makes the Core notice within 30 seconds. `AANG_DATA_DIR` pointed at an empty folder creates a working database from nothing. |
| **Back out** | Per-commit. The riskiest is 2c; keep it as one commit. |
| **Risk** | High. This touches routing, which touches everything. |

### Step 3. The Windows pet

**3a. Remove `CoreSupervisor` entirely** (`CoreSupervisor.cs`, `PetWindow.cs:252-259`). It cannot be made
safe: `PortInUse` (`:63`) can only ever see loopback.
**3b. Configurable Core URL and token** in `Config` (`Support.cs:102-131`), replacing the two hard-coded
addresses at `PetWindow.cs:31` and `:256`.
**3c. "Brain offline"** as a real pet state, with backoff instead of the current 1.5-second forever loop
(`CoreLink.cs:43`).
**3d. Move every Shadow-side action into the pet as a hands RPC.** All 17 tools from P1, not the six Phase E
listed. **And the permission prompt moves with them**, see section 6 item 2: the pet renders its own
confirmation for anything that changes the machine and refuses an RPC it did not ask you about.

| | |
|---|---|
| **Where** | Shadow repo, Body |
| **Depends on** | Step 2 |
| **Gate** | With the Core still on Shadow, the pet runs with `--no-core` permanently and everything works. `run`, `open`, `read_window` and the file tools all execute through the pet, and the pet refuses a hands RPC with no matching user confirmation. |
| **Back out** | Keep `CoreSupervisor.cs` in history; the config default can point at localhost. |
| **Risk** | High. This is where "it used to just work" breaks in small ways. |

### Step 4. The Mac host and the cutover

**4a. Install Node 24 darwin-x64** ([nodejs.org/dist/v24.21.0/](https://nodejs.org/dist/v24.21.0/) has
`node-v24.21.0-darwin-x64.tar.gz`). macOS 13.5 is the floor; 13.7.8 clears it.
**4b. `npm ci`, never a copied `node_modules`** (D4). Then `npx playwright install chromium` deliberately,
rather than letting it happen at the first web lookup.
**4c. The LaunchAgent.** `RunAtLoad`, `KeepAlive`, `ThrottleInterval`, explicit environment for the four
`AANG_*` paths and for `PATH` (a launchd job does not inherit your shell's). See section 9 for the mechanics I
still need to confirm.
**4d. Sandbox.** Wrap the Core, or at minimum the `run` path, in `@anthropic-ai/sandbox-runtime`. It exports
`SandboxManager` with `wrapWithSandbox(command, ...)` returning a wrapped command you spawn yourself, so it
works as a library for arbitrary children, not just as a Claude Code wrapper
([sandbox-runtime](https://github.com/anthropics/sandbox-runtime)). Filesystem defaults are asymmetric on
purpose: reads allowed unless denied, writes denied unless allowed. **But `B1` gates this**: its macOS path is
`sandbox-exec`, which is formally DEPRECATED in its own man page
([sandbox-exec(1)](https://keith.github.io/xcode-man-pages/sandbox-exec.1.html)), Anthropic states no minimum
macOS and makes no Intel claim, and `package.json` has no `os`/`cpu` field. Verify before depending on it.
**4e. Mac sign-in scripts** for Google, Spotify and Simkl. **There is no macOS sign-in path today**: the
`.cmd` files are Windows wrappers around the `.ps1` scripts, and the user-facing strings at `core.ts:302`,
`:324`, `:356` all name `tools\...cmd`.
**4f. Keychain for tokens**, with the launchd caveat in section 9.
**4g. Rehearse on a copy.** Run the Mac Core against a *copy* of the data folder with Discord disabled
(`AANG_DISCORD=0`) and the Windows pet still pointed at Shadow. Prove it before you commit.
**4h. Cut over** (runbook in section 4).
**4i. Repoint the Mac's hooks at `127.0.0.1`** instead of Shadow's tailnet address, and **remove the Perl
listener** (`~/Library/Application Support/AangListener/uninstall.sh`, which the setup script already
installs at `macsetup.ts:121-126`). With the Core on the Mac, `/run` is a keystroke-injection amplifier
pointed at the machine the brain is on. Also delete the `macsetup.ts` serving path, or the Core keeps a code-
gated HTTP endpoint that writes LaunchAgents.
**4j. Turn the Shadow brain off for good:** remove the Startup shortcut, and keep the lock from 2a as the
backstop.

| | |
|---|---|
| **Where** | MacBook, plus one repo change for 4e and 4i |
| **Depends on** | Step 3, B1, B2, B5, B7 |
| **Gate** | 4g's rehearsal passes the existing suites against the remote Core. Then: close Shadow mid-conversation, reopen it, and the pet reconnects within 30 seconds and continues the same conversation. Discord answers once, not twice. |
| **Back out** | The Shadow Core is one Startup shortcut away from returning, and the data snapshot from 4g is untouched. Keep it for two weeks. |
| **Risk** | High, and this is the irreversible-feeling one. The rehearsal is what makes it not be. |

### Step 5. Backups, and the Obsidian index

**5a. Fix the backup that exists before adding a new one.** Today the seed text is backed up and the database
is not (O3). Install a `post-commit` auto-push in the data repo, and push the commit that is currently sitting
unpushed.

**5b. Snapshots.** Every 4 hours: `VACUUM INTO` a snapshot, then `PRAGMA integrity_check` on the output, then
restic. `VACUUM INTO` is the right choice and SQLite says so: "The VACUUM INTO command is transactional in the
sense that the generated output database is a consistent snapshot of the original database" and it is "an
alternative to the backup API for generating backup copies of a live database"
([VACUUM](https://sqlite.org/lang_vacuum.html)). It beats the backup API here because the API restarts when
another connection writes and "may never run to completion" ([backup](https://sqlite.org/backup.html)).
Node 24 also gives you `sqlite.backup(sourceDb, path, options)` as a module-level function returning a
Promise ([node:sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)) if you prefer it; `node:sqlite`
is stability 1.2, release candidate. `integrity_check` is O(N log N) versus `quick_check`'s O(N)
([pragma](https://sqlite.org/pragma.html)); on a 2.8 MB database that is nothing.

**5c. restic, and a correction.** restic has **no native Google Drive backend**; its own docs say so and point
at rclone: `restic -r rclone:<remote>:<path>`
([preparing a new repo](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)). rclone's
Drive backend rate-limits at roughly **2 files per second**, which is the exact shape restic's many-small-pack
layout produces ([rclone drive](https://rclone.org/drive/)). Raising `--pack-size` should help
(*inference, unverified*). Encryption is AES-256-CTR with Poly1305-AES and an scrypt-derived key, all
client-side ([references](https://restic.readthedocs.io/en/stable/100_references.html)), which answers O2.
An Intel macOS binary is a direct download, so Homebrew's Intel situation does not matter:
`restic_0.19.1_darwin_amd64.bz2` from [the releases page](https://github.com/restic/restic/releases).

**5d. Verification, and a correction.** `restic check` by default "does not verify that the actual pack files
on disk in the repository are unmodified"; `--read-data` does, at the cost of downloading everything, and
`--read-data-subset=x%` "will not guarantee to cover all available pack files"
([working with repos](https://restic.readthedocs.io/en/stable/045_working_with_repos.html)). **I could not
find any restic documentation saying `check` is not a substitute for a test restore** (no source found; the
advice is community consensus only). Your monthly restore drill is therefore the right instinct and should be
scripted: restore to a temp dir, open the DB, `integrity_check`, run one FTS5 query, delete.

**5e. Do not put the live database in the Drive folder.** No SQLite document names Google Drive by name
(no source found), but three that do apply: a background process copying mid-transaction can produce a corrupt
copy ([how to corrupt §1.2](https://sqlite.org/howtocorrupt.html)); a copy separated from its `-wal` can lose
committed transactions ([WAL](https://sqlite.org/wal.html)); and filesystems with unreliable locking cause
corruption (§2.1). Keep the live DB local, sync only the snapshot.

**5f. "backup ok / failed" to `#log`, plus a dead-man alarm after 12 hours.** Agreed, and it is the single
most valuable line in this step, because a silent backup failure is how people discover they had no backups.

**5g. The Obsidian read-only index.** Design:

- **Storage: new tables, not the `embeddings` table.** `embeddings` is keyed `turn_id INTEGER PRIMARY KEY`
  referencing turns, so a vault chunk does not fit. Separate tables also make "from your notes" versus "you
  told me" a property of the schema rather than a flag, and let a re-index delete every vault row without
  touching conversation memory.

  ```sql
  CREATE TABLE vault_notes (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    mtime INTEGER NOT NULL, hash TEXT NOT NULL,
    canonical_status TEXT, retrieval_status TEXT, privacy_class TEXT, llm_summary TEXT,
    indexed_at TEXT NOT NULL);
  CREATE TABLE vault_chunks (
    id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES vault_notes(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL, heading TEXT, text TEXT NOT NULL, dim INTEGER NOT NULL, vec BLOB NOT NULL);
  CREATE VIRTUAL TABLE vault_fts USING fts5(text, chunk_id UNINDEXED);
  ```

- **Chunking: by heading.** Your notes are heading-structured, so one H2 section is one chunk, split at about
  1200 characters with 150 overlap if a section runs long. Prepend the note title and heading path to the
  text that gets embedded ("RAG Ready Knowledge Map > Metadata contract: ..."), so a chunk carries its own
  context. **Embed `llm_summary` as chunk 0**: it is a hand-written summary and will be the best retrieval
  target in the note.
- **Filtering: your contract, exactly.** Include `retrieval_status: include` and `include_index`; exclude
  `archive_only`; exclude `.obsidian/` and non-markdown. Missing field: see **A7**. `privacy_class`: see
  **A8**. Nothing else is path-based, because the whole point of the contract is that metadata governs.
- **Re-index: scan on a 15-minute timer, not a file watcher.** The vault lives under Google Drive's
  CloudStorage file provider, and file-system events on provider-backed folders are not reliable
  (*inference, unverified, and worth testing*). A mtime-plus-hash scan of 68 files costs nothing and leaves no
  watcher to leak.
- **Recall: cite the path.** Your doctrine requires it: "Retrieval must cite the note path, source row,
  artifact, or memory id used". Render vault hits as a separate block, `from your notes,
  20_Knowledge/Ops/RAG Ready Knowledge Map.md > Metadata contract`, never mixed into conversation memory.
- **Size: about 150 lines, not 100.** The frontmatter parse, the heading chunker, the hash-based change
  detection and the separate recall path each cost more than they look. **Cost:** 68 notes at 340 KB is
  roughly 350 chunks, about 1 MB of vectors at 768 dims or 0.5 MB at 384. RAM is the embedding model, which
  you are already paying for. Indexing time: I could find **no published throughput benchmark** for
  transformers.js on any x64 CPU (no source found), so this needs measuring, but 350 chunks is small enough
  that even a pessimistic 200 ms each is 70 seconds, once.
- **Honest answer to your question (d): the near-term gain is small.** 68 notes roughly doubles Aang's corpus,
  but most of it is about CereBro, Sundesk, Bridgefour and Waymark, which Aang has no role in. The notes with
  real value to him today are the Ops doctrine, the Playbooks and the Project Registry: maybe ten notes. Build
  it because it is small and because it is the mechanism that pays off as the vault grows, not because it will
  make Aang noticeably smarter this month. It belongs exactly where you put it, after the move.
- **From `skills/obsidian-memory-write.skill.md`, what is worth keeping for the read direction:** the
  frontmatter contract handling and the path conventions. The write half is what you rejected and none of it
  carries over.

**5h. The AiVatar vault import**, applying your own playbook. Draft notes are in section 8. Note that
`Bowgull/AiVatar` is **public**, so the playbook's "approve before cloning private repos" gate does not apply;
`Bowgull/aang-data` is private and should stay out of the vault entirely.

| | |
|---|---|
| **Where** | MacBook |
| **Depends on** | Step 4, A7, A8, A9, B3, B4 |
| **Gate** | A restore drill produces a database that opens, passes `integrity_check` and answers one FTS5 query. Asking Aang something only the vault knows returns an answer citing the note path. A note with `privacy_class: private` does not appear in a Discord answer. |
| **Back out** | Drop the three vault tables; the index is derived data. |
| **Risk** | Low. Nothing here can damage conversation memory if the tables stay separate. |

### Step 6. The Mac pet

Swift/AppKit, to parity with the Windows pet, using `src/Body` as the spec. The sprite assets are already
portable: 118 PNG frames under `assets/aang/frames`, locked by `assets/aang/SPRITE.sha256`.

Sequence: the `NSPanel` feasibility test first (non-activating, `.fullScreenAuxiliary`, accessory policy) as
the retired Phase P said; then rendering with nearest-neighbour at integer scale; then the protocol client;
then hands and permissions **on the pet app only**, which is your rule and which I want to extend to the
Windows pet too (section 6 item 2).

**C2 matters here.** macOS grants Accessibility and Screen Recording to a specific binary, and a bare
command-line tool started by launchd is the known-fragile case. A signed `.app` bundle is more work and far
less likely to lose its permissions on every rebuild.

| | |
|---|---|
| **Where** | MacBook |
| **Depends on** | Steps 2 and 3, C2 |
| **Gate** | `sprite-lock.test.ts` still passes. The Mac pet renders crisp over the desktop, never steals focus, hides while the Shadow app is frontmost unless you chose both, and a hands RPC it did not confirm is refused. |
| **Back out** | It is a separate app; do not ship it. |
| **Risk** | Medium, and it is the longest single piece of work here. |

### Step 7. Finish M5, then the features

In this order: the four genuinely-open M5 items (P2), with crash recovery reframed as the design decision it
is; then consolidation on a real schedule with the Mem0-style ADD/UPDATE/DELETE/NOOP decision replacing
`keyNoun` (M2, and see section 6 item 7); then automatic recall (M3, with the async cost priced); then the
post-apply job pipeline (Gmail reply tracking, an interview brief the night before, follow-up drafts at 7 and
14 days, drafts only, nothing sends without your approval and PIN); then Discord slash commands; then crash
reports; then the doc updates from P3, which are cheap and currently actively misleading.

---

## 4. Data checklist, and the cutover runbook

### Carry over

| What | Where it is now | Size | Notes |
|---|---|---|---|
| `Brain/profile.md`, `learned.md`, `job-search.md`, `projects.md` | `Documents/Aang/Brain/` | ~1.5 KB | You named these. Already in the private data repo. |
| `~/job-hunt-data` | `C:\Users\Shadow\job-hunt-data` | 234 KB | `README.md`, `job_pipeline.md`, `memory/`, `resume/`. Gitignored deliberately. |
| `Guides/`, `reports/`, `research_notes/` | data repo | small | Already in git; clone on the Mac. |
| The repo itself | `Documents/AangApp` | | `git clone`, then `npm ci`. |

### Recreate fresh

| What | Why |
|---|---|
| `aang.db` | You accepted a memory reset. Step 2f creates it from the committed schema, which also proves 2f works. |
| `google.json`, `spotify.json`, `simkl.json`, `discord.token` | Secrets do not travel. Re-issue on the Mac (4e), and **revoke the Windows ones afterwards**. |
| `hook.key`, `mac-front.key` | Regenerated on first run (`core.ts:799-805`). The Mac-front key becomes unnecessary once the listener is gone. |
| `trust.json` | Standing permissions are machine-shaped. Start empty; you will re-grant in a week of use, and step 1d changes what the kinds mean anyway. |
| `sessions.json`, `tasks.json`, `launched.json` | Point at Windows sessions and Windows folders. |

### Throw away

- `aang.before-false-facts-2026-09-21.db` and `aang.before-test-cleanup-2026-09-20.db` (the only backups that
  exist today, both hand-made, both sitting next to the original).
- `body.before-test-cleanup.json`, `core.log`, `body.log`, `input-history.json`.
- `mac.json` (the address becomes loopback).
- The Perl listener and its LaunchAgent (4i).
- The Windows Startup shortcut for the Core (4j).

### Cutover runbook

1. **The day before.** Steps 0 to 3 done and running on Shadow for at least 48 hours. `git status` clean on
   both repos. Push the data repo (it is currently 1 ahead).
2. **Snapshot.** On Shadow: `VACUUM INTO` a dated copy of `aang.db`, zip the state folder, and copy both
   somewhere that is not either machine. This is the rollback.
3. **Rehearse.** Mac Core against the *copy*, `AANG_DISCORD=0`, Windows pet still on Shadow. Run the suites.
   Do not proceed if anything fails.
4. **Stop the Shadow brain.** Quit the pet. Confirm no `node` process is serving 47831. Remove the Startup
   shortcut.
5. **Start the Mac brain.** LaunchAgent loaded, Discord token in place, `brain.lock` held.
6. **Repoint the Windows pet** at the Mac's tailnet address with its token. Confirm "brain online".
7. **One turn from each surface.** Pet, and Discord. Confirm Discord answers **once**.
8. **Repoint the Mac's Claude Code hooks at loopback, then remove the Perl listener** (4i).
9. **Verify the backup runs once**, end to end, including the `#log` line.
10. **Leave the Shadow brain uninstalled but recoverable for two weeks.** Keep the snapshot from step 2.

### Rollback

At any point up to step 8: quit the Mac LaunchAgent, restore the snapshot from step 2 onto Shadow, put back
the Startup shortcut, point the pet at `127.0.0.1`. After step 8 you also have to re-run the Mac setup for the
hooks, which is a five-minute job. **Rollback stops being cheap once you have talked to the Mac Aang for a
day**, because that conversation is only on the Mac. So: decide within the first day.

---

## 5. RAM budget for 8 GB

Measured on Shadow, right now, not estimated: **the Core's `node` process is 278 MB working set**, and the one
lane it had running (a `claude.exe` child, which is how the Agent SDK works, one child process per lane) was
**221 MB**. The Windows pet was **103 MB**.

| Component | Estimate | Basis |
|---|---|---|
| macOS 13 plus your usual apps | 2.5 to 3 GB | inference; **B5 measures it** |
| Core `node` process | 280 MB | measured |
| Embedding model in-process | 60 to 120 MB at 384 dims, or 450 to 700 MB for embeddinggemma q8 | see section 6 item 5; the q8 figure is inference, no source found |
| Chat lanes | 220 MB each | measured |
| Worker lane | 220 MB each | same mechanism |
| Web lane | 220 MB, plus ~100 MB for the Playwright MCP child, plus 300 to 500 MB for headless Chromium | inference |
| Mac pet | 100 to 150 MB | by analogy with the measured Windows pet |
| Claude desktop app, when a job hunt is open | 500 MB to 1 GB | inference |

**Recommendation: 2 chat lanes, 1 worker, and the web lane closed after 5 minutes idle.** That gives a steady
state of roughly 280 + 100 + 440 + 150 = **about 1 GB**, peaking near **2.5 GB** with a worker and a web
lookup running, and near **3.5 GB** if the Claude app is also open. Against 5 GB of headroom that works, but
only if three things hold:

1. **The worker-lane leak is fixed** (D8). Today every background job ever run keeps a 220 MB process alive
   for the life of the Core. On Shadow that is invisible. On 8 GB it is the most likely way this falls over.
2. **The web lane and its Chromium get closed**, not just created lazily.
3. **The disk has room to swap.** macOS grows swap dynamically, and 14 GB free is not a comfortable margin
   (B2).

This is A11: the caps cost you a third warm lane and a second concurrent job. If you would rather keep 3 and 2,
say so and I will budget for swap instead.

---

## 6. Better than what you proposed

Where I think there is a stronger method. Each has the tradeoff and my recommendation.

**1. Capability advertisement instead of platform branching.** You listed "Mac safety lists" and "neutral tool
text plus a target machine" as separate items. The stronger version is one mechanism: each pet declares in
`hello` what it can do (`["shell","open","read_window","ui_act","clipboard","notify"]`), and tools route by
capability. *Why stronger:* it fixes T1 through T6 generically instead of per tool; it makes the Mac pet's
incomplete parity a non-issue, because it simply advertises less; and tool descriptions get generated per
target instead of containing `C:\Users\Shadow` (`tools.ts:507`). *Tradeoff:* a bigger step-2 change up front.
*Recommendation:* do it. The per-tool version has to be redone for every tool you add.

**2. The permission gate belongs in the pet, not only in the Core. This is the most important thing in this
document after the transport auth.** Today the Core decides and then tells the pet to act, and
`PetWindow.cs:416-417` obeys unconditionally. Once the Core is on the Mac and holds the model, the Core is the
part most likely to be injected. If the decision stays there, a compromised Core sends `hands.request` and the
pet does it. *Why stronger:* mediated access means the gate authenticates, authorizes and logs at the boundary
the attacker has to cross. If the gate is inside the thing that got compromised, it is not a boundary. You
already said "Mac hands and permissions on the pet app only": **make that the rule for both pets**, so the
Core's gate is a first filter and the pet's is the boundary. *Tradeoff:* two prompts to build and keep in
sync, and a small amount of duplicated state. *Recommendation:* do it, and make it a step-3 requirement rather
than a step-6 Mac detail.

**3. Do not reschedule the system-prompt rebuild. Take the mutable parts out of it.** Your step-2 item says
"scheduled prompt refresh". *Why that is the wrong fix:* rebuilding the system prompt requires a new session,
which breaks conversation continuity, and it invalidates the prompt cache on every rebuild. The codebase
already discovered this for facts and wrote down why (`core.ts:782-785`, 2026-09-20) and moved them to
per-message delivery (`withKnown`, `core.ts:1332-1340`). The same reasoning applies to `profile.md` and
`learned.md`. *Recommendation:* keep the system prompt stable and cacheable, and deliver profile and learned
text per message like facts already are. Then "editing profile.md needs a restart" stops being true without
any scheduling at all. Consolidation separately does want a real clock (D7).

**4. One brain should be a lock, not the absence of a supervisor.** Removing `CoreSupervisor` is necessary and
not sufficient (see step 2a). *Tradeoff:* one more file and a stale-lock story. *Recommendation:* do it. You
asked for "never possible", and only a lock delivers that.

**5. Do not use embeddinggemma-300m through transformers.js. It will not install, and even fixed it is the
wrong size for this machine.** *The blocker:* current `@huggingface/transformers` pulls `onnxruntime-node`
1.30.0, which ships no darwin-x64 binary
([file listing](https://unpkg.com/onnxruntime-node@1.30.0/?meta); tracked open at
[onnxruntime#27961](https://github.com/microsoft/onnxruntime/issues/27961)). Node has no WASM fallback. It is
fixable with an npm `overrides` pin to 1.22.0 or 1.23.2, both of which do ship the x64 binary, and **not**
1.21.x, which has a process-exit abort explicitly on macOS 12/13 x86-64
([#24579](https://github.com/microsoft/onnxruntime/issues/24579)). *Then the sizing:* embeddinggemma q8 is a
**309 MB** weights file ([HF tree](https://huggingface.co/api/models/onnx-community/embeddinggemma-300m-ONNX/tree/main/onnx)),
on a 2-core CPU with no VNNI, where ORT's own docs warn "it is not rare to get worse performance on old
devices" ([quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)).

  **Recommendation: `Xenova/bge-small-en-v1.5` at `dtype: 'q8'`.** 34 MB, 384 dimensions, MTEB English v2
  0.643 against MiniLM-L6's 0.590, and it sits on the well-tested transformers.js path. That is **9 times
  smaller** than embeddinggemma q8 for a better score per byte on this hardware. Two traps to avoid:
  `dtype` **defaults to fp32 in Node**, not q8 (the q8 default is browser-only), so passing it explicitly is
  the difference between a 34 MB download and a 133 MB one; and `BAAI/bge-small-en-v1.5` itself ships fp32
  only, so use the `Xenova/` port.

  *Tradeoff:* 384 dimensions instead of 768. *Why that is nearly free here:* **you only have 371 vectors**
  (335 turns, 31 topic centroids, 5 cache rows), the `dim` column already versions them, and the whole
  database is 2.8 MB. Re-embedding is minutes, not an afternoon. **One bug must be fixed first:**
  `backfill()` (`memory.ts:366-389`) selects on `LEFT JOIN embeddings WHERE e.turn_id IS NULL` and does not
  filter on `dim`, so after a model change it would consider every turn already done and re-embed nothing.
  *Also note:* if you stay with embeddinggemma for any reason, its prompt prefixes are **not**
  `search_query:`/`search_document:` (that is the Nomic convention). They are
  `task: search result | query: {content}` and `title: none | text: {content}`, documented in both the Google
  and onnx-community cards. Getting them wrong silently degrades retrieval.

**6. Keep the Ollama path as a fallback, do not delete it.** `embed.ts:13` already reads `AANG_OLLAMA`, and
the whole module fails soft to keyword search (`embed.ts:34-40`). *Recommendation:* make the in-process
embedder the default and keep the HTTP path behind the same env var, so if the ONNX runtime breaks on this
machine you have a working escape hatch rather than a dead feature.

**7. M2's fix is right; "nightly" is not.** The Mem0-style ADD/UPDATE/DELETE/NOOP replacement is sound and it
kills the `play`/`located`/`asking` collisions at the root, because the candidate set becomes semantically
similar facts instead of a first-word match. *But `consolidate.ts:3-6` records that nightly is impossible on
this machine*: the Shadow session cap meant consolidation runs at session start instead. On an always-on Mac
nightly becomes possible, which is a genuine gain from the move, but the trigger should be explicit rather
than inherited. *Two schema notes:* `facts.ts` already **is** `learned_at` and `valid_from`, and `last_seen`
is last-confirmation, so the only genuinely new column is **`valid_to`**, which `docs/MEMORY.md:90-91` already
promises and the code does not implement. And `facts.text` is **UNIQUE**, which is what forced the
revive-a-retired-fact branch at `memory.ts:98-109` and which a DELETE-then-ADD cycle will collide with.
*Also:* facts have **no embeddings today** (the `embeddings` table is keyed on `turn_id`), so a
similar-facts lookup needs its own vectors.

**8. M5's RRF is right, but not for the reason given.** The Cormack paper
([PDF](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)) **never mentions interleaving at all**; its
comparison set is Condorcet Fuse, CombMNZ and best-individual, and **CombMNZ actually beat RRF on two of its
own experiments**. So "RRF outperforms interleaving" has no source. *The real reason to switch is stronger:*
your two lists are scored on incomparable axes (cosine with a 0.55 floor versus FTS5 bm25 rank), so positional
interleaving treats a 0.99 hit and a 0.56 hit identically. RRF fixes exactly that, by using ranks and ignoring
the scores. *On k=60:* the paper says it "was fixed during a pilot investigation and not altered", and its own
Table 1 shows **k=80 scoring higher**. Use 60 because everyone else does, but do not treat it as tuned. Note
Qdrant defaults to k=2, so the constant is not universal.

**9. Skipping sqlite-vec and a re-ranker is correct, with a citation.** sqlite-vec's author states it "is
currently focused on really fast brute-force vector search" with a practical ceiling "in the 100's of
thousands" ([v0.1.0 post](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)); ANN is
explicitly not shipped ([issue #25](https://github.com/asg017/sqlite-vec/issues/25)). At 371 vectors going to
maybe 1,000 with the vault, a linear scan in JavaScript is the right answer and an index would be pure
overhead. *Note:* I could find **no published benchmark** of brute-force cosine in Node at this scale
(no source found), but the argument does not need one.

**10. Fix the backup you have before building the one you want.** Today `aang.db` has no off-machine copy at
all and the data repo is sitting unpushed with no auto-push hook, while `Brain/*.md`, `chatlog.txt`,
`memory.txt` and `history.txt` are on GitHub in plaintext. *Recommendation:* step 5a first, restic second. And
since restic gives you client-side encryption, consider whether the plaintext-on-GitHub half should continue
at all once restic is running.

**11. Tailnet Lock: I recommend against it** (A10). This is me recommending **less** security, because the
failure mode is worse than the threat on a two-node tailnet where one node is a dying 2017 laptop.

**12 and 13.** Context editing availability, and the prompt-cache minimums that decide M4. See the note at the
end of this section.

**14. A deviation I want on the record: you cannot have both "FileVault on" and "the brain is always there".**
See A2. It is not a tradeoff I should resolve for you.

---

## 7. Security review of this map

**Where the map breaks least privilege.**

- **The Core ends up holding everything on one machine.** Mail token, Discord token, every conversation, and
  the model that reads hostile text, all on an unpatched OS. That is the opposite of least privilege, and
  steps 0 to 5 mitigate it rather than fix it. The only real fix is A1(b), a supported host.
- **Step 3d hands the pets a lot of power.** Seventeen RPCs that do things to a machine is a large interface,
  and each one is a place where a Core that has been talked into something reaches the OS. **Item 2 of section
  6 is the mitigation and it is not optional:** if the pet does not gate independently, step 3 has moved the
  capability without moving the control.
- **Standing trust still has no expiry** even after step 1d. It is a smaller surface, not a bounded one.
- **The worker lane runs with all 52 tools** (`core.ts:172`). Step 1e puts the *decision to start one* behind a
  gate, but once started it has the full shelf. A worker that only ever needed file tools should only have
  file tools.

**New attack surface each step adds.**

| Step | What it adds |
|---|---|
| 0 | Tailscale tags. A stolen auth key with the brain tag now reaches ports 47831 and 47832 directly. Key expiry is also disabled by default on tagged devices ([tags](https://tailscale.com/kb/1068/tags)). |
| 1 | Almost none; it is nearly all removal. The PIN adds a stored secret and a lockout counter, both small. |
| 2 | **The big one: the WebSocket leaves loopback.** Everything now rests on the Origin rejection, the token and the Tailscale grant. Any one of the three failing puts an unauthenticated `submit` on the network. The `brain.lock` file becomes a denial-of-service target for anything that can write `dataDir`, which is why 1c must land first. |
| 3 | The pet becomes a remotely-driven actuator. Its RPC handler is now attacker-adjacent in a way `PetWindow.cs` was never written to be. |
| 4 | A LaunchAgent, a Keychain entry, and `~/.claude/settings.json` rewritten. The sandbox *reduces* surface if B1 says it runs. Removing the Perl listener is a straight subtraction and one of the best things in the whole plan. |
| 5 | A backup repository someone could delete or fill, and a **new untrusted input channel**: vault notes are now model-readable text. They are yours, so the risk is low, but anything you ever paste into a note becomes something Aang will read. |
| 6 | A second pet with Accessibility and Screen Recording on macOS. Those are the two most powerful grants on the system. |
| 7 | Gmail reply tracking means Aang reads more attacker-written text, on a schedule, unprompted. |

**What I would fix with one more day.**

1. **Make the worker lane's tool shelf the minimum for its job**, rather than all 52 (`core.ts:172`). Biggest
   privilege reduction for the least work, and the mechanism already exists in `QUICK_TOOLS`.
2. **Give standing trust an expiry and a use counter** (`trust.ts:43-49`), so a grant you gave once in March
   is not still open in September.
3. **Fence and taint every external text channel uniformly.** Right now mail and window text are fenced but
   transcript text is not (`hooks.ts:130`, spliced in raw at `:133` and `:162` and announced verbatim at
   `core.ts:906-908`). One helper, applied everywhere, instead of six call sites that each remembered
   differently.
4. **Encrypt `stateDir` secrets at rest** rather than relying on FileVault, so A2's option (b) stops being
   catastrophic if you take it.

---

## 8. Appendix: the AiVatar vault notes

Applying `20_Knowledge/Playbooks/GitHub Repository Import Method.md`. Repository fingerprint as of
2026-09-23: **`github:Bowgull/AiVatar@81d106f59feec08ac8c8011e07976a7a21f006a2`**, public. The data repo
`Bowgull/aang-data` is private and should not enter the vault.

Four changes, per the playbook's steps 4 to 7:

1. **`10_Projects/AiVatar/AiVatar.md`** (project bridge), frontmatter per the contract:
   `canonical_status: current`, `retrieval_status: include`, `privacy_class: internal`,
   `source_ids: [github:Bowgull/AiVatar@81d106f...]`,
   `related_notes: [00_Atlas/GitHub Project Map, 20_Knowledge/Sources/GitHub/AiVatar Repository Source, 10_Projects/Projects]`,
   `llm_summary:` "Aang, a desktop companion: a TypeScript Core brain on the Claude Agent SDK plus a C# WinForms pet body, with SQLite memory, Discord as the phone channel, and a job-hunt pipeline."

2. **`20_Knowledge/Sources/GitHub/AiVatar Repository Source.md`** (source summary, pinned to the SHA).
   Content, all verified from the repo rather than the README:
   - Stack: TypeScript on Node 24 (`node:sqlite`, `@anthropic-ai/claude-agent-sdk` pinned 0.3.278,
     `ws`, `discord.js`, `zod`) and C# on .NET 10 WinForms (`net10.0-windows`).
   - Layout: `src/Core` (38 TypeScript files, the brain), `src/Body` (21 C# files, the pet),
     `src/Reader` (AangReader, a Windows UI-automation helper), `assets/aang` (118 PNG frames locked by
     `SPRITE.sha256`, fonts, sfx), `docs/` (8 files), `tools/`, `tests/`.
   - Docs present: `ROADMAP.md`, `PLAN.md`, `DESIGN.md`, `DECISIONS.md`, `FEATURES.md`, `MEMORY.md`,
     `PROTOCOL.md`, `THE-PLAN.md`. **Flag in the note that several are stale** (section 2.8, P3), which is
     exactly what the playbook's "Do not treat README claims as guaranteed current state" is for.
   - Separate private data repo: `Bowgull/aang-data`, named but not summarised.
   - `retrieval_status: include`.

3. **`00_Atlas/GitHub Project Map.md`**: add AiVatar to both lists, and add the SHA to `source_ids`. It
   currently covers Sundesk, CereBro, Declyne, Bridgefour, Waymark and sygnalist-brain.

4. **`.obsidian/graph.json`**: one new path-keyed colour group for `10_Projects/AiVatar`, following the
   existing 22. **I need B3 before I can pick a colour that does not clash.**

Per your doctrine ("Link structure creates clusters. Color only labels them"), the links in items 1 to 3 are
what actually does the work; the colour is a label.

---

## 9. Commands to run on the MacBook

All read-only. Bring the output back.

```bash
# B2. Disk. The plan needs about 30 GB free; you have 14.
df -h / ; du -sh ~/Library/Caches ~/Downloads ~/Library/Developer 2>/dev/null

# B5. Real memory pressure with your normal apps open.
vm_stat ; sysctl hw.memsize hw.ncpu hw.physicalcpu ; top -l 1 -n 0 | head -12

# B6. Which Tailscale build, and whether the tailnet is up.
ls -d /Applications/Tailscale.app 2>/dev/null; \
  /Applications/Tailscale.app/Contents/MacOS/Tailscale version 2>/dev/null || tailscale version
tailscale status --json | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["Self"]["HostName"],d["Self"]["TailscaleIPs"],d["Self"].get("Tags"))'

# B7. What is in your Claude settings besides Aang's hooks, since step 4 rewrites this file.
python3 -c 'import json;d=json.load(open("'"$HOME"'/.claude/settings.json"));print(sorted(d.keys()));print(json.dumps({k:v for k,v in d.items() if k!="hooks"},indent=2)[:2000])'

# B1. Does the sandbox actually run on this Intel/macOS 13 box? This is the one that can void step 1d and 4d.
sw_vers ; uname -m
npx -y @anthropic-ai/sandbox-runtime@0.0.77 --help 2>&1 | head -20
npx -y @anthropic-ai/sandbox-runtime@0.0.77 "echo sandbox-ok" 2>&1 | tail -5

# Node, and whether the ONNX runtime x64 binary actually loads here (section 6 item 5).
node -v ; which -a node
cd /tmp && mkdir -p ortcheck && cd ortcheck && npm init -y >/dev/null 2>&1 && \
  npm i onnxruntime-node@1.23.2 >/dev/null 2>&1 && \
  node -e "const o=require('onnxruntime-node');console.log('ORT loaded ok',o.env.versions||'')" ; echo "exit:$?"

# B3. The existing colour groups, so a new one fits instead of clashing.
VAULT="$HOME/Library/CloudStorage/GoogleDrive-bocas.joshua@gmail.com/My Drive/CereBro-Vault/07_Knowledge/obsidian-vault"
python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(json.dumps(d.get("colorGroups",[]),indent=1))' "$VAULT/.obsidian/graph.json"

# B4. How many notes actually carry the contract fields. This decides how much A7 excludes.
cd "$VAULT" && echo "total md: $(find . -name '*.md' -not -path './.obsidian/*' | wc -l)" && \
  echo "with retrieval_status: $(grep -rl '^retrieval_status:' --include='*.md' . | wc -l)" && \
  echo "  include:       $(grep -rl '^retrieval_status: *include *$' --include='*.md' . | wc -l)" && \
  echo "  include_index: $(grep -rl '^retrieval_status: *include_index *$' --include='*.md' . | wc -l)" && \
  echo "  archive_only:  $(grep -rl '^retrieval_status: *archive_only *$' --include='*.md' . | wc -l)" && \
  echo "with privacy_class: $(grep -rl '^privacy_class:' --include='*.md' . | wc -l)" && \
  echo "  private: $(grep -rl '^privacy_class: *private *$' --include='*.md' . | wc -l)"
cd "$VAULT" && echo "--- notes with NO retrieval_status ---" && \
  comm -23 <(find . -name '*.md' -not -path './.obsidian/*' | sort) \
           <(grep -rl '^retrieval_status:' --include='*.md' . | sort)

# Confirms the vault is real files, not Drive placeholders, and gives the true byte size.
cd "$VAULT" && find . -name '*.md' -not -path './.obsidian/*' -print0 | xargs -0 du -ch | tail -1
ls -l@ "$VAULT/20_Knowledge/Ops/RAG Ready Knowledge Map.md"

# Sleep and power, so step 0c is planned against reality rather than assumption.
pmset -g custom ; pmset -g assertions | head -20 ; system_profiler SPPowerDataType | sed -n '1,30p'

# The Perl listener step 4i removes, and the hooks step 4 repoints.
launchctl print "gui/$(id -u)/com.aang.listener" 2>&1 | sed -n '1,25p'
ls -la "$HOME/Library/Application Support/AangListener/" 2>/dev/null

# Confirms there is no `claude` CLI, which decides whether AANG_CLAUDE_EXE is needed.
which claude || echo "no claude CLI (expected; the Agent SDK ships its own)"
ls /Applications | grep -i claude
```
