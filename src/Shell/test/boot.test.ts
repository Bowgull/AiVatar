// The boot engine (2026-10-30): Samara starts the same way on the Mac and the PC (boot.ts). Each machine's hook set is
// run through the boot with stand-ins for Electron, and what his Samara gets is checked: the gaps the Mac had (no ad
// blocking on the pop-out's session, a Claude door without plans, no line from plans to Aang's bubble) stay closed, and
// what only one machine has (the Mac's secret window and mockup door, the PC's repo and playback) stays its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samaraBase, samaraBrowser, type BootDeps, type BrowserPlatform, type Platform } from '../src/boot.ts';

type Rec = { calls: [string, ...unknown[]][]; quit: (() => void)[]; frame: Map<string, (s: { send: (...a: unknown[]) => void }, a: Record<string, unknown>) => void>; browsers: any[]; folder: string[]; files: Map<string, string> };

function fakeBrowser(o: Record<string, unknown>) {
  const b: any = {
    o, sync: null, mockupsOn: true, inCall: false, opened: [] as unknown[], updates: [] as unknown[],
    faviconFor: (u: string) => 'icon:' + u, phishCheck: {}, hasWindow: () => true,
    open: (u?: string) => { b.opened.push(u ?? null); }, openSettings: () => {}, closeAll: () => { b.closed = true; },
    setPopTab: (f: (id: number) => void) => { b.popTab = f; },
    startSync: (send: (m: unknown) => void) => { b.sync = { send }; return b.sync; },
    openMockupDrop: async (m: unknown) => { b.dropped = m; return null; }, mockStages: () => ['stage'], mockMark: (k: unknown) => { b.marked = k; return null; },
    isFrame: (wc: unknown) => wc === 'frame', setUpdate: (c: unknown) => b.updates.push(c), setUpdated: (d: unknown) => { b.updated = d; },
  };
  return b;
}

function deps(r: Rec): BootDeps {
  const call = (n: string, ...a: unknown[]) => { r.calls.push([n, ...a]); };
  const engine: any = { show: () => call('updates.show'), start: () => call('updates.start'), act: (a: string) => { call('updates.act', a); return a !== 'back' || r.files.has('kept'); },
    go: async () => ({ ok: false, why: 'in a call' }), signin: async () => false, checkAll: async (w: string) => call('updates.check', w) };
  return {
    startFlight: (dir) => call('flight', dir),
    denyPermissions: () => call('deny'),
    servePages: async (dir) => { call('pages', dir); return { origin: 'http://127.0.0.1:1', close: () => call('pages.close') } as never; },
    newPopout: (o) => { call('popout', o); return { open: (u: string) => (call('popout.open', u), !u.includes('nothing')), close: () => call('popout.close'), togglePin: () => call('popout.pin'), togglePlay: () => call('popout.play'), returnTab: () => call('popout.return'), o } as never; },
    newDrm: (o) => { call('drm', o); return { open: (u: string) => (call('drm.open', u), null), close: () => call('drm.close') } as never; },
    blockAds: async (dir) => { call('ads', dir); return { lists: 3, stop: () => call('ads.stop') } as never; },
    findSkips: (dir) => ({ dir }) as never,
    readBox: () => null, writeBox: (_d, box) => call('box', box),
    newBrowser: (o) => { const b = fakeBrowser(o as never); r.browsers.push(b); call('browser', o); return b; },
    mkdir: () => true,
    wireBrowser: (get, secret) => call('wireBrowser', get, secret),
    wirePopout: (o) => { call('wirePopout', o); return { popTab: (id) => call('popTab', id) }; },
    planMemory: (dir) => ({ dir, forget: () => true }) as never,
    startClaudeDoor: (_get, dir, hooks) => call('claudeDoor', dir, hooks),
    startMockupDoor: (dir, open, why, marks) => { call('mockupDoor', dir, open, why, marks); return () => call('mockupDoor.close'); },
    watchFolder: (dir, take) => { call('watch', dir); take(); },
    listFolder: () => r.folder.splice(0),
    takeUrlFile: (f) => r.files.get(f) ?? '',
    removeFile: (f) => call('rm', f),
    takeMockupFile: (f) => ({ file: f }) as never,
    takeMarkFile: (f) => ({ mark: f }) as never,
    newUpdates: (o) => { call('newUpdates', o); engine.o = o; return engine; },
    ghListen: (nudge) => { call('gh'); nudge(); },
    idleSeconds: () => 42,
    readText: (f) => r.files.get(f) ?? '',
    writeAtomic: (f, t) => { r.files.set(f, t); },
    onFrame: (ch, isFrame, fn) => r.frame.set(ch, (s, a) => { if (isFrame('frame' as never)) fn(s, a); }),
    onCastlabs: () => false,
    onQuit: (fn) => { r.quit.push(fn); },
  };
}

const rec = (): Rec => ({ calls: [], quit: [], frame: new Map(), browsers: [], folder: [], files: new Map() });
const names = (r: Rec) => r.calls.map((c) => c[0]);
const got = (r: Rec, n: string) => r.calls.filter((c) => c[0] === n);

/** The Mac's hook set, as macmain.ts passes it. */
function mac(r: Rec, said: unknown[]): { p: Platform; bp: BrowserPlatform } {
  const p: Platform = {
    name: 'mac', here: '/app/src', stateDir: '/mac/state', log: (s) => said.push(s),
    settings: () => ({ rememberSize: true }) as never, skips: () => ({ youtubeAds: true }) as never,
    drm: { shellDir: '/app' }, paidPop: (u) => (r.calls.push(['mac.paid', u]), true),
    other: { open: (u) => r.calls.push(['toPc.open', u]), send: (u) => r.calls.push(['toPc.send', u]) },
  };
  const bp: BrowserPlatform = {
    options: { mockupsAnywhere: true }, secret: true,
    plans: { ask: async (c) => (r.calls.push(['bubble.ask', c.id]), { go: true, change: false, keep: [], note: '' }), step: (id, at) => r.calls.push(['bubble.step', id, at]), started: (x) => r.calls.push(['row', x.job]), done: (j) => r.calls.push(['row.done', j]) },
    mockupDoor: { offWhy: () => 'needs git' },
    syncSend: (m) => r.calls.push(['sync', m]),
    updates: { sources: (changed) => [{ changed } as never], prefsFile: '/mac/prefs.json', changelog: '/mac/changes.md', inGame: () => false, restart: () => r.calls.push(['restart']), seen: () => r.calls.push(['seen']) },
  };
  return { p, bp };
}

/** The PC's hook set, as main.ts passes it. */
function pc(r: Rec, said: unknown[]): { p: Platform; bp: BrowserPlatform } {
  const p: Platform = {
    name: 'pc', here: 'C:/aang/src', stateDir: 'C:/state', log: (s) => said.push(s),
    settings: () => ({ rememberSize: false }) as never, skips: () => ({ youtubeAds: true }) as never,
    drm: { shellDir: 'C:/home', codeDir: 'C:/aang', onExit: () => {} }, paidPop: (u) => (r.calls.push(['pc.paid', u]), true),
    other: { open: (u) => r.calls.push(['toMac.open', u]), send: (u) => r.calls.push(['toMac.send', u]) },
    playback: (s) => r.calls.push(['playback', s]),
  };
  const bp: BrowserPlatform = {
    options: { repoDir: 'C:/repo' },
    plans: { ask: async () => null, step: () => {}, started: (x) => r.calls.push(['row', x.job]), done: () => {} },
    syncSend: (m) => r.calls.push(['sync', m]),
    updates: { sources: () => [], prefsFile: 'C:/prefs.json', changelog: 'C:/changes.md', inGame: () => true, restart: () => {}, wentBack: () => r.calls.push(['wentBack']) },
  };
  return { p, bp };
}

for (const [machine, hooks] of [['mac', mac], ['pc', pc]] as const) {
  test(`${machine}: the base starts the flight log, the permission wall, pages, pop-out, paid video and ad blocking`, async () => {
    const r = rec(), said: unknown[] = [];
    const { p } = hooks(r, said);
    await samaraBase(p, deps(r));
    for (const n of ['flight', 'deny', 'pages', 'popout', 'drm', 'ads', 'wireBrowser', 'wirePopout']) assert.ok(names(r).includes(n), `${machine} has ${n}`);
    assert.ok(names(r).indexOf('deny') < names(r).indexOf('pages'), 'the wall is up before anything is served');
    assert.deepEqual(got(r, 'ads')[0], ['ads', p.stateDir], 'ad blocking on the default session, his folder');
    await new Promise((res) => setImmediate(res));
    assert.ok(said.some((s) => /blocking ads with 3 lists/.test(String(s))));
    // The pop-out's "Open on" / "Send to" go to the other machine.
    const wp = got(r, 'wirePopout')[0]![1] as any;
    wp.openOnOther('https://a.example/'); wp.sendToOther('https://b.example/');
    assert.ok(names(r).some((n) => n.endsWith('.open')) && names(r).some((n) => n.endsWith('.send')));
    assert.equal(typeof wp.playback === 'function', machine === 'pc', 'playback is the PC taskbar\'s');
    for (const q of r.quit) q();
    for (const n of ['popout.close', 'drm.close', 'ads.stop']) assert.ok(names(r).includes(n), `quit closes ${n}`);
  });

  test(`${machine}: ads stay off when he lets YouTube ads through`, async () => {
    const r = rec();
    const { p } = hooks(r, []);
    await samaraBase({ ...p, skips: () => ({ youtubeAds: false }) as never }, deps(r));
    assert.ok(!names(r).includes('ads'));
  });

  test(`${machine}: put X on: paid video goes to the machine, the rest to the pop-out`, async () => {
    const r = rec();
    const { p } = hooks(r, []);
    const base = await samaraBase(p, deps(r));
    assert.equal(base.openPop('https://www.netflix.com/watch/1'), true);
    assert.ok(names(r).includes(`${machine}.paid`));
    assert.equal(base.openPop('https://www.youtube.com/watch?v=x'), true);
    assert.ok(names(r).includes('drm.close'), 'the paid window closes for an ordinary video');
    assert.equal(base.openPop('https://nothing.example/'), false);
  });

  test(`${machine}: the browser gets the Claude door WITH plans, plans go to Aang, and the rest is wired`, async () => {
    const r = rec(), said: unknown[] = [];
    const { p, bp } = hooks(r, said);
    const d = deps(r);
    const base = await samaraBase(p, d);
    r.folder.push('a.url', 'b.mockup', 'c.mockmark', 'browser.flag', 'junk.txt');
    r.files.set(p.stateDir + '/open-urls/a.url', 'https://linked.example/');
    const s = samaraBrowser(base, p, bp, d);
    const b = r.browsers[0];
    assert.equal(base.browser(), b);
    assert.equal(b.o.stateDir, p.stateDir);
    assert.equal(b.o.repoDir, machine === 'pc' ? 'C:/repo' : undefined);
    assert.equal(b.o.mockupsAnywhere, machine === 'mac' ? true : undefined);
    // The door: plans remembered in his folder, each start a scroll-back row on BOTH machines.
    const door = got(r, 'claudeDoor')[0]!;
    assert.equal(door[1], p.stateDir);
    const h = door[2] as any;
    assert.equal(h.plans.dir, p.stateDir);
    h.onPlan({ job: 7, task: 't', sites: [], steps: [], remembered: false });
    assert.deepEqual(got(r, 'row')[0], ['row', 7]);
    assert.equal(typeof b.onPlanAsk, 'function');
    const a = await b.onPlanAsk({ id: 'samara:1' });
    assert.equal(a?.go ?? null, machine === 'mac' ? true : null);
    b.onPlanStep('samara:1', 2); b.onPlanDone(7);
    // The pop-out's band buttons and right-click.
    b.onPopoutAct('poppin'); b.onPopoutAct('popclose'); b.onPopoutAct('nope');
    assert.ok(names(r).includes('popout.pin') && names(r).includes('popout.close'));
    b.popTab(5);
    assert.deepEqual(got(r, 'popTab')[0], ['popTab', 5]);
    b.onReclaim(); assert.ok(names(r).includes('popout.return'));
    // Drops in the open-urls folder: the link, the mockup, the mark, "open the browser"; nothing else.
    assert.ok(b.opened.includes('https://linked.example/'));
    assert.ok(b.opened.includes(null), 'browser.flag opens the window');
    assert.ok(b.dropped && b.marked);
    // The sync goes to the other machine.
    b.sync.send({ t: 'bsync.x' });
    assert.deepEqual(got(r, 'sync')[0], ['sync', { t: 'bsync.x' }]);
    // The mockup door and the secret window are the Mac's.
    assert.equal(names(r).includes('mockupDoor'), machine === 'mac');
    s.openSecret();
    assert.equal(r.browsers.length, machine === 'mac' ? 2 : 1);
    if (machine === 'mac') { assert.equal(r.browsers[1].o.secret, true); assert.equal(r.browsers[1].o.sharedDir, p.stateDir); assert.equal(s.secret(), r.browsers[1]); }
    // The update engine: started, nudged by GitHub, his moment and his overnight switch.
    for (const n of ['newUpdates', 'updates.show', 'updates.start', 'gh', 'updates.check']) assert.ok(names(r).includes(n), `updates: ${n}`);
    const eo = (got(r, 'newUpdates')[0]![1]) as any;
    assert.deepEqual({ ...eo.moment(), now: 0 }, { now: 0, idleSeconds: 42, inCall: false, inGame: machine === 'pc' });
    r.files.set(bp.updates.prefsFile, JSON.stringify({ overnight: true }));
    eo.changed({ title: 'x' });
    assert.deepEqual(b.updates.at(-1), { title: 'x', overnight: true });
    for (const q of r.quit) q();
    assert.ok(b.closed && names(r).includes('pages.close'));
  });

  test(`${machine}: the update key's doors: only the frame, changelog, overnight, seen, back`, async () => {
    const r = rec();
    const { p, bp } = hooks(r, []);
    const d = deps(r);
    samaraBrowser(await samaraBase(p, d), p, bp, d);
    const sent: unknown[][] = [];
    const sender = { send: (...a: unknown[]) => sent.push(a) };
    const act = r.frame.get('browser:updateact')!;
    r.files.set(bp.updates.changelog, '# 1.25');
    act(sender, { act: 'changelog' });
    assert.deepEqual(sent.at(-1), ['browser:changelog', '# 1.25']);
    act(sender, { act: 'overnight', on: true });
    assert.equal(r.files.get(bp.updates.prefsFile), '{"overnight":true}');
    act(sender, { act: 'seen' });
    assert.equal(r.browsers[0].updated, null);
    assert.equal(names(r).includes('seen'), machine === 'mac', "the Mac's night note goes");
    act(sender, { act: 'back' });
    assert.deepEqual(sent.at(-1), ['browser:updatewhy', 'There is no earlier version kept to go back to.']);
    r.files.set('kept', '1');
    act(sender, { act: 'back' });
    assert.equal(names(r).includes('wentBack'), machine === 'pc', 'the PC restarts itself after going back');
    r.frame.get('browser:updatego')!(sender, {});
    await new Promise((res) => setImmediate(res));
    assert.deepEqual(sent.at(-1), ['browser:updatewhy', 'in a call']);
  });
}
