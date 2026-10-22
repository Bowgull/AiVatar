// Sheet 65: the brief's Addons slip and Aang driving CurseForge. The fixture is a small, anonymised copy of his real
// CurseForge list (8 of his 17 addons, newer files made up so there is something to update), the lines of his real .toc
// files that matter, and BugGrabber errors shaped like his. Nothing here touches CurseForge, WoW or a real window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  buildSection, bugErrors, cachedThumbs, changelogDiff, clientVersion, interfaceOf, isBigJump, newChangelogLines, prettyVersion,
  readBugGrabber, readInstances, readSection, versionInName, whatChanged, wowInstance, zipEntries, type CfPaths,
} from '../src/addonbrief.ts';
import { AddonDesk, installButton, isWowProcess, type Said } from '../src/addondesk.ts';
import type { ActArgs, ActReply } from '../src/uia.ts';

const FIX = path.join(import.meta.dirname, 'fixtures', 'addons');

/** The fixture in a temp folder, its install path pointing there. */
function setup(): { dir: string; paths: CfPaths; wow: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'aang-addons-'));
  cpSync(FIX, dir, { recursive: true });
  const wow = path.join(dir, 'wow', '_classic_beta_');
  const json = path.join(dir, 'AddonGameInstance.json');
  writeFileSync(json, readFileSync(json, 'utf8').replace('__WOW__/_classic_beta_/', wow.replace(/\\/g, '/') + '/'));
  const cache = path.join(dir, 'cache'); mkdirSync(cache);
  return { dir, wow, paths: { json, cache, fileCache: path.join(dir, 'FileCache'), exe: path.join(dir, 'CurseForge.exe') } };
}

/** A tiny zip (deflated), the way CurseForge keeps its downloads. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text)), n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(text.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(text.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); central.push(ch, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length / 2, 8); e.writeUInt16LE(central.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

/** A one-entry Chromium blockfile cache: data_1 holds the entry (its URL key), f_000001 the picture. */
function fakeCache(dir: string, url: string, body: Buffer): void {
  const d1 = Buffer.alloc(8192 + 256 * 4);
  const off = 8192 + 256 * 2;
  d1.writeInt32LE(url.length, off + 32);
  d1.writeInt32LE(body.length, off + 44);
  d1.writeUInt32LE((0x80000000 | 1) >>> 0, off + 60);                  // stream 1, external file f_000001
  d1.write(url, off + 96, 'latin1');
  writeFileSync(path.join(dir, 'data_1'), d1);
  writeFileSync(path.join(dir, 'f_000001'), body);
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('versions read the way he reads them', () => {
  assert.equal(versionInName('Auctionator-344.zip'), '344');
  assert.equal(versionInName('RXPGuides-v4.11.31.zip'), '4.11.31');
  assert.equal(versionInName('WhatsTraining-11.0.0-beta21.zip'), '11.0.0-beta21');
  assert.equal(versionInName('Leatrix_Plus-1.60.22-forever.zip'), '1.60.22');
  assert.equal(versionInName('GearQuestForever-v0.5.9-beta.zip'), '0.5.9-beta');
  assert.equal(versionInName('Details-Details.20261015.15339.172.zip'), '20261015.15339.172');
  assert.equal(versionInName('TalentsForeverBook-0.38.9.zip'), '0.38.9');
  assert.equal(prettyVersion('11.0.0-beta21'), '11.0.0 beta 21');
  assert.equal(prettyVersion('v4.11.26'), '4.11.26');
  assert.equal(prettyVersion('0.5.8-beta'), '0.5.8 beta');
  assert.ok(isBigJump('11.0.0 beta 21', '12.0.0'), 'new major number');
  assert.ok(isBigJump('2.0 beta', '2.0'), 'beta becomes the release');
  assert.ok(!isBigJump('341', '344'), "Auctionator's build numbers are not majors... they are small steps");
  assert.ok(!isBigJump('0.5.8 beta', '0.5.9 beta'));
  assert.ok(!isBigJump('20261015.15339.172', '20261101.1.1'), 'date-stamped builds never jump');
  assert.equal(interfaceOf('1.60.1.70450'), 16001);
});

test('the list from his CurseForge file, tocs and BugGrabber: safe first, warnings in words', () => {
  const { dir, paths, wow } = setup();
  try {
    const g = wowInstance(readInstances(paths.json))!;
    assert.equal(clientVersion(g.installPath, 'x'), '1.60.1.70450', 'from the game’s own .build.info row');
    const errors = readBugGrabber(wow, 1791000000);
    assert.deepEqual([...errors.keys()].sort(), ['Auctionator', 'BlizzMove', 'Details', 'RXPGuides'], 'the old Leatrix error is past the window');
    assert.equal(errors.get('Auctionator'), 3, 'counted by its counter');
    const s = buildSection({ instance: g, client: '1.60.1.70450', errors });
    assert.equal(s.game, 'WoW Forever');
    const rows = s.rows.map(r => `${r.name} ${r.from} -> ${r.to} [${r.tags.join(',')}] ${r.safe ? 'ticked' : 'unticked'}`);
    assert.deepEqual(rows, [
      'Auctionator 341 -> 344 [ERRORS] ticked',
      'RestedXP Guide 4.11.26 -> 4.11.31 [ERRORS] ticked',
      'Leatrix Plus 1.60.20 -> 1.60.22 [] ticked',
      'GearQuest Forever 0.5.8 beta -> 0.5.9 beta [NOT FOR THIS PATCH] unticked',
      "What's Training? 11.0.0 beta 21 -> 12.0.0 [BIG JUMP] unticked",
    ]);
    assert.deepEqual(s.errorsOnly.map(e => e.name), ['BlizzMove', 'Details'], 'errors with no update waiting: the line under the list');
    const auc = s.rows[0]!;
    assert.equal(auc.id, 6124);
    assert.ok(auc.fileId > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('BugGrabber: the addon a message names, never BugGrabber itself', () => {
  const lua = 'BugGrabberDB = {\n["errors"] = {\n{\n["message"] = "x",\n["stack"] = "[Interface/AddOns/!BugGrabber/BugGrabber.lua]:1\\n[Interface/AddOns/Foo/a.lua]:2",\n["counter"] = 2,\n},\n},\n}';
  assert.deepEqual([...bugErrors(lua)], [['Foo', 2]]);
});

test('icons come out of CurseForge’s own picture cache, matched by file name', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aang-cache-'));
  try {
    fakeCache(dir, '1/0/https://media.forgecdn.net/avatars/thumbnails/1403/232/64/64/638909541952729618.png', PNG);
    const got = cachedThumbs(dir, new Set(['638909541952729618.png', 'missing.png']));
    assert.equal(got.size, 1);
    assert.equal(got.get('638909541952729618.png'), 'data:image/png;base64,' + PNG.toString('base64'));
    assert.equal(cachedThumbs(path.join(dir, 'nope'), new Set(['a.png'])).size, 0, 'no cache: no pictures, no throw');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('what changed: the new changelog lines from CurseForge’s cached zip, then a few words from Qwen', async () => {
  const { dir, paths, wow } = setup();
  try {
    writeFileSync(path.join(wow, 'Interface', 'AddOns', 'Auctionator', 'CHANGELOG.md'), '# 341\n- Old fix\n');
    const g = wowInstance(readInstances(paths.json))!;
    const auc = g.installedAddons.find(a => a.addonID === 6124)!;
    mkdirSync(path.join(paths.fileCache, '6124'), { recursive: true });
    writeFileSync(path.join(paths.fileCache, '6124', `${auc.latestFile!.id}.zip`), zip({ 'Auctionator/CHANGELOG.md': '# 344\n- Faster search\n- Fix config error\n# 341\n- Old fix\n', 'Auctionator/Auctionator.toc': '## Version: 344' }));
    assert.equal(zipEntries(Buffer.from('not a zip')), null);
    const lines = newChangelogLines(auc, path.join(wow, 'Interface', 'AddOns'), paths.fileCache);
    assert.deepEqual(lines, ['# 344', '- Faster search', '- Fix config error']);
    assert.deepEqual(changelogDiff('a\nb', 'c\na\n----\nb'), ['c']);
    let asked = '';
    const said = await whatChanged(lines, async (p, o) => { asked = p; assert.ok(o?.system); return { ok: true, text: '<think>hm</think>\n"Faster search. Fixes a config error."' }; });
    assert.equal(said, 'Faster search. Fixes a config error.');
    assert.match(asked, /Faster search/);
    assert.equal(await whatChanged([], async () => ({ ok: true, text: 'x' })), '', 'no changelog: empty, Qwen not asked');
    assert.equal(await whatChanged(lines, async () => ({ ok: false, text: '' })), '', 'Qwen busy (a game): empty');
    const s = await readSection(paths, { now: new Date(1792100000_000), ask: async () => ({ ok: true, text: 'Faster search.' }) });
    assert.equal(s!.rows.find(r => r.id === 6124)!.what, 'Faster search.');
    assert.equal(s!.rows.find(r => r.name === 'Leatrix Plus')!.what, '', 'no new zip cached: nothing made up');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ Aang driving CurseForge

interface Rig { desk: AddonDesk; said: Said[]; links: string[]; acts: ActArgs[]; launched: number; closed: number; wow: { on: boolean } }
function rig(paths: CfPaths, stateDir: string, o: { dry?: boolean; buttons?: ActReply['matches']; onPress?: () => void; cf?: boolean } = {}): Rig {
  const r = { said: [] as Said[], links: [] as string[], acts: [] as ActArgs[], launched: 0, closed: 0, wow: { on: false } } as Rig;
  r.desk = new AddonDesk({
    stateDir, paths, dryRun: o.dry === true,
    wowRunning: async () => r.wow.on, cfRunning: async () => o.cf === true,
    launchCf: () => { r.launched++; const t = new Date(Date.now() + 5000); utimesSync(paths.json, t, t); },
    closeCf: () => { r.closed++; },
    openLink: url => { r.links.push(url); },
    act: async a => {
      r.acts.push(a);
      if (a.do === 'find') return { ok: true, window: { title: 'CurseForge', process: 'CurseForge' }, matches: o.buttons ?? [{ i: 7, name: 'Install', type: 'button', password: false, enabled: true }] };
      o.onPress?.();
      return { ok: true, done: true, detail: 'Pressed "Install".' };
    },
    say: s => { r.said.push(s); },
    sleep: async () => {}, refreshTimeoutMs: 50, findTimeoutMs: 0, verifyTimeoutMs: 0, pendingEveryMs: 5,
  });
  return r;
}

test('each morning: WoW closed -> CurseForge opened minimized, list kept, closed again; WoW open -> nothing opened', async () => {
  const { dir, paths } = setup();
  try {
    const r = rig(paths, dir);
    r.wow.on = true;
    assert.equal(await r.desk.morning(), null, 'nothing kept yet, and nothing opened');
    assert.equal(r.launched, 0);
    r.wow.on = false;
    const s = await r.desk.morning();
    assert.equal(r.launched, 1); assert.equal(r.closed, 1);
    assert.equal(s!.rows.length, 5);
    r.wow.on = true;
    assert.equal(r.desk.section()!.rows.length, 5, 'WoW open the next morning: the last list stands');
    const open = rig(paths, dir, { cf: true });
    await open.desk.morning();
    assert.equal(open.launched + open.closed, 0, 'already open: not opened, not closed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Update ticked: link, Install pressed by name, confirmed by CurseForge’s record, the done line', async () => {
  const { dir, paths } = setup();
  try {
    const r = rig(paths, dir, {
      onPress: () => {                                                         // CurseForge installs it: its record moves on
        const j = JSON.parse(readFileSync(paths.json, 'utf8'));
        const a = j[0].installedAddons.find((x: { addonID: number }) => x.addonID === Number(/addonId=(\d+)/.exec(r.links.at(-1)!)![1]));
        a.installedFile = { ...a.latestFile };
        writeFileSync(paths.json, JSON.stringify(j));
      },
    });
    await r.desk.morning();
    const ids = r.desk.section()!.rows.filter(x => x.safe).map(x => x.id);
    await r.desk.update([...ids, 999999]);
    assert.equal(r.links.length, 3, 'only the ids from the list, one link each');
    assert.match(r.links[0]!, /^curseforge:\/\/install\?addonId=6124&fileId=\d+$/);
    assert.ok(r.acts.every(a => a.app === 'CurseForge'), 'only ever CurseForge');
    assert.deepEqual(r.acts.filter(a => a.do === 'press').map(a => [a.name, a.index]), [['Install', 7], ['Install', 7], ['Install', 7]]);
    const progress = r.said.filter(s => !s.final);
    assert.ok(progress.length >= 3 && progress.every(p => p.text === 'Updating 3 addons in CurseForge…'), 'one line, the progress under it');
    assert.equal(progress.at(-1)!.addons.progress!.pct, 100);
    assert.equal(r.said.at(-1)!.text, 'Done: Auctionator, RestedXP Guide and Leatrix Plus are up to date.');
    assert.equal(r.desk.section()!.rows.length, 2, 'the kept list follows what happened');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('WoW open: nothing is pressed, "when you close it", and it is done then', async () => {
  const { dir, paths } = setup();
  try {
    const r = rig(paths, dir, { dry: true });
    await r.desk.morning();
    r.wow.on = true;
    await r.desk.update([6124]);
    assert.equal(r.said.at(-1)!.text, 'WoW is open. I’ll update them when you close it.');
    assert.equal(r.links.length + r.acts.length, 0, 'nothing touched while WoW runs');
    assert.deepEqual(r.desk.waitingIds(), [6124]);
    r.wow.on = false;
    for (let i = 0; i < 50 && !r.links.length; i++) await new Promise(res => setTimeout(res, 10));
    for (let i = 0; i < 50 && !r.said.at(-1)!.final; i++) await new Promise(res => setTimeout(res, 10));
    await new Promise(res => setTimeout(res, 30));
    r.desk.stop();
    assert.equal(r.links.length, 1, 'done once WoW closed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('dry run does everything but press; no button -> stops and says so in one line', async () => {
  const { dir, paths } = setup();
  try {
    const dry = rig(paths, dir, { dry: true });
    await dry.desk.morning();
    await dry.desk.update([6124]);
    assert.equal(dry.acts.filter(a => a.do === 'press').length, 0, 'never pressed');
    assert.equal(dry.said.at(-1)!.text, 'Dry run: I found CurseForge’s Install button for Auctionator. Nothing was pressed.');
    const none = rig(paths, dir, { buttons: [{ i: 1, name: 'Play', type: 'button', password: false, enabled: true }] });
    await none.desk.update([6124, 486246]);
    assert.equal(none.acts.filter(a => a.do === 'press').length, 0);
    assert.equal(none.links.length, 1, 'stopped at the first');
    assert.equal(none.said.at(-1)!.text, 'I couldn’t find CurseForge’s Install button for Auctionator, so I stopped. Nothing was changed.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the button is found by name, exactly one; WoW’s processes are known', () => {
  const b = (name: string, i = 0, enabled = true) => ({ i, name, type: 'button', password: false, enabled });
  assert.equal((installButton([b('Play'), b('Install', 4)]) as { i: number }).i, 4);
  assert.equal(installButton([b('Install', 1), b('Install', 2)]), 'many');
  assert.equal(installButton([b('Install', 1, false)]), 'none', 'greyed out is not usable');
  assert.equal((installButton([b('Update', 3)]) as { i: number }).i, 3, 'Update when there is no Install');
  assert.ok(isWowProcess('WowB.exe') && isWowProcess('Wow') && !isWowProcess('CurseForge'));
});
