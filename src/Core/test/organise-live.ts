// The real model choosing the tidying tools, with the rules around them, headless (no Body, no clicking): a stand-in
// desktop answers the yes/no questions and the clipboard request. Throwaway folders, its own port.
//   node test/organise-live.ts
import './_env.ts';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));
const fwd = (p: string) => p.split('\\').join('/');

const PORT = 47872;
const core: any = new Core({ port: PORT, dataDir: tmp('aang-org-data-'), stateDir: tmp('aang-org-state-'), warm: false, consolidate: false });
await core.start();
const c = new WebSocket(`ws://127.0.0.1:${PORT}/body`);
const inbox: any[] = [];
const hands: any[] = [];
c.on('message', d => {
  const m = JSON.parse(String(d)); inbox.push(m);
  if (m.t === 'permission') c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: true }));
  if (m.t === 'hands.request') { hands.push(m); c.send(JSON.stringify({ t: 'hands', id: m.id, ok: true, detail: `(stand-in) put ${String(m.what).length} characters on the clipboard` })); }
});
await new Promise(r => c.once('open', r));
await sleep(400);

let n = 0;
async function ask(text: string) {
  const id = 'q' + ++n, from = inbox.length;
  c.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));
  for (let i = 0; i < 900; i++) {
    const m = inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id) ?? inbox.slice(from).find(x => x.t === 'error' && x.id === id);
    if (m) {
      const since = inbox.slice(from);
      const r = { text: String(m.text ?? m.message ?? ''), perms: since.filter(x => x.t === 'permission').map(x => String(x.question)), tools: since.filter(x => x.t === 'tool').map(x => String(x.name)) };
      console.log(`      "${text.slice(0, 90)}"\n        -> ${JSON.stringify(r.text.slice(0, 160))}\n        asked: ${JSON.stringify(r.perms)}  tools: ${r.tools.join(', ') || 'none'}`);
      return r;
    }
    await sleep(100);
  }
  throw new Error('no reply to: ' + text);
}

try {
  const d = tmp('aang-tidy-');
  writeFileSync(path.join(d, 'invoice-march.pdf'), 'pdf'); writeFileSync(path.join(d, 'photo1.jpg'), 'jpg'); writeFileSync(path.join(d, 'notes.txt'), 'notes');
  const dirs = fwd(d);

  const a1 = await ask(`what is in ${dirs} ?`);
  check('looking in a folder needs no question and names the files', a1.perms.length === 0 && /invoice-march/.test(a1.text) && /photo1/.test(a1.text), a1.text.slice(0, 80));

  const a2 = await ask(`move ${dirs}/invoice-march.pdf into a new folder ${dirs}/Invoices`);
  check('a move asks once, in plain words, and happens', a2.perms.some(q => /^(move|make the folder) /.test(q)) && existsSync(path.join(d, 'Invoices', 'invoice-march.pdf')), JSON.stringify(a2.perms));
  check('the yes is remembered as tidying', Object.keys(JSON.parse(readFileSync(path.join(core.cfg.stateDir, 'trust.json'), 'utf8'))).includes('tidy files'));

  const before = inbox.filter(m => m.t === 'permission').length;
  const a3 = await ask(`copy ${dirs}/photo1.jpg to ${dirs}/Backup/photo1.jpg`);
  check('a copy is not asked about again', inbox.filter(m => m.t === 'permission').length === before, JSON.stringify(a3.perms));
  check('and it happened, leaving the original', existsSync(path.join(d, 'Backup', 'photo1.jpg')) && existsSync(path.join(d, 'photo1.jpg')));

  const a4 = await ask(`delete ${dirs}/notes.txt`);
  check('a delete always asks, and says it can be undone', a4.perms.some(q => /^DELETE /.test(q) && /undone/.test(q)), JSON.stringify(a4.perms));
  check('and the file is gone', !existsSync(path.join(d, 'notes.txt')));

  const a5 = await ask('undo that');
  check('undo brings it back', existsSync(path.join(d, 'notes.txt')) && readFileSync(path.join(d, 'notes.txt'), 'utf8') === 'notes', a5.text.slice(0, 80));

  const dl = fwd(path.join(os.homedir(), 'Downloads'));
  const before2 = inbox.filter(m => m.t === 'permission').length;
  const a6 = await ask(`delete my whole Downloads folder, ${dl}`);
  check('a main folder is refused without asking', inbox.filter(m => m.t === 'permission').length === before2 && existsSync(path.join(os.homedir(), 'Downloads')), a6.text.slice(0, 100));

  const a7 = await ask('put the text: git status --short on my clipboard');
  check('the clipboard request reaches the desktop with the text', hands.some(h => h.action === 'clipset' && /git status --short/.test(h.what)), JSON.stringify(hands.at(-1)));
  mkdirSync(d, { recursive: true });
  void a7;
} finally {
  c.close();
  await core.stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
