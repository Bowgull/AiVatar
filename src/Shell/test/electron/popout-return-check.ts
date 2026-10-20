// His ask (2026-10-20): opening the pop-out tucks Samara away; closing it brings Samara back. Only the window it tucked,
// only while still tucked, and only when the pop-out was in front as it closed (never over his game).
//
// A stand-in for Samara's window records what is done to it, so this never takes the focus from whatever he is doing.
//
// Run: npx electron test/electron/popout-return-check.ts
import { app, type BrowserWindow } from 'electron';
import { tuckFor } from '../../src/popoutipc.ts';
import type { Popout } from '../../src/popout.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 20_000).unref();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

function samara() {
  const log: string[] = [];
  let min = false;
  const w = { isDestroyed: () => false, isMinimized: () => min, minimize: () => { min = true; log.push('minimize'); }, restore: () => { min = false; log.push('restore'); }, focus: () => log.push('focus') };
  return { w: w as unknown as BrowserWindow, log, unminimize: () => { min = false; } };
}
const popout = () => ({ window: null, afterClose: null } as unknown as Popout);

app.whenReady().then(async () => {
  // 1. opened from Samara, closed from the pop-out itself: Samara comes back to the front
  let s = samara(), p = popout();
  tuckFor(p, s.w); await wait(250);
  check('opening the pop-out tucks Samara away', s.log.join() === 'minimize', s.log.join());
  p.afterClose?.(true);
  check('closing the pop-out brings Samara back to the front', s.log.join() === 'minimize,restore,focus', s.log.join());

  // 2. the pop-out closed while something else was in front (from the bubble, in WoW): Samara stays tucked
  s = samara(); p = popout();
  tuckFor(p, s.w); await wait(250);
  p.afterClose?.(false);
  check('closed while another app is in front: Samara stays put', s.log.join() === 'minimize', s.log.join());

  // 3. he already brought Samara back himself: closing the pop-out just puts Samara in front, nothing restored twice
  s = samara(); p = popout();
  tuckFor(p, s.w); await wait(250); s.unminimize();
  p.afterClose?.(true);
  check('Samara already back: it is only brought to the front', s.log.join() === 'minimize,focus', s.log.join());

  // 4. the pop-out was opened from somewhere else (Samara not in front): nothing tucked, nothing brought back
  p = popout();
  tuckFor(p, null);
  check('opened from elsewhere: nothing to bring back', p.afterClose === null);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});
