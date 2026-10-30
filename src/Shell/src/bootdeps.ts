// The boot engine's real hands (boot.ts): Electron, the disk and the doors. Kept apart so boot.ts itself has no Electron
// import and its wiring can be unit tested.
import { app, ipcMain, net, powerMonitor, session } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import type { BootDeps } from './boot.ts';
import { startFlight } from './flight.ts';
import { denyPermissions } from './safety.ts';
import { servePages } from './pageserver.ts';
import { Popout, popoutFile } from './popout.ts';
import { DrmRuntime } from './drmrunner.ts';
import { blockAds } from './skip/ads.ts';
import { FindSkips } from './skip/find.ts';
import { AangBrowser } from './browser.ts';
import { wireBrowser } from './browseripc.ts';
import { wirePopout } from './popoutipc.ts';
import { PlanMemory } from './claudeplan.ts';
import { startClaudeDoor } from './claudedoor.ts';
import { startMockupDoor } from './mockupdoor.ts';
import { takeMarkFile, takeMockupFile } from './mockups.ts';
import { UpdateEngine } from './updateengine.ts';
import { listen as ghListen } from './ghrelease.ts';
import { writeFileAtomic } from './atomic.ts';
import { onCastlabs } from './engineupdate.ts';

export function bootDeps(log: (s: string) => void): BootDeps {
  return {
    startFlight: (dir, say) => startFlight(app, dir, say),
    denyPermissions: () => denyPermissions(session.defaultSession, []),
    servePages,
    newPopout: (o) => new Popout(o),
    newDrm: (o) => new DrmRuntime(o),
    blockAds: (dir) => blockAds(session.defaultSession, dir),
    findSkips: (dir) => new FindSkips(dir),
    readBox: (dir) => {
      try { const j = JSON.parse(readFileSync(popoutFile(dir), 'utf8')); return ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(j?.[k])) ? { x: j.x, y: j.y, width: j.width, height: j.height } : null; } catch { return null; }
    },
    writeBox: (dir, box) => { try { writeFileSync(popoutFile(dir), JSON.stringify(box)); } catch (e) { log('could not remember the pop-out size: ' + (e as Error).message); } },
    newBrowser: (o) => new AangBrowser(o),
    mkdir: (dir) => { try { mkdirSync(dir, { recursive: true, mode: 0o700 }); return true; } catch { return false; } },
    wireBrowser,
    wirePopout,
    planMemory: (dir) => new PlanMemory(dir),
    startClaudeDoor: (get, dir, hooks) => startClaudeDoor(get, dir, undefined, hooks),
    startMockupDoor: (dir, open, why, marks) => startMockupDoor(dir, open as never, why, undefined, marks as never),
    watchFolder: (dir, take) => {
      try { mkdirSync(dir, { recursive: true }); watch(dir, () => setTimeout(take, 60)); } catch (e) { log('cannot watch for links: ' + (e as Error).message); }
      take();
    },
    listFolder: (dir) => { try { return readdirSync(dir); } catch { return []; } },
    // A link left while Samara was off for more than ten minutes is dropped rather than popping up long after he clicked it.
    takeUrlFile: (f) => {
      let u = '', old = false;
      try { old = Date.now() - statSync(f).mtimeMs > 10 * 60_000; u = readFileSync(f, 'utf8').trim(); unlinkSync(f); } catch { return ''; }
      return old || u.length > 8192 ? '' : u;
    },
    removeFile: (f) => { try { unlinkSync(f); } catch { /* taken */ } },
    takeMockupFile,
    takeMarkFile,
    newUpdates: (o) => new UpdateEngine(o),
    ghListen: (nudge) => ghListen(net.fetch as never, nudge),
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    readText: (f) => { try { return existsSync(f) ? readFileSync(f, 'utf8') : ''; } catch { return ''; } },
    writeAtomic: (f, t) => writeFileAtomic(f, t),
    onFrame: (channel, isFrame, fn) => ipcMain.on(channel, (e, a) => { if (isFrame(e.sender)) fn(e.sender, (a && typeof a === 'object' ? a : {}) as Record<string, unknown>); }),
    onCastlabs,
    onQuit: (fn) => { app.on('before-quit', fn); },
  };
}
