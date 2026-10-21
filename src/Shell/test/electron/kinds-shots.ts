// Sheet 48 (2026-10-21, his ask: "a little difference between Claude jobs and bubbles and chats and actions and
// videos"): the REAL cockpit, off screen, with one conversation of every kind, painted five ways. Each way is a
// small stylesheet over the real bubble; the pictures go to docs/cockpit/sheet-48/. A picture maker, not a check.
// His pick was D + C's label on hover (2026-10-21), now built for real in lookback.js/bubble.css: with no argument this
// draws THAT (real-d.png, real-d-hover.png with the mouse on a Claude row, real-d-live.png with a Claude answer live).
// The five sketches above it are kept as they were drawn; `ways` draws them again.
//
// Run: npx electron test/electron/kinds-shots.ts [ways]
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { servePages } from '../../src/pageserver.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '..', '..', '..', 'docs', 'cockpit', 'sheet-48');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One conversation with every kind in it. ids say the kind, so each way can find its rows.
const day = new Date().toISOString().slice(0, 10);
const TURNS = [
  { id: 908, ts: `${day} 17:40:00`, who: 'Aang', text: 'Waymark is done: the rules-only brain, all 6 tasks.', extra: { kind: 'claude', project: 'Waymark' } },
  { id: 907, ts: `${day} 17:31:00`, who: 'you', text: 'make the grid the default', extra: { to: 'Waymark', when: 'now' } },
  { id: 906, ts: `${day} 17:30:00`, who: 'Aang', text: 'Claude asked which layout to use for the map. You picked Grid.', extra: { kind: 'claude', project: 'Waymark' } },
  { id: 905, ts: `${day} 16:02:00`, who: 'Aang', text: 'HisWattson posted a video', extra: { about: { url: 'https://www.youtube.com/watch?v=abc123', title: 'Wattson ranked guide' } } },
  { id: 904, ts: `${day} 15:10:00`, who: 'Aang', text: 'Done. I moved the demo to Monday at 2 pm and told Dana.', extra: { kind: 'action' } },
  { id: 903, ts: `${day} 15:09:00`, who: 'you', text: 'move the demo to monday' },
  { id: 902, ts: `${day} 15:08:00`, who: 'Aang', text: 'Your demo is Friday at 2 pm.' },
  { id: 901, ts: `${day} 12:00:00`, who: 'Aang', text: 'Your morning brief', extra: { brief: { day: 'Tuesday', events: [{ start: '2:00 pm', title: 'Interview with Acme' }], unread: [{ from: 'Dana Smith' }], jobsNew: 0 } } },
];
const KIND: Record<number, string> = { 908: 'claude', 907: 'claude', 906: 'claude', 905: 'video', 904: 'action', 903: 'mine', 902: 'chat', 901: 'brief' };
const TAG: Record<string, string> = { claude: 'CLAUDE · WAYMARK', video: 'VIDEO', action: 'DONE FOR YOU', chat: '', brief: 'BRIEF' };

// The colours are sheet 45d's: Claude's terracotta, honey, sea, sage.
const C = { claude: '#e8916f', action: '#a8d8a0', video: '#8ad5c9', brief: '#ecc27e' };
const WAYS: { key: string; css: string; tags?: boolean }[] = [
  { key: 'a-icons', css: `` },
  { key: 'b-edge', css: `
    #lblist .lt-item.k-claude,#lblist .lt-item.k-action,#lblist .lt-item.k-video,#lblist .lt-item.k-brief{box-shadow:inset 4px 0 0 var(--k);padding-left:4px;border-radius:6px}
    #lblist .lb-mine.k-claude{box-shadow:inset -4px 0 0 ${C.claude}}` },
  { key: 'c-tag', tags: true, css: `
    #lblist .kt{display:block;font:400 7.5px Silkscreen,monospace;letter-spacing:1.5px;color:var(--kd);margin:0 0 2px}` },
  { key: 'd-paper', css: `
    #lblist .lt-item.k-claude{background:linear-gradient(#f6e0d2,#efd2bf);box-shadow:inset 0 0 0 2px rgba(190,100,70,.35)}
    #lblist .lt-item.k-action{background:linear-gradient(#e6eed2,#d9e6c2);box-shadow:inset 0 0 0 2px rgba(90,130,70,.35)}
    #lblist .lt-item.k-video{background:#2a1a10;box-shadow:inset 0 0 0 2px #6a4628}
    #lblist .lt-item.k-video .lt-txt b{color:#f2e3c2}#lblist .lt-item.k-video .lt-txt span{color:#cdbb9a}
    #lblist .lt-item.k-brief{background:linear-gradient(#f9e7b8,#f1d796);box-shadow:inset 0 0 0 2px rgba(170,120,40,.35)}
    #lblist .lt-item.k-claude,#lblist .lt-item.k-action,#lblist .lt-item.k-video,#lblist .lt-item.k-brief{border-radius:8px;margin:3px -6px}` },
  { key: 'e-seal', css: `
    #lblist .lt-item[class*="k-"]:not(.k-chat) .lt-tile{border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff8ec,var(--k) 75%);box-shadow:0 0 0 2px #3a2414,0 0 8px var(--k),0 2px 0 #0d0703}
    #lblist .lt-item.k-chat .lt-tile{box-shadow:0 0 0 2px #3a2414,0 2px 0 #0d0703}` },
];

// A gold key in pixels (actions have no icon of their own yet): hand-placed, drawn at 2x.
const KEY_SVG = `<svg width="20" height="20" viewBox="0 0 10 10" shape-rendering="crispEdges"><g fill="#7a4e12"><rect x="1" y="2" width="4" height="4"/><rect x="5" y="3" width="4" height="2"/><rect x="7" y="5" width="1" height="2"/><rect x="5" y="5" width="1" height="1"/></g><g fill="#ffc43c"><rect x="2" y="3" width="2" height="2"/><rect x="5" y="3" width="3" height="1"/></g><rect x="2" y="3" width="1" height="1" fill="#2a1a10"/></svg>`;

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true });
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const w = new BrowserWindow({ width: 700, height: 900, show: false, frame: false, webPreferences: { preload: path.join(HERE, 'cockpit-stub.cjs'), contextIsolation: false, sandbox: false, offscreen: true } });
  w.setPosition(-6000, 100);
  w.showInactive();
  await w.loadURL(`${pages.origin}/bubble.html`);
  await wait(800);
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  await js(`window.__fire('onCockpit', { open: true, state: { maxH: 760 } }); window.__fire('onInputState', { opened: true, mode: 'auto', week: 0.3, history: [] })`);
  await wait(900);
  await js(`window.__deliver({ t: 'history.reply', items: ${JSON.stringify(TURNS)} })`);
  await wait(1200);
  const box = async () => js(`(() => { const q = document.getElementById('wrap').getBoundingClientRect(); return { x: Math.max(0, Math.floor(q.left) - 8), y: Math.max(0, Math.floor(q.top) - 8), width: Math.ceil(q.width) + 16, height: Math.ceil(q.height) + 16 }; })()`);
  if (process.argv.at(-1) !== 'ways') {
    // The real thing: nothing added, the rows paint their own kinds.
    await js(`document.body.style.background = '#2a2238'; const l = document.getElementById('lblist'); if (l) l.scrollTop = 1e6; true`);
    await wait(400);
    writeFileSync(path.join(OUT, 'real-d.png'), (await w.webContents.capturePage(await box())).toPNG());
    console.log('picture: real-d');
    // The mouse on Claude's row (sent to this off-screen page only): its label fades in.
    const at = await js(`(() => { const r = document.querySelector('#lblist [data-id="906"] .lt-txt').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`) as { x: number; y: number };
    w.webContents.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
    await wait(500);
    writeFileSync(path.join(OUT, 'real-d-hover.png'), (await w.webContents.capturePage(await box())).toPNG());
    console.log('picture: real-d-hover');
    w.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
    await js(`window.__deliver({ t: 'bubble', text: 'Claude Code finished in Waymark, that one took 6 minutes.', stream: false, turn: 909, proactive: true, kind: 'claude', project: 'Waymark' })`);
    await wait(3000);
    writeFileSync(path.join(OUT, 'real-d-live.png'), (await w.webContents.capturePage(await box())).toPNG());
    console.log('picture: real-d-live');
    pages.close();
    setTimeout(() => app.exit(0), 300);
    return;
  }
  for (const way of WAYS) {
    await js(`(() => {
      document.body.style.background = '#2a2238';
      // The page's own lock forbids inline <style>; a constructed sheet is the way in for a picture.
      const st = new CSSStyleSheet(); st.replaceSync(${JSON.stringify(way.css)}); document.adoptedStyleSheets = [st];
      const KIND = ${JSON.stringify(KIND)}, TAG = ${JSON.stringify(TAG)}, C = ${JSON.stringify(C)};
      for (const r of document.querySelectorAll('#lblist [data-id]')) {
        const k = KIND[r.dataset.id]; if (!k) continue;
        r.classList.add('k-' + k); r.style.setProperty('--k', C[k] || 'transparent');
        r.style.setProperty('--kd', k === 'claude' ? '#b4532f' : k === 'action' ? '#4f7a3c' : k === 'video' ? '#2f8a7c' : '#a0701c');
        const tile = r.querySelector('.lt-tile');
        if (tile && k === 'claude') { tile.classList.remove('round'); tile.innerHTML = '<img src="art/claude-icon.png" alt="" style="width:22px;height:22px;border-radius:5px">'; }
        if (tile && k === 'action') { tile.classList.remove('round'); tile.innerHTML = ${JSON.stringify(KEY_SVG)}; }
        r.querySelector('.kt')?.remove();
        if (${way.tags ? 'true' : 'false'} && TAG[k]) { const b = r.querySelector('.lt-txt'); if (b) b.prepend(Object.assign(document.createElement('i'), { className: 'kt', textContent: TAG[k] })); }
      }
      const l = document.getElementById('lblist'); if (l) l.scrollTop = 1e6;
    })()`);
    await wait(400);
    const r = await js(`(() => { const q = document.getElementById('wrap').getBoundingClientRect(); return { x: Math.max(0, Math.floor(q.left) - 8), y: Math.max(0, Math.floor(q.top) - 8), width: Math.ceil(q.width) + 16, height: Math.ceil(q.height) + 16 }; })()`);
    writeFileSync(path.join(OUT, way.key + '.png'), (await w.webContents.capturePage(r)).toPNG());
    console.log('picture: ' + way.key);
  }
  pages.close();
  setTimeout(() => app.exit(0), 300);
});
