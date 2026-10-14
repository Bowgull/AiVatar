// Code audit M5 (2026-10-14): the hook door answers only to this machine's own names (no DNS rebinding), and the
// Mac setup door shuts after 10 wrong codes in 10 minutes and never answers a web page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HookServer } from '../src/hooks.ts';

const PORT = 48411;
const ask = (path: string, headers: Record<string, string>, method = 'GET') => new Promise<number>((done, fail) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => { res.resume(); done(res.statusCode ?? 0); });
  r.on('error', fail); r.end(method === 'POST' ? '{}' : undefined);
});

test('M5: a rebound web name is refused; the real local names still work', async () => {
  const got: unknown[] = [];
  const s = new HookServer(PORT, (ev) => got.push(ev), 'k'.repeat(24), (c) => (c === 'right-code' ? '#!/bin/bash\n' : null));
  await s.start();
  try {
    assert.equal(await ask('/hook?e=Stop', { host: `127.0.0.1:${PORT}` }, 'POST'), 204);
    assert.equal(await ask('/hook?e=Stop', { host: `localhost:${PORT}` }, 'POST'), 204);
    assert.equal(await ask('/hook?e=Stop', { host: `evil.example:${PORT}` }, 'POST'), 403, 'DNS rebinding');
    assert.equal(await ask('/hook?e=Stop', { host: 'evil.example' }, 'POST'), 403);
    assert.equal(await ask('/mac-setup?c=right-code', { host: `127.0.0.1:${PORT}`, origin: 'https://evil.example' }), 403, 'never to a web page');
    for (let i = 0; i < 10; i++) assert.equal(await ask(`/mac-setup?c=guess${i}`, { host: `127.0.0.1:${PORT}` }), 404);
    assert.equal(await ask('/mac-setup?c=right-code', { host: `127.0.0.1:${PORT}` }), 429, 'shut after 10 wrong codes');
    assert.equal(got.length, 2);
  } finally { await s.stop(); }
});
