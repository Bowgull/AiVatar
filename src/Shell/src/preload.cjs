// The only bridge between a page Aang draws and the app around it.
//
// PLAIN COMMONJS JAVASCRIPT ON PURPOSE, and this was settled by test on 2026-10-04, not assumed
// (step 6.2). Electron 44 runs the MAIN process straight from TypeScript, the same as the brain does.
// A sandboxed preload cannot: it is loaded by Chromium rather than Node, it does not strip types, and
// it must be CommonJS. The first run failed with "Cannot use import statement outside a module".
// So this one file stays hand-written JavaScript rather than adding a build step to the whole project.
// Its shape is declared for TypeScript in bridge.ts, which pages and tests use.
//
// Deliberately tiny. Everything here is reachable by anything that gets to run inside a window, so the
// rule is: no general "call the brain with this" door. Each thing a window may do is named, and the
// main process checks it. A page cannot invent a new one.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aang', {
  /** M6: which machine this window is on ('darwin' on the Mac), so "Send to" names the other one. */
  platform: process.platform,
  /** Hear messages from the brain. Returns a function that stops listening. */
  onMessage(fn) {
    const h = (_e, m) => fn(m);
    ipcRenderer.on('brain:message', h);
    return () => { ipcRenderer.off('brain:message', h); };
  },
  /** Hear whether the brain is reachable. */
  onConnected(fn) {
    const h = (_e, up) => fn(up);
    ipcRenderer.on('brain:connected', h);
    return () => { ipcRenderer.off('brain:connected', h); };
  },
  /** Which window this is, so one page can be used in more than one place. */
  windowKind: () => ipcRenderer.invoke('shell:windowKind'),

  // --- the pop-out. Each one is named; there is no general "do this" door.
  /** Hear what to play. The address is built in the main process; the page never makes one. */
  onPopout(fn) {
    const h = (_e, v) => fn(v);
    ipcRenderer.on('popout:show', h);
    return () => { ipcRenderer.off('popout:show', h); };
  },
  /** Out of the way, still playing. */
  popoutHide: () => ipcRenderer.send('popout:hide'),
  popoutPin: () => ipcRenderer.send('popout:pin'),
  onPopoutPinned(fn) { const h = (_e, on) => fn(on === true); ipcRenderer.on('popout:pinned', h); return () => ipcRenderer.removeListener('popout:pinned', h); },
  popoutClose: () => ipcRenderer.send('popout:close'),
  /** How see-through the window is, 0.2 to 1. The window's own doing, so it works for paid services
   *  too, where Aang cannot reach inside the player at all. */
  popoutOpacity: v => ipcRenderer.send('popout:opacity', v),
  popoutFullscreen: () => ipcRenderer.send('popout:fullscreen'),
  popoutToMac: () => ipcRenderer.send('popout:tomac'),
  /** How many pixels of the window are Aang's own chrome, measured by the page. */
  popoutChrome: px => ipcRenderer.send('popout:chrome', px),
  /** Playback started, paused or ran out, so the brain can tick the episode off (step 6.8). Sent only
   *  on a change: there is no heartbeat here and there must not be one. */
  popoutPlayback: s => ipcRenderer.send('popout:playback', s),
  /** The wooden bar dragged by hand (the window family, F2): the page says how far, the main process moves the window,
   *  so a snap can happen mid-drag (an OS drag holds every setBounds until it ends). */
  popoutDrag: a => ipcRenderer.send('popout:drag', a),
  /** The family's shared see-through and pin changed (from another member or the family menu). */
  onFamilyShared(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('family:shared', h); return () => ipcRenderer.removeListener('family:shared', h); },

  // --- the bubble (step 6.12). Named doors, like everything else here.
  /** Put a finished reply on his clipboard. The page sends the WHOLE message, never what is on screen. */
  copyText: text => ipcRenderer.send('bubble:copy', text),
  /**
   * He clicked a reply that is about a window - a Claude Code session. Bring that window forward.
   *
   * The ratings that used to live here are gone (2026-10-04): `ratings.jsonl` was written and never
   * read by anything, six ratings existed in the system's lifetime and three of those were taken back,
   * and the research says a single user's thumbs need 100+ samples per version before the aggregate
   * means anything. "Forget this" in the right-click menu already covers "do not keep this".
   */
  focusWindow: name => ipcRenderer.send('bubble:focus', name),
  /** A click on a message while Aang is still working stops the reply, as the old bubble's did. */
  bubbleStop: () => ipcRenderer.send('bubble:stop'),
  /** A click on a message about a Claude session on his MacBook brings Claude forward there. */
  macFront: () => ipcRenderer.send('bubble:macfront'),
  /** Sheet 16: a click on a message docks the typing box under the drawn bubble (its window coordinates). */
  dockBox: r => ipcRenderer.send('bubble:dock', r),
  /** Sheet 17: the bubble may take the keyboard only while he types in a note or the timer's name. */
  bubbleTyping: on => ipcRenderer.send('bubble:typing', on),
  /** Sheet 17, the notes board in the bubble: save an edit, delete, and drag one out onto the screen. */
  notesSave: n => ipcRenderer.send('bubble:notesave', n),
  /** Sheet 60: "+ Category" on the board: a category of his own (it takes the next colour). */
  notesCat: name => ipcRenderer.send('bubble:notecat', name),
  notesDelete: id => ipcRenderer.send('bubble:notedelete', id),
  notesPull: a => ipcRenderer.send('bubble:notepull', a),
  /** Sheet 17, a note stuck on the screen: its data, and what it can ask for. It only ever speaks for itself. */
  onNoteData(fn) { const h = (_e, n) => fn(n); ipcRenderer.on('note:data', h); return () => ipcRenderer.removeListener('note:data', h); },
  noteSave: n => ipcRenderer.send('note:save', n),
  noteMove: a => ipcRenderer.send('note:move', a),
  noteMenu: open => ipcRenderer.send('note:menu', open),
  noteOpacity: n => ipcRenderer.send('note:opacity', n),
  notePin: on => ipcRenderer.send('note:pin', on),
  noteThrough: () => ipcRenderer.send('note:through'),
  noteBack: () => ipcRenderer.send('note:back'),
  noteDelete: () => ipcRenderer.send('note:delete'),
  /** Sheet 60: the quick note is done (Enter or Esc): its note to keep, or null when it was left empty. */
  noteQuickDone: n => ipcRenderer.send('note:quickdone', n),
  /** Sheet 60 B: a noticed note is on show (or not): Aang holds it up beside his bubble, in its category's colour. */
  noticeHeld: a => ipcRenderer.send('bubble:noticeheld', a),
  /** The held note's own little window: what to draw, and a click on the paper (it opens the note). */
  onHeldData(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('held:data', h); return () => ipcRenderer.removeListener('held:data', h); },
  heldOpen: () => ipcRenderer.send('held:open'),
  heldHover: on => ipcRenderer.send('held:hover', on === true),
  /** Sheet 60 section 4: Samara's notes rail. This site's notes come in; a new note for this site, or one to open, go out. */
  onBrowserNotes(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:notes', h); return () => ipcRenderer.removeListener('browser:notes', h); },
  browserNoteSave: n => ipcRenderer.send('browser:notesave', n),
  browserNoteOpen: id => ipcRenderer.send('browser:noteopen', id),
  onBrowserRailClose(fn) { const h = () => fn(); ipcRenderer.on('browser:railclose', h); return () => ipcRenderer.removeListener('browser:railclose', h); },
  /** Sheet 17's wheel: what to draw, where he points, where he let go; and which disc that was. */
  onWheel(fn) { const h = (_e, m) => fn(m); ipcRenderer.on('wheel', h); return () => ipcRenderer.removeListener('wheel', h); },
  wheelPick: slot => ipcRenderer.send('wheel:pick', slot),
  /** Sheet 56 (2026-10-21): Aang's right-click menu. What to show, his pick, and where the menus are (only there takes the mouse). */
  onMenu(fn) { const h = (_e, m) => fn(m); ipcRenderer.on('menu', h); return () => ipcRenderer.removeListener('menu', h); },
  menuPick: id => ipcRenderer.send('menu:pick', id),
  menuShape: rects => ipcRenderer.send('menu:shape', rects),
  /** Sheet 61 v2 (2026-10-22): the Hotkeys submenu: listen for new keys, change one, or put them all back. */
  menuHotkey: m => ipcRenderer.send('menu:hotkey', m),
  /** Sheet 17: Start on the timer dial in the bubble. */
  timerStart: a => ipcRenderer.send('bubble:timerstart', a),
  /** Sheet 17, the timer window: its timer, its pin, and the few things it can ask for. */
  onTimerData(fn) { const h = (_e, t) => fn(t); ipcRenderer.on('timer:data', h); return () => ipcRenderer.removeListener('timer:data', h); },
  onTimerPinned(fn) { const h = (_e, on) => fn(on); ipcRenderer.on('timer:pinned', h); return () => ipcRenderer.removeListener('timer:pinned', h); },
  timerClickable: on => ipcRenderer.send('timer:clickable', on),
  timerAct: a => ipcRenderer.send('timer:act', a),
  timerDrag: a => ipcRenderer.send('timer:drag', a),
  timerOpacity: n => ipcRenderer.send('timer:opacity', n),
  timerPin: on => ipcRenderer.send('timer:pin', on),
  timerThrough: () => ipcRenderer.send('timer:through'),
  /** Sheet 67 v2: a game in front (calm sand), and the menu's Rename / Restart, done on the plate itself. */
  onTimerCalm(fn) { const h = (_e, on) => fn(on); ipcRenderer.on('timer:calm', h); return () => ipcRenderer.removeListener('timer:calm', h); },
  onTimerDo(fn) { const h = (_e, w) => fn(w); ipcRenderer.on('timer:do', h); return () => ipcRenderer.removeListener('timer:do', h); },
  /** Right-click: open its menu at the mouse (screen DIP). Rename done: give the keyboard back. */
  timerMenu: (at) => ipcRenderer.send('timer:menu', at && typeof at === 'object' ? { x: Number(at.x) || 0, y: Number(at.y) || 0 } : null),
  timerTyping: (on) => ipcRenderer.send('timer:typing', on === true),
  /** The timer menu window (timermenu.html): what to show, its shape, his pick. */
  onTimerMenu(fn) { const h = (_e, m) => fn(m); ipcRenderer.on('timer:menushow', h); return () => ipcRenderer.removeListener('timer:menushow', h); },
  timerMenuShape: (rects) => ipcRenderer.send('timer:menushape', Array.isArray(rects) ? rects.slice(0, 2).map((r) => ({ x: Number(r?.x) || 0, y: Number(r?.y) || 0, width: Number(r?.width) || 0, height: Number(r?.height) || 0 })) : []),
  timerMenuPick: (m) => ipcRenderer.send('timer:menupick', m && typeof m === 'object' ? { what: String(m.what ?? ''), ms: Number(m.ms) || 0, value: Number(m.value) || 0, colour: String(m.colour ?? '') } : null),
  /** The gold "change" link under a remembered choice: Aang forgets it and asks next time. */
  forgetChoice: key => ipcRenderer.send('bubble:choiceforget', key),
  /** The docked box closed: 'sent' when he answered (the bubble stays), anything else lets it go. */
  onUndock(fn) { const h = (_e, why) => fn(why); ipcRenderer.on('bubble:undock', h); return () => ipcRenderer.removeListener('bubble:undock', h); },
  /** He clicked Aang: show again whatever was last shown (2026-10-20). The page says whether it had anything. */
  // Sheet 53 (2026-10-21): what the click was, 'recent' (on Aang: his line from the last 5 minutes) or 'jobs' (on Claude's mark).
  onRecall(fn) { const h = (_e, what) => fn(what === 'jobs' || what === 'back' ? what : 'recent'); ipcRenderer.on('bubble:recall', h); return () => ipcRenderer.removeListener('bubble:recall', h); },
  recalled: ok => ipcRenderer.send('bubble:recalled', ok === true),
  // Sheet 52 (2026-10-21): he held a Claude job bar down; it tears off onto his desktop. Only the job's id goes, and
  // main.ts checks it is a real session id before any window opens.
  jobPop: id => ipcRenderer.send('bubble:jobpop', String(id)),
  /** What the torn-off jobs tell the bubble: 'back' (dropped on Aang), 'near' (dragged close), 'ask' (needs you / Message). */
  onJobPop(fn) {
    const on = (kind) => { const h = (_e, m) => fn(kind, m); ipcRenderer.on('jobpop:' + kind, h); return () => ipcRenderer.removeListener('jobpop:' + kind, h); };
    const offs = ['back', 'near', 'ask'].map(on);
    return () => offs.forEach((f) => f());
  },
  /** How big the drawn bubble actually is, measured by the page, so the window can fit it. */
  bubbleSize: s => ipcRenderer.send('bubble:size', s),
  /** His answer to an ask: yes, no, always, show, skip. Named, so a page cannot invent a new one. */
  answerAsk: a => ipcRenderer.send('bubble:answer', a),
  /** Open a file or link he pressed a chip for. The main process decides HOW; the page only says which. */
  openThing: t => ipcRenderer.send('bubble:open', t),
  // Sheet 24: a button under an opened brief row. Only which row and which button; the brain writes the words.
  briefAct: a => ipcRenderer.send('bubble:briefact', a),
  // Sheet 65: "Update ticked" under the brief's Addons slip: the CurseForge project ids still ticked, nothing else.
  addonsUpdate: ids => ipcRenderer.send('bubble:addons', ids),
  /** Forget one stored message, by the row the brain gave it. */
  forgetTurn: id => ipcRenderer.send('bubble:forget', id),
  /**
   * "Reply to this" and "Add as context", from the bubble's right-click menu (4.3b).
   *
   * Both put something into the TYPING BOX rather than doing anything themselves, which is why they
   * could not exist until the box was ours too. `turn` is the row the brain gave the message: a real
   * binding, never a guess, because recency heuristics demonstrably misattribute.
   */
  replyToTurn: (turn, preview) => ipcRenderer.send('bubble:replyto', { turn, preview }),
  pinTurn: (turn, preview) => ipcRenderer.send('bubble:pin', { turn, preview }),
  /** Pull another page of his own history, older than the row given. */
  olderTurns: a => ipcRenderer.send('bubble:older', a),
  // Sheet 41: Undo / Take it back on a row of the scroll-back. Only the row id crosses; the brain looks up the rest.
  undoTurn: id => ipcRenderer.send('bubble:undo', id),
  forgetPlan: a => ipcRenderer.send('bubble:forgetplan', a),
  /** The pointer is over the drawn bubble, so this window should take the mouse. Off it, clicks pass
   *  through to whatever is behind. */
  bubbleClickable: on => ipcRenderer.send('bubble:clickable', on),
  /** The bubble has finished saying its piece and gone; the window can go too. */
  bubbleHidden: () => ipcRenderer.send('bubble:hidden'),
  /** A media key from the now-playing whisper: playpause, next or previous. */
  media: key => ipcRenderer.send('bubble:media', key),
  /**
   * Where Aang's head is, so the tail can point at it.
   *
   * The page cannot work this out. It knows its own box and nothing else: not where the pet is, not
   * what the display scaling is, not which edge he is docked to. Guessing it from a constant put the
   * tail 80 px past his head on the first real run. So the Shell, which has the sprite rectangle in
   * screen pixels, works it out and hands the page a point in the page's own coordinates.
   * `{x, y, flip}` - flip is true when he is to the LEFT and the tail has to come out of that side.
   */
  /** The bubble is told to page itself, from the typing box. -1 up, 1 down. */
  onPage(fn) {
    const h = (_e, d) => fn(d);
    ipcRenderer.on('bubble:page', h);
    return () => ipcRenderer.removeListener('bubble:page', h);
  },
  /** Ctrl+C was pressed with the mouse on the bubble (the Shell holds the key only then). */
  onBubbleCopy(fn) { const h = () => fn(); ipcRenderer.on('bubble:copy', h); return () => ipcRenderer.removeListener('bubble:copy', h); },
  /** Esc, or a click away from everything of ours: let the message go (parity with the old bubble, 2026-10-11). */
  onDismiss(fn) {
    const h = (_e, why) => fn(why);
    ipcRenderer.on('bubble:dismiss', h);
    return () => ipcRenderer.removeListener('bubble:dismiss', h);
  },
  /** Where the mouse is in the window, from the Shell (bubble.ts watchPointer), while the window lets the mouse through. */
  onPointer(fn) { const h = (_e, p) => fn(p); ipcRenderer.on('bubble:pointer', h); return () => ipcRenderer.removeListener('bubble:pointer', h); },
  onAim(fn) {
    const h = (_e, aim) => fn(aim);
    ipcRenderer.on('bubble:aim', h);
    return () => ipcRenderer.removeListener('bubble:aim', h);
  },

  // --- the browser frame (6.19, 6.20). Named doors only; the tabs themselves get no preload at all.
  browserInsets: r => ipcRenderer.send('browser:insets', r),
  browserAct: a => ipcRenderer.send('browser:act', a),
  browserWinDrag: m => ipcRenderer.send('browser:windrag', m),
  /** The tab list in its own layer above the live page (2026-10-13): open (with where it goes) or close. */
  browserTray: a => ipcRenderer.send('browser:tray', a),
  // Sheet 87: the secret window's PIN box (try, set, reset with the Mac password, cancel) and what Samara says back.
  browserSecretPin: a => ipcRenderer.send('browser:secretpin', a),
  onBrowserSecretPin(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:secretpin', h); return () => ipcRenderer.removeListener('browser:secretpin', h); },
  // His ask (2026-10-20): a bookmark's own right-click menu. The address says which one; the Shell checks the rest.
  browserMarkOp: a => ipcRenderer.send('browser:markop', a),
  onBrowserTray(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:tray', h); return () => ipcRenderer.removeListener('browser:tray', h); },
  browserGo: text => ipcRenderer.send('browser:go', text),
  browserTab: a => ipcRenderer.send('browser:tab', a),
  onBrowserTabs(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:tabs', h); return () => ipcRenderer.removeListener('browser:tabs', h); },
  browserAskReply: a => ipcRenderer.send('browser:askreply', a),
  browserShareReply: a => ipcRenderer.send('browser:sharereply', a),
  // Sheet 69: his pick in the keyboard ask ({id, device}), and Forget in the shield (a device's key).
  browserDevReply: a => ipcRenderer.send('browser:devreply', a),
  browserDevForget: key => ipcRenderer.send('browser:devforget', key),
  browserUpdateGo: (choices) => ipcRenderer.send('browser:updatego', choices && typeof choices === 'object' ? { lock: choices.lock !== false, closeBackdoors: choices.closeBackdoors !== false } : null),
  // The update tray's ... menu and its two-step skip (sheet 35): one of a fixed few words, and an on/off.
  browserUpdateAct: (a) => { const act = String(a?.act ?? ''); if (['file', 'skip', 'back', 'overnight', 'changelog', 'check', 'seen'].includes(act)) ipcRenderer.send('browser:updateact', { act, on: a?.on === true }); },
  browserAdPause: on => ipcRenderer.send('browser:adpause', on),
  browserDarkHere: on => ipcRenderer.send('browser:darkhere', on),
  browserSiteRule: (key, value) => ipcRenderer.send('browser:siterule', { key, value }),
  browserMark: (act, title) => ipcRenderer.send('browser:mark', { act, title }),
  // Sheet 37: a Claude session's plan, and his answer to it.
  onBrowserPlan: cb => ipcRenderer.on('browser:plan', (_e, card) => cb(card)),
  browserPlanReply: (id, answer) => ipcRenderer.send('browser:planreply', { id, ...answer }),
  /** The popout page: where its picture area is (a lent tab is laid over it), and the controls for that tab. */
  popoutStage: r => ipcRenderer.send('popout:stage', r),
  popoutTabCmd: c => ipcRenderer.send('popout:tabcmd', c),
  onPopoutTabState(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('popout:tabstate', h); return () => ipcRenderer.removeListener('popout:tabstate', h); },
  onPopoutWake(fn) { const h = () => fn(); ipcRenderer.on('popout:wake', h); return () => ipcRenderer.removeListener('popout:wake', h); },
  /** Send a video tab to the pop-out over WoW. */
  browserPopout: id => ipcRenderer.send('browser:popout', id),
  browserToMac: id => ipcRenderer.send('browser:tomac', id),
  browserOpenOther: id => ipcRenderer.send('browser:openother', id),
  browserHome: text => ipcRenderer.send('browser:home', text),
  browserSuggest: text => ipcRenderer.invoke('browser:suggest', text),
  onBrowserHover(fn) { const h = (_e, u) => fn(u); ipcRenderer.on('browser:hover', h); return () => ipcRenderer.removeListener('browser:hover', h); },
  // --- 6.23 the vault: the frame's unlock box and account picker
  browserVaultUnlock: pw => ipcRenderer.send('browser:vaultunlock', { pw }),
  browserVaultPick: id => ipcRenderer.send('browser:vaultpick', { id }),
  onBrowserVault(fn) { const h = (_e, v) => fn(v); ipcRenderer.on('browser:vault', h); return () => ipcRenderer.removeListener('browser:vault', h); },
  // Autofill (sheet 77): the address bar key's state, its sounds, and the save card.
  onBrowserAf(fn) { const h = (_e, v) => fn(v); ipcRenderer.on('browser:af', h); return () => ipcRenderer.removeListener('browser:af', h); },
  onBrowserAfSound(fn) { const h = (_e, v) => fn(v); ipcRenderer.on('browser:afsound', h); return () => ipcRenderer.removeListener('browser:afsound', h); },
  onBrowserAfSave(fn) { const h = (_e, v) => fn(v); ipcRenderer.on('browser:afsave', h); return () => ipcRenderer.removeListener('browser:afsave', h); },
  browserAfSaveGo: (m) => ipcRenderer.send('browser:afsavego', m),
  /** Trails: new, rename, or move a tab ({act, id?, name?, tab?, to?}). */
  browserTrail: a => ipcRenderer.send('browser:trail', a),
  // Sheet 47: the MOCKUPS trail (versions, history, broom, branches).
  browserMockup: a => ipcRenderer.send('browser:mockup', a),
  browserTearOut: id => ipcRenderer.send('browser:tearout', id),
  // C7 Claude's rune (2026-10-21): the brain's jobs for the band, and the panel's pause / play / message / open. The
  // Shell rebuilds and checks every message (claudewire.ts) and takes them from the band's own page only.
  onBrowserClaude(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:claudenews', h); return () => ipcRenderer.removeListener('browser:claudenews', h); },
  browserClaudeHello: () => ipcRenderer.send('browser:claudehello'),
  browserClaude: m => ipcRenderer.send('browser:claude', m),
  browserOpenClaude: url => ipcRenderer.send('browser:openclaude', url),
  // 2026-10-21: the rune's panel in its own layer over the live page (browser.ts runeView). The band asks to open it
  // ({ open, x, y, left, right }) or fold it; the layer folds it and says its size. The Shell says back what is open.
  browserRune: a => ipcRenderer.send('browser:rune', a),
  onBrowserRune(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:rune', h); return () => ipcRenderer.removeListener('browser:rune', h); },
  /** Find on page: the word, and whether this is Enter (next) or Shift+Enter (back). */
  browserFind: a => ipcRenderer.send('browser:find', a),
  browserFindStop: () => ipcRenderer.send('browser:findstop'),
  onBrowserFindOpen(fn) { const h = () => fn(); ipcRenderer.on('browser:findopen', h); return () => ipcRenderer.removeListener('browser:findopen', h); },
  onBrowserFound(fn) { const h = (_e, r) => fn(r); ipcRenderer.on('browser:found', h); return () => ipcRenderer.removeListener('browser:found', h); },
  /** A switch in the browser's ⋯ menu: ads, popups, sounds. */
  browserPref: a => ipcRenderer.send('browser:pref', a),
  // --- 6.22b: the page's right-click menu, its own little window
  onPageMenu(fn) { const h = (_e, items) => fn(items); ipcRenderer.on('pagemenu:items', h); return () => ipcRenderer.removeListener('pagemenu:items', h); },
  pageMenuPick: id => ipcRenderer.send('pagemenu:pick', id),
  pageMenuSize: r => ipcRenderer.send('pagemenu:size', r),
  onBrowserAsk(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:ask', h); return () => ipcRenderer.removeListener('browser:ask', h); },
  onBrowserChangelog(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:changelog', h); return () => ipcRenderer.removeListener('browser:changelog', h); },
  onBrowserUpdateWhy(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:updatewhy', h); return () => ipcRenderer.removeListener('browser:updatewhy', h); },
  onBrowserShare(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:share', h); return () => ipcRenderer.removeListener('browser:share', h); },
  onBrowserDevAsk(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:devask', h); return () => ipcRenderer.removeListener('browser:devask', h); },
  /** The downloads tray: act on one by its number (open, show, stop, forget) or the tray (clear, folder, page); drag one out. */
  browserDl: a => ipcRenderer.send('browser:dl', a),
  /** 6.25a: Aang's own pages: stop, close, watch, unwatch or open one ({act, id}). */
  browserDriver: a => ipcRenderer.send('browser:driver', a),
  onBrowserWatch(fn) { const h = (_e, src) => fn(src); ipcRenderer.on('browser:watch', h); return () => ipcRenderer.removeListener('browser:watch', h); },
  browserDlDrag: id => ipcRenderer.send('browser:dldrag', id),
  browserDlHello: () => ipcRenderer.send('browser:dlhello'),
  onBrowserDls(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('browser:dls', h); return () => ipcRenderer.removeListener('browser:dls', h); },
  onBrowserDownload(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('browser:download', h); return () => ipcRenderer.removeListener('browser:download', h); },
  /** The tab drawer is open: a still picture of the page to show under it (or null to drop it). */
  onBrowserFrozen(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:frozen', h); return () => ipcRenderer.removeListener('browser:frozen', h); },
  onBrowserFocusSlot(fn) { const h = () => fn(); ipcRenderer.on('browser:focusslot', h); return () => ipcRenderer.removeListener('browser:focusslot', h); },

  // --- Snipit (6.17): the overlay. Named doors only. (The corner card went with sheet 62, 2026-10-22.)
  onSnipShot(fn) { const h = (_e, url) => fn(url); ipcRenderer.on('snip:shot', h); return () => ipcRenderer.removeListener('snip:shot', h); },
  snipDone: r => ipcRenderer.send('snip:done', r),
  /** 6.17 the drop: the bubble's two choices on a dropped file. Only the file the brain accepted counts. */
  dropAsk: p => ipcRenderer.send('bubble:dropask', p),
  dropKeep: p => ipcRenderer.send('bubble:dropkeep', p),

  // --- window 2, the desk (6.15). Named doors only, each the same message the C# Panel sends.
  deskPanel: () => ipcRenderer.send('desk:panel'),
  /** Settings are the pet's own: ask where they stand, set one, or run one of its two actions. */
  deskSettings: () => ipcRenderer.send('desk:settings'),
  deskSetting: a => ipcRenderer.send('desk:setting', a),
  deskVolume: v => ipcRenderer.send('desk:volume', v),
  deskSettingDo: what => ipcRenderer.send('desk:settingdo', what),
  deskForgetFact: id => ipcRenderer.send('desk:forgetfact', id),
  deskRevoke: kind => ipcRenderer.send('desk:revoke', kind),
  deskMail: a => ipcRenderer.send('desk:mail', a),
  deskJob: a => ipcRenderer.send('desk:job', a),
  deskHistory: a => ipcRenderer.send('desk:history', a),
  deskForgetTurn: id => ipcRenderer.send('desk:forgetturn', id),
  deskCopy: text => ipcRenderer.send('desk:copy', text),
  deskUndo: () => ipcRenderer.send('desk:undo'),
  deskBrief: () => ipcRenderer.send('desk:brief'),
  deskSearch: q => ipcRenderer.send('desk:search', q),
  /** 6.14b: the brain is down. Try reaching it now, or open its log. */
  retryBrain: () => ipcRenderer.send('bubble:retry'),
  showBrainLog: () => ipcRenderer.send('bubble:log'),
  /** From the bubble's brief card: open window 2 on the whole brief. */
  openDesk: tab => ipcRenderer.send('bubble:desk', tab),
  /** Which tab to open on, when the pet's menu asked for a particular one. */
  onDeskTab(fn) {
    const h = (_e, n) => fn(n);
    ipcRenderer.on('desk:tab', h);
    return () => ipcRenderer.removeListener('desk:tab', h);
  },

  // --- the one cockpit (2026-10-21): the bubble opens into it (with what the typing area needs) and closes back.
  onCockpit(fn) {
    const open = (_e, v) => fn({ open: true, state: v });
    const shut = () => fn({ open: false });
    ipcRenderer.on('cockpit:open', open);
    ipcRenderer.on('cockpit:close', shut);
    return () => { ipcRenderer.off('cockpit:open', open); ipcRenderer.off('cockpit:close', shut); };
  },
  // --- C4, Claude in the cockpit (2026-10-21). One narrow door for everything he says to a Claude session (an answer,
  // a message, pause, play, a model); main.ts checks every field before the brain hears it. And one to open a session
  // in the Claude app, which main.ts only passes on for the exact claude://claude.ai/epitaxy/<id> shape.
  claude: m => ipcRenderer.send('bubble:claude', m),
  openClaude: url => ipcRenderer.send('bubble:openclaude', url),
  // --- the typing box (6.12b). Named doors only.
  onInputState(fn) {
    const h = (_e, v) => fn(v);
    ipcRenderer.on('input:state', h);
    return () => { ipcRenderer.off('input:state', h); };
  },
  submit: a => ipcRenderer.send('input:submit', a),
  /** The chips the box is carrying: what he is replying to, and what he has pinned as context. */
  onChips(fn) {
    const h = (_e, chips) => fn(chips);
    ipcRenderer.on('input:chips', h);
    return () => ipcRenderer.removeListener('input:chips', h);
  },
  dropChip: a => ipcRenderer.send('input:dropchip', a),
  /**
   * His answer to the ask shown in the typing box's strip. The Shell holds WHAT is being answered.
   *
   * Deliberately not called `answerAsk`: the bubble already exposes that name for `bubble:answer`, and
   * both pages share this one preload, so a second `answerAsk` key would silently overwrite the first
   * and break the bubble's keycaps. Object literals do not warn about duplicate keys.
   */
  answerFromBox: a => ipcRenderer.send('input:answer', a),
  /**
   * PageUp / PageDown pressed in the typing box: page the BUBBLE, which is the window he is reading.
   * -1 is up, 1 is down. Ported from InputWindow's `PageRequested`.
   */
  pageBubble: d => ipcRenderer.send('input:page', d),
  /**
   * An ask is waiting, so the typing box can show it and let him answer without leaving the box.
   *
   * The bubble asks with keycaps and remains the real surface. This exists for the case the C# built
   * the consent row for: he is already typing when the question arrives, and making him move to the
   * bubble to press a key is the thing that made the old permission questions feel like an interruption.
   * `null` means nothing is waiting any more.
   */
  /** A message the brain could not take. The box keeps the text so nothing he typed is lost. */
  onFailed(fn) {
    const h = (_e, f) => fn(f);
    ipcRenderer.on('input:failed', h);
    return () => ipcRenderer.removeListener('input:failed', h);
  },
  onAsk(fn) {
    const h = (_e, a) => fn(a);
    ipcRenderer.on('input:ask', h);
    return () => ipcRenderer.removeListener('input:ask', h);
  },
  saveHistory: list => ipcRenderer.send('input:history', list),
  inputClose: () => ipcRenderer.send('input:close'),
  stop: () => ipcRenderer.send('input:stop'),
  setMode: m => ipcRenderer.send('input:mode', m),
  inputSize: s => ipcRenderer.send('input:size', s),
  /** Where the openings, endings and sponsor bits are in what is playing. */
  onPopoutSegments(fn) {
    const h = (_e, list) => fn(list);
    ipcRenderer.on('popout:segments', h);
    return () => { ipcRenderer.off('popout:segments', h); };
  },
  /** His switches, so the page knows whether it may fade. */
  onPopoutSettings(fn) {
    const h = (_e, s) => fn(s);
    ipcRenderer.on('popout:settings', h);
    return () => { ipcRenderer.off('popout:settings', h); };
  },
});

// ---------------------------------------------------------------- the window family (familywin.ts, 2026-10-22)
// The SAME block as at the end of jobpoppreload.cjs (a sandboxed preload cannot require a shared file). Only ever
// switched on by the main process for a pop-out that is a member of the family (the video, a note, a timer); in every
// other window that uses this preload it does nothing. It measures the member's visible panel (so snapping lines up the
// panels, not the see-through room round them), squares the panel's joined sides, draws the gold rim while the group is
// pulled apart, and, while the window is joined or wiggling, turns a right-click into the ONE family menu (his rule).
(() => {
  let st = { on: false, joined: false, wiggle: false, held: false, sides: [], square: [], through: false, pad: null, card: null, shape: 'free', sized: null };
  let cardEl = null, ro = null, mo = null, sent = '', shown = null;
  // Its look (square joined sides, the gold rim) is put in by the main process (insertCSS: the pages' own rules forbid
  // a <style> from here).
  const measure = () => {
    if (!st.on || !document.documentElement) return;
    if (st.card && (!cardEl || !cardEl.isConnected)) {
      cardEl = document.querySelector(st.card);
      if (cardEl) {
        if (getComputedStyle(cardEl).position === 'static') cardEl.style.position = 'relative';
        try { ro?.disconnect(); ro = new ResizeObserver(measure); ro.observe(cardEl); } catch { /* old page */ }
      }
    }
    // The page may redraw its panel's insides: the rim is put back whenever it went.
    if (cardEl && !cardEl.querySelector(':scope > .fam-rim')) { const rim = document.createElement('div'); rim.className = 'fam-rim'; cardEl.append(rim); }
    if (st.card && !cardEl) {
      // The page has not drawn its panel yet: look again as soon as it does.
      if (!mo) { mo = new MutationObserver(() => { if (document.querySelector(st.card)) { mo.disconnect(); mo = null; measure(); } }); mo.observe(document.documentElement, { childList: true, subtree: true }); }
      return;
    }
    const r = cardEl ? cardEl.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const k = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    if (k === sent) return;
    sent = k;
    ipcRenderer.send('family:card', { x: r.left, y: r.top, width: r.width, height: r.height });
  };
  const paint = () => {
    const h = document.documentElement;
    if (!h) return;
    h.dataset.famJoin = (st.sides || []).join(' ');
    h.dataset.famSq = (st.square || []).join(' ');
    h.classList.toggle('fam-through', !!st.through);
    // A window cut by a region (the video joined) grew by its resize borders: padded back to what shows.
    const pd = st.pad;
    h.style.padding = pd ? `${pd.t}px ${pd.r}px ${pd.b}px ${pd.l}px` : '';
    h.classList.toggle('fam-joined', !!st.joined);
    h.classList.toggle('fam-wiggle', !!st.wiggle);
    h.classList.toggle('fam-held', !!st.held);
    // F4 (part 2): its shape (tall beside a taller window, wide above or below a wider one) and the size its panel is held
    // at. The page re-flows (never rotates) inside a view transition, so its named parts glide on the family's spring and
    // the rest crossfades; a page that redraws listens for the plain 'famshape' event, fired inside the transition.
    const key = st.shape + '|' + (st.sized ? st.sized.width + 'x' + (st.sized.height ?? '') : '');
    if (key !== shown) {
      const first = shown === null;
      shown = key;
      const set = () => {
        if (st.shape !== 'free') h.dataset.famShape = st.shape; else delete h.dataset.famShape;
        if (st.sized) {
          h.dataset.famSized = '';
          h.style.setProperty('--fam-w', st.sized.width + 'px');
          if (st.sized.height !== undefined) h.style.setProperty('--fam-h', st.sized.height + 'px'); else h.style.removeProperty('--fam-h');
        } else { delete h.dataset.famSized; h.style.removeProperty('--fam-w'); h.style.removeProperty('--fam-h'); }
        try { window.dispatchEvent(new Event('famshape')); } catch { /* the page's own listener failed: its problem */ }
      };
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!first && !still && typeof document.startViewTransition === 'function' && document.visibilityState === 'visible') {
        try { document.startViewTransition(set); } catch { set(); }
      } else set();
    }
    measure();
  };
  ipcRenderer.on('family:state', (_e, s) => {
    if (!s || typeof s !== 'object') return;
    st = { on: true, ownMenu: s.ownMenu === true, joined: s.joined === true, wiggle: s.wiggle === true, held: s.held === true, sides: Array.isArray(s.sides) ? s.sides.filter((x) => ['left', 'right', 'above', 'below'].includes(x)) : [], square: Array.isArray(s.square) ? s.square.filter((x) => ['tl', 'tr', 'br', 'bl'].includes(x)) : [], through: s.through === true, pad: s.pad && typeof s.pad === 'object' && ['t', 'r', 'b', 'l'].every((k) => Number.isFinite(s.pad[k]) && s.pad[k] >= 0 && s.pad[k] <= 40) ? { t: s.pad.t, r: s.pad.r, b: s.pad.b, l: s.pad.l } : null, card: typeof s.card === 'string' ? s.card : null, shape: s.shape === 'tall' || s.shape === 'wide' ? s.shape : 'free', sized: s.sized && typeof s.sized === 'object' && Number.isFinite(s.sized.width) && s.sized.width > 0 && s.sized.width < 10000 ? { width: Math.round(s.sized.width), ...(Number.isFinite(s.sized.height) && s.sized.height > 0 && s.sized.height < 10000 ? { height: Math.round(s.sized.height) } : {}) } : null };
    if (s.remeasure) sent = '';
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
  });
  window.addEventListener('resize', () => measure());
  window.addEventListener('contextmenu', (e) => {
    // a member that draws its own menu (the timer: its rows plus the family's) keeps the right-click while joined
    if (!st.wiggle && (!st.joined || st.ownMenu)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ipcRenderer.send('family:context', { x: e.screenX, y: e.screenY });
  }, true);
})();
