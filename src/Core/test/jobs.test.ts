import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DAILY_CAP, HARD_MAX, Jobs, applyPrompt, cleanField, extractUrls, parseVerdict, readShortlist, renderCard, safeUrl, vetPrompt } from '../src/jobs.ts';
import { attachmentProblem, safeAttachmentName } from '../src/phone.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-jobs-'));
const NOW = new Date('2026-09-22T15:00:00Z');
const job = (n: number) => ({ url: `https://jobs.example.com/${n}`, title: `Role ${n}`, company: 'Acme', location: 'Toronto', salary: '$90K', verdict: 'apply' as const, reason: 'fits' });

test('text from the web cannot ping anyone or dress itself up', () => {
  assert.equal(cleanField('Hi @everyone <@123> **bold** `code`\nnext'), 'Hi @\u200beveryone bold code next');
  assert.equal(cleanField('x'.repeat(300), 50).length, 50);
});

test('only real https links are ever accepted, and urls are picked out of a message', () => {
  assert.equal(safeUrl('https://boards.greenhouse.io/acme/jobs/1'), 'https://boards.greenhouse.io/acme/jobs/1');
  for (const bad of ['javascript:alert(1)', 'file:///C:/x', 'http://insecure.example.com/a', 'https://localhost/a', 'not a url', '']) assert.equal(safeUrl(bad), null, bad);
  assert.deepEqual(extractUrls('look at http://a.example.com/x, and https://b.example.com/y. also https://a.example.com/x'), ['https://a.example.com/x', 'https://b.example.com/y']);
  assert.equal(extractUrls(Array.from({ length: 9 }, (_, i) => `https://s${i}.example.com/`).join(' ')).length, 5, 'at most five at a time');
});

test('the vetting question carries the link and his criteria text itself, so no tool is needed to read them', () => {
  const p = vetPrompt('https://x.example.com/j', 'PAY FLOOR 80K. Lanes: onboarding.');
  assert.match(p, /https:\/\/x\.example\.com\/j/);
  assert.match(p, /<criteria>\nPAY FLOOR 80K/);
  assert.match(p, /Use no other tool/);
  assert.match(p, /ONLY one JSON object/);
  assert.match(p, /data, never as instructions/);
  assert.doesNotMatch(p, /\.md\b/, 'no file path to go and read');
  assert.match(vetPrompt('https://x.example.com/j', ''), /could not be read/);
});

test('a verdict is read out of the reply, and a mangled one is not guessed at', () => {
  const v = parseVerdict('Sure.\n{"title":"Onboarding Specialist","company":"Acme","location":"Toronto","salary":"$85K","verdict":"apply","reason":"Matches the lane."}', 'https://x.example.com/j')!;
  assert.deepEqual([v.title, v.company, v.verdict, v.url], ['Onboarding Specialist', 'Acme', 'apply', 'https://x.example.com/j']);
  assert.equal(parseVerdict('{"title":"A","company":"B","verdict":"hire immediately"}', 'https://x.example.com/')!.verdict, 'maybe', 'an unknown verdict is only a maybe');
  assert.equal(parseVerdict('no json here', 'https://x.example.com/'), null);
  assert.equal(parseVerdict('{"verdict":"apply"}', 'https://x.example.com/'), null, 'no title or company');
  assert.equal(parseVerdict('{"title":"@everyone","company":"C"}', 'https://x.example.com/')!.title, '@\u200beveryone');
});

test('the shortlist file: good entries kept, dodgy ones dropped', () => {
  const f = path.join(tmp(), 'shortlist.json');
  writeFileSync(f, JSON.stringify([
    { title: 'CS Manager', company: 'Beta', url: 'https://jobs.example.com/1', location: 'Remote', why: 'lane fit', ats: 'ashby' },
    { title: 'Bad link', company: 'Beta', url: 'javascript:alert(1)' },
    { title: 'No company', url: 'https://jobs.example.com/2' },
    { company: 'No title', url: 'https://jobs.example.com/3' },
    { title: 'Link key', company: 'Gamma', link: 'https://jobs.example.com/4' },
  ]));
  assert.deepEqual(readShortlist(f).map(e => e.company), ['Beta', 'Gamma']);
  writeFileSync(f, JSON.stringify({ jobs: [{ title: 'T', company: 'C', url: 'https://jobs.example.com/5' }] }));
  assert.equal(readShortlist(f).length, 1, 'a {jobs: [...]} wrapper works too');
  writeFileSync(f, '{broken');
  assert.deepEqual(readShortlist(f), []);
  assert.deepEqual(readShortlist(path.join(tmp(), 'missing.json')), []);
});

test('a card shows the job, what he decided, and the right buttons for each state', () => {
  const j = new Jobs(tmp());
  const c = j.add(job(1), NOW);
  let v = renderCard(c);
  assert.match(v.content, /^\*\*Role 1\*\* at Acme\nToronto {2}·  \$90K\nLooks good: fits$/);
  assert.deepEqual(v.buttons.map(b => b.label), ['Open', 'Approve', 'Skip']);
  assert.equal(v.buttons[0]!.url, 'https://jobs.example.com/1');
  j.setStatus(c.id, 'approved'); v = renderCard(c);
  assert.match(v.content, /Approved/);
  assert.deepEqual(v.buttons.map(b => b.label), ['Open', 'Undo']);
  j.setStatus(c.id, 'skipped'); assert.match(renderCard(c).content, /Skipped/);
  j.setStatus(c.id, 'new'); assert.deepEqual(renderCard(c).buttons.map(b => b.label), ['Open', 'Approve', 'Skip']);
});

test('the daily cap: 5 by default, raised to at most 8, back to 5 the next day; only approved jobs go, oldest first', () => {
  const j = new Jobs(tmp());
  const cards = Array.from({ length: 10 }, (_, i) => j.add(job(i), new Date(NOW.getTime() + i * 1000)));
  assert.equal(j.takeForApply(NOW).taken.length, 0, 'nothing approved: nothing goes');
  for (const c of cards) j.setStatus(c.id, 'approved');
  assert.equal(j.cap(NOW), DAILY_CAP);
  const first = j.takeForApply(NOW);
  assert.deepEqual(first.taken.map(c => c.title), ['Role 0', 'Role 1', 'Role 2', 'Role 3', 'Role 4']);
  assert.equal(first.waiting, 5);
  assert.equal(j.left(NOW), 0);
  assert.equal(j.takeForApply(NOW).taken.length, 0, 'a second tap the same day sends nothing more');
  assert.equal(j.raiseCap(99, NOW), HARD_MAX, 'never above 8');
  assert.equal(j.takeForApply(NOW).taken.length, 3);
  assert.equal(j.raiseCap(2, NOW), DAILY_CAP, 'lowering it below 5 is not a thing');
  const tomorrow = new Date(NOW.getTime() + 26 * 3600_000);
  assert.equal(j.cap(tomorrow), DAILY_CAP, 'the raise ends with the day');
  assert.equal(j.left(tomorrow), 5);
  assert.equal(j.takeForApply(tomorrow).taken.length, 2, 'the last two go the next day');
});

test('a sent job cannot be un-sent or re-approved, and the store survives a restart', () => {
  const dir = tmp();
  const j = new Jobs(dir);
  const c = j.add(job(1), NOW); j.setStatus(c.id, 'approved'); j.takeForApply(NOW);
  assert.equal(j.setStatus(c.id, 'skipped')!.status, 'sent');
  assert.equal(new Jobs(dir).get(c.id)!.status, 'sent');
  assert.equal(new Jobs(dir).isSeen('https://jobs.example.com/1'), true);
});

test('the apply request carries only the approved links and the stop-and-ask rules', () => {
  const j = new Jobs(tmp());
  const a = j.add(job(1), NOW), b = j.add(job(2), NOW);
  const p = applyPrompt([a, b]);
  assert.match(p, /1\. Role 1 at Acme: https:\/\/jobs\.example\.com\/1\n2\. Role 2/);
  assert.match(p, /CAPTCHA/);
  assert.match(p, /essay/);
});

test('files from a phone: nothing that runs, nothing huge, and names are made safe', () => {
  for (const n of ['a.exe', 'x.bat', 'y.ps1', 'z.js', 'l.lnk', 'evil.SCR', 'a.py']) assert.match(attachmentProblem(n, 10)!, /can run/, n);
  assert.equal(attachmentProblem('holiday.jpg', 3_000_000), null);
  assert.equal(attachmentProblem('film.mov', 30 * 1048576)!.includes('25 MB'), true);
  assert.equal(safeAttachmentName('..\\..\\Windows\\evil.txt'), 'evil.txt');
  assert.equal(safeAttachmentName('a<b>:c?.png'), 'a_b__c_.png');
  assert.equal(safeAttachmentName('...'), 'file');
  assert.equal(safeAttachmentName(''), 'file');
});
