// 2026-10-25, his report: Shadow's sign-in page asks "are you a bot", and ticking it just reloads, over and over. What
// the page sees of Samara (name, OS, client hints) and what the check's frames do, on the real page. Never ticks it.
// Run: npx electron test/electron/botcheck-probe.ts [url]
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'bot-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const URL0 = process.argv.find((a) => a.startsWith('https://')) ?? 'https://account.shadow.tech/';
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'bot-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  const seen: string[] = [];
  b.ses.webRequest.onSendHeaders({ urls: ['*://challenges.cloudflare.com/*', '*://*.shadow.tech/*'] }, (d: any) => {
    const h = d.requestHeaders; seen.push(`${d.resourceType} ${d.url.slice(0, 90)} | UA ${String(h['User-Agent']).slice(0, 60)}… | ch-ua ${h['sec-ch-ua'] ?? '-'} | platform ${h['sec-ch-ua-platform'] ?? '-'}`);
  });
  const blocked: string[] = [];
  b.ses.webRequest.onErrorOccurred({ urls: ['<all_urls>'] }, (d: any) => { if (/cloudflare|shadow|turnstile|hcaptcha|recaptcha/.test(d.url)) blocked.push(`${d.error} ${d.url.slice(0, 100)}`); });
  b.open(URL0);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  await wait(15000);
  const wc = b.cur().view.webContents;
  const look = await wc.mainFrame.executeJavaScript(`({ url: location.href, ua: navigator.userAgent, platform: navigator.platform, uad: navigator.userAgentData ? { brands: navigator.userAgentData.brands, platform: navigator.userAgentData.platform } : null, webdriver: navigator.webdriver, frames: [...document.querySelectorAll('iframe')].map(f => f.src.slice(0, 100)), title: document.title })`).catch((e: Error) => 'err ' + e.message);
  console.log('PAGE ' + JSON.stringify(look, null, 1));
  console.log('FRAMES ' + wc.mainFrame.framesInSubtree.map((f: any) => f.url.slice(0, 100)).join(' | '));
  console.log('REQUESTS\n' + [...new Set(seen)].slice(0, 25).join('\n'));
  console.log('ERRORS\n' + [...new Set(blocked)].slice(0, 20).join('\n'));
  app.exit(0);
});
