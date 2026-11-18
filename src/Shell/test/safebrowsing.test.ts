// Google Safe Browsing, private mode (2026-11-17, his yes): expressions as Google's "URLs and Hashing" spells them,
// the Rice-Golomb lists, list updates checked by their checksum, and the check itself: nothing goes out without a
// key, only 4-byte prefixes ever go out, and only a full-fingerprint match from Google blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SafeBrowsing, applyUpdate, canonical, checksumOf, expressions, fullHash, prefixNum, riceDecode32 } from '../src/safebrowsing.ts';

test("Google's worked example: eight expressions for a.b.com/1/2.html?param=1", () => {
  assert.deepEqual(new Set(expressions('http://a.b.com/1/2.html?param=1')), new Set([
    'a.b.com/1/2.html?param=1', 'a.b.com/1/2.html', 'a.b.com/', 'a.b.com/1/',
    'b.com/1/2.html?param=1', 'b.com/1/2.html', 'b.com/', 'b.com/1/',
  ]));
});

test('long hosts: the exact one plus the registrable domain and three more, never b.c.d.e.f.com', () => {
  const hosts = new Set(expressions('http://a.b.c.d.e.f.com/1.html').map((e) => e.split('/')[0]));
  assert.deepEqual(hosts, new Set(['a.b.c.d.e.f.com', 'f.com', 'e.f.com', 'd.e.f.com', 'c.d.e.f.com']));
});

test('an IP address is only itself, in any notation', () => {
  assert.deepEqual(new Set(expressions('http://1.2.3.4/1/').map((e) => e.split('/')[0])), new Set(['1.2.3.4']));
  assert.equal(canonical('http://0x7f.1/')?.host, '127.0.0.1');
  assert.equal(canonical('http://[::ffff:1.2.3.4]/')?.host, '1.2.3.4');
});

test('canonical form: fragment gone, escapes undone then redone, dots and slashes tidied', () => {
  assert.deepEqual(canonical('http://www.GOOgle.com/#frag'), { host: 'www.google.com', path: '/', query: null });
  assert.equal(canonical('http://host/%25%32%35')?.path, '/%25');
  assert.equal(canonical('http://host//a//b/./c/../d')?.path, '/a/b/d');
  assert.equal(canonical('http://www.google.com/q?r?')?.query, 'r?');
  assert.equal(canonical('http://host/a b')?.path, '/a%20b');
  assert.equal(canonical('ftp://host/'), null);
  assert.deepEqual(expressions('file:///C:/x'), []);
});

/** Rice-Golomb the way Google writes it: least significant bit first, quotient in unary ended by 0, k remainder bits. */
function riceEncode(values: number[], k: number): { firstValue: number; riceParameter: number; entriesCount: number; encodedData: string } {
  const bits: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const q = Math.floor(d / 2 ** k), r = d % 2 ** k;
    for (let j = 0; j < q; j++) bits.push(1);
    bits.push(0);
    for (let j = 0; j < k; j++) bits.push((r >> j) & 1);
  }
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => { if (b) bytes[i >> 3]! |= 1 << (i & 7); });
  return { firstValue: values[0]!, riceParameter: k, entriesCount: values.length - 1, encodedData: bytes.toString('base64') };
}

test("Rice-Golomb: Google's [1, 5, 7, 13] example, and a large list round-trips", () => {
  assert.deepEqual(riceDecode32(riceEncode([1, 5, 7, 13], 2)), [1, 5, 7, 13]);
  assert.deepEqual(riceDecode32({ firstValue: 42 }), [42]);
  assert.deepEqual(riceDecode32(undefined), []);
  const big = [...new Set(Array.from({ length: 5000 }, (_, i) => (i * 2654435761) >>> 0))].sort((a, b) => a - b);
  assert.deepEqual(riceDecode32(riceEncode(big, 20)), big);
});

const prefixesOf = (urls: string[]) => [...new Set(urls.flatMap((u) => expressions(u)).map((e) => prefixNum(fullHash(e))))].sort((a, b) => a - b);
const swap = (v: number) => Buffer.from(Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24)).readUInt32BE(0);

test('a full list in either byte order is told apart by its checksum; a partial update removes then adds', () => {
  const want = prefixesOf(['http://evil.example/login', 'http://bad.test/']);
  const sorted = Uint32Array.from(want);
  const be = applyUpdate(new Uint32Array(0), { name: 'se-4b', additionsFourBytes: riceEncode(want, 10), sha256Checksum: checksumOf(sorted) }, '');
  assert.equal(be.order, 'be'); assert.deepEqual([...be.list], want);
  const asLe = want.map(swap).sort((a, b) => a - b);
  const le = applyUpdate(new Uint32Array(0), { name: 'se-4b', additionsFourBytes: riceEncode(asLe, 10), sha256Checksum: checksumOf(sorted) }, '');
  assert.equal(le.order, 'le'); assert.deepEqual([...le.list], want);
  // Partial: drop index 0, add one new prefix.
  const extra = 0x01020304;
  const after = Uint32Array.from([...want.slice(1), extra].sort((a, b) => a - b));
  const p = applyUpdate(be.list, { name: 'se-4b', partialUpdate: true, compressedRemovals: riceEncode([0], 1), additionsFourBytes: { firstValue: extra }, sha256Checksum: checksumOf(after) }, 'be');
  assert.deepEqual([...p.list], [...after]);
  assert.throws(() => applyUpdate(be.list, { name: 'se-4b', partialUpdate: true, additionsFourBytes: { firstValue: 7 }, sha256Checksum: 'wrong' }, 'be'), /checksum/);
});

const BAD = 'http://phish.example.net/login?u=1';
function google(opts: { listed: string[]; threats: Record<string, { threatType: string; attributes?: string[] }[]> }) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    if (url.includes('hashLists:batchGet')) {
      const want = prefixesOf(opts.listed);
      return { ok: true, status: 200, json: async () => ({ hashLists: ['se-4b', 'mw-4b', 'uws-4b'].map((name) => ({
        name, version: 'djE=', minimumWaitDuration: '1800s',
        ...(name === 'se-4b' && want.length ? { additionsFourBytes: riceEncode(want, 12), sha256Checksum: checksumOf(Uint32Array.from(want)) } : { sha256Checksum: checksumOf(new Uint32Array(0)) }),
      })) }) };
    }
    const asked = new URL(url).searchParams.getAll('hashPrefixes');
    const fullHashes = Object.entries(opts.threats)
      .map(([expr, details]) => ({ fullHash: fullHash(expr).toString('base64'), fullHashDetails: details }))
      .filter((f) => asked.includes(Buffer.from(f.fullHash, 'base64').subarray(0, 4).toString('base64')));
    return { ok: true, status: 200, json: async () => ({ fullHashes, cacheDuration: '300s' }) };
  };
  return { calls, fetcher };
}
function sbWith(g: ReturnType<typeof google>, key: string | null) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sb-'));
  if (key) writeFileSync(path.join(dir, 'safebrowsing-key.txt'), key);
  return new SafeBrowsing(dir, g.fetcher as never);
}

test('no key: nothing is ever sent, nothing is suspect', async () => {
  const g = google({ listed: [BAD], threats: {} });
  const sb = sbWith(g, null);
  await sb.update(true);
  assert.equal(sb.suspect(BAD), false);
  assert.deepEqual(await sb.verdict(BAD), []);
  assert.deepEqual(g.calls, []);
});

test('a listed page is asked about by its 4-byte prefix only, blocked on a full match, then known without asking', async () => {
  const g = google({ listed: [BAD], threats: { 'phish.example.net/login': [{ threatType: 'SOCIAL_ENGINEERING' }] } });
  const sb = sbWith(g, 'k');
  await sb.update(true);
  assert.equal(sb.suspect('http://fine.example.org/'), false);
  assert.equal(sb.suspect(BAD), true);
  assert.deepEqual(await sb.verdict(BAD), ['SOCIAL_ENGINEERING']);
  const ask = g.calls.find((c) => c.includes('hashes:search'))!;
  // Only prefixes: no address, no host, no path in what went out.
  for (const leak of ['phish', 'example', 'login', 'u%3D1']) assert.ok(!ask.toLowerCase().includes(leak), ask);
  for (const p of new URL(ask).searchParams.getAll('hashPrefixes')) assert.equal(Buffer.from(p, 'base64').length, 4);
  assert.equal(sb.known(BAD), true);
  assert.equal(sb.suspect(BAD), false);
  const before = g.calls.length;
  await sb.verdict(BAD);
  assert.equal(g.calls.length, before, 'the answer is kept, not asked again');
});

test('a shared prefix with no full match, a canary, a frame-only or an unknown threat never blocks', async () => {
  const g = google({ listed: [BAD], threats: {
    'phish.example.net/': [{ threatType: 'MALWARE', attributes: ['CANARY'] }, { threatType: 'SOCIAL_ENGINEERING', attributes: ['FRAME_ONLY'] }],
    'phish.example.net/login': [{ threatType: 'SOMETHING_NEW' }],
  } });
  const sb = sbWith(g, 'k');
  await sb.update(true);
  assert.deepEqual(await sb.verdict(BAD), []);
  assert.equal(sb.known(BAD), false);
});

test('Google not answering fails open (the page loads), like Chrome', async () => {
  const g = google({ listed: [BAD], threats: {} });
  const sb = sbWith(g, 'k');
  await sb.update(true);
  (sb as any).fetcher = async () => { throw new Error('offline'); };
  assert.deepEqual(await sb.verdict(BAD), []);
});
