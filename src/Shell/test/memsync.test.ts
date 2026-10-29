// What Claude remembers, the same on his Mac and on Shadow (claude-link/hooks/memsync.mjs, his picks 2026-10-29).
// Two pretend machines and a real git repo standing in for aang-data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { changedHere, folderKey, mergeIndex, projectOf, sync } from '../../../claude-link/hooks/memsync.mjs';

const tmp = (n: string) => mkdtempSync(path.join(os.tmpdir(), n));
function world() {
  const remote = tmp('ms-remote-');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const machine = (name: string, home: string, projectFolder: string) => {
    const base = tmp(`ms-${name}-`);
    const p = { machine: name, projects: path.join(home, '.claude', 'projects'), rules: path.join(home, '.claude', 'CLAUDE.md'), handoff: path.join(home, 'handoff'),
      repo: path.join(base, 'repo'), state: path.join(base, 'state.json'), lock: path.join(base, 'lock'), trash: path.join(base, 'Trash') };
    const mem = path.join(p.projects, projectFolder, 'memory');
    mkdirSync(mem, { recursive: true });
    return { p, mem, run: (cwd?: string): { up: number; down: number; clash: number; removed: number } => sync(p, { remote, cwd }) as { up: number; down: number; clash: number; removed: number } };
  };
  const macHome = tmp('ms-machome-'), pcHome = tmp('ms-pchome-');
  const mac = machine('mac', macHome, '-Users-joshbocas-Handoff-aang');
  const pc = machine('pc', pcHome, 'C--Users-Shadow-Documents-AangApp');
  return { mac, pc };
}
const put = (f: string, t: string, ago = 0) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, t); const at = new Date(Date.now() - ago * 1000); utimesSync(f, at, at); };
const read = (f: string) => readFileSync(f, 'utf8');

test('one name per project on both machines, whatever the folders are called', () => {
  assert.equal(projectOf('-Users-joshbocas-Handoff-aang'), 'aang');
  assert.equal(projectOf('C--Users-Shadow-Documents-AangApp'), 'aang');
  assert.equal(projectOf('-Users-joshbocas-projects-AiVatar'), 'aang');
  assert.equal(projectOf('-Users-joshbocas-projects-waymark'), 'waymark');
  assert.equal(projectOf('-Users-joshbocas-Handoff-waymark'), 'waymark');
  assert.equal(projectOf('-Users-joshbocas-sygnalist-brain'), 'sygnalist-brain');
  assert.equal(projectOf('-private-tmp-claude-501--Users-joshbocas-Handoff-aang-a8bc-scratchpad'), null);
  assert.equal(folderKey('/Users/joshbocas/Handoff/aang'), '-Users-joshbocas-Handoff-aang');
});

test("the Mac's notes, rules and handoff reach Shadow, into Shadow's own folder for that project", () => {
  const { mac, pc } = world();
  put(path.join(mac.mem, 'MEMORY.md'), '- [Rule](rule.md) — a rule\n');
  put(path.join(mac.mem, 'rule.md'), 'two machines');
  put(mac.p.rules, '# rules');
  put(path.join(mac.p.handoff, 'reports', 'plan.md'), 'the plan');
  assert.equal(mac.run().up, 4);
  mkdirSync(pc.p.handoff, { recursive: true });
  assert.equal(pc.run().down, 4);
  assert.equal(read(path.join(pc.mem, 'rule.md')), 'two machines');
  assert.equal(read(pc.p.rules), '# rules');
  assert.equal(read(path.join(pc.p.handoff, 'reports', 'plan.md')), 'the plan');
});

test('a session in a project Shadow never had gets that project\'s memory as it starts', () => {
  const { mac, pc } = world();
  const way = path.join(mac.p.projects, '-Users-joshbocas-projects-waymark', 'memory');
  put(path.join(way, 'runs.md'), 'pace');
  mac.run();
  pc.run('C:\\Users\\Shadow\\projects\\waymark');
  assert.equal(read(path.join(pc.p.projects, 'C--Users-Shadow-projects-waymark', 'memory', 'runs.md')), 'pace');
});

test('an edit on either machine reaches the other; a removal goes to the other machine\'s Trash', () => {
  const { mac, pc } = world();
  put(path.join(mac.mem, 'a.md'), 'one', 60);
  mac.run(); pc.run();
  put(path.join(pc.mem, 'a.md'), 'two');
  assert.ok(changedHere(pc.p));
  pc.run(); mac.run();
  assert.equal(read(path.join(mac.mem, 'a.md')), 'two');
  assert.ok(!changedHere(mac.p));
  execFileSync(process.platform === 'win32' ? 'cmd' : 'rm', process.platform === 'win32' ? ['/c', 'del', path.join(mac.mem, 'a.md')] : [path.join(mac.mem, 'a.md')]);
  mac.run(); pc.run();
  assert.ok(!existsSync(path.join(pc.mem, 'a.md')));
  assert.equal(readdirSync(pc.p.trash).length, 1, 'in the Trash, never deleted');
});

test('the same note changed on both: the newest wins, the other is kept beside it and listed', () => {
  const { mac, pc } = world();
  put(path.join(mac.mem, 'MEMORY.md'), '- [Note](note.md) — n\n');
  put(path.join(mac.mem, 'note.md'), 'first', 120);
  mac.run(); pc.run();
  put(path.join(mac.mem, 'note.md'), 'mac edit', 60);
  put(path.join(pc.mem, 'note.md'), 'pc edit', 0);
  pc.run(); const r = mac.run();
  assert.equal(r.clash, 1);
  assert.equal(read(path.join(mac.mem, 'note.md')), 'pc edit');
  const kept = readdirSync(mac.mem).find((f) => f.startsWith('note.clash-mac-'))!;
  assert.equal(read(path.join(mac.mem, kept)), 'mac edit');
  assert.match(read(path.join(mac.mem, 'MEMORY.md')), new RegExp(`\\[Clash: note\\.md\\]\\(${kept.replace(/\./g, '\\.')}\\)`));
  pc.run();
  assert.equal(read(path.join(pc.mem, kept)), 'mac edit', 'the kept copy reaches the other machine too');
});

test('two indexes become one list with both machines\' lines', () => {
  const { mac, pc } = world();
  put(path.join(mac.mem, 'MEMORY.md'), '- [A](a.md) — a\n', 120);
  mac.run(); pc.run();
  put(path.join(mac.mem, 'MEMORY.md'), '- [A](a.md) — a\n- [B](b.md) — from the Mac\n', 60);
  put(path.join(pc.mem, 'MEMORY.md'), '- [A](a.md) — a\n- [C](c.md) — from Shadow\n', 0);
  pc.run(); mac.run(); pc.run();
  for (const m of [mac, pc]) { const t = read(path.join(m.mem, 'MEMORY.md')); assert.match(t, /b\.md/); assert.match(t, /c\.md/); assert.equal(t.match(/a\.md/g)!.length, 1); }
});

test("one project's two folders on the same machine never overwrite each other", () => {
  const { mac } = world();
  const a = path.join(mac.p.projects, '-Users-joshbocas-Handoff-waymark', 'memory'), b = path.join(mac.p.projects, '-Users-joshbocas-projects-waymark', 'memory');
  put(path.join(a, 'MEMORY.md'), '- [X](x.md) — x\n', 60); put(path.join(b, 'MEMORY.md'), '- [Y](y.md) — y\n', 0);
  put(path.join(a, 'same.md'), 'older', 60); put(path.join(b, 'same.md'), 'newer', 0);
  mac.run();
  put(path.join(a, 'x.md'), 'only in the handoff folder'); put(path.join(b, 'y.md'), 'only in the code folder');
  mac.run();
  for (const d of [a, b]) { assert.match(read(path.join(d, 'MEMORY.md')), /x\.md[\s\S]*y\.md|y\.md[\s\S]*x\.md/); assert.equal(read(path.join(d, 'same.md')), 'newer'); }
  assert.equal(read(path.join(b, 'x.md')), 'only in the handoff folder', 'each folder holds every note its index links');
  assert.equal(read(path.join(a, 'y.md')), 'only in the code folder');
  assert.ok(readdirSync(a).some((f) => f.startsWith('same.clash-here-')) && read(path.join(a, readdirSync(a).find((f) => f.startsWith('same.clash-here-'))!)) === 'older');
});

test('merging indexes keeps the first list\'s order and adds only lines it does not link yet', () => {
  assert.equal(mergeIndex('- [A](a.md) — 1\n- [B](b.md) — 2\n', '- [B](b.md) — other words\n- [C](c.md) — 3\n'), '- [A](a.md) — 1\n- [B](b.md) — 2\n- [C](c.md) — 3\n');
});
