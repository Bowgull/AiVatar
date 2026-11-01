// Sheet 115 (his picks, 2026-10-31): Claude's work survives a restart. The kept file (claudekeep.ts) and the update
// engine's wait for Claude (updateengine.ts): what is kept and for how long, how a new chat names an old group, and an
// update that waits while Claude works, asks after two hours, and writes Claude's work down before it goes in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KEEP_MS, cleanKept, hasTyping, placeName, readKept, sameName, writeKept, type KeptFile } from '../src/claudekeep.ts';
import { UpdateEngine, WORK_WAIT_MS, waitLine, type Moment, type Source } from '../src/updateengine.ts';

const NOW = Date.UTC(2026, 9, 31, 16, 45);
const TOK = 'a'.repeat(32);
const job = (o: Record<string, unknown> = {}) => ({ id: 3, token: TOK, name: 'Job hunt', at: NOW - 60_000, seen: NOW - 30_000, working: true,
  plan: { login: ['ashbyhq.com'], denied: [], allowed: ['ashbyhq.com'], steps: ['Fill the form'], planned: true, step: 0 },
  pages: [{ id: 7, url: 'https://jobs.ashbyhq.com/contoso/apply', title: 'Contoso - Account Manager', form: { at: NOW - 10_000, url: 'https://jobs.ashbyhq.com/contoso/apply', fields: [{ k: '#name', kind: 'text', v: 'Sam Rivera' }, { k: 'n:remote', kind: 'check', v: true }] } }], ...o });

test('the kept file keeps a job, its plan, its tabs and their typing, with the same numbers', () => {
  const k = cleanKept({ v: 1, version: '1.29.2', at: NOW, jobs: [job()] }, NOW);
  assert.equal(k.jobs.length, 1);
  const [j] = k.jobs;
  assert.equal(j!.id, 3); assert.equal(j!.token, TOK); assert.equal(j!.pages[0]!.id, 7);
  assert.deepEqual(j!.plan!.login, ['ashbyhq.com']);
  assert.equal(j!.pages[0]!.form!.fields.length, 2);
});

test('typing a day old is let go (his pick: until sent, 1 day max); so is a job not heard from in a day', () => {
  const old = cleanKept({ jobs: [job({ pages: [{ ...job().pages[0], form: { ...job().pages[0]!.form, at: NOW - KEEP_MS - 1 } }] })] }, NOW);
  assert.equal(old.jobs[0]!.pages[0]!.form, undefined, 'the form goes, the tab stays');
  assert.equal(cleanKept({ jobs: [job({ seen: NOW - KEEP_MS - 1, at: NOW - KEEP_MS - 1 })] }, NOW).jobs.length, 0);
});

test('broken entries never come back: a bad token, a page that is not a web address, a job with no tabs', () => {
  const k = cleanKept({ jobs: [job({ token: 'not-a-token' }), job({ id: 4, pages: [{ id: 8, url: 'file:///etc/passwd', title: 'x' }] }), job({ id: -1 })] }, NOW);
  assert.equal(k.jobs.length, 1);
  assert.equal(k.jobs[0]!.token, '');
});

test('written so only he can read it, and read back the same', () => {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'keep-')), 'claude-kept.json');
  const k: KeptFile = cleanKept({ v: 1, version: '1.29.2', at: NOW, jobs: [job()] }, NOW);
  writeKept(f, k);
  if (process.platform !== 'win32') assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(readKept(f, NOW), k);
  assert.deepEqual(readKept(f + '.missing', NOW).jobs, []);
});

test('where a page is, in plain words, from its title', () => {
  assert.equal(placeName('Contoso - Account Manager, Partners', ''), 'Contoso');
  assert.equal(placeName('Job Application for Customer Success Manager at ZayZoon', ''), 'ZayZoon');
  assert.equal(placeName('', 'https://jobs.ashbyhq.com/zayzoon'), 'ashbyhq.com');
});

test('"carry on the job hunt" finds the group "Job hunt"', () => {
  assert.ok(sameName('Job hunt', 'carry on the job hunt'));
  assert.ok(sameName('JOB HUNT', 'job hunt'));
  assert.ok(!sameName('Job hunt', 'Mockups'));
  assert.ok(!sameName('', 'x'));
});

test('typing that counts as not sent: two answers, or one long one; a lone search word does not', () => {
  const f = (fields: { k: string; kind: 'text' | 'check'; v: string | boolean }[]) => ({ at: NOW, url: 'https://x.example/', fields });
  assert.ok(hasTyping(f([{ k: 'a', kind: 'text', v: 'Sam' }, { k: 'b', kind: 'text', v: 'sam@example.com' }])));
  assert.ok(hasTyping(f([{ k: 'w', kind: 'text', v: 'I have looked after partner accounts for six years.' }])));
  assert.ok(!hasTyping(f([{ k: 'q', kind: 'text', v: 'shoes' }])));
  assert.ok(!hasTyping(undefined));
});

test('the waits line: why it waits, then after two hours it asks', () => {
  assert.equal(waitLine(null, 0), null);
  const w = waitLine({ doing: 'filling an application', where: 'Contoso' }, 1000)!;
  assert.equal(w.b + w.t, "Claude is filling an application in Contoso. The update waits until it's done.");
  assert.equal(w.anyway, false);
  const a = waitLine({ doing: 'working', where: 'Contoso' }, WORK_WAIT_MS)!;
  assert.equal(a.b + a.t, 'Claude has been working for 2 hours. Restart anyway? Its tabs and your typing come back.');
  assert.equal(a.anyway, true);
});

const src = (log: string[]): Source => ({ id: 'samara', onKey: true, ready: () => ({ version: '1.29.3', since: 0, title: 'Version 1.29.3: Gojo', groups: [] }),
  check: async () => {}, go: async () => { log.push('go'); return { ok: true }; }, file: () => {}, skip: () => {}, canBack: () => false, back: () => false, checkNow: () => {} });

test('overnight waits while Claude works; the card says why; his Restart now still goes, after Claude is written down', async () => {
  const log: string[] = [];
  let work: Moment['work'] = { doing: 'filling an application', where: 'Contoso' };
  const cards: unknown[] = [];
  const e = new UpdateEngine({ sources: [src(log)], moment: () => ({ now: new Date(2026, 9, 31, 3, 0), idleSeconds: 3600, inCall: false, inGame: false, work }),
    overnight: () => true, changed: (c) => cards.push(c), restart: () => log.push('restart'), saveWork: async () => { log.push('saved'); } });
  await e.tick();
  assert.deepEqual(log, [], 'nothing went in overnight while Claude works');
  assert.equal(e.card()!.wait!.b, 'Claude is filling an application');
  assert.ok(cards.length >= 1, 'the key was told');
  await e.go();
  assert.deepEqual(log, ['saved', 'go', 'restart'], 'his press goes, Claude saved first');
  log.length = 0; work = null;
  assert.equal(e.card()!.wait, undefined);
  await e.tick();
  assert.deepEqual(log, ['saved', 'go', 'restart'], 'Claude done: overnight goes as before');
});
