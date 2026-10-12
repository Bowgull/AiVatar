// 6.22, the last two pieces of protection. Their own file so they are tested without Electron.
//
// HTTPS-FIRST (his call, 2026-10-11, copied from Chrome's HTTPS-First mode): every plain http address is tried
// on its secure version first, silently. Addresses on his own home network (the router page and the like) are
// left alone, because those never have a secure version and nobody can listen in on them from outside.
//
// RISKY DOWNLOADS (decision 18): a program or a script asks once per site, then that site is trusted.

/** His own network, or this PC: never upgraded. A name with no dot, .local/.lan/.home, and the private addresses. */
export function isLocal(host: string): boolean {
  const h = String(host ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (!h.includes('.') && !h.includes(':')) return true;                  // "router", "localhost", "nas"
  if (/\.(local|lan|home|internal|localhost|home\.arpa|test)$/.test(h)) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a === 0;
  }
  if (h.includes(':')) return h === '::1' || /^f[cd]/.test(h) || /^fe80:/.test(h);
  return false;
}

/**
 * The secure version of an address, or null when it should be left as it is: already https, on his own
 * network, or a site he chose to open without it (`allowed`, hostnames).
 */
export function upgrade(url: string, allowed: ReadonlySet<string>): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' || isLocal(u.hostname) || allowed.has(u.hostname)) return null;
  // A non-default port says the site was set up on purpose: leave it, as Chrome does.
  if (u.port && u.port !== '80') return null;
  u.protocol = 'https:';
  return u.href;
}

/** Programs, installers and scripts: the files that can run something on his PC the moment he opens them. */
const RISKY = new Set([
  'exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'mst', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys',
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'jar', 'lnk', 'reg', 'inf',
  'scf', 'url', 'application', 'appref-ms', 'iso', 'img', 'vhd', 'vhdx', 'xll', 'chm',
]);
export function isRisky(filename: string): boolean {
  const m = String(filename ?? '').toLowerCase().match(/\.([a-z0-9-]+)$/);
  return Boolean(m && RISKY.has(m[1]!));
}

/** A failed page in plain words (6.22b bug 3). Chromium's net error codes; anything else gets the general line. */
export function failureWords(code: number, host: string): { title: string; text: string; retry: boolean } {
  const at = host || 'this address';
  if (code === -106) return { title: "You're offline", text: "This PC isn't connected to the internet right now. Try again once it is.", retry: true };
  if (code === -105 || code === -137) return { title: "This address doesn't exist", text: `No site answers at ${at}. Check the spelling.`, retry: true };
  if (code <= -200 && code > -300) return { title: "This site's security papers are wrong", text: `${at} could not prove it is who it says it is, so someone could be pretending to be it. Aang won't open it.`, retry: false };
  if ([-7, -118, -102, -109, -100, -101, -21, -15, -324].includes(code)) return { title: "The site didn't answer", text: `${at} didn't respond. It may be down for a moment.`, retry: true };
  if (code === -20) return { title: 'This page was blocked', text: `The ad blocker stopped ${at}. Turn ad blocking off for this site from the shield if you need it.`, retry: true };
  return { title: "This page couldn't load", text: `Something went wrong reaching ${at}.`, retry: true };
}
