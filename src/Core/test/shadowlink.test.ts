import './_env.ts';
// The handshake (2026-10-29): while Shadow answers its heartbeat it writes the notices; the moment it does not, the Mac does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ShadowLink, readShadowAt } from '../src/shadowlink.ts';

test("Shadow's door and key come from the Mac's setup files; none: null", () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'aang-shadow-'));
  assert.equal(readShadowAt(d), null);
  writeFileSync(path.join(d, 'alive.curl'), 'url = "http://100.1.2.3:47832/alive"\nheader = "x-aang-key: k"\n');
  writeFileSync(path.join(d, 'hook.key'), 'secret\n');
  assert.deepEqual(readShadowAt(d), { url: 'http://100.1.2.3:47832', key: 'secret' });
});

test('up after a heartbeat answers; a failed write marks it down; the key goes in a header', async () => {
  const seen: { url: string; key: string }[] = [];
  let alive = true, writes = true;
  const fake = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, key: String((init.headers as Record<string, string>)['x-aang-key']) });
    if (url.endsWith('/alive')) return new Response(JSON.stringify({ up: alive }), { status: alive ? 200 : 500 });
    if (!writes) return new Response('', { status: 404 });
    return new Response(JSON.stringify({ ok: true, text: 'Casting CEMU drafted your post.' }), { status: 200 });
  }) as typeof fetch;
  const link = new ShadowLink({ url: 'http://s', key: 'k' }, { fetch: fake });
  assert.equal(link.up(), false);
  assert.equal(await link.beat(), true);
  assert.deepEqual(await link.write('p', { system: 's', maxTokens: 10, timeoutMs: 1000 }), { ok: true, text: 'Casting CEMU drafted your post.' });
  writes = false;
  assert.equal((await link.write('p', { system: 's', maxTokens: 10, timeoutMs: 1000 })).ok, false);
  assert.equal(link.up(), false, 'down until the next heartbeat');
  alive = false;
  assert.equal(await link.beat(), false);
  assert.ok(seen.every(x => x.key === 'k'));
});
