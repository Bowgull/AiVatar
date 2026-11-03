// Sheet 25: a route ask from the brain waits in the Shell until the Hyrule page can take it, survives a restart, is told
// "queued" once, and only goal shapes the map knows get through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RouteQueue, routeAsk, routeReport } from '../src/hyruleroute.ts';

test('only route asks the map knows get through', () => {
  const g = { kind: 'place', at: [1800, 990], name: 'General store (Kakariko Village)', icon: 'sheet-09/game/ShopYorozu.png' };
  assert.deepEqual(routeAsk({ id: 'route1', name: 'General store', goal: g }), { id: 'route1', name: 'General store', goal: g });
  assert.deepEqual(routeAsk({ id: 'route2', name: 'Kakariko', remove: 'Kakariko' }), { id: 'route2', name: 'Kakariko', remove: 'Kakariko' });
  for (const bad of [null, { id: 'x', name: 'a', goal: g }, { id: 'route3', name: '', goal: g }, { id: 'route3', name: 'a', goal: { kind: 'shell' } }, { id: 'route3', name: 'a', goal: { kind: 'item', id: 'x'.repeat(2000) } }])
    assert.equal(routeAsk(bad), null);
  assert.deepEqual(routeReport({ title: 'Your route', stops: 4 }), { title: 'Your route', stops: 4 });
  assert.equal(routeReport({ stops: -1 }), null);
});

test('the queue keeps asks across a restart, tells "queued" once, and empties when handed over', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'aang-route-')), 'hyrule-route.json');
  const q = new RouteQueue(file);
  q.add({ id: 'route1', name: 'Inn', goal: { kind: 'item', id: 'Item_Mushroom_E', n: 5 } });
  assert.deepEqual(q.untold().map((a) => a.id), ['route1']);
  assert.deepEqual(q.untold(), []);
  const again = new RouteQueue(file);
  assert.equal(again.size, 1);
  assert.deepEqual(again.take().map((a) => a.id), ['route1']);
  assert.equal(new RouteQueue(file).size, 0);
});
