import './_env.ts';
// The background worker (2026-09-22, "aang feels dumb without this type of power"): a job runs in Aang's own session,
// reports itself through the done / needs-you tiers, can be continued by his reply, and survives a restart. No model is
// called: the worker's session is a stand-in that answers what each test needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { TaskStore, nameFor } from '../src/worker.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-worker-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withCore(port: number, fn: (core: any, desk: { c: WebSocket; inbox: any[] }) => Promise<void>) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  await wait(60);
  try { await fn(core, { c, inbox }); } finally { c.close(); await core.stop(); }
}

/** A stand-in worker session: each ask gets the next scripted answer, and what it was asked is kept. */
function scripted(core: any, answers: string[]) {
  const asked: string[] = [];
  core.workerLane = () => ({ ask: async (m: string) => { asked.push(m); return { ok: true, text: answers.shift() ?? 'Done.' }; }, interrupt: async () => {} });
  return asked;
}

test('a job runs in the background and says itself that it is done, as the done tier', async () => {
  await withCore(47991, async (core, desk) => {
    const asked = scripted(core, ['Moved 14 installers into C:\\Users\\Shadow\\Downloads\\Installers and left the rest.']);
    const said = await core.doers().tasks.start('tidy my downloads folder, installers into their own folder', 'downloads tidy');
    assert.match(said, /^Started "downloads tidy"/);
    await wait(120);
    assert.deepEqual(asked, ['tidy my downloads folder, installers into their own folder']);
    const b = desk.inbox.find(m => m.t === 'bubble' && /downloads tidy job is done/.test(m.text));
    assert.ok(b, 'it reported itself');
    assert.equal(b.done, true);
    assert.equal(b.asked, true, 'it is news he asked for, so it gets through while he is in the game');
    const kept = JSON.parse(readFileSync(path.join(core.cfg.stateDir, 'tasks.json'), 'utf8'));
    assert.equal(kept[0].state, 'done');
  });
});

test('a job that needs him says so as needs-you, reaches his next message, and his reply continues it', async () => {
  await withCore(47993, async (core, desk) => {
    core.lane = (name: string) => ({ send: (text: string) => sent.push({ name, text }), interrupt: async () => {} });
    const sent: { name: string; text: string }[] = [];
    const asked = scripted(core, ['Found two old resumes. Which one should I update, the 2025 or the 2026 one?', 'Updated the 2026 one.']);
    await core.doers().tasks.start('update my resume with the new job', 'resume');
    await wait(120);
    const b = desk.inbox.find(m => m.t === 'bubble' && /^Need input on the resume job/.test(m.text));
    assert.ok(b);
    assert.equal(b.blocking, true, 'the needs-you tier');

    desk.c.send(JSON.stringify({ t: 'submit', id: 'r1', text: 'the 2026 one' }));
    await wait(120);
    assert.match(sent.at(-1)!.text, /<waiting>[\s\S]*"resume": Found two old resumes[\s\S]*tell_task/, 'the chat knows what the job asked');
    core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'Passing that on.', tools: [], ms: 5 });   // end the chat turn

    const r = await core.doers().tasks.tell('it', 'the 2026 one');
    assert.match(r, /^Passed that to "resume"/);
    await wait(120);
    assert.deepEqual(asked, ['update my resume with the new job', 'the 2026 one'], 'the same job, continued');
    assert.ok(desk.inbox.some(m => m.t === 'bubble' && /resume job is done/.test(m.text) && m.done));
  });
});

test('while saving quota a job is not started, and never more than two run at once', async () => {
  await withCore(47995, async core => {
    core.policy.saving = true;
    assert.match(await core.doers().tasks.start('something big'), /Saving quota is on/);
    core.policy.saving = false;
    core.workerLane = () => ({ ask: () => new Promise(() => {}), interrupt: async () => {} });   // never finishes
    await core.doers().tasks.start('one'); await core.doers().tasks.start('two');
    assert.match(await core.doers().tasks.start('three'), /^Not started: 2 jobs are already running/);
    assert.match(core.doers().tasks.status(), /"two": working/);
  });
});

test('a job cut off by a restart is kept, marked, and can be carried on', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify([{ id: 'job3', name: 'resume', task: 'x', state: 'working', last: '', sessionId: 's9', startedAt: 1, updatedAt: 1 }]));
  const s = new TaskStore(dir);
  assert.equal(s.list()[0]!.state, 'stopped');
  assert.equal(s.list()[0]!.sessionId, 's9', 'its session is kept, so carrying on continues the same conversation');
  assert.equal(s.add('next').id, 'job4', 'ids carry on');
  assert.equal(s.find('resume')?.id, 'job3');
  assert.equal(nameFor('Sort out my Downloads folder, please!'), 'sort out my downloads folder');
});

test('a job runs on Sonnet unless he actually asked for the strongest model', async () => {
  // 2026-09-22 (Joshua's call): every job used to run on Opus, which both drains his plan fastest and has
  // its own separate weekly cap - so tidying a folder was spending the scarcest thing he has.
  await withCore(47997, async core => {
    const normal = core.workerLane({ id: 'j1', name: 'tidy', deep: false });
    assert.match(normal.opts.model, /sonnet/, 'an ordinary job: Sonnet');
    const asked = core.workerLane({ id: 'j2', name: 'hard one', deep: true });
    assert.match(asked.opts.model, /opus/, 'he asked for it: Opus');
  });
});
