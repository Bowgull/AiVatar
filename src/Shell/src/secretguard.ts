// The secret window's fences that are not in the browser itself (his rule, 2026-11-19: "i want its memory to ONLY be stored
// locally on my mac. It CANNOT leak anywhere").
//
//  - It exists on the Mac only. On the PC there is no secret window at all: ⇧Ctrl+N only says where it lives, and no
//    secret folder, profile or file is ever made there (boot.ts and browser.ts both ask secretAllowed()).
//  - Its sessions are marked, so code that only has a page's webContents (the flight log, flight.ts) can leave its
//    address out.
//  - No Now Playing for it: the Mac's media controls (Control Center, the lock screen) would show a secret tab's title.
//    Chromium reads that switch only at start, so (his pick, 2026-11-19) the secret window is its own program
//    (secretmain.ts), started with the system media controls off (MAC_MEDIA_OFF). Normal Samara keeps them.

/** The secret program's own Chromium data folder, inside Aang's (its profile, its single-instance lock). */
export const SECRET_APP_DIR = 'secret-app';
/** The flag that starts the Mac app as the secret program (macmain.ts, secretlaunch.ts). */
export const SECRET_FLAG = '--samara-secret';
/** This run is the secret program: the flag, and only on the Mac. */
export const isSecretRun = (argv: string[], platform: NodeJS.Platform = process.platform): boolean => secretAllowed(platform) && argv.includes(SECRET_FLAG);
/** Where the secret window may exist. */
export const secretAllowed = (platform: NodeJS.Platform = process.platform): boolean => platform === 'darwin';
/** What ⇧Ctrl+N says on a machine without it. */
export const SECRET_ELSEWHERE = 'The secret window lives on your Mac';
/** The Chromium feature that feeds the Mac's Now Playing (and its media keys) from pages. Turned off on the Mac. */
export const MAC_MEDIA_OFF = 'HardwareMediaKeyHandling';

const secretSessions = new WeakSet<object>();
/** One of the secret window's sessions (its throwaway one and its kept one). */
export function markSecret(ses: object): void { secretSessions.add(ses); }
/** Is this page the secret window's? Anything that cannot tell says yes (never a risk of naming its site). */
export function isSecretPage(wc: { session?: object } | null | undefined): boolean {
  try { return !!wc?.session && secretSessions.has(wc.session); } catch { return true; }
}
