// The Mac's Samara (2026-10-22, the Mac catch-up): the bundle the update sends builds, carries what macmain.ts needs
// (and the aang-link mod), and nothing Windows-only can run on the Mac. Plus the Mac's mockup door and the two merges
// the Mac setup runs on his Claude files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { macBrowserBundle, macSetupScript, MOCKUP_RULES, PLUGIN_MERGE_JS, RULES_MERGE_JS } from '../../Core/src/macsetup.ts';
import { checkAsk, startMockupDoor } from '../src/mockupdoor.ts';

const SHELL = path.resolve(import.meta.dirname, '..');
const SRC = path.join(SHELL, 'src');

/** macmain.ts and every module it loads at run time (type-only imports are erased, so they do not count). */
function closure(): { files: string[]; external: Set<string> } {
  const seen = new Set<string>(), external = new Set<string>(), todo = [path.join(SRC, 'macmain.ts')];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const s = readFileSync(f, 'utf8');
    const re = /^\s*(import|export)\s+(?!type\s)[^;'"]*?\sfrom\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/gm;
    for (const m of s.matchAll(re)) {
      const spec = m[2] ?? m[3] ?? m[4]!;
      if (spec.startsWith('.')) todo.push(path.resolve(path.dirname(f), spec));
      else external.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
    }
  }
  return { files: [...seen], external };
}

test('the Mac bundle builds, with macmain, its modules, the pages and the aang-link mod (not its tests)', { timeout: 60_000 }, () => {
  const tgz = macBrowserBundle(SHELL);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'macbundle-'));
  const f = path.join(dir, 'b.tgz');
  writeFileSync(f, tgz);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const list = new Set(execFileSync(tar, ['-tzf', f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).map((x) => x.replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean));
  for (const want of ['src/macmain.ts', 'src/mockupdoor.ts', 'pages/browser.html', 'package.json', 'package-lock.json', 'claude-link/hooks/hooks.json', 'claude-link/hooks/register.ts', 'claude-link/hooks/link.ts', 'claude-link/.claude-plugin/plugin.json']) assert.ok(list.has(want), `the bundle has ${want}`);
  assert.ok(![...list].some((x) => x.startsWith('claude-link/tests')), "the mod's tests stay home");
  for (const file of closure().files) assert.ok(list.has('src/' + path.relative(SRC, file).split(path.sep).join('/')), `${path.basename(file)} (loaded by macmain) is in the bundle`);
});

test("everything macmain loads is in the Mac app's own packages (no koffi, no Windows-only package)", () => {
  const pkg = JSON.parse(readFileSync(path.join(SHELL, 'mac-pkg', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  const ok = new Set(['electron', ...Object.keys(pkg.dependencies)]);
  for (const x of closure().external) assert.ok(x.startsWith('node:') || ok.has(x), `macmain's modules load ${x}, which the Mac does not install`);
});

/**
 * Windows-only calls in what the Mac runs: each must sit behind a process.platform check (within the lines before it)
 * or in a try that expects it to fail off Windows. The exceptions are listed with why.
 */
test('no unguarded Windows-only call in anything the Mac runs', () => {
  const PATTERNS: [RegExp, string][] = [
    [/\b(spawn|execFile|execFileSync|exec)\(\s*['"`](powershell|pwsh|cmd)(\.exe)?['"`]/i, 'PowerShell / cmd'],
    [/\.(setAppDetails|setThumbarButtons|setThumbnailClip|setThumbnailToolTip|setOverlayIcon|setShape|hookWindowMessage)\(/, 'a Windows-only window call'],
    [/\bapp\.(setUserTasks|setJumpList)\(/, 'the taskbar jump list'],
    [/['"`]koffi['"`]/, 'koffi'],
    [/\\\\\\\\localhost|\\\\\\\\[A-Za-z0-9-]+\\\\[a-z]\$/, 'a UNC path'],
    [/CurseForge|World of Warcraft|_retail_|_classic_/, 'WoW / CurseForge paths'],
    [/System32|\btar\.exe\b|\belectron\.exe\b|\bAang\.exe\b/, 'a Windows program'],
  ];
  // engineupdate.ts: the PC's engine updater (castLabs win32 zips, tar.exe, electron.exe). macmain imports only
  // onCastlabs from it (checked below). drmrunner.ts: electron.exe is the PC's side of a darwin/win32 choice.
  const EXEMPT: Record<string, string> = { 'engineupdate.ts': 'PC engine updater; macmain uses only onCastlabs', 'drmrunner.ts': 'a platform ternary' };
  const bad: string[] = [];
  for (const file of closure().files) {
    const name = path.relative(SRC, file).split(path.sep).join('/');
    if (EXEMPT[name]) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
      for (const [re, what] of PATTERNS) {
        if (!re.test(ln)) continue;
        const before = lines.slice(Math.max(0, i - 30), i + 1).join('\n');
        const guarded = /process\.platform/.test(before) || /try\s*\{[^}]*$/.test(ln.split(re)[0] ?? '') || /\btry\s*\{/.test(ln) && /catch\s*\{\s*\/\*\s*not Windows/.test(ln);
        if (!guarded) bad.push(`${name}:${i + 1} ${what}: ${ln.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'unguarded Windows-only calls in the Mac bundle');
  const mm = readFileSync(path.join(SRC, 'macmain.ts'), 'utf8');
  assert.match(mm, /import \{ onCastlabs \} from '\.\/engineupdate\.ts'/, 'macmain takes only onCastlabs from the engine updater');
  const onC = /export (const|function) onCastlabs[\s\S]*?\n\}?\n/.exec(readFileSync(path.join(SRC, 'engineupdate.ts'), 'utf8'))?.[0] ?? '';
  assert.doesNotMatch(onC, /\.exe|System32|powershell/i, 'onCastlabs itself is plain');
});

// ------------------------------------------------------------------ the Mac's mockup door
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'pipe', windowsHide: true });
function repo(): string {
  const r = mkdtempSync(path.join(os.tmpdir(), 'mockdoor-'));
  git(r, 'init', '-q'); git(r, 'config', 'user.email', 't@t'); git(r, 'config', 'user.name', 't');
  mkdirSync(path.join(r, 'docs')); mkdirSync(path.join(r, '.hidden'));
  writeFileSync(path.join(r, 'docs', 'sheet-1.html'), '<p>one</p>'); writeFileSync(path.join(r, '.hidden', 'x.html'), 'x'); writeFileSync(path.join(r, 'docs', 'a.txt'), 'a');
  git(r, 'add', '-A'); git(r, 'commit', '-qm', 'one');
  return r;
}

test('the door checks a request as the brain does on the PC', () => {
  const r = repo();
  const ok = checkAsk({ cwd: path.join(r, 'docs'), path: 'sheet-1.html', title: '01 · One', branch: 'Mac' });
  assert.ok(ok.ok && ok.drop.path === 'docs/sheet-1.html' && ok.drop.branch === 'Mac' && ok.drop.title === '01 · One');
  assert.equal(checkAsk({ cwd: r, path: '.hidden/x.html' }).ok, false, 'no dot folders');
  assert.equal(checkAsk({ cwd: r, path: 'docs/a.txt' }).ok, false, 'html only');
  assert.equal(checkAsk({ cwd: r, path: '../outside.html' }).ok, false, 'inside the repo only');
  assert.equal(checkAsk({ cwd: os.tmpdir(), path: 'x.html' }).ok, false, 'a folder outside any repo');
  assert.equal(checkAsk({ url: 'https://example.com/' }).ok, false, 'live pages on this computer only');
  assert.equal(checkAsk({ url: 'http://127.0.0.1:5173/x' }).ok, true);
  assert.equal(checkAsk({ cwd: r, path: 'docs/sheet-1.html', url: 'http://127.0.0.1:1/' }).ok, false, 'one or the other');
});

test('the door answers only signed requests, proves its key, and opens the page', { timeout: 20_000 }, async () => {
  const state = mkdtempSync(path.join(os.tmpdir(), 'mockdoor-state-')), r = repo();
  const port = 47900 + Math.floor(Math.random() * 90);
  const opened: unknown[] = [];
  const close = startMockupDoor(state, async (d) => { opened.push(d); return { id: 1, sheet: 's', title: 't', commit: 'c', at: 0, key: 'k', v: 1 }; }, () => null, port);
  try {
    const key = readFileSync(path.join(state, 'mockup-door.key'), 'utf8');
    const mac = (...p: string[]) => createHmac('sha256', key).update(p.join('\n')).digest('hex');
    const call = (method: string, pathQ: string, body = '', sign = true, extra: Record<string, string> = {}) => {
      const ts = String(Date.now());
      return fetch(`http://127.0.0.1:${port}${pathQ}`, { method, headers: { ...(sign ? { 'x-aang-link-ts': ts, 'x-aang-link-sig': mac('req', ts, method, pathQ, body) } : {}), ...extra }, ...(body ? { body } : {}) });
    };
    await new Promise((res) => setTimeout(res, 150));
    const n = randomBytes(16).toString('hex');
    const hello = await call('GET', `/hello?n=${n}`);
    assert.equal(hello.status, 200);
    assert.equal(((await hello.json()) as { proof: string }).proof, mac('hello', n), 'it proves it holds the key');
    assert.equal((await call('GET', `/hello?n=${n}`, '', false)).status, 403, 'unsigned: refused');
    const body = JSON.stringify({ cwd: r, path: 'docs/sheet-1.html', title: '01 · One' });
    assert.equal((await call('POST', '/mockup', body, true, { origin: 'https://evil.example' })).status, 403, 'a web page: refused');
    const ok = await call('POST', '/mockup', body);
    const j = (await ok.json()) as { ok: boolean; message: string };
    assert.equal(j.ok, true, j.message);
    assert.equal(opened.length, 1);
  } finally { close(); }
});

// ------------------------------------------------------------------ the Mac setup's merges into his Claude files
const runJs = (js: string, ...args: string[]) => execFileSync(process.execPath, ['-e', js, ...args], { encoding: 'utf8' }).trim();

test("the mod is added to Claude Code's settings without losing anything already there", () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'plug-')), f = path.join(d, 'settings.json');
  writeFileSync(f, JSON.stringify({ theme: 'dark', env: { OTHER: '1', CLAUDE_CODE_PLUGIN_DIRS: '/x/mine' }, hooks: { Stop: [] } }));
  assert.equal(runJs(PLUGIN_MERGE_JS, f, '/Apps/Samara.app/Contents/Resources/app/claude-link'), 'written');
  const j = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(j.theme, 'dark'); assert.equal(j.env.OTHER, '1'); assert.deepEqual(j.hooks, { Stop: [] });
  assert.deepEqual(j.env.CLAUDE_CODE_PLUGIN_DIRS.split(path.delimiter), ['/x/mine', '/Apps/Samara.app/Contents/Resources/app/claude-link']);
  assert.equal(runJs(PLUGIN_MERGE_JS, f, '/Apps/Samara.app/Contents/Resources/app/claude-link'), 'same', 'run again: nothing changes');
  writeFileSync(f, '{ not json');
  assert.throws(() => runJs(PLUGIN_MERGE_JS, f, '/a/claude-link'), 'a file that is not JSON is left alone');
  assert.equal(readFileSync(f, 'utf8'), '{ not json');
});

test('the mockup rule is merged into CLAUDE.md, never overwriting', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'rules-')), f = path.join(d, 'CLAUDE.md');
  const b64 = Buffer.from(MOCKUP_RULES).toString('base64');
  writeFileSync(f, '# Mine\n\n- keep this\n');
  assert.equal(runJs(RULES_MERGE_JS, f, b64), 'written');
  let s = readFileSync(f, 'utf8');
  assert.match(s, /^# Mine\n\n- keep this\n\n<!-- aang:mockups-in-samara -->\n## Mockups always go to Samara/);
  assert.equal(runJs(RULES_MERGE_JS, f, b64), 'same');
  writeFileSync(f, s + '\n## Later\n- also mine\n');
  assert.equal(runJs(RULES_MERGE_JS, f, Buffer.from(MOCKUP_RULES + '\n- one more').toString('base64')), 'written', 'a newer section replaces only its own part');
  s = readFileSync(f, 'utf8');
  assert.match(s, /- one more\n<!-- \/aang:mockups-in-samara -->/); assert.match(s, /## Later\n- also mine/); assert.equal(s.split('aang:mockups-in-samara -->').length, 3);
  const pc = readFileSync(path.join(os.homedir(), '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(pc.replace(/\r/g, '').includes(MOCKUP_RULES), 'the same words as the PC rule');
  const g = path.join(d, 'none', 'CLAUDE.md');
  assert.equal(runJs(RULES_MERGE_JS, g, b64), 'written', 'made when missing');
  assert.ok(existsSync(g));
});

test('the Mac setup runs both merges after Samara is in place', () => {
  const desk = { token: 'T.a.b', key: 'K'.repeat(24), port: 47841, files: { 'frontdesk.ts': 'x' }, browser: { bundle: Buffer.from('tgz'), bsyncKey: 'b'.repeat(24), castlabsSig: Buffer.from('sig') } };
  const s = macSetupScript('100.64.0.1', 47832, 'h'.repeat(24), 'm'.repeat(24), desk, { release: { version: '0123456789abcdef', commit: 'abc' }, update: true });
  assert.match(s, /PLUG="\$APP\/Contents\/Resources\/app\/claude-link"/);
  assert.ok(s.includes(Buffer.from(PLUGIN_MERGE_JS).toString('base64')) && s.includes(Buffer.from(RULES_MERGE_JS).toString('base64')) && s.includes(Buffer.from(MOCKUP_RULES).toString('base64')));
  assert.ok(s.indexOf('PLUG=') > s.indexOf('mv "$NEWAPP/Contents" "$APP/Contents"'), 'after the new Samara is in place');
});
