# Cockpit sheets 59-65: clean-up notes (2026-10-22)

A fresh-eyes pass over sheets 59-65 after his notes ("can you notice anything else that might need a clean up").
Fixed = done in this pass. Open = still to do (most live in product CSS or in sheets another session is editing).

## Fixed in this pass
- **64**: kind tag, "who is asking", "Exactly this" and "Claude's words" moved off 8 px spaced pixel caps to Figtree bold.
- **65**: addon warning tags ("Errors", "Big jump", "Not for this patch") and the "WoW Forever" header in Figtree, not 9 px pixel caps.
  Every addon, CurseForge and WoW now carry their icons; Aang's coach line ends in a "See the two tips" link, not "IN SAMARA" caps.
- **60**: the sheet's own captions (stage tags, PINNED / EVERYTHING, rail and snip labels) moved to Figtree.
- **60**: To-do vs For Claude, and every other category pair, made clearly distinct (also under colour blindness).

## Open: product CSS (needs a build decision, not a mockup edit)
1. **Tiny spaced pixel caps still in the real pages**: brief slip headings (TODAY, ADDONS, GOOD MORNING, WEEK), the bubble's
   "SENT FROM SAMARA", Claude's "CLAUDE'S WORDS", the menu's side notes (2 RUNNING, AUTO, 7 KEYS, NEW), section heads
   (ANY TIME, ONLY WHILE SOMETHING IS UP), Samara's right-click shortcuts (CTRL C, ALT ←). Same problem he hit on sheet 64.
   Proposal: one rule, Silkscreen only for big display words (h1-size), Figtree 700-800 at 11.5 px+ for every small label.
2. **Keycaps disagree**: the hotkeys menu (61) draws keys as dark wood caps in pixel caps; the bubble (64/65) draws them as
   yellow/purple buttons with a little letter; the pull-apart hint (63) uses a yellow ESC chip. Pick one keycap.
3. **The link colour in his line** (`#said .link`, #E88A6A) is pale on parchment (about 2.3 : 1). A deeper coral
   (about #B04A26) reads at 4.5 : 1 and still says "click me".

## Open: missing icons (his rule: software names carry their icon, sites their favicon)
4. **59** mini player: "SPOTIFY · LIKED SONGS" has no Spotify icon.
5. **63** video pop-out: the "YOUTUBE" chip has no YouTube icon.
6. **62** Send to Aang: the menu row "Send to Aang" has no Aang face; the WORDS chip shows "forever.warcraft.com" with no favicon.
7. **65** Warcraft Tavern: placeholder WT monogram until Samara has stored its real favicon (none cached on this PC).

## Open: off-language or cramped
8. **The brown pushpin is still on the pop-outs** (59 player and job card, 63 family): he called it hideous on notes (60).
   Whatever replaces it on notes should replace it here too.
9. **59** the song title clips mid-word ("KHRU..."); fade or scroll it, never chop a letter.
10. **62** two pointers at once in the Samara menu picture (the arrow and the glove overlap the first row).
11. **63** the window title "Lo-fi beats to study to" is in a monospace face no other window title uses.
12. **63 / 59** captions above pictures in letter-spaced pixel caps (e.g. "3 · PULL APART · THEY SPREAD 14 PX AND WIGGLE"):
    readable versions in Figtree, as done on 60 here. (59 is mid-edit in another session, so not touched.)
