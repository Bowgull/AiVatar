// A fake Omashu laptop: Couch Mode's side of the phone remote, exactly as the contract in the omashu repo
// (reports/phone-remote-contract.md) says, so the remote can be built and tested without touching the real laptop.
// It sleeps (no answer at all) until a Wake-on-LAN packet for its MAC address reaches its UDP port.
//
// Run on its own for a look in a browser: node --no-warnings test/omashu-dev.ts
import http from 'node:http';
import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

/** The contract's allow-list, copied as text (not imported) so a drift between the two sides fails a test. */
const ALLOW = [
  String.raw`^/(s|g|p) (?!/)[^|\r\n\x00-\x1f]{1,255}$`,
  String.raw`^/[1-9] (?!/)[^|\r\n\x00-\x1f]{1,255}$`,
  String.raw`^/w [^\s/|\\]{2,24} [^\s/|\\]{2,24} (?!/)[^|\r\n\x00-\x1f]{1,255}$`,
  String.raw`^/(invite|friend|ignore|who) [^\s/|\\]{2,24}( [^\s/|\\]{2,24})?$`,
  String.raw`^/roll$`,
  String.raw`^/(wave|hello|cheer|thank|bow|dance|laugh|hug|salute|welcome|applaud|clap|congratulate|bye|kneel|chicken|flex|train|silly|roar|violin|rofl|flirt|ready|followme|charge|wait|oom|healme|helpme|incoming|cry|sigh|shrug|yawn|sleep|cower|blush|sad|rude|spit|taunt|threaten|gloat|mock|moon|fart)( [^\s/|\\]{2,24}( [^\s/|\\]{2,24})?)?$`,
].map(s => new RegExp(s));

export interface FakeOpts { key: string; mac: string; me?: string; wakeDelayMs?: number; host?: string }

export class FakeLaptop {
  awake = false;
  game: 'zelda' | 'wow' | null = null;
  session: string | null = null;
  lines: { seq: number; raw: string }[] = [];
  seq = 0;
  /** What Couch Mode typed into WoW. */
  typed: string[] = [];
  powerPosts = 0;
  /** The real /chat/send answers about 1.5 s late (it closes WoW's controller chat box first). */
  sendDelayMs = 0;
  wakePackets = 0;
  port = 0;
  udpPort = 0;
  private http: http.Server | null = null;
  private udp: dgram.Socket | null = null;
  private o: FakeOpts;
  constructor(o: FakeOpts) { this.o = o; }

  async start(): Promise<void> {
    const host = this.o.host ?? '127.0.0.1';
    this.http = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>(r => this.http!.listen(0, host, () => r()));
    this.port = (this.http.address() as { port: number }).port;
    this.udp = dgram.createSocket('udp4');
    this.udp.on('message', m => this.packet(m));
    await new Promise<void>(r => this.udp!.bind(0, host, () => r()));
    this.udpPort = this.udp.address().port;
  }
  async stop(): Promise<void> {
    this.udp?.close();
    this.http?.closeAllConnections();
    await new Promise<void>(r => this.http ? this.http.close(() => r()) : r());
  }
  get url() { return `http://127.0.0.1:${this.port}`; }

  private packet(m: Buffer) {
    const mac = Buffer.from(this.o.mac.replace(/[:-]/g, ''), 'hex');
    const good = m.length === 102 && m.subarray(0, 6).every(b => b === 0xff) && Array.from({ length: 16 }, (_, i) => m.subarray(6 + i * 6, 12 + i * 6).equals(mac)).every(Boolean);
    if (!good) return;
    this.wakePackets++;
    setTimeout(() => { this.awake = true; }, this.o.wakeDelayMs ?? 0);
  }

  // ---------- the game, for tests and the dev page ----------
  startWow() { this.awake = true; this.game = 'wow'; this.session = randomBytes(4).toString('hex'); this.lines = []; this.seq = 0; }
  stopWow() { this.game = null; this.session = null; this.lines = []; this.seq = 0; }
  /** A line as Couch Mode serves it (WoWChatLog.txt's format, link codes kept, "MM/DD" with leading zeros). */
  log(body: string, at = new Date()) {
    if (!this.session) return;
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    this.lines.push({ seq: ++this.seq, raw: `${p(at.getMonth() + 1)}/${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}:${p(at.getSeconds())}.${p(at.getMilliseconds(), 3)}  ${body}` });
    if (this.lines.length > 1000) this.lines.shift();
  }
  /** What WoW would echo into the log after a line is typed. */
  private echo(line: string) {
    const me = this.o.me ?? 'Josh', m = line.match(/^\/(\S+)\s?(.*)$/)!;
    const [cmd, rest] = [m[1], m[2]];
    if (cmd === 's') this.log(`${me} says: ${rest}`);
    else if (cmd === 'g') this.log(`[Guild] ${me}: ${rest}`);
    else if (cmd === 'p') this.log(`[Party] ${me}: ${rest}`);
    else if (/^\d$/.test(cmd)) this.log(`[${cmd}. ${cmd === '1' ? 'General - Elwynn Forest' : cmd === '2' ? 'Trade - City' : 'LookingForGroup'}] ${me}: ${rest}`);
    else if (cmd === 'w') { const [a, b, ...t] = rest.split(' '); this.log(`To ${a} ${b}: ${t.join(' ')}`); }
    else if (cmd === 'who') this.log(`${rest}: Level 13 Human Mage - Elwynn Forest`);
    else if (cmd === 'roll') this.log(`${me} rolls ${1 + Math.floor(Math.random() * 100)} (1-100)`);
    else if (cmd === 'invite') this.log(`You have invited ${rest} to join your group.`);
    else if (cmd === 'friend') this.log(`${rest} added to friends.`);
    else if (cmd === 'ignore') this.log(`${rest} is now being ignored.`);
    else this.log(rest ? `You ${cmd} at ${rest}.` : `You ${cmd}.`);           // an emote, roughly as WoW words it
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // Asleep: nothing answers, as with the real laptop.
    if (!this.awake) { req.socket.destroy(); return; }
    if (req.headers['x-omashu-key'] !== this.o.key) { res.writeHead(403).end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const j = (code: number, v: unknown) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
    if (req.method === 'GET' && url.pathname === '/state') { j(200, { up: this.game !== null, mode: this.game ? 'hide' : 'show', n: 1, game: this.game }); return; }
    if (req.method === 'POST' && url.pathname === '/power') {
      this.powerPosts++;
      res.writeHead(200).end('ok');
      setTimeout(() => { this.stopWow(); this.awake = false; }, 20);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/chat') {
      if (!this.session) { j(200, { session: null, seq: 0, lines: [] }); return; }
      const after = Number(url.searchParams.get('after')) || 0;
      j(200, { session: this.session, seq: this.seq, lines: this.lines.filter(l => l.seq > after).slice(0, 500) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/chat/send') {
      let b = '';
      req.on('data', d => { b += d; });
      req.on('end', () => {
        let line = '';
        try { line = String(JSON.parse(b).line ?? ''); } catch { /* refused below */ }
        if (line.length > 255 || !ALLOW.some(r => r.test(line))) { j(400, { ok: false, why: 'refused' }); return; }
        if (this.game !== 'wow') { j(409, { ok: false, why: 'not-in-wow' }); return; }
        this.typed.push(line);
        this.echo(line);
        setTimeout(() => j(200, { ok: true }), this.sendDelayMs);
      });
      return;
    }
    res.writeHead(404).end();
  }
}
