# Coach research: how other tools answer "how did I do?" (2026-10-22)

Why: Joshua on sheet 65 v2's coach report: "I'm not sure this makes sense in terms of surfacing what I'm looking
for. Did I miss something, could I have done better? What do other addons LIKE THIS do in this space?"
Mockup: `docs/cockpit/sheet-65-addons-coach.html` (v3, section 2). Build plan: `docs/CURSEFORGE-AND-COACH.md` part 2.
Sources were opened by a research pass on 2026-10-22. [snippet] means the fact came from a search result
because the page itself blocked fetching (Archon and the Warcraft Logs help pages returned 403).

## 1. What each tool answers, and what you see first

| Tool | The question it answers | First thing you see | How fixes are shown |
|---|---|---|---|
| **WoWAnalyzer** | "Did I play my spec right, and what exactly do I fix?" | **Checklist** on the Overview tab: one row per area (big cooldowns used, things kept up, nothing wasted), each with a check mark and a bar. Then **Suggestions**. | Each failed check has a suggestion graded **Major / Average / Minor**. Minor ones are hidden by default. |
| **Warcraft Logs** | "How do I rank against everyone of my spec on this boss?" | A **coloured percentile**: grey 0-24, green 25-49, blue 50-74, purple 75-94, orange 95-98, pink 99, gold 100 [snippet]. | None. You dig through Casts, Timeline and Deaths yourself. |
| **Wipefest** | "Which mechanics did the raid get wrong, and who?" | Mechanics ranked by importance, each scored 0-100 against recent kills (50 = average). | Avoidable damage and early deaths per player. Raid-level, not rotation. |
| **Details!** (and death-recap addons) | "Who did what, and what killed me?" | Damage meter bars; the **death log** shows the last ~10 hits / ~20 s with health before and after each. | No advice; you read the hits. |
| **Raider.IO** | "How good is this player at Mythic+?" | One score coloured by population percentile (Common < 40th, Uncommon 40-75, Superior 75-90, Legendary 90+). | None. |
| **Hekili / MaxDps / ConRO** | "What should I press *right now*?" | A live icon of the next ability during the fight. | Live only; nothing after the fight. Reported blocked on the 12.0 engine and replaced by Blizzard's Assisted Highlights [secondary sources, not confirmed]. |
| **Raidbots / Bloodmallet** | "What gear, trinket or race is best?" | A ranked list or bar chart of simulated damage gains. | Gear, not play. (Not opened today; from general knowledge.) |
| **Archon / Murlok.io** | "What do the top players pick?" | Talent popularity heatmaps, most popular gear per slot; Murlok takes the top 50 per spec. | Copy the popular build. |

## 2. What players like and complain about

- **They want concrete fixes.** WoWAnalyzer gets praise for showing things "hard to notice by just reading the
  logs". Complaints: it can ignore your talent choices and counts the *maximum* possible casts, not the realistic
  number; its own developer tells players to compare with similarly geared, better-ranked players.
- **Parses can feel toxic.** "Parsing culture can often be quite toxic"; Warcraft Logs itself admitted its
  in-game parse tooltip could increase gatekeeping. Players also want credit for doing mechanics (TrueParse exists
  because parses reward tunnel vision).
- **The common habit:** open a log of a *slightly better* player of the same spec (Icy Veins: use "similar parses";
  don't compare with the top 10 unless you're already around 90+), then compare casts and timeline side by side.
  Newer tools automate this ("Compare vs Top" in Viserio, June 2026).
- **Rotation helpers split opinion:** "training wheels / accessibility" against "a crutch you can't play without".

## 3. WoW: Forever specifically

- Real: announced at BlizzCon 2026 as a permanent Classic+ game, level 60 cap, launch **4 November 2026**; the
  beta ran 17 Sept - 22 Oct.
- **No evidence Warcraft Logs supports Forever.** Players use a new site, **foreverlogs.gg** ("combat logs, dungeon
  rankings and speed runs"); its owner is unknown. A beta thread ranking specs from its data was criticised as
  levels 20-30 with tiny samples.
- On this engine addons can't read combat numbers (Secret Values), so Details-style in-game analysis is dead;
  the game's own `WoWCombatLog-*.txt` is the source (see CURSEFORGE-AND-COACH.md 2.1).

## 4. What Joshua is most likely after

His words map onto four questions every one of these tools answers in part:

1. **Did I press the right buttons? / did I miss something?** - WoWAnalyzer's checklist + suggestions.
2. **How do I compare to good players of my class?** - Warcraft Logs' percentile, or a better player's log.
3. **Why did I die?** - Details' death log / death recap.
4. **Am I getting better?** - none of them does this well; WCL shows past parses as a list.

## 5. The model for Aang (mocked on sheet 65 v3)

- **One line in the bubble** ("Garr: good kill, you stayed alive. One big miss: Avatar.") -> the report in Samara.
- **The report answers the four questions, every time.** Option A (recommended): four tiles headed by his own
  questions, one-word answer each, one fix to do first at the bottom. Option B: a report card - a grade, five
  rotation rules worst-first in red / amber / green with a one-line fix each, then deaths, raid-mates, last five weeks.
- **Rules per spec, 4-6 of them**, written like WoWAnalyzer's checklist but in plain words: use your big cooldown
  every time it's ready; press X the moment it lights up; Y before Z; no long pauses; keep W going.
- **Never**: a world ranking we can't back up, jargon (uptime, proc, DPS, parse), tables of numbers.

## 6. What we can and can't do from the combat log alone

| Can (log only) | How |
|---|---|
| What he pressed, when, and what he missed | his `SPELL_CAST_SUCCESS` + cooldown lengths from game data: "used Avatar once, could have used it 3 times" |
| Late presses and long pauses | gaps between when a button was ready and when he pressed it; gaps longer than the global cooldown |
| Priority slips ("Slam before Mortal Strike") | both ready at the same moment, which did he press |
| Why he died | the last hits before his `UNIT_DIED`, from `SPELL_DAMAGE` / `SWING_DAMAGE` aimed at him, plus the boss mechanic's name |
| **Compare with raid-mates of his class** | **everyone's events are in the log**: damage of the other warriors on the same boss, same night (fair: same fight, same length) |
| Getting better | Aang keeps a small summary per fight per toon; week-on-week rules passed |

| Can't (yet) | Why / later |
|---|---|
| Rank him against his spec **everywhere** | needs a ranking site. Warcraft Logs doesn't cover Forever; foreverlogs.gg might. Later: if it gets per-boss rankings and a readable page, Aang could look his rank up there **after he uploads** (Aang never uploads by itself). |
| "What would a top player have pressed" | needs other people's logs (the same site). |
| Gear advice like Raidbots | needs a simulator for this engine; out of scope. |

## Sources

- WoWAnalyzer: https://peakofserenity.com/?p=14917 , https://icy-veins.com/forums/topic/35540-wow-analyzer ,
  https://thegamercodex.com/en/world-of-warcraft/tools/wowanalyzer
- Warcraft Logs colours / Classic: https://archon.gg/wow/articles/help/rankings-and-parses ,
  https://archon.gg/classic-cata/articles/news/fresh-vanilla-on-warcraft-logs ,
  https://archon.gg/classic-sod/articles/news/season-of-discovery-on-warcraft-logs
- Parse culture: https://www.gfinityesports.com/world-of-warcraft/world-of-warcraft-what-is-a-parse-shadowlands-classic-burning-crusade/ ,
  https://www.wowhead.com/ko/news/warcraft-logs-releases-in-game-tooltip-addon-displaying-player-parses-and-376174 ,
  https://eu.forums.blizzard.com/en/wow/t/logs-and-parsing/439566 , https://www.curseforge.com/wow/addons/trueparse
- Wipefest: https://articles.warcraftlogs.com/news/wipefest-vault-of-the-incarnates
- Death recaps: https://www.curseforge.com/wow/addons/what-killed-me , https://www.curseforge.com/wow/addons/squizzcap
- Raider.IO: https://support.raider.io/kb/raider-dot-io-mythic-plus-addon/what-are-the-different-colors-that-correspond-to-rating-for-raider-dot-io
- Rotation helpers: https://eu.forums.blizzard.com/en/wow/t/whats-your-opinion-on-players-than-use-rotation-addons/483815 ,
  https://boostmatch.gg/blog/wow/articles/wow-midnight-addons-guide
- Archon / Murlok: https://www.archon.gg/wow/articles/news/elevate-your-game-with-new-build-guides-and-tier-lists-on-archon ,
  https://us.forums.blizzard.com/en/wow/t/murloc-m-profiles-stats-useful-for-raid-too/2105433
- Compare with a better log: https://icy-veins.com/forums/topic/26240-how-to-use-warcraft-logs-part-2-personal-performance ,
  https://wowutils.com/viserio-cooldowns/news/v5.2.0-compare-vs-top-and-clearer-wcl-review
- WoW: Forever: https://www.warcrafttavern.com/forever/news/warcraft-forever-classic-announced-at-blizzcon-2026/ ,
  https://shacknews.com/article/150712/world-of-warcraft-forever-classic-release-date-beta-sign-up ,
  https://foreverlogs.gg/ , https://us.forums.blizzard.com/en/wow/t/wow-forever-dps-log-are-out-not-sims/2371725
- Few Reddit threads surfaced; most player opinion came from Blizzard and Icy Veins forums.
