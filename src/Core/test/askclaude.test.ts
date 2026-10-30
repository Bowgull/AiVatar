import './_env.ts';
// Sheet 109 (2026-10-30): Samara's Ask Claude. His pick (already fenced as the page's words by the Shell) goes into the
// chat he picked through the aang-link mod's signed inbox, word for word: not rewritten as his own words. Only the
// Shell may send it, and the answer says whether the chat took it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { linkMac, linkKeyFile } from '../src/claudelink.ts';
import { Core } from '../src/core.ts';

const PORT = 48790;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-ask-'));
function signed(key: string, method: string, p: string, body = '') {
  const ts = String(Date.now());
  const headers: Record<string, string> = { host: `127.0.0.1:${PORT + 1}`, 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(key, 'req', ts, method, p, body) };
  return new Promise<{ code: number; text: string }>((done, fail) => {
    const r = http.request({ host: '127.0.0.1', port: PORT + 1, path: p, method, headers, agent: false }, res => {
      let text = ''; res.on('data', d => { text += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text }));
    });
    r.on('error', fail); r.end(body || undefined);
  });
}
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

test('a pick goes into the chat as it is, and only from the Shell', async () => {
  const dataDir = tmp();
  const core = new Core({ testDoor: true, port: PORT, dataDir, stateDir: tmp(), warm: false });
  const c = core as any;
  let rewrote = 0;
  c.plainOut = async (_s: string, w: string) => { rewrote++; return w; };
  await core.start();
  const shell = new WebSocket(`ws://127.0.0.1:${PORT}/body`), other = new WebSocket(`ws://127.0.0.1:${PORT}/body`);
  const inbox: any[] = [], otherIn: any[] = [];
  shell.on('message', d => inbox.push(JSON.parse(String(d))));
  other.on('message', d => otherIn.push(JSON.parse(String(d))));
  try {
    await Promise.all([new Promise<void>(r => shell.once('open', () => r())), new Promise<void>(r => other.once('open', () => r()))]);
    shell.send(JSON.stringify({ t: 'hello', shell: true }));
    other.send(JSON.stringify({ t: 'hello' }));
    await pause(150);
    const key = readFileSync(linkKeyFile(dataDir), 'utf8').trim();
    const S = '44444444-0000-0000-0000-000000000001';
    await signed(key, 'POST', '/link/event', JSON.stringify({ session: S, cwd: '/Users/x/Handoff/aang', events: [{ type: 'start' }] }));
    await pause(100);
    const text = 'Joshua picked this on a page in his Samara tab and is asking you about it.\n<page_words_ab12cd34>\nTab: Northwind\n\nYou will own a group\n</page_words_ab12cd34>';

    other.send(JSON.stringify({ t: 'claude.pick', id: 'p0', session: S, text }));
    await pause(150);
    assert.equal(otherIn.filter(m => m.t === 'claude.picked').length, 0, 'not from anything but the Shell');

    shell.send(JSON.stringify({ t: 'claude.pick', id: 'p1', session: S, text }));
    await pause(200);
    assert.ok(inbox.some(m => m.t === 'claude.picked' && m.id === 'p1' && m.ok === true), 'taken');
    assert.equal(rewrote, 0, 'never rewritten as his words');
    const n = 'ef'.repeat(16);
    const items = JSON.parse((await signed(key, 'GET', `/link/wait?n=${n}&s=${S}`)).text).items;
    assert.equal(items.length, 1, 'only the Shell\'s pick');
    assert.equal(items[0].kind, 'inbox');
    assert.deepEqual(JSON.parse(items[0].body), { text });

    shell.send(JSON.stringify({ t: 'claude.pick', id: 'p2', session: 'no-such-session', text }));
    await pause(150);
    const no = inbox.find(m => m.t === 'claude.picked' && m.id === 'p2');
    assert.equal(no?.ok, false);
    assert.match(String(no?.why), /not running/);
  } finally { shell.close(); other.close(); await core.stop?.(); }
});
