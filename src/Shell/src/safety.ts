// Every window Aang draws is built from this. One place, so a new window cannot quietly be less safe
// than the last one (FINAL AANG BUILD step 6.2).
//
// The threat is not a hacker on the internet. It is that Aang reads hostile text all day: emails, web
// pages, what is on his screen. The rule from the plan is that a page may do nothing except be a page.
import type { BrowserWindowConstructorOptions, Session, WebContents } from 'electron';
import { shell } from 'electron';

/**
 * The settings every window gets. Nothing here is optional and nothing here is a default: Electron's
 * own defaults are safe today, but a default can change under you and these cannot.
 */
export const SAFE_WEB_PREFERENCES = {
  // The page runs in its own locked-down process with no access to the machine.
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  // Chromium's own cross-site protections, which a page cannot turn off.
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  // The pop-out has to keep painting over WoW. Measured in 6.1: it costs nothing.
  backgroundThrottling: false,
} as const satisfies BrowserWindowConstructorOptions['webPreferences'];

/**
 * Lock a window down after it is made: no new windows, no navigating away, and no permission granted
 * that was not asked for by name.
 *
 * `allow` is the short list of things THIS window may ask Chromium for. The pop-out needs none of it.
 * A browser tab needs a few, and asks him first (step 6.22).
 */
export function lockDown(contents: WebContents, opts: { allow?: readonly string[]; openExternally?: boolean } = {}): void {
  const allow = new Set(opts.allow ?? []);

  // A page that opens a window is either an advert or an attack. His own links open in his real
  // browser, where he can see the address bar.
  contents.setWindowOpenHandler(({ url }) => {
    if (opts.openExternally && /^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // A page may not take the window somewhere else. Aang decides what a window shows, not its content.
  contents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (opts.openExternally && /^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  // Nothing may attach a debugger to his windows: that is a way back in to everything else.
  contents.on('will-attach-webview', e => e.preventDefault());
}

/**
 * Deny every permission a page can ask for, except the few a window declares. Set once per session.
 *
 * Camera, microphone, notifications and location all live behind this. Notifications and location are
 * refused outright everywhere: nothing he does needs them, and they are the two most abused.
 */
export function denyPermissions(session: Session, allow: readonly string[] = []): void {
  const allowed = new Set(allow);
  session.setPermissionRequestHandler((_wc, permission, done) => done(allowed.has(permission)));
  session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // A page cannot even ask to be a USB device or a serial port. There is no case for it here.
  session.setDevicePermissionHandler(() => false);
}
