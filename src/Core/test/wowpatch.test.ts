// M4 (omashu MAC.md): the WoW patch alert. No Claude, no SSH: the laptop's file and the job are stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PATCH_BRIEF, WowPatch, parseWow, setScript } from '../src/wowpatch.ts';

const updated = { version: '1.60.1.70938', interface: 16001, sig: '1.60.1.70938|OmaPad|', updatedFrom: '1.60.0.70000', updatedAt: '2026-11-15T13:00:00', addonsOutOfDate: ['OmaPad'], luaErrors: ['OmaPad\\core.lua:12: attempt to index nil @everyone'], told: false, claude: false, patch: 'none' };

function rig(start: Record<string, unknown> = updated) {
  let file: Record<string, unknown> = { ...start };
  const sent: { ch: string; msg: any }[] = [], edits: any[] = [], writes: any[] = [], jobs: { brief: string; done: (s: string, w: string) => void }[] = [];
  const wow = new WowPatch({
    dir: mkdtempSync(path.join(os.tmpdir(), 'wow-')),
    gw: { send: async (ch, msg) => { sent.push({ ch, msg }); return 'm1'; }, edit: async (_c, _m, msg) => { edits.push(msg); } },
    channel: () => 'gaming',
    read: async () => '\uFEFF' + JSON.stringify(file),
    write: async (f) => { writes.push(f); file = { ...file, ...f }; },
    startJob: async (brief, done) => { jobs.push({ brief, done }); return null; },
  });
  const press = (id: string) => wow.press({ customId: id, keep: async () => {}, ack: async () => {} });
  return { wow, sent, edits, writes, jobs, press, set: (f: Record<string, unknown>) => { file = { ...file, ...f }; }, file: () => file };
}

test('a pretend update is posted exactly once, with Patch it and Later, and claude is set on Omashu', async () => {
  const r = rig();
  await r.wow.poll(); await r.wow.poll();
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0]!.msg.content, /1\.60\.0\.70000 → 1\.60\.1\.70938/);
  assert.match(r.sent[0]!.msg.content, /OmaPad/);
  assert.doesNotMatch(r.sent[0]!.msg.content, /@/);
  assert.deepEqual(r.sent[0]!.msg.buttons.map((b: any) => b.label), ['Patch it', 'Later']);
  assert.deepEqual(r.writes, [{ claude: true }]);
  // Even if claude could not be set on the laptop, the same news is not posted again.
  r.set({ claude: false }); await r.wow.poll();
  assert.equal(r.sent.length, 1);
});

test('nothing is posted when claude has looked, or a patch is under way', async () => {
  for (const f of [{ claude: true }, { patch: 'ready' }]) { const r = rig({ ...updated, ...f }); await r.wow.poll(); assert.equal(r.sent.length, 0); }
});

test('Later does nothing; Patch it pressed twice runs one job with the fixed brief', async () => {
  const r = rig();
  await r.wow.poll();
  const key = /wow:patch:([a-f0-9]+)/.exec(r.sent[0]!.msg.buttons[0].id)![1];
  await r.press(`wow:later:${key}`);
  assert.equal(r.jobs.length, 0); assert.deepEqual(r.writes, [{ claude: true }]);
  assert.deepEqual(r.edits.at(-1).buttons.map((b: any) => b.label), ['Patch it']);
  await Promise.all([r.press(`wow:patch:${key}`), r.press(`wow:patch:${key}`)]);
  await r.press(`wow:patch:${key}`);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0]!.brief, PATCH_BRIEF);
  assert.equal(r.file().patch, 'requested');
  // The job marks it ready; the post says Ready and has no buttons.
  r.set({ patch: 'ready' });
  r.jobs[0]!.done('Bumped OmaPad to 16001.', '');
  await new Promise(res => setTimeout(res, 10));
  assert.match(r.edits.at(-1).content, /\*\*Ready\.\*\*/);
  assert.deepEqual(r.edits.at(-1).buttons, []);
});

test('a job that ends without marking it ready fails with the reason, and Patch it can be pressed again', async () => {
  const r = rig();
  await r.wow.poll();
  const key = /wow:patch:([a-f0-9]+)/.exec(r.sent[0]!.msg.buttons[0].id)![1];
  await r.press(`wow:patch:${key}`);
  r.jobs[0]!.done('', 'error_max_turns');
  await new Promise(res => setTimeout(res, 10));
  assert.equal(r.file().patch, 'failed');
  assert.match(r.edits.at(-1).content, /error_max_turns/);
  assert.deepEqual(r.edits.at(-1).buttons.map((b: any) => b.label), ['Patch it']);
  await r.press(`wow:patch:${key}`);
  assert.equal(r.jobs.length, 2);
});

test('an old alert key is refused', async () => {
  const r = rig();
  await r.wow.poll();
  let said = '';
  await r.wow.press({ customId: 'wow:patch:000000000000', keep: async () => {}, ack: async (n) => { said = n; } });
  assert.match(said, /out of date/); assert.equal(r.jobs.length, 0);
});

test('wow.json is read with its BOM; junk is refused; the setter carries values as data', () => {
  assert.equal(parseWow('\uFEFF' + JSON.stringify(updated))?.version, '1.60.1.70938');
  assert.equal(parseWow('{"version":"rm -rf"}'), null);
  const s = setScript({ patch: 'failed', patchReason: "it's '; Remove-Item C:\\ -Recurse" });
  assert.doesNotMatch(s, /Remove-Item/);
});
