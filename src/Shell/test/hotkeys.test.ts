// Sheet 61 v2 (2026-10-22): the hotkeys he changes from Aang's menu. What a key may be (never a bare key, never the Win
// key, never Alt+F4 or Ctrl+Alt+Del or the everyday Ctrl+C / Ctrl+V), clashes with our own keys, a key another program
// holds (Windows says no: the old one stays), and that changes are kept and held at once. The keyboard is a pretend
// one: no real global key is ever taken on his machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HotkeyKeeper, KEYS, chips, ourClash, readKeys, twins, validAccelerator, words, type KeyId, type Shortcuts } from '../src/hotkeys.ts';

/** A pretend globalShortcut: `others` are held by another program; ours are refused twice, as Electron does. */
function fakeKeys(others: string[] = []) {
  const held = new Map<string, () => void>();
  const gs: Shortcuts & { held: Map<string, () => void> } = {
    held,
    register(a, fn) { if (others.includes(a) || held.has(a)) return false; held.set(a, fn); return true; },
    unregister(a) { held.delete(a); },
  };
  return gs;
}
const dir = () => mkdtempSync(path.join(os.tmpdir(), 'hotkeys-test-'));
const acts = (log: string[]) => Object.fromEntries((Object.keys(KEYS) as KeyId[]).map((k) => [k, () => { log.push(k); }])) as unknown as Record<KeyId, () => void>;

test('good keys are tidied into Control, Alt, Shift, then the key', () => {
  assert.deepEqual(validAccelerator('Shift+Control+v'), { ok: true, acc: 'Control+Shift+V' });
  assert.deepEqual(validAccelerator('Control+nummult'), { ok: true, acc: 'Control+nummult' });
  assert.deepEqual(validAccelerator('Alt+f9'), { ok: true, acc: 'Alt+F9' });
  assert.deepEqual(validAccelerator('Ctrl+Plus'), { ok: true, acc: 'Control+=' });
  assert.deepEqual(validAccelerator('Control+Alt+P'), { ok: true, acc: 'Control+Alt+P' });
});

test('never a bare key, the Win key, system keys or the everyday ones', () => {
  for (const bad of ['V', 'F5', 'Shift+V', 'Shift+F5', 'Control', 'Control+Alt', 'Super+D', 'Meta+L', 'Control+Super+X', 'Command+Q', 'Alt+F4', 'Alt+Tab',
    'Alt+Space', 'Control+Alt+Delete', 'Control+Shift+Escape', 'Control+Escape', 'Escape', 'Control+C', 'Control+V', 'Control+X', 'Control+Z', 'Control+A',
    'Control+Alt+Left', 'Control+A+B', 'Control+Control+A', 'Control++', '', 'Control+Enter', 'Control+PrintScreen', 'Control+é', 'x'.repeat(60), 5, null, { a: 1 }]) {
    assert.equal(validAccelerator(bad).ok, false, JSON.stringify(bad));
  }
});

test('the + keys come in pairs; chips and words read as the sheet', () => {
  assert.deepEqual(twins('Control+='), ['Control+=', 'Control+numadd']);
  assert.deepEqual(twins('Control+Shift+numadd'), ['Control+Shift+=', 'Control+Shift+numadd']);
  assert.deepEqual(twins('Control+Shift+V'), ['Control+Shift+V']);
  assert.deepEqual(chips('Control+Shift+='), ['CTRL', 'SHIFT', '+']);
  assert.deepEqual(chips('Control+nummult'), ['CTRL', '*']);
  assert.deepEqual(chips('Escape'), ['ESC']);
  assert.equal(words('Control+Shift+V'), 'Ctrl + Shift + V');
  assert.equal(words('Control+nummult'), 'Ctrl + *');
  assert.equal(words('Alt+F9'), 'Alt + F9');
});

test('a clash with another of ours names it, pad twins and fixed keys included', () => {
  const now = readKeys(dir());
  assert.equal(ourClash('snip', 'Control+numadd', now), 'Talk to Aang');
  assert.equal(ourClash('note', 'Control+Shift+V', now), 'Show / hide the pop-out');
  assert.equal(ourClash('pin', 'Control+Alt+P', now), null);   // its own key is not a clash
  assert.equal(ourClash('note', 'Control+Alt+N', now), null);
});

test('defaults: Ctrl+Plus, Ctrl+Shift+Plus, Ctrl+Shift+V, the new Ctrl+*, Ctrl+Alt+P', () => {
  assert.deepEqual(readKeys(dir()), { talk: 'Control+=', snip: 'Control+Shift+=', popout: 'Control+Shift+V', note: 'Control+nummult', pin: 'Control+Alt+P' });
});

test('held while wanted; let go while the menu listens; a press runs its action', () => {
  const gs = fakeKeys(), log: string[] = [];
  const k = new HotkeyKeeper(dir(), gs, acts(log));
  k.want('talk', true); k.want('note', true); k.want('popout', true);
  assert.deepEqual([...gs.held.keys()].sort(), ['Control+=', 'Control+Shift+V', 'Control+nummult', 'Control+numadd'].sort());
  gs.held.get('Control+numadd')!(); gs.held.get('Control+nummult')!();
  assert.deepEqual(log, ['talk', 'note']);
  k.pause(true);
  assert.equal(gs.held.size, 0);
  k.want('pin', true);                          // something came up while listening: still let go
  assert.equal(gs.held.size, 0);
  k.pause(false);
  assert.equal(gs.held.size, 5);
  k.want('pin', false); k.want('talk', false);
  assert.deepEqual([...gs.held.keys()].sort(), ['Control+Shift+V', 'Control+nummult']);
});

test('a change is held at once, kept, and the old key let go', () => {
  const d = dir(), gs = fakeKeys();
  const k = new HotkeyKeeper(d, gs, acts([]));
  k.want('popout', true);
  assert.deepEqual(k.change('popout', 'Control+Alt+V'), { ok: true });
  assert.ok(gs.held.has('Control+Alt+V') && !gs.held.has('Control+Shift+V'));
  assert.equal(readKeys(d).popout, 'Control+Alt+V');
  // The pop-out's own file (read by the Mac and hotkey.ts) says the same.
  assert.equal(JSON.parse(readFileSync(path.join(d, 'popout-hotkey.json'), 'utf8')).hotkey, 'Control+Alt+V');
  // A key not held right now (the pin, nothing up) is tested with Windows, then let go again.
  assert.deepEqual(k.change('pin', 'Control+Alt+O'), { ok: true });
  assert.ok(!gs.held.has('Control+Alt+O'));
  assert.equal(new HotkeyKeeper(d, fakeKeys(), acts([])).keys.pin, 'Control+Alt+O');
});

test('taken by another program: refused, the old key stays held', () => {
  const d = dir(), gs = fakeKeys(['Control+Shift+S']);
  const k = new HotkeyKeeper(d, gs, acts([]));
  k.want('note', true);
  assert.deepEqual(k.change('note', 'Control+Shift+S'), { ok: false, why: 'taken' });
  assert.ok(gs.held.has('Control+nummult'));
  assert.equal(readKeys(d).note, 'Control+nummult');
});

test('ours, bad, and unknown rows are refused without touching anything', () => {
  const gs = fakeKeys();
  const k = new HotkeyKeeper(dir(), gs, acts([]));
  k.want('snip', true);
  assert.deepEqual(k.change('snip', 'Control+numadd'), { ok: false, why: 'ours', by: 'Talk to Aang' });
  assert.equal((k.change('snip', 'Alt+F4') as { why: string }).why, 'bad');
  assert.equal((k.change('copy', 'Control+Alt+K') as { why: string }).why, 'bad');
  assert.equal((k.change('__proto__', 'Control+Alt+K') as { why: string }).why, 'bad');
  assert.ok(gs.held.has('Control+Shift+=') && gs.held.has('Control+Shift+numadd'));
});

test('put them all back, even two that swapped', () => {
  const d = dir();
  writeFileSync(path.join(d, 'hotkeys.json'), JSON.stringify({ talk: 'Control+Alt+T', snip: 'Control+Alt+S' }));
  const gs = fakeKeys(), k = new HotkeyKeeper(d, gs, acts([]));
  k.want('talk', true);
  assert.deepEqual(k.change('snip', 'Control+Alt+Y'), { ok: true });
  assert.deepEqual(k.reset(), []);
  assert.deepEqual(k.keys, readKeys(dir()));
  assert.ok(gs.held.has('Control+=') && !gs.held.has('Control+Alt+T'));
});

test('a hand-mangled file falls back to the defaults', () => {
  const d = dir();
  writeFileSync(path.join(d, 'hotkeys.json'), JSON.stringify({ talk: 'Alt+F4', snip: 'Control+=', note: 'Super+N' }));
  const now = readKeys(d);
  assert.equal(now.talk, 'Control+=');
  assert.equal(now.snip, 'Control+Shift+=');     // a clash with Talk goes back to its default
  assert.equal(now.note, 'Control+nummult');
  writeFileSync(path.join(d, 'hotkeys.json'), '{not json');
  assert.equal(readKeys(d).talk, 'Control+=');
});
