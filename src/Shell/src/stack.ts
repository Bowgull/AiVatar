// Aang's own chrome above, somebody else's page below, in one window.
//
// WHY THIS EXISTS, found on 2026-10-04 while building step 6.4: paid services refuse to be shown in a
// frame. Crunchyroll answers ERR_BLOCKED_BY_RESPONSE, and Netflix and Prime do the same, because every
// one of them sets headers that forbid being embedded. YouTube and Twitch are the exception: their
// EMBED addresses exist precisely to be framed, which is why the ordinary pop-out can use one.
//
// So a paid service has to be the page itself, not a frame inside Aang's page. That leaves nowhere to
// draw the wooden grab bar, unless the window holds two views stacked: Aang's bar on top, the service
// underneath, each its own web contents, positioned by hand.
//
// This is a small, early version of the layer step 6.19 needs for browser tabs, where the same problem
// appears at full size: "no layout library can hold an Electron browser view, because they lay out page
// elements and a view is not one."
import { BaseWindow, WebContentsView } from 'electron';
import { SAFE_WEB_PREFERENCES, lockDown, wrongSettings } from './safety.ts';

export interface StackOptions {
  /** The window to fill. */
  window: BaseWindow;
  /** How tall Aang's bar is, matching --bar in popout.css. */
  barHeight: number;
  preloadPath: string;
  /** Where the bar's own page lives. */
  chromePage: string;
  /** What the content view may navigate to. Anything else is refused. */
  allow: (url: string) => boolean;
}

export interface Stack {
  /** Aang's bar. Its page can talk to the main process through the preload. */
  chrome: WebContentsView;
  /** Somebody else's page. It has no preload and no way to reach Aang. */
  content: WebContentsView;
  /** Put the service in the content view. */
  show(url: string): Promise<void>;
  /** Called whenever the window changes size, to keep the two in step. */
  layout(): void;
}

export function stack(o: StackOptions): Stack {
  // Aang's bar: his own page, with the preload, exactly like any other window he draws.
  const chromePrefs = { ...SAFE_WEB_PREFERENCES, preload: o.preloadPath };
  const wrongChrome = wrongSettings(chromePrefs as Record<string, unknown>);
  if (wrongChrome.length) throw new Error(`refusing to build the bar: ${wrongChrome.join(', ')}`);
  const chrome = new WebContentsView({ webPreferences: chromePrefs });

  // The service: NO preload, so there is no bridge of Aang's for it to find, and nothing of his is
  // reachable from a page he did not write. Its own session partition keeps its cookies apart too.
  const contentPrefs = { ...SAFE_WEB_PREFERENCES, partition: 'persist:paid' };
  const wrongContent = wrongSettings(contentPrefs as Record<string, unknown>);
  if (wrongContent.length) throw new Error(`refusing to build the page view: ${wrongContent.join(', ')}`);
  const content = new WebContentsView({ webPreferences: contentPrefs });

  lockDown(chrome.webContents);
  lockDown(content.webContents, { openExternally: false });

  // The hard boundary: the content view goes where it is allowed and nowhere else, whatever it tries.
  content.webContents.on('will-navigate', (e, url) => {
    if (!o.allow(url)) { e.preventDefault(); console.error(`stack: blocked navigation to ${url.slice(0, 90)}`); }
  });
  content.webContents.setWindowOpenHandler(({ url }) => {
    // A paid player opening its own window would escape the pop-out entirely. Keep it inside instead.
    if (o.allow(url)) void content.webContents.loadURL(url);
    return { action: 'deny' };
  });

  // The content view goes in first so Aang's bar sits above it.
  o.window.contentView.addChildView(content);
  o.window.contentView.addChildView(chrome);

  const layout = () => {
    const { width, height } = o.window.getContentBounds();
    chrome.setBounds({ x: 0, y: 0, width, height: o.barHeight });
    content.setBounds({ x: 0, y: o.barHeight, width, height: Math.max(0, height - o.barHeight) });
    if (process.env.AANG_STACK_DEBUG) console.log(`stack: window ${width}x${height}, bar 0..${o.barHeight}, page from ${o.barHeight}`);
  };

  chrome.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`stack: Aang's bar would not load (${code} ${desc}) from ${o.chromePage}`);
  });
  chrome.webContents.on('console-message', e => {
    if (e.level === 'error') console.error(`stack: bar page: ${e.message}`);
  });
  void chrome.webContents.loadFile(o.chromePage);
  layout();

  return {
    chrome,
    content,
    layout,
    show: async (url: string) => {
      if (!o.allow(url)) throw new Error(`refusing to load ${url.slice(0, 90)}`);
      await content.webContents.loadURL(url);
    },
  };
}
