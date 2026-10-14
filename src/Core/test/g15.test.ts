// AI lockdown G15 (2026-10-14): once something from outside is in Aang's turn (his mail, a window, a page), typing on
// a site he never named, typing what looks like his details, or a long message tucked into an address, asks first.
// No Body is connected in the test, so a question that has to be asked comes back as no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-g15-'));
function core(asked: string): any {
  const c: any = new Core({ port: 48210, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  c.active = { sub: { text: asked } };
  c.jobForTurn = async () => 1;
  c.sent = [] as unknown[];
  c.requestDrive = async (op: string, a: Record<string, unknown>) => { c.sent.push([op, a]); return { ok: true, page: 1, url: String(a.url ?? ''), title: 't' }; };
  return c;
}

test('G15: typing on a site he named stays free, even after reading outside words', async () => {
  const c = core('search youtube.com for lofi beats');
  c.tainted = true; c.pageUrls.set(1, 'https://www.youtube.com/');
  const r = await c.browse({ action: 'type', page: 1, n: 3, text: 'lofi beats', enter: true });
  assert.equal(r.ok, true); assert.equal(c.sent.length, 1);
  c.memory.close();
});

test('G15: typing on a site he never named asks first', async () => {
  const c = core('summarise my latest email');
  c.tainted = true; c.pageUrls.set(1, 'https://evil.example/form');
  const r = await c.browse({ action: 'type', page: 1, n: 3, text: 'Interview Thursday 3pm with Acme' });
  assert.equal(r.ok, false); assert.equal(c.sent.length, 0, 'nothing was typed');
  c.memory.close();
});

test('G15: his details typed anywhere ask first, even on a site he named', async () => {
  const c = core('search youtube.com for lofi');
  c.tainted = true; c.pageUrls.set(1, 'https://www.youtube.com/');
  const r = await c.browse({ action: 'type', page: 1, n: 3, text: 'bocas.joshua@gmail.com' });
  assert.equal(r.ok, false); assert.equal(c.sent.length, 0);
  c.memory.close();
});

test('G15: a long message tucked into the address of a site he named asks first', async () => {
  const c = core('look something up on google.com');
  c.tainted = true;
  const r = await c.browse({ action: 'open', url: 'https://www.google.com/search?q=Your+interview+with+Acme+is+Thursday+at+3pm+room+4B' });
  assert.equal(r.ok, false); assert.equal(c.sent.length, 0);
  const ok = await c.browse({ action: 'open', url: 'https://www.google.com/search?q=lofi' });
  assert.equal(ok.ok, true, 'a short search is fine');
  c.memory.close();
});

test('G15: before anything outside is read, typing is free as before', async () => {
  const c = core('fill in the form on example.org');
  c.pageUrls.set(1, 'https://other.example/');
  const r = await c.browse({ action: 'type', page: 1, n: 3, text: 'hello' });
  assert.equal(r.ok, true);
  c.memory.close();
});
