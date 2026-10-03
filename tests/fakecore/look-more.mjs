// Does the "there is more" arrow still work?
//   node look-more.mjs        captures to the repo's snaps-more folder
//
// Joshua, 2026-10-03: "can we take a look at what happend to our downward arrow when we have long
// messages. Is this still useful?"
//
// It is his own affordance, not decoration: a reply over CollapsedLines (6) shows a bobbing arrow and
// an ellipsised last line, and clicking the bubble grows it to ExpandedLines (12), scrolling beyond
// that. This drives the real Body with a fake Core and clicks the bubble, so the answer comes from the
// screen rather than from reading the code.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const exeIn = c => path.join(root, 'src', 'Body', 'bin', c, 'net10.0-windows', 'Aang.exe');
const bodyExe = fs.existsSync(exeIn('Debug')) ? exeIn('Debug') : exeIn('Release');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-more');
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

/** Click the middle of the bubble, refusing unless Windows agrees that pixel is the Body's. */
function clickBubble() {
  const ps = `
    Add-Type -TypeDefinition 'using System;using System.Text;using System.Runtime.InteropServices;
    public class C{
      [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
      [DllImport("user32.dll")]public static extern void mouse_event(uint f,int dx,int dy,uint d,UIntPtr e);
      [DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(P p);
      [DllImport("user32.dll")]static extern bool EnumWindows(EW f,IntPtr p);
      [DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
      [DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
      [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out R r);
      delegate bool EW(IntPtr h,IntPtr p);
      [StructLayout(LayoutKind.Sequential)]public struct P{public int X,Y;}
      [StructLayout(LayoutKind.Sequential)]public struct R{public int L,T,Rr,B;}
      public static IntPtr Find(string t){IntPtr f=IntPtr.Zero;
        EnumWindows((h,l)=>{var sb=new StringBuilder(256);GetWindowText(h,sb,256);
          if(sb.ToString()==t&&IsWindowVisible(h)){f=h;return false;}return true;},IntPtr.Zero);return f;}
      public static IntPtr At(int x,int y){P p=new P();p.X=x;p.Y=y;return WindowFromPoint(p);}
    }';
    $h=[C]::Find('Aang Body'); if($h -eq [IntPtr]::Zero){'no window';exit}
    $r=New-Object C+R; [void][C]::GetWindowRect($h,[ref]$r)
    $x=$r.L+237; $y=$r.T+270
    if([C]::At($x,$y) -ne $h){'pixel does not belong to the Body - not clicking';exit}
    [void][C]::SetCursorPos($x,$y); Start-Sleep -Milliseconds 140
    [C]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 70
    [C]::mouse_event(4,0,0,0,[UIntPtr]::Zero); 'clicked ' + $x + ',' + $y`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  console.log('      ' + String(r.stdout ?? '').trim());
}

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

// Six lines or fewer: no arrow, nothing to expand.
send({ t: 'bubble', id: 'short', who: 'Aang', stream: false, text: 'Interviewed 30 September, round three. Nothing needed from you yet.' });
await sleep(2200);
await snap('01_short_no_arrow');

// Comfortably over six lines: the arrow should be bobbing bottom-right and the last line ellipsised.
send({ t: 'bubble', id: 'long', who: 'Aang', stream: false, text:
  'I looked at the three jobs that came in overnight and scored them against what you said you wanted. ' +
  'Octup is a Customer Success Manager role in Toronto, hybrid, paying ninety-five to a hundred and twenty ' +
  'thousand, and it is the closest match you have had all month because the account work is what you already do. ' +
  'Constellation Dealer Group posted a Digital Project Coordinator role, remote across Canada, with no salary ' +
  'given, which makes it worth a look only if the week turns out thin. GreenShield wants a bilingual account ' +
  'executive in Montreal, which needs French and carries a quota, and both of those are on your dealbreaker list. ' +
  'I have not applied to any of them and nothing will be sent without your tap.' });
await sleep(2600);
await snap('02_long_collapsed_with_arrow');

// Click it: should grow to twelve lines.
clickBubble();
await sleep(2200);
await snap('03_after_click_expanded');

body.kill(); cap.stdin.write('quit\n'); wss.close();
await sleep(600);
console.log('\nlook at ' + outDir);
process.exit(0);
