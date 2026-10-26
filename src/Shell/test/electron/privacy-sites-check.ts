// 2026-10-26 (his "will my logged in sites have trouble? I don't want any more friction"): the real sites he uses, opened
// in a fresh Samara on the real internet with the privacy protections on (privacy.ts), and again with them off. Each page
// must open where it should, show no "are you human" wall, and (YouTube) play. Signed out: his own logins are checked
// in his Samara afterwards, never here.
// Run: npx electron test/electron/privacy-sites-check.ts   (OFF=1 for the comparison run without the protections)
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 600_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'pvs-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WALL = /unusual traffic|are you a robot|verify (that )?you are (a )?human|not a robot|press (and|&) hold|access denied|request blocked|checking your browser|just a moment|captcha|sorry, you have been blocked/i;
const SITES: { name: string; url: string; at: RegExp; play?: boolean }[] = [
  { name: 'Google search', url: 'https://www.google.com/search?q=weather+tomorrow', at: /google\.com\/search/ },
  { name: 'YouTube (plays)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', at: /youtube\.com\/watch/, play: true },
  { name: 'Netflix sign-in', url: 'https://www.netflix.com/login', at: /netflix\.com\/.*login/ },
  { name: 'Shadow', url: 'https://shadow.tech/', at: /shadow\.tech/ },
  { name: 'Microsoft sign-in (Outlook)', url: 'https://outlook.live.com/mail/', at: /(login\.live\.com|login\.microsoftonline\.com|outlook\.live\.com|microsoft\.com\/.*outlook)/ },
  { name: 'Stremio web', url: 'https://web.stremio.com/', at: /web\.stremio\.com/ },
  { name: 'Amazon', url: 'https://www.amazon.com/', at: /amazon\.com/ },
  { name: 'Reddit', url: 'https://www.reddit.com/r/mac/', at: /reddit\.com/ },
  { name: 'Discord sign-in', url: 'https://discord.com/login', at: /discord\.com\/login/ },
  { name: 'PayPal sign-in', url: 'https://www.paypal.com/signin', at: /paypal\.com/ },
  { name: 'Google Flights', url: 'https://www.google.com/travel/flights', at: /google\.com\/travel\/flights/ },
  { name: 'Brave Search', url: 'https://search.brave.com/search?q=weather', at: /search\.brave\.com/ },
];
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'pvs-s-'));
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir });
  wireBrowser(() => b);
  const off = process.env.OFF === '1';
  if (off) b.wall.on = false;
  await wait(4000);                                      // the ad lists, as in his Samara
  let bad = 0;
  for (const s of SITES) {
    const before = b.cur()?.view?.webContents;
    b.open(s.url);
    for (let i = 0; i < 60 && (!b.cur()?.view || b.cur().view.webContents === before); i++) await wait(150);
    const wc = b.cur().view.webContents;
    for (let i = 0; i < 100 && wc.isLoading(); i++) await wait(200);
    await wait(s.play ? 7000 : 3500);
    const url = wc.getURL();
    const text = String(await wc.executeJavaScript('(document.title + " " + (document.body ? document.body.innerText.slice(0, 3000) : ""))').catch(() => ''));
    const wall = WALL.exec(text.replace(/protected by (Google )?reCAPTCHA[^.]*\./gi, ''))?.[0] ?? '';   // the sign-in page's own small print
    let played = '';
    if (s.play) played = String(await wc.executeJavaScript('(() => { const v = document.querySelector("video"); if (!v) return "no video"; v.muted = true; v.play().catch(() => {}); return new Promise((r) => setTimeout(() => r(v.currentTime > 0.5 ? "played" : "stuck at " + v.currentTime.toFixed(1)), 5000)); })()').catch((e: Error) => 'err ' + e.message));
    const ok = s.at.test(url) && !wall && (!s.play || played === 'played') && text.trim().length > 40;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${s.name}: ${url.slice(0, 90)}${wall ? ' | WALL "' + wall + '"' : ''}${played ? ' | ' + played : ''} | ${text.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  let log = ''; try { log = readFileSync(path.join(stateDir, 'privacy-log.jsonl'), 'utf8').trim(); } catch { /* none */ }
  console.log('LOG ' + (log ? log.split('\n').length + ' let through: ' + log.split('\n').map((l) => { const j = JSON.parse(l); return j.site + ' in ' + j.inside; }).join(', ') : 'nothing let through'));
  const jar = await b.ses.cookies.get({});
  console.log(`JAR ${jar.length} cookies from ${new Set(jar.map((c: any) => c.domain.replace(/^\./, ''))).size} places`);
  console.log(off ? 'OFF RUN DONE' : bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
