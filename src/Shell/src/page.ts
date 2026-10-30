// The page engine (engine 6, 2026-10-30): one way to run code inside a page, always with a deadline.
//
// Before this there were three copies of "ask the page" (browser.ts askPage, popout.ts inPage, and 26 bare calls in
// driver.ts with only 2 deadlines), so a hung page could make a Claude tool wait the connector's whole 180 s, and the
// webContents form of the call waited for the page to finish loading, which a page that never stops loading (Twitch,
// YouTube) never does: each call left a 'did-stop-loading' listener behind (the "11 listeners" warning).
//
//   - main world (the default): the main frame's own call, which runs now, even while the page is still loading;
//   - an isolated world (a number: autofill, password fill, Claude's driver): Electron only has the webContents form,
//     which waits for loading to stop (forever, on those pages). Here it runs as soon as the page's words are there,
//     any wait has one listener that is removed at the deadline, and the page's scripts still cannot see that world.
//
// With a fallback the answer is the fallback when the page fails, is gone, or misses the deadline. Without one, those
// throw, with words a person (or Claude) can act on.

export type World = 'main' | number;
export interface RunOpts<T> {
  /** 'main' (default) or an isolated world's number. */
  world?: World;
  /** The deadline. Default 1500 ms. */
  ms?: number;
  /** What to answer when the page fails, is gone or is too slow. Leave it out to throw instead. */
  fallback?: T;
  /** Run as if he clicked (play, fullscreen). */
  gesture?: boolean;
}
export const PAGE_MS = 1500;

/** A promise with a deadline: the fallback when it fails or is too slow. For anything, not only pages. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((r) => { timer = setTimeout(() => r(fallback), ms); });
  return Promise.race([p.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

/** The page did not answer in time (or is gone). */
export class PageTimeout extends Error {
  constructor(what: string) { super(what); this.name = 'PageTimeout'; }
}

/** The page counts as ready for the webContents form of the call (Electron's own rule, mirrored). */
const ready = (wc: Electron.WebContents) => Boolean(wc.getURL()) && !wc.isLoadingMainFrame();

function call(wc: Electron.WebContents, code: string, world: World, gesture: boolean, until: number): Promise<unknown> {
  if (wc.isDestroyed()) return Promise.reject(new PageTimeout('the page is closed'));
  if (world === 'main') {
    const f = wc.mainFrame;
    if (!f || f.isDestroyed()) return Promise.reject(new PageTimeout('the page is closed'));
    return f.executeJavaScript(code, gesture);
  }
  if (ready(wc)) return wc.executeJavaScriptInIsolatedWorld(world, [{ code }], gesture);
  // Still loading. A page whose words are already there (its HTML has been read: 'interactive' or 'complete') is
  // asked now; one that is not yet waits for that, or for loading to stop, until the deadline.
  return domReady(wc, until).then((ok) => {
    if (!ok || wc.isDestroyed()) throw new PageTimeout('the page is still loading');
    return isolatedNow(wc, world, code, gesture);
  });
}

/** Is the page's own document read in (or loading finished)? Waits until the deadline at most. */
async function domReady(wc: Electron.WebContents, until: number): Promise<boolean> {
  const state = () => { try { const f = wc.mainFrame; return f && !f.isDestroyed() ? within(f.executeJavaScript('document.readyState') as Promise<string>, Math.max(0, until - Date.now()), '') : Promise.resolve(''); } catch { return Promise.resolve(''); } };
  // Nothing arrived yet (no address: the blank page before the first one) counts as not ready, whatever it says.
  if (wc.getURL() && /^(interactive|complete)$/.test(await state())) return true;
  if (ready(wc)) return true;
  return new Promise((resolve) => {
    const done = (ok: boolean) => { clearTimeout(t); wc.removeListener('dom-ready', yes); wc.removeListener('did-stop-loading', yes); wc.removeListener('destroyed', no); resolve(ok); };
    const yes = () => done(true), no = () => done(false);
    const t = setTimeout(() => done(false), Math.max(0, until - Date.now()));
    wc.once('dom-ready', yes); wc.once('did-stop-loading', yes); wc.once('destroyed', no);
  });
}

/**
 * The isolated-world call, made now. Electron's webContents form first checks "has the page stopped loading?" and, if
 * not, waits for 'did-stop-loading' (with a listener that stays until then). That check is made at once, inside the
 * call, so for that one moment it is told the page is ready; the code itself runs in the renderer like always. If a
 * later Electron moves the check, this simply falls back to its own wait, and the deadline still holds.
 */
function isolatedNow(wc: Electron.WebContents, world: number, code: string, gesture: boolean): Promise<unknown> {
  if (ready(wc)) return wc.executeJavaScriptInIsolatedWorld(world, [{ code }], gesture);
  // Never Electron's own wait: its listener would stay until the page stops loading, which some never do.
  if (!wc.getURL()) return Promise.reject(new PageTimeout('the page has not arrived yet'));
  const had = Object.getOwnPropertyDescriptor(wc, 'isLoadingMainFrame');
  Object.defineProperty(wc, 'isLoadingMainFrame', { value: () => false, configurable: true, writable: true });
  try { return wc.executeJavaScriptInIsolatedWorld(world, [{ code }], gesture); }
  finally { if (had) Object.defineProperty(wc, 'isLoadingMainFrame', had); else delete (wc as { isLoadingMainFrame?: unknown }).isLoadingMainFrame; }
}

/** Run code in a page, with a deadline. See the top of this file. */
export function run<T = unknown>(wc: Electron.WebContents, code: string, o: RunOpts<T> = {}): Promise<T> {
  const ms = o.ms ?? PAGE_MS;
  const until = Date.now() + ms;
  let p: Promise<unknown>;
  try { p = call(wc, code, o.world ?? 'main', o.gesture === true, until); } catch (e) { p = Promise.reject(e); }
  if ('fallback' in o) return within(p as Promise<T>, ms, o.fallback as T);
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_r, no) => { timer = setTimeout(() => no(new PageTimeout(`the page did not answer in ${(ms / 1000).toFixed(ms < 1000 ? 1 : 0)} s (it may be busy or still loading)`)), ms); });
  return Promise.race([p as Promise<T>, late]).finally(() => clearTimeout(timer));
}

/** The engine as one object, for callers that read better as page.run(...). */
export const page = { run, within, PageTimeout };
