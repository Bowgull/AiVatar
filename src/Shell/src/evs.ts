// castLabs video signing on each machine (his picks, 2026-10-30). Paid video (Netflix, Prime) only plays on an engine
// castLabs has signed for this account (VMP), so every new engine is signed here, by castLabs' own tool (EVS), before
// it is offered. Samara installs that tool itself the first time (castLabs' Python package, in Samara's own folder).
// castLabs keeps its own sign-in, so most engines sign with no typing. When it wants him to sign in again, the update
// card shows ONE key: it opens the computer's own Terminal with castLabs' sign-in command already typed, and he types
// his password there. Samara, Claude and Aang never see it. Samara notices the sign-in and signs by itself.
//
// Never with the safety switches flipped (proved 2026-10-23: "Binary signature denied"): his pick, video wins, so the
// engine is signed exactly as castLabs shipped it.
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** What came of a signing: signed, castLabs wants him to sign in, refused (switches flipped), or another failure. */
export type Signed = 'ok' | 'signin' | 'denied' | 'failed';
export type Run = (cmd: string, args: string[], o?: { cwd?: string; timeoutMs?: number }) => Promise<{ code: number | null; text: string }>;

/** Where castLabs' tool lives: its own Python, in Samara's folder on each machine. */
export function evsHome(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  return platform === 'win32'
    ? path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Aang', 'evs')
    : path.join(home, 'Library', 'Application Support', 'AangListener', 'evs');
}
export const evsPython = (dir: string, platform = process.platform): string => (platform === 'win32' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python3'));
/** castLabs' own sign-in file (its tool keeps the login here; Samara only looks at when it changed, never inside). */
export const evsLoginFile = (home = os.homedir()): string => path.join(home, '.config', 'evs', 'config.json');

/** Read castLabs' answer: the words its tool uses when the login is missing or old, or when it refuses the engine. */
export function readSigning(code: number | null, text: string): Signed {
  if (code === 0) return 'ok';
  if (/signature denied/i.test(text)) return 'denied';
  if (/auth|log ?in|token|credential|expired|unauthori|password|EOF when reading|account/i.test(text)) return 'signin';
  return 'failed';
}

/** castLabs' check of a signed engine: only a real one counts. Every castLabs engine arrives with a development
 *  signature ("Certificate is valid for development only"), which Netflix and Prime refuse (2026-10-31: Samara took
 *  that one for signed, so 44.9.3 went in without his). */
export function readVerify(code: number | null, text: string): boolean {
  return code === 0 && /signature is valid/i.test(text) && !/development only/i.test(text);
}

/** The sign-in command, exactly as he will see it typed in Terminal. */
export const signinCommand = (py: string): string[] => [py, '-m', 'castlabs_evs.account', 'reauth'];

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** The Mac's Terminal file: opened with `open`, so no Automation permission is needed. It types nothing secret. */
export function macSigninScript(py: string): string {
  return `#!/bin/bash
# Sign in to castLabs, so Samara can sign its new engine for video. Written by Samara (src/Shell/src/evs.ts).
# Your password goes to castLabs only. Samara notices when you are in and carries on by itself.
clear
echo "Sign in to castLabs (your castLabs account), then come back to Samara."
echo
${signinCommand(py).map(shq).join(' ')}
echo
echo "Done. You can close this window."
`;
}
/** PowerShell's words for the same thing on the PC (Windows Terminal, or PowerShell's own window). */
export function pcSigninCommand(py: string): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return `Write-Host 'Sign in to castLabs (your castLabs account), then come back to Samara.'; & ${q(py)} -m castlabs_evs.account reauth; Write-Host 'Done. You can close this window.'`;
}

const tail = (t: string) => t.split(/\r?\n/).filter(Boolean).slice(-3).join(' | ').slice(0, 400);
const runIt: Run = (cmd, args, o = {}) => new Promise((res) => {
  const t = spawn(cmd, args, { cwd: o.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  t.stdout?.on('data', (d) => { text = (text + String(d)).slice(-4000); });
  t.stderr?.on('data', (d) => { text = (text + String(d)).slice(-4000); });
  const kill = setTimeout(() => { try { t.kill(); } catch { /* gone */ } }, o.timeoutMs ?? 5 * 60_000);
  t.on('error', (e) => { clearTimeout(kill); res({ code: null, text: e.message }); });
  t.on('exit', (code) => { clearTimeout(kill); res({ code, text }); });
});

/** Starts a visible window of its own and says whether it started (tests swap this). */
export type Open = (cmd: string, args: string[]) => Promise<boolean>;
const openIt: Open = (cmd, args) => new Promise((res) => {
  const t = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
  t.once('error', () => res(false));
  t.once('spawn', () => { t.unref(); res(true); });
});
export interface EvsOptions { dir?: string; platform?: NodeJS.Platform; run?: Run; open?: Open; log?: (s: string) => void; loginFile?: string }

export class Evs {
  readonly dir: string;
  private readonly platform: NodeJS.Platform;
  private readonly run: Run;
  private readonly open: Open;
  private readonly log: (s: string) => void;
  private readonly loginFile: string;
  constructor(o: EvsOptions = {}) {
    this.platform = o.platform ?? process.platform;
    this.dir = o.dir ?? evsHome(this.platform);
    this.run = o.run ?? runIt;
    this.open = o.open ?? openIt;
    this.log = o.log ?? ((s) => console.log(s));
    this.loginFile = o.loginFile ?? evsLoginFile();
  }
  get python(): string { return evsPython(this.dir, this.platform); }

  /** castLabs' tool, installed the first time (his yes): its own Python in Samara's folder, castLabs' package from PyPI. */
  async ensure(): Promise<boolean> {
    if (existsSync(this.python) && (await this.run(this.python, ['-c', 'import castlabs_evs'], { timeoutMs: 60_000 })).code === 0) return true;
    this.log('update: installing castLabs\' signing tool (once)');
    mkdirSync(path.dirname(this.dir), { recursive: true });
    const base = this.platform === 'win32' ? 'python' : '/usr/bin/python3';
    if ((await this.run(base, ['-m', 'venv', this.dir], { timeoutMs: 5 * 60_000 })).code !== 0) { this.log('update: could not make a Python for castLabs\' tool'); return false; }
    const pip = await this.run(this.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'castlabs-evs'], { timeoutMs: 10 * 60_000 });
    if (pip.code !== 0) { this.log('update: installing castLabs\' tool failed: ' + pip.text.split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')); return false; }
    return true;
  }

  /** Sign an engine (the folder holding Electron.app, or electron.exe) for video, on this machine with his castLabs
   *  account (his pick, 2026-10-30: each machine signs its own). Signed only when castLabs' own check then agrees. */
  async sign(engineDir: string): Promise<Signed> {
    if (!(await this.ensure())) return 'failed';
    // -n: never stop to ask for a password (nobody would see it); a missing sign-in comes back as 'signin'.
    const out = await this.run(this.python, ['-m', 'castlabs_evs.vmp', '-n', 'sign-pkg', engineDir], { timeoutMs: 5 * 60_000 });
    const r = readSigning(out.code, out.text);
    if (r !== 'ok') { this.log(`update: castLabs signing said ${r} (exit ${out.code}): ${tail(out.text)}`); return r; }
    if (await this.verify(engineDir)) return 'ok';
    this.log('update: castLabs signed the engine, but its own check does not agree');
    return 'failed';
  }

  /** castLabs' own check: true only for a real (not development) signature on the folder holding the app. */
  async verify(engineDir: string): Promise<boolean> {
    if (!(await this.ensure())) return false;
    const out = await this.run(this.python, ['-m', 'castlabs_evs.vmp', '-n', 'verify-pkg', engineDir], { timeoutMs: 2 * 60_000 });
    return readVerify(out.code, out.text);
  }

  /** When castLabs last saw him sign in (its file's time), or 0. */
  loginStamp(): number { try { return statSync(this.loginFile).mtimeMs; } catch { return 0; } }

  /** His click on "Sign in to castLabs": the computer's own Terminal, the command typed. True when it opened. */
  async openSignin(): Promise<boolean> {
    if (!(await this.ensure())) return false;
    if (this.platform === 'darwin') {
      const f = path.join(path.dirname(this.dir), 'castlabs-signin.command');
      writeFileSync(f, macSigninScript(this.python)); chmodSync(f, 0o700);
      return (await this.run('/usr/bin/open', [f], { timeoutMs: 30_000 })).code === 0;
    }
    if (this.platform === 'win32') {
      // Windows Terminal when he has it, else PowerShell's own window: a window of its own, never hidden.
      const ps = pcSigninCommand(this.python);
      return (await this.open('wt.exe', ['powershell', '-NoExit', '-Command', ps])) || this.open('powershell.exe', ['-NoExit', '-Command', ps]);
    }
    return false;
  }

  /** Waits for his sign-in (castLabs' file changes), up to `ms`, then calls back once. Returns a stop function. */
  watchSignin(since: number, done: (signedIn: boolean) => void, ms = 20 * 60_000, every = 3000): () => void {
    const start = Date.now();
    const t = setInterval(() => {
      if (this.loginStamp() > since) { clearInterval(t); done(true); }
      else if (Date.now() - start > ms) { clearInterval(t); done(false); }
    }, every);
    t.unref?.();
    return () => clearInterval(t);
  }
}
