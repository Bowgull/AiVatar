// The ready-built ad blocker (2026-10-20): the second start loads it instead of rebuilding it from the lists.
// Run: npx electron test/electron/adcache-check.ts
import { app, session } from 'electron';
import { mkdtempSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blockAds } from '../../src/skip/ads.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.whenReady().then(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adc-'));
  let t = performance.now();
  const a = await blockAds(session.fromPartition('adc1'), dir, { cosmetic: false });
  const first = performance.now() - t;
  await new Promise((r) => setTimeout(r, 6500));
  const saved = existsSync(path.join(dir, 'adblock', 'engine.bin'));
  t = performance.now();
  const b = await blockAds(session.fromPartition('adc2'), dir, { cosmetic: false });
  const second = performance.now() - t;
  console.log(`first start ${first.toFixed(0)} ms (lists ${a?.lists}), saved ${saved}, second start ${second.toFixed(0)} ms (lists ${b?.lists})`);
  const ok = !!a && !!b && saved && second < first / 3;
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});
