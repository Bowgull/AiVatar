// 2026-10-25, his report: signing in to Shadow ended on a red "fake site" plate naming "openidconnect". Shadow hands him
// back to its app with tech.shadow://openidconnect?... ; Samara must offer to open the app (Shadow PC), not call it fake.
// Run: npx electron test/electron/applink-check.ts
import { app } from 'electron';
app.whenReady().then(async () => {
  const { appOf } = await import('../../src/browser.ts');
  let bad = 0;
  const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
  const shadow = appOf('tech.shadow://openidconnect?code=abc&state=xyz');
  check("Shadow's sign-in link is for its app", Boolean(shadow) && /shadow/i.test(shadow!), String(shadow));
  check('the known ones keep their names', appOf('zoommtg://zoom.us/join?confno=1') === 'Zoom');
  for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'ms-msdt:/id', 'search-ms:query=x'])
    check(`never handed to an app: ${u.split(':')[0]}`, appOf(u) === null);
  check('a link no app opens: nothing offered', appOf('nosuchapp-xyz://thing') === null);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
