// E7: drive times from TomTom (a fake one here: no real lookups), always saying what was found, a weak match marked
// CHECK, times with am/pm in Toronto, and a Waze link to the exact spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Travel, sayDrive, sayFound, wazeLink, mins } from '../src/travel.ts';

function fake() {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    if (url.includes('/geocode/')) {
      const q = decodeURIComponent(url.split('/geocode/')[1]!.split('.json')[0]!);
      if (q.includes('nowhere')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      const weak = q.includes('King');
      return { ok: true, status: 200, json: async () => ({ results: [{ position: { lat: weak ? 43.6481 : 43.65, lon: weak ? -79.3868 : -79.38 }, address: { freeformAddress: weak ? '220 King Street West, Toronto ON M5H 1K4' : '1 Home Rd, Toronto ON' }, matchConfidence: { score: weak ? 0.7 : 0.99 } }] }) };
    }
    if (url.includes('/calculateRoute/')) {
      const arrive = /arriveAt=([^&]+)/.exec(url)?.[1];
      const arriveAt = arrive ? decodeURIComponent(arrive) : '2026-10-16T18:24:00Z';
      const departAt = new Date(Date.parse(arriveAt) - 24 * 60_000).toISOString();
      return { ok: true, status: 200, json: async () => ({ routes: [{ summary: { lengthInMeters: 7400, travelTimeInSeconds: 1440, trafficDelayInSeconds: 420, departureTime: departAt, arrivalTime: arriveAt } }] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetcher, asked };
}

test('no key: not ready, and nothing is looked up', () => {
  const t = new Travel(mkdtempSync(path.join(os.tmpdir(), 'aang-travel-')));
  assert.equal(t.ready, false);
  assert.equal(t.home, null);
});

test('a place is said back as TomTom found it; a weak match is a CHECK', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-travel-'));
  writeFileSync(path.join(dir, 'tomtom.json'), JSON.stringify({ key: 'k'.repeat(32) }));
  const { fetcher, asked } = fake();
  const t = new Travel(dir, fetcher as any);
  assert.equal(t.ready, true);
  const p = (await t.find('220 King St W, Toronto'))!;
  assert.equal(sayFound(p), 'CHECK: not a clear match. You said "220 King St W, Toronto"; TomTom found: 220 King Street West, Toronto ON M5H 1K4.');
  assert.match(asked[0]!, /countrySet=CA,US/);
  assert.equal(await t.find('nowhere at all'), null);
  const home = (await t.find('1 Home Rd'))!;
  assert.equal(sayFound(home).startsWith('CHECK'), false);
  t.setHome(home);
  assert.equal(t.home?.found, '1 Home Rd, Toronto ON');
});

test('the drive: time, distance, traffic, and with an invite the leave-by, in Toronto with am/pm', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-travel-'));
  writeFileSync(path.join(dir, 'tomtom.json'), JSON.stringify({ key: 'k'.repeat(32) }));
  const { fetcher, asked } = fake();
  const t = new Travel(dir, fetcher as any);
  const home = (await t.find('1 Home Rd'))!, to = (await t.find('220 King St W'))!;
  const r = await t.route(home, to, { arriveBy: '2026-10-16T18:00:00.000Z' });
  assert.match(asked.at(-1)!, /traffic=true/);
  assert.match(asked.at(-1)!, /arriveAt=2026-10-16T18%3A00%3A00\.000Z/);
  assert.equal(sayDrive(r, to, '2026-10-16T18:00:00.000Z'), '24 min by car (7.4 km); 7 min of that is traffic; to be there by 2:00 pm on Friday, October 16, leave by 1:36 pm. To: 220 King Street West, Toronto ON M5H 1K4.');
  assert.equal(wazeLink(to), 'https://waze.com/ul?ll=43.648100%2C-79.386800&navigate=yes');
  assert.equal(mins(90 * 60), '1 h 30 min');
});
