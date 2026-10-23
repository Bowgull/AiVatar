// Does freezing a page work in Samara's engine (2026-10-23)? A page counts in a timer; it is frozen through Chromium's
// own developer channel (Page.setWebLifecycleState), and the count must stop, then go on after it is thawed; and stay
// frozen after the channel is let go. Run: npx electron test/electron/freeze-probe.ts
import { app, BrowserWindow } from 'electron';
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,<script>window.n=0;setInterval(()=>n++,100);document.addEventListener("freeze",()=>window.froze=1);document.addEventListener("resume",()=>window.resumed=1)</script>');
  const wc = w.webContents, n = () => wc.mainFrame.executeJavaScript('window.n');
  await wait(1000);
  const dbg = wc.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const a = await n(); await dbg.sendCommand('Page.setWebLifecycleState', { state: 'frozen' }); await wait(1500);
  const b = await n().catch(() => 'no answer while frozen');
  dbg.detach(); await wait(1500);
  const c = await n().catch(() => 'no answer while frozen');
  dbg.attach('1.3'); await dbg.sendCommand('Page.setWebLifecycleState', { state: 'active' }); dbg.detach(); await wait(1000);
  const d = await n();
  console.log(`count before ${a}, frozen 1.5 s later ${b}, after letting go ${c}, thawed ${d}; freeze event ${await wc.mainFrame.executeJavaScript('window.froze')} resume ${await wc.mainFrame.executeJavaScript('window.resumed')}`);
  app.exit(0);
});
