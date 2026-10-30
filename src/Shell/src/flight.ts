// The flight recorder (2026-10-30, stability check on his Mac): until now nothing was written down when a page crashed,
// a helper (the GPU, audio, the network) died, a page hung, or Samara itself went down, so a bad evening left no trace
// (Oct 28: Samara restarted on its own with no clue why). A few plain lines in the log, Mac and PC alike:
//   - whether Samara closed cleanly last time (a "running" mark is left while it runs and removed on a normal quit),
//   - a page that went away (crashed, out of memory, killed) and a helper process that died, with the reason,
//   - a page that stopped answering, and how long until it answered again,
//   - Samara's memory every 10 minutes, so a slow climb shows.
// Only a site's name is ever written, never its full address (a log may be shared when something goes wrong).
import { EventEmitter } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readJson, saveJson } from './store.ts';
import { sched } from './sched.ts';

/** "www.youtube.com/watch?v=..." -> "www.youtube.com"; anything that is not a web page -> its kind only. */
export function siteOf(url: string): string {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : u.protocol.replace(':', ''); } catch { return '?'; }
}

/** The mark left while Samara runs. Returns what to say about the last run, or null when it closed cleanly (or never ran). */
export function lastRun(dir: string, now = Date.now(), pid = process.pid): string | null {
  const f = path.join(dir, 'running.json');
  let said: string | null = null;
  if (existsSync(f)) {
    try {
      const m = readJson<{ at?: number; pid?: number } | null>(f, null);
      if (!m) throw new Error('broken');
      const at = typeof m.at === 'number' ? new Date(m.at).toISOString().slice(0, 16).replace('T', ' ') : 'an unknown time';
      said = `last run (started ${at}) did not close cleanly: it crashed, was killed, or the computer went off`;
    } catch { said = 'last run did not close cleanly'; }
  }
  saveJson(f, { at: now, pid });
  return said;
}
export function closedCleanly(dir: string): void { try { rmSync(path.join(dir, 'running.json'), { force: true }); } catch { /* best effort */ } }

type Metric = { type: string; memory?: { workingSetSize?: number } };
/** One memory line: the total and the biggest kind of process (sizes come in kilobytes). */
export function memoryLine(metrics: Metric[]): string {
  const by = new Map<string, number>();
  for (const m of metrics) by.set(m.type, (by.get(m.type) ?? 0) + (m.memory?.workingSetSize ?? 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v / 1024)}`).join(', ');
  return `memory ${Math.round(total / 1024)} MB in ${metrics.length} processes (${top})`;
}

/**
 * Trouble as it happens, for whoever wants to act on it (the capture engine keeps a picture of his window): 'gone' when
 * a page went away, 'hang' when a page stopped answering. Each with the page's webContents.
 */
export const trouble = new EventEmitter();

/** Wire it into a running Samara. `log` is the app's own log line writer. */
export function startFlight(app: Electron.App, dir: string, log: (s: string) => void): void {
  const was = lastRun(dir);
  if (was) log('flight: ' + was);
  app.on('will-quit', () => closedCleanly(dir));
  app.on('render-process-gone', (_e, wc, d) => {
    let site = '?'; try { site = siteOf(wc.getURL()); } catch { /* gone */ }
    log(`flight: page gone (${d.reason}, code ${d.exitCode}) on ${site}`);
    if (d.reason !== 'clean-exit') trouble.emit('gone', wc);
  });
  app.on('child-process-gone', (_e, d) => log(`flight: ${d.name || d.serviceName || d.type} process gone (${d.reason}, code ${d.exitCode})`));
  app.on('web-contents-created', (_e, wc) => {
    let since = 0;
    wc.on('unresponsive', () => { since = Date.now(); log(`flight: page not answering on ${siteOf(wc.getURL())}`); trouble.emit('hang', wc); });
    wc.on('responsive', () => { if (since) log(`flight: page answering again on ${siteOf(wc.getURL())} after ${((Date.now() - since) / 1000).toFixed(1)} s`); since = 0; });
  });
  const mem = () => { try { log('flight: ' + memoryLine(app.getAppMetrics() as Metric[])); } catch { /* not now */ } };
  sched.every('flight.memory', 10 * 60_000, mem, { first: 60_000 });
}
