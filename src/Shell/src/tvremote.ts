// Sheet 99 (his pick, 2026-10-27: "use the TV and my connected accounts and have them open on the TV"): Google TV's own
// remote service, the one its phone remote uses (androidtvremote2's protocol, as Home Assistant speaks it). Samara links
// once with the code the TV shows, then asks the TV to open a link in its own signed-in app (YouTube with his Premium,
// Netflix, Prime, Stremio) and presses its keys. Tested on his TV that day; built against a pretend TV
// (test/faketv.ts) so his real one is never touched by the tests.
//
// The wire: TLS with Samara's own certificate (made once, kept in its folder), each message a varint length and one
// protobuf. Pairing on port 6467 (polo.proto), the remote on 6466 (remotemessage.proto). Only the fields used here.
import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { connect, type TLSSocket } from 'node:tls';

// ---- a little protobuf, enough for these messages
type F = [number, number | string | Buffer | F[]];
const vint = (n: number) => { const b: number[] = []; do { let x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; b.push(x); } while (n); return Buffer.from(b); };
export const enc = (fields: F[]): Buffer => Buffer.concat(fields.map(([no, v]) => {
  if (typeof v === 'number') return Buffer.concat([vint(no << 3), vint(v)]);
  const body = typeof v === 'string' ? Buffer.from(v) : Buffer.isBuffer(v) ? v : enc(v);
  return Buffer.concat([vint((no << 3) | 2), vint(body.length), body]);
}));
/** Field number to value (a number, or the bytes of a string or a message). The last of a repeated field wins. */
export const dec = (b: Buffer): Map<number, number | Buffer> => {
  const m = new Map<number, number | Buffer>(); let i = 0;
  const rv = () => { let n = 0, s = 1, c: number; do { c = b[i++]!; n += (c & 0x7f) * s; s *= 128; } while (c & 0x80 && i < b.length); return n; };
  while (i < b.length) { const k = rv(), no = Math.floor(k / 8), w = k & 7;
    if (w === 0) m.set(no, rv()); else if (w === 2) { const n = rv(); m.set(no, b.subarray(i, i + n)); i += n; } else break; }
  return m;
};
export const frame = (msg: Buffer) => Buffer.concat([vint(msg.length), msg]);
/** Reads whole messages out of a stream that may split or join them anywhere. */
export function reader(onMsg: (m: Buffer) => void): (c: Buffer) => void {
  let buf = Buffer.alloc(0);
  return (c) => {
    buf = Buffer.concat([buf, c]);
    for (;;) {
      let i = 0, n = 0, s = 1, x: number;
      do { if (i >= buf.length) return; x = buf[i++]!; n += (x & 0x7f) * s; s *= 128; } while (x & 0x80);
      if (buf.length < i + n) return;
      const m = buf.subarray(i, i + n); buf = buf.subarray(i + n); onMsg(m);
    }
  };
}
const sub = (m: Map<number, number | Buffer>, no: number) => { const v = m.get(no); return Buffer.isBuffer(v) ? dec(v) : null; };

// ---- the certificates, and the pairing secret
const hexOf = (b64: string) => Buffer.from(b64, 'base64url').toString('hex').toUpperCase().replace(/^0+/, '');
const even = (h: string) => (h.length % 2 ? '0' + h : h);
const rsaOf = (c: X509Certificate) => { const j = c.publicKey.export({ format: 'jwk' }) as { n: string; e: string }; return { n: hexOf(j.n), e: hexOf(j.e) }; };
/**
 * The secret both sides compute from the two certificates and the code on the TV: SHA-256 over the client's modulus and
 * exponent, the TV's, and the code's last four characters. The code's first two are the hash's first byte, so a typo is
 * caught here before anything is sent. Null when the code does not match.
 */
export function pairingSecret(clientPem: Buffer | string, tvDer: Buffer, code: string): Buffer | null {
  const c = String(code).trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(c)) return null;
  const me = rsaOf(new X509Certificate(clientPem)), tv = rsaOf(new X509Certificate(tvDer));
  const h = createHash('sha256');
  for (const part of [me.n, '0' + me.e, tv.n, '0' + tv.e]) h.update(Buffer.from(even(part), 'hex'));
  h.update(Buffer.from(c.slice(2), 'hex'));
  const d = h.digest();
  return d[0] === parseInt(c.slice(0, 2), 16) ? d : null;
}
/** Samara's own certificate for its TV, made once in its folder (the TV remembers it once linked). */
export function ensureCert(dir: string): { cert: Buffer; key: Buffer } {
  const certFile = path.join(dir, 'tv-remote-cert.pem'), keyFile = path.join(dir, 'tv-remote-key.pem');
  if (!existsSync(certFile) || !existsSync(keyFile)) {
    execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=Samara'], { stdio: 'ignore' });
  }
  return { cert: readFileSync(certFile), key: readFileSync(keyFile) };
}

// ---- the keys Samara presses (Android key codes)
export const KEY = { HOME: 3, OK: 23, POWER: 26, PAUSE: 127, WAKEUP: 224 } as const;

export interface TvTarget { host: string; port?: number; pairPort?: number; cert: Buffer; key: Buffer }
const OK = 200;

/**
 * Linking, step one: the TV shows its code. Resolves once the TV is showing it, with `finish(code)` for the code he
 * types, which resolves when the TV has accepted Samara. Rejects if the TV refuses or does not answer.
 */
export function startPairing(t: TvTarget, name = 'Samara', ms = 10_000): Promise<{ finish: (code: string) => Promise<void>; close: () => void }> {
  return new Promise((res, rej) => {
    const s = connect({ host: t.host, port: t.pairPort ?? 6467, cert: t.cert, key: t.key, rejectUnauthorized: false });
    let step = 0, done: ((e?: Error) => void) | null = null;
    const fail = (e: Error) => { clearTimeout(tm); s.destroy(); if (done) done(e); else rej(e); };
    const tm = setTimeout(() => fail(new Error('the TV did not answer')), ms);
    const send = (f: F[]) => s.write(frame(enc([[1, 2], [2, OK], ...f])));
    s.once('secureConnect', () => send([[10, [[1, 'atvremote'], [2, name]]]]));
    s.on('error', (e) => fail(e));
    s.on('data', reader((m) => {
      const o = dec(m);
      if (o.get(2) !== OK) { fail(new Error(o.get(2) === 402 ? 'that code did not match' : 'the TV said no')); return; }
      if (step === 0 && o.has(11)) { step = 1; send([[20, [[1, [[1, 3], [2, 6]]], [3, 1]]]]); }
      else if (step === 1 && o.has(20)) { step = 2; send([[30, [[1, [[1, 3], [2, 6]]], [2, 1]]]]); }
      else if (step === 2 && o.has(31)) {
        step = 3; clearTimeout(tm);
        res({
          close: () => s.destroy(),
          finish: (code) => new Promise<void>((ok, no) => {
            const secret = pairingSecret(t.cert, (s as TLSSocket).getPeerCertificate().raw, code);
            if (!secret) { no(new Error('that code does not look right')); return; }
            done = (e) => (e ? no(e) : ok());
            setTimeout(() => done?.(new Error('the TV did not answer')), ms);
            send([[40, [[1, secret]]]]);
          }),
        });
      } else if (step === 3 && o.has(41)) { s.end(); done?.(); done = null; }
    }));
  });
}

/** What to do once the remote is ready: open a link, press keys, each after a pause (ms from the start). */
export type TvStep = { link: string; at?: number } | { key: number; at?: number };

/**
 * Connect to the remote service and run the steps. Resolves when all are sent; rejects if the TV is not reachable or
 * has not linked Samara (an unlinked certificate is turned away at the door).
 */
export function remote(t: TvTarget, steps: TvStep[], ms = 8000): Promise<void> {
  return new Promise((res, rej) => {
    const s = connect({ host: t.host, port: t.port ?? 6466, cert: t.cert, key: t.key, rejectUnauthorized: false });
    let ready = false, finished = false;
    const end = (e?: Error) => { if (finished) return; finished = true; clearTimeout(tm); s.end(); setTimeout(() => s.destroy(), 300); if (e) rej(e); else res(); };
    const tm = setTimeout(() => end(new Error('the TV did not answer')), ms + steps.reduce((a, x) => Math.max(a, x.at ?? 0), 0));
    const send = (f: F[]) => { if (!s.destroyed) s.write(frame(enc(f))); };
    const go = () => {
      if (ready) return; ready = true;
      let last = 0;
      for (const st of steps) {
        const at = st.at ?? 0; last = Math.max(last, at);
        setTimeout(() => { if ('link' in st) send([[90, [[1, st.link]]]]); else send([[10, [[1, st.key], [2, 3]]]]); }, at);
      }
      setTimeout(() => end(), last + 400);
    };
    s.on('error', (e) => end(e));
    s.on('close', () => { if (!ready) end(new Error('the TV turned Samara away')); });
    s.on('data', reader((m) => {
      const o = dec(m);
      const conf = sub(o, 1);
      if (conf) {
        // the TV's features, as a bitmask: Samara asks for ping, keys, power, volume and app links (611), as offered
        const feat = 611 & Number(conf.get(1) ?? 0);
        send([[1, [[1, feat], [2, [[3, 1], [4, '1'], [5, 'atvremote'], [6, '1.0.0']]]]]]);
      } else if (o.has(2)) { send([[2, [[1, 611]]]]); setTimeout(go, 1200); }
      else if (o.has(8)) { send([[9, [[1, Number(sub(o, 8)?.get(1) ?? 0)]]]]); }
      else if (o.has(40)) go();
    }));
  });
}
