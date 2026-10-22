// Perf sweep (2026-10-22): the game coming to the front gives Qwen's 13 GB back at once (keep_alive 0), once per
// change, instead of waiting for the next local job to notice. A fake Ollama stands in: the real one is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'gameunload-'));

test('WoW in front unloads the local model once; leaving and coming back does it again', async () => {
  const seen: { path: string; body: any }[] = [];
  const fake = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d); req.on('end', () => { try { seen.push({ path: req.url ?? '', body: JSON.parse(b || '{}') }); } catch { /* not json */ } res.end('{}'); });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', () => r()));
  process.env.AANG_OLLAMA = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  const { Core } = await import('../src/core.ts');
  const { LOCAL_MODEL } = await import('../src/local.ts');
  const core = new Core({ testDoor: true, port: 48190, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:48190/body');
  await new Promise<void>(r => c.once('open', () => r()));
  const unloads = () => seen.filter(s => s.path === '/api/generate' && s.body.keep_alive === 0 && s.body.model === LOCAL_MODEL).length;
  try {
    c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(unloads(), 1, 'the card is given back as the game comes to the front');
    c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow', title: 'World of Warcraft' }));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(unloads(), 1, 'not again while he stays in the game');
    c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' }));
    await new Promise(r => setTimeout(r, 200));
    c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
    await new Promise(r => setTimeout(r, 300));
    assert.equal(unloads(), 2, 'back into the game: once more');
  } finally {
    c.close(); await core.stop(); fake.close();
  }
});
