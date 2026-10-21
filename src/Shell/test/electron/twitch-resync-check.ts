// Twitch ad-break resync (2026-10-21): a fake player with a "we'll be right back" overlay; when it goes away the
// watcher must pause, jump to the live edge and play again. Offscreen, no network.
import { app, BrowserWindow } from 'electron';
import { TWITCH_RESYNC_JS } from '../../src/popout.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 30_000).unref();
app.on('window-all-closed', () => {});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<div class="video-player"><div id="o">We will be right back after the ad</div></div>');
  const js = (s: string) => w.webContents.executeJavaScript(s, true);
  // A stand-in video: buffered to 100 s, sitting at 90 s (10 s behind live), records what was done to it.
  await js(`(() => { const v = document.createElement('video'); document.querySelector('.video-player').append(v);
    Object.defineProperty(v, 'videoWidth', { value: 1280 }); Object.defineProperty(v, 'videoHeight', { value: 720 });
    Object.defineProperty(v, 'buffered', { value: { length: 1, end: () => 100 } });
    let t = 90; Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; window.__log.push('seek ' + x); } });
    window.__log = []; v.pause = () => window.__log.push('pause'); v.play = () => { window.__log.push('play'); return Promise.resolve(); }; })()`);
  await js(TWITCH_RESYNC_JS);
  await wait(1300);
  await js(`document.getElementById('o').textContent = ''`);   // the break ends
  await wait(3500);
  const log = await js('window.__log') as string[];
  const ok = log.join(',') === 'pause,seek 99,play';
  console.log((ok ? 'PASS' : 'FAIL') + '  after the break: pause, jump to the live edge, play  -- ' + JSON.stringify(log));
  console.log(ok ? 'all passed' : '1 failed');
  setTimeout(() => app.exit(ok ? 0 : 1), 100);
});
