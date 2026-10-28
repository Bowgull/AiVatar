// Claude's hands and eyes on Aang's Mac windows, through the test door (src/Shell/src/macdoor.ts). His real mouse and
// screen are never touched: pictures come from the windows themselves, clicks go into the page only.
//
//   node tools/aang-door.mjs windows
//   node tools/aang-door.mjs shot <id|kind> <file.png>
//   node tools/aang-door.mjs text <id|kind>
//   node tools/aang-door.mjs click <id|kind> <x> <y> [right] [holdMs]
//   node tools/aang-door.mjs hover <id|kind> <x> <y>
//   node tools/aang-door.mjs type <id|kind> <words>
//   node tools/aang-door.mjs pet click|menu|hold|out
//   node tools/aang-door.mjs pet release <screenX> <screenY>
//   node tools/aang-door.mjs pet slot timer|notes|browser|music|snip|away
// A kind (bubble, input, aangmenu, wheel, timer, macpet...) picks the first shown window of that page.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEY = readFileSync(path.join(os.homedir(), 'Library', 'Application Support', 'Aang', 'aang-test-door.key'), 'utf8').trim();
const BASE = 'http://127.0.0.1:47856';
const call = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { 'x-aang-key': KEY, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r;
};
const idOf = async (w) => {
  if (/^\d+$/.test(w)) return Number(w);
  const list = await (await call('GET', '/windows')).json();
  const hit = list.find((x) => x.kind === w && x.visible) ?? list.find((x) => x.kind === w);
  if (!hit) throw new Error(`no ${w} window (have: ${list.map((x) => x.kind).join(', ')})`);
  return hit.id;
};
const [cmd, a, b, c, d, e] = process.argv.slice(2);
try {
  if (cmd === 'windows') console.log(JSON.stringify(await (await call('GET', '/windows')).json(), null, 1));
  else if (cmd === 'shot') { writeFileSync(b, Buffer.from(await (await call('GET', `/shot?id=${await idOf(a)}`)).arrayBuffer())); console.log('saved ' + b); }
  else if (cmd === 'text') console.log(JSON.stringify(await (await call('GET', `/text?id=${await idOf(a)}`)).json(), null, 1));
  else if (cmd === 'click') console.log(JSON.stringify(await (await call('POST', '/click', { id: await idOf(a), x: Number(b), y: Number(c), button: d === 'right' ? 'right' : 'left', holdMs: Number(d === 'right' ? e : d) || 0 })).json()));
  else if (cmd === 'hover') console.log(JSON.stringify(await (await call('POST', '/hover', { id: await idOf(a), x: Number(b), y: Number(c) })).json()));
  else if (cmd === 'type') console.log(JSON.stringify(await (await call('POST', '/type', { id: await idOf(a), text: process.argv.slice(4).join(' ') })).json()));
  else if (cmd === 'pet' && a === 'slot') console.log(JSON.stringify(await (await call('POST', '/pet', { do: 'slot', slot: String(b).toUpperCase() })).json()));
  else if (cmd === 'pet') console.log(JSON.stringify(await (await call('POST', '/pet', { do: a, x: Number(b), y: Number(c) })).json()));
  else console.log('windows | shot <w> <file> | text <w> | click <w> x y [right] [holdMs] | hover <w> x y | type <w> words | pet click|menu|hold|out|release x y');
} catch (err) { console.log('door: ' + err.message); process.exit(1); }
