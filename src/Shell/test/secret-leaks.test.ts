// Every way the secret window's memory could leave it (Samara QA 2026-11-19, P-2 and P-3; his rule the same day: "It
// CANNOT leak anywhere"). One check per path. The live ones (its pages, its PIN) are test/electron/secret-check.ts, on
// the Mac; the PC side, with the real Keychain stand-in, is test/electron/sealdir-check.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SECRET_ELSEWHERE, isSecretPage, markSecret, secretAllowed, MAC_MEDIA_OFF } from '../src/secretguard.ts';
import { CookieWall } from '../src/privacy.ts';
import { SealedDir } from '../src/sealdir.ts';
import { startFlight } from '../src/flight.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const browser = src('browser.ts');

test('the secret window exists on the Mac only', () => {
  assert.equal(secretAllowed('darwin'), true);
  for (const p of ['win32', 'linux'] as NodeJS.Platform[]) assert.equal(secretAllowed(p), false, p);
  assert.match(browser, /if \(o\.secret && !secretAllowed\(\)\) throw/, 'the browser refuses to be one off the Mac, before any session or folder');
  assert.match(src('samara.ts'), /secret: false,/, 'the PC\'s Samara asks for none');
  assert.match(src('boot.ts'), /const secretHere = bp\.secret === true && p\.name === 'mac'/);
  // ⇧Ctrl+N on the PC says where it lives
  assert.equal(SECRET_ELSEWHERE, 'The secret window lives on your Mac');
  assert.match(browser, /k === 'n' && process\.platform !== 'darwin'\) \{ if \(this\.onSecret\) this\.onSecret\(\); else this\.note\('', \{[^}]*title: SECRET_ELSEWHERE/);
});

test('its site settings live in its own sealed folder, never in normal Samara\'s shared files', () => {
  assert.match(browser, /const own = o\.secret \? o\.stateDir : sd;/);
  for (const f of ['adblock-paused.json', 'device-ok.json', 'browser-http-ok.json', 'download-trusted.json', 'site-rules.json'])
    assert.match(browser, new RegExp(`path\\.join\\(own, '${f.replace('.', '\\.')}'\\)`), f);
  assert.match(browser, /new CookieWall\(own, \{ quiet: o\.secret === true \}\)/);
  // and none of those names is ever joined to the shared folder any more
  for (const f of ['adblock-paused.json', 'device-ok.json', 'browser-http-ok.json', 'download-trusted.json', 'site-rules.json'])
    assert.ok(!new RegExp(`path\\.join\\(sd, '${f.replace('.', '\\.')}'\\)`).test(browser), `${f} not in the shared folder`);
});

test('cookie let-throughs: no privacy log from the secret window, and its pass list is sealed', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'leak-')), s = path.join(d, 'secret'); mkdirSync(s);
  const room = new SealedDir(s, { lock: (x) => 'k' + x, open: (x) => x.slice(1) });
  const wall = new CookieWall(s, { quiet: true });
  wall.letThrough('hidden-cdn.example', 'hidden.example', 'test');
  assert.ok(!existsSync(path.join(s, 'cookie-pass.json')), 'locked: not written at all');
  room.open();
  wall.letThrough('hidden-cdn2.example', 'hidden.example', 'test');
  const pass = readFileSync(path.join(s, 'cookie-pass.json'));
  assert.ok(!pass.toString('latin1').includes('hidden'), 'sealed on disk');
  assert.ok(!readdirSync(s).some((n) => n.includes('privacy-log')), 'no privacy log');
  assert.ok(!readdirSync(d).some((n) => n.includes('privacy-log')), 'none in the shared folder either');
  // read again after its PIN (reload)
  const again = new CookieWall(s, { quiet: true });
  assert.equal(again.passes('hidden-cdn2.example', 'hidden.example', 'https://hidden-cdn2.example/x'), true);
  room.close();
  again.reload();
  assert.equal(again.passes('hidden-cdn2.example', 'hidden.example', 'https://hidden-cdn2.example/x'), false, 'locked, its list reads as empty');
  // normal Samara's wall still keeps its log
  const n = new CookieWall(d);
  n.letThrough('a.example', 'b.example', 'test');
  assert.ok(existsSync(path.join(d, 'privacy-log.jsonl')));
});

test('a secret tab that crashes or hangs is "a secret tab" in samara.log, never its site', () => {
  const app = new EventEmitter() as any;
  app.getAppMetrics = () => [];
  const lines: string[] = [];
  startFlight(app, mkdtempSync(path.join(os.tmpdir(), 'flight-')), (s) => lines.push(s));
  const secretSes = {}, normalSes = {};
  markSecret(secretSes);
  const wc = (ses: object, url: string) => Object.assign(new EventEmitter(), { session: ses, getURL: () => url });
  const sec = wc(secretSes, 'https://hidden.example/page'), nor = wc(normalSes, 'https://open.example/page');
  app.emit('render-process-gone', {}, sec, { reason: 'crashed', exitCode: 1 });
  app.emit('render-process-gone', {}, nor, { reason: 'crashed', exitCode: 1 });
  app.emit('web-contents-created', {}, sec); sec.emit('unresponsive'); sec.emit('responsive');
  const all = lines.join('\n');
  assert.ok(!all.includes('hidden.example'), all);
  assert.match(all, /page gone \(crashed, code 1\) on a secret tab/);
  assert.match(all, /not answering on a secret tab/);
  assert.match(all, /open\.example/, 'normal pages are still named');
  assert.equal(isSecretPage({ session: secretSes }), true);
  assert.equal(isSecretPage({ session: normalSes }), false);
});

test('typing before the PIN asks no search engine; after it, only through its own session', () => {
  assert.match(browser, /async guesses\(text: string\): Promise<string\[\]> \{[\s\S]{0,300}if \(this\.o\.secret && this\.locked\) return \[\];/);
  assert.match(browser, /const fetcher = this\.o\.secret \? this\.ses\.fetch\.bind\(this\.ses\) : net\.fetch;/);
});

test('its paused ad sites never go into the ad engine kept in normal Samara\'s folder', () => {
  assert.match(browser, /paused: this\.o\.secret \? \[\.\.\.CALL_SITES\] : \[\.\.\.this\.paused, \.\.\.CALL_SITES\], privatePauses: this\.o\.secret === true/);
  assert.match(src('skip/ads.ts'), /const now = opts\.privatePauses \? \[\.\.\.\(opts\.paused \?\? \[\]\)\] : \[\.\.\.paused\];/);
});

test('no Now Playing on the Mac: the system media controls are off before Samara is ready', () => {
  assert.equal(MAC_MEDIA_OFF, 'HardwareMediaKeyHandling');
  const mac = src('macmain.ts');
  const at = mac.indexOf("app.commandLine.appendSwitch('disable-features', MAC_MEDIA_OFF)");
  assert.ok(at > 0 && at < mac.indexOf('app.whenReady()'), 'appended before the app is ready');
});

test('crash shots never picture the secret window', () => {
  assert.match(browser, /if \(this\.o\.secret \|\| Date\.now\(\) - this\.troubleAt < 60_000\) return;/);
});
