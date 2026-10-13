// M3 (2026-10-13): the MacBook front desk holds the one Discord connection; Shadow drives it over Tailscale.
// The real front desk and the real Shadow-side link, talking over a real socket, with a pretend Discord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startFrontDesk } from '../src/frontdesk.ts';
import { FrontDeskGateway } from '../src/frontdesk-link.ts';
import type { ButtonPress, Gateway, Incoming, OutMsg } from '../src/discord.ts';

const KEY = 'f'.repeat(24);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

class FakeDiscord implements Gateway {
  msg: ((m: Incoming) => void) | null = null;
  btn: ((b: ButtonPress) => void) | null = null;
  sent: { channelId: string; msg: OutMsg }[] = [];
  acks: string[] = [];
  keeps = 0;
  fetched = 0;
  onMessage(cb: (m: Incoming) => void) { this.msg = cb; }
  onButton(cb: (b: ButtonPress) => void) { this.btn = cb; }
  async ensureLayout() { return { aang: 'c1' }; }
  async send(channelId: string, msg: OutMsg) { this.sent.push({ channelId, msg }); return 'm' + this.sent.length; }
  async edit() {}
  async pin() {}
  async createPost() { return 'post1'; }
  async download() { return Buffer.from('file bytes'); }
  async typing() {}
  async fetchSince() { this.fetched++; return []; }
  async permissions() { return ['SendMessages']; }
  say(id: string, content: string) { this.msg!({ id, channelId: 'c1', channelName: 'aang', authorId: 'josh', isBot: false, content, createdAt: Date.now() }); }
  press(id: string) { this.btn!({ customId: id, userId: 'josh', channelId: 'c1', messageId: 'm1', ack: async (n: string) => { this.acks.push(n); }, keep: async () => { this.keeps++; } }); }
}

async function rig(port: number, shadow = '127.0.0.1') {
  const gw = new FakeDiscord();
  const queueFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'aang-desk-')), 'queue.json');
  const desk = await startFrontDesk({ gw, host: '127.0.0.1', port, key: KEY, shadow, queueFile, log: () => {} });
  return { gw, desk, queueFile };
}
const link = (port: number, key = KEY) => new FrontDeskGateway({ url: `ws://127.0.0.1:${port}`, key, log: () => {}, retryMs: 100 });

test('M3: Shadow on: his message reaches Shadow, and Shadow posts through the Mac (files intact)', async () => {
  const { gw, desk } = await rig(48501);
  const fd = link(48501);
  try {
    await fd.ready;
    const got: Incoming[] = [];
    fd.onMessage(m => got.push(m));
    gw.say('1', 'hey aang');
    await wait(100);
    assert.deepEqual(got.map(m => m.content), ['hey aang']);
    const id = await fd.send('c1', { content: 'hi', files: [{ name: 'a.txt', data: Buffer.from('bytes') }] });
    assert.equal(id, 'm1');
    assert.equal(Buffer.from(gw.sent[0]!.msg.files![0]!.data).toString(), 'bytes', 'a file arrives byte for byte');
    assert.equal((await fd.download('https://cdn.discordapp.com/x')).toString(), 'file bytes');
    assert.deepEqual(await fd.ensureLayout(), { aang: 'c1' });
  } finally { fd.close(); await desk.close(); }
});

test('M3: Shadow off: messages wait on the Mac, in order, and are handed over exactly once', async () => {
  const { gw, desk, queueFile } = await rig(48503);
  gw.say('1', 'first'); gw.say('2', 'second'); gw.say('3', 'third');
  assert.equal(desk.queued(), 3);
  assert.equal(JSON.parse(readFileSync(queueFile, 'utf8')).length, 3, 'kept on disk, so a Mac restart loses nothing');
  const fd = link(48503);
  const got: string[] = [];
  fd.onMessage(m => got.push(m.content));
  try {
    await fd.ready;
    await wait(150);
    assert.deepEqual(got, ['first', 'second', 'third'], 'in the order he sent them');
    assert.equal(desk.queued(), 0, 'and each leaves the queue once Shadow has it');
    assert.equal(JSON.parse(readFileSync(queueFile, 'utf8')).length, 0);
  } finally { fd.close(); }
  // Shadow goes away and comes back: nothing is handed over a second time.
  await wait(100);
  const again = link(48503);
  const second: string[] = [];
  again.onMessage(m => second.push(m.content));
  try { await again.ready; await wait(150); assert.deepEqual(second, [], 'no replays'); }
  finally { again.close(); await desk.close(); }
  assert.equal(gw.fetched, 0, 'Discord history is never read back');
});

test('M3: only the Shadow PC with the key gets in', async () => {
  const { desk } = await rig(48505);
  const refused = (key: string) => new Promise<number>(res => {
    const ws = new WebSocket('ws://127.0.0.1:48505', { headers: { 'x-aang-key': key } });
    ws.on('unexpected-response', (_r, resp) => res(resp.statusCode ?? 0));
    ws.on('open', () => { ws.close(); res(101); });
    ws.on('error', () => {});
  });
  try {
    assert.equal(await refused('wrong'.padEnd(24, 'x')), 403);
    assert.equal(await refused(''), 403);
    assert.equal(await refused(KEY), 101, 'the right key from Shadow\'s address is let in');
  } finally { await desk.close(); }
  // Right key, wrong machine: refused.
  const other = await rig(48507, '100.1.2.3');
  try {
    const code = await new Promise<number>(res => {
      const ws = new WebSocket('ws://127.0.0.1:48507', { headers: { 'x-aang-key': KEY } });
      ws.on('unexpected-response', (_r, resp) => res(resp.statusCode ?? 0)); ws.on('open', () => { ws.close(); res(101); }); ws.on('error', () => {});
    });
    assert.equal(code, 403);
  } finally { await other.desk.close(); }
});

test('M3: a button pressed while Shadow is off is answered at once, never left "failed"', async () => {
  const { gw, desk } = await rig(48509);
  try {
    gw.press('deck:status');
    await wait(50);
    assert.match(gw.acks[0] ?? '', /Shadow is asleep/);
  } finally { await desk.close(); }
});

test('M3: a button pressed while Shadow is on reaches Shadow, and its answer goes back to that press', async () => {
  const { gw, desk } = await rig(48511);
  const fd = link(48511);
  try {
    await fd.ready;
    const presses: ButtonPress[] = [];
    fd.onButton(b => presses.push(b));
    gw.press('mail:send');
    await wait(100);
    assert.equal(presses[0]?.customId, 'mail:send');
    await presses[0]!.ack('Sent.');
    assert.deepEqual(gw.acks, ['Sent.']);
  } finally { fd.close(); await desk.close(); }
});

test('M3: if Shadow is slow to answer a press, Discord is told to wait so it never shows as failed', async () => {
  const { gw, desk } = await rig(48513);
  const fd = link(48513);
  try {
    await fd.ready;
    fd.onButton(() => { /* Shadow thinks for a while */ });
    gw.press('job:apply');
    await wait(2300);
    assert.equal(gw.keeps, 1);
  } finally { fd.close(); await desk.close(); }
});

// ---- the Mac setup that installs it
import { execFileSync } from 'node:child_process';
import { macSetupScript, FRONT_DESK_PORT } from '../src/macsetup.ts';

const files = {
  'frontdesk.ts': readFileSync(path.join(import.meta.dirname, '..', 'src', 'frontdesk.ts'), 'utf8'),
  'discord-client.ts': readFileSync(path.join(import.meta.dirname, '..', 'src', 'discord-client.ts'), 'utf8'),
  'package.json': readFileSync(path.join(import.meta.dirname, '..', 'frontdesk-pkg', 'package.json'), 'utf8'),
};
const setup = macSetupScript('100.x.x.1', 47832, 'h'.repeat(24), 'm'.repeat(24), { token: 'TOKEN.abc.def', key: 'K'.repeat(24), port: FRONT_DESK_PORT, files });

test('M3 setup: each front desk file arrives on the Mac byte for byte', () => {
  for (const [name, text] of Object.entries(files)) {
    const line = setup.split('\n').find(l => l.endsWith(`> "$FD/${name}"`));
    assert.ok(line, `${name} is written`);
    const b64 = /printf '%s' '([A-Za-z0-9+/=]+)' \| \/usr\/bin\/base64 -D/.exec(line!)?.[1] ?? '';
    assert.equal(Buffer.from(b64, 'base64').toString('utf8'), text);
  }
});

test('M3 setup: the Discord token and the key are never on a command line, and the libraries are pinned', () => {
  const plist = /<string>com\.aang\.frontdesk<\/string>[\s\S]*?<\/array>/.exec(setup)?.[0] ?? '';
  assert.ok(plist.includes('frontdesk.ts'));
  assert.doesNotMatch(plist, /TOKEN|KKKK/, 'nothing secret among the arguments');
  assert.match(setup, /umask 077; printf '%s' "\$DISCORD_TOKEN" > "\$DIR\/discord\.token"/);
  assert.match(setup, /npm ci --omit=dev --ignore-scripts/, 'exactly the lockfile, no install scripts');
  assert.match(setup, /launchctl bootout "gui\/\$\(id -u\)\/com\.aang\.frontdesk"/, 'and the uninstaller removes it');
});

test('M3 setup: valid bash with the front desk in it', t => {
  try { execFileSync('bash', ['-c', 'true']); } catch { t.skip('no bash'); return; }
  execFileSync('bash', ['-n'], { input: setup, stdio: ['pipe', 'pipe', 'pipe'] });
});
