// Sheet 79 (2026-10-23): a version's stage in the Mockups history, and Claude's door to read and set it. One stage per
// version; approving one takes the approval off the sheet's others; an approval from the chat needs his words; the
// marks survive a restart; the door answers only signed asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockStore } from '../src/mockups.ts';
import { startMockupDoor } from '../src/mockupdoor.ts';

const C = 'a'.repeat(40);
function store() {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'mm-')), 'mockups.json');
  writeFileSync(f, JSON.stringify({ v: 1, versions: [1, 2, 3].map((v) => ({ id: v, sheet: 'docs/cockpit/sheet-77-autofill.html', title: '77 · Autofill', commit: C, at: v, key: 'k' + v, v })) }));
  return { f, s: new MockStore(f) };
}
test('one stage per version, approval moves, the chat needs his words, kept on disk', () => {
  const { f, s } = store();
  assert.equal(s.setStage(2, 'ok'), '');
  assert.equal(s.setStage(3, 'ok'), '');
  assert.equal(s.list.find((x) => x.id === 2)!.stage, undefined, 'only one approved version per sheet');
  assert.equal(s.setStage(3, 'fix', { note: 'key over a key' }), '');
  assert.equal(s.list.find((x) => x.id === 3)!.stage, 'fix');
  assert.notEqual(s.setStage(1, 'chat', {}), '', 'an approval from the chat needs his words');
  assert.equal(s.setStage(1, 'chat', { said: 'yes, build it', by: 'claude' }), '');
  assert.equal(s.setStage(1, 'built', { by: 'claude' }), '');
  assert.equal(s.list.find((x) => x.id === 1)!.said, 'yes, build it', 'built keeps the words he approved it with');
  const again = new MockStore(f).stages();
  assert.deepEqual(again.map((x) => [x.v, x.stage]).sort(), [[1, 'built'], [3, 'fix']]);
  assert.equal(again.find((x) => x.v === 3)!.note, 'key over a key');
  assert.equal(s.setStage(3, null), '');
  assert.equal(new MockStore(f).stages().length, 1, 'taken off');
  assert.ok(JSON.parse(readFileSync(f, 'utf8')).versions.length === 3);
});
test("Claude's door: the list and a mark, signed only", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'md-'));
  const got: unknown[] = [];
  const port = 47000 + Math.floor(Math.random() * 900);
  const close = startMockupDoor(dir, async () => null, () => null, port, { list: () => [{ sheet: 'x.html', v: 2, stage: 'ok' }], set: (a) => { got.push(a); return ''; } });
  await new Promise((r) => setTimeout(r, 200));
  const key = readFileSync(path.join(dir, 'mockup-door.key'), 'utf8');
  const mac = (...p: string[]) => createHmac('sha256', key).update(p.join('\n')).digest('hex');
  const ask = async (method: string, p: string, body = '', sign = true) => {
    const ts = String(Date.now());
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { ...(sign ? { 'x-aang-link-ts': ts, 'x-aang-link-sig': mac('req', ts, method, p, body) } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
    return [r.status, r.status === 200 ? await r.json() : null] as const;
  };
  assert.equal((await ask('GET', '/stages', '', false))[0], 403, 'unsigned: refused');
  const [, list] = await ask('GET', '/stages');
  assert.deepEqual(list.stages, [{ sheet: 'x.html', v: 2, stage: 'ok' }]);
  const repo = mkdtempSync(path.join(os.tmpdir(), 'mr-'));
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(repo, 'sheet.html'), '<title>x</title>');
  const [, r2] = await ask('POST', '/stage', JSON.stringify({ cwd: repo, path: 'sheet.html', stage: 'approved', said: 'yes' }));
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal((got[0] as { sheet: string; stage: string; said: string }).sheet, 'sheet.html');
  assert.equal((got[0] as { said: string }).said, 'yes');
  close();
  randomBytes(1);
});

test('marks travel between the machines by picture: the newer wins, a later version picks it up, a clear travels too', () => {
  const mac = store(), pc = store();
  // The PC shows the sheet as a plain path, the Mac with its repo name in front: the same picture either way.
  for (const v of pc.s.list) v.sheet = v.sheet; for (const v of mac.s.list) v.sheet = '@AiVatar/' + v.sheet;
  assert.equal(mac.s.setStage(2, 'chat', { said: 'yes', by: 'claude' }), '');
  assert.ok(pc.s.takeStages([...mac.s.stageLog.values()]), 'the PC takes the Mac’s mark');
  assert.equal(pc.s.list.find((x) => x.key === 'k2')!.stage, 'chat');
  assert.equal(pc.s.list.find((x) => x.key === 'k2')!.said, 'yes');
  // An older mark from the PC does not undo the Mac's newer one.
  const stale = [{ ...[...mac.s.stageLog.values()][0]!, stage: null, at: 1 }];
  assert.equal(mac.s.takeStages(stale), false);
  assert.equal(mac.s.list.find((x) => x.key === 'k2')!.stage, 'chat');
  // Taken off on the PC (newer): gone on the Mac too.
  assert.equal(pc.s.setStage(pc.s.list.find((x) => x.key === 'k2')!.id, null), '');
  assert.ok(mac.s.takeStages([...pc.s.stageLog.values()]));
  assert.equal(mac.s.list.find((x) => x.key === 'k2')!.stage, undefined);
  // A version the other machine has not shown yet takes the mark when it is shown.
  assert.equal(mac.s.setStage(3, 'fix', { note: 'bigger' }), '');
  const fresh = new MockStore(path.join(mkdtempSync(path.join(os.tmpdir(), 'mm-')), 'mockups.json'));
  fresh.takeStages([...mac.s.stageLog.values()]);
  const r = fresh.add('docs/cockpit/sheet-77-autofill.html', '77 · Autofill', C, 'k3');
  assert.equal(r.stage, 'fix');
  assert.equal(r.note, 'bigger');
});
