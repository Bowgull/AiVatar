// A pretend Google TV for the tests (his rule, 2026-10-27: keep fixing Send to TV "but not testing on my current TV").
// It plays the TV's side of Google TV's remote service the way his TV did: pairing on one port (it shows a code, checks
// the secret, then remembers that certificate), the remote on another (only a linked certificate gets in), and it
// writes down every link and key it is sent. Asleep, it answers nothing.
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server, type TLSSocket } from 'node:tls';
import { dec, enc, frame, reader } from '../src/tvremote.ts';

const rsaHex = (c: X509Certificate) => { const j = c.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
  const h = (b: string) => Buffer.from(b, 'base64url').toString('hex').toUpperCase().replace(/^0+/, ''); return { n: h(j.n), e: h(j.e) }; };
const even = (h: string) => (h.length % 2 ? '0' + h : h);
const fp = (der: Buffer) => createHash('sha256').update(der).digest('hex');

export class FakeTv {
  /** The code on the TV's screen while pairing is open (6 hex characters), or null. */
  shownCode: string | null = null;
  /** What it was asked to do, in order. */
  links: string[] = [];
  keys: number[] = [];
  /** Asleep: it lets nobody in, as a TV in deep standby. */
  asleep = false;
  private linked = new Set<string>();
  private servers: Server[] = [];
  readonly cert: Buffer;
  readonly key: Buffer;
  remotePort = 0;
  pairPort = 0;
  constructor() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'faketv-'));
    execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-subj', '/CN=faketv'], { stdio: 'ignore' });
    this.cert = readFileSync(path.join(dir, 'c.pem')); this.key = readFileSync(path.join(dir, 'k.pem'));
  }
  async start(): Promise<this> {
    const opts = { cert: this.cert, key: this.key, requestCert: true, rejectUnauthorized: false };
    const pair = createServer(opts, (s) => this.pairing(s));
    const rem = createServer(opts, (s) => this.remote(s));
    for (const srv of [pair, rem]) await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    this.pairPort = (pair.address() as { port: number }).port; this.remotePort = (rem.address() as { port: number }).port;
    this.servers = [pair, rem];
    return this;
  }
  stop(): void { for (const s of this.servers) s.close(); }
  isLinked(certPem: Buffer): boolean { return this.linked.has(fp(new X509Certificate(certPem).raw)); }

  private pairing(s: TLSSocket): void {
    if (this.asleep) { s.destroy(); return; }
    const send = (f: Parameters<typeof enc>[0]) => s.write(frame(enc([[1, 2], [2, 200], ...f])));
    const peer = () => new X509Certificate(s.getPeerCertificate().raw);
    let expect: Buffer | null = null;
    s.on('data', reader((m) => {
      const o = dec(m);
      if (o.has(10)) send([[11, [[1, 'faketv']]]]);
      else if (o.has(20)) send([[20, [[1, [[1, 3], [2, 6]]], [3, 1]]]]);
      else if (o.has(30)) {
        // the code: four random characters, and two more that are the secret's first byte (so the remote can check)
        const last = randomBytes(2).toString('hex').toUpperCase();
        const me = rsaHex(peer()), tv = rsaHex(new X509Certificate(this.cert));
        const h = createHash('sha256');
        for (const part of [me.n, '0' + me.e, tv.n, '0' + tv.e]) h.update(Buffer.from(even(part), 'hex'));
        h.update(Buffer.from(last, 'hex'));
        expect = h.digest();
        this.shownCode = expect[0]!.toString(16).toUpperCase().padStart(2, '0') + last;
        send([[31, []]]);
      } else if (o.has(40)) {
        const got = dec(o.get(40) as Buffer).get(1);
        if (expect && Buffer.isBuffer(got) && got.equals(expect)) { this.linked.add(fp(s.getPeerCertificate().raw)); this.shownCode = null; send([[41, [[1, got]]]]); }
        else s.write(frame(enc([[1, 2], [2, 402]])));
      }
    }));
    s.on('error', () => {});
  }
  private remote(s: TLSSocket): void {
    if (this.asleep) { s.destroy(); return; }
    s.once('secure', () => {});
    // only a linked certificate gets in, as his TV did
    setImmediate(() => {
      const der = s.getPeerCertificate()?.raw;
      if (!der || !this.linked.has(fp(der))) { s.destroy(); return; }
      s.write(frame(enc([[1, [[1, 639], [2, [[1, 'faketv'], [2, 'Pretend']]]]]])));
    });
    s.on('data', reader((m) => {
      const o = dec(m);
      if (o.has(1)) s.write(frame(enc([[2, [[1, 622]]]])));
      else if (o.has(2)) s.write(frame(enc([[40, [[1, 1]]]])));
      else if (o.has(90)) { const l = dec(o.get(90) as Buffer).get(1); if (Buffer.isBuffer(l)) this.links.push(l.toString()); }
      else if (o.has(10)) { const k = dec(o.get(10) as Buffer).get(1); if (typeof k === 'number') this.keys.push(k); }
    }));
    s.on('error', () => {});
  }
}
