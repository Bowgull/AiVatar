// Autofill (sheet 77): the page's preload cannot import anything, so it carries its own copy of the box reader; this keeps
// that copy and src/autofill.ts FIELD_KIND_JS the same, line for line. And his details are cleaned before they are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIELD_KIND_JS, cleanDetails, detailFor } from '../src/autofill.ts';

const norm = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
test('the preload reads boxes exactly as autofill does', () => {
  const pre = readFileSync(path.join(import.meta.dirname, '..', 'src', 'tabpreload.cjs'), 'utf8');
  const start = pre.indexOf('function fieldKind(el) {'), end = pre.indexOf('\n    }\n', start);
  assert.ok(start > 0 && end > start, 'fieldKind is in the preload');
  assert.equal(norm(pre.slice(start, end + 6)), norm(FIELD_KIND_JS));
});
test('his details: short plain text, real-looking emails, at most five', () => {
  const d = cleanDetails({ name: '  Alex\u0007 Example ', emails: ['a@b.co', 'not an email', 'a@b.co', 'c@d.io', 'e@f.io', 'g@h.io', 'i@j.io', 'k@l.io'], phone: 5550142, extra: 'dropped' });
  assert.equal(d.name, 'Alex Example');
  assert.deepEqual(d.emails, ['a@b.co', 'c@d.io', 'e@f.io', 'g@h.io', 'i@j.io']);
  assert.equal(d.phone, '5550142');
  assert.equal((d as unknown as Record<string, unknown>).extra, undefined);
  assert.equal(detailFor(d, 'given'), 'Alex');
  assert.equal(detailFor(d, 'family'), 'Example');
  assert.equal(detailFor(d, 'email', 1), 'c@d.io');
});
test('his phone is tidied, other countries kept as typed (sheet 83 v4)', () => {
  assert.equal(cleanDetails({ phone: '416-555-0142' }).phone, '(416) 555-0142');
  assert.equal(cleanDetails({ phone: '1 416 555 0142' }).phone, '+1 (416) 555-0142');
  assert.equal(cleanDetails({ phone: '+44 20 7946 0958' }).phone, '+44 20 7946 0958');
});
test('first and last name kept apart, as he typed them (sheet 83 v3)', () => {
  const d = cleanDetails({ given: 'Mary Ann', family: 'van der Berg', name: 'ignored' });
  assert.equal(detailFor(d, 'given'), 'Mary Ann');
  assert.equal(detailFor(d, 'family'), 'van der Berg');
  assert.equal(detailFor(d, 'name'), 'Mary Ann van der Berg');
});
