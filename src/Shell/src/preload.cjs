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
  /** How big the drawn bubble actually is, measured by the page, so the window can fit it. */
  bubbleSize: s => ipcRenderer.send('bubble:size', s),
  /** His answer to an ask: yes, no, always, show, skip. Named, so a page cannot invent a new one. */
  answerAsk: a => ipcRenderer.send('bubble:answer', a),
  /** Open a file or link he pressed a chip for. The main process decides HOW; the page only says which. */
  openThing: t => ipcRenderer.send('bubble:open', t),
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
  /** The pointer is over the drawn bubble, so this window should take the mouse. Off it, clicks pass
   *  through to whatever is behind. */
  bubbleClickable: on => ipcRenderer.send('bubble:clickable', on),
  /** The bubble has finished saying its piece and gone; the window can go too. */
  bubbleHidden: () => ipcRenderer.send('bubble:hidden'),
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
  onAim(fn) {
    const h = (_e, aim) => fn(aim);
    ipcRenderer.on('bubble:aim', h);
    return () => ipcRenderer.removeListener('bubble:aim', h);
  },

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
