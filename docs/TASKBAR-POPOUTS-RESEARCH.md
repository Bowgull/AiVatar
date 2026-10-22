# Pop-outs on Samara's taskbar: research (2026-10-22)

His question: "Does each window open a new Electron? If so we need some way to group all this together inside the
Samara taskbar: hover, right-click or something. Go big." Mockup: docs/cockpit/sheet-66-taskbar.html (A recommended, B).

## 1. Is each pop-out a new Electron? Measured

**No new program.** Every pop-out is a BrowserWindow inside the ONE Shell process (castLabs electron.exe). **But each
window gets its own Chromium renderer process** (Electron's process model: one renderer per BrowserWindow).

**His PC now (read-only, 2026-10-22, no pop-outs open):** Shell main 166 MB private, GPU 239 MB, one utility, and 14
renderers (bubble, input, wheel, menus, the family menu, Samara's tabs) at 24-51 MB private bytes each (5-33 MB private
working set; their 66-128 MB working sets are mostly shared Chromium pages). Idle renderers use ~0 CPU.

**Per pop-out (offscreen, test/electron/family-timer-check.ts, app.getAppMetrics by webContents.getOSProcessId):**

| Pop-out | Private | Working set |
|---|---|---|
| Video pop-out page | 29-34 MB | 88-103 MB |
| Note | 28-30 MB | 101-104 MB |
| Claude job | 31-35 MB | 104-108 MB |
| Mini player | 37-41 MB | 110-114 MB |
| Timer | **82-86 MB** | 140-158 MB |

5 windows = 5 distinct renderer processes. Average 42-44 MB private. **N pop-outs ≈ N x 30-40 MB** (timer ~85):
five open ≈ 150-250 MB of his 16 GB (1-1.5%). The timer is twice the others every run: worth a look (its page, not the
window; a transparent 220x170 window should not cost that).

**Ways to cut it:**
- Sharing one renderer across separate OS windows: not available. Electron's `affinity` option was removed (Electron 9
  era, "align with Chromium's process model", issue #18397) and `allowRendererProcessReuse` later. The only remaining
  share is `window.open` children of the same site with matching sandbox settings (setWindowOpenHandler), which ties
  their crashes and webPreferences together; not worth ~20 MB each.
- `--renderer-process-limit`: an undocumented Chromium switch, not listed by Electron; would force unrelated pages
  (different preloads) into shared processes. Don't.
- `backgroundThrottling` (default true; the player sets it explicitly) already slows hidden pages' timers.
- The real saving: **close hidden pop-outs instead of hiding them** (a hidden window keeps its renderer), and have the
  timer looked at.

## 2. How the Windows taskbar groups windows (cited)

- **Grouping is by AppUserModelID.** A per-window id (SHGetPropertyStoreForWindow; Electron `win.setAppDetails({appId})`)
  beats the process id; windows with the same id share one button and the hover shows one picture per window.
  https://learn.microsoft.com/en-us/windows/win32/shell/appids , https://www.electronjs.org/docs/latest/api/browser-window
- Today: Samara windows `Aang.Samara` (browser.ts), the video `Aang.Samara.Popout` (popout.ts, its own button), Aang's
  windows `Aang`; jobs/notes/timers/snips/player/menus are `skipTaskbar: true`.
- **skipTaskbar** in Electron calls ITaskbarList::DeleteTab (not WS_EX_TOOLWINDOW): no button, so no hover picture.
  https://github.com/electron/electron/blob/main/shell/browser/native_window_views.cc
- **Alt+Tab:** there is no documented "on the taskbar but out of Alt+Tab"; both follow the unowned / app-window rules.
  https://learn.microsoft.com/en-us/windows/win32/shell/taskbar , https://devblogs.microsoft.com/oldnewthing/20071008-00/?p=24863
- **The trap for A:** Electron's own docs: "On Windows setting `focusable: false` also implies setting `skipTaskbar:
  true`" (electron.d.ts, BrowserWindowConstructorOptions.focusable). jobpop.ts, timerwin.ts, miniplayer.ts and
  pinsnip.ts are focusable:false ON PURPOSE (WoW keeps the keyboard). Win32 itself: a WS_EX_NOACTIVATE window "does not
  appear on the taskbar by default. To force the window to appear on the taskbar, use WS_EX_APPWINDOW"
  (https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles). So A needs a spike: add
  WS_EX_APPWINDOW (+ ITaskbarList::AddTab) via the existing winedge helper on those windows, and check that clicking
  their hover picture does not take the keyboard from WoW. Notes and the video are focusable already.
- **Thumbnail limit:** past a count Windows turns the pictures into a list (NumThumbnails under Taskband; defaults 8-16
  by screen size; reported unreliable on newer Windows 11).
  https://www.elevenforum.com/t/change-number-of-taskbar-thumbnails-to-show-before-stacked-as-list-in-windows-11.6363/

## 3. Per-window taskbar features (ITaskbarList3, all in Electron)

All wait for the button (TaskbarButtonCreated), so set them after the window shows.
https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-itaskbarlist3
- `win.setThumbarButtons` — up to 7 buttons under that window's picture; flags enabled/disabled/dismissonclick/
  nobackground/hidden/noninteractive; Win32 lets the set be added once (Electron adds 7 hidden and updates them); `[]`
  clears. Use: player prev/play-pause/next, job pause/open, timer pause/+1 min/stop, video play/pin.
  https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-itaskbarlist3-thumbbaraddbuttons
- `win.setThumbnailClip` — show only part of a window (the timer's plate, not its 220x170 see-through room).
- `win.setThumbnailToolTip` — the picture's tooltip ("Waymark · 50% · folding the route list").
- `win.setOverlayIcon` — 16x16 badge on the BUTTON; one per group, the last set wins, clearing brings back the previous;
  hidden with small taskbar icons. Use: Claude's icon when a job needs him.
  https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-itaskbarlist3-setoverlayicon
- `win.setProgressBar(v, {mode})` — normal/paused/error/indeterminate; ONE bar per button: error > paused > normal >
  indeterminate, and between two normal bars the one with the LEAST progress shows.
  https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-itaskbarlist3-setprogressstate
- `win.flashFrame` — flash the button (not wanted by default: his quiet rules).

## 4. Jump list (right-click)

- Samara already has one (src/Shell/src/jumplist.ts): five tasks, written under `Aang.Samara` by switching the process
  id for the call; each item starts the Shell with `--samara-task=<name>`, the running Shell gets it through
  requestSingleInstanceLock / 'second-instance', and only whitelisted names act. Pop-out items slot straight in: add
  `popouts-show`, `popouts-hide`, `popouts-gather`, `new-note`, `timer`, `player` to SAMARA_TASKS.
- `app.setJumpList` takes custom categories (`{ name: 'Pop-outs', items }`); items he removes can't be re-added
  (getJumpListSettings().removedItems); custom categories share the ~10-slot budget (minItems), Tasks don't.
  https://www.electronjs.org/docs/latest/api/app
- New note / Timer / Music need Aang (notes and timers go when Aang goes, samara-on-its-own.md): rewrite the list when
  body.pid appears/disappears so they only show while Aang runs (the list is cheap to rewrite; throttle it).
- B's per-pop-out names must be rewritten on every open/close/rename; they never tick live.

## 5. How others do it

- Chrome: browser windows and each PWA get their own per-window id.
  https://chromium.googlesource.com/chromium/src/+/main/docs/windows_shortcut_and_taskbar_handling.md
- Spotify: prev/play/next thumbnail buttons (community threads); the mini player is separate.
- Winamp: thumbnail buttons via the gen_win7shell plugin. Teams/Discord pop-outs: grouping not documented (unverified).
- Owned windows (Electron `parent`) get no button at all, so no picture or progress: not a way to group.

## 6. Recommendation (sheet 66)

**A: every pop-out wears `Aang.Samara`** (setAppDetails, skipTaskbar false), so hovering the lantern shows one picture
per pop-out with its own thumbnail buttons; a popped-out Claude job sets its window's progress (green under the lantern)
and the overlay when it needs him; the right-click list gets a **Pop-outs** category (Show all, Hide all, Gather them by
Aang, New note, Timer, Music player) above Samara's Tasks. Retire the video's separate `Aang.Samara.Popout` button.

Trade-offs, honestly: every pop-out also enters Alt+Tab; the focusable:false ones need the WS_EX_APPWINDOW spike first
(fallback: those stay off and B covers them); Windows' "Close all windows" on the lantern closes pop-outs too; pictures
turn into a list past ~8-16 windows. When Samara closes: the video closes with it (his rule, it is Samara's tab); the
others belong to Aang and stay, keeping the lantern on the taskbar.

**B: no pop-out on the taskbar** (Alt+Tab unchanged, no focus risk): Samara's own picture carries the player's
buttons, Samara's window carries the job's progress and Claude's overlay, the right-click list names each open pop-out
plus Show/Hide/Gather and a New section.

## 7. Timers as family members: check (test/electron/family-timer-check.ts)

Ran 4 times offscreen. Passes: the timer snaps FLUSH beside the video (tops lined up, 140 wide, as tall as the video),
its page goes STACKED (column) inside the family size; pull apart takes it into the wiggle with a gap; dragged out it
leaves FREE at its own plate size (105x64) and row shape; below the video it becomes a strip as wide as the video.

**Product bug (intermittent, 3 of 4 runs):** after the reshape, the square corners are stale. Beside the video the
timer reports `sq: "tl"` instead of `"tl bl"` (below: `"tl"` instead of `"tl tr"`), so its corner against the video's
bottom-right stays round (visible in the picture). A fresh `refreshSides()` gives `tl bl`: familywin.ts counts
squareCorners while the member still has its old (pre-reshape) size, and the recount after the new size lands
(card() -> relayout) does not reliably happen. Likely hits every member that reshapes (job column, note strip) and the
partner's corners too (the video's region is cut from the same count). Not fixed here.

## DECIDED (2026-10-22)
Option A. A snapped group shows as ONE thumbnail of the whole group (named like "Video + Job + Player"); clicking it brings the whole group forward; the player's buttons if the player is in it. Loose pop-outs get their own thumbnails. Likely via DWM iconic thumbnails (DwmSetIconicThumbnail / DWMWA_FORCE_ICONIC_REPRESENTATION) from the native helper, with the group's other members kept off the taskbar while joined.

## BUILT (2026-10-22, branch build/taskbar-popouts)
- src/Shell/src/taskbar.ts (+ taskbarplan.ts pure logic, taskbaricons.ts pixel icons, taskbarwire.ts main.ts's part). The family is
  untouched: FamilyHost.add/remove are wrapped, groups read with groupOf/boxOf.
- Every member wears `Aang.Samara` + the lantern (the video keeps its turquoise lantern as its window icon); `Aang.Samara.Popout`
  is retired. The edge helper gives every member WS_EX_APPWINDOW (WS_EX_NOACTIVATE kept), then Electron's AddTab.
- **Measured:** DwmSetIconicThumbnail on an Electron window from the helper process = E_INVALIDARG (cross-process); on the
  helper's own window = S_OK. So a snapped group's ONE picture is a stand-in window owned by the helper (minimized, iconic,
  app id `Aang.Samara` via SHGetPropertyStoreForWindow, WM_QUERYOPEN refused so it never opens): DWM asks it, the Shell
  composes the members' capturePage panels, the helper sets it. Unasked, DWM takes up to about 160x100 (185x140 refused).
- Group buttons = the player's if it is in the group, else the lead's. Bar = Samara's window (else a loose pop-out).
- Right-click Pop-outs section: icons made into userData/taskbar-icons/*.ico; New note/Timer/Music only while Aang runs.
- Checks: test/taskbarplan.test.ts, test/jumplist.test.ts, test/electron/taskbar-check.ts (offscreen, ALL PASS).
- To check on his real taskbar: hover thumbnails appear and click brings things forward for the no-keyboard pop-outs
  (job, timer, player, snip); the group's live preview (peek) sits where the group is; WoW keeps the keyboard.
