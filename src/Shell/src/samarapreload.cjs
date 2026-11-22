// The only bridge between one of Samara's own pages (the browser's band and its layers, the pop-out, peek, the page
// menu, the rune) and the browser around it. Split out of preload.cjs on 2026-11-20 (phase 1 of Samara's own repo,
// docs/SAMARA-REPO-PLAN.md): Aang's windows keep preload.cjs, and neither may reach the other's doors.
//
// PLAIN COMMONJS JAVASCRIPT ON PURPOSE (step 6.2, 2026-10-04): a sandboxed preload is loaded by Chromium, not Node, so it
// must be CommonJS with no types. Its shape is declared for TypeScript in bridge.ts.
//
// Deliberately tiny. Everything here is reachable by anything that gets to run inside a window, so the rule is: no
// general "do this" door. Each thing a window may do is named, and the main process checks it.
//
// The rune's job cards (claudejobs.js, shared with Aang's bubble) reach for five of Aang's doors (onMessage, claude,
// openClaude, jobPop, bubbleTyping). Nothing in Samara answers them; they are kept so the cards draw as before, until
// the companion door (phase 3) carries Claude's jobs.
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

  /** Sheet 17: the bubble may take the keyboard only while he types in a note or the timer's name. */
  bubbleTyping: on => ipcRenderer.send('bubble:typing', on),
  /** Sheet 60 section 4: Samara's notes rail. This site's notes come in; a new note for this site, or one to open, go out. */
  onBrowserNotes(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:notes', h); return () => ipcRenderer.removeListener('browser:notes', h); },
  browserNoteSave: n => ipcRenderer.send('browser:notesave', n),
  browserNoteOpen: id => ipcRenderer.send('browser:noteopen', id),
  onBrowserRailClose(fn) { const h = () => fn(); ipcRenderer.on('browser:railclose', h); return () => ipcRenderer.removeListener('browser:railclose', h); },
  // Sheet 52 (2026-10-21): he held a Claude job bar down; it tears off onto his desktop. Only the job's id goes, and
  // main.ts checks it is a real session id before any window opens.
  jobPop: id => ipcRenderer.send('bubble:jobpop', String(id)),
  // --- the browser frame (6.19, 6.20). Named doors only; the tabs themselves get no preload at all.
  browserInsets: r => ipcRenderer.send('browser:insets', r),
  browserAct: a => ipcRenderer.send('browser:act', a),
  browserWinDrag: m => ipcRenderer.send('browser:windrag', m),
  /** The tab list in its own layer above the live page (2026-10-13): open (with where it goes) or close. */
  browserTray: a => ipcRenderer.send('browser:tray', a),
  /** Sheet 120 A: the band's panels in their own layer over the live page (a key pressed, a panel opened or closed). */
  browserFloat: a => ipcRenderer.send('browser:float', a),
  /** Sheet 121 (4): two pages side by side. The band moves the peg, picks or closes a side; the Shell says what shows. */
  browserSplit: a => ipcRenderer.send('browser:sbs', a),
  /** Sheet 121 (5): the peek strip's keys: 'tab', 'split' or 'close'. */
  browserPeek: act => ipcRenderer.send('browser:peek', act),
  onBrowserSplit(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:sbs', h); return () => ipcRenderer.removeListener('browser:sbs', h); },
  /** Sheet 121 (3): the mouse rests on a tab in the list (its row's place), or left the rows (null). */
  browserTabPeek: a => ipcRenderer.send('browser:tabpeek', a),
  onBrowserFloat(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:float', h); return () => ipcRenderer.removeListener('browser:float', h); },
  // Sheet 87: the secret window's PIN box (try, set, reset with the Mac password, cancel) and what Samara says back.
  browserSecretPin: a => ipcRenderer.send('browser:secretpin', a),
  browserSecretMask: act => ipcRenderer.send('browser:secretmask', act),
  // Sheet 89: his TV, the light and the ask's keys.
  browserTv: act => ipcRenderer.send('browser:tv', act),
  onBrowserSecretPin(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:secretpin', h); return () => ipcRenderer.removeListener('browser:secretpin', h); },
  // His ask (2026-10-20): a bookmark's own right-click menu. The address says which one; the Shell checks the rest.
  browserMarkOp: a => ipcRenderer.send('browser:markop', a),
  onBrowserTray(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:tray', h); return () => ipcRenderer.removeListener('browser:tray', h); },
  browserGo: text => ipcRenderer.send('browser:go', text),
  browserSlot: open => ipcRenderer.send('browser:slot', open === true),
  browserTab: a => ipcRenderer.send('browser:tab', a),
  onBrowserTabs(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:tabs', h); return () => ipcRenderer.removeListener('browser:tabs', h); },
  onOpenUpdate(fn) { const h = () => fn(); ipcRenderer.on('browser:openupdate', h); return () => ipcRenderer.removeListener('browser:openupdate', h); },
  browserAskReply: a => ipcRenderer.send('browser:askreply', a),
  browserShareReply: a => ipcRenderer.send('browser:sharereply', a),
  // Sheet 69: his pick in the keyboard ask ({id, device}), and Forget in the shield (a device's key).
  browserDevReply: a => ipcRenderer.send('browser:devreply', a),
  // Sheet 106: where the key a notice drops from is (its edges, the band's bottom), asked by Samara as each one drops.
  browserNoticeAt: m => ipcRenderer.send('browser:noticeAt', m),
  browserDevForget: key => ipcRenderer.send('browser:devforget', key),
  browserUpdateGo: (choices) => ipcRenderer.send('browser:updatego', choices && typeof choices === 'object' ? { lock: choices.lock !== false, closeBackdoors: choices.closeBackdoors !== false } : null),
  // The update tray's ... menu and its two-step skip (sheet 35): one of a fixed few words, and an on/off.
  browserUpdateAct: (a) => { const act = String(a?.act ?? ''); if (['file', 'skip', 'back', 'overnight', 'changelog', 'check', 'checkdone', 'seen', 'castlabs'].includes(act)) ipcRenderer.send('browser:updateact', { act, on: a?.on === true }); },
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
  onPopoutWake(fn) { const h = (_e, how) => fn(how === 'out' || how === 'full' ? how : 'in'); ipcRenderer.on('popout:wake', h); return () => ipcRenderer.removeListener('popout:wake', h); },
  /** Send a video tab to the pop-out over WoW. */
  browserPopout: id => ipcRenderer.send('browser:popout', id),
  browserToMac: id => ipcRenderer.send('browser:tomac', id),
  browserOpenOther: id => ipcRenderer.send('browser:openother', id),
  browserHome: text => ipcRenderer.send('browser:home', text),
  browserSuggest: text => ipcRenderer.invoke('browser:suggest', text),
  browserGuesses: text => ipcRenderer.invoke('browser:guesses', text),
  // Sheet 102: the list on its own layer (what to show, or null), forgetting one of his own lines, and his pointer on it.
  browserSuggestShow: m => ipcRenderer.send('browser:suggestShow', m),
  browserSuggestForget: a => ipcRenderer.send('browser:suggestForget', a),
  onBrowserSuggestAct(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:suggestAct', h); return () => ipcRenderer.removeListener('browser:suggestAct', h); },
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
  // Sheet 109: the chats for Ask Claude's list, and whether that list hangs on the left.
  onPageMenuChats(fn) { const h = (_e, list) => fn(list); ipcRenderer.on('pagemenu:chats', h); return () => ipcRenderer.removeListener('pagemenu:chats', h); },
  onPageMenuFlip(fn) { const h = (_e, on) => fn(on); ipcRenderer.on('pagemenu:flip', h); return () => ipcRenderer.removeListener('pagemenu:flip', h); },
  onBrowserAsk(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:ask', h); return () => ipcRenderer.removeListener('browser:ask', h); },
  onBrowserChangelog(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:changelog', h); return () => ipcRenderer.removeListener('browser:changelog', h); },
  onBrowserUpdateWhy(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:updatewhy', h); return () => ipcRenderer.removeListener('browser:updatewhy', h); },
  onBrowserShare(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:share', h); return () => ipcRenderer.removeListener('browser:share', h); },
  onBrowserNoticeFrom(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:noticeFrom', h); return () => ipcRenderer.removeListener('browser:noticeFrom', h); },
  onBrowserDevAsk(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('browser:devask', h); return () => ipcRenderer.removeListener('browser:devask', h); },
  /** The downloads tray: act on one by its number (open, show, stop, forget) or the tray (clear, folder, page); drag one out. */
  browserDl: a => ipcRenderer.send('browser:dl', a),
  /** 6.25a: Aang's own pages: stop, close, watch, unwatch or open one ({act, id}). */
  browserDriver: a => ipcRenderer.send('browser:driver', a),
  browserHandSpot: r => ipcRenderer.send('browser:handspot', r),
  onBrowserWatch(fn) { const h = (_e, src) => fn(src); ipcRenderer.on('browser:watch', h); return () => ipcRenderer.removeListener('browser:watch', h); },
  browserDlDrag: id => ipcRenderer.send('browser:dldrag', id),
  browserDlHello: () => ipcRenderer.send('browser:dlhello'),
  onBrowserDls(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('browser:dls', h); return () => ipcRenderer.removeListener('browser:dls', h); },
  onBrowserDownload(fn) { const h = (_e, d) => fn(d); ipcRenderer.on('browser:download', h); return () => ipcRenderer.removeListener('browser:download', h); },
  /** The tab drawer is open: a still picture of the page to show under it (or null to drop it). */
  onBrowserFrozen(fn) { const h = (_e, s) => fn(s); ipcRenderer.on('browser:frozen', h); return () => ipcRenderer.removeListener('browser:frozen', h); },
  onBrowserFocusSlot(fn) { const h = (_e, m) => fn(m && typeof m === 'object' ? { start: m.start === true } : undefined); ipcRenderer.on('browser:focusslot', h); return () => ipcRenderer.removeListener('browser:focusslot', h); },

  // --- C4, Claude in the cockpit (2026-10-21). One narrow door for everything he says to a Claude session (an answer,
  // a message, pause, play, a model); main.ts checks every field before the brain hears it. And one to open a session
  // in the Claude app, which main.ts only passes on for the exact claude://claude.ai/epitaxy/<id> shape.
  claude: m => ipcRenderer.send('bubble:claude', m),
  openClaude: url => ipcRenderer.send('bubble:openclaude', url),
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
