// Phase 3 (2026-11-18): passkeys go to Chrome. The go/no-go test found neither route works on both machines:
// - PC (Shadow): Windows Hello is not set up on this cloud PC (no Hello keys), so no browser gets a platform passkey,
//   and phone passkeys need Bluetooth, which a cloud PC lacks. Both engines answer "no platform authenticator".
// - Mac: Touch ID needs the keychain-access-groups entitlement with an Apple team id (app.configureWebAuthn), and
//   @clerk/electron-passkeys needs Apple's associated-domains entitlement per site. Samara is signed by "Samara on this
//   Mac", a self-made certificate, so neither can be granted.
// Full write-up: docs/PASSKEYS-GO-NO-GO-2026-11-18.md. So Samara keeps passkeys hidden (tabpreload.cjs) and, when a site
// asks anyway, or Google refuses the sign-in, offers to open the page in Chrome (toChrome in browser.ts).

/** Google's own refusal of an embedded or "not secure" browser: its rejected-sign-in address, or its words. */
export function googleRefused(url: string, text = ''): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || !/^accounts\.(google|youtube)\.com$/i.test(u.hostname)) return false;
  if (/\/signin\/(v\d+\/)?(deniedsigninrejected|rejected)(\/|$)/i.test(u.pathname)) return true;
  return /this browser or app may not be secure/i.test(text);
}

/** The JavaScript (an isolated world) that reads a Google sign-in page's words for the refusal: a few hundred letters. */
export const GOOGLE_WORDS_JS = `(() => { try { return String(document.body ? document.body.innerText : '').slice(0, 4000); } catch { return ''; } })()`;

/**
 * Where Chrome should go after Google refused Samara: the service he was signing in to (Google's own "continue"), else
 * the page he came from, else Google's sign-in itself. Web addresses only.
 */
export function refusalTarget(url: string, cameFrom = ''): string {
  const web = (s: string | null | undefined): string => {
    try { const x = new URL(String(s || '')); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; }
  };
  let cont = '';
  try { cont = web(new URL(url).searchParams.get('continue')); } catch { /* not an address */ }
  if (cont) return cont;
  const back = web(cameFrom);
  if (back && !googleRefused(back)) return back;
  return 'https://accounts.google.com/';
}

/**
 * The test-only switch of the go/no-go (never on in a release): SAMARA_PASSKEY_TRY=1 lifts the hiding on webauthn.io and
 * nowhere else. tabpreload.cjs has its own copy of this rule (a preload cannot import); test/passkeys.test.ts keeps them
 * the same.
 */
export function passkeyTry(host: string, env: string | undefined): boolean {
  return env === '1' && /^(www\.)?webauthn\.io$/i.test(host);
}
