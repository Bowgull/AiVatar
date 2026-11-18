# BotW state.json: the contract (BG2)

Written 2026-11-03 with BG2 (`src/Core/src/botwsave.ts` reads, `src/Core/src/botwwatch.ts` watches). Everything else
that wants to know what Joshua has done in Breath of the Wild reads these two files and nothing in Cemu: Aang's guide
tools (BG3), the Hyrule page in Samara (BG4), "Where was I?" (BG6). Ids are the game's own, the same keys as `botw.db`
(BG1), so a reader joins on them for names, places and spoilers.

Files, both in `%LOCALAPPDATA%\Aang\botw\` (next to `botw.db`), written whole and atomically (temp + rename), so a
reader never sees half a file. `AANG_BOTW_DIR` moves them (tests).

- `state.json`: his game as of his newest save.
- `sessions.json`: what each play session changed, newest last.
- `base.json` (internal, not for readers): `state.json` as it was when the open session began, so the session's diff
  survives a restart.
- `pos.json` (BG8): where Link is right now, while Cemu runs. See "pos.json" below.
- `cook.json`: what his bag cooks, rewritten with `state.json` (Core `cookMenu` in botw.ts, the game's cooking rules).
  `{ v: 1, savedAt, mine, ver }`: `savedAt` matches `state.json` (a reader ignores a cook.json that doesn't);
  `mine` = the strongest version of each dish x effect, rows `[dish id, name, icon '', effect '', level, seconds,
  hearts in quarters, ids]`; `ver["name|effect"]` = every smallest way to make it, `[ids, hearts, level, seconds]`.
  The Journal's On the Menu counts and plans from these.

## When they change

- Aang never opens a Cemu file. Since 2026-11-04 (BG10) it watches the six slot folders
  (`C:\Games\Cemu\portable\mlc01\usr\save\00050000\101c9400\user\80000001\{0-5}`, one `fs.watch` each plus one on
  their parent, asleep until the OS wakes them) and reads a save 2 s after its folder has gone quiet, so a half-written
  autosave is never read. The slots' times are only stat-ed every 5 minutes, as a fallback for a dead watcher (which the
  same look puts back), and once a minute while a session is open, to see Cemu close. A newer save opens a session.
- Every new save (autosave or his own) is read straight away, also while he plays (his call 2026-11-04, so the
  Journal's bag keeps up): the newest slot is copied to a temp file, the copy is read and deleted, and `state.json` and
  `cook.json` are rewritten. Nothing is said, and the session still measures from `base.json`.
- A session ends when Cemu closes, or when the save has sat still for 30 minutes. Then the newest slot is read the same
  way and `sessions.json` gets the session and its line.
- When Aang starts and Cemu is not running, a save newer than `state.json` is read the same way.
- The one "today" line goes to his bubble when the session ends and no game is running (with Cemu still open after
  30 still minutes, the line waits until Cemu closes; if he saves again first, the same session carries on). A
  session that ended over 3 hours ago (Aang was off) is recorded but not announced.
- "Where was I?" (BG6, on ask only) reads a newer save on the spot if there is one, without closing the session.
- `v` goes up on any change a reader must know about. Fields are only added, never renamed, within one `v`.

### How a page hears about it (BG10, 2026-11-04)

Samara's page server (the one serving the Hyrule folder) has one push channel, `GET /live/events`: Server-Sent Events
(`text/event-stream`). It watches this folder (through the `live/` junction) only while a page is listening, and when
`state.json`, `cook.json`, `pos.json`, `sessions.json`, `notes.json` or `live.json` is rewritten it sends, 150 ms later
(so a `state` + `cook` pair arrives together), one event per file:

```
event: change
data: {"file":"state"}
```

A comment line every 25 s keeps the socket alive; at most 6 pages at once (a seventh gets 503); the stream tells the
browser to reconnect after 3 s if it drops. A temp file beside the live ones (`state.json.<pid>.tmp`) is never announced.
The map (`app/save.js`) and the Journal (`sheet-16/journal.js`) open it with `EventSource('live/events')` while visible,
fetch the named file on an event, close the stream while hidden (nothing runs then) and reopen it when shown; a slow
5-minute look remains as a fallback for a dead stream. The map still never reloads mid-play (a newer save seen while
`pos.json` says live is looked at again once a minute until he stops); the Journal takes a newer save on the same tab
once he has not touched it for 30 s. `app/live.js` (Link's position, 1 Hz by design) polls as before. So a save shows in
every open page within about 2–3 s of the game writing it: 2 s settle, one read, one event, one fetch.

## state.json (`v: 1`)

```jsonc
{
  "v": 1,
  "readAt": "2026-11-01T16:43:10.000Z",   // when Aang read it
  "savedAt": "2026-11-01T16:42:22.937Z",  // the slot file's time = when he saved
  "slot": 3,                               // 0-5, Cemu's slot folder (autosaves + manual saves)
  "version": "v1.5",                       // from the header (0x471b v1.5, 0x471e v1.6)
  "playtime": 48297,                       // seconds of play (PlayReport_PlayTime)
  "clock": { "day": 17, "hour": 10.69, "bloodMoon": 1, "bloodTimer": 1834.5 },
                                           // WM_NumberOfDays, WM_Time (degrees / 15 = hour of day), WM_BloodyDay raw;
                                           // bloodTimer = WM_BloodyMoonTimer (f32, +0.25 a second of play, due past 2520)
  "hearts": { "max": 3, "now": 3 },        // in hearts (the save keeps quarters)
  "stamina": { "max": 1.4 },               // in wheels (1000 = one wheel, +0.2 a vessel)
  "rupees": 286, "mons": 0,
  "pos": {                                 // where he saved, in objmap / botw.db world units (y = height)
    "x": 1610.01, "y": 116.56, "z": 475.09, "facing": 12.5,
    "map": "MainField", "square": "G-5",  // PlayerSavePosMapType / MapName (the 10x8 map grid)
    "label": "Dungeon033"                  // caption.sav's load-screen place: a shrine id, a place msg id, or ""
  },
  "shrines": { "found": ["Dungeon033"], "done": ["Dungeon033"] },     // botw.db shrines.id (120 base + 16 DLC)
  "towers":  { "found": ["MapTower_05"], "active": ["MapTower_05"] }, // botw.db towers.id
  "koroks":  { "seeds": 7, "found": [123456789] },                    // HiddenKorok_Number; botw.db koroks.hash_id
  "divineBeasts": ["Water"],                                           // of Water, Fire, Wind, Electric
  "quests": [                                                          // only quests he has started
    { "id": "FindDungeon", "type": "main", "step": 2, "steps": 4, "done": false }
  ],                                       // botw.db quests.id; step = the n of his NEXT step in quest_steps
                                           // (steps finished so far), done when the last saved step is set
  "places": ["Location_Kakariko"],         // botw.db places.flag he has visited (counter > 0)
  "dishes": ["Item_Cook_G_12"],            // botw.db items.id of every dish he has ever cooked (IsGet_ flags)
  "gear": [                                // his bag, in the game's order
    { "id": "Weapon_Sword_029", "name": "Soldier's Claymore", "kind": "two-handed", "n": 2800, "equipped": true }
  ],                                       // n = count; for weapons, bows and shields it is durability x100
                                           // dishes and elixirs also carry cook: { effect, level, hp, time }, their own effect
                                           // from the save (CookEffect0 / StaminaRecover, in pouch order)
  "heroPath": { "points": [[1610, 475]] }, // Hero's Path, every overworld point in order, rounded; null if none
  "chests": { "opened": [91802921] },     // E2: botw.db chests.hash_id of every chest he has opened
  "people": {                             // E2
    "met": ["Npc_Kakariko001"],            // botw.db people.id of everyone the game has introduced
    "flags": ["Npc_Kakariko001_Talk"]      // the flags people's whereabouts wait on that his save has set
  },
  "memories": [],                        // botw.db memories.n of each captured memory found (its cutscene played,
                                           // IsPlayed_Demo1xx_0); not IsGet_MemoryPhoto_ (Impa's album, set from the start)
  "kills": { "Enemy_Bokoblin_Junior": 23 }, // botw.db enemies.id -> Defeated_<actor>_Num, only the ones beaten (the
                                           // game writes a counter at its first kill)
  "photos": ["Enemy_Bokoblin_Junior"],     // botw.db compendium.actor of every entry photographed (IsRegisteredPictureBook_)
  "greatFairies": [1],                     // E2: botw.db great_fairies.n of the fountains he has opened (RevivalGreatFairyN)
  "horses": [                              // BG9 (2026-11-04): his stable, one per filled slot 0-4 (slot 5 = the game's
    { "slot": 0, "name": "Luther",         // temporary one, left out). Horse_UserName, Horse_ActorName (the horse type,
      "actor": "GameRomHorse23",           // whose actor params hold its stats), Horse_Familiarity (bond 0..1),
      "bond": 1, "saddle": "GameRomHorseSaddle_00", "reins": "GameRomHorseReins_00",   // Horse_SaddleName / ReinsName
      "mane": "Horse_Link_Mane", "rideSec": 693 }                                     // Horse_ManeName, Horse_RideTimeSec
  ],                                       // missing on a state.json written before 2026-11-04: unknown, not none
  "dlc": {                                 // E2: the add-ons' completion marks (botw.db dlc_things has the rest)
    "masterMode": false,                   // AoC_HardMode_Enabled: written only into a Master Mode save
    "trialOfTheSword": { "beginning": false, "middle": false, "final": false },  // 100enemy_Clear_Junior/Middle/Senior
    "ballad": { "champions": ["Rito"], "done": false },  // BalladOfHero<Rito|Goron|Zora|Gerudo>_Finish, BalladOfHeroes_Finish
    "finalTrial": false,                   // Clear_FinalTrial
    "mazKoshia": false                     // Defeated_Priest_Boss_Normal_Num > 0
  }
}
```

Notes for readers:
- Quest steps the game never saves (85 of 627, `quest_steps.saved = 0`) are skipped when working out `step`.
- `gear[].name` and `kind` come from botw.db; an item the pack does not know keeps its id as its name and kind `""`.
- `chests` and `people` (E2, 2026-11-03) were added within `v: 1`. A chest's save flag is `<map>_<actor>_<hash>`
  (`MainField_TBox_Field_Iron_2415552866`, `CDungeon_TBox_Dungeon_Stone_…` for shrines), set once he opens it and never
  cleared; botw.db `chests.flag` names it (1,608 of 1,611 chests: the 3 Gamble minigame chests have none). A person is
  met when `<actor>_DispNameFlag` is set (the game shows their name from then on) or, for 8 people without one, their
  own first-talk flag (`people.met_flag`, `met_by`). 105 of 503 have no met flag (96 of them never get a name: guards,
  crowds, shrine monks) and are never in the list. Both lists are empty with a botw.db older than pack 3, and a `state.json` written before E2 lacks
  them: readers treat a missing field as unknown, not as none.
- `dlc` (E2): his 6 slots have every mark at 0 (he has not started either pack). `masterMode` is true only when the
  save itself carries AoC_HardMode_Enabled; his normal saves do not hold that flag at all. Not yet seen on a real Master
  Mode save (he has none, and where Cemu keeps one is unchecked): a reader must keep a `masterMode` state apart from
  his normal progress. option.sav's IsLastPlayHardMode says which mode he played last (0 today), not read by Aang yet.
- **Where a person is now** (the game never reports other people's positions; BG8 gives only Link's): from botw.db
  `people` + this file. Pick the placement whose `appears` conditions hold and whose `vanishes` do not (a condition:
  `flag` set when `set` is true / unset when false, `of` = sub-conditions, `tag` And / Or / NAnd / NOr; a condition
  with only `signals`, such as enemies or a traveller being attacked, is live game state: treat it as unknown). Then the
  schedule: the `when` timeline whose flag is in `people.flags` (else `always`), the node whose `from`-`to` holds
  `clock.hour`, at its `x`, `z` (null = at the placement itself). Rain: `rain` instead when it rains (weather is not in
  the save). Quest steps can override this: `quest_steps.hours` for the step he is on.
- Region (tower area) is not in the state yet: BG1 has no tower polygons. Work it out from `pos` when they exist.
- Spoilers: the state holds only what his save already shows. Names of things he has not found stay in botw.db,
  under its spoiler levels.

## sessions.json (`v: 1`)

```jsonc
{
  "v": 1,
  "open": { "since": "...", "baseline": "2026-11-01T13:15:23.507Z", "lastSave": "...", "pathFrom": 8436 } | null,
                                           // a session in progress: when it began, the savedAt it is measured
                                           // from (the state.json before it), the newest save time seen,
                                           // Hero's Path points in that starting state
  "held": "Today: 3 shrines, 12 Koroks." | null,   // a line waiting for Cemu to close
  "list": [                                // the last 30 sessions, oldest first
    {
      "start": "...", "end": "...",        // first save seen, the save it ended on
      "from": "...", "to": "...",          // savedAt of the two states compared
      "pathFrom": 8436, "pathTo": 9120,    // Hero's Path points at its start and end: heroPath.points[pathFrom..pathTo)
                                           // is this session's walk (points have no times). Added 2026-11-03 within
                                           // v:1: missing on older sessions, so treat as unknown when absent
      "line": "Today: 3 shrines, 12 Koroks.",
      "diff": {
        "playtime": 5400,                  // seconds played
        "shrinesDone": ["Dungeon033"], "shrinesFound": ["Dungeon034"],
        "towers": ["MapTower_05"],         // activated this session
        "koroks": [123456789],             // hash_ids
        "divineBeasts": [], "questsDone": ["FindDungeon"], "questsStarted": [],
        "places": ["Location_Kakariko"], "dishes": ["Item_Cook_G_12"],
        "hearts": 1, "stamina": 0.2,       // gained
        "chests": [91802921], "people": ["Npc_Road_024"]   // E2: opened / met this session ([] when the
                                           // state it is measured from was written before E2)
      }
    }
  ]
}
```

## notes.json (`v: 1`, BG5)

His notes pinned on the Hyrule map. Each one IS a sticky note (one note, two places); the note itself lives in Aang's
own `notes.json` (state folder), and `src/Core/src/botwnotes.ts` copies every note that has a BotW place here after
each save. Not made until the first pin (so it may be missing); once made, kept current (the last pin taken off leaves
`notes: []`).

```jsonc
{
  "v": 1,
  "writtenAt": "2026-11-03T10:00:00.000Z",
  "own": ["Recipes", "Zelda"],             // his own categories in order: the colour of a cat is
                                           // catColour(cat, own) in src/Shell/pages/notecats.js (Zelda = his next free one)
  "notes": [                               // newest first
    {
      "id": "nmh2k1",                      // the sticky note's id (the same note on the board and his screen)
      "title": "Korok here",
      "cat": "Zelda",                      // "Zelda" when pinned; he may change it on the board, the pin stays
      "lines": ["Rock ring", "Top of hill"],   // plain lines; ticked ones end " (done)"
      "html": "<div>Rock ring</div>...",   // the note's own cleaned HTML (notes.ts cleanHtml), safe to show
      "x": 1650, "z": 470,                 // objmap / state.json world units, 0.1 precision
      "updated": "2026-11-03T09:59:58.000Z"
    }
  ]
}
```

**Making, moving, removing a pin** goes to the brain as one message on the Shell's link (no file drop: the map page
is served read-only, so the Shell passes it on like `notes.save`):

- `{ t: 'notes.place', title?, text?, x, z }`: "Note here". A new note, category Zelda, at x, z. Text is plain lines
  (escaped, never markup); no title = its first line.
- `{ t: 'notes.place', id, x, z }`: a pin dragged; the note's words are untouched.
- `{ t: 'notes.place', id, off: true }`: off the map; it stays a sticky note in its category.

In Samara the Hyrule page reaches these through its own small preload, `window.hyrule` (`src/Shell/src/hyrulepreload.cjs`:
`notes()` reads this file, `notePlace(x, z, title, text)`, `noteMove(id, x, z)`, `noteOff(id)`, `noteOpen(id)` opens it
on his board); the Shell takes them only from the Hyrule page and checks them (`hyrulenotes.ts`) before main.ts sends
`notes.place`. A place outside -6000..6000 or not a number is refused. The brain answers with the usual `notes.state`; the map then
reads `notes.json` again. Editing the words happens on the note itself (`notes.save`), which never drops the place.

**Two hooks waiting on his yes** read `note-settings.json` here: `{ "keepOffer": false, "afterPlay": false }`. Missing
= both off. `keepOffer`: a BotW message starting "remember this" asks "Keep as a note?" and on Yes pins the words at
`state.json` pos (he said yes 2026-11-03: on). `afterPlay`: the "today" line adds "Your note "…" is near where you
stopped." (within 300 m); he said no 2026-11-03, it stays off. Instead the **morning brief** carries `zelda: [{ id,
title }]` (up to 3 notes within 300 m of his last save, nearest first; `briefZeldaNotes`), drawn under Today with the
title as a link that opens the note.

## The engine (E3-E6, `src/Core/src/botwengine.ts`)

`parseGoal(db, words)` turns his words into a goal (an armour set and stars, an item and how many, shrines near a place,
a kind of dish, a quest, more hearts / stamina); `new Engine(db, state).tree(goal)` lists its needs, what he has and
every source (shops with their hours, chests he has not opened, enemies, shrines, statues, Great Fairies);
`.plan(tree)` orders the stops from where he saved with warps and opening hours, and gives `routeGoals` in the route
engine's own shape for the map; `.say(plan)` is the plan in his words (unfound shrines unnamed unless "just tell me").
Aang's tool: `botw_plan`. Rewards are not planned yet (they live in event flows, `quests.reward` is empty).

## pos.json (`v: 1`, BG8 live position)

```jsonc
{ "v": 1, "at": "2026-11-03T15:00:01.000Z", "x": 1612.4, "y": 116.5, "z": 475.1, "facing": 90, "live": true }
```

- x / y / z: Link's position now, the same world units as `state.json` `pos` (y = height). `facing`: degrees from his
  movement, 0 = north (-z), 90 = east (+x), clockwise; `-1` until he has moved; kept while he stands still.
- Written when he moves, and every 5 s while he stands still, so an `at` older than ~10 s with `live: true` means the
  reader is stuck (a loading screen briefly, or a fault): treat it as not live.
- `live: false` once Cemu closes (the last position stays). No file at all: never read this launch, or the address
  failed (below). Readers must handle all three.
- Who writes it: the brain (`botwlive.ts`) starts `AangReader --botw-pos` (`src/Reader/BotwPos.cs`) within 20 s of
  Cemu opening, and nothing runs while Cemu is closed. The reader takes this launch's guest memory base from Cemu's
  `portable\log.txt` (`Init Wii U memory space (base: 0x…)`, opened read-only, shared; it waits up to 3 minutes for that
  line, since Cemu writes it a few seconds after it starts, and if it never comes it exits 4 and the brain tries again at
  its next look) and reads three big-endian floats
  at base + `0x1055300C` once a second with ReadProcessMemory (`PROCESS_VM_READ`). Read-only: no injection, no writes,
  no debugger port, no keys. It leaves when Cemu closes or the brain that started it is gone.
- **Fails safe.** The address was verified on the JP v208 copy only; his is US v208. If nothing believable (xnavi's
  bounds: real floats, |x|,|z| < 7000, -600 < y < 5000, not all zero) comes back in the first 5 minutes, the reader
  removes `pos.json`, logs "the position address gave nothing believable" in the brain's log and the brain starts it
  again 3 minutes later (he may still have been in Cemu's game list). Until 2026-11-04 both failures waited for a Cemu
  restart, so a reader that looked 3 s too early left tracking off for a whole session. **To check (QA, his first play session):** `pos.json` appears, and x/z sit on his spot (stand at
  a shrine whose `x`/`z` are in botw.db). Inside shrines the numbers become small local ones (|x|,|z| < ~300).

## live.json, pouch.json, want.json (`v: 1`, BG10 the live reader)

Built 2026-11-04/05 from his interview (docs/BOTW-GUIDE.md BG10). The reader is now started as
`AangReader --botw-live` (`src/Reader/BotwLive.cs`); `pos.json` is written exactly as above. The rest is read **only
while a guide page is open**, twice a second, read-only like the position.

- **`want.json`** `{ v: 1, at, pages }`: the lease. The Shell's page server writes it when a page starts listening on
  `live/events`, rewrites it every 10 s while one listens, and removes it when the last one leaves. The reader treats
  one older than 25 s as "no page open" and then reads the position only. Pages do nothing for this: listening is it.
- **`live.json`**

```jsonc
{
  "v": 1, "at": "2026-11-05T01:10:00.000Z", "seq": 42,
  "live": true,                       // false once the page closed or Cemu did (the last numbers are kept)
  "state": "play",                    // play | loading (a load or warp: numbers not believable) | menu (no player yet) | closed
  "hearts":  { "life": 14, "cap": 12, "yellow": 2 },             // quarter hearts: now (red + yellow), red cap, yellow he has now
  "stamina": { "green": 812, "cap": 1000, "yellow": 0 },         // 1000 = one wheel
  "rupees": 396,                      // the game flag CurrentRupee
  "arrows": 12,                       // the count of the arrows on the bow
  "equip": { "sword": "Weapon_Sword_062", "bow": "Weapon_Bow_001", "arrow": "NormalArrow", "shield": null,
             "head": "Armor_001_Head", "upper": "Armor_001_Upper", "lower": "Armor_001_Lower" }   // botw.db items.id
}
```

  Written whole (temp + rename) when anything in it changes, and every 5 s as a heartbeat. `rupees`, `arrows` and
  `equip` are missing when that part could not be read. Readers treat `at` older than 10 s as not live.
- **`pouch.json`** `{ v: 1, at, seq, live, items: [{ t, id, n, on? , hp?, time?, effect?, level? }] }`: his whole pouch
  as the game holds it now, in its order. `t` = kind (0 sword, 1 bow, 2 arrow, 3 shield, 4/5/6 head/body/legs,
  7 material, 8 food, 9 key item), `n` = count (durability x100 for gear), `on` = worn or in hand (gear only); food
  also carries its own hearts (quarters), seconds, effect id and level. Written once a second when it changed. It is
  NOT pushed to pages (not in the page server's list): the brain reads it.
- **`cook.json` while the live bag is known**: the brain (botwlive.ts, a 2 s look at `pouch.json`'s time) works the
  menu out again from the live pouch once the cookable part has held still for 4 s, and adds `bagAt` (the pouch's
  `at`) and `bag` (`[id, name, count]` of everything that is not gear). `savedAt` stays the save's. The Journal uses
  `bag` for the bag's counts and takes a new `bagAt` like a newer save (on the same tab, never under his hands, never
  twice within 5 s). When the reader stops, or a save lands, `cook.json` is the save's again (and is put back to the
  live bag at the next look if the reader is still running).
- **Not verified on his running game yet.** Every address is from the research note
  (`Aang/research_notes/BotW guide/live_memory.md`). The reader proves the build first (two names at their v208
  addresses), follows only real guest pointers, and writes only believable numbers. Its first good read prints one
  **`botw live probe:`** line in the brain's log with the raw values (life, cap, the stale max at +0x1320, yellow
  hearts and stamina, rupees, the pouch count, the position from PlayerInfo beside the position from the heap).
  **To check (QA, his next session with the Hyrule tab open):** that line appears and its numbers match the game's
  screen; eat one hearty and one enduring dish and the yellow values follow. Still not found: the active buff and its
  timer.

## Using it from code

`botwwatch.ts` exports `readBotwState()` and `readBotwSessions()` (null when missing or unreadable) and
`whereWasI()` (BG6's answer). Readers outside the brain (Samara) read the JSON files directly and must tolerate them
missing, which is the normal state before his first session ends.
