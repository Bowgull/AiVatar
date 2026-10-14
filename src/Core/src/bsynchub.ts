// M6 (2026-10-13): the brain passes browser changes between his two machines: the PC's browser (the Shell, on this
// PC's own socket) and the Mac's (over Tailscale, here). It only passes them on. Nothing is written down here, and
// nothing in them is read: logins included, they never touch a disk on the way.
//
// Only the Mac's exact Tailscale address, with the browser-sync key, may connect; never a web page (no Origin).
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };

export interface HubOpts {
  key: () => string | null;
  macAddr: () => string | null;
  /** to the PC's browser (the Shell) */
  toShell: (m: Record<string, unknown>) => void;
  shellUp: () => boolean;
  log?: (s: string) => void;
  /** The update key (2026-10-14): the Mac said which version it runs, or asked for the update. */
  onUpdate?: (m: Record<string, unknown>, reply: (r: Record<string, unknown>) => void) => void;
}

export class BrowserSyncHub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  private mac: WebSocket | null = null;
  private readonly o: HubOpts;
  constructor(o: HubOpts) { this.o = o; }
  private log(s: string) { (this.o.log ?? console.log)(s); }

  /** An upgrade on the hook port. Only /bsync, only from the Mac, only with the key. */
  upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const peer = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const key = this.o.key(), mac = this.o.macAddr();
    const ok = req.url === '/bsync' && !req.headers.origin && !!key && !!mac && peer === mac && same(String(req.headers['x-aang-key'] ?? ''), key);
    if (!ok) { this.log(`browser sync: refused a connection from ${peer}`); socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    this.wss.handleUpgrade(req, socket, head, ws => this.onMac(ws));
  }

  private onMac(ws: WebSocket): void {
    if (this.mac && this.mac !== ws) { try { this.mac.close(); } catch { /* gone */ } }
    this.mac = ws;
    this.log('browser sync: the Mac\'s browser connected');
    ws.on('message', raw => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      // "Send to PC" from the Mac's browser: it plays in this PC's pop-out. Web addresses only.
      if (m?.t === 'watch.topc') { const u = String(m.url ?? ''); if (/^https?:\/\//.test(u) && u.length < 4000 && this.o.shellUp()) this.o.toShell({ t: 'popout.open', url: u }); return; }
      // "Open on PC" from the Mac's browser: a full tab in this PC's browser.
      if (m?.t === 'open.onpc') { const u = String(m.url ?? ''); if (/^https?:\/\//.test(u) && u.length < 4000 && this.o.shellUp()) this.o.toShell({ t: 'browser.open', url: u }); return; }
      if ((m?.t === 'update.have' || m?.t === 'update.get' || m?.t === 'update.report') && this.o.onUpdate) { this.o.onUpdate(m, r => this.toMac(r)); return; }
      if (m?.t === 'diag.reply') { const w = this.looks.get(String(m.id)); if (w) { this.looks.delete(String(m.id)); w(m); } return; }
      if (m && typeof m.t === 'string' && m.t.startsWith('bsync.') && this.o.shellUp()) this.o.toShell(m);
    });
    ws.on('close', () => { if (this.mac === ws) { this.mac = null; if (this.o.shellUp()) this.o.toShell({ t: 'bsync.down' }); } });
    ws.on('error', () => { /* close follows */ });
    if (this.o.shellUp()) this.hello();
  }

  /** Both browsers are there: each sends everything, so they catch up. */
  private hello(): void { this.toMac({ t: 'bsync.hello' }); this.o.toShell({ t: 'bsync.hello' }); }
  private toMac(m: unknown): void { if (this.mac && this.mac.readyState === this.mac.OPEN) this.mac.send(JSON.stringify(m)); }

  /** From the PC's browser. */
  fromShell(m: Record<string, unknown>): void { this.toMac(m); }
  /** The PC's browser came up or went away. */
  shellChanged(up: boolean): void {
    if (!this.mac) return;
    if (up) this.hello(); else this.toMac({ t: 'bsync.down' });
  }
  get macConnected(): boolean { return !!this.mac; }
  /** To the Mac's browser, if it is there (the update key's offers). */
  tellMac(m: Record<string, unknown>): void { this.toMac(m); }
  /** "Open on Mac": a full tab in the Mac's browser, if it is running. False: it is not. */
  openOnMac(url: string): boolean { if (!this.mac || this.mac.readyState !== this.mac.OPEN) return false; this.toMac({ t: 'tab.open', url }); return true; }
  /** "Send to Mac": into the Mac browser's pop-out, if it is running. False: it is not. */
  sendToMac(url: string): boolean { if (!this.mac || this.mac.readyState !== this.mac.OPEN) return false; this.toMac({ t: 'watch.open', url }); return true; }

  /** His yes (2026-10-13): a picture of the Mac browser's own window and its log, for Claude to check a fix. */
  private looks = new Map<string, (m: any) => void>(); private lookSeq = 0;
  look(): Promise<any | null> {
    if (!this.mac) return Promise.resolve(null);
    const id = 'look' + ++this.lookSeq;
    return new Promise(res => {
      const t = setTimeout(() => { this.looks.delete(id); res(null); }, 15_000);
      this.looks.set(id, m => { clearTimeout(t); res(m); });
      this.toMac({ t: 'diag.ask', id });
    });
  }
  close(): void { try { this.mac?.close(); } catch { /* gone */ } this.wss.close(); }
}
