// B-12 (QA 2026-11-19): a start with no lists kept fetched every ad list twice, because the default session and the
// browser each start a blocker at the same moment and the first-start path skipped the shared download. This counts
// every download Node makes while two blockers start together from an empty folder: each list, each uBlock include
// and the page tricks must go out exactly once.
// Run: npx electron test/electron/adtwice-check.ts        (fetches the real lists once, ~6 MB)
import { app, session } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 240_000).unref();

const asked = new Map<string, number>();
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  asked.set(u, (asked.get(u) ?? 0) + 1);
  return realFetch(input, init);
}) as typeof fetch;

app.whenReady().then(async () => {
  const { blockAds, LISTS, RESOURCES } = await import('../../src/skip/ads.ts');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adtwice-'));
  // As boot.ts and browser.ts do: the default session's blocker and the browser's (cosmetic) one, at once.
  const [a, b] = await Promise.all([
    blockAds(session.fromPartition('adtwice-default'), dir),
    blockAds(session.fromPartition('adtwice-browser'), dir, { cosmetic: true }),
  ]);
  const twice = [...asked].filter(([, n]) => n > 1);
  const missing = [...LISTS, RESOURCES].filter((u) => !asked.has(u));
  const total = [...asked.values()].reduce((x, y) => x + y, 0);
  console.log(`blockers: ${a?.lists ?? 'none'} and ${b?.lists ?? 'none'} lists; ${asked.size} addresses, ${total} downloads`);
  for (const [u, n] of twice) console.log(`TWICE ${n}x ${u}`);
  for (const u of missing) console.log(`NOT ASKED ${u}`);
  const ok = !!a && !!b && !twice.length && !missing.length;
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});
