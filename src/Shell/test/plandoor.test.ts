// The plan door (2026-10-30): on the Mac a Claude session's plan card goes from Samara to Aang's bubble and his answer
// comes back (plandoor.ts). Real loopback requests, a stand-in bubble.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanCard, openPlanDoor, planDoorClient } from '../src/plandoor.ts';
import { PlanRows } from '../src/planrows.ts';

const card = { id: 'samara:3', task: 'Check jobs', steps: ['Open the board', 'Read it'], wont: 'Apply', sites: [{ site: 'jobs.example', login: true, favicon: '' }], from: 'AANG' };

function door(hooks: Partial<Parameters<typeof openPlanDoor>[0]['hooks']>, port: number) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plandoor-'));
  const keyFile = path.join(dir, 'plan-door.key');
  const close = openPlanDoor({ keyFile, port, log: () => {}, hooks: { ask: async () => null, step: () => {}, started: () => {}, done: () => {}, ...hooks } });
  return { keyFile, close, client: planDoorClient({ keyFile, port, log: () => {} }) };
}
const ready = () => new Promise((r) => setTimeout(r, 80));

test('a card goes to the bubble and his answer comes back to Samara', async () => {
  let shown: any = null;
  const d = door({ ask: async (c) => { shown = c; return { go: false, change: true, keep: ['jobs.example'], note: 'only the first page' }; } }, 47961);
  await ready();
  const a = await d.client.ask(card as never);
  assert.equal(shown.id, 'samara:3');
  assert.deepEqual(shown.steps, ['Open the board', 'Read it']);
  assert.deepEqual(a, { go: false, change: true, keep: ['jobs.example'], note: 'only the first page' });
  assert.equal(statSync(d.keyFile).mode & 0o777, 0o600, 'the key is his alone');
  d.close();
});

test('nobody to show it (Aang closed, or no bubble): null, so Samara\'s band shows it', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plandoor-'));
  const none = planDoorClient({ keyFile: path.join(dir, 'missing.key'), port: 47962, log: () => {} });
  assert.equal(await none.ask(card as never), null);
  const d = door({ ask: async () => null }, 47963);
  await ready();
  assert.equal(await d.client.ask(card as never), null);
  d.close();
  // The door is gone (Aang quit): still null, quickly.
  await ready();
  assert.equal(await d.client.ask(card as never), null);
});

test('Samara gives up (its own wait ran out): the bubble is told the card is gone', async () => {
  let gone = false;
  const d = door({ ask: (_c, g) => new Promise((r) => { void g.then(() => { gone = true; r(null); }); }) }, 47964);
  await ready();
  const quick = planDoorClient({ keyFile: d.keyFile, port: 47964, log: () => {}, waitMs: -4800 });
  assert.equal(await quick.ask(card as never), null);
  await ready();
  assert.ok(gone);
  d.close();
});

test('steps, rows and done reach Aang', async () => {
  const seen: unknown[] = [];
  const d = door({ step: (c, at) => seen.push(['step', c, at]), started: (p) => seen.push(['row', p.job, p.task]), done: (j) => seen.push(['done', j]) }, 47965);
  await ready();
  d.client.step('samara:3', 1); d.client.step('samara:3', null);
  d.client.started({ job: 9, task: 'Check jobs', sites: ['jobs.example'], steps: ['a'], remembered: false });
  d.client.done(9);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(seen.sort(), [['done', 9], ['row', 9, 'Check jobs'], ['step', 'samara:3', 1], ['step', 'samara:3', null]].sort());
  d.close();
});

test('locked: no key, a wrong key or a web page is refused', async () => {
  const d = door({}, 47966);
  await ready();
  const key = readFileSync(d.keyFile, 'utf8');
  const status = (headers: Record<string, string>) => new Promise<number>((r) => {
    const req = http.request({ host: '127.0.0.1', port: 47966, path: '/step', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => { res.resume(); r(res.statusCode ?? 0); });
    req.on('error', () => r(0)); req.end('{"card":"samara:1","at":1}');
  });
  assert.equal(await status({}), 403);
  assert.equal(await status({ 'x-aang-key': 'nope' }), 403);
  assert.equal(await status({ 'x-aang-key': key, origin: 'https://evil.example' }), 403);
  assert.equal(await status({ 'x-aang-key': key }), 200);
  d.close();
});

test('only Samara\'s own cards, cleaned', () => {
  assert.equal(cleanCard({ ...card, id: 'brain:1' }), null);
  assert.equal(cleanCard(null), null);
  const c = cleanCard({ ...card, steps: Array.from({ length: 30 }, (_, i) => 'x'.repeat(400) + i), sites: [{ site: '' }, { site: 'a.example', login: 'yes' }] })!;
  assert.equal(c.steps.length, 12);
  assert.equal(c.steps[0]!.length, 300);
  assert.deepEqual(c.sites, [{ site: 'a.example', login: false, favicon: '' }]);
});

test('scroll-back rows: saved, then done (or done first, marked when saved)', () => {
  const sent: any[] = [];
  const rows = new PlanRows((m) => sent.push(m));
  rows.started({ job: 1, task: 'One', sites: ['a'], steps: ['s'], remembered: true });
  assert.equal(sent[0].t, 'shown.save');
  assert.equal(sent[0].ref, 'plan-1');
  rows.saved('plan-1', 11);
  rows.done(1);
  assert.deepEqual(sent[1], { t: 'shown.update', id: 11, extra: { plan: { title: 'One', sites: ['a'], steps: ['s'], done: true }, remembered: true } });
  rows.started({ job: 2, task: 'Two', sites: [], steps: [], remembered: false });
  rows.done(2);
  assert.equal(sent.length, 3, 'not marked until the brain says which row');
  rows.saved('plan-2', 12);
  assert.equal(sent[3].id, 12);
  rows.saved('plan-9', 5);
  assert.equal(sent.length, 4);
});
