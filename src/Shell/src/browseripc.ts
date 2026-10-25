// The browser's buttons, menus and pages, wired to the browser. Shared by the PC (main.ts) and the Mac (macmain.ts,
// M6): on the Mac it had none of these, so no button did anything (his report, 2026-10-13). Each message is taken only
// from the page that may send it (the frame, the Settings or Your things tab, the page menu), never from a website.
import { ipcMain } from 'electron';
import type { AangBrowser } from './browser.ts';

/** The window's own page, never a frame inside it (code audit L3, 2026-10-14): only the page itself may ask. */
function top(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  try { const f = e.senderFrame; return !!f && f.parent === null; } catch { return false; }
}

export function wireBrowser(get: () => AangBrowser | null, secret: () => AangBrowser | null = () => null): void {
  // Sheet 87: the secret window is a second browser; each message goes to the one whose page or tab sent it.
  const b = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => { const s = secret(); return (s?.owns(e.sender) ? s : get()) as AangBrowser; };
  // ---- 6.19/6.20 the browser frame. Only the frame page may drive it, never a tab.
  // The tab list floating over the page: open (where the frame says) or closed.
  ipcMain.on('browser:tray', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a === 'object') b(e).tray(a.open === true, a); });
  // Sheet 60 section 4: the notes rail. A new note for this site (where it came from is the browser's to say), or one to open.
  ipcMain.on('browser:notesave', (e, n) => { if (top(e) && b(e)?.isFrame(e.sender)) b(e).noteSave(n); });
  ipcMain.on('browser:noteopen', (e, id) => { if (top(e) && b(e)?.isFrame(e.sender)) b(e).noteOpen(id); });
  ipcMain.on('browser:insets', (e, r) => { if (b(e)?.isMainFrame(e.sender) && r) b(e).setInsets(Number(r.left), Number(r.top), Number(r.right) || 0, Number(r.bottom) || 0); });
  // A tab's page has drawn (tabpreload.cjs): the only thing a website's tab ever sends, and it carries nothing.
  ipcMain.on('tab:painted', (e) => b(e)?.painted(e.sender));
  // Sheet 87: the link he clicked in a tab's top page (the click trick), an address only.
  ipcMain.on('tab:link', (e, href) => { if (top(e) && typeof href === 'string') b(e)?.linkClicked(e.sender, href.slice(0, 4000)); });
  // Autofill (sheet 77): the box he is in, and a login he sent, from a tab's top page only; the light's two doors; the
  // save card's Save, from the frame only.
  ipcMain.on('tab:field', (e, m) => { if (top(e)) b(e)?.afField(e.sender, m); });
  ipcMain.on('tab:cred', (e, m) => { if (top(e)) b(e)?.afCred(e.sender, m); });
  ipcMain.on('light:pick', (e) => { if (top(e) && b(e)?.isLight(e.sender)) void b(e).afPick(false); });
  ipcMain.on('light:flick', (e, d) => { if (top(e) && b(e)?.isLight(e.sender) && (d === 1 || d === -1)) b(e).afFlick(d); });
  ipcMain.on('browser:afsavego', (e, m) => { if (top(e) && b(e)?.isMainFrame(e.sender)) void b(e).afSaveGo(m); });
  // Nothing plays until he asks (2026-10-20): a starting page asks whether it may play by itself and whether he sees it.
  // Dark mode at the page's start (2026-10-20): the top frame only, and only for the address that frame really has.
  ipcMain.handle('tab:dark', (e) => { try { const f = e.senderFrame; if (!f || f.parent) return null; return b(e)?.darkAtStart(e.sender, f.url) ?? null; } catch { return null; } });
  ipcMain.handle('tab:mayplay', (e) => { try { return b(e)?.mayPlay(e.sender) ?? { ok: true, shown: true }; } catch { return { ok: true, shown: true }; } });
  // 6.25a: STOP, close, watch or open one of Aang's pages, from the drawer or the address bar.
  ipcMain.on('browser:driver', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.act === 'string' && Number.isInteger(a.id)) b(e).driverAct(a.act.slice(0, 10), a.id); });
  ipcMain.on('browser:act', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && typeof a === 'string') b(e).act(a); });
  // Option + drag anywhere on the frame moves the window (2026-10-23): only the frame, only screen numbers.
  ipcMain.on('browser:windrag', (e, m) => { if ((top(e) && b(e)?.isFrame(e.sender)) && m && typeof m.phase === 'string' && Number.isFinite(m.x) && Number.isFinite(m.y)) b(e).winDrag(e.sender, m.phase, Math.round(m.x), Math.round(m.y)); });
  ipcMain.on('browser:go', (e, text) => { if ((top(e) && b(e)?.isFrame(e.sender)) && typeof text === 'string') b(e).go(text.slice(0, 2000)); });
  ipcMain.on('browser:askreply', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && Number.isInteger(a.id)) b(e).answer(a.id, a.allow === true); });
  // 6.24: his pick in the screen-share panel. Only an id the panel was given can be shared.
  ipcMain.on('browser:sharereply', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && Number.isInteger(a.id)) b(e).shareAnswer(a.id, typeof a.source === 'string' ? a.source.slice(0, 200) : null, a.sound === true); });
  // Sheet 69: his pick in the keyboard ask (only a device the ask listed can be picked), and Forget in the shield.
  ipcMain.on('browser:devreply', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && Number.isInteger(a.id)) b(e).devAnswer(a.id, typeof a.device === 'string' ? a.device.slice(0, 200) : null); });
  ipcMain.on('browser:devforget', (e, key) => { if ((top(e) && b(e)?.isFrame(e.sender)) && typeof key === 'string') b(e).forgetDevice(key.slice(0, 100)); });
  ipcMain.on('browser:adpause', (e, on) => { if ((top(e) && b(e)?.isFrame(e.sender))) b(e).pauseAds(on === true); });
  ipcMain.on('browser:darkhere', (e, on) => { if ((top(e) && b(e)?.isFrame(e.sender))) b(e).setDarkHere(on === true); });
  // The star's panel: rename the bookmark for this page, or remove it.
  ipcMain.on('browser:markop', (e, a) => {
    if (!(top(e) && b(e)?.isFrame(e.sender)) || !a || typeof a.url !== 'string') return;
    if (!['rename', 'remove', 'left', 'right', 'newtab', 'pop', 'copy'].includes(String(a.act))) return;
    b(e).markOp(String(a.act), a.url.slice(0, 4000), typeof a.title === 'string' ? a.title.slice(0, 300) : '');
  });
  ipcMain.on('browser:mark', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && (a.act === 'rename' || a.act === 'remove')) b(e).markAct(a.act, typeof a.title === 'string' ? a.title.slice(0, 300) : ''); });
  // Sheet 37: his answer to a Claude session's plan, from the band's plan tray.
  ipcMain.on('browser:planreply', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.id === 'string') b(e).planReply(a.id.slice(0, 40), a); });
  // Sheet 37: a rule for the site he is on, from the shield. Only these keys.
  ipcMain.on('browser:siterule', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && ['ai', 'login', 'ads', 'popups', 'dark', 'camera', 'mic'].includes(a.key)) b(e).setSiteRule(a.key, a.value); });
  ipcMain.on('browser:trail', (e, a) => {
    if (!(top(e) && b(e)?.isFrame(e.sender)) || !a || typeof a !== 'object') return;
    if (a.act === 'new') b(e).newTrail();
    else if (a.act === 'rename' && Number.isInteger(a.id) && typeof a.name === 'string') b(e).renameTrail(a.id, a.name);
    else if (a.act === 'move' && Number.isInteger(a.tab)) b(e).moveTab(a.tab, a.to === 'new' ? 'new' : Number.isInteger(a.to) ? a.to : null);
    // Dragging (2026-10-12): a tab into a trail or loose, before another tab; a whole trail before another trail.
    // Dragging, smoother (2026-10-21): several tabs at once, and under a parent tab. Every field is checked here and
    // again in placeTabs: ids are whole numbers (1 to 60 of them, no repeats), the rest a whole number or null.
    else if (a.act === 'place' && Array.isArray(a.tabs)) {
      const idOrNull = (v: unknown) => v === null || v === undefined || (Number.isInteger(v) && Math.abs(v as number) < 1e9);
      if (a.tabs.length < 1 || a.tabs.length > 60 || !a.tabs.every((x: unknown) => Number.isInteger(x) && (x as number) > 0 && (x as number) < 1e9)) return;
      if (!idOrNull(a.trail) || !idOrNull(a.before) || !idOrNull(a.parent)) return;
      b(e).placeTabs(a.tabs.slice(), a.trail ?? null, a.before ?? null, a.parent ?? null);
    }
    else if (a.act === 'place' && Number.isInteger(a.tab)) b(e).placeTab(a.tab, Number.isInteger(a.trail) ? a.trail : null, Number.isInteger(a.before) ? a.before : null);
    else if (a.act === 'movetrail' && Number.isInteger(a.id)) b(e).moveTrail(a.id, Number.isInteger(a.before) ? a.before : null);
    // The trail menu, and the Stash.
    else if (a.act === 'trail' && Number.isInteger(a.id) && ['collapse', 'stash', 'ungroup', 'close'].includes(a.what)) b(e).trailAct(a.id, a.what);
    else if (a.act === 'stash' && Number.isInteger(a.id) && (a.what === 'restore' || a.what === 'forget')) b(e).stashAct(a.id, a.what);
  });
  // Sheet 47: the MOCKUPS trail. A version to show, the history list, the broom, and the family tree (branches, children).
  ipcMain.on('browser:mockup', (e, a) => {
    if (!(top(e) && b(e)?.isFrame(e.sender)) || !a || typeof a.act !== 'string') return;
    b(e).mockAct(a.act.slice(0, 12), {
      id: Number.isInteger(a.id) ? a.id : undefined, open: a.open === true,
      sheet: typeof a.sheet === 'string' ? a.sheet.slice(0, 400) : undefined,
      to: Number.isInteger(a.to) ? a.to : typeof a.to === 'string' ? a.to.slice(0, 400) : null,
      name: typeof a.name === 'string' ? a.name.slice(0, 300) : undefined,
    });
  });
  ipcMain.on('browser:find', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.text === 'string') b(e).find(a.text, a.next === true, a.back === true); });
  ipcMain.on('pagemenu:pick', (e, id) => { if (b(e)?.isMenu(e.sender)) b(e).menuPick(typeof id === 'string' ? id.slice(0, 20) : ''); });
  ipcMain.on('pagemenu:size', (e, r) => { if (b(e)?.isMenu(e.sender) && r) b(e).menuSize(Number(r.w) || 0, Number(r.h) || 0); });
  // 6.23: his master password goes from the frame straight to the vault, once. Never logged, never to the brain.
  ipcMain.on('browser:vaultunlock', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.pw === 'string' && a.pw.length <= 1024) void b(e).vaultUnlock(a.pw); });
  ipcMain.on('browser:vaultpick', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.id === 'string') void b(e).vaultPick(a.id.slice(0, 64)); });
  ipcMain.on('browser:home', (e, text) => { if ((top(e) && b(e)?.isFrame(e.sender)) && typeof text === 'string') b(e).setHome(text.slice(0, 2000)); });
  // The Settings tab: only its own page may use these.
  ipcMain.handle('settings:get', (e) => (top(e) && b(e)?.isSettings(e.sender)) ? b(e).settingsData() : null);
  ipcMain.on('settings:set', (e, a) => { if ((top(e) && b(e)?.isSettings(e.sender)) && a && typeof a.key === 'string') b(e).setSetting(a.key.slice(0, 20), a.value); });
  // Sheet 37: Settings > Your sites. A rule for any site in the list, or forget all of a site's rules.
  ipcMain.on('settings:siterule', (e, a) => { if ((top(e) && b(e)?.isSettings(e.sender)) && a && typeof a.site === 'string' && ['ai', 'login', 'ads', 'popups', 'dark', 'camera', 'mic'].includes(a.key)) b(e).setSiteRule(a.key, a.value, a.site.slice(0, 300)); });
  ipcMain.on('settings:siteclear', (e, a) => { if ((top(e) && b(e)?.isSettings(e.sender)) && typeof a === 'string') b(e).clearSite(a.slice(0, 300)); });
  ipcMain.on('settings:remove', (e, a) => { if ((top(e) && b(e)?.isSettings(e.sender)) && a && typeof a.list === 'string' && typeof a.value === 'string') b(e).removeEntry(a.list, a.value); });
  // Downloads tray (frame) and Your things (its own tab): a download is named by its number, never by a path.
  ipcMain.on('browser:dl', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.act === 'string') b(e).dlAct(a.act.slice(0, 10), Number(a.id) || 0); });
  ipcMain.on('browser:dldrag', (e, id) => { if ((top(e) && b(e)?.isFrame(e.sender)) && Number.isInteger(id)) b(e).dlDrag(e.sender, id); });
  ipcMain.on('browser:dlhello', (e) => { if ((top(e) && b(e)?.isFrame(e.sender))) b(e).resendDownloads(); });
  ipcMain.handle('things:history', (e, a) => (top(e) && b(e)?.isThings(e.sender)) && a ? b(e).historyPage(String(a.q ?? ''), Number(a.offset) || 0) : null);
  ipcMain.handle('things:downloads', (e) => (top(e) && b(e)?.isThings(e.sender)) ? b(e).downloadsPage() : null);
  ipcMain.on('things:hist', (e, a) => { if ((top(e) && b(e)?.isThings(e.sender)) && a && typeof a.act === 'string') b(e).historyAct(a.act.slice(0, 12), typeof a.url === 'string' ? a.url.slice(0, 2000) : undefined, Number(a.at)); });
  ipcMain.on('things:dl', (e, a) => { if ((top(e) && b(e)?.isThings(e.sender)) && a && typeof a.act === 'string') b(e).dlAct(a.act.slice(0, 10), Number(a.id) || 0); });
  ipcMain.on('things:dldrag', (e, id) => { if ((top(e) && b(e)?.isThings(e.sender)) && Number.isInteger(id)) b(e).dlDrag(e.sender, id); });
  ipcMain.on('things:open', (e, url) => { if ((top(e) && b(e)?.isThings(e.sender)) && typeof url === 'string') b(e).openFromThings(url.slice(0, 2000)); });
  ipcMain.on('things:go', (e, where) => { if ((top(e) && b(e)?.isThings(e.sender)) && where === 'bookmarks') b(e).act('bookmarks'); });
  ipcMain.handle('settings:lookup', (e, q) => (top(e) && b(e)?.isSettings(e.sender)) && typeof q === 'string' ? b(e).addressLookup(q.slice(0, 200)) : []);
  ipcMain.on('settings:act', (e, a) => { if ((top(e) && b(e)?.isSettings(e.sender)) && typeof a === 'string') b(e).settingsAct(a.slice(0, 20)); });
  // Sheet 88: his engine's guesses for what he typed, for the frame's address bar only.
  ipcMain.handle('browser:guesses', (e, text) => (top(e) && b(e)?.isFrame(e.sender)) && typeof text === 'string' ? b(e).guesses(text.slice(0, 200)) : []);
  ipcMain.handle('browser:suggest', (e, text) => (top(e) && b(e)?.isFrame(e.sender)) && typeof text === 'string' ? b(e).suggest(text) : []);
  ipcMain.on('browser:findstop', (e) => { if ((top(e) && b(e)?.isFrame(e.sender))) b(e).findStop(); });
  ipcMain.on('browser:pref', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && typeof a.key === 'string') b(e).setPref(a.key, a.on === true); });
  // His ask (2026-10-13): a tab let go outside its window becomes a window of its own (or joins the one it was dropped on).
  ipcMain.on('browser:tearout', (e, id) => { if ((top(e) && b(e)?.isFrame(e.sender)) && Number.isInteger(id)) b(e).tearOut(id); });
  // C7 Claude's rune (2026-10-21): the band's own page only (not the tab list's layer, never a website). What it may send
  // is the cockpit's pause / play / message, checked again in claudeAct; Open in Claude only for the exact claude:// link.
  // 2026-10-21: and the rune's own layer over the page (runeView), which draws the panel now.
  ipcMain.on('browser:claudehello', (e) => { if (top(e) && (b(e)?.isMainFrame(e.sender) || b(e)?.isRune(e.sender))) b(e).claudeHello(e.sender); });
  ipcMain.on('browser:claude', (e, raw) => { if (top(e) && (b(e)?.isMainFrame(e.sender) || b(e)?.isRune(e.sender))) b(e).claudeAct(raw); });
  ipcMain.on('browser:openclaude', (e, raw) => { if (top(e) && (b(e)?.isMainFrame(e.sender) || b(e)?.isRune(e.sender))) b(e).claudeOpen(raw); });
  ipcMain.on('browser:rune', (e, a) => {
    if (!top(e) || !a || typeof a !== 'object') return;
    if (b(e)?.isRune(e.sender)) b(e).runeFromLayer(a);
    else if (b(e)?.isMainFrame(e.sender)) b(e).runeFromBand(a);
  });
  // Sheet 87: the secret window's PIN box: try his PIN, set a new one, the Mac password for a forgotten one, or cancel.
  ipcMain.on('browser:secretpin', (e, a) => {
    if (!(top(e) && b(e)?.isMainFrame(e.sender)) || !b(e).isSecret || !a || typeof a !== 'object') return;
    if (!['try', 'set', 'reset', 'cancel'].includes(a.act)) return;
    void b(e).secretPinAct({ act: a.act, pin: typeof a.pin === 'string' && /^\d{4,8}$/.test(a.pin) ? a.pin : '' });
  });
  // Sheet 87 v12: the mask in the band, from the frame only: one click or two.
  ipcMain.on('browser:secretmask', (e, act) => { if (top(e) && b(e)?.isMainFrame(e.sender) && b(e).isSecret && (act === 'one' || act === 'two' || act === 'hold')) void b(e).secretMask(act); });
  // Sheet 89: the TV light and the TV ask's keys, from the frame only.
  ipcMain.on('browser:tv', (e, act) => { if (top(e) && b(e)?.isMainFrame(e.sender) && ['open', 'close', 'displays', 'back', 'stop'].includes(act)) void b(e).tvAct(act); });
  ipcMain.on('browser:tab', (e, a) => { if ((top(e) && b(e)?.isFrame(e.sender)) && a && Number.isInteger(a.id)) b(e).tabAct(a.id, String(a.act)); });
}
