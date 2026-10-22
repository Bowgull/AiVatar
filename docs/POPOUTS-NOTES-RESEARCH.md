# Pop-outs, notes, Spotify and the speech bubble: research (2026-10-22)

For the 2026-10-22 interview (Spotify mini player, the snapping pop-out family, notes, and comic lettering for the
bubble). It takes positions. Where a source could not confirm a number, it says so.

Read with: docs/COCKPIT-BUILD.md "THE PIVOT" (the living speech bubble, look B, motion 520/340 ms), and the memory
note `popouts-notes-spotify-interview.md`.

---

## 1. Comic lettering -> Aang's speech bubble

### How letterers actually do it

- **The text comes first and the balloon is drawn around it.** Letterers set the words, then draw the balloon to hug
  them. The balloon never decides where the words break. (Comicraft/Balloon Tales: "word arrangement" is its own
  step, before the balloon.)
- **Centred lines in a stack shaped like the balloon.** In an oval the lines go short, long, long, short (a
  "diamond" or lozenge), so the corners of the text block don't touch the curve. Centre-justified text is the norm
  for every balloon shape, ovals and rounded rectangles alike.
- **Margin of about one letter.** Leave at least one letter's height between the text and the balloon's edge. Less
  feels cramped, and much more makes a small line look lost in a big balloon (Pipeline Comics lists "big empty
  balloon" as a top mistake).
- **No widows.** One word alone on the last line breaks the shape. Letterers re-break the earlier lines to avoid it.
- **Word limits.** About 25 words is the most a balloon should hold, and 15 to 20 is better. Alan Moore, passing on
  Mort Weisinger's rule: over 20 to 25 words "starts to look too big". John Ostrander says three lines at most.
- **Too much? Split it.** A long speech becomes two or three balloons joined by a short connector (a "join"), read
  top-left to bottom-right. When one thought continues into the next balloon, the first ends with "..." and the
  second starts with "...". Separate ideas from the same speaker get staggered balloons with connectors (Blambot).
- **Butting** is cropping a balloon flat against a panel border to save room. It doesn't apply to Aang: he has no
  panel.
- **The tail aims at the mouth,** not the head, the shoulder or a chosen angle. It sits on an imaginary curve from
  the balloon's centre to the mouth, and stops part of the way there: 50-60% of the way (Blambot), about half
  (Comicraft), or 1/3 to 1/2 (Balloon Tales). It never touches or "pokes" the speaker. With several balloons, only
  the first one gets the tail and the rest hang off it with joins.
- **Emphasis is bold italic,** not plain bold (Blambot). A shout gets a burst balloon. The balloon's size follows the
  words and never the drama: a short shout is a small spiky balloon, not a big one.
- **Reading order** is top-left to bottom-right. Balloons stay off faces and out of the line between speakers.

### What Aang's bubble does today (read from the code)

- **Width:** three fixed widths, 256 / 416 / 556 px (bubble.css), border-box. Anything longer than one line at 256
  goes to 416. A reply over 18 lines at 416 goes to 556 (`WIDEST_AFTER_LINES`). Width is decided once per exchange
  and never narrows (bubble.js `exchangeWide`, `lockWidth`). That's correct: nothing rewraps while he reads.
- **Text:** 15 px, weight 600, line height 24 px (1.6), padding 14/17/15, left-aligned, `pre-wrap`, ordinary greedy
  line breaking, no `text-wrap`.
- **Collapse:** 6 lines, then the bobbing "more" arrow (reveal.js `COLLAPSED_LINES = 6`). Words light at 38 ms each.
- **Tail:** one closed path with the body (balloon.js). It aims at the centre line, as Blambot says, but stops at
  `REACH = 0.75` of the way, clamped to 26-58 px. You chose 0.75 on 2026-10-12 "so it meets his head", which is
  past the 50-60% the comics rule gives.
- **Motion:** grow 520 ms with 12% overshoot on height only, shrink 340 ms, and small changes glide 300 ms on
  Samara's ease. Width never overshoots.

Roughly how many characters fit per line (Figtree 600 at 15 px averages about 7.5 px a character, so these are
estimates): **256 -> about 30**, **416 -> about 51**, **556 -> about 70**.

### Where it breaks the comic rules

1. **A two-line sentence turns into a long thin strip.** A 40-character reply is two lines at 256, so it jumps to
   416, where it fits on one line 382 px wide. The code comments already name this exact failure (`max-content`,
   "a long thin strip beside Aang") and the 1-line rule brings it back. A letterer would keep it at two balanced
   lines.
2. **A short line gets a big empty balloon.** "Hey!" sits in a 256-wide bubble (only `.whisper` shrinks).
3. **Ragged last lines and widows,** because the breaking is greedy.
4. **Six collapsed lines at 416 is about 54 words,** twice the comic ceiling. The one-line-door rule (2026-10-20)
   already says Aang should speak one line and put the rest behind a click.

### Rules to adopt (each one keeps "never rewrap while he reads")

| Rule | Value |
|---|---|
| Line breaking for a **whole** message (all text known before the first word lights) | `text-wrap: balance` if it is 6 lines or fewer (Chromium's cap: above 6 it quietly falls back to greedy), else `text-wrap: pretty` (no widow) |
| Line breaking for a **streamed** message | Keep plain greedy wrapping. Adding words only ever changes the **last** line, so lines he has read never move. Balance and pretty both re-break earlier lines as words arrive. Don't use them here. |
| Width, whole message | Pick it by length, before the first paint: **up to 28 chars: shrink to fit the text** (min 96 px). **29-90: 256** (2-3 balanced lines). **91-300: 416.** **Over 300 or over 18 lines: 556.** Then, for balanced text, shrink the bubble to its longest real line plus padding. Balance makes the lines shorter but the box doesn't shrink by itself; measure the lines with `Range.getClientRects()` once, then set the width. |
| Width, streamed | Keep today's rule (decided from the lane at Enter), with one change: **don't widen a Quick reply just because it reached 2 lines.** Widen only at the third line, before that line lights. |
| Alignment | **Centre** short spoken lines: plain text, 3 lines or fewer, no list or table. That's the comic look. **Left-align** anything rich (lists, steps, cards) or longer than 3 lines, because centred paragraphs read badly. |
| Padding | Keep 14/17/15. At 15 px the cap height is about 10.5 px, so 14-17 px is 1.3-1.6 letters, which is right by the comic rule. Don't go under 12. |
| Line height | **22 px (1.47) for centred bubbles of 3 lines or fewer** (comic leading is tighter and makes the stack read as one shape). Keep 24 px for longer reading. |
| Lines before "more" | Keep 6, but aim the brain's bubble line at **25 words or fewer** (Weisinger/Moore). Over that, the bubble shows the first sentence and the "more" door. |
| Emphasis | Bold italic for a stressed word (`.said em b`), not just weight 700. |
| Splitting | Optional, see open questions: two short thoughts become **two stacked balloons joined by a short neck**, each balanced. Only for whole messages of 2 sentences or fewer per balloon. |
| Tail | Aim at the **mouth** spot (a fixed offset on Aang's sprite), not the head's centre. Reach 0.55-0.6 by the comic rule, or keep 0.75 by your 2026-10-12 call (open question). Keep 26-58 px. |
| Motion as text arrives | Grow the height in whole-line steps on the 520 ms spring (it overshoots on height only, as today). Width is fixed before the first word lights. Lit text never rewraps, never moves sideways, and never re-centres. If a centred bubble is streaming, centre each line once when it is complete (the line he is reading is the last one, so nothing above shifts). |

How to check it: render about 20 sample replies (1 word, 5 words, 12, 25, 60, 150, a list, a table) at each band in
speech-bubble-check.ts and look at the pictures for widows, strips and empty balloons.

---

## 2. 90s media players -> a Spotify mini player in your design language

### What defined them

- **Winamp 2 (classic skin).** The main window is **275 x 116** (Webamp's constants). The **windowshade** mode
  (double-click the title bar) is a single **275 x 14** strip with the title and the time. The text is a bitmap
  font, **5 px per character** (TEXT.BMP), and the time uses big bitmap digits (NUMBERS.BMP, 9 x 13). The title
  **scrolls like an LCD.** The visualiser is a tiny spectrum (thin bars, each with a falling "peak" cap) or an
  oscilloscope, in a 76 x 16 box. The main, equaliser and playlist windows are each 275 wide and **snap together**
  magnetically: Webamp uses **15 px**, and plug-in code reports Winamp at about 10 px. Dragging the main window
  takes the docked ones with it. The playlist resizes in 25 x 29 steps. Everything is pixel-exact at 1x or 2x.
- **Windows Media Player 7-9 skins.** Organic, non-rectangular windows (region masks), gel/pill buttons,
  colour-themed chrome, a "compact mode" that hides everything but the transport, and a full-window visualisation.
  They were dated by glossy plastic and too many shapes. What lasted: **the window's outline can be an object, not
  a rectangle.**
- **Sony Walkman / boombox.** Physical **piano keys** that travel down and click, a **VU meter** with a needle
  that rises fast and falls slowly, a **tape window** where you watch the reels turn, auto-reverse arrows, a small
  orange accent button, brushed-metal bands.

### 8 design moves that fit dark pixel wood + parchment + gold (no kitsch)

1. **Shade mode = one carved plank.** Full size about 300 x 120 drawn at 2x pixel art. Shade mode is a single wood
   strip about 300 x 28 (Winamp's 14, doubled) holding play/pause, the scrolling title and the time.
   Double-click toggles it, Winamp's own gesture. The other pop-outs snap to it the way Winamp's windows did.
2. **The "LCD" is a recessed dark-glass slot in the wood,** with gold pixel text (a bitmap font like Silkscreen or
   VT at 1x/2x, never smooth). The title scrolls 1 px every ~40 ms, **pauses 1.5 s at each end** and goes back,
   rather than looping forever (calmer, and it reads like a game menu).
3. **Big bitmap digits for the time** (Winamp's NUMBERS.BMP idea), in parchment cream on the dark slot. Click it to
   flip between time played and time left, as Winamp did.
4. **Walkman piano keys as carved wooden keys** for prev / play / next. They go down 2 px with a darker top edge
   when pressed and come back on a 120 ms snap. No gel, no chrome.
5. **The visualiser is a small row of gold-to-ember pixel bars with falling peak caps** (Winamp), about 16 bars,
   3 px wide with 1 px gaps at 1x, 30 fps, sitting in the slot. Off by default (your "optional"). In the shade
   strip it shrinks to 8 bars.
6. **A brass VU needle as the volume dial.** One small gauge whose needle rises in about 300 ms and falls in about
   600 ms (VU ballistics), so it feels like an instrument and not a slider.
7. **The cover art sits in a "tape window"**: a recessed, slightly rounded frame with a soft inner shadow. While
   playing, two tiny pixel reels beside it turn, stopping when paused. That's the whole Walkman nod.
8. **The seek bar is a notched wooden groove** with a small gold bead. Hovering shows the time in the slot, not a
   tooltip. It is the one thing in the player that springs (the bead settles with a small bounce after a seek).

Avoid: rainbow spectrums, fake screws everywhere, chrome gradients, cassette shapes, skeuomorphic brushed metal,
and full Winamp clones. The 90s shows in **behaviour** (shade, marquee, snapping, keys, needle), not in costume.

---

## 3. Mac-style snapping and bounce for the pop-out family

### What Apple's springs actually are (checked against Apple's docs today)

- `spring(response:dampingFraction:)` defaults to **response 0.5 s, dampingFraction 0.825** in the current docs.
  Older SDKs said 0.55, and so did the brief.
- `interactiveSpring` is the same idea with a shorter response, made for following a finger or mouse.
- The iOS 17+ presets all default to **0.5 s**: `.smooth` = bounce 0, `.snappy` = a small bounce (0.15 in WWDC23's
  own example), `.bouncy` = **base bounce 0.3** (Apple's docs state 0.3).
- Bounce turns into physics like this, with mass 1: **stiffness = (2pi / duration)^2**,
  **damping = 4pi x (1 - bounce) / duration**. Damping ratio = 1 - bounce.
- UIKit's `usingSpringWithDamping` is usually set to 0.7-0.8 in practice. That's common usage, not an Apple
  default.

### Snap distances other tools use

Webamp uses **15 px** (source code), and Winamp is reported at **about 10 px**. Aang's pop-out already uses
**24 px** to screen edges (`geometry.ts SNAP`). Rectangle, Magnet and Stage Manager don't publish thresholds: they
trigger when the **cursor** reaches the screen edge, not the window. Windows' own Aero Snap is cursor-based too,
and doesn't apply to frameless windows anyway.

### The numbers to use

| What | Value |
|---|---|
| Window to window, snap in | **14 px** between facing edges, and only if the windows overlap along that edge (Webamp's `overlapX/overlapY` rule) |
| Window to screen edge or corner | **20 px** to the work area (`screen.getDisplayMatching(bounds).workArea`, never the full bounds; the taskbar matters). Lower the pop-out's existing 24 to 20 so the whole family matches |
| Alignment while snapped | When two edges meet, also line up the other edge if it is within 8 px (tops line up with tops, like Winamp's stack) |
| Unsnap ("pull hard") | Drag a member straight **away** from its join: it moves at **0.35x** the pointer (rubber band) for the first **28 px**, then pops free with a small spring. Let go before 28 and it springs back. Drag in any other direction and the whole group moves |
| Release spring (snap settles) | **0.32 s, bounce 0.15** (snappy): about 2-4 px past the edge and back. Overshoot along the snap axis only |
| Pop free / throw to a corner | **0.45 s, bounce 0.25** |
| Spring back (pull let go early) | **0.28 s, bounce 0** (smooth) |
| Open / close of a pop-out | Keep the bubble's own: 520 ms grow with slight overshoot, 340 ms shrink |

### How to do it in Electron without jank

- **Never fight the drag.** While the mouse is down, nothing animates. Snapping during the drag is an instant stick
  (the window simply sits at the snapped spot while the cursor is within 14 px), and springs run only after
  release. If he grabs a window mid-spring, kill the spring at once and leave the window where it is.
- **Move, never resize, per frame.** Your 6.1 measurement found that transparency is the expensive part. Resizing
  a transparent window per frame repaints it, while moving it doesn't. Every animation here changes **position
  only** (`setPosition`). Resizes happen once, at rest.
- **Run the animation in the main process,** with a 16 ms timer stepping one spring per window and calling
  `setPosition(Math.round(x), Math.round(y))`. `animate: true` on `setBounds`/`setPosition` is **macOS only**
  (Electron docs), so on Windows we step it ourselves. That's 60 calls a second for 0.3 s, which is cheap. Use
  whole pixels or the art shimmers (pixel-art rule).
- **Drags stay custom,** as notes and the pop-out already do: the page sends dx/dy, main moves the window. The OS
  drag (`-webkit-app-region: drag`) can't be snapped mid-drag on Windows except by cancelling `will-move` (which
  only blocks the move) and repositioning, which flickers.
- **Group drag:** move every member by the same delta in the same tick. If you can see members lag a frame behind
  each other, the upgrade is moving the group in one go with Win32 `BeginDeferWindowPos` / `DeferWindowPos` /
  `EndDeferWindowPos` from the C# Body (HWNDs from `getNativeWindowHandle()`). Don't build that until a frame lag
  is actually seen.
- **Which windows are joined** is worked out again at every drag start: any edges touching within 1 px and
  overlapping, then follow the chain (Webamp's `traceConnection`). Don't store a group; the touching edges *are*
  the group.
- **Shared see-through + pin:** one setting in main (`popoutFamily: { opacity, pinned }`), with every pop-out
  subscribed. Changing it on one sends it to all. Your 2026-10-22 rule: "change one, all follow".
- **Mixed DPI:** work in Electron's DIPs everywhere. Re-run the snap against the new display's work area when a
  window crosses monitors.
- **Reduced motion:** springs become instant moves.

---

## 4. Spotify

### The official Web API, as it stands today (2026-10-22)

- **Sign-in:** Authorization Code with **PKCE**, no client secret. Aang already does this
  (tools/spotify-setup.ps1, Core/src/spotify.ts).
- **Development Mode rules (February 2026, still current):** the app **owner must have Premium** (you do), and if
  it lapses the app stops working. There are **5 users per app** (only you need it). The July 2026 update raised
  client IDs to 25 per developer and made the quota **shared across all your apps**. A 429 now says
  `"reason": "QUOTA_EXCEEDED"`. Rate limits are counted over a **rolling 30 s window** and Spotify doesn't publish
  the number. Extended quota is for organisations with about 250k monthly users, so it's not for us.
- **Gone since November 2024 for new apps:** audio features, **audio analysis** (so there's no beat data for a
  visualiser), recommendations, related artists, featured and category playlists, and preview clips.
- **Gone or changed in February 2026:** batch fetches (`GET /tracks?ids=` and so on), artist top tracks,
  new releases and categories, other users' playlists, and `/markets`. Per-type save and "contains" calls are
  replaced by **`PUT/DELETE /me/library`** and **`GET /me/library/contains`**, which take Spotify URIs. Playlist
  tracks moved to **`/playlists/{id}/items`**, and you only see items of playlists you own or collaborate on.
  **Search's max limit is now 10** (Aang asks for 5, fine). `GET /me` no longer returns `product`, so Premium can't
  be checked that way. You find out from a 403 on a player call.
- **Player endpoints:** no changes were listed. Playback control still needs Premium.
- **Scopes for the mini player.** Today the token has only `user-modify-playback-state user-read-playback-state`.
  Add `user-read-currently-playing`, `user-library-read`, `user-library-modify` (like) and
  `playlist-read-private` + `playlist-read-collaborative` (playlists). Add `playlist-modify-private` only if "add to
  playlist" is wanted. Run tools/spotify-setup.cmd once more after this.
- **Refresh tokens:** one third-party summary says Development Mode refresh tokens now last six months. I couldn't
  confirm that from Spotify. Plan for a "sign in to Spotify again" line from Aang anyway (the code already has an
  `invalid_grant` -> 'signin' path).

### Windows now-playing (SMTC): use it as the live feed

`GlobalSystemMediaTransportControlsSessionManager` (Windows 10 1809+) gives every app that reports to Windows
media controls: **title, artist, album, cover art** (a thumbnail stream), **the timeline** (position, start, end,
last-updated time), **playback status**, and **play / pause / next / previous / seek / shuffle / repeat**. It sends
events when the session, the song or the playback changes. It has **no volume** and **no like**.

Why this is the backbone: **it costs no Spotify quota and gives instant pushes.** The Web API is then used only for
what SMTC can't do (like, playlists, Spotify volume, choosing a device, "play X").

- **Reaching it:** put it in **the C# Body** (it is .NET already). Change the TFM to
  `net10.0-windows10.0.19041.0` to get the WinRT projection and send JSON lines over the existing link. A Node
  native module would work, but it adds a native rebuild to every Electron upgrade.
- **Timeline gotcha:** apps update the timeline rarely. Show the position by adding the time since
  `LastUpdatedTime` to it, and correct it when a fresh update comes.
- **Volume without the API:** the Body can set Spotify.exe's own volume in the Windows mixer (the
  `ISimpleAudioVolume` audio session). That needs no Premium, no quota and no network.
- **The Mac** has no SMTC, and Apple's MediaRemote is private, so a Mac player would be Web API only. The player is
  Shadow-side for now.

### What the reverse-engineered projects teach (learn only; never use their private APIs)

- **librespot** (an open Spotify Connect client) and **spotify-player** (Rust TUI on librespot + Web API): run
  Spotify's private protocol. **Ban risk and against the Developer Terms.** What to learn from them: show the
  change **optimistically** (flip the play icon at once, then reconcile), **cache cover art on disk** keyed by
  album, and treat devices as choices you can see.
- **Spotube**: takes Spotify's catalogue but plays the audio from elsewhere. That's against the terms, and nothing
  of it is ours to use. It does show that **lyrics** can come from open sources: LRCLIB is a free, open synced-lyrics
  database. Lyrics would be a separate "click to open" door, if ever.
- **Spicetify**: modifies the Spotify client itself. Not for us. The lesson is the community's love of **themes
  and a mini player**, which is your plan anyway.
- **Visualiser without audio analysis:** the honest real one is **capturing the system sound and running an FFT
  locally.** Either NAudio's `WasapiLoopbackCapture` in the Body, or Electron's display-media handler with
  `audio: 'loopback'` (Windows). Do it only while the player is visible and the visualiser is on: 16 bands at
  30 fps, a few % of one core. It hears *all* sound (WoW included), which is fine for a mood meter. The Shadow's
  audio device is virtual, so **test loopback on the Shadow first.** The fallback is a fake one: bars gently driven
  by the play state, honestly labelled as decoration.

---

## 5. Notes that are powerful

### What already exists (sheet 17, notes.ts, notewin.ts)

Notes made by saying so ("make a note for raid: ..."), decided in plain code (free). There's a board in the bubble,
editing in place, 6 colours, 9 fonts, 3 sizes, ticks/lists/bold, and pull-out windows with see-through and pin. You
drop a note on Aang to put it back. The cap is 60 notes, and 20 kB of HTML each. Notes.ts says "**Aang always knows
them**", which **clashes** with your new "Aang works with notes only when asked" (see open questions).

### What makes the good ones good

- **Capture beats organisation.** Drafts and Apple Quick Note open **straight to a blank, focused line**: no title,
  no folder, no choice. The first line becomes the title. Saving is automatic, and Esc keeps it.
- **Checklists that behave:** Enter makes a new tick, ticked items **sink to the bottom** (an Apple Notes option),
  and a count shows "3 of 7".
- **Light Markdown as you type** (Bear, Obsidian): `#` heading, `-` list, `[]` tick, `**bold**`. It turns into
  formatting at once, so it's easy to type and doesn't look like code.
- **Tags inline** (Bear's `#raid`, `#shopping/costco`) beat folders. Colours can mean something (Stickies), but
  only if he picks the meaning.
- **Pins** keep the 2-3 notes that matter on top. **Search is everything:** it covers titles, body and **text inside
  pasted pictures** (Apple Notes does this with OCR; Windows has a built-in OCR API the Body can call).
- **Pictures/snips:** saved as **files** beside the notes, never base64 inside the HTML (20 kB would fill at once).
  A note holds a link plus a thumbnail.
- **Sticky windows vs a board:** Stickies are for the 1-3 things that must stay **in sight** (raid list during a
  raid). The board is for everything else. You want both, and you have both. Keep stickies few: a fourth sticky
  window is clutter.
- **Your data stays yours:** Obsidian's real strength is plain files on disk. Keep notes.json, plus an export to
  Markdown files (one per note) so nothing is locked in.

### Rules for Aang and notes

- **Only when asked.** Notes stay **out of the prompt** by default, which saves quota too. When he asks ("what's on
  my raid note", "tick flasks", "add eggs to shopping"), Aang uses note tools: search, read, append, tick, make.
- **Aang never rewrites a note silently.** Appends and ticks just happen and Aang confirms them in one line. Anything
  that deletes or rewrites shows the change and asks first (your "ask once, remember, confirm" rule).
- **Capture paths:**
  - **Hotkey Ctrl+Numpad\***: Electron accelerator `Control+nummult`. It matches your family (Ctrl+NumPlus typing
    box, Ctrl+Shift+NumPlus snip). Windows doesn't use it. Your saved WoW bindings (`_classic_beta_`
    bindings-cache.wtf) have **no numpad bindings**. Once Aang registers it, every app loses that key, WoW
    included. **The MacBook has no numpad** (you play the Shadow from it), so also register **Ctrl+Shift+8** (the `*`
    on the main row). Ctrl+Shift+8 shows formatting marks in Word; no common conflict otherwise. The note opens
    blank and focused, takes the keyboard (you chose it), and Esc saves.
  - **Tell Aang:** already works.
  - **From Samara:** select text -> right-click "Note it" -> appends to the chosen note (or an **Inbox** note) with
    the page title and link underneath.
  - **From a snip:** the snip's bubble gets a "Note" key -> image file + OCR text into the Inbox.
- **Sync (Mac + phone via Discord):**
  - **The Shadow keeps the master copy.** The Mac front desk gets a read copy.
  - From the phone: `/note <text>` in Discord appends to **Inbox**, and `/notes raid` replies with the note,
    ticks shown as boxes.
  - **Appending never conflicts.** Edits from two places resolve last-writer-wins per note, using `updated`, and
    the losing version is kept as a hidden copy for a week.
- **Raise the 60-note cap** if he really "goes big" (60 is tight for an Inbox habit). Archive rather than delete.

---

## 6. Recommendations and open questions

### Do (in this order)

**Bubble**
1. Whole messages: `text-wrap: balance` (6 lines or fewer) or `pretty`. Streamed: leave greedy.
2. Pick the width from length bands before the first paint, and shrink one-liners to fit. Stop going wide at
   2 lines.
3. Centre short plain bubbles at 22 px leading, and left-align rich or long ones.
4. Brain: the bubble line should be 25 words or fewer, with the rest behind "more".
5. Bold italic for emphasis.

**Pop-out family**
6. One snap module (14 px window-to-window, 20 px to the work area, 28 px pull to unsnap). Springs only after
   release, and position only.
7. One shared `{opacity, pinned}` for every pop-out.

**Spotify**
8. SMTC in the Body as the live feed. Web API for like, playlists and "play X". Re-run setup with the new scopes.
9. Player: plank shade mode, dark-glass slot with a bitmap marquee, carved keys, VU volume, tape-window art,
   optional loopback visualiser (test it on the Shadow first).

**Notes**
10. Notes out of the prompt by default, with note tools on ask.
11. Hotkey `Control+nummult` + `Control+Shift+8`, opening blank and focused.
12. Inbox note for captures from Samara, snips and Discord. Pictures saved as files, with OCR for search.

### Open questions for Joshua

1. **Tail length:** comics say stop the tail at 50-60% of the way to the mouth and never touch. You set 0.75 so it
   meets his head. Keep it, or try 0.6 aimed at his mouth?
2. **Centred text:** OK for short spoken lines only (left for anything longer or rich)?
3. **Splitting:** when Aang says two short things, two small joined balloons stacked, or always one?
4. **One-liners shrink:** should "Hey!" get a small bubble, even though the exchange-width rule says a reply never
   narrows below the question's bubble?
5. **Notes in Aang's head:** notes.ts says Aang always knows your notes. Your new rule says only when asked. Switch
   to "only when asked"? (It saves quota.)
6. **Ctrl+Shift+8 for the MacBook keyboard:** fine, or another key?
7. **Visualiser:** a real one from the system sound (it hears WoW too), or a decorative one?
8. **Spotify volume:** Windows mixer volume (no network, works without Premium) or Spotify's own volume (shows on
   your phone too)?
9. **Group drag:** should dragging *any* member move the group (as you said), or only the "head" window, as Winamp
   did with its main window?

---

## Sources

- Blambot, Comic Book Grammar & Tradition: https://blambot.com/pages/comic-book-grammar-tradition
- Blambot lettering tips (infographics): https://blambot.com/pages/lettering-tips
- Comicraft Glossary of Lettering Terms (Balloon Tales): https://balloontales.com/?p=418
- Balloon Tales, Creating Tails and Joins: https://balloontales.com/creating-tails-and-joins/
- Pipeline Comics, 5 common webcomics lettering mistakes: https://www.pipelinecomics.com/5-common-webcomics-lettering-mistakes/
- C. Merritt-Houghton, lettering legibility: https://cmerritthoughton.substack.com/p/is-your-lettering-chaos-on-the-page
- Alan Moore on word counts (Weisinger rule): https://downthetubes.net/?p=6793
- John Ostrander, Comic Book Math: https://comicmix.com/?p=43277
- Buzz Dixon, rules of thumb: https://buzzdixon.com/home/writing-2/a-few-rough-rules-of-thumb-for-writing-comics-graphic-novels
- Chrome, CSS text-wrap: balance (6-line cap): https://developer.chrome.com/blog/css-text-wrap-balance
- MDN, text-wrap-style: https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/text-wrap-style
- Webamp constants (275 x 116, 5 px chars, 25 x 29): https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/constants.ts
- Webamp snapUtils (SNAP_DISTANCE 15, traceConnection): https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/snapUtils.ts
- Winamp docking ~10 px (plug-in article): https://www.codeproject.com/Messages/2183/Wow
- Apple, spring(response:dampingFraction:blendDuration:): https://developer.apple.com/documentation/swiftui/animation/spring(response:dampingfraction:blendduration:)
- Apple, bouncy(duration:extraBounce:) (base bounce 0.3): https://developer.apple.com/documentation/swiftui/animation/bouncy(duration:extrabounce:)
- Apple, Animation (smooth / snappy / bouncy): https://developer.apple.com/documentation/swiftui/animation
- WWDC23 Animate with springs: https://developer.apple.com/videos/play/wwdc2023/10158/
- Electron BaseWindow (will-move, animate is macOS only): https://www.electronjs.org/docs/latest/api/base-window
- Spotify, February 2026 Dev Mode migration guide: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Spotify, Update on developer access (Feb 2026): https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Spotify, Web API quota updates (July 2026): https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- Spotify, July 2026 changelog: https://developer.spotify.com/documentation/web-api/references/changes/july-2026
- Spotify, November 2024 Web API changes: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- Spotify, rate limits: https://developer.spotify.com/documentation/web-api/guides/rate-limits/
- Microsoft, GlobalSystemMediaTransportControlsSessionManager: https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager
