// Cookie banners declined by themselves (his pick from the WebBrain study, 2026-11-02). DuckDuckGo's autoconsent
// (MPL-2.0, its ~2,000 site rules, the same engine the DuckDuckGo browser uses) runs in every page Samara shows: it
// finds the site's consent popup and presses the "reject" path, or hides a banner that has no reject. It never accepts:
// autoAction is optOut, and the button guesser for unknown banners is held to 'reject' (its 'tier2' would press Accept
// when there is no Reject). Its "eval" rules (code it would run in the page's own world) are always answered false, so
// nothing of it runs where the page's scripts live, in the main page. Banners inside a frame (Sourcepoint, TrustArc)
// get the frame-only rules in that frame. Nothing is sent anywhere; the rules ship inside Samara.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { webFrameMain, type WebContents } from 'electron';
import { filterCompactRules } from '@duckduckgo/autoconsent';

/** Its own world in each page (Dark Reader has 1002), so the page's scripts can neither see it nor switch it off. */
const COOKIE_WORLD = 1003;
const CONFIG = {
  enabled: true, autoAction: 'optOut', disabledCmps: [], enablePrehide: true, enableCosmeticRules: true, enableGeneratedRules: true,
  enableHeuristicDetection: true, heuristicMode: 'reject', enablePopupMutationObserver: false, detectRetries: 20, prehideTimeout: 2000,
  logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false },
};

type Compact = Parameters<typeof filterCompactRules>[0];
let src: { bundle: string; rules: Compact } | null | undefined;
function source(): { bundle: string; rules: Compact } | null {
  if (src === undefined) {
    try {
      const req = createRequire(import.meta.url);
      // The bundle is not in the package's "exports": found beside its main file (dist/autoconsent.cjs.js).
      const dist = path.dirname(req.resolve('@duckduckgo/autoconsent'));
      src = { bundle: readFileSync(path.join(dist, 'autoconsent.playwright.js'), 'utf8'), rules: req('@duckduckgo/autoconsent/rules/compact-rules.json') as Compact };
    } catch (e) { src = null; console.error('shell: cookies: the cookie decliner could not load: ' + (e as Error).message); }
  }
  return src;
}

/** The script for one page or frame: its rules, the answers autoconsent waits for, then autoconsent itself. Pure.
 *  Null for a frame no rule is for (an ad, a video): most frames, so they are left alone. */
export function cookieScript(bundle: string, rules: Compact, url: string, mainFrame: boolean): string | null {
  const mine = filterCompactRules(rules, { url, mainFrame });
  if (!mainFrame && !mine.r.length) return null;
  const r = JSON.stringify({ autoconsent: [], compact: mine });
  const cfg = JSON.stringify({ ...CONFIG, isMainWorld: !mainFrame });
  return `if(!window.__aangCookie){window.__aangCookie=1;` +
    `window.autoconsentSendMessage=(m)=>{const say=(x)=>setTimeout(()=>window.autoconsentReceiveMessage&&window.autoconsentReceiveMessage(x),0);` +
    `if(m&&m.type==='init')say({type:'initResp',config:${cfg},rules:${r}});` +
    `else if(m&&m.type==='eval')say({type:'evalResp',id:m.id,result:false});` +
    `else if(m&&m.type==='optOutResult'&&m.result)window.__aangCookieDone=String(m.cmp||'');return Promise.resolve();};\n${bundle}\n};true`;
}

/** Decline cookie banners in this page for as long as it lives: each new page, and each frame as it loads. */
export function declineCookies(wc: WebContents): void {
  const web = (u: string) => /^https?:/i.test(u);
  wc.on('dom-ready', () => {
    const s = source(), u = wc.getURL();
    if (!s || !web(u)) return;
    void wc.executeJavaScriptInIsolatedWorld(COOKIE_WORLD, [{ code: cookieScript(s.bundle, s.rules, u, true)! }]).catch(() => { /* the page went away */ });
  });
  // A frame has no isolated world Electron can reach from here, so in a frame it runs in the frame's own world. That is
  // the consent company's frame, never the site he is on.
  wc.on('did-frame-finish-load', (_e, main, pid, rid) => {
    if (main) return;
    const s = source();
    let f: Electron.WebFrameMain | null | undefined;
    try { f = webFrameMain.fromId(pid, rid); } catch { return; }
    if (!s || !f || f.isDestroyed?.() || !web(f.url)) return;
    const code = cookieScript(s.bundle, s.rules, f.url, false);
    if (code) void f.executeJavaScript(code).catch(() => { /* the frame went away */ });
  });
}
