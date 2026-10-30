import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PageTimeout, run, within } from '../src/page.ts';
import { fitWidth, shownLayers } from '../src/captureplan.ts';

/** A pretend page: answers (or never does), loading or not, and counts what is left listening on it. */
function fakePage(o: { answer?: (code: string) => Promise<unknown>; loading?: boolean; readyState?: string; url?: string } = {}) {
  const e = new EventEmitter() as EventEmitter & Record<string, any>;
  let loading = o.loading ?? false;
  const calls: { world: number | 'main'; code: string }[] = [];
  const answer = o.answer ?? (async (code: string) => code);
  e.getURL = () => o.url ?? 'https://example.com/';
  e.isDestroyed = () => false;
  e.isLoadingMainFrame = () => loading;
  e.mainFrame = { isDestroyed: () => false, executeJavaScript: (code: string) => { calls.push({ world: 'main', code }); return code === 'document.readyState' ? Promise.resolve(o.readyState ?? 'loading') : answer(code); } };
  // Electron's own rule: the webContents form waits for loading to stop.
  e.executeJavaScriptInIsolatedWorld = function (this: any, world: number, scripts: { code: string }[]) {
    const now = !this.isLoadingMainFrame();
    calls.push({ world, code: scripts[0]!.code });
    return now ? answer(scripts[0]!.code) : new Promise((r) => e.once('did-stop-loading', () => r(answer(scripts[0]!.code))));
  };
  return { wc: e as unknown as Electron.WebContents, calls, stop: () => { loading = false; e.emit('did-stop-loading'); }, listening: () => e.listenerCount('did-stop-loading') + e.listenerCount('dom-ready') };
}
const never = () => new Promise<never>(() => {});

test('within gives the fallback when the promise fails or is too slow', async () => {
  assert.equal(await within(Promise.resolve(1), 50, 0), 1);
  assert.equal(await within(Promise.reject(new Error('x')), 50, 0), 0);
  assert.equal(await within(never(), 20, 'late'), 'late');
});

test('main world: asked at once, even while the page is still loading', async () => {
  const p = fakePage({ loading: true });
  assert.equal(await run(p.wc, '1+1'), '1+1');
  assert.equal(p.calls[0]!.world, 'main');
});

test('a page that never answers: the fallback at the deadline, or a plain reason without one', async () => {
  const p = fakePage({ answer: never });
  const t0 = Date.now();
  assert.equal(await run(p.wc, 'x', { ms: 40, fallback: null }), null);
  assert.ok(Date.now() - t0 < 500);
  await assert.rejects(run(p.wc, 'x', { ms: 40 }), (e: Error) => e instanceof PageTimeout && /did not answer/.test(e.message));
});

test('isolated world on a loaded page goes straight in', async () => {
  const p = fakePage();
  assert.equal(await run(p.wc, 'y', { world: 1061 }), 'y');
  assert.deepEqual(p.calls.map((c) => c.world), [1061]);
});

test('isolated world on a page that keeps loading but has its words: asked now, nothing left listening', async () => {
  const p = fakePage({ loading: true, readyState: 'interactive' });
  assert.equal(await run(p.wc, 'z', { world: 1061, ms: 200 }), 'z');
  assert.equal(p.listening(), 0);
  assert.equal(p.wc.isLoadingMainFrame(), true, 'the page is told the truth again right after');
});

test('isolated world before the page has its words: waits for them, then asks', async () => {
  const p = fakePage({ loading: true, readyState: 'loading' });
  const r = run(p.wc, 'w', { world: 1061, ms: 500 });
  setTimeout(() => p.stop(), 30);
  assert.equal(await r, 'w');
  assert.equal(p.listening(), 0);
});

test('isolated world that never gets its words: a reason at the deadline, and its listeners are gone', async () => {
  const p = fakePage({ loading: true, readyState: 'loading' });
  await assert.rejects(run(p.wc, 'v', { world: 1061, ms: 60 }), /still loading|did not answer/);
  const settle = () => new Promise((r) => setTimeout(r, 30));
  await settle();
  assert.equal(p.listening(), 0);
  // 20 asks in a row leave nothing behind either (the old "11 listeners" warning).
  for (let i = 0; i < 20; i++) await run(p.wc, 'v', { world: 1061, ms: 10, fallback: null });
  await settle();
  assert.equal(p.listening(), 0);
});

test('a closed page answers the fallback, or says it is closed', async () => {
  const p = fakePage();
  (p.wc as any).isDestroyed = () => true;
  assert.equal(await run(p.wc, 'x', { fallback: 'gone' }), 'gone');
  await assert.rejects(run(p.wc, 'x'), /closed/);
});

test('the one size rule: never bigger than it came, at its size on screen, never over the widest', () => {
  assert.equal(fitWidth(2560, 1280), 1280, 'a high-DPI picture comes back at its size on screen');
  assert.equal(fitWidth(3840, 1920), 1280, 'never over 1280 by default');
  assert.equal(fitWidth(3840, 1920, 960), 960);
  assert.equal(fitWidth(800, 1280), 800, 'never made bigger');
  assert.equal(fitWidth(1400, 700, Infinity, 2), 1400, 'a crisp card keeps its 2x');
  assert.equal(fitWidth(5000, 0, 1280), 1280, 'unknown size on screen: only the widest applies');
  assert.equal(fitWidth(64, 64, Infinity, Infinity), 64, 'exact pixels');
});

test('a window picture draws only the views that are shown and inside it, in their order', () => {
  const area = { width: 1000, height: 700 };
  const got = shownLayers([
    { visible: true, bounds: { x: 0, y: 58, width: 1000, height: 642 }, name: 'page' },
    { visible: false, bounds: { x: 0, y: 58, width: 1000, height: 642 }, name: 'hidden curtain' },
    { visible: true, bounds: { x: 0, y: 0, width: 0, height: 0 }, name: 'no size' },
    { visible: true, bounds: { x: 2000, y: 0, width: 300, height: 300 }, name: 'off to the side' },
    { visible: true, bounds: { x: 600, y: 60, width: 380, height: 500 }, name: 'tab list' },
  ], area);
  assert.deepEqual(got.map((l) => l.name), ['page', 'tab list']);
});
