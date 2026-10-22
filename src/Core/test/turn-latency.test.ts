import './_env.ts';
// The brain's own share of a reply's wait (2026-10-21, his "smoother and faster"): from his message arriving to the model
// being asked, and from the model's first words to the bubble getting them. Measured with a stub lane, so it costs
// nothing and runs every time; the model's own time is test/lane-latency-live.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-lat-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('his message reaches the model at once, and the first words reach the bubble within one flush', async () => {
  const core: any = new Core({ testDoor: true, port: 48171, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  let sentAt = 0;
  core.lane = () => ({ send: () => { sentAt = performance.now(); }, interrupt: async () => {}, start: () => {} });
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:48171/body');
  const seen: { t: string; at: number; m: any }[] = [];
  c.on('message', (d) => { const m = JSON.parse(String(d)); seen.push({ t: m.t, at: performance.now(), m }); });
  await new Promise<void>(r => c.once('open', () => r()));
  c.send(JSON.stringify({ t: 'hello', v: 1 }));
  await wait(150);
  try {
    const rows: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.length = 0; sentAt = 0;
      const t0 = performance.now();
      c.send(JSON.stringify({ t: 'submit', id: 'lat' + i, text: 'what is on my calendar tomorrow?' }));
      await wait(120);
      const ack = seen.find(s => s.t === 'ack'), dots = seen.find(s => s.t === 'bubble.dots');
      assert.ok(ack && dots && sentAt, 'acked, dots, and the model asked');
      const d0 = performance.now();
      core.onLaneEvent(core.active.lane, { t: 'delta', text: 'Tomorrow you have ', reset: false });
      await wait(150);
      const first = seen.find(s => s.t === 'bubble' && s.m.stream === true);
      assert.ok(first, 'the first words were streamed');
      rows.push(`submit->ack ${(ack!.at - t0).toFixed(1)} ms, submit->dots ${(dots!.at - t0).toFixed(1)} ms, submit->model ${(sentAt - t0).toFixed(1)} ms, first token->bubble ${(first!.at - d0).toFixed(1)} ms`);
      // The brain's part, end to end on this machine: well under a frame or two each, plus the 40 ms flush batch.
      assert.ok(sentAt - t0 < 150, `submit->model ${sentAt - t0} ms`);
      assert.ok(first!.at - d0 < 120, `first token->bubble ${first!.at - d0} ms`);
      core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'Tomorrow you have nothing.', tools: [], ms: 5 });
      await wait(80);
    }
    for (const r of rows) console.log('  ' + r);
  } finally {
    c.close();
    await core.stop();
  }
});
