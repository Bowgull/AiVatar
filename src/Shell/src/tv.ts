// Sheet 89 (his ask, 2026-10-25: "put things on my TV from time to time"): his TV, found on the home network, and the
// video sent to it over Google Cast (his Hisense "yeet" answers it). Samara only talks to the TV when he chooses Send to
// TV; it never looks for it or wakes it by itself.
//
// Google Cast's own wire, kept small: a TLS socket to the TV (port 8009), each message a 4-byte length and one protobuf
// CastMessage with JSON inside. Connect, launch the TV's default media player (or YouTube), load the video, and then
// play, pause, stop and ask where it is.
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export interface CastTv { name: string; host: string; port: number }

/**
 * The Cast devices on the home network, by their friendly name, from the Mac's own Bonjour (dns-sd). Run through
 * script(1) so dns-sd writes each answer as it comes (into a plain pipe it holds them back, and stops without a word).
 */
const run = (args: string[], waitMs: number, until?: RegExp) => new Promise<string>((res) => {
    let out = '';
    const p = spawn('/usr/bin/script', ['-q', '/dev/null', '/usr/bin/dns-sd', ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
    const done = () => { try { p.kill(); } catch { /* gone */ } res(out); };
    p.stdout.on('data', (c) => { out += String(c); if (until?.test(out)) done(); });
    p.on('error', done);
    setTimeout(done, waitMs);
  });
export async function findTvs(waitMs = 2500): Promise<CastTv[]> {
  if (process.platform !== 'darwin') return [];
  const browse = await run(['-B', '_googlecast._tcp', 'local.'], waitMs);
  const ids = [...new Set([...browse.matchAll(/_googlecast\._tcp\.\s+(\S+)\s*$/gm)].map((m) => m[1]!))].slice(0, 6);
  const out: CastTv[] = [];
  for (const id of ids) {
    const info = await run(['-L', id, '_googlecast._tcp', 'local.'], waitMs, /can be reached at[\s\S]*fn=/);
    const at = /can be reached at (\S+?)\.?:(\d+)/.exec(info);
    const fn = /\bfn=((?:\\.|[^ \r\n])+)/.exec(info);
    if (!at) continue;
    let host = at[1]!;
    try { host = (await lookup(host, { family: 4 })).address; } catch { /* keep the .local name */ }
    out.push({ name: (fn?.[1] ?? id).replace(/\\(.)/g, '$1'), host, port: Number(at[2]) || 8009 });
  }
  return out;
}

/** The AirPlay screens on the home network, by name (his TV answers as "yeet"): to know which Mac display it is. */
export async function airplayNames(waitMs = 2500): Promise<string[]> {
  if (process.platform !== 'darwin') return [];
  const out = await run(['-B', '_airplay._tcp', 'local.'], waitMs);
  return [...new Set([...out.matchAll(/_airplay\._tcp\.\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim()))].slice(0, 10);
}

// ---- protobuf, only the six fields of CastMessage (cast_channel.proto)
const varint = (n: number) => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return Buffer.from(b); };
const field = (no: number, wire: number, body: Buffer) => Buffer.concat([varint((no << 3) | wire), body]);
const str = (no: number, s: string) => { const v = Buffer.from(s, 'utf8'); return field(no, 2, Buffer.concat([varint(v.length), v])); };
/** One CastMessage: protocol v2.1.0 (0), source, destination, namespace, a JSON payload (payload_type STRING = 0). */
export function encodeCast(source: string, dest: string, ns: string, payload: object): Buffer {
  const msg = Buffer.concat([field(1, 0, varint(0)), str(2, source), str(3, dest), str(4, ns), field(5, 0, varint(0)), str(6, JSON.stringify(payload))]);
  const len = Buffer.alloc(4); len.writeUInt32BE(msg.length);
  return Buffer.concat([len, msg]);
}
/** The fields of one CastMessage (without its length), or null when it is not one. */
export function decodeCast(b: Buffer): { source: string; dest: string; ns: string; data: Record<string, unknown> | null } | null {
  let i = 0;
  const rv = () => { let n = 0, s = 0, c = 0; do { c = b[i++]!; n |= (c & 0x7f) << s; s += 7; } while (c & 0x80 && i < b.length); return n >>> 0; };
  const f: Record<number, string> = {};
  try {
    while (i < b.length) {
      const k = rv(), no = k >> 3, wire = k & 7;
      if (wire === 0) rv();
      else if (wire === 2) { const n = rv(); f[no] = b.subarray(i, i + n).toString('utf8'); i += n; }
      else return null;
    }
  } catch { return null; }
  let data: Record<string, unknown> | null = null;
  try { data = f[6] ? JSON.parse(f[6]) : null; } catch { data = null; }
  return { source: f[2] ?? '', dest: f[3] ?? '', ns: f[4] ?? '', data };
}

const NS = {
  conn: 'urn:x-cast:com.google.cast.tp.connection',
  beat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  recv: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
};
/** The TV's own player for plain video (Google's Default Media Receiver). */
export const DEFAULT_PLAYER = 'CC1AD845';

/** What goes to the TV: a video address it can fetch itself, and how to say it. */
export interface CastMedia { url: string; type: string; live: boolean; title: string; at?: number; poster?: string }

/** One session with the TV: launch its player, load a video, control it. Closed when done. */
export class CastSession extends EventEmitter {
  private sock: TLSSocket | null = null;
  private buf = Buffer.alloc(0);
  private seq = 1;
  private waits = new Map<number, (d: Record<string, unknown>) => void>();
  private beat: NodeJS.Timeout | null = null;
  private transport = '';
  private sessionId = '';
  mediaId = 0;
  /** Where the video is, in seconds, as the TV last said. */
  at = 0;
  playing = false;
  readonly tv: CastTv;
  constructor(tv: CastTv) { super(); this.tv = tv; }

  private send(dest: string, ns: string, payload: object): void { this.sock?.write(encodeCast('sender-0', dest, ns, payload)); }
  private ask(dest: string, ns: string, payload: Record<string, unknown>, ms = 15_000): Promise<Record<string, unknown>> {
    const requestId = this.seq++;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.waits.delete(requestId); rej(new Error('the TV did not answer')); }, ms);
      this.waits.set(requestId, (d) => { clearTimeout(t); res(d); });
      this.send(dest, ns, { ...payload, requestId });
    });
  }
  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 4) {
      const n = this.buf.readUInt32BE(0);
      if (n > 1_000_000) { this.close(); return; }
      if (this.buf.length < 4 + n) return;
      const m = decodeCast(this.buf.subarray(4, 4 + n));
      this.buf = this.buf.subarray(4 + n);
      if (!m?.data) continue;
      const d = m.data;
      if (m.ns === NS.beat && d.type === 'PING') { this.send(m.source, NS.beat, { type: 'PONG' }); continue; }
      if (m.ns === NS.conn && d.type === 'CLOSE') { this.emit('ended'); this.close(); continue; }
      if (m.ns === NS.media && d.type === 'MEDIA_STATUS') {
        const st = (Array.isArray(d.status) ? d.status[0] : null) as Record<string, unknown> | null;
        if (st) {
          if (Number.isFinite(st.currentTime)) this.at = Number(st.currentTime);
          if (st.mediaSessionId) this.mediaId = Number(st.mediaSessionId);
          this.playing = st.playerState === 'PLAYING' || st.playerState === 'BUFFERING';
          if (st.playerState === 'IDLE' && st.idleReason === 'FINISHED') this.emit('ended');
          this.emit('status', st);
        }
      }
      if (m.ns !== NS.beat && m.ns !== NS.conn && m.ns !== NS.media && m.ns !== NS.recv) this.emit('app', m.ns, d);
      const id = Number(d.requestId);
      if (id && this.waits.has(id)) { const w = this.waits.get(id)!; this.waits.delete(id); w(d); }
    }
  }
  /** Connect and start an app on the TV (its default player unless told), ready to load. */
  async open(appId = DEFAULT_PLAYER): Promise<void> {
    await new Promise<void>((res, rej) => {
      const s = tlsConnect({ host: this.tv.host, port: this.tv.port, rejectUnauthorized: false, timeout: 8000 }, () => res());
      s.once('error', rej);
      s.on('data', (c) => this.onData(c));
      s.on('close', () => { this.emit('ended'); this.stopBeat(); });
      this.sock = s;
    });
    this.send('receiver-0', NS.conn, { type: 'CONNECT' });
    this.beat = setInterval(() => this.send('receiver-0', NS.beat, { type: 'PING' }), 5000);
    const st = await this.ask('receiver-0', NS.recv, { type: 'LAUNCH', appId });
    const apps = ((st.status as Record<string, unknown>)?.applications ?? []) as Record<string, unknown>[];
    const a = apps.find((x) => x.appId === appId);
    if (!a) throw new Error('the TV did not start its player');
    this.transport = String(a.transportId); this.sessionId = String(a.sessionId);
    this.send(this.transport, NS.conn, { type: 'CONNECT' });
  }
  /** Load a video into the TV's player, paused where he was (his TV remote plays and pauses it from then on). */
  async load(m: CastMedia): Promise<void> {
    const st = await this.ask(this.transport, NS.media, {
      // His rule (2026-10-25): it arrives paused and waits for him (his TV remote plays it).
      type: 'LOAD', autoplay: false, currentTime: Math.max(0, m.at ?? 0),
      media: { contentId: m.url, contentType: m.type, streamType: m.live ? 'LIVE' : 'BUFFERED',
        metadata: { metadataType: 0, title: m.title, ...(m.poster ? { images: [{ url: m.poster }] } : {}) } },
    }, 30_000);
    if (st.type === 'LOAD_FAILED' || st.type === 'INVALID_REQUEST') throw new Error('the TV could not play it');
  }
  /** Send a message on an app's own channel (YouTube's), after open(appId). */
  appSend(ns: string, payload: object): void { this.send(this.transport, ns, payload); }
  async where(): Promise<number> {
    if (!this.mediaId) return this.at;
    try { await this.ask(this.transport, NS.media, { type: 'GET_STATUS', mediaSessionId: this.mediaId }, 4000); } catch { /* the last known */ }
    return this.at;
  }
  pause(): void { if (this.mediaId) this.send(this.transport, NS.media, { type: 'PAUSE', mediaSessionId: this.mediaId, requestId: this.seq++ }); }
  play(): void { if (this.mediaId) this.send(this.transport, NS.media, { type: 'PLAY', mediaSessionId: this.mediaId, requestId: this.seq++ }); }
  /** Stop the player on the TV and let go of it. */
  stop(): void {
    try { if (this.sessionId) this.send('receiver-0', NS.recv, { type: 'STOP', sessionId: this.sessionId, requestId: this.seq++ }); } catch { /* gone */ }
    setTimeout(() => this.close(), 300);
  }
  private stopBeat(): void { if (this.beat) clearInterval(this.beat); this.beat = null; }
  close(): void { this.stopBeat(); try { this.sock?.destroy(); } catch { /* gone */ } this.sock = null; }
}
