// 4.1: actually look at the bubble, with a list in it.
//   node look-bubble.mjs            captures to the repo's snaps-bubble folder
//
// WHY THIS EXISTS: the carved frame, the grain and the list rows pass 40 tests and nobody has ever
// watched them render. The rule that earned, recorded at NEXT.md:257 after the first attempt shipped
// looking nothing like the approved mockup: "when a visual pass is approved from a mockup, the frame
// and the texture are the deliverable, not the data plumbing underneath it."
//
// Drives the real Body with a fake Core, so this costs no quota and needs nobody to type. It is a
// rendering check, not a model check: whether Aang CHOOSES to call present_list is a separate
// question, and a live one (he declined the first time he was asked).
//
// The content is Joshua's real job data, because a mockup filled with lorem ipsum hides exactly the
// problems that matter - a long company name, an empty chip, a row that has no subtitle.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-bubble');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let capLine = null;
cap.stdout.on('data', d => { const s = String(d).trim(); if (capLine) { const f = capLine; capLine = null; f(s); } });
const snap = async name => {
  const file = path.join(outDir, name + '.png');
  const reply = new Promise(res => { capLine = res; });
  cap.stdin.write(`snap ${file} Aang Body\n`);
  const r = await reply;
  console.log((r.startsWith('ok') ? '  saved  ' : '  FAILED ') + name + (r.startsWith('ok') ? '' : '  ' + r));
};

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null;
const hello = new Promise(res => wss.on('connection', s => { ws = s; s.on('message', m => { const j = JSON.parse(String(m)); if (j.t === 'hello') res(j); }); }));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(2500);

// 1. A one-line reply. Mockup E's case: no frame furniture, just parchment and a tail. If a trivial
//    answer gets the full carved treatment, "it is 3:14" looks absurd - that was the stated risk.
send({ t: 'bubble', text: 'Octup is the only one past first round.', stream: false, id: 'look1', who: 'Aang' });
await sleep(1800);
await snap('01_one_line');

// 2. The full treatment: prose plus rows. Real follow-ups from applications.md, including a long
//    company name and one row with no chip, because those are where layouts break.
send({
  t: 'bubble', id: 'look2', who: 'Aang', stream: false,
  text: 'Three follow-ups are due this week.',
  list: {
    icon: 'job',
    items: [
      { title: 'Octup', subtitle: 'Account Manager - interviewed 30 Sept', chipText: 'Round 3', chipTone: 'good' },
      { title: 'BeMo', subtitle: 'Functional test due 2 Oct', chipText: 'Due', chipTone: 'careful' },
      { title: 'Constellation Dealer Group', subtitle: 'Digital Project Coordinator - no reply since 15 Sept' },
    ],
    moreCount: 17,
  },
});
await sleep(2200);
await snap('02_list_rows');

// 3. Five rows, the server-side cap. The bubble must grow to fit and still never need a scrollbar.
send({
  t: 'bubble', id: 'look3', who: 'Aang', stream: false,
  text: 'Everything still open:',
  list: {
    icon: 'job',
    items: [
      { title: 'Deliverect', subtitle: 'Enterprise CSM', chipText: '$105-133K', chipTone: 'good' },
      { title: 'GreenShield', subtitle: 'Implementation Specialist', chipText: 'Contract', chipTone: 'normal' },
      { title: 'Litmus', subtitle: 'CS Account Manager', chipText: 'Toronto', chipTone: 'normal' },
      { title: 'Samsara', subtitle: 'Enterprise Core CSM', chipText: 'Remote', chipTone: 'normal' },
      { title: 'Packetlabs', subtitle: 'Client Success Manager', chipText: 'Stale', chipTone: 'inactive' },
    ],
    moreCount: 15,
  },
});
await sleep(2200);
await snap('03_five_rows');

// 4. A permission question. Different furniture again: the choices sit inside the same frame.
// 5. The plaque: the one case it exists for, something genuinely time-critical.
send({
  t: 'bubble', id: 'look5', who: 'Aang', stream: false,
  text: 'Two things need you before tomorrow.',
  list: {
    icon: 'deadline',
    header: { text: 'DUE TOMORROW', tone: 'careful' },
    items: [
      { title: 'BeMo', subtitle: 'Functional test due 2 Oct', chipText: 'Test', chipTone: 'careful' },
      { title: 'FreeWill', subtitle: 'Follow up, applied 18 Sept', chipText: 'Chase', chipTone: 'normal' },
    ],
  },
});
await sleep(2200);
await snap('05_plaque');

send({ t: 'permission', id: 'perm9', tool: 'Read', question: 'read G:\\My Drive\\Job Search 2026\\applications.md', remembers: 'read and search your files' });
await sleep(1800);
await snap('04_asking');

send({ t: 'bubble.clear' });
await sleep(800);
try { body.kill(); } catch { }
cap.stdin.write('quit\n');
await sleep(600);
try { cap.kill(); } catch { }
wss.close();
console.log('\nsnapshots in ' + outDir);
