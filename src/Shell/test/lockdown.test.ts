// AI lockdown (2026-10-14, research_notes/samara-security/ai-driving-threats.md): the rules a driving session cannot
// talk its way around.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHost, paceFor, privateHost, siteOf, sweepPlan } from '../src/driverrules.ts';
import { neverKeep } from '../src/visits.ts';

test('G7: a trailing dot no longer slips past the bank block or the pace rule', () => {
  assert.equal(neverKeep('https://rbc.com./'), true);
  assert.equal(neverKeep('https://www.td.com.../login'), true);
  assert.ok(paceFor('www.linkedin.com.'), 'LinkedIn keeps a person\'s pace');
  assert.equal(cleanHost('WWW.LinkedIn.COM..'), 'www.linkedin.com');
  assert.match(String(sweepPlan('linkedin.com.', { path: '/jobs?q={q}', card: '.c' })), /never swept/);
});

test('G13: this computer, the home network and Tailscale are never opened', () => {
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '10.0.0.5', '192.168.1.20', '172.20.0.1', '169.254.1.1', '100.91.66.119', 'printer.local', 'mac.tail1234.ts.net', '[::1]', 'fd12::1', '0.0.0.0'])
    assert.equal(privateHost(h), true, h);
  for (const h of ['linkedin.com', '8.8.8.8', '172.32.0.1', '100.200.1.1', 'example.ca']) assert.equal(privateHost(h), false, h);
});

test('G8: each site has its own notes, even under shared endings', () => {
  assert.equal(siteOf('www.linkedin.com'), 'linkedin.com');
  assert.equal(siteOf('jobs.lever.co'), 'lever.co');
  assert.equal(siteOf('www.bbc.co.uk'), 'bbc.co.uk');
  assert.notEqual(siteOf('evil.github.io'), siteOf('good.github.io'));
  assert.notEqual(siteOf('a.vercel.app'), siteOf('b.vercel.app'));
});

test('G12: a backslash cannot turn a sweep into a trip to another site', () => {
  assert.equal(typeof sweepPlan('ca.indeed.com', { path: '/\\evil.example/x?q={q}', card: '.c' }), 'string');
  assert.equal(typeof sweepPlan('www.jobbank.gc.ca', { path: '/jobsearch?searchstring={q}', card: '.c' }), 'object');
});
