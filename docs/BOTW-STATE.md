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

## When they change

- Aang never opens a Cemu file. Once a minute it only looks at the six slots' times
  (`C:\Games\Cemu\portable\mlc01\usr\save\00050000\101c9400\user\80000001\{0-5}\game_data.sav`). A newer one opens a
  session.
- A session ends when Cemu closes, or when the save has sat still for 30 minutes. Then, and only then, the newest slot
  is copied to a temp file, the copy is read and deleted, and both files are rewritten. Nothing is read while he plays.
- When Aang starts and Cemu is not running, a save newer than `state.json` is read the same way.
- The one "today" line goes to his bubble when the session ends and no game is running (with Cemu still open after
  30 still minutes, the line waits until Cemu closes; if he saves again first, the same session carries on). A
  session that ended over 3 hours ago (Aang was off) is recorded but not announced.
- "Where was I?" (BG6, on ask only) reads a newer save on the spot if there is one, without closing the session.
- `v` goes up on any change a reader must know about. Fields are only added, never renamed, within one `v`.

## state.json (`v: 1`)

```jsonc
{
  "v": 1,
  "readAt": "2026-11-01T16:43:10.000Z",   // when Aang read it
  "savedAt": "2026-11-01T16:42:22.937Z",  // the slot file's time = when he saved
  "slot": 3,                               // 0-5, Cemu's slot folder (autosaves + manual saves)
  "version": "v1.5",                       // from the header (0x471b v1.5, 0x471e v1.6)
  "playtime": 48297,                       // seconds of play (PlayReport_PlayTime)
  "clock": { "day": 17, "hour": 10.69, "bloodMoon": 1 },
                                           // WM_NumberOfDays, WM_Time (degrees / 15 = hour of day), WM_BloodyDay raw
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
  "heroPath": { "points": [[1610, 475]] }  // Hero's Path, every overworld point in order, rounded; null if none
}
```

Notes for readers:
- Quest steps the game never saves (85 of 627, `quest_steps.saved = 0`) are skipped when working out `step`.
- `gear[].name` and `kind` come from botw.db; an item the pack does not know keeps its id as its name and kind `""`.
- Region (tower area) is not in the state yet: BG1 has no tower polygons. Work it out from `pos` when they exist.
- Spoilers: the state holds only what his save already shows. Names of things he has not found stay in botw.db,
  under its spoiler levels.

## sessions.json (`v: 1`)

```jsonc
{
  "v": 1,
  "open": { "since": "...", "baseline": "2026-11-01T13:15:23.507Z", "lastSave": "..." } | null,
                                           // a session in progress: when it began, the savedAt it is measured
                                           // from (the state.json before it), the newest save time seen
  "held": "Today: 3 shrines, 12 Koroks." | null,   // a line waiting for Cemu to close
  "list": [                                // the last 30 sessions, oldest first
    {
      "start": "...", "end": "...",        // first save seen, the save it ended on
      "from": "...", "to": "...",          // savedAt of the two states compared
      "line": "Today: 3 shrines, 12 Koroks.",
      "diff": {
        "playtime": 5400,                  // seconds played
        "shrinesDone": ["Dungeon033"], "shrinesFound": ["Dungeon034"],
        "towers": ["MapTower_05"],         // activated this session
        "koroks": [123456789],             // hash_ids
        "divineBeasts": [], "questsDone": ["FindDungeon"], "questsStarted": [],
        "places": ["Location_Kakariko"], "dishes": ["Item_Cook_G_12"],
        "hearts": 1, "stamina": 0.2        // gained
      }
    }
  ]
}
```

## Using it from code

`botwwatch.ts` exports `readBotwState()` and `readBotwSessions()` (null when missing or unreadable) and
`whereWasI()` (BG6's answer). Readers outside the brain (Samara) read the JSON files directly and must tolerate them
missing, which is the normal state before his first session ends.
