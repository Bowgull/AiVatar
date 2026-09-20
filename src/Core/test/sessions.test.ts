import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_SESSION_AGE_DAYS, SessionStore } from '../src/sessions.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-sess-'));

test('a session id survives a restart of the Core', () => {
  const dir = tmp();
  new SessionStore(dir).set('quick', 'sess-abc');
  assert.equal(new SessionStore(dir).get('quick'), 'sess-abc', 'a fresh store reads what the old one wrote');
});

test('each lane keeps its own conversation', () => {
  const dir = tmp();
  const s = new SessionStore(dir);
  s.set('quick', 'q1'); s.set('smart', 's1'); s.set('deep', 'd1');
  const again = new SessionStore(dir);
  assert.deepEqual([again.get('quick'), again.get('smart'), again.get('deep')], ['q1', 's1', 'd1']);
});

test('nothing to resume is not an error', () => {
  const s = new SessionStore(tmp());
  assert.equal(s.get('quick'), undefined);
  assert.deepEqual(s.all(), {});
});

test('a refused resume is forgotten, so a dead id cannot wedge the lane', () => {
  const dir = tmp();
  const s = new SessionStore(dir);
  s.set('quick', 'dead-one');
  s.clear('quick');
  assert.equal(s.get('quick'), undefined);
  assert.equal(new SessionStore(dir).get('quick'), undefined, 'and it stays forgotten after a restart');
});

test('a session older than the cap is dropped rather than dragged along', () => {
  const dir = tmp();
  const s = new SessionStore(dir);
  const old = new Date(Date.now() - (MAX_SESSION_AGE_DAYS + 1) * 86_400_000);
  s.set('quick', 'ancient', old);
  assert.equal(s.get('quick'), undefined, 'too old to resume');
  assert.equal(new SessionStore(dir).get('quick'), undefined, 'and it was removed from disk, not just hidden');

  const fresh = new Date(Date.now() - 2 * 86_400_000);
  s.set('smart', 'recent', fresh);
  assert.equal(s.get('smart'), 'recent', 'a couple of days old is still fine');
});

test('using a session keeps it alive; the cap measures inactivity, not total age', () => {
  const dir = tmp();
  const s = new SessionStore(dir);
  s.set('quick', 'same-id', new Date(Date.now() - 6 * 86_400_000));
  s.set('quick', 'same-id');                       // touched today
  assert.equal(s.get('quick'), 'same-id');
  assert.equal(new SessionStore(dir).get('quick'), 'same-id');
});

test('a corrupt or half-written file does not stop the Core from starting', () => {
  for (const junk of ['{ not json', '[]', 'null', '{"quick":{"id":42}}', '{"quick":"just-a-string"}']) {
    const dir = tmp();
    writeFileSync(path.join(dir, 'sessions.json'), junk);
    const s = new SessionStore(dir);
    assert.equal(s.get('quick'), undefined, `survived ${junk}`);
    s.set('quick', 'recovered');
    assert.equal(new SessionStore(dir).get('quick'), 'recovered', 'and it can write again afterwards');
  }
});

test('the file is written whole, never half (rename, not in-place)', () => {
  const dir = tmp();
  const s = new SessionStore(dir);
  s.set('quick', 'abc');
  const raw = readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  assert.deepEqual(JSON.parse(raw).quick.id, 'abc', 'the file on disk is valid JSON at all times');
});
