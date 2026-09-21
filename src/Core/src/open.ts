// Opening an app, a file, a folder or a link.
//
// All of these worked in the Rainmeter Aang and were lost in the rebuild. They came back briefly as
// "ask permission to run a shell command", which is the wrong shape entirely: launching Firefox should
// not look like handing over a terminal, and a raw command line is something Joshua has to read and
// judge every time. This is one plain action with one plain question.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Apps worth knowing by name, so "open spotify" does not need a full path. */
const KNOWN_APPS: Record<string, string> = {
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  calc: 'calc.exe',
  explorer: 'explorer.exe',
  paint: 'mspaint.exe',
  terminal: 'wt.exe',
  cmd: 'cmd.exe',
  powershell: 'powershell.exe',
  spotify: 'spotify.exe',
  discord: 'discord.exe',
  steam: 'steam.exe',
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  edge: 'msedge.exe',
  code: 'code.cmd',
  vscode: 'code.cmd',
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
  if (/[\\/]/.test(t)) return 'path';
  return 'app';
}

/** Resolve what he asked for into something Windows can start, or an error to tell him. */
export function resolve(what: string): { target: string; kind: OpenKind } | { error: string } {
  const t = (what ?? '').trim().replace(/^["']|["']$/g, '');
  if (!t) return { error: 'Nothing to open.' };
  const kind = classify(t);

  if (kind === 'link') {
    try { const u = new URL(t); if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Only http and https links.' }; }
    catch { return { error: 'That is not a link I can open.' }; }
    return { target: t, kind };
  }

  if (kind === 'path') {
    const full = path.resolve(t);
    if (!existsSync(full)) return { error: `There is nothing at ${full}.` };
    return { target: full, kind };
  }

  const known = KNOWN_APPS[t.toLowerCase()];
  return { target: known ?? (t.endsWith('.exe') ? t : `${t}.exe`), kind };
}

/**
 * Start it and let go. Nothing is piped, nothing is awaited: this is "open this", not "run this and
 * tell me what it printed", and a launched app must not keep a handle on the Core.
 */
export function launch(target: string, kind: OpenKind): Promise<{ ok: boolean; detail: string }> {
  return new Promise(resolve => {
    try {
      // explorer.exe is Windows' own "open this the way a double click would": it picks the browser for
      // a link and the right program for a file, without a shell and without quoting games.
      const child = kind === 'app' && !/[\\/]/.test(target)
        ? spawn(target, [], { detached: true, stdio: 'ignore', shell: false })
        : spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' });
      child.on('error', e => resolve({ ok: false, detail: e.message }));
      child.unref();
      // explorer always exits straight away; an app that fails to start errors within a moment.
      setTimeout(() => resolve({ ok: true, detail: target }), 400).unref?.();
    } catch (e) {
      resolve({ ok: false, detail: (e as Error).message });
    }
  });
}
