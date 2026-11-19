// The secret window's sealed folder (his rule, 2026-11-19: "It CANNOT leak anywhere"). Locked means unreadable on disk;
// the key opens only after his PIN; plain files from before are sealed and their plain copy scrubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SealedDir, isSealed, openBytes, sealBytes, type Keychain } from '../src/sealdir.ts';
import { writeFileAtomic, writeFileAtomicSoon } from '../src/atomic.ts';
import { readJson } from '../src/store.ts';
import { SessionStore } from '../src/sessionstore.ts';
import { Visits } from '../src/visits.ts';

/** A stand-in Keychain: reversible, and it can refuse. */
const kc = (o: { refuse?: boolean } = {}): Keychain & { opened: number } => {
  const k = { opened: 0,
    lock: (s: string) => (o.refuse ? null : 'kc:' + Buffer.from(s).toString('base64')),
    open: (b: string) => { k.opened++; return o.refuse || !b.startsWith('kc:') ? null : Buffer.from(b.slice(3), 'base64').toString(); } };
  return k;
};
const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), 'seal-')); const s = path.join(d, 'secret'); mkdirSync(s); return { d, s }; };
const bytes = (f: string) => readFileSync(f);

test('seal and open: the same bytes back, and a wrong key or a changed byte gives nothing', () => {
  const k = Buffer.alloc(32, 7), s = sealBytes(k, 'https://hidden.example/page');
  assert.ok(isSealed(s));
  assert.ok(!s.toString('latin1').includes('hidden.example'));
  assert.equal(openBytes(k, s)?.toString(), 'https://hidden.example/page');
  assert.equal(openBytes(Buffer.alloc(32, 8), s), null);
  const t = Buffer.from(s); t[t.length - 1]! ^= 1;
  assert.equal(openBytes(k, t), null);
});

test('locked: nothing is written in the folder and nothing in it can be read; other files are untouched', () => {
  const { d, s } = tmp();
  const room = new SealedDir(s, kc());
  const f = path.join(s, 'browser-history.json');
  writeFileAtomic(f, JSON.stringify([{ url: 'https://hidden.example/' }]));
  assert.ok(!existsSync(f), 'a write while locked is dropped, never plain');
  const other = path.join(d, 'browser-history.json');
  writeFileAtomic(other, '[1]');
  assert.equal(readFileSync(other, 'utf8'), '[1]', 'normal Samara\'s files pass untouched');
  assert.equal(room.isOpen, false);
  // the plain files of the folder itself stay plain (the PIN's seal, the window's place)
  writeFileAtomic(path.join(s, 'browser-window.json'), '{"x":1}');
  assert.equal(readFileSync(path.join(s, 'browser-window.json'), 'utf8'), '{"x":1}');
});

test('open: every write is sealed on disk and read back through the store; locked again, it reads as missing', async () => {
  const { s } = tmp();
  const k = kc();
  const room = new SealedDir(s, k);
  assert.equal(room.open(), 'open');
  const key = JSON.parse(readFileSync(path.join(s, 'secret-key.json'), 'utf8'));
  assert.match(key.sealed, /^kc:/, 'the key itself is kept only sealed by the Keychain');
  const f = path.join(s, 'browser-bookmarks.json');
  writeFileAtomic(f, JSON.stringify([{ url: 'https://hidden.example/', title: 'Hidden' }]));
  await writeFileAtomicSoon(path.join(s, 'browser-favicons.json'), JSON.stringify({ 'hidden.example': 'data:image/png;base64,AA' }));
  for (const n of ['browser-bookmarks.json', 'browser-favicons.json']) {
    const b = bytes(path.join(s, n));
    assert.ok(isSealed(b) && !b.toString('latin1').includes('hidden'), `${n} sealed`);
  }
  assert.equal(readJson<any[]>(f, [])[0].url, 'https://hidden.example/');
  room.close();
  assert.deepEqual(readJson<any[]>(f, []), [], 'locked: as if there were none');
  // and opened again (his PIN), with the key from the Keychain
  assert.equal(room.open(), 'open');
  assert.equal(readJson<any[]>(f, [])[0].title, 'Hidden');
  room.close();
});

test('the tabs (and their kept copies) and the history go through it too', () => {
  const { s } = tmp();
  const room = new SealedDir(s, kc());
  room.open();
  const st = new SessionStore(path.join(s, 'browser-tabs.json'), () => {});
  const tabs = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://hidden.example/${i}`, title: 't' })) as never;
  st.write({ tabs: tabs(6), active: 0 } as never, { now: true });
  st.write({ tabs: tabs(1), active: 0 } as never, { now: true });           // a big drop keeps a copy first
  const kept = path.join(s, 'browser-tabs-kept');
  assert.ok(existsSync(kept) && readdirSync(kept).length === 1);
  for (const f of [path.join(s, 'browser-tabs.json'), path.join(kept, readdirSync(kept)[0]!)]) assert.ok(isSealed(bytes(f)), path.basename(f));
  assert.equal((st.read()?.tabs as any[]).length, 1);
  const v = new Visits(path.join(s, 'browser-history.json'));
  v.add('https://hidden.example/x', 'X'); v.flush();
  assert.ok(isSealed(bytes(path.join(s, 'browser-history.json'))));
  assert.equal(new Visits(path.join(s, 'browser-history.json')).list[0]?.url, 'https://hidden.example/x');
  room.close();
  assert.equal(new SessionStore(path.join(s, 'browser-tabs.json'), () => {}).read(), null, 'locked: no tabs to read');
  assert.equal(new Visits(path.join(s, 'browser-history.json')).list.length, 0);
});

test('first unlock: the plain files from before are sealed, their plain copy scrubbed, half-saves removed', () => {
  const { s } = tmp();
  const plainTabs = JSON.stringify({ tabs: [{ url: 'https://hidden.example/old' }] });
  writeFileSync(path.join(s, 'browser-tabs.json'), plainTabs);
  mkdirSync(path.join(s, 'browser-tabs-kept'));
  writeFileSync(path.join(s, 'browser-tabs-kept', 'a.json'), plainTabs);
  writeFileSync(path.join(s, 'browser-history.json.123.tmp'), 'https://hidden.example/torn');
  writeFileSync(path.join(s, 'secret-pin.json'), '{"v":1,"sealed":"x"}');
  const room = new SealedDir(s, kc());
  assert.deepEqual(readJson(path.join(s, 'browser-tabs.json'), null), null, 'before the PIN, even a plain file reads as nothing');
  room.open();
  const all = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = path.join(d, n); try { return readdirSync(f).length >= 0 ? all(f) : []; } catch { return [f]; } });
  for (const f of all(s)) {
    const b = bytes(f);
    assert.ok(!b.toString('latin1').includes('hidden.example'), `${path.relative(s, f)} has no plain address left`);
  }
  assert.ok(!existsSync(path.join(s, 'browser-history.json.123.tmp')));
  assert.equal(readFileSync(path.join(s, 'secret-pin.json'), 'utf8'), '{"v":1,"sealed":"x"}', 'the PIN\'s own seal is left as it is (its length too)');
  assert.equal(readJson<any>(path.join(s, 'browser-tabs.json'), null).tabs[0].url, 'https://hidden.example/old');
  assert.equal(room.moveIn(), 0, 'nothing left to move');
  room.close();
});

test('a move cut short by a crash is finished next time, with no plain copy left', () => {
  const { s } = tmp();
  const k = kc();
  const first = new SealedDir(s, k); first.open();
  const sealed = first.seal(JSON.stringify({ tabs: [{ url: 'https://hidden.example/crash' }] }))!;
  first.close();
  writeFileSync(path.join(s, 'browser-tabs.json'), JSON.stringify({ tabs: [{ url: 'https://hidden.example/crash' }] }));
  writeFileSync(path.join(s, 'browser-tabs.json.sealing'), sealed);
  const room = new SealedDir(s, k); room.open();
  assert.ok(!existsSync(path.join(s, 'browser-tabs.json.sealing')));
  assert.ok(isSealed(bytes(path.join(s, 'browser-tabs.json'))));
  assert.equal(readJson<any>(path.join(s, 'browser-tabs.json'), null).tabs[0].url, 'https://hidden.example/crash');
  room.close();
});

test('the Keychain refusing: the folder stays shut and nothing is made in the clear', () => {
  const { s } = tmp();
  const room = new SealedDir(s, kc({ refuse: true }));
  assert.equal(room.open(), 'keychain');
  assert.equal(room.isOpen, false);
  assert.ok(!existsSync(path.join(s, 'secret-key.json')));
  writeFileAtomic(path.join(s, 'browser-history.json'), '["https://hidden.example/"]');
  assert.ok(!existsSync(path.join(s, 'browser-history.json')));
});

test('a new PIN after his Mac password keeps everything: the key does not depend on the PIN', () => {
  const { s } = tmp();
  const k = kc();
  const a = new SealedDir(s, k); a.open();
  writeFileAtomic(path.join(s, 'browser-bookmarks.json'), '[{"url":"https://hidden.example/","title":"x"}]');
  a.close();
  // the PIN's seal is wiped and a new one made (browser.ts); the folder's key is untouched by that
  writeFileSync(path.join(s, 'secret-pin.json'), '{"v":1,"sealed":"new"}');
  const b = new SealedDir(s, k);
  assert.equal(b.open(), 'open');
  assert.equal(readJson<any[]>(path.join(s, 'browser-bookmarks.json'), [])[0].url, 'https://hidden.example/');
  b.close();
});
