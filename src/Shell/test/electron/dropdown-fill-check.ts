// 2026-10-23 (his report): province and country dropdowns never filled. The real fill script on a checkout-like form
// with dropdowns named every common way (full names, codes, a blank first choice). Run: npx electron test/electron/dropdown-fill-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fillDetailsScript } from '../../src/autofill.ts';

process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'ddfill-')));
const FORM = `<form>
<input id="given" autocomplete="given-name"><input id="street" autocomplete="address-line1"><input id="city" name="city">
<select id="prov" autocomplete="address-level1"><option value="">Choose</option><option value="AB">Alberta</option><option value="ON">Ontario</option></select>
<select id="prov2" name="state"><option value="">--</option><option>Alberta</option><option>Ontario</option></select>
<select id="country" autocomplete="country"><option value="">Choose</option><option value="US">United States</option><option value="CA">Canada</option></select>
<select id="country2" name="country"><option value="0">Select</option><option value="38">Canada</option><option value="230">USA</option></select>
<select id="preset" name="country"><option value="US" selected>United States</option><option value="CA">Canada</option></select>
<select id="kept" name="country"><option value="">Choose</option><option value="US">United States</option><option value="CA">Canada</option></select>
</form>`;
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false });
  await w.loadURL('data:text/html,' + encodeURIComponent(FORM));
  const js = (c: string) => w.webContents.executeJavaScript(c);
  await js(`document.getElementById('kept').value = 'US'; document.getElementById('given').focus()`);
  const n = await w.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: fillDetailsScript({ given: 'Sam', street: '100 Queen Street West', city: 'Toronto', region: 'Ontario', country: 'Canada' }, true) }]);
  const v: Record<string, string> = await js(`Object.fromEntries([...document.querySelectorAll('input,select')].map(e => [e.id, e.value]))`);
  let bad = 0;
  const check = (what: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) bad++; };
  console.log(JSON.stringify(v), n);
  check('typed boxes still fill', v.given === 'Sam' && v.city === 'Toronto');
  check('province dropdown with codes picks ON', v.prov === 'ON');
  check('province dropdown with names picks Ontario', v.prov2 === 'Ontario');
  check('country dropdown with codes picks CA', v.country === 'CA');
  check('country dropdown with numbers picks Canada', v.country2 === '38');
  check('a page preset (United States) becomes Canada', v.preset === 'CA');
  check('a dropdown he already chose is left alone', v.kept === 'US');
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});
