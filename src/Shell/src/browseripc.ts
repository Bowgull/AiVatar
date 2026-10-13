// The browser's buttons, menus and pages, wired to the browser. Shared by the PC (main.ts) and the Mac (macmain.ts,
// M6): on the Mac it had none of these, so no button did anything (his report, 2026-10-13). Each message is taken only
// from the page that may send it (the frame, the Settings or Your things tab, the page menu), never from a website.
import { ipcMain } from 'electron';
import type { AangBrowser } from './browser.ts';

export function wireBrowser(get: () => AangBrowser | null): void {
  const b = () => get() as AangBrowser;
  // ---- 6.19/6.20 the browser frame. Only the frame page may drive it, never a tab.
  // The tab list floating over the page: open (where the frame says) or closed.
  ipcMain.on('browser:tray', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a === 'object') b().tray(a.open === true, a); });
  ipcMain.on('browser:insets', (e, r) => { if (b()?.isMainFrame(e.sender) && r) b().setInsets(Number(r.left), Number(r.top), Number(r.right) || 0, Number(r.bottom) || 0); });
  // A tab's page has drawn (tabpreload.cjs): the only thing a website's tab ever sends, and it carries nothing.
  ipcMain.on('tab:painted', (e) => b()?.painted(e.sender));
  // 6.25a: STOP, close, watch or open one of Aang's pages, from the drawer or the address bar.
  ipcMain.on('browser:driver', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.act === 'string' && Number.isInteger(a.id)) b().driverAct(a.act.slice(0, 10), a.id); });
  ipcMain.on('browser:act', (e, a) => { if (b()?.isFrame(e.sender) && typeof a === 'string') b().act(a); });
  ipcMain.on('browser:go', (e, text) => { if (b()?.isFrame(e.sender) && typeof text === 'string') b().go(text.slice(0, 2000)); });
  ipcMain.on('browser:askreply', (e, a) => { if (b()?.isFrame(e.sender) && a && Number.isInteger(a.id)) b().answer(a.id, a.allow === true); });
  // 6.24: his pick in the screen-share panel. Only an id the panel was given can be shared.
  ipcMain.on('browser:sharereply', (e, a) => { if (b()?.isFrame(e.sender) && a && Number.isInteger(a.id)) b().shareAnswer(a.id, typeof a.source === 'string' ? a.source.slice(0, 200) : null, a.sound === true); });
  ipcMain.on('browser:adpause', (e, on) => { if (b()?.isFrame(e.sender)) b().pauseAds(on === true); });
  ipcMain.on('browser:trail', (e, a) => {
    if (!b()?.isFrame(e.sender) || !a || typeof a !== 'object') return;
    if (a.act === 'new') b().newTrail();
    else if (a.act === 'rename' && Number.isInteger(a.id) && typeof a.name === 'string') b().renameTrail(a.id, a.name);
    else if (a.act === 'move' && Number.isInteger(a.tab)) b().moveTab(a.tab, a.to === 'new' ? 'new' : Number.isInteger(a.to) ? a.to : null);
    // Dragging (2026-10-12): a tab into a trail or loose, before another tab; a whole trail before another trail.
    else if (a.act === 'place' && Number.isInteger(a.tab)) b().placeTab(a.tab, Number.isInteger(a.trail) ? a.trail : null, Number.isInteger(a.before) ? a.before : null);
    else if (a.act === 'movetrail' && Number.isInteger(a.id)) b().moveTrail(a.id, Number.isInteger(a.before) ? a.before : null);
    // The trail menu, and the Stash.
    else if (a.act === 'trail' && Number.isInteger(a.id) && ['collapse', 'stash', 'ungroup', 'close'].includes(a.what)) b().trailAct(a.id, a.what);
    else if (a.act === 'stash' && Number.isInteger(a.id) && (a.what === 'restore' || a.what === 'forget')) b().stashAct(a.id, a.what);
  });
  ipcMain.on('browser:find', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.text === 'string') b().find(a.text, a.next === true, a.back === true); });
  ipcMain.on('pagemenu:pick', (e, id) => { if (b()?.isMenu(e.sender)) b().menuPick(typeof id === 'string' ? id.slice(0, 20) : ''); });
  ipcMain.on('pagemenu:size', (e, r) => { if (b()?.isMenu(e.sender) && r) b().menuSize(Number(r.w) || 0, Number(r.h) || 0); });
  // 6.23: his master password goes from the frame straight to the vault, once. Never logged, never to the brain.
  ipcMain.on('browser:vaultunlock', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.pw === 'string' && a.pw.length <= 1024) void b().vaultUnlock(a.pw); });
  ipcMain.on('browser:vaultpick', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.id === 'string') void b().vaultPick(a.id.slice(0, 64)); });
  ipcMain.on('browser:home', (e, text) => { if (b()?.isFrame(e.sender) && typeof text === 'string') b().setHome(text.slice(0, 2000)); });
  // The Settings tab: only its own page may use these.
  ipcMain.handle('settings:get', (e) => b()?.isSettings(e.sender) ? b().settingsData() : null);
  ipcMain.on('settings:set', (e, a) => { if (b()?.isSettings(e.sender) && a && typeof a.key === 'string') b().setSetting(a.key.slice(0, 20), a.value); });
  ipcMain.on('settings:remove', (e, a) => { if (b()?.isSettings(e.sender) && a && typeof a.list === 'string' && typeof a.value === 'string') b().removeEntry(a.list, a.value); });
  // Downloads tray (frame) and Your things (its own tab): a download is named by its number, never by a path.
  ipcMain.on('browser:dl', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.act === 'string') b().dlAct(a.act.slice(0, 10), Number(a.id) || 0); });
  ipcMain.on('browser:dldrag', (e, id) => { if (b()?.isFrame(e.sender) && Number.isInteger(id)) b().dlDrag(e.sender, id); });
  ipcMain.on('browser:dlhello', (e) => { if (b()?.isFrame(e.sender)) b().resendDownloads(); });
  ipcMain.handle('things:history', (e, a) => b()?.isThings(e.sender) && a ? b().historyPage(String(a.q ?? ''), Number(a.offset) || 0) : null);
  ipcMain.handle('things:downloads', (e) => b()?.isThings(e.sender) ? b().downloadsPage() : null);
  ipcMain.on('things:hist', (e, a) => { if (b()?.isThings(e.sender) && a && typeof a.act === 'string') b().historyAct(a.act.slice(0, 12), typeof a.url === 'string' ? a.url.slice(0, 2000) : undefined, Number(a.at)); });
  ipcMain.on('things:dl', (e, a) => { if (b()?.isThings(e.sender) && a && typeof a.act === 'string') b().dlAct(a.act.slice(0, 10), Number(a.id) || 0); });
  ipcMain.on('things:dldrag', (e, id) => { if (b()?.isThings(e.sender) && Number.isInteger(id)) b().dlDrag(e.sender, id); });
  ipcMain.on('things:open', (e, url) => { if (b()?.isThings(e.sender) && typeof url === 'string') b().openFromThings(url.slice(0, 2000)); });
  ipcMain.on('things:go', (e, where) => { if (b()?.isThings(e.sender) && where === 'bookmarks') b().act('bookmarks'); });
  ipcMain.on('settings:act', (e, a) => { if (b()?.isSettings(e.sender) && typeof a === 'string') b().settingsAct(a.slice(0, 20)); });
  ipcMain.handle('browser:suggest', (e, text) => b()?.isFrame(e.sender) && typeof text === 'string' ? b().suggest(text) : []);
  ipcMain.on('browser:findstop', (e) => { if (b()?.isFrame(e.sender)) b().findStop(); });
  ipcMain.on('browser:pref', (e, a) => { if (b()?.isFrame(e.sender) && a && typeof a.key === 'string') b().setPref(a.key, a.on === true); });
  ipcMain.on('browser:tab', (e, a) => { if (b()?.isFrame(e.sender) && a && Number.isInteger(a.id)) b().tabAct(a.id, String(a.act)); });
}
