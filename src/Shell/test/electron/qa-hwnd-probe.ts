// Does a page reload give the window a new Chrome_RenderWidgetHostHWND (the one Electron forwards mouse moves to)?
import { app, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String(e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 40_000).unref();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ps = `Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class W { public delegate bool P(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, P f, IntPtr l);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
public static string L(long p){ var o=new List<string>(); EnumChildWindows(new IntPtr(p),(h,l)=>{var s=new StringBuilder(256);GetClassName(h,s,256);o.Add(s+"@"+h.ToInt64());return true;},IntPtr.Zero); return string.Join(",",o);} }
"@; [W]::L(HWND)`;
const kids = (w: BrowserWindow) => { const h = w.getNativeWindowHandle(); const n = h.length >= 8 ? Number(h.readBigUInt64LE(0)) : h.readUInt32LE(0); return execFileSync('powershell', ['-NoProfile', '-Command', ps.replace('HWND', String(n))]).toString().trim(); };
app.whenReady().then(async () => {
  const w = new BrowserWindow({ x: -9000, y: -9000, width: 300, height: 200, show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true });
  w.setIgnoreMouseEvents(true, { forward: true });
  await w.loadURL('data:text/html,<body>a</body>');
  w.showInactive(); w.setPosition(-9000, -9000);
  await wait(500);
  console.log('before', kids(w));
  w.webContents.reloadIgnoringCache(); await wait(1200);
  console.log('after reload', kids(w));
  w.hide(); await wait(200); w.showInactive(); w.setPosition(-9000, -9000); await wait(300);
  console.log('after hide/show', kids(w));
  w.destroy(); setTimeout(() => app.exit(0), 100);
});
