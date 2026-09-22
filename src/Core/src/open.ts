// Opening an app, a file, a folder or a link - optionally IN a named app ("this link in Chrome").
//
// All of these worked in the Rainmeter Aang and were lost in the rebuild. They came back briefly as
// "ask permission to run a shell command", which is the wrong shape entirely: launching Firefox should
// not look like handing over a terminal, and a raw command line is something Joshua has to read and
// judge every time. This is one plain action with one plain question.
//
// Apps are found the way the Start menu finds them, not by PATH. Found 2026-09-21: "open chrome" could not
// work, because chrome.exe is not on PATH - Windows finds it through the App Paths registry key, which
// Node's spawn never looks at - and Aang then told Joshua Chrome was not installed. Spotify and Discord are
// in neither place; only their Start menu shortcuts know where they live.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** What people call an app, mapped to the name Windows knows it by. */
const ALIASES: Record<string, string> = {
  calculator: 'calc', 'google chrome': 'chrome', 'mozilla firefox': 'firefox', 'microsoft edge': 'msedge', edge: 'msedge',
  paint: 'mspaint', terminal: 'wt', 'windows terminal': 'wt', vscode: 'code', 'vs code': 'code', 'visual studio code': 'code',
  'file explorer': 'explorer', files: 'explorer', 'snipping tool': 'snippingtool', 'battle.net': 'battle.net', bnet: 'battle.net',
};

export type OpenKind = 'link' | 'path' | 'app';

export function classify(what: string): OpenKind {
  const t = (what ?? '').trim();
  if (/^https?:\/\//i.test(t)) return 'link';
  // A Windows drive letter (C:\...) is a path; any other scheme (file:, javascript:, steam:) is a link,
  // and one that resolve() will refuse. Treating file:// as a path meant resolving it against the
  // working directory, which is neither what he asked for nor safe to guess at.
  if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\')) return 'path';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return 'link';
  // "youtube.com/..." or "www.youtube.com": a link he did not type the scheme for. Checked before the slash
  // rule below, or youtube.com/watch reads as a folder.
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) && !/\.(exe|lnk|txt|md|js|ts|json|html?|pdf|png|jpe?g)$/i.test(t)) return 'link';
  if (/[\\/]/.test(t)) return 'path';
  return 'app';
}

// ------------------------------------------------------------------ finding apps

const run = (file: string, args: string[]) => {
  try { return execFileSync(file, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }); }
  catch { return ''; }
};

/** HKCU and HKLM ...\App Paths\<name>.exe: where Windows itself looks when you type a name in Run. */
function fromAppPaths(exe: string): string | null {
  for (const hive of ['HKCU', 'HKLM']) {
    const out = run('reg.exe', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, '/ve']);
    const m = /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out);
    if (m) {
      const p = m[1]!.trim().replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? `%${v}%`);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const START_MENUS = [
  path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
];

function shortcuts(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 3) return out;
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e);
    if (e.toLowerCase().endsWith('.lnk')) out.push(full);
    else { try { if (statSync(full).isDirectory()) shortcuts(full, depth + 1, out); } catch { /* unreadable */ } }
  }
  return out;
}

const plain = (s: string) => s.toLowerCase().replace(/\.(lnk|exe)$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** The Start menu shortcut whose name matches best: exact first, then one that starts with it. Never an uninstaller. */
function fromStartMenu(name: string): string | null {
  const want = plain(name);
  if (!want) return null;
  const all = START_MENUS.flatMap(d => shortcuts(d)).filter(p => !/uninstall|remove|readme|help|website|manual/i.test(path.basename(p)));
  const scored = all.map(p => {
    const n = plain(path.basename(p));
    const score = n === want ? 3 : n.startsWith(want + ' ') || n.replace(/ /g, '') === want.replace(/ /g, '') ? 2 : n.split(' ').includes(want) ? 1 : 0;
    return { p, score, len: n.length };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.len - b.len);
  return scored[0]?.p ?? null;
}

function fromPath(exe: string): string | null {
  const out = run('where.exe', [exe]).split(/\r?\n/).map(s => s.trim()).find(Boolean);
  return out && existsSync(out) ? out : null;
}

/**
 * Windows' own Start Menu index, via the same query the Start Menu's search box runs. Covers packaged
 * (MSIX/AppX) apps, which have no .exe on PATH, no App Paths entry, and often no real .lnk file in the Start
 * Menu folders either - fromStartMenu's file scan cannot see them at all. Found 2026-09-22: "open claude"
 * said Claude was not installed, though it plainly was (Get-AppxPackage found it); Get-StartApps is what
 * actually resolves it, the way clicking its Start Menu tile does.
 */
function fromAppx(name: string): { target: string; label: string } | null {
  const q = name.replace(/'/g, "''");
  const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$a = Get-StartApps -Name '*${q}*' | Select-Object -First 1; if ($a) { $a.Name + "|" + $a.AppID }`]);
  const [label, id] = out.trim().split('|');
  return id ? { target: `shell:AppsFolder\\${id}`, label: label || name } : null;
}

export interface FoundApp { target: string; name: string }

/** Find an installed app by the name he used. null means it was looked for everywhere and is not there. */
export function findApp(name: string): FoundApp | null {
  const raw = (name ?? '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return null;
  if (/^[a-z]:[\\/]/i.test(raw) && existsSync(raw)) return { target: raw, name: path.basename(raw) };
  const key = raw.toLowerCase().replace(/\.exe$/i, '');
  const base = ALIASES[key] ?? key;
  const exe = `${base}.exe`;
  const hit = fromAppPaths(exe) ?? fromStartMenu(raw) ?? (base !== key ? fromStartMenu(base) : null) ?? fromPath(exe) ?? fromPath(`${base}.cmd`);
  if (hit) return { target: hit, name: displayName(hit) };
  const appx = fromAppx(base) ?? (base !== key ? fromAppx(key) : null);
  return appx ? { target: appx.target, name: appx.label } : null;
}

function displayName(target: string): string {
  const b = path.basename(target).replace(/\.(exe|lnk|cmd)$/i, '');
  const nice: Record<string, string> = { chrome: 'Chrome', firefox: 'Firefox', msedge: 'Edge', mspaint: 'Paint', calc: 'Calculator', wt: 'Terminal' };
  return nice[b.toLowerCase()] ?? b;
}

/** The browser a link opens in when none is named, so he is told the truth about where it went. */
export function defaultBrowser(): string {
  const out = run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId']);
  const id = /ProgId\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? '';
  if (/^Firefox/i.test(id)) return 'Firefox';
  if (/^Chrome/i.test(id)) return 'Chrome';
  if (/^MSEdge/i.test(id)) return 'Edge';
  if (/^Brave/i.test(id)) return 'Brave';
  if (/^Opera/i.test(id)) return 'Opera';
  return id ? id.replace(/(HTML|URL).*$/i, '') || 'your default browser' : 'your default browser';
}

// ------------------------------------------------------------------ resolving a request

export interface Resolved {
  /** The link, file or folder - or, for an app on its own, the app itself. */
  target: string;
  kind: OpenKind;
  /** The app it opens in, when one was named or it is an app. */
  app?: FoundApp;
}

/** Resolve what he asked for into something Windows can start, or an error that is true. */
export function resolve(what: string, withApp?: string): Resolved | { error: string } {
  let t = (what ?? '').trim().replace(/^["']|["']$/g, '');
  if (!t) return { error: 'Nothing to open.' };
  const kind = classify(t);

  let app: FoundApp | undefined;
  if (withApp && withApp.trim()) {
    const found = findApp(withApp);
    if (!found) return { error: `${withApp} is not installed: it is not in the Start menu, the App Paths registry or on PATH.` };
    app = found;
  }

  if (kind === 'link') {
    // "battle.net" is the app when the app is installed, not battle.net the website.
    if (!withApp && !/[:/\\]/.test(t)) { const installed = findApp(t); if (installed) return { target: installed.target, kind: 'app', app: installed }; }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t;
    try { const u = new URL(t); if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Only http and https links.' }; }
    catch { return { error: 'That is not a link I can open.' }; }
    return { target: t, kind, app };
  }

  if (kind === 'path') {
    const full = path.resolve(t);
    if (!existsSync(full)) return { error: `There is nothing at ${full}.` };
    return { target: full, kind, app };
  }

  const found = findApp(t);
  if (!found) return { error: `${t} is not installed: it is not in the Start menu, the App Paths registry or on PATH.` };
  return { target: found.target, kind, app: found };
}

// ------------------------------------------------------------------ launching

/**
 * Start it and let go. Nothing is piped, nothing is awaited: this is "open this", not "run this and
 * tell me what it printed", and a launched app must not keep a handle on the Core.
 */
export function launch(r: Resolved): Promise<{ ok: boolean; detail: string }> {
  return new Promise(done => {
    try {
      let child;
      let program = r.kind === 'app' ? r.target : r.app?.target;
      let arg = r.kind === 'app' ? [] : [r.target];
      if (program && program.toLowerCase().endsWith('.lnk')) {
        // Follow the shortcut to the program it points at and start that, with the shortcut's own arguments
        // first. Handing the .lnk to a PowerShell Start-Process was tried first and started nothing for
        // Spotify while reporting success. A shortcut with no real target (an installer-advertised one) is
        // given to explorer, which knows how to run it, though it cannot pass anything on.
        const link = readShortcut(program);
        if (link && existsSync(link.target)) { program = link.target; arg = [...splitArgs(link.args), ...arg]; }
        else { child = spawn('explorer.exe', [program], { detached: true, stdio: 'ignore' }); program = undefined; }
      } else if (program && /^shell:/i.test(program)) {
        // A packaged (MSIX/AppX) app, from fromAppx: there is no real .exe to spawn. explorer.exe activates
        // it by this shell path exactly as a Start Menu tile click would. Tested live, 2026-09-22: this is how
        // Claude itself, running as one of these, actually opens.
        child = spawn('explorer.exe', [program], { detached: true, stdio: 'ignore' }); program = undefined;
      }
      if (child) { /* started through explorer above */ }
      else if (program) {
        child = spawn(program, arg, { detached: true, stdio: 'ignore', shell: false, cwd: path.dirname(program) });
      } else {
        // No app named: explorer.exe opens it the way a double click would - the default browser for a
        // link, the right program for a file - without a shell and without quoting games.
        child = spawn('explorer.exe', [r.target], { detached: true, stdio: 'ignore' });
      }
      child.on('error', e => done({ ok: false, detail: e.message }));
      child.unref();
      // explorer always exits straight away; an app that fails to start errors within a moment.
      setTimeout(() => done({ ok: true, detail: r.target }), 400).unref?.();
    } catch (e) {
      done({ ok: false, detail: (e as Error).message });
    }
  });
}

/** Where a Start menu shortcut points, and with what arguments. */
function readShortcut(lnk: string): { target: string; args: string } | null {
  const q = lnk.replace(/'/g, "''");
  const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${q}'); $s.TargetPath; $s.Arguments`]);
  const [target, args] = out.split(/\r?\n/);
  return target?.trim() ? { target: target.trim(), args: (args ?? '').trim() } : null;
}

/** Split a shortcut's argument string the way Windows would: on spaces, keeping quoted parts whole. */
function splitArgs(s: string): string[] {
  return (s.match(/"[^"]*"|\S+/g) ?? []).map(a => a.replace(/^"|"$/g, ''));
}

/** One plain sentence saying exactly what was opened and in what - nothing it cannot know. */
export function openedText(r: Resolved): string {
  if (r.kind === 'app') return `Started ${r.app?.name ?? r.target}.`;
  if (r.app) return `Opened ${r.target} in ${r.app.name}.`;
  if (r.kind === 'link') return `Opened ${r.target} in ${defaultBrowser()}, his default browser. It did not go to any other browser.`;
  return `Opened ${r.target} with its default program.`;
}
