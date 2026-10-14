import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { digest, line, topPay } from '../src/driverrules.ts';
import { judge, sweepCompanies, type Opening } from '../src/atswatch.ts';
import { checkCompanies } from '../src/claudedoor.ts';

const p = (title: string, company: string, extra: Record<string, string> = {}) => ({ title, company, location: 'Toronto, ON (Hybrid)', url: `https://x/${title}/${company}`, ...extra });

test('his calls 2026-10-14: Account Executive comes through flagged, not skipped', () => {
  const d = digest([p('Account Executive', 'BoomerangFX')], new Set());
  assert.equal(d.match.length, 1);
  assert.match(line(d.match[0]!), /sales role: check the commission and quota/);
});

test('mid-level first: enterprise and $120K+ roles stay, below', () => {
  const d = digest([p('Enterprise Customer Success Manager', 'Big'), p('Customer Success Manager', 'Rich', { salary: 'CA$110K/yr - CA$130K/yr' }), p('Customer Success Manager', 'Small', { salary: 'CA$80K/yr - CA$95K/yr' })], new Set());
  assert.deepEqual(d.match.map((x) => x.company), ['Small', 'Big', 'Rich']);
  assert.match(line(d.match[1]!), /aims high/);
});

test('stale, reposted and the same job on two boards are counted, not listed', () => {
  const d = digest([p('Onboarding Specialist', 'A', { posted: '1 month ago' }), p('Onboarding Specialist', 'B', { text: 'Reposted 2 days ago' }),
    p('Implementation Specialist', 'C'), { ...p('Implementation Specialist', 'C'), url: 'https://indeed/other' }, p('Account Manager', 'D', { posted: '3 days ago' })], new Set());
  assert.equal(d.stale, 2);
  assert.equal(d.dupes, 1);
  assert.deepEqual(d.match.map((x) => x.company), ['C', 'D']);
});

test('pay: yearly top from K, commas and hourly', () => {
  assert.equal(topPay('CA$80K/yr - CA$95K/yr'), 95_000);
  assert.equal(topPay('$40 an hour'), 83_200);
  assert.equal(topPay('$85,000 - $100,000'), 100_000);
  assert.equal(topPay('no pay'), null);
});

const o = (title: string, extra: Partial<Opening> = {}): Opening => ({ company: 'Co', ats: 'lever', id: title, title, location: 'Toronto, Ontario', url: 'https://jobs.lever.co/co/1', postedMs: Date.now(), payMin: 80_000, payMax: 95_000, text: '', ...extra });

test('target companies: AE flagged, enterprise flagged, ghost rules hold', () => {
  const ae = judge(o('Account Executive'));
  assert.ok(ae.keep && ae.flags.some((f) => /commission/.test(f)));
  const ent = judge(o('Enterprise Account Manager'));
  assert.ok(ent.keep && ent.flags.some((f) => /aims high/.test(f)));
  assert.deepEqual(judge(o('Customer Success Manager', { postedMs: Date.now() - 30 * 86_400_000 })), { keep: false, why: 'older than 21 days' });
  assert.equal((judge(o('Customer Success Manager', { text: 'This posting is not for an existing vacancy.' })) as any).why, 'not an existing vacancy');
  assert.equal((judge(o('Senior Customer Success Manager')) as any).why, 'his skip list');
});

test('target companies: mid-level sorted first', async () => {
  const body = [{ id: '1', text: 'Enterprise Customer Success Manager', hostedUrl: 'https://jobs.lever.co/co/1', categories: { location: 'Toronto, Ontario' }, createdAt: Date.now(), salaryRange: { min: 80000, max: 95000 } },
    { id: '2', text: 'Customer Success Manager', hostedUrl: 'https://jobs.lever.co/co/2', categories: { location: 'Toronto, Ontario' }, createdAt: Date.now(), salaryRange: { min: 80000, max: 95000 } }];
  const get = (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  const r = await sweepCompanies([{ company: 'Co', ats: 'lever', slug: 'co' }], new Set(), get);
  assert.deepEqual(r.fresh.map((x) => x.id), ['2', '1']);
});

test('the door checks only companies he approved, and only when asked', async () => {
  const data = mkdtempSync(path.join(os.tmpdir(), 'tc-')), state = mkdtempSync(path.join(os.tmpdir(), 'tcs-'));
  process.env.JOB_HUNT_DATA = data;
  assert.equal((await checkCompanies(state)).ok, false);
  writeFileSync(path.join(data, 'target-companies.json'), JSON.stringify({ companies: [{ company: 'Yes', ats: 'lever', slug: 'yes', approved: true }, { company: 'No', ats: 'lever', slug: 'no' }, { company: 'Bad', ats: 'lever', slug: '../x', approved: true }] }));
  const asked: string[] = [];
  const get = (async (u: string) => { asked.push(u); return new Response('[]'); }) as unknown as typeof fetch;
  const r = await checkCompanies(state, [], get);
  assert.equal(r.ok, true);
  assert.deepEqual(asked, ['https://api.lever.co/v0/postings/yes?mode=json']);
});
