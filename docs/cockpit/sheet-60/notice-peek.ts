// Sheet 60 v4 (2026-10-22, night): "Aang notices things in your notes - shouldn't this surface a bit more?" Three livelier
// ways (peek.js), each in three moments (in, settle, out), on the REAL bubble page (bubble.html, look B, S2 rim) driven
// through the test preload exactly as notice-shots.ts does, on the same stage. The note parts come from this sheet's own
// drawing code, served from a second local origin. A picture maker, off screen, never focused, no real keys.
//
// Run (from src/Shell): npx electron ../../docs/cockpit/sheet-60/notice-peek.ts
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { servePages } from '../../../src/Shell/src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SHELL = path.join(ROOT, 'src', 'Shell');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const TYPES: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const W = 960, H = 600;
const fx = W - 300, fy = H - 264, head = { x: fx + 112, y: fy + 96 }, bubbleRight = fx + 96, bubbleBottom = fy + 80;
const STAGE_CSS = (g: number) => `
html,body{background:#191b24 !important;min-height:100vh !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - bubbleRight + g}px ${H - bubbleBottom + g}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;
const LINE = 'Renew the passport is due tomorrow.';
// option, moment, what is on screen
const SHOTS: [string, string, string][] = [['A', 'in', '100 MS &middot; RISING FROM BEHIND HIM'], ['A', 'settle', '350 MS &middot; SETTLED'], ['A', 'out', 'TICKED &middot; SINKS BACK'],
  ['B', 'in', '100 MS &middot; HE LIFTS IT'], ['B', 'settle', 'SETTLED &middot; CLICK THE PAPER OR THE LINE'], ['B', 'out', 'LATER &middot; HE LOWERS IT'],
  ['C', 'in', '100 MS &middot; THE QUOTE OPENS'], ['C', 'settle', 'SETTLED'], ['C', 'out', 'TICKED &middot; THE BUBBLE GOES']];

function serve(): Promise<http.Server> {
  return new Promise((ok) => {
    const s = http.createServer(async (req, res) => {
      try {
        const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
        if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' }); res.end(body);
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, '127.0.0.1', () => ok(s));
  });
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  const docs = await serve();
  const DOCS = 'http://127.0.0.1:' + (docs.address() as { port: number }).port;
  let bad = 0;
  for (const [opt, moment] of SHOTS.filter(([o, m]) => !process.env.ONLY || process.env.ONLY === o + '-' + m)) {
    const T0 = Date.now(); const log = (s: string) => { if (process.env.DBG) console.log(opt + moment + ' ' + (Date.now() - T0) + ' ' + s); };
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: path.join(SHELL, 'test', 'electron', 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true, webSecurity: false, backgroundThrottling: false } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') errors.push(String(m.message)); });
    // the picture maker brings its drawing code from a second local origin, so the page's own CSP is set aside for it
    await w.loadURL(`${pages.origin}/bubble.html`);
    const dbg = w.webContents.debugger; dbg.attach('1.3'); await dbg.sendCommand('Page.setBypassCSP', { enabled: true });
    await new Promise<void>((r) => { w.webContents.once('did-finish-load', () => r()); w.webContents.reload(); });
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    const g = Number(await js(`parseFloat(getComputedStyle(document.getElementById('wrap')).marginRight) - 78`)) || 0;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(STAGE_CSS(g))}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(100);
    log('loaded');
    // A and B: his one proactive line. C: the bubble's own question layout (never capped, its own key row), its words
    // swapped for the same line and its explaining line swapped for the note's quote below.
    // (all three use the bubble's question layout, which is never clipped; A and B hide its key row)
    await js(`window.__deliver({ t: 'fact.ask', text: 'x', left: 0 }); true`);
    await wait(4500);
    // the door, as notice-shots.ts marks it
    await js(`(() => { const said = document.getElementById('said'), want = 'Renew the passport'.split(' ');
      const words = [...said.querySelectorAll('*')].filter((e) => !e.children.length && e.textContent.trim());
      const bare = (t) => t.trim().replace(/^["']|["'.,?!]$/g, '');
      for (let i = 0; i + want.length <= words.length; i++) if (want.every((w, k) => bare(words[i + k].textContent) === w)) { words.slice(i, i + want.length).forEach((e) => e.classList.add('link')); return true; }
      return false; })()`);
    log('before import');
    const ok = await js(`(async () => { const m = await import('${DOCS}/docs/cockpit/sheet-60/peek.js'); await m.ready(); m.style(); window.__peek = m; return true; })()`).catch((e: Error) => { errors.push('import: ' + e.message); return false; });
    if (!ok) { console.log(`${opt}-${moment}: FAILED ${errors.join(' | ')}`); bad++; w.destroy(); continue; }
    const relabel = opt === 'C' ? "const ks = [...document.querySelectorAll('#asks .key')]; ['Tick it', 'Open', 'Later'].forEach((t, i) => { if (!ks[i]) return; const k = ks[i].querySelector('.k'); ks[i].textContent = t; if (k) ks[i].append(k); });" : "document.getElementById('asks').style.setProperty('display', 'none', 'important');";
    await js(`(() => { document.getElementById('said').innerHTML = '<span class="link">Renew the passport</span> is due tomorrow.'; document.getElementById('who').textContent = '';
      const mn = document.getElementById('means'); if (mn) mn.hidden = true; ${relabel}
      ${opt === 'C' ? "document.getElementById('bubble').classList.add('wide'); window.__q = window.__peek.quote(document.getElementById('said'), null);" : ''}
      return true; })()`);
    // make the bubble measure itself again the way it does when dots join a waiting question (the dots kept out of sight)
    await js(`document.getElementById('working').style.setProperty('display', 'none', 'important'); window.__deliver({ t: 'bubble.dots' }); true`);
    await wait(700);
    if (opt === 'C') { await js(`(() => { const a = document.getElementById('asks'); a.hidden = false; a.style.setProperty('display', 'flex', 'important'); window.__deliver({ t: 'bubble.dots' }); return true; })()`); await wait(700); }
    await js(`window.__fire('onAim', { x: ${head.x}, y: ${head.y + 1}, flip: false }); true`); await wait(200);
    await js(`window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); true`); await wait(500);
    if (opt === 'A') {
      const rise = moment === 'in' ? 110 : moment === 'settle' ? 0 : 80;
      await js(`(() => { const c = window.__peek.peek(${fx}, ${fy}, ${rise}, '${pages.origin}'); ${moment === 'out' ? "const li = c.querySelector('li.hi'); li.classList.add('done'); li.classList.remove('hi'); li.querySelector('canvas').replaceWith(window.__peek.tick()); document.getElementById('skin').style.opacity = '.35';" : ''} return true; })()`);
    } else if (opt === 'B') {
      const y = moment === 'in' ? fy + 150 : moment === 'settle' ? fy + 128 : fy + 152;
      await js(`(() => { window.__peek.held(${fx + 95}, ${y}); ${moment === 'out' ? "document.getElementById('skin').style.opacity = '.35';" : ''} return true; })()`);
    } else {
      await js(`(() => { const q = window.__q;
        ${moment === 'in' ? "q.style.opacity = '.45'; q.style.transform = 'scale(.94)'; q.style.transformOrigin = '0 0'; document.getElementById('asks').style.opacity = '.3';" : ''}
        ${moment === 'out' ? "q.querySelector('.nqbx').style.background = '#58b0a3'; q.querySelector('.nql span').style.textDecoration = 'line-through'; document.getElementById('skin').style.opacity = '.35';" : ''}
        return true; })()`);
    }
    log('drawn ' + await js(`(() => { const e = document.elementFromPoint(${fx - 140}, ${fy + 200}); const out = []; for (let n = e; n && n !== document.body; n = n.parentElement) out.push(n.tagName + '#' + n.id + '.' + n.className + ' ' + getComputedStyle(n).backgroundColor); return out.join(' < '); })()`));
    await wait(900);
    const r = await js(`(() => { const a = document.getElementById('skin').getBoundingClientRect(), b = document.querySelector('.stg.aang').getBoundingClientRect();
      const x0 = Math.min(a.left, ${fx - 160}) - 20, y0 = Math.min(a.top, b.top + 70) - 20;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)) }; })()`);
    const x1 = fx + 170, y1 = H;
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: x1 - r.x, height: y1 - r.y });
    const name = `peek-${opt}-${moment}`;
    writeFileSync(path.join(HERE, name + '.png'), img.toPNG());
    console.log(`${name}.png ${JSON.stringify(img.getSize())}${errors.length ? '  page errors: ' + errors.slice(0, 3).join(' | ') : ''}`);
    w.destroy();
  }
  pages.close(); docs.close();
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
