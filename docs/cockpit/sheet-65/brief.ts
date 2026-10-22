// Sheet 65 (2026-10-22): addon updates in the morning brief, and the coach's one line. Drawn by the REAL bubble page
// (bubble.html + bubble.css + bubble.js, look B, S2 wood rim, cockpit closed), fed as the main process feeds it
// (window.__deliver through the test stub). The new "Addons" slip is built from the brief's own pieces (lt-slip, lt-item,
// lt-head, lt-txt, the plan card's pixel tick .tq, the bubble's keys) and added by a small decorator after the real brief
// is drawn; the only new CSS is the warning tags and the progress row (a constructed stylesheet, the page's lock forbids
// inline <style>). Addon names and versions are his real ones (AddonGameInstance.json, read only); the "new" versions
// and notes are made up for the picture (today every addon is up to date). Never on his screen. A picture maker.
//
// Run (from src/Shell): npx electron ../../docs/cockpit/sheet-65/brief.ts [only-prefix]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { servePages } from '../../../src/Shell/src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 300_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SHELL = path.join(ROOT, 'src', 'Shell');
const STUB = path.join(SHELL, 'test', 'electron', 'cockpit-stub.cjs');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.argv.slice(2).filter((a) => !a.endsWith('.ts'));
const wanted = (f: string) => !ONLY.length || ONLY.some((o) => f.startsWith(o));
const SPRITE = 'data:image/png;base64,' + readFileSync(path.join(ROOT, 'assets', 'aang', 'frames', 'idle_0.png')).toString('base64');
const W = 980, H = 1100;
// v2: "if we are using a name for software it should carry its icon". The addon icons are CurseForge's own thumbnails
// (64 px, from its local cache, read only, copied into sheet-65/icons); CurseForge and WoW are their programs' own icons.
const ICON = (n: string) => 'data:image/png;base64,' + readFileSync(path.join(HERE, 'icons', n + '.png')).toString('base64');
const ICONS: Record<string, string> = { 'Auctionator': ICON('auctionator'), 'RestedXP Guide': ICON('restedxp-guide'), 'Leatrix Plus': ICON('leatrix-plus'),
  "What's Training?": ICON('what-s-training'), 'GearQuest Forever': ICON('gearquest-forever'), 'BlizzMove': ICON('blizzmove'), 'Details': ICON('details-damage-meter'),
  'CurseForge': ICON('app-curseforge'), 'WoW Forever': ICON('app-wow'), 'WoW': ICON('app-wow') };
const fx = W - 300, fy = H - 240, head = { x: fx + 112, y: fy + 96 };

const day = new Date();
const at = (h: number, m = 0) => { const d = new Date(day); d.setHours(h, m, 0, 0); return d.toISOString(); };
const BRIEF = {
  day: 'Thursday, October 23', weather: { words: 'cloudy', low: 5, high: 11 },
  parts: [{ part: 'morn', sky: 'cloud', temp: 6 }, { part: 'aftn', sky: 'partly', temp: 11 }, { part: 'eve', sky: 'cloud', temp: 7 }],
  events: [{ start: at(20), end: at(23), title: 'Guild raid: Molten Core', where: 'Discord' }],
  unread: [], jobsNew: 0, week: 0.34,
};

// His real addons (names + installed versions from CurseForge's own list); the new versions and notes are examples.
type Tag = 'ERRORS' | 'BIG JUMP' | 'NOT FOR THIS PATCH';
interface Row { name: string; from: string; to: string; what: string; tags: Tag[]; safe: boolean }
const ROWS: Row[] = [
  { name: 'Auctionator', from: '341', to: '344', what: 'Faster search. Fixes the error you got.', tags: ['ERRORS'], safe: true },
  { name: 'RestedXP Guide', from: '4.11.26', to: '4.11.31', what: 'New Westfall steps. Fixes the error you got.', tags: ['ERRORS'], safe: true },
  { name: 'Leatrix Plus', from: '1.60.20', to: '1.60.22', what: 'Small fixes.', tags: [], safe: true },
  { name: "What's Training?", from: '11.0 beta 21', to: '12.0', what: 'Rebuilt. Settings may reset.', tags: ['BIG JUMP'], safe: false },
  { name: 'GearQuest Forever', from: '0.5.8 beta', to: '0.5.9 beta', what: 'Made for the last patch, not 1.60.1.', tags: ['NOT FOR THIS PATCH'], safe: false },
];

const CSS = `
.addons .lt-head{gap:9px}
.addons .tq{margin:0 1px 0 -2px}
.addons .lt-item.off .lt-txt{text-decoration:none;opacity:.55}
.addons .lt-txt b{display:flex;align-items:baseline;gap:8px}
.addons .lt-txt b em{font:700 12.5px Figtree,sans-serif;font-style:normal;color:#7a5a30;white-space:nowrap}
.addons .lt-txt b em i{font-style:normal;color:#2f7a3e}
.addons .atags{display:flex;gap:5px;flex:none}
.atag{display:inline-block;font:800 12px/1 Figtree,sans-serif;letter-spacing:0;padding:5px 9px 5px;border-radius:6px;color:#fff;
  box-shadow:0 0 0 1.5px #2a1606,0 2px 0 rgba(42,22,6,.35);white-space:nowrap}
.atag.err{background:#b8402c} .atag.jump{background:#C8602A} .atag.patch{background:#6a3d8f}
.addons .anote{margin:6px 0 2px;font:500 12.5px/1.4 Figtree,sans-serif;color:#6a5236}
.addons .anote b{font-weight:700;color:#4e3d28}
.addons .lt-keys{margin:9px 0 2px}
.addons h3 small{float:right;display:flex;align-items:center;gap:6px;margin-top:-3px;font:700 12.5px/16px Figtree,sans-serif;letter-spacing:0;color:#7a5a30}
.addons h3 small img,.sw{width:16px;height:16px;border-radius:3px;flex:none}
.sw{display:inline-block;vertical-align:top;position:relative;top:3px;margin:0 4px 0 1px}
.aico{width:24px;height:24px;flex:none;border-radius:5px;box-shadow:0 0 0 1.5px #2a1606;align-self:flex-start;margin-top:1px}
.addons .anote img{width:16px;height:16px;border-radius:3px;vertical-align:-3px;margin-right:4px}
.aprog li img{width:20px;height:20px;border-radius:4px;box-shadow:0 0 0 1px #2a1606}
/* the flow: a progress row under Aang's line */
.aprog{margin:10px 0 2px;width:222px}
.aprog .bar{position:static;opacity:1;display:flex;align-items:center;gap:10px}
.aprog .segs{display:flex;gap:3px;flex:1}
.aprog .segs u{flex:none;width:12px;height:12px;background:#d9c08e;box-shadow:inset 0 0 0 2px #7a5a30;text-decoration:none;border-radius:2px}
.aprog .segs u.on{background:#e9b23a;box-shadow:inset 0 0 0 2px #7a4a12,inset 0 3px 0 rgba(255,240,180,.6)}
.aprog .pct{font:800 17px Figtree,sans-serif;color:#2a1c0c;min-width:44px;text-align:right}
.aprog ul{list-style:none;margin:9px 0 0;padding:0}
.aprog li{display:flex;white-space:nowrap;align-items:center;gap:9px;font:600 13.5px/24px Figtree,sans-serif;color:#2a1c0c}
.aprog li small{margin-left:auto;font:700 12.5px Figtree,sans-serif;color:#7a5a30}
.aprog li.wait{opacity:.55}
.aprog li .dot{width:14px;height:14px;flex:none;border-radius:3px;box-shadow:inset 0 0 0 2px #2a1606}
.aprog li.done .dot{background:#3FBFAE url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' shape-rendering='crispEdges' fill='%23fff'%3E%3Crect x='8' y='2' width='2' height='2'/%3E%3Crect x='6' y='4' width='2' height='2'/%3E%3Crect x='0' y='4' width='2' height='2'/%3E%3Crect x='2' y='6' width='2' height='2'/%3E%3Crect x='4' y='6' width='2' height='2'/%3E%3C/svg%3E") 2px 2px/10px 10px no-repeat}
.aprog li.now .dot{background:#e9b23a}
.aprog li.wait .dot{background:#e6cf9c}
.door{white-space:nowrap;display:flex;align-items:center;gap:8px;margin:9px 0 1px;font:700 13px Figtree,sans-serif;color:#4A2C6E}
.door img{width:20px;height:20px;image-rendering:pixelated}
.door span{text-decoration:underline;text-decoration-color:rgba(74,44,110,.4);text-underline-offset:3px}
.door small{margin-left:auto;font:600 12px Figtree,sans-serif;color:#9a7a4a}
`;

/** The Addons slip, from the brief's own pieces. tickAll: every row ticked; otherwise only the safe ones. */
function slip(tickAll: boolean) {
  const rows = ROWS.map((r) => ({ ...r, on: tickAll || r.safe }));
  const n = rows.filter((r) => r.on).length;
  return `(() => {
    const body = document.querySelector('.briefcard .lt-body'); if (!body) return false;
    const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const s = T('div', 'lt-slip addons samaraplan');
    const h = T('h3', '', 'ADDONS'); const hs = T('small', '', ''); const hi = document.createElement('img'); hi.src = ${JSON.stringify(ICONS['WoW Forever'])}; hs.append(hi, 'WoW Forever'); h.append(hs); s.append(h);
    const IC = ${JSON.stringify(ICONS)};
    const cls = { 'ERRORS': 'err', 'BIG JUMP': 'jump', 'NOT FOR THIS PATCH': 'patch' };
    const word = { 'ERRORS': 'Errors', 'BIG JUMP': 'Big jump', 'NOT FOR THIS PATCH': 'Not for this patch' };
    for (const r of ${JSON.stringify(rows)}) {
      const it = T('div', 'lt-item' + (r.on ? '' : ' off'));
      const hd = T('div', 'lt-head');
      const tq = T('button', 'tq' + (r.on ? '' : ' off')); tq.type = 'button';
      const tx = T('div', 'lt-txt');
      const b = T('b', '', r.name); const em = T('em', '', r.from + ' \\u2192 '); em.append(T('i', '', r.to)); b.append(em);
      tx.append(b, T('span', '', r.what));
      const ai = document.createElement('img'); ai.className = 'aico'; ai.src = IC[r.name]; ai.alt = '';
      hd.append(tq, ai, tx);
      if (r.tags.length) { const tg = T('div', 'atags'); for (const t of r.tags) tg.append(T('span', 'atag ' + cls[t], word[t])); hd.append(tg); }
      it.append(hd); s.append(it);
    }
    const im = (n) => { const i = document.createElement('img'); i.src = IC[n]; i.alt = ''; return i; };
    const note = T('p', 'anote'); note.append(im('BlizzMove'), T('b', '', 'BlizzMove'), ' and ', im('Details'), T('b', '', 'Details'), ' also threw errors. No fix out yet.'); s.append(note);
    const keys = T('div', 'lt-keys');
    const k1 = T('button', 'key sm primary', 'Update ticked (${n})'); k1.append(T('span', 'k', 'A'));
    const k2 = T('button', 'key sm', 'Not now'); k2.append(T('span', 'k', 'Z'));
    keys.append(k1, k2); s.append(keys);
    body.append(s);
    return true; })()`;
}

/** Aang working: the bar, the percent in big readable numbers, and the three he is doing. */
const PROGRESS = () => `(() => {
  const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const p = T('div', 'aprog');
  const bar = T('div', 'bar'); const segs = T('div', 'segs'); for (let i = 0; i < 10; i++) segs.append(T('u', i < 6 ? 'on' : ''));
  bar.append(segs, T('span', 'pct', '64%')); p.append(bar);
  const ul = T('ul');
  const IC = ${JSON.stringify(ICONS)};
  for (const [st, name, note] of [['done', 'Auctionator', 'now 344'], ['now', 'RestedXP Guide', 'updating'], ['wait', 'Leatrix Plus', 'next']]) {
    const li = T('li', st); const i = document.createElement('img'); i.src = IC[name]; i.alt = ''; li.append(T('i', 'dot'), i, name, T('small', '', note)); ul.append(li);
  }
  p.append(ul);
  document.getElementById('scroller').after(p);
  return true; })()`;

const DOOR = (label: string, hint: string) => `(() => {
  const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const d = T('div', 'door'); const i = document.createElement('img'); i.src = 'art/samara/samara-lantern-32.png'; i.alt = '';
  d.append(i, T('span', '', ${JSON.stringify(label)}), T('small', '', ${JSON.stringify(hint)}));
  document.getElementById('scroller').after(d);
  return true; })()`;

/** Each software name in Aang's line gets its icon just before it (the first time it appears). */
const ICONIZE = (names: string[]) => `(() => {
  const IC = ${JSON.stringify(ICONS)}, names = ${JSON.stringify(names)};
  const said = document.getElementById('said'); if (!said) return false;
  for (const n of names) {
    const w = document.createTreeWalker(said, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode())) { const i = t.data.indexOf(n.split(' ')[0]); if (i < 0) continue;
      const word = n.split(' ')[0], rest = t.splitText(i); rest.splitText(word.length);
      const im = document.createElement('img'); im.className = 'sw'; im.src = IC[n]; im.alt = '';
      const keep = document.createElement('span'); keep.style.whiteSpace = 'nowrap'; rest.before(keep); keep.append(im, rest); break; }
  }
  return true; })()`;
const both = (...xs: string[]) => `(() => { let ok = true; ${xs.map((x) => `ok = (${x}) && ok;`).join(' ')} return ok; })()`;
interface Moment { key: string; msg: object; after?: string; wide?: boolean }
const line = (text: string) => ({ t: 'bubble', text, stream: false, turn: 21, proactive: true });
const M: Moment[] = [
  { key: 'a-brief-all', msg: { t: 'bubble', text: '', stream: false, turn: 20, proactive: true, brief: BRIEF }, after: slip(true) },
  { key: 'a-brief-safe', msg: { t: 'bubble', text: '', stream: false, turn: 20, proactive: true, brief: BRIEF }, after: slip(false) },
  { key: 'b-working', msg: line('Updating 3 addons in CurseForge…'), after: both(ICONIZE(['CurseForge']), PROGRESS()) },
  { key: 'c-done', msg: line('Done: Auctionator, RestedXP Guide and Leatrix Plus are up to date.'), after: ICONIZE(['Auctionator', 'RestedXP Guide', 'Leatrix Plus']) },
  { key: 'd-wow', msg: line('WoW is open. I’ll update them when you close it.'), after: ICONIZE(['WoW']) },
  { key: 'e-coach', msg: line('Garr: good kill, you stayed alive. One big miss: Avatar.'), after: DOOR('See your report', 'opens in Samara') },
];

app.whenReady().then(async () => {
  const pages = await servePages(path.join(SHELL, 'pages'));
  for (const m of M) {
    if (!wanted(m.key)) continue;
    const w = new BrowserWindow({ width: W, height: H, show: false, frame: false, useContentSize: true,
      webPreferences: { preload: STUB, contextIsolation: false, sandbox: false, offscreen: true } });
    const errors: string[] = [];
    w.webContents.on('console-message', (e) => { const x = e as unknown as { message?: string; level?: string }; if (x.level === 'error') errors.push(String(x.message)); });
    await w.loadURL(`${pages.origin}/bubble.html`);
    await wait(700);
    const js = (s: string) => w.webContents.executeJavaScript(s, true);
    const css = `html,body{background:#191b24 !important}
body{background:radial-gradient(900px 500px at 15% 5%, rgba(80,96,140,.30), transparent 60%),radial-gradient(700px 500px at 95% 100%, rgba(120,70,110,.22), transparent 60%),linear-gradient(180deg,#1c1f2b,#151720) !important}
.wrap{margin:0 ${W - (fx + 140)}px ${H - (fy + 46)}px 14px !important}
.stg{position:fixed;pointer-events:none;image-rendering:pixelated}` + CSS;
    await js(`(() => { const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [st];
      const i = document.createElement('img'); i.src = ${JSON.stringify(SPRITE)}; i.className = 'stg aang'; i.style.left = '${fx}px'; i.style.top = '${fy}px'; document.body.append(i);
      window.__fire('onAim', { x: ${head.x}, y: ${head.y}, flip: false }); return true; })()`);
    await wait(150);
    await js(`window.__deliver(${JSON.stringify(m.msg)}); true`);
    await wait(2600);
    if (m.after) { const ok = await js(m.after); if (!ok) console.log(m.key + ': decorator found nothing'); }
    if (m.wide) await js(`(() => { const b = document.getElementById('bubble'); b.classList.add('wide'); return true; })()`);
    if (m.after) await js(`(() => { const b = document.getElementById('bubble'); for (const e of [b, ...b.querySelectorAll('*')]) { if (e.style.height) e.style.height = ''; } b.style.maxHeight = ''; b.style.width = ''; b.classList.remove('sizing', 'tight'); b.style.removeProperty('--tightw'); b.style.removeProperty('--cw'); return true; })()`);
    await js(`window.dispatchEvent(new Event('resize')); window.__fire('onAim', { x: ${head.x}, y: ${head.y} + 0.5, flip: false }); true`);
    await wait(1500);
    const r = await js(`(() => { const sk = document.getElementById('skin'), a = document.querySelector('.stg.aang');
      const rs = [a.getBoundingClientRect(), sk.getBoundingClientRect()];
      const x0 = Math.min(...rs.map((q) => q.left)) - 16, y0 = Math.min(...rs.map((q) => q.top)) - 16, x1 = Math.max(...rs.map((q) => q.right)) - 40, y1 = Math.max(...rs.map((q) => q.bottom)) - 10;
      return { x: Math.max(0, Math.floor(x0)), y: Math.max(0, Math.floor(y0)), width: Math.ceil(x1 - Math.max(0, x0)), height: Math.ceil(y1 - Math.max(0, y0)) }; })()`);
    const img = await w.webContents.capturePage({ x: r.x, y: r.y, width: Math.min(W - r.x, r.width), height: Math.min(H - r.y, r.height) });
    writeFileSync(path.join(HERE, m.key + '.png'), img.toPNG());
    console.log(`${m.key}.png ${JSON.stringify(img.getSize())}${errors.length ? '  page errors: ' + errors.slice(0, 3).join(' | ') : ''}`);
    w.destroy();
  }
  pages.close();
  setTimeout(() => app.exit(0), 200);
});
