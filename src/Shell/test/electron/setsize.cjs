// Does setSize take on a frameless, transparent, NON-resizable window on this machine?
//
// The bubble window measured its content, asked to shrink, and stayed at 560x220 (seen with
// capture-screen, 2026-10-04). This checks the window options in isolation, so it costs no messages
// to the brain. Run with: npx electron test/electron/setsize.cjs
const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const results = {};
  for (const resizable of [false, true]) {
    const w = new BrowserWindow({
      width: 560, height: 220, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable, show: false, skipTaskbar: true,
    });
    // No page needed: this is only about the window itself.
    w.showInactive();
    w.setSize(220, 100);
    const afterSetSize = w.getSize();
    w.setBounds({ x: 100, y: 100, width: 230, height: 110 });
    const afterSetBounds = w.getSize();
    results['resizable=' + resizable] = { afterSetSize, afterSetBounds };
    w.destroy();
  }
  console.log(JSON.stringify(results));
  app.quit();
});
