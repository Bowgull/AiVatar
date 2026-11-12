// The Downloads engine's rules (Phase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SavePaths, programAsk, quarantineMark, safeName, sameSite, siteOfUrl, zoneMark } from '../src/downloads.ts';

test('names Windows or the Mac refuse are made safe, and never empty', () => {
  assert.equal(safeName('a<b>:c"d/e\\f|g?h*i.txt'), 'a_b__c_d_e_f_g_h_i.txt');
  assert.equal(safeName(''), 'download');
  assert.equal(safeName('..'), '_');
  assert.equal(safeName('report.pdf'), 'report.pdf');
});

test('two downloads with the same name get two files, even before either exists', () => {
  const on = new Set<string>();
  const p = new SavePaths((f) => on.has(f));
  const dir = path.join('C:', 'dl');
  const a = p.pick(dir, 'invoice.pdf'), b = p.pick(dir, 'invoice.pdf'), c = p.pick(dir, 'INVOICE.pdf');
  assert.equal(path.basename(a), 'invoice.pdf');
  assert.equal(path.basename(b), 'invoice (1).pdf');
  assert.equal(path.basename(c), 'INVOICE (2).pdf');           // Windows names ignore case
  assert.equal(p.size, 3);
  p.release(a);
  assert.equal(path.basename(p.pick(dir, 'invoice.pdf')), 'invoice.pdf');
});

test('a name already on disk is never reused', () => {
  const dir = path.join('C:', 'dl');
  const p = new SavePaths((f) => f === path.join(dir, 'x.zip') || f === path.join(dir, 'x (1).zip'));
  assert.equal(path.basename(p.pick(dir, 'x.zip')), 'x (2).zip');
});

test('a program from a trusted site, from that site, is not asked about', () => {
  const trusted = new Set(['github.com']);
  assert.equal(programAsk({ page: 'github.com', file: 'objects.githubusercontent.com', trusted: new Set(['github.com', 'objects.githubusercontent.com']), otherTrusts: new Set() }), null);
  assert.equal(programAsk({ page: 'github.com', file: 'release.github.com', trusted, otherTrusts: new Set() }), null);
});

test('a program from somewhere else, or a new site, is asked about with the right words', () => {
  const trusted = new Set(['github.com']);
  assert.match(programAsk({ page: 'github.com', file: 'evil.example', trusted, otherTrusts: new Set() })!.text, /comes from evil\.example, not github\.com/);
  assert.match(programAsk({ page: 'new.example', file: '', trusted, otherTrusts: new Set(['new.example']) })!.text, /other computer trusts new\.example/);
  assert.match(programAsk({ page: '', file: '', trusted, otherTrusts: new Set() })!.text, /this site has not given you one before/);
});

test('sites and marks', () => {
  assert.equal(siteOfUrl('https://www.example.com/a'), 'example.com');
  assert.equal(siteOfUrl('not a url'), '');
  assert.equal(sameSite('cdn.example.com', 'example.com'), true);
  assert.equal(sameSite('example.com.evil', 'example.com'), false);
  assert.equal(zoneMark('https://a.example/f.exe'), '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://a.example/f.exe\r\n');
  assert.equal(zoneMark('blob:x'), '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n');
  assert.equal(quarantineMark(0x10 * 1000), '0081;10;Samara;');
});
