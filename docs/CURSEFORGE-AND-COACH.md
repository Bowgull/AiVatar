# CurseForge updates + rotation coach: can it be done? (2026-10-22)

Feasibility research for two things Joshua asked for on 2026-10-22:

1. **Addon updates in the morning brief.** A tick list (name, new version, a tiny "what changed",
   warnings). He ticks; Aang updates *through the CurseForge app*, never while WoW is running. No API key.
2. **Rotation coach.** Combat log on only in dungeons/raids, coaching only when he asks, learning each
   toon's class/spec.

Short answer: **both are doable.** Part 1 is mostly reading files that are already on disk plus pressing
buttons Aang's existing UI Automation helper (`src/Reader/Act.cs`) can already press. Part 2 needs one
tiny addon of ours (turns logging on/off) and a log parser in the Core.

Legend: **[PC]** = I checked it on this Shadow PC today, read-only. **[web]** = from the web, not tested here.
**[guess]** = my inference, needs checking. Nothing in CurseForge, WoW or the addon folders was changed;
WoW and CurseForge were not started.

---

## Part 1 - Addon updates through the CurseForge app

### 1.1 Where CurseForge keeps the state [PC]

| What | Where |
|---|---|
| The app | `%LOCALAPPDATA%\Programs\CurseForge Windows\CurseForge.exe` - an **Electron** app (version 1.324.0), with Overwolf bits inside (`owutility.dll`). Not running Overwolf itself. |
| Its worker | `resources\app.asar.unpacked\plugins\curse\win\Curse.Agent.Host.exe` - a .NET helper that does the real scanning, downloading and unzipping. The UI talks to it over a local port. |
| **Addon status** | `%APPDATA%\CurseForge\agent\GameInstances\AddonGameInstance.json` (620 KB) |
| Operation history | `%APPDATA%\CurseForge\agent\database\app.db` (SQLite, table `project_operations`) |
| Worker logs | `%APPDATA%\CurseForge\agent\logs\CurseClient\*.json` (one per app session) |
| Settings | `%APPDATA%\CurseForge\storage.json` - holds his login tokens too. **Aang never reads that file.** |
| Marker in WoW | `_classic_beta_\.curseclient` = the game-instance GUID `5a3245f5-...` that the JSON uses |

Reading tip: from my shell, `%APPDATA%` is sandboxed. Read through `\\localhost\c$\Users\Shadow\AppData\...`
to see the real files. Aang itself (started by him) reads the normal path.

### 1.2 What's in `AddonGameInstance.json` [PC]

An array with one game instance ("Forever Beta", `gameVersion` `1.60.1.70450`, `gameVersionTypeId` 88568,
`preferenceAutoInstallUpdates: false`). Inside, `installedAddons` holds **17 addons**, which cover all 34
folders in `Interface\AddOns` (Details = 8 folders, GearQuest = 10, BlizzMove = 2). Useful fields per addon:

| Field | Use |
|---|---|
| `name`, `addonID` (project id), `webSiteURL`, `primaryAuthor` | the row label + link |
| `installedFile.id`, `.fileName`, `.fileDate` | what he has |
| `latestFile.id`, `.fileName`, `.fileDate`, `.gameVersion[]` | newest file CurseForge knows of |
| `installedFile.modules[].foldername` | which AddOns folders belong to it |
| `filePaths[]` | every file it installed (good for "is anything missing?") |
| `dateUpdated`, `isModified`, `preferenceIsIgnored`, `isEnabled` | state |

- **Update available = `latestFile.id != installedFile.id`.** Today all 17 match (he updated on 18 Oct).
- **Don't trust `status`.** It's 4 for addons updated in the last session and 5 for older ones; the
  app's own enums don't match those numbers cleanly. [guess] Use the file ids instead.
- **Don't trust `isCompatibleWithClient`.** It's `false` on every addon, even ones that list `1.60.1`.
- **No changelog field.** Neither file record carries the changelog text.
- Version strings are only inside file names (`Auctionator-341.zip`, `RXPGuides-v4.11.26.zip`); the local
  `.toc` `## Version` is the cleaner "installed" value.

### 1.3 Is it fresh? Only while the app runs [PC]

The worker log for 18 Oct shows: a check at startup (`Checking for game instance Forever Beta updates`,
under 1 s), then **every 60 minutes** (`Mods update interval of 60 minutes has elapsed`), and the JSON is
re-saved after each change. When the app is closed nothing refreshes: today the file is 4 days old.

So for a morning brief Aang must **start CurseForge minimized first** (the app has a `--minimized` flag),
wait for the JSON's modified time to change (about 10 s after start), then read it. Only when WoW is not
running. CurseForge also has its own "no update during in-game" rule, a second safety net.

### 1.4 How Aang can press "Update" - options rated

| # | Way | How it works | Robustness |
|---|---|---|---|
| A | **UI Automation by button name** | Electron = Chromium, which exposes its page to Windows UI Automation when a tool asks. Aang's `AangReader --act` already wakes Chromium's tree on demand and presses buttons **by name** with InvokePattern (no mouse, no pixels). English labels in the app bundle: **"Update"**, **"Update All"**, **"Updating..."**. | **Good.** Survives window size, theme, position. Breaks only if they rename buttons. Per-row "Update" buttons all share one name, so pick the row by the addon name next to it (walk the row's parent). |
| B | **`curseforge://install?addonId=X&fileId=Y`** | Registered protocol [PC: `HKCR\curseforge` -> `CurseForge.exe "%1"`]. The app's code [PC, read in app.asar] parses `install` with `addonId`, `fileId`, `gameId`. It opens a small "Install <name>" box with a game-instance picker and one **Install** button. | **Good for exactly one addon at an exact version.** Still needs one button press (do it with A). [guess] Installing a newer file of an installed addon should replace it, but I could not test that without touching his addons. |
| C | Turn on CurseForge's own auto-update | `preferenceAutoInstallUpdates` exists per game and per addon | Robust, but **not what he asked** (he wants to tick). Mention as an option only. |
| D | Talk to the worker's local port | `Curse.Agent.Host.exe --port=58128 ... --api-key=...` | **No.** Undocumented, and it would mean reusing CurseForge's own API key - the exact thing their terms forbid. |
| E | Pixel clicks / synthetic keys | screenshot + click | **No.** Fragile, and it can land in the wrong window (we have had a test Esc land in WoW). |

Also checked: the app has **no command-line flag to update** (the flags in the bundle are `--minimized`,
`--disableHardwareAcceleration`, installer flags). `curseforge://` also supports `launch-game`, `login`,
`show-release-notes`, not "update".

**Recommendation: B + A.** For each ticked addon: open `curseforge://install?addonId=<id>&fileId=<latest id>`,
then press the one **Install** button in that box by name (A). That targets the exact addon and exact file
with no searching through rows. If B turns out not to update an installed addon, fall back to A alone:
open the app's "My Addons" page and press the row's "Update". If he ticks every addon, press "Update All".

**First thing to test (with him at the PC, WoW closed, ~5 minutes):** start CurseForge, run
`AangReader --act --app CurseForge --do find --name Update` and `--name Install` to see the real names and
how many matches. Then try B on one small addon that has an update waiting.

### 1.5 Knowing it finished [PC]

Three signals, check all three:
1. `app.db` -> `project_operations` gets a new row: `OperationType` 2 = update, 1 = install, `Status` 3 =
   done (all 83 rows so far are 3). [guess for the meaning of the numbers, consistent with the history]
2. `AddonGameInstance.json` -> `installedFile.id` now equals the file id Aang asked for.
3. The addon's `.toc` `## Version` changed (and its folder's modified time).

Give up after 2 minutes and say so in one line ("Auctionator didn't update - want me to open CurseForge?").
Close CurseForge afterwards only if Aang opened it.

### 1.6 "What changed" without an API key

- **curseforge.com is not readable by a program.** [PC] Both `robots.txt` and an addon's file page
  return a **Cloudflare "Just a moment..." challenge (403)**. Don't try to get around it.
- **Best source: the changelog inside the addon itself.** [PC] 12 of 17 addons ship one in their folder
  (`CHANGELOG.md`, `CHANGES.txt`, `Changelog.txt`, `changes.log`). After an update, Aang diffs the old
  vs new changelog and Qwen writes one short line. That's free and exact.
- **Before the update** (for the tick list): the CurseForge app shows the changelog in its own UI; Aang
  can read that panel through UI Automation once the app is open (same helper, read-only). Many of these
  addons also live on GitHub (BugSack, BlizzMove, Details, Auctionator, Leatrix), whose release notes are
  public and fetchable.
- If nothing is readable: show just the version jump and say "notes after the update".

### 1.7 Warnings Aang can raise [PC]

- **Client interface:** `.build.info` says `1.60.1.70450` -> interface **16001** (1x10000 + 60x100 + 1).
  Every addon's `.toc` lists 16001 today. Warn when an addon's toc doesn't list the current number after a
  game patch ("not updated for the patch"). Multi-flavor addons have several tocs (`_Vanilla`, `_Classic`,
  `-Wrath`...); check the base toc and the Classic one.
- **Big jump:** compare `## Version` (installed) with the version in `latestFile.fileName`; warn on a new
  major number or "beta" -> release. Simple string rules, Qwen not needed.
- **Broken or missing:** a folder in `AddOns` without a `.toc`, or a file in `filePaths[]` that is gone
  (none today), or `isModified: true`.
- **Errors:** BugGrabber is installed, and `WTF\Account\806338303#2\SavedVariables\!BugGrabber.lua` holds
  real errors today, e.g. RXPGuides and BlizzMove calling protected functions, Auctionator's
  `Config/Main.lua:163` nil error, a Details header error. Group them by addon folder -> "Auctionator
  threw 3 errors last session". BugSack.lua is just settings.
- `Logs\` only has client logs; `Errors\` had one client crash dump (15 Oct), not addon-related.

Note: `src/Core/src/addons.ts` already reads tocs and says "TELLS, NEVER TOUCHES". Joshua's 2026-10-22 call
changes that (Aang may now drive the CurseForge app). Update that header when this is built; the old
API-key path in that file can go.

---

## Part 2 - Rotation coach

### 2.1 Why the combat log, not Details [PC + web]

His Details data is no use for coaching:
- **Bujuju-Banton**: Details' fight tables are **empty** (`_ActorTable = {}`), last dungeon instance id 33.
- **Derek-Sheppard**: has numbers, but they're **Details' test bars** (`testBar = true`, every spec in the
  game), not real fights.
- `cached_specs` is empty on both.

This fits what we already knew: on this engine addons can't read combat numbers (Secret Values; "Combat Log
Events are no longer available to addons" - warcraft.wiki.gg 12.0 API notes [web]). The game's own file
`Logs\WoWCombatLog-*.txt` is not affected. No combat log exists yet [PC], and `advancedCombatLogging` is not
set in `Config.wtf` [PC].

### 2.2 Turning logging on only in dungeons/raids

- `LoggingCombat(true/false)` **still exists on Forever 1.60.1** [web: warcraft.wiki.gg API page lists
  Forever]. It's not protected, but rate-limited to **5 calls per 10 s** shared with `/combatlog`.
- **Plan: a ~40-line addon of ours, `AangLog`.** On `PLAYER_ENTERING_WORLD` and `ZONE_CHANGED_NEW_AREA`,
  read `IsInInstance()`; if the type is `party` or `raid`, call `LoggingCombat(true)`, otherwise `false`.
  Only call when the state needs to change. It also sets `advancedCombatLogging` to 1 once (needed for
  spec, gear, talents and full unit info). It touches nothing else and sends no keys.
  He installs it once (copy a folder); Aang never writes into his AddOns folder by itself.
- Existing addons (AutoCombatLogger, AutoLogger) do the same but are not shown as updated for Forever
  [guess]; ours is tiny and we control it.
- **Files** [web]: the modern client writes one timestamped file per session, `WoWCombatLog-MMDDYY_HHMMSS.txt`,
  in `_classic_beta_\Logs\`. Size [web, rough]: 5-man dungeons ~10-40 MB per hour, raids ~100-300 MB per
  hour with advanced logging. **Disk matters on this PC (C: hit 0 bytes once):** after parsing, Aang keeps
  only the small summary and deletes logs older than 7 days, or zips them (text logs shrink about 10x).
  He should OK the delete rule.

### 2.3 Parsing (Node, in the Core)

Line format [web, format 22]: `10/22/2026 20:15:01.123-4  EVENT,field,field,...`. First line:
`COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,...`.

| Need | Events |
|---|---|
| Fight boundaries | `ENCOUNTER_START` / `ENCOUNTER_END` (boss id, name, difficulty, kill/wipe); trash = gaps between |
| Who is who | `COMBATANT_INFO` (at each encounter start, advanced logging): player GUID, **specID**, stats, talents, gear. Name from the source fields of any event (`Player-XXXX-YYYY`,"Bujuju-Banton") |
| What he pressed | `SPELL_CAST_START` / `SPELL_CAST_SUCCESS` with his GUID |
| Buffs/debuffs | `SPELL_AURA_APPLIED` / `REMOVED` / `REFRESH` / `APPLIED_DOSE` -> uptime % per aura |
| Cooldowns | his casts of long cooldowns: count used vs could have used (fight length / cooldown) |
| Downtime | gaps between casts longer than the global cooldown |
| Damage | `SPELL_DAMAGE`, `SPELL_PERIODIC_DAMAGE`, `SWING_DAMAGE` |

The parser streams the file line by line (never loads it whole), keeps only his own toon's events, and
writes one **~2-5 KB JSON per fight**: spec, length, casts per spell, cooldown use, aura uptimes,
downtime, top damage spells. Spell ids -> names from `alcaras/forever-ref` (class abilities from client
data, updated daily) [web]. Spec ids: Details uses the standard ids (e.g. 71 Arms, 260 Outlaw...).

**Open source to learn from** [web]: `wowarenalogs/wowarenalogs` has a TypeScript `packages/parser` for
modern logs (active 21 Oct 2026; check its licence before copying code). `WoWAnalyzer/WoWAnalyzer`
(AGPL-3.0) is the best model for **what to check per spec** (cast efficiency, uptime checklists) - learn
the ideas, don't copy AGPL code into Aang.

### 2.4 Judging the rotation

On ask ("how was my rotation in Deadmines?"), Aang sends the small fight JSON + the spec's priority notes to
Claude (Sonnet) and gets: 2-3 things to fix, 1 thing done well. Qwen can do the simple cases. Per toon,
Aang keeps notes + a history of past summaries, so it can say "Arms uptime up from 60% to 80% since last week".

**Where to get trustworthy spec guides for this game version** [PC, robots.txt checked today]:
- **Warcraft Tavern** (`warcrafttavern.com/forever/...`) - robots allows us, page loads (200). Use first.
- **Mobalytics** (`mobalytics.gg/wow-forever/classes/...`) - robots allows, but bot-blocked (403) to plain
  fetches; read it in Samara when he asks.
- **The game's own data** (wago.tools DB2 tables, forever-ref) - what each spell actually does in this
  build. The most trustworthy for numbers.
- **Not usable automatically:** Wowhead, **Icy Veins and warcraft.wiki.gg all block ClaudeBot** in
  robots.txt (wiki.gg added it since our 2026-09-28 note - update aang-wow-forever).
- Beta caveat [web]: guides say "work in progress"; there are no real raid logs before launch (4 Nov).
  So the coach should say "based on the beta guide from <date>".

### 2.5 Privacy / terms

Reading the log file is exactly what Warcraft Logs' uploader does. Our addon only calls a public
function; there's no injection into the game, no memory reading, and no synthetic keys into WoW. The logs
contain other players' names; they stay on his PC and only his own toon's summary goes to Claude.

---

## Recommended build plan

| Step | What | Size |
|---|---|---|
| **C0** | 5-min live check with him: UI Automation names in CurseForge, and whether `curseforge://install` updates an installed addon | 15 min |
| **C1** | Reader: start CurseForge minimized when WoW is closed, wait for the JSON, list "update available", warnings (toc 16001, big jump, missing files, BugGrabber errors grouped by addon) | ~250 lines TS |
| **C2** | Brief card: tick list (mockup first) | design + ~200 lines |
| **C3** | Updater: per ticked addon, protocol link + press Install by name; confirm with app.db + JSON + toc; one-line result | ~200 lines TS + small Act.cs tweak (row-scoped find) |
| **C4** | "What changed": changelog diff after update, Qwen one-liner; app panel read before update | ~120 lines |
| **R1** | `AangLog` addon (instance-only logging + advanced logging); he copies it in once | ~40 lines Lua |
| **R2** | Log parser -> per-fight JSON, per toon; 7-day cleanup | ~400 lines TS + tests on a real log |
| **R3** | Coach on ask: Claude/Qwen with spec notes; per-toon history; answer in bubble | ~200 lines |
| **R4** | Spec notes per spec he plays, from Warcraft Tavern + game data, refreshed weekly | data job |

Order: C0 -> C1 -> R1 (so logs pile up while the rest is built) -> C2/C3 -> R2 -> R3 -> C4/R4.

## Needs a mockup

1. **Brief addon card** in the sheet 23 B style: each row = addon name, old -> new version, one-line "what
   changed", warning badge; tick boxes; one "Update ticked" button; a "fix broken" row when needed.
2. **Coach answer**: one line in the bubble ("Bujuju, Deadmines: good uptime, 3 long gaps - open?"), click
   opens a report in Samara (per-fight timeline, cooldowns used vs available, uptimes, the 3 fixes).

## Open questions for Joshua

1. Is it OK if Aang **opens CurseForge minimized** each morning (WoW closed) to get fresh status?
2. Logs: **delete after 7 days** once summarized, or keep them zipped?
3. Which toons and specs should the coach learn first (Bujuju = ?, Derek = ?)
4. Fine to install our tiny **AangLog** addon by copying one folder yourself?

Sources (web): [warcraft.wiki.gg LoggingCombat](https://warcraft.wiki.gg/wiki/API_LoggingCombat),
[Patch 12.0.0 API notes](https://warcraft.wiki.gg/wiki/Patch_12.0.0/API_changes/notes),
[Mobalytics WoW Forever](https://mobalytics.gg/wow-forever/classes),
[Warcraft Tavern Forever news](https://www.warcrafttavern.com/forever/news/wow-forever-beta-update-bug-fixes-class-changes-gamepad-support/),
[SeeMeta tier list](https://seemeta.com/en/wow-forever/tier-list),
[wowarenalogs](https://github.com/wowarenalogs/wowarenalogs), [WoWAnalyzer](https://github.com/WoWAnalyzer/WoWAnalyzer),
[forever-ref](https://github.com/alcaras/forever-ref).

## His answers (2026-10-22)
1. Yes: open CurseForge minimized each morning, WoW closed. 2. Delete raw logs after 7 days (Recycle Bin), keep summaries.
3. Detect toons/specs from the log. 4. Aang copies the AangLog addon in himself, WoW closed, after his yes.
