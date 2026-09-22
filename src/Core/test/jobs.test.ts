import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DAILY_CAP, HARD_MAX, Drafts, Jobs, applyPrompt, cleanField, extractUrls, parseVerdict, readAppliedFile, readDraftsFile, readShortlist, renderCard, renderDraft, safeUrl, scoreOf, verdictFor, vetPrompt } from '../src/jobs.ts';
import { attachmentProblem, safeAttachmentName } from '../src/phone.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-jobs-'));
const NOW = new Date('2026-09-22T15:00:00Z');
const job = (n: number) => ({ url: `https://jobs.example.com/${n}`, title: `Role ${n}`, company: 'Acme', location: 'Toronto', salary: '$90K', score: 85, verdict: 'apply' as const, reason: 'fits' });

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

test('the rubric: code does the arithmetic, the model only reports plain facts (2026-09-22)', () => {
  // A clean, full-fit posting: every point on offer.
  assert.equal(scoreOf({ lane: 'match', pay: 'meets', location: 'fit', exclusions: [] }), 100);
  assert.equal(verdictFor(100), 'apply');
  // Nothing stated: no guessing in its favour (unknown pay still earns a few points, same as "no exclusions
  // found" does - absence of a red flag is not nothing, but it is not a fit either).
  assert.equal(scoreOf({ lane: 'no', pay: 'unknown', location: 'no', exclusions: [] }), 30);
  assert.equal(verdictFor(30), 'skip');
  // A real dealbreaker caps the score regardless of how well everything else fits - it was never "minus a
  // few points" in his own criteria, it was a no.
  assert.equal(scoreOf({ lane: 'match', pay: 'meets', location: 'fit', exclusions: ['requires French'] }), 25);
  assert.equal(verdictFor(25), 'skip');
  // The boundaries: 70 is the lowest "apply", 40 the lowest "maybe", 39 falls to skip.
  assert.deepEqual([verdictFor(70), verdictFor(69), verdictFor(40), verdictFor(39)], ['apply', 'maybe', 'maybe', 'skip']);
});

test('a verdict is read out of the reply as a rubric, scored by code, and a mangled one is not guessed at', () => {
  const v = parseVerdict('Sure.\n{"title":"Onboarding Specialist","company":"Acme","location":"Toronto","salary":"$85K","laneFit":"match","payFit":"meets","locationFit":"fit","exclusions":[],"reason":"Matches the lane."}', 'https://x.example.com/j')!;
  assert.deepEqual([v.title, v.company, v.verdict, v.score, v.url], ['Onboarding Specialist', 'Acme', 'apply', 100, 'https://x.example.com/j']);
  const capped = parseVerdict('{"title":"A","company":"B","laneFit":"match","payFit":"meets","locationFit":"fit","exclusions":["needs French"]}', 'https://x.example.com/')!;
  assert.deepEqual([capped.verdict, capped.score], ['skip', 25], 'a real dealbreaker overrides an otherwise perfect fit');
  const blank = parseVerdict('{"title":"A","company":"B","laneFit":"hire immediately"}', 'https://x.example.com/')!;
  assert.deepEqual([blank.verdict, blank.score], ['skip', 30], 'an unrecognised or missing field never reads as a fit');
  assert.equal(parseVerdict('no json here', 'https://x.example.com/'), null);
  assert.equal(parseVerdict('{"laneFit":"match"}', 'https://x.example.com/'), null, 'no title or company');
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

test('a card is a real embed: stage, match and dates each their own field, and the right buttons for each state', () => {
  const j = new Jobs(tmp());
  const c = j.add(job(1), NOW);
  const field = (v: ReturnType<typeof renderCard>, name: string) => v.embed.fields?.find(f => f.name === name)?.value;
  let v = renderCard(c);
  assert.equal(v.content, '', 'the embed carries everything now, not a run-on line of text');
  assert.equal(v.embed.title, 'Role 1 at Acme');
  assert.equal(v.embed.description, 'fits');
  assert.equal(field(v, 'Match'), '85% · Looks good');
  assert.equal(field(v, 'Location'), 'Toronto');
  assert.equal(field(v, 'Salary'), '$90K');
  assert.equal(field(v, 'Stage'), 'New');
  assert.deepEqual(v.buttons.map(b => b.label), ['Open', 'Approve', 'Skip']);
  assert.equal(v.buttons[0]!.url, 'https://jobs.example.com/1');
  j.setStatus(c.id, 'approved'); v = renderCard(c);
  assert.equal(field(v, 'Stage'), 'Approved');
  assert.equal(v.embed.color, 0xffc43c, 'approved is Aang gold');
  assert.deepEqual(v.buttons.map(b => b.label), ['Open', '✓ Approved', 'Undo']);
  assert.equal(v.buttons[1]!.disabled, true, 'a finished step is greyed and cannot be pressed');
  j.setStatus(c.id, 'skipped'); v = renderCard(c);
  assert.equal(field(v, 'Stage'), 'Skipped');
  assert.match(v.embed.title!, /^~~.*~~$/, 'a skipped card is struck through');
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

// ---------------------------------------------------------------- answers he must approve, and what came of each application

test('drafts: read from the file, cleaned, given stable ids, and dodgy ones dropped', () => {
  const f = path.join(tmp(), 'drafts.json');
  writeFileSync(f, JSON.stringify([
    { company: 'Acme', title: 'CS Manager', url: 'https://jobs.example.com/1', question: 'Why do you want to work here?', draft: 'I like the work. @everyone <@123>' },
    { company: 'Acme', title: 'CS Manager', question: '   ', draft: 'no question' },
    { company: 'Acme', question: 'Salary?', draft: '' },
    { company: 'Beta', title: 'Onboarding', url: 'javascript:alert(1)', question: 'Notice period?', answer: 'Two weeks.' },
  ]));
  const d = readDraftsFile(f);
  assert.equal(d.length, 2, 'no question or no text: dropped');
  assert.equal(d[0]!.text, 'I like the work. @​everyone');
  assert.equal(d[1]!.url, '', 'a link that is not https is not kept');
  assert.equal(d[1]!.text, 'Two weeks.', 'the answer key works too');
  assert.equal(readDraftsFile(f)[0]!.id, d[0]!.id, 'the same draft always has the same id');
  assert.notEqual(d[0]!.id, d[1]!.id);
  assert.deepEqual(readDraftsFile(path.join(tmp(), 'nope.json')), []);
});

test('a draft card shows the words and the buttons for each state; only approved words are exported; his rewrite needs approving again', () => {
  const dir = tmp();
  const dr = new Drafts(dir);
  const d = dr.add({ id: 'abc1', company: 'Acme', title: 'CSM', url: 'https://jobs.example.com/1', question: 'Why us?', text: 'Because.' });
  let v = renderDraft(d);
  assert.match(v.content, /Answer to approve\*\* for CSM at Acme\n\*\*Question:\*\* Why us\?\n\*\*Draft:\*\*\nBecause\./);
  assert.match(v.content, /Reply to this message with your own wording/);
  assert.deepEqual(v.buttons.map(b => b.label), ['Approve these words', 'Skip']);
  assert.deepEqual(dr.approvedForExport(), [], 'nothing is exported before he approves');

  dr.setStatus('abc1', 'approved');
  assert.deepEqual(dr.approvedForExport(), [{ company: 'Acme', title: 'CSM', url: 'https://jobs.example.com/1', question: 'Why us?', answer: 'Because.' }]);
  v = renderDraft(dr.get('abc1')!);
  assert.match(v.content, /Approved\. The application can use exactly these words\./);
  assert.deepEqual(v.buttons.map(b => b.label), ['Undo']);

  dr.rewrite('abc1', 'In my own words.');
  assert.equal(dr.get('abc1')!.status, 'new', 'what was approved is not what is now here');
  assert.deepEqual(dr.approvedForExport(), []);
  assert.match(renderDraft(dr.get('abc1')!).content, /\*\*Your wording:\*\*\nIn my own words\./);
  assert.equal(new Drafts(dir).get('abc1')!.text, 'In my own words.', 'kept across a restart');
  const long = dr.add({ id: 'zz', company: '', title: '', url: '', question: 'Q', text: 'x'.repeat(3000) });
  assert.ok(renderDraft(long).content.length <= 1900, 'always fits a Discord message');
});

test('applied.json: submitted and stuck are told apart, notes cleaned, junk dropped', () => {
  const f = path.join(tmp(), 'applied.json');
  writeFileSync(f, JSON.stringify([
    { url: 'https://jobs.example.com/1', title: 'CSM', company: 'Acme', status: 'submitted', note: 'Confirmation: application received @everyone' },
    { url: 'https://jobs.example.com/2', title: 'Onb', company: 'Beta', status: 'Stuck', note: 'reCAPTCHA on the last step' },
    { url: 'https://jobs.example.com/3', status: 'maybe later' },
    { url: 'not a url', status: 'submitted' },
    { url: 'https://jobs.example.com/4', status: 'captcha' },
  ]));
  const a = readAppliedFile(f);
  assert.deepEqual(a.map(e => e.status), ['applied', 'stuck', 'stuck']);
  assert.equal(a[0]!.note, 'Confirmation: application received @​everyone');
});

test('a result updates the card, counts against the cap, and a sent job cannot be pulled back', () => {
  const j = new Jobs(tmp());
  const c = j.add({ url: 'https://jobs.example.com/1', title: 'T', company: 'C', location: '', salary: '', score: 85, verdict: 'apply', reason: '' }, NOW);
  j.setStatus(c.id, 'approved'); j.takeForApply(NOW);
  assert.equal(j.left(NOW), 4);
  assert.equal(j.recordResult('https://jobs.example.com/1', 'stuck', 'a CAPTCHA')!.status, 'stuck');
  assert.equal(j.left(NOW), 4, 'stuck still counts today');
  assert.equal(j.recordResult('https://jobs.example.com/1', 'stuck', 'a CAPTCHA'), null, 'the same news twice changes nothing');
  assert.equal(j.recordResult('https://jobs.example.com/1', 'applied', 'Confirmation 42')!.status, 'applied');
  assert.equal(c.appliedAt, '2026-09-22', 'the day it was first heard, not just buried in the result text');
  let v = renderCard(c);
  assert.equal(v.embed.fields?.find(f => f.name === 'Result')?.value, 'Confirmation 42');
  assert.equal(v.embed.fields?.find(f => f.name === 'Applied')?.value, '2026-09-22');
  assert.deepEqual(v.buttons.map(b => b.label), ['Open', '✓ Applied']);
  assert.equal(v.buttons[1]!.disabled, true, 'nothing left to press once it is applied');
  assert.equal(v.embed.color, 0x57f287, 'an applied card is green, same as a fresh strong match');
  assert.equal(j.setStatus(c.id, 'skipped')!.status, 'applied', 'no button can undo it now');
  assert.equal(j.recordResult('https://unknown.example.com/x', 'applied', ''), null);
  c.status = 'stuck'; c.result = 'a CAPTCHA';
  assert.equal(renderCard(c).embed.fields?.find(f => f.name === 'What it needs')?.value, 'a CAPTCHA');
});

test('the apply request names the approved-answers file and the report file', () => {
  const p = applyPrompt([]);
  assert.match(p, /answers-approved\.json/);
  assert.match(p, /exact words, unchanged/);
  assert.match(p, /drafts\.json/);
  assert.match(p, /applied\.json/);
});
