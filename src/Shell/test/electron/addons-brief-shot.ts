// Sheet 65, built: the brief's Addons slip and Aang's lines while he updates, drawn by the REAL bubble page (no
// decorators: addonslip.js does it all), fed as the main process feeds it. Checks the slip's rules (safe ticked, risky
// unticked, the count follows the ticks, Update sends only the ticked ids) and takes up to three small pictures to put
// beside sheet 65's. Off screen, never focused, no input to any other window.
//
// Run (from src/Shell): ADDONS_JSON=<section.json> SHOTS=<dir> npx electron test/electron/addons-brief-shot.ts
// section.json is an AddonsSection (Core addonbrief.ts), e.g. the fixture's list wearing his real CurseForge icons.
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..', '..');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SECTION = JSON.parse(readFileSync(process.env.ADDONS_JSON!, 'utf8'));
const SHOTS = process.env.SHOTS ?? '';
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 980, H = 1100, fx = W - 300, fy = H - 240, head = { x: fx + 112, y: fy + 96 };
const day = new Date();
const at = (h: number) => { const d = new Date(day); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const BRIEF = {
  day: 'Thursday, October 23', weather: { now: 6, words: 'cloudy', low: 5, high: 11, rain: 0 },
  parts: [{ part: 'morn', sky: 'cloud', temp: 6 }, { part: 'aftn', sky: 'partly', temp: 11 }, { part: 'eve', sky: 'cloud', temp: 7 }],
  events: [{ start: at(20), end: at(23), title: 'Guild raid: Molten Core', where: 'Discord', allDay: false }],
  unread: [], jobsNew: 0, week: 0.34, weekResetsAt: null, addons: SECTION,
};
const icons: Record<string, string> = { CurseForge: 'curseforge' };
for (const r of SECTION.rows) if (r.icon) icons[r.name] = r.icon;
const safe = SECTION.rows.filter((r: { safe: boolean }) => r.safe);
const prog = { pct: 64, rows: safe.slice(0, 3).map((r: { name: string; icon?: string; to: string }, i: number) => ({ name: r.name, icon: r.icon, state: ['done', 'now', 'wait'][i], note: [`now ${r.to}`, 'updating', 'next'][i] })) };
const M = [
  { key: 'addons-brief', msg: { t: 'bubble', text: '', stream: false, proactive: true, turn: 20, brief: BRIEF } },
  { key: 'addons-working', msg: { t: 'bubble', text: `Updating ${prog.rows.length} addons in CurseForge…`, stream: false, id: 'addons-x', who: 'Aang', proactive: true, addons: { icons, progress: prog } } },
  { key: 'addons-wow', msg: { t: 'bubble', text: 'WoW is open. I’ll update them when you close it.', stream: false, id: 'addons-y', who: 'Aang', proactive: true, addons: { icons: { WoW: 'wow' } } } },
];
let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  for (const m of M) {
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true, partition: 'addonsshot' } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = <T = unknown>(s: string) => w.webContents.executeJavaScript(s, true) as Promise<T>;
    const css = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - (fx + 140)}px ${H - (fy + 46)}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}`;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    await js(`window.__deliver(${JSON.stringify(m.msg)}); true`);
    await wait(2800);
    if (m.key === 'addons-brief') {
      const st = await js<{ rows: number; off: number; key: string; tags: string[]; icons: number; note: string }>(`(() => { const s = document.querySelector('.addons');
        return { rows: s.querySelectorAll('.lt-item').length, off: s.querySelectorAll('.lt-item.off').length, key: s.querySelector('.key.primary').textContent,
          tags: [...s.querySelectorAll('.atag')].map(t => t.textContent), icons: [...s.querySelectorAll('img.aico')].filter(i => i.naturalWidth > 0).length, note: s.querySelector('.anote')?.textContent ?? '' }; })()`);
      check(st.rows === SECTION.rows.length, `one row per update (${st.rows})`);
      check(st.off === SECTION.rows.length - safe.length, `risky ones unticked (${st.off})`);
      check(st.key.startsWith(`Update ticked (${safe.length})`), `key says the count: ${st.key}`);
      check(st.tags.includes('Errors') && st.tags.includes('Big jump') && st.tags.includes('Not for this patch'), `tags in words: ${st.tags.join(', ')}`);
      check(st.icons === SECTION.rows.length, `every addon wears its icon (${st.icons})`);
      check(/also threw errors\. No fix out yet\.$/.test(st.note), `errors line: ${st.note}`);
    }
    // the picture, cropped to the bubble and Aang
    const r = await js<{ x: number; y: number; width: number; height: number }>(`(() => { const sk = document.getElementById('skin'), a = document.querySelector('.stg.aang');
      const rs = [a.getBoundingClientRect(), sk.getBoundingClientRect()];
      const x0 = Math.min(...rs.map((q) => q.left)) - 16, y0 = Math.min(...rs.map((q) => q.top)) - 16, x1 = Math.max(...rs.map((q) => q.right)) - 40, y1 = Math.max(...rs.map((q) => q.bottom)) - 10;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)) }; })()`);
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
    if (SHOTS) writeFileSync(path.join(SHOTS, m.key + '.png'), img.toPNG());
    console.log(`${m.key}.png ${JSON.stringify(img.getSize())}`);
    if (m.key === 'addons-brief') {
      // untick the first, tick a risky one: the count follows; Update sends exactly what is ticked
      const sent = await js<{ key: string; sent: unknown }>(`(async () => { const s = document.querySelector('.addons'); const tq = [...s.querySelectorAll('.tq')];
        tq[0].click(); tq[tq.length - 1].click(); const key = s.querySelector('.key.primary').textContent; s.querySelector('.key.primary').click();
        await new Promise(r => setTimeout(r, 50)); return { key, sent: window.__sent.filter(x => x[0] === 'addonsUpdate').map(x => x[1][0]) }; })()`);
      const want = [...safe.slice(1).map((x: { id: number }) => x.id), SECTION.rows.at(-1).id].sort();
      check(sent.key.startsWith(`Update ticked (${safe.length})`), `count after one off, one on: ${sent.key}`);
      check(JSON.stringify((sent.sent as number[][])[0]?.slice().sort()) === JSON.stringify(want), `Update sent the ticked ids ${JSON.stringify(sent.sent)}`);
    }
    if (m.key === 'addons-working') {
      const p = await js<{ pct: string; rows: number; iconed: number }>(`(() => ({ pct: document.querySelector('.aprog .pct')?.textContent, rows: document.querySelectorAll('.aprog li').length, iconed: document.querySelectorAll('#said img.sw').length }))()`);
      check(p.pct === '64%' && p.rows === prog.rows.length, `progress ${p.pct}, ${p.rows} rows`);
      check(p.iconed === 1, `CurseForge wears its icon in the line (${p.iconed})`);
    }
    if (errors.length) { console.log('page errors: ' + errors.slice(0, 3).join(' | ')); failed++; }
    w.destroy();
  }
  pages.close();
  console.log(failed ? `${failed} FAILED` : 'ALL OK');
  setTimeout(() => app.exit(failed ? 1 : 0), 200);
});
