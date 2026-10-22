# The window family: research (2026-10-22)

For Joshua's questions from 2026-10-22: "how do we make the pop-out family snap vertical or horizontal, stuff on top,
to the right, to the side... how do we build a modular window family engine?" Plus soft corners on the video pop-out,
motion and scenes for the mini player, kanban + AI, notes defaults, reorienting a member when it snaps to a side,
notes stuck to other windows, and what else should pop out.

Read first: `docs/POPOUTS-NOTES-RESEARCH.md` section 3. Its numbers stand and this file builds on them: **14 px**
window-to-window snap, **20 px** to the screen's work area, **28 px** pull to unsnap, springs only after release
(0.32 s bounce 0.15 settle, 0.45 s bounce 0.25 pop free, 0.28 s bounce 0 spring back), position only per frame.

Members: the video pop-out, Claude job cards, the Spotify mini player (full + shade strip), sticky notes, timers.
Shared see-through and pin across all of them ("change one, all follow").

It takes positions. Where something was measured on this Shadow today, it says so.

---

## 1. How others do it

There are only three models out there. Everything below is one of them.

### (a) Loose windows that stick together (the magnetic graph)

**Winamp, Webamp, Audacious, AquaSnap, OpenFin.** Every window is its own OS window. They stick when edges come close,
and "the group" is whatever happens to be touching.

- **Webamp** (the best-read code for this, `packages/webamp/js`):
  - `snapUtils.ts`: `SNAP_DISTANCE = 15`. Two boxes snap on x only if they overlap vertically, and on y only if they
    overlap horizontally. `snapDiffManyToMany` snaps a moving set against everything standing still, `snapWithin`
    snaps to the screen, and `traceConnection` walks every touching window (a depth-first search) to find the group.
  - `WindowManager.tsx`: the code's own comment is "Only the main window brings other windows along". Grab the main
    window and the whole touching group moves; grab any other window and it peels off alone. That is Winamp's rule.
  - `actionCreators/windows.ts` `withWindowGraphIntegrity` + `resizeUtils.ts`: before a shade or a double-size, it
    records who touches whom (each window gets at most one neighbour **below** and one to the **right**), does the
    change, measures how much each window grew or shrank, and pushes everything below / to the right by that much.
    **This is exactly "the player shades to a strip and the notes under it follow it up."**
- **Audacious** `src/skins/dock.cc`: the same idea in C. 10 px snap; windows count as docked only if edges are
  exactly equal; only the main window drags its group; on a size change it shifts windows docked below, then to the
  right, with a trick so a window also stuck to something else stays put.
- **Winamp** itself: joined windows move together; AquaSnap's docs credit Winamp's main window as the origin of the
  "magnet" idea, and AquaSnap adds a useful rule: **no attraction during fast movements** (fling a window past others
  without it catching).
- **OpenFin / HERE Snap** (finance desktops that glue separate OS windows together, the closest thing to what Aang
  needs): snap to any side of a window or group, a preview shows where it will land, the group moves and minimises
  as one, undock with a shortcut or Shift-drag away. Their working group's finding is worth keeping: docking **on
  snap** was the favourite, and "secondary hotkeys are hard to discover".

Strength: it *is* loose little windows, which is what he described. Weakness: the group is re-guessed from pixels
every time, so a 1 px drift breaks a group and a resize needs Webamp's walk-the-graph fix.

### (b) One container window with a split tree

**i3, bspwm, Hyprland, komorebi, GlazeWM, foobar2000, and every dock library** (dockview, golden-layout, FlexLayout,
rc-dock, Lumino). One rectangle is split into rows and columns, recursively; each leaf is a panel.

- i3 stores containers split `splith`/`splitv`; bspwm and Hyprland's "dwindle" use a binary tree where each split is
  horizontal or vertical.
- The dock libraries all save as JSON: dockview `{grid{root, orientation}, panels, floatingGroups[], popoutGroups[]}`,
  FlexLayout `row > tabset > tab` with weights, rc-dock `{dockbox, floatbox, windowbox}`. Note that every one of them
  needed a **second list for floating and popped-out things**: a split tree alone can't hold loose windows.
- komorebi and GlazeWM (Windows tiling managers) move real windows with `SetWindowPos` and the flags
  `SWP_NOACTIVATE | SWP_NOSENDCHANGING | SWP_NOCOPYBITS | SWP_ASYNCWINDOWPOS`, and correct for Windows' invisible
  resize border (`DWMWA_EXTENDED_FRAME_BOUNDS`).

Strength: tidy, never overlaps, saves cleanly. Weakness: it is one box. "A note stuck to the right of the video, a
timer under the note" is an L shape, which a single rectangle can't be without empty space.

### (c) Anchors: snapping writes down a relationship

**World of Warcraft's own UI** (`Region:SetPoint(point, relativeTo, relativePoint, x, y)`), ElvUI movers, MoveAny,
OpenFin groups with explicit undock. When a frame is attached, the relationship is **stored**: "the note's TOPLEFT
sits on the video's TOPRIGHT, +6, 0". Move the parent and the child follows; resize the parent and the child follows;
save the layout and you save relationships, which survive a different screen or DPI. WoW refuses an anchor loop
(a frame anchored back to itself through the chain), which is the one rule a tree of anchors needs.

### OS tools (for the feel, not the model)

- **FancyZones** (PowerToys): zones as a grid or a free canvas, saved as JSON; hold Shift while dragging to show the
  zones. Its docs admit snapping "can be a few pixels off" on mixed-DPI setups.
- **Windows Snap Groups**: windows snapped together are remembered as a group and come back together from the
  taskbar.
- **Moom**: a grid you drag out a rectangle on; edge and corner zones with a 0.2 s delay so a passing drag doesn't
  trigger.
- **Rectangle, Magnet, Stage Manager**: cursor-at-screen-edge triggers, not window-to-window. Nothing to copy for the
  family beyond the screen-edge snap Aang already has.

### Electron specifics (the ones that decide the build)

- **There is no good Electron library for this.** `electron-snapping` (0.1.0) and `electron-dockable` (work in
  progress) are toys. Build it; it is a few hundred lines.
- **Windows holds back `setBounds` during a native drag.** Since Electron PR #33288 (v17.4), a `setBounds` made while
  the user is in an OS move or resize is applied when the drag ends. So a window dragged by `-webkit-app-region: drag`
  **cannot be snapped mid-drag.** Aang's notes, timers and job cards already drag the right way: the page sends
  dx/dy, the main process calls `setPosition`. The video pop-out still uses the OS drag (its `moved` handler tidies
  up after). It has to move to the custom drag to join the family.
- **What a move costs here:** the 2026-10-20 pop-out baseline on this Shadow measured `setBounds` at about **1 ms**
  each (37-43 ms for 40 steps). Moving 5 windows per frame is ~5 ms of main-thread time at 60 Hz: fine.
- **Moving a group in one go:** Win32 `BeginDeferWindowPos` / `DeferWindowPos` / `EndDeferWindowPos` moves several
  top-level windows "simultaneously" (Microsoft's word). All windows must share a parent, which top-level windows do
  (the desktop). Only reach for it if members are seen lagging a frame behind each other.
- **DPI:** Electron issues #9477 (a window grows a pixel per `setPosition` at 125%) and #16444 (wrong position moving
  to a display with another scale). Work in DIPs, set whole positions, and re-snap after a window changes display.
  His Shadow is one 1920x1080 screen at scale 1 (the baseline says so), so this is a "don't break it later" note.

---

## 2. The engine to build: anchors, found by magnets

**Model (c), fed by model (a)'s maths.** He drags windows around loosely (a). When one snaps to another, the engine
writes down an anchor (c). The anchors form a small tree per group. No container window.

### Why not one big see-through container window (model b)

Because of the 6.1 measurement on this GPU: a see-through always-on-top window pushed GPU drawing load from ~29% to
**47.4%**; an opaque one left it at 26.8%. One container big enough to hold an L-shaped group is a large transparent
window, mostly empty, sitting over WoW. Separate windows are each small and can each be **opaque**. The container's
only advantage (members can't drift apart) is what anchors give us anyway.

### The data

```ts
// One per window in the family.
interface Member {
  id: string;                    // 'video', 'player', 'note:raid', 'job:abc', 'timer:1'
  kind: 'video' | 'player' | 'note' | 'job' | 'timer';
  box: { x: number; y: number; width: number; height: number };   // DIPs, whole numbers
  shape: 'wide' | 'tall' | 'small';                                // see section 7
  anchor?: Anchor;               // absent = a root (free-standing or the head of a group)
}

// "My <side> edge sits against <to>'s opposite edge, slid along it by <along>."
interface Anchor {
  to: string;                    // the parent member's id
  side: 'right' | 'left' | 'below' | 'above';   // where I sit relative to the parent
  align: 'start' | 'center' | 'end' | number;    // tops/lefts line up, centres, bottoms/rights, or an offset
  gap: number;                   // 6 (see "the gap" below)
}

interface Layout {               // saved per screen arrangement, see "save and restore"
  members: Record<string, { box: Member['box']; anchor?: Anchor; shape: Member['shape'] }>;
  family: { opacity: number; pinned: boolean };
}
```

Rules: each member has **at most one anchor** (one parent); a parent can have many children; no loops (check before
writing, as WoW does). A group is a root and everything anchored under it.

### Vertical vs horizontal: how attaching works

- During a drag, test the dragged window (or the dragged group's bounding box) against every member **not** in the
  group, Webamp style: snap x if the boxes overlap vertically and facing edges are within **14 px**, snap y if they
  overlap horizontally. To the screen's work area at **20 px**.
- **The side decides the direction.** Dropped against the video's right edge -> `side: 'right'`, the group grows
  sideways (a row). Against its bottom -> `side: 'below'`, it grows downwards (a column). Mixed sides give L shapes,
  stacks, rows and grids for free; nothing else is needed for "stuff on top, to the right, to the side".
- **Alignment snapping** (second axis), within **8 px**: line up tops (or lefts), **centres**, or bottoms (or rights)
  with the parent. That is the `align` value. Centre alignment matters for a small timer under a wide video.
- While the mouse is down the snap is an **instant stick**, no animation, and a thin gold line shows on the edge it
  will join (OpenFin's preview idea, cheap: a 2 px glow drawn by the target window's own page). The anchor is written
  only **on release**. Then the 0.32 s settle spring runs.
- AquaSnap's rule: **no catching during a fast fling.** If the pointer is moving faster than about 2000 px/s, skip
  window-to-window snapping that frame.

### The gap: 6 px, not touching

Leave **6 px** between joined members (tiling managers call these "gaps"). Three reasons: Windows 11 rounds each
window's corners, so two touching rounded windows make ugly notches at the seam; each window keeps its own soft
shadow; and a small gap reads as "a set of game panels" (his N64/FFX menus), not one cracked window. The snap
threshold is measured to the gap, not to the edge.

### When a member resizes (shade, a job card growing, a note getting longer)

Webamp's way, made simpler by stored anchors: after any size change, **re-place every child from its anchor**, walking
down the tree. A child anchored `below` the player moves up when the player shades from ~120 to ~28 tall; a child
anchored `right` of it stays beside it, re-aligned. This is one function, `layoutFrom(root)`, called after every
resize at rest. Children move on the settle spring (position only), so the shade looks like the stack folding up.

If a re-place would push a member off the work area, the group slides back on screen as a whole (never squash).

### Group drag and detach

- **Drag the root and the group comes.** Drag a child and it pulls **itself and its own children** (its sub-tree)
  away from the parent, with the rubber band: 0.35x for the first **28 px** away from the joint, then it pops free
  (anchor deleted) and the pop-free spring runs. Let go before 28 and it springs back (0.28 s).
- That is Winamp's "main brings the rest", generalised: the root is whatever window the group was built on. He said
  "pull hard to unsnap", which this is; open question 1 is whether dragging a child sideways *along* the joint should
  move the whole group instead.
- **Ctrl while dragging = never snap** (a modifier to place something loose next to another without it joining).
  Hidden extras are hard to discover (OpenFin's finding), so it's a bonus, not the way.
- **Double-click a member's grab bar** stays "shade" for the player (Winamp's gesture). Don't give double-click a
  family meaning.

### Save and restore

- Save the `Layout` on every settle (debounced 500 ms) into the Shell's settings, **keyed by the screen arrangement**
  (a hash of the displays' work areas and scale factors). Same screens -> same layout; a new arrangement starts from
  the last one and is pushed on screen.
- Save **anchors, not just boxes.** A restored group re-places its children from the root, so a member that changed
  size since (a longer note) still sits in the right place.
- A closed member keeps its slot: reopening the player puts it back where its anchor said, if the parent is open.
  If the parent is gone, it opens free where it last was.

### Multi-monitor and DPI

Work in DIPs (Electron's units) everywhere; round every position to whole numbers (the pixel-art rule). Snap to
`screen.getDisplayMatching(box).workArea`, never `bounds` (the taskbar). A group may span two screens; the root's
screen decides the layout key. After a move ends on another display, run `layoutFrom(root)` once to re-seat children
(the #16444 drift).

### Z-order, pin and see-through, group-wide

- **One family setting** in main: `{ opacity, pinned }`. Every member subscribes. Change it on one, all follow (his
  rule). Already planned in POPOUTS-NOTES-RESEARCH.md.
- **Pinned** = every member `setAlwaysOnTop(true, 'screen-saver')` + click-through as the pop-out does today.
- **Unpinned:** clicking any member raises the **whole group**: call `moveTop()` on each member, children after the
  root, in one tick (or one `DeferWindowPos` batch from the Body if a flicker shows). Otherwise clicking the video
  would leave the notes beside it buried under WoW.
- **See-through:** `setOpacity` on each window. Tested today on this Shadow: `setOpacity(0.85)` does **not** lose
  Windows 11's rounded corners. Keep members **opaque windows** with opacity, never `transparent: true` (that is the
  47% GPU case, and it also kills Windows' rounding and shadow).

### Motion

Already decided in POPOUTS-NOTES-RESEARCH.md and confirmed by every source here:

- Nothing animates while the mouse is down. Snap is an instant stick.
- After release, a spring per moving window, stepped from the main process at 60 Hz (`setTimeout` 16 ms, or
  `setInterval`), whole-pixel `setPosition`. `animate: true` is macOS only.
- Grabbed mid-spring: kill the spring, leave the window where it is.
- Group settle: one spring drives the root; children are re-placed from their anchors every step (so the group moves
  as one piece instead of each window wobbling on its own).
- Reduced motion: instant.

### Where the code goes

- `src/Shell/src/family.ts`: members, anchors, snap maths (port Webamp's `snapUtils` ideas, ~150 lines), `layoutFrom`,
  springs, save/restore. Pure functions where possible, so tests need no windows.
- Each member module (`popout.ts`, `notewin.ts`, `timerwin.ts`, `jobpop.ts`, the player) **registers** its window
  and forwards its custom drag (start / move dx,dy / end) to `family.ts` instead of calling `setPosition` itself.
- `winedge.ts`: replace the PowerShell spawn (14-17 ms blocking per window, measured in the pop-out baseline) with an
  in-process call, see section 3.

---

## 3. Soft corners on Windows 11 (the video pop-out)

### What the code does now

`popout.ts` makes the pop-out with `titleBarStyle: 'hidden'`, `thickFrame: true`, `transparent: false`, background
`#24160D`, then `softEdge()` (winedge.ts) spawns PowerShell to call `DwmSetWindowAttribute`:
`DWMWA_WINDOW_CORNER_PREFERENCE (33) = DWMWCP_ROUND (2)` and `DWMWA_BORDER_COLOR (34) = dark wood`. This was the
2026-10-12 fix for "really sharp" corners.

### Measured today on this Shadow (throwaway Electron 44.7 windows, corner pixels read off the screen)

| Window recipe | Rounded? |
|---|---|
| `titleBarStyle: 'hidden'` + `thickFrame: true` (the pop-out's recipe) | **Yes** |
| ... + `setOpacity(0.85)`, then back to 1 | Yes |
| ... + `setAlwaysOnTop(true, 'screen-saver')` + `setIgnoreMouseEvents(true)` (pinned) | Yes |
| ... + a full-size `WebContentsView` on top (the lent tab) | Yes |
| ... + fullscreen in and out, `setAspectRatio`, `setBounds`, flush at the screen's 0,0 | Yes |
| `frame: false` + `thickFrame: true` | **No** (square, thin border) |
| `frame: false` + DWM `ROUND` asked for explicitly | **No** |
| `frame: false` + `thickFrame: false` | No (square, no border) |

Samara's own window, open on his screen right now, also reads rounded. So: **Windows does round on this cloud PC**
(Microsoft's docs say VMs aren't rounded "by design"; the Shadow's real GPU apparently counts), the pop-out's current
recipe works in every state tested, and `frame: false` can't be rounded no matter what you ask DWM.

Not tested: the castLabs DRM build (`electron-drm` 44.5.1+wvcus) would not start from a scratch folder. If the real
pop-out still looks square to him, that build is the first suspect, then whether he is looking at the **content**.

### Why it can still look sharp

1. **DWM's radius is small and fixed: 8 px** (`ROUNDSMALL` is 4 px). Samara's floating page is **16 px** (CSS, inside
   the window). Next to Samara, an 8 px pop-out looks square. Windows has no way to ask for 16.
2. **The video fills edge to edge.** The picture's own corners are square right up to the window edge, so the round
   is only visible on the wood bar. Give the picture area a CSS `border-radius: 8px` and a 3-4 px wood inset so the
   window's round and the picture's round are concentric (inner radius = outer radius minus the inset).
3. Microsoft lists when Windows won't round: maximised, Aero-snapped, VM / Azure Virtual Desktop, Application Guard,
   per-pixel-alpha windows (`transparent: true`) and window regions. None applies to the pop-out today.

### Options, cheapest first

| Option | Radius | Cost | Verdict |
|---|---|---|---|
| Keep `titleBarStyle: 'hidden'` + DWM `ROUND` (today) + CSS radius on the picture inside | 8 px | none extra | **Do this.** |
| `transparent: true` + CSS `border-radius: 16px` + CSS shadow | any | the 47% GPU case, loses Windows' shadow and snap behaviour | No, not for video. Fine for tiny members if ever needed. |
| `SetWindowRgn` with a rounded rectangle | any | none, but edges are **jagged** (no anti-aliasing) and Windows then refuses to round or shadow it | No. |
| Electron `roundedCorners` option | | Electron docs say it now applies on Windows 11 too, but it is for **frameless** windows, and our test shows `frame: false` stays square here | Don't rely on it. |

Two small fixes worth making in winedge.ts:

- **Call DWM in-process, not via PowerShell.** Every window pays a 14-17 ms blocking spawn today. Use **koffi** (a
  Node FFI, ships prebuilt for Electron) to bind `dwmapi.dll!DwmSetWindowAttribute`, or send the HWND to the C# Body,
  which already P/Invokes `SetWindowPos`. koffi is the smaller change.
- **Every family member** gets the same recipe (`titleBarStyle: 'hidden'`, `thickFrame: true`, opaque, `softEdge`).
  Notes, timers and job cards are `frame: false, transparent: true` today: they draw their own rounded pixel frame in
  CSS, which is fine at their size, but they won't carry Windows' shadow, and they can't share the family's look of
  "soft-edged real windows". Moving them to opaque windows also makes them cheaper (see the GPU numbers above). The
  catch: an opaque window can't have see-through *outside* its art, so their art must be rectangular-ish with the 8 px
  round. That fits "game panels".

---

## 4. Mini player: motion and a pixel scene

### Visualiser

- **Webamp's classic visualiser** is the right size and shape: a 76 x 16 canvas (76 x 5 in the shade strip), 75 bars
  1 px wide. Bars fall `falloff/16` px a frame (falloff 3, 6, **12 default**, 16, 32). Peak caps reset to the bar
  top, then drop by a step that starts at 3 and is multiplied by **1.05-1.6 (default 1.1)** each frame: the classic
  "cap hangs, then speeds up as it falls". Copy those constants. (`VisPainter.ts`.)
- **MilkDrop (butterchurn, WebGL 2)**: beautiful, but a shader running in a window next to WoW for decoration. Skip it,
  and AVS.
- **Where the sound comes from:** Spotify's audio analysis is gone for new apps (Nov 2024), so either a loopback FFT
  of the system sound (POPOUTS-NOTES-RESEARCH.md section 4: NAudio `WasapiLoopbackCapture` in the Body, 16 bands at
  30 fps) or fake bars driven by play state with Webamp's fall and cap maths. Loopback hears the Spotify app fine
  (it is the mixed output, not the DRM stream); test it on the Shadow's virtual audio device first.

### A pixel scene that costs nothing

- **Palette cycling** (Mark Ferrari's technique; `jhuckaby/canvascycle`, MIT code, Ferrari's art is **not** free):
  the scene is one indexed image; rain, water, lantern glow, fire and steam move by **rotating colours in the
  palette**, and only the pixels using those colours are redrawn. At a ~96 x 54 scene scaled up by a whole number,
  that is a few thousand pixels at 10-12 fps: nearly free.
- Plus 1-2 hand sprite loops (a cat's tail, a spinning record, reels) of 4-8 frames at **8 fps**.
- Everything in **one canvas** with **one** `requestAnimationFrame` loop that only draws when its time is up (Wallpaper
  Engine's advice: one global fps cap). `image-rendering: pixelated`. Not CSS animations scattered across elements.
- Spotify Canvas, for scale: 3-8 s loops, 9:16, MP4. Aang's scene should be a loop of about that length too.

### Motion budget

| Thing | Rate |
|---|---|
| Scene (palette cycling) | 10-12 fps |
| Sprites (reels, cat) | 8 fps |
| Visualiser bars, full mode | 15-20 fps (Webamp runs at full refresh; there's no need) |
| Shade strip | marquee + 5 px bars at 8-10 fps, **no scene** |
| Marquee | whole-pixel steps, pause 1.5 s at each end, only when the title doesn't fit |
| VU needle | ~300 ms rise to 99% with 1-1.5% overshoot (a lightly damped spring), same fall |
| Paused | needle and reels coast to a stop over ~0.5 s, then the loop **stops (0 fps)** |
| Seek bar | ticks once a second; no loop |

### Pausing (important on Windows)

Electron's docs: on Windows the page only reports "hidden" when the window is **minimised or `hide()`n**. Being
covered by WoW does **not** count (that is macOS only), and Chromium's own occlusion tracker on Windows ignores
transparent and always-on-top windows. So Aang pauses the loop himself when any of these is true: the window is
hidden or minimised, Spotify is paused, `prefers-reduced-motion`, or WoW is in front and the family is unpinned (it
is behind the game, nobody can see it). Keep `backgroundThrottling` on.

---

## 5. Kanban + AI

### What's out there (2026)

| Project | State | How a card meets an agent |
|---|---|---|
| **Vibe Kanban** (BloopAI) | 28k stars, **sunsetting**: Bloop shut down 10 Apr 2026, hosted boards deleted after 30 days, community-maintained now | card -> "workspace" (own git worktree, terminal, dev server) -> review the diff with inline comments sent back to the agent -> PR / merge |
| **Cline Kanban** (`npx kanban`, research preview) | active | starting a card makes a worktree + agent terminal; **the card face shows the agent's latest message or tool call**; click for terminal + diff + checkpoints; Commit or Open PR; works with Claude Code |
| **Claude Task Master** | ~28k stars | no board: a task list with subtasks and dependencies the agent reads over MCP; `next_task` |
| **Backlog.md** (MrLesk) | ~5.5k stars | each task a markdown file; terminal or web board; agents use it over MCP/CLI |
| **GitHub Copilot coding agent** | GA | assign an issue to Copilot like a person -> branch + draft PR -> asks for review |
| **Linear for Agents** | GA | assign or @mention Cursor / Codex / Devin; it pings when it needs input or opens a PR |
| Claude Squad, Conductor, Crystal | active | session switchers (one worktree per agent), not boards |
| Obsidian Kanban | unmaintained ~2 years, "looking for maintainers" | a markdown file |
| Focalboard | unmaintained | |
| Planka, Wekan | maintained, self-hosted servers | |

**The shared pattern:** To do -> In progress -> In review -> Done. Card states: not started / running / **needs
input** / ready for review / done. The card's face shows **one live line** (the agent's latest step). A human reviews
before Done. Parallel agents each get a worktree. What dies is the hosted part; local, file-backed boards survive.

**What people say** (the Vibe Kanban Show HN): "doesn't provide anything that some terminal windows and git worktrees
can't offer"; "AI generates way too much code for me to review as it is"; orchestration "adds parallelism but not
coherence". Solo users complained about team overhead.

### For Aang: honest verdict

**A full agent kanban is overkill for him.** He is one person, he doesn't review parallel diffs, and Aang already has
the useful half: the jobs strip, job cards with live progress, "needs you", start and resume. The one idea worth
taking is Cline's **card face**: one line of what the agent is doing now.

The small version that fits, if he wants it:

1. A note can be ticked into a **to-do** (a small "-> to do" toggle). No new board app; it's the notes board with a
   **To do / Doing / Done** filter.
2. A to-do card has **"Hand to Claude"**. That starts a Claude job (the existing start/resume path), the card moves to
   Doing, and its face shows the job's progress line (the existing progress engine) and the "needs you" badge.
3. **Done only after he says so** (the review step). For code, the card links the diff or commit.
4. One job at a time from the board. No worktrees, no dependencies, no WIP limits, no drag between columns.
5. Stored with the notes (local, no server).

That is maybe a day on top of notes + jobs, and only worth it once both exist. Open question 6.

---

## 6. Notes: plain by default, categories later

Confirmed across the four big ones:

- **Apple Notes**: folders, `#tags`, Smart Folders and Quick Note are all optional; Quick Note drops into one "Quick
  Notes" bucket to sort later.
- **Google Keep**: a note is plain by default; labels (up to 50), colours and pins are added afterwards from a menu.
- **Bear**: no folders at all; type `#tag` anywhere in the text (nested `#raid/heroic`).
- **Microsoft Sticky Notes**: blank, fast, always-on-top, pin; no categories at all.

The UX writing agrees: being asked "where does this go?" at capture time is what makes people stop capturing;
"capture first, sort later". The counterweight (Andy Matuschak): an inbox only works if you trust that it gets
emptied. For Aang that is Qwen's noticing and the board's Inbox, not folders.

**Do:** a new note is blank and focused, no title, no category. Colour, `#tags` typed inline, and pins are optional
and added later. The Inbox note takes captures from Samara, snips and Discord. Never a folder picker.

---

## 7. Reorienting a member when it snaps to a side

His ask: "if I drag a Claude job out and it's sitting horizontal but I snap it to the right side of the video
pop-out, it should snap vertical to it and reorient that Claude job to a readable fashion; same with the media player,
or somehow notes."

### Nobody ships exactly this, but the pieces are standard

- **Android widgets** are the closest: the app hands the system a short list of layouts (small, tall, wide) and the
  system shows the closest one. Google's advice: **a few layouts that each cover a range**, not one per size.
- **Apple WidgetKit**: fixed size families (`systemSmall`, `systemMedium`, ...); the widget reads which family it is
  and picks a layout. **Windows 11 widgets**: one Adaptive Card reads `host.widgetSize` (small/medium/large).
- **WoW Bartender4** is the best match for the job card: a bar has a **Rows** setting (1 = a horizontal strip,
  12 = a vertical column) plus a growth direction. Same buttons, only the flow changes. Text never turns.
- **Rainmeter "variants"**: several layouts of one skin, one shown at a time, sharing settings.
- **Winamp's windowshade** is the same idea one level down: one window, two named shapes.
- **Spotify's own mini player** (2024) resizes into a square, a rectangle or a thin bar.
- **Microsoft Live Captions** docks to the top or bottom edge as a strip, or floats.

### The rule for Aang

**Every member has two or three named shapes. The side it snaps to picks the shape. Text never rotates; content
re-flows.**

| Snapped... | Shape | Why |
|---|---|---|
| to the **left or right** of a tall-ish parent (the video, a column) | **tall** (a column, its height matched to the parent's) | a strip beside a tall window wastes the space and looks stuck on |
| **above or below** a wide parent | **wide** (a strip, its width matched to the parent's) | |
| free-standing | its own last free shape | his size wins (sheet 4 rule) |
| into a corner of the screen, alone | **small** where the member has one | |

What each member's shapes look like:

| Member | wide (strip) | tall (column) | small |
|---|---|---|---|
| **Claude job** | one line: icon, title, %, live line, "needs you" | stacked: title on top, a vertical or short progress bar, the live line wrapping to 3-4 lines, buttons at the bottom | icon + % ring only |
| **Mini player** | Winamp-style: art left, title marquee, keys, time (today's "full") | **cover on top**, then title (wraps to 2 lines, no marquee needed), keys in a row, time, VU under it | the shade strip (~28 tall) |
| **Note** | a wide note | a narrow note (just text re-flow, nothing else changes) | collapsed to its title |
| **Timer** | `12:40 ▸ raid pull` in one line | big digits over the label | digits only |
| **Video** | (the parent; never reshapes, 16:9 always) | | |

**How the page knows:** the main process works out the side at snap time and sends `data-dock="right|left|above|
below|free"` plus the shape. That is the main signal. Each page also uses **CSS container queries** as the backup
(`container-type: size` on a `100vw x 100vh` body; `@container (orientation: portrait)` and `aspect-ratio` work in
Chromium), so a member resized by hand still picks a sensible layout. Don't rely on the container query alone: a
near-square column beside the video should still be "tall".

**Size it takes:** a tall member matches the parent's **height** (minus nothing; the gap is between, not above) and
keeps a fixed width per kind (job 180, player 200, note its own width, timer 140, all at 1x before pixel scaling). A
wide member matches the parent's **width**. If two tall members are on the same side, they split the height (a
column of two), each at least its minimum, or the second goes below the first instead.

### Animating the reflow without jank

Resizing an OS window step by step is the weak point on Windows: `setBounds({animate})` is macOS only; Electron's
own blog describes stale frames showing through while a window resizes on Windows (fixed in 39.2.6+, Aang is on 44);
and `SetWindowPos` flickers when a window shrinks with things anchored to its edges. So:

1. **Resize the window once, straight to its final size.** Growing: grow the window first, then animate the content
   into the new space. Shrinking: swap the layout first (content moves into the smaller area), then shrink the window
   in one call.
2. **Animate inside the page**, where it is cheap: `document.startViewTransition(() => setShape('tall'))` with
   `view-transition-name` on the title, the progress bar, the cover and the keys, and the browser morphs each from
   its old spot to its new one (same-document View Transitions, Chromium 111+). FLIP (measure first and last, animate
   transform only) where a view transition doesn't fit.
3. Timing: **240 ms**, the bubble's ease, no overshoot on the reflow itself; the window's position still settles on
   the 0.32 s snap spring. If any morph looks wrong in a pixel-art panel, a **150-200 ms crossfade** between the two
   layouts is the honest fallback (pixel art doesn't scale smoothly anyway: no scaling transforms on pixel art, only
   moves and fades).
4. A member that changes shape tells `family.ts` its new size; `layoutFrom(root)` re-seats anything anchored to it.

Verdict: **do it.** It is what makes the family feel designed rather than "windows that stick", and the cost is two
or three layouts per member, which the mockups should draw first.

---

## 8. Notes stuck to other windows

His words: "can we get notes attached to windows somehow? not sure if this is even useful."

### What exists

- **Notezilla**: Ctrl+W attaches a note to a window (picked from a list) or Ctrl+Shift+W to the one you're in. The
  note shows **only while that window is open**. It matches by **window title**, with a `*` wildcard (one note for all
  of a website). Always by hand, never automatic.
- **Stickies (Zhorn)**: attach to a website, document or folder; the note "only shows when it's on screen". A review
  called the attaching step not very intuitive.
- **Stick A Note**: the note sits in the target window's top-right corner and moves with it.
- **Microsoft Sticky Notes (2024, in OneNote)**: doesn't stick to windows; it **remembers where a note came from**
  (a document, a website) and brings it back when you revisit that place.
- **Steam overlay Notes**: notes per game, pinned over the game with an opacity slider. The closest thing to Aang.
- Browser side: Obsidian Web Clipper re-shows your highlights on a page you've clipped; "Notes for tabs" groups notes
  by site.

Nobody publishes evidence that pixel-docking a note to another app's window is used much. The part people keep is
"**this note belongs to this place, show it when I'm there**."

### How it would work on Windows

- The C# Body hooks `SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE)` for the target process (out-of-context; Raymond
  Chen's recipe), ignores non-window objects (the caret fires it too), reads the window's rect, and tells the Shell
  where to put the note. `EVENT_SYSTEM_FOREGROUND` and `MINIMIZESTART/END` show and hide it. The Body already has a
  message loop, which the hook needs.
- Match the target by **process name + title pattern** (Notezilla's way).
- The "owner window" trick (`GWLP_HWNDPARENT` to another process's window) is documented as not allowed across
  processes. Use the hook.
- WoW: no exclusive fullscreen since DX12, so a note can sit over it.

### Verdict

**Pixel-attached notes: no.** It is fiddly, follows windows around with a hook, and the evidence says it's a gimmick.

**"Notes for a place": yes, cheaply, in two forms:**

1. **Notes for a Samara site** (high value, low cost). A note can be tied to a site (e.g. `wowhead.com` or one page).
   When he opens that site, Samara's band shows a small note mark; click opens the note as a pop-out. Samara already
   knows the URL; no hooks needed.
2. **Notes for when WoW is in front** (medium). A note with "show while WoW is in front" appears (pinned, see-through)
   when the game is the foreground window and hides otherwise. Aang already watches the foreground app (the Qwen
   noticing spec uses it), so this is one flag on a note, not a hook. This is Steam's overlay notes, which is the
   proven version.

Both fit the family: a place-note is just a note member that shows and hides itself.

---

## 9. What else should pop out

### What has pop-outs today, and the patterns worth stealing

- **Chrome Document Picture-in-Picture** (116+): any HTML in an always-on-top window; it can't navigate and closes
  with its opener. **Auto-PiP** when you leave a tab with video (Chrome 134+, Arc), and Arc remembers where the window
  was.
- **Opera video pop-out**: a one-click pop-out on hover and a "back to tab" button; Opera GX adds a see-through slider.
- **Steam overlay**: notes, guides and the web browser **pinned over the game**, adjustable opacity, no title bar.
- **Discord**: a text channel pinned over the game, see-through, read-only until the overlay key.
- **Slack huddles / Teams**: a mini call window that grows when you click a share; chats and meeting panes pop out.
- **Xbox Game Bar**: widgets (performance, Spotify) pinned over games.
- **Spotify's own mini player** (2024, Premium): always on top, square / rectangle / thin bar.
- **Windows Live Captions**: docks to the top or bottom edge in reserved space, or floats.
- **Snipaste**: F1 snip, F3 **pin the snip** as a floating window: zoom, see-through, click-through.

Steal: pin over the game with a shared see-through slider and no title bar (Aang has it); "back to where it came
from" (Aang has it: drop on Aang, give the tab back); preset shapes (section 7); dock to a screen edge (Aang's 20 px
snap); auto-pop video when he leaves a tab (open question 7).

### Candidates for Aang's family, rated honestly

| Candidate | Rating | Why |
|---|---|---|
| **Video pop-out** | built | the root most groups will hang off |
| **Claude job cards** | built, HIGH | "needs you" and approve without alt-tabbing out of WoW |
| **Timer / stopwatch** | **WANTED (his call, 2026-10-22)**, first-class member | `timerwin.ts` already pulls timers out as their own windows (frameless, see-through, custom drag, remembers its spot). Make it a full member: snaps, wide + tall + small shapes (section 7), shared see-through and pin |
| **Mini player** | planned, HIGH | sheet 59 |
| **Sticky notes** | built, HIGH | plus "notes for a place" (section 8) |
| **The snip, pinned** | HIGH | Snipaste's pin is a well-loved feature: pin a quest step, a talent build or a recipe over WoW. The snip already exists; "Pin" becomes a key on its bubble, the picture becomes a family member |
| **Samara tab peek** | HIGH | Steam's pinned guide. It *is* the video pop-out showing any page (the tab-lending path exists); a guide pinned beside the game |
| **Quota meter strip** | MEDIUM-HIGH | he watches quota closely; a thin strip under a job card. Only if the bubble's own quota line isn't enough |
| **Now-playing lyrics strip** | MEDIUM | a fun thin bar under the player; LRCLIB is free with synced lyrics; coverage has gaps. Later |
| **Next meeting** | **OPT-IN only (his call)**, LOW-MEDIUM | the source exists (Core `google.ts` reads Google Calendar; `calendar_today`). Off until he asks and has granted calendar access; then a small strip that shows ~15 min before an event and hides after |
| **Morning brief** | LOW | read once; the one-line door in the bubble is the right form |
| **Email preview** | LOW | email is on-ask only (his rule); a standing window goes against it |
| **Calculator** | LOW | Windows' calculator already has always-on-top |
| ~~WoW patch watcher strip~~ | **REJECTED (his call, 2026-10-22)** | not needed |
| ~~Discord voice/chat~~ | **REJECTED (his call)** | not needed; Discord's own overlay exists |
| ~~A Claude reply as it streams in~~ | **REJECTED (his call)** | redundant: the Claude app and the job pop-out already show it |

---

## 10. The plan

### The engine, in one paragraph

Separate, **opaque**, Windows-rounded windows (no big see-through container). He drags them loosely; within 14 px of
another member (20 px of the screen) they stick instantly; on release an **anchor** is written ("I sit to the right
of the video, tops aligned, 6 px gap") and a spring settles them. Anchors make a small tree per group: drag the root
and the group comes, pull a child 28 px away and it pops free with its own children. Any size change (shade, a job
growing, a reshape) re-places the children from their anchors. The side a member snaps to picks its shape (tall
beside, wide above/below), and its page re-flows with a view transition after one window resize. One
`{opacity, pinned}` for the whole family; clicking a member raises its group. Layouts save as anchors, per screen
arrangement.

### Phases

| Phase | What | Size |
|---|---|---|
| **F0. Corners + plumbing** | winedge.ts calls DWM in-process (koffi) instead of spawning PowerShell; CSS radius + wood inset on the pop-out's picture so the round shows. Look at the real pop-out with him; if it is still square, test the castLabs build | small |
| **F1. family.ts core** | members, anchors, snap maths (Webamp's rules: overlap test, 14/20 px, 8 px alignment incl. centres, no catch on fast flings), 6 px gap, pure functions + unit tests | medium |
| **F2. Everyone joins** | notes, **timers**, job cards and the pop-out send their custom drag to family.ts (the pop-out moves off the OS drag); gold join line while dragging; settle / pop-free / spring-back springs from main; shared `{opacity, pinned}`; group raise | medium |
| **F3. Resize follows** | `layoutFrom(root)` after any size change; player shade folds the stack; on-screen guard | small |
| **F4. Shapes** | mockups first (job, player, note, timer in wide / tall / small); then `data-dock` + container queries + view transitions; one-shot window resize | medium, mostly design |
| **F5. Save + restore** | anchors per screen arrangement; reopen into the old slot | small |
| **F6. New members** | snip pin, Samara tab peek, "notes for a place" (Samara site, WoW in front), then the mini player when it's built | per member |
| **F7. Only if wanted** | to-do + "hand to Claude" on notes (section 5); next-meeting strip, opt-in; lyrics strip | small each |

Test it the way his rules say: on his real desktop, the Electron windows, one pass of what was just built, never
synthetic keys into WoW, and off-screen harnesses that catch their own errors.

### Questions for Joshua

1. **Dragging a joined member:** pull it straight away and it pops off (28 px). Dragging it *along* the joint: should
   that move the whole group, or slide it along the edge (re-align it)? I lean "slide along".
2. **Which window leads a group?** Today's plan: whichever window the others were snapped onto (usually the video).
   OK, or should any member drag the whole group, and only a hard pull detach?
3. **The 6 px gap** between joined windows (game-panel look, keeps each window's round corners and shadow), or flush
   like Winamp (needs square corners on the joined sides)?
4. **Notes, timers and job cards as opaque, Windows-rounded panels** (cheaper on the GPU, real shadow, 8 px corners)
   instead of see-through windows with drawn pixel frames. OK to lose see-through *around* their art? (The family
   see-through slider still fades the whole panel.)
5. **Reshape on snap:** a job card beside the video turns into a column, above/below it stays a strip. Same for the
   player (cover on top in a column) and timers. Any member that should **never** reshape?
6. **To-do + "hand to Claude" on notes:** want it later, or skip? (Honest view: nice, not needed; the jobs strip does
   most of it.)
7. **Auto-pop video:** when he leaves a Samara tab that's playing, pop it out automatically (Chrome/Arc do), or only on
   his click as now?
8. **Notes for a place:** tie a note to a Samara site, and/or "show while WoW is in front"? Either or both?
9. **The snip pin and Samara tab peek** as the next new members after the timer: yes?

---

## Sources

**Snapping and window models**
- Webamp snapUtils.ts: https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/snapUtils.ts
- Webamp WindowManager.tsx: https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/components/WindowManager.tsx
- Webamp actionCreators/windows.ts (withWindowGraphIntegrity): https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/actionCreators/windows.ts
- Webamp resizeUtils.ts: https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/resizeUtils.ts
- Webamp architecture doc: https://github.com/captbaritone/webamp/blob/master/packages/webamp/docs/architecture.md
- Audacious dock.cc: https://github.com/audacious-media-player/audacious-plugins/blob/master/src/skins/dock.cc
- AquaSnap AquaMagnet: https://help.nurgo-software.com/article/96-aquasnap-configuration-aquamagnet
- i3 user guide: https://i3wm.org/docs/userguide.html
- bspwm: https://github.com/baskerville/bspwm
- Hyprland dwindle: https://wiki.hypr.land/0.56.0/Configuring/Layouts/Dwindle-Layout/
- komorebi windows_api.rs: https://github.com/LGUG2Z/komorebi/blob/master/komorebi/src/windows_api.rs
- GlazeWM native_window.rs: https://github.com/glzr-io/glazewm/blob/main/packages/wm-platform/src/platform_impl/windows/native_window.rs
- FancyZones: https://learn.microsoft.com/en-us/windows/powertoys/fancyzones
- Windows Snap: https://support.microsoft.com/en-US/windows/experience/snap-your-windows
- Moom help: https://manytricks.com/moom/help/general.html
- dockview: https://github.com/mathuo/dockview/blob/master/packages/dockview-core/src/dockview/dockviewComponent.ts
- FlexLayout: https://github.com/caplin/FlexLayout
- rc-dock DockData.ts: https://github.com/ticlo/rc-dock/blob/master/src/DockData.ts
- golden-layout: https://golden-layout.github.io/golden-layout/
- Lumino DockLayout: https://lumino.readthedocs.io/en/latest/api/classes/widgets.DockLayout-1.html
- OpenFin joinGroup: https://cdn.openfin.co/jsdocs/stable/tutorial-window.joinGroup.html
- OpenFin layouts service (archived): https://github.com/HadoukenIO/layouts-service
- FINOS docking meeting notes: https://finosfoundation.atlassian.net/wiki/spaces/HAD/pages/850919425/2019-2-1+Meeting+Notes
- HERE Snap: https://resources.here.io/docs/guide/users/snap
- Electron setBounds held during native drag (PR #33288): https://ayakael.net/mirrors/electron/commit/f5112632a395378a1e21757ebaa7ff4a1a13343a
- Electron BrowserWindow: https://www.electronjs.org/docs/latest/api/browser-window
- Electron BaseWindowOptions (roundedCorners, thickFrame): https://www.electronjs.org/docs/latest/api/structures/base-window-options
- Electron DPI issues: https://github.com/electron/electron/issues/9477 and https://github.com/electron/electron/issues/16444
- electron-snapping: https://npmjs.com/package/electron-snapping ; electron-dockable: https://npmjs.com/package/electron-dockable
- DeferWindowPos: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-deferwindowpos
- WoW SetPoint: https://warcraft.wiki.gg/wiki/API_Region_SetPoint
- MoveAny: https://www.curseforge.com/wow/addons/moveany

**Corners**
- Microsoft, Apply rounded corners in desktop apps: https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-rounded-corners
- DwmSetWindowAttribute: https://learn.microsoft.com/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute
- koffi (Node FFI): https://koffi.dev
- This repo: docs/popout-perf-baseline.md (setBounds ~1 ms, PowerShell spawn 14-17 ms); 6.1 measurement in
  docs/BROWSER-TESTS-2026-10-04.md (transparent 47.4% vs opaque 26.8% GPU)

**Mini player**
- Webamp Vis.tsx / VisPainter.ts: https://github.com/captbaritone/webamp/blob/master/packages/webamp/js/components/VisPainter.ts
- butterchurn: https://github.com/jberg/butterchurn
- canvascycle: https://github.com/jhuckaby/canvascycle ; article: http://www.effectgames.com/effect/article-Old_School_Color_Cycling_with_HTML5.html
- Spotify Canvas guidelines: https://support.spotify.com/fj/artists/article/canvas-guidelines/
- Spotify Web API changes Nov 2024: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- Wallpaper Engine fps: https://docs.wallpaperengine.io/en/web/performance/fps.html
- Chromium Windows occlusion tracking: https://chromium.googlesource.com/chromium/src/+/master/docs/windows_native_window_occlusion_tracking.md
- VU meter: https://en.wikipedia.org/wiki/VU_meter

**Reshaping**
- Android widget layouts: https://developer.android.com/guide/topics/appwidgets/layouts
- WidgetKit families: https://developer.apple.com/documentation/widgetkit/widgetfamily
- Windows widgets template: https://learn.microsoft.com/windows/apps/design/widgets/widgets-create-a-template
- Rainmeter skins: https://docs.rainmeter.net/manual/skins/
- Bartender4 bar options: https://git.sub-net.at/Exiles/coa-bartender/src/branch/master/Bartender4/Options/ButtonBar.lua
- MDN @container: https://developer.mozilla.org/en-US/docs/Web/CSS/@container
- Size container queries for orientation: https://www.stefanjudis.com/today-i-learned/size-container-queries-can-detect-landscape-portrait-orientation/
- FLIP: https://aerotwist.com/blog/flip-your-animations/
- Same-document View Transitions: https://developer.chrome.com/docs/web-platform/view-transitions/same-document
- Electron window resize talk: https://electronjs.org/blog/tech-talk-window-resize-behavior

**Kanban + notes**
- Vibe Kanban: https://github.com/BloopAI/vibe-kanban ; shutdown: https://vibekanban.com/blog/shutdown
- Cline Kanban: https://docs.cline.bot/kanban/core-workflow
- Claude Task Master: https://github.com/eyaltoledano/claude-task-master
- Backlog.md: https://github.com/MrLesk/Backlog.md
- Copilot coding agent: https://docs.github.com/en/copilot/using-github-copilot/coding-agent/using-copilot-to-work-on-an-issue
- Linear agents: https://linear.app/integrations/agents
- Obsidian Kanban: https://community.obsidian.md/plugins/obsidian-kanban
- Focalboard: https://github.com/mattermost-community/focalboard/issues/5038
- Show HN, Vibe Kanban: https://news.ycombinator.com/item?id=44533004 ; https://news.ycombinator.com/item?id=46746681
- Apple Notes tags + Quick Note: https://tidbits.com/2022/08/19/how-to-use-note-tags-and-quick-notes/
- Google Keep labels: https://support.google.com/keep/answer/6191044
- Bear tags: https://blog.bear.app/2017/08/bear-tips-organize-notes-with-tags-and-infinite-nested-tags/
- Matuschak on inboxes: https://notes.andymatuschak.org/z5aJUJcSbxuQxzHr2YvaY4cX5TuvLQT7r27Dz

**Attached notes + pop-outs**
- Notezilla attach: https://conceptworld.com/Notezilla/HelpTopic/Working-With-Sticky-Notes-Sticking-Notes-Documents-Websites
- Stickies (Zhorn): https://portableapps.com/node/66014
- New Microsoft Sticky Notes: https://www.thurrott.com/cloud/303220/new-sticky-notes-experience-starts-rolling-out-to-windows-users
- Steam overlay notes: https://www.ghacks.net/?p=193317
- Raymond Chen, following another window: https://devblogs.microsoft.com/oldnewthing/20210104-00/?p=104656
- Cross-process owner windows: https://devblogs.microsoft.com/oldnewthing/20130412-00/?p=4683
- WoW DX12: https://guru3d.com/story/world-of-warcraft-now-supports-directx-12
- Document Picture-in-Picture: https://developer.chrome.com/docs/web-platform/document-picture-in-picture
- Automatic PiP: https://developer.chrome.com/blog/automatic-picture-in-picture-media-playback
- Opera video pop-out: https://opera.com/features/video-popout
- Discord pinned overlay chat: https://support.discord.com/hc/en-us/articles/217659737
- Spotify miniplayer: https://www.headphonesty.com/2024/03/spotify-introduces-spotify-miniplayer-desktop/
- Live Captions: https://support.microsoft.com/windows/b52da59c-14b8-4031-aeeb-f6a47e6055df
- Snipaste: https://snipaste.com
- LRCLIB: https://lrclib.net


## DECIDED 2026-10-22 (his answers)
- Snap FLUSH (Winamp style). Solid, Windows-rounded panels. Any member drags the whole group. All members reshape.
- NO hard pull to detach. Instead: right-click any joined window -> one family menu (see-through slider, pin, Pull apart).
  "Pull apart" spreads the group with gaps and the windows wiggle (iOS jiggle mode). He drags out the ones he wants
  free; Esc, right-click any window, or a click on empty desktop snaps the rest back together, minus what he took.
  While wiggling he can also drag a window to a new spot in the group to rearrange it. Replaces the 28 px pop-free.
- No auto pop-out video. Tab peek: no. Pinned snip: yes. Site notes on demand in Samara (never pop up by themselves).
- Next meeting strip: opt-in only. Timer: first-class member.
- NO placeholders anywhere (no drop slot, no ghost box) when a window pops in, out, or is rearranged: neighbours slide
  aside live on the spring. A member that leaves the family returns to its own normal shape and size (the shape it had
  before it joined). Every member (player, job, notes, timer, snip) can join on any side: beside -> column, above/below -> strip.

## 1b, built 2026-10-22 (his calls: round outer corners, pin for all, click-through for all)
- Corners: only the corners a group-mate sits against go square (family.ts squareCorners, per corner, not per side).
  The video (Windows' own corners) gets Windows' rounding off plus a SetWindowRgn region, pixel-stepped (7,5,3,2,2,1,1
  at 10 px), round on its outer corners only. Measured: the helper cuts a region in ~1.7 ms, the join costs the Shell ~2 ms.
- Trap (measured): ANY SetWindowRgn call, even clearing one, makes Chromium let the page grow by the window's invisible
  8 px resize borders (left, right, bottom), for good. So the region is cut to Electron's own bounds, the page is padded
  by what it gained (familywin.ts checkPad), and a window that was ever joined keeps a region: free again it is round on
  all four corners, stepped, without Windows' shadow, until the pop-out is rebuilt (Aang restart).
- Pin on top (family menu) = on top for every member; the video's own pin (on top + click-through) is unchanged.
- Click through: family menu (whole group, ALL n) and the note's and timer's own menus (just that one). Locked members
  (the video pinned, or his pop-out switch) are never changed by it. ONE way back: Ctrl+Alt+P over any click-through
  member brings its group back (FamilyHost.reachAt); the key is held while anything is click-through.
