// The test door (his yes, 2026-10-28: "build the test door for Aang's windows"). Claude had no eyes on this Mac
// (computer use needs macOS 14) and could only test by moving his real mouse, which he could not share while he worked.
// This door lets a program on THIS Mac see and touch Aang's own windows and nothing else:
//   GET  /windows            every window of Aang's: id, which page, where, shown or not
//   GET  /shot?id=N          a PNG of that window, drawn by the window itself (no screen recording, his screen untouched)
//   GET  /text?id=N          its words, and every button / link / field with its place, so a click can be aimed
//   POST /click {id,x,y}     a click inside that window, sent to the page only: his real pointer never moves
//   POST /hover {id,x,y}     the pointer resting there, for the page (the bubble's keys, hover states)
//   POST /type {id,text}     words into the focused field of that window only (never system-wide keys)
//   POST /pet {do}           what a person does to Aang himself: click, menu, hold (the wheel), release {x,y} over a
//                            slot (screen points), slide out
// Locked like Aang's other doors: loopback only, no browser page (an Origin header is refused), and a key made fresh
// each run in his own folder, readable by his account only. AANG_TEST_DOOR=0 keeps it shut.
import { BrowserWindow } from 'electron';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

export const TEST_DOOR_PORT = 47856;

export interface DoorPet { click(): void; menu(): void; hold(): void; release(x: number, y: number): void; out(): void; slot(name: string): void }

/** Which of Aang's pages a window shows: its file name (bubble, input, aangmenu, timer, macpet...). */
function kindOf(w: BrowserWindow): string {
  try { const u = new URL(w.webContents.getURL()); return path.basename(u.pathname, '.html') || 'blank'; } catch { return 'blank'; }
}

export function openTestDoor(o: { keyFile: string; pet: DoorPet; log: (s: string) => void; touched?: () => void }): () => void {
  if (process.env.AANG_TEST_DOOR === '0') return () => {};
  const key = randomBytes(24).toString('base64url');
  try { writeFileSync(o.keyFile, key); chmodSync(o.keyFile, 0o600); } catch (e) { o.log('aang: the test door has no key: ' + (e as Error).message); return () => {}; }
  const same = (a: string) => a.length === key.length && timingSafeEqual(Buffer.from(a), Buffer.from(key));
  const win = (id: unknown) => { const w = BrowserWindow.fromId(Number(id)); return w && !w.isDestroyed() ? w : null; };
  const json = (res: ServerResponse, code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  const body = (req: IncomingMessage) => new Promise<Record<string, unknown>>((r) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 20_000) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
  const mouse = (w: BrowserWindow, type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number, button: 'left' | 'right' = 'left') =>
    w.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount: 1 } as Electron.MouseInputEvent);

  const srv = createServer(async (req, res) => {
    const peer = String(req.socket.remoteAddress ?? '');
    if (req.headers.origin || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) || !same(String(req.headers['x-aang-key'] ?? ''))) { res.writeHead(403).end(); return; }
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    // A test is touching Aang: he must not take the keyboard from whatever Joshua is typing in (macaang.ts takeKeys).
    o.touched?.();
    try {
      if (req.method === 'GET' && u.pathname === '/windows') {
        json(res, 200, BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => ({ id: w.id, kind: kindOf(w), bounds: w.getBounds(), visible: w.isVisible(), focused: w.isFocused() })));
        return;
      }
      if (req.method === 'GET' && u.pathname === '/shot') {
        const w = win(u.searchParams.get('id')); if (!w) { json(res, 404, { error: 'no such window' }); return; }
        const img = await w.webContents.capturePage();
        res.writeHead(200, { 'content-type': 'image/png' }).end(img.toPNG());
        return;
      }
      if (req.method === 'GET' && u.pathname === '/text') {
        const w = win(u.searchParams.get('id')); if (!w) { json(res, 404, { error: 'no such window' }); return; }
        const r = await w.webContents.executeJavaScript(`(() => {
          const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 1 && b.height > 1; };
          const items = [...document.querySelectorAll('button, a, input, textarea, [contenteditable="true"], [role="button"], .key, .opt, .lrow.tap, .pre, .newk')]
            .filter(vis).slice(0, 80).map((e) => { const b = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 60), text: (e.innerText || e.value || e.getAttribute('aria-label') || e.dataset.ph || '').trim().slice(0, 80), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
          return { text: (document.body.innerText || '').slice(0, 4000), items };
        })()`, true);
        json(res, 200, r);
        return;
      }
      if (req.method === 'POST') {
        const b = await body(req);
        if (u.pathname === '/pet') {
          const what = String(b.do ?? '');
          if (what === 'click') o.pet.click(); else if (what === 'menu') o.pet.menu(); else if (what === 'hold') o.pet.hold(); else if (what === 'release') o.pet.release(Number(b.x) || 0, Number(b.y) || 0); else if (what === 'out') o.pet.out(); else if (what === 'slot' && /^(TIMER|NOTES|BROWSER|MUSIC|SNIP|AWAY)$/.test(String(b.slot))) o.pet.slot(String(b.slot));
          else { json(res, 400, { error: 'do: click, menu, hold or out' }); return; }
          json(res, 200, { ok: true });
          return;
        }
        const w = win(b.id); if (!w) { json(res, 404, { error: 'no such window' }); return; }
        const x = Number(b.x), y = Number(b.y);
        if (u.pathname === '/click' && Number.isFinite(x) && Number.isFinite(y)) {
          const btn = b.button === 'right' ? 'right' : 'left';
          mouse(w, 'mouseMove', x, y); mouse(w, 'mouseDown', x, y, btn);
          setTimeout(() => { if (!w.isDestroyed()) mouse(w, 'mouseUp', x, y, btn); }, Number(b.holdMs) > 0 ? Math.min(3000, Number(b.holdMs)) : 40);
          json(res, 200, { ok: true });
          return;
        }
        if (u.pathname === '/hover' && Number.isFinite(x) && Number.isFinite(y)) { mouse(w, 'mouseMove', x, y); json(res, 200, { ok: true }); return; }
        // Typed from inside the page (execCommand), never webContents.insertText: that one makes Aang the active app and
        // takes his keyboard (seen 2026-10-28).
        if (u.pathname === '/type' && typeof b.text === 'string') { await w.webContents.executeJavaScript(`document.execCommand('insertText', false, ${JSON.stringify(b.text.slice(0, 2000))})`, true); json(res, 200, { ok: true }); return; }
      }
      json(res, 404, { error: 'unknown door' });
    } catch (e) { json(res, 500, { error: (e as Error).message }); }
  });
  srv.on('error', (e) => o.log('aang: the test door would not open: ' + (e as Error).message));
  srv.listen(TEST_DOOR_PORT, '127.0.0.1', () => o.log(`aang: test door on 127.0.0.1:${TEST_DOOR_PORT}`));
  return () => { try { srv.close(); } catch { /* gone */ } };
}
