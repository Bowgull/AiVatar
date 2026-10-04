// Starting and stopping the DRM runtime: the separate castLabs process that plays paid video.
//
// It is a child process rather than a window because hardware acceleration has to be off for the
// protected video, and that setting is process-wide (step 6.4). Keeping it separate also keeps
// castLabs, which trails the stock build's security fixes, away from everything else.
//
// Only one plays at a time across both runtimes (decision 34), so starting this closes the stock
// pop-out and the other way round.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface DrmDeps {
  /** The Shell's own folder, which holds node_modules and drm/. */
  shellDir: string;
  stateDir: string;
  /** Called when the runtime stops, however it stopped, so the Shell can forget it. */
  onExit?: (code: number | null) => void;
}

/** Where castLabs Electron lives. Installed as `electron-drm` so it sits beside the stock one. */
export const drmElectron = (shellDir: string) =>
  path.join(shellDir, 'node_modules', 'electron-drm', 'dist', 'electron.exe');

export class DrmRuntime {
  private child: ChildProcess | null = null;
  private deps: DrmDeps;
  /** What it is playing, so the Shell can say so. */
  showing: string | null = null;

  constructor(deps: DrmDeps) { this.deps = deps; }

  get isRunning(): boolean { return Boolean(this.child && this.child.exitCode === null); }

  /** True if the castLabs build is actually installed. It is a large download and may not be. */
  get available(): boolean { return existsSync(drmElectron(this.deps.shellDir)); }

  /**
   * Play a paid service. Returns what went wrong, or null if it started.
   *
   * `mode` is which switch to use against Shadow's capture: 'narrow' keeps hardware acceleration and
   * only stops the protected video going into an overlay Shadow cannot see; 'full' turns acceleration
   * off altogether, which is proved to work but costs more. Narrow is tried first by design.
   */
  open(url: string, mode: 'narrow' | 'full' = 'narrow'): string | null {
    if (!this.available) {
      return 'the castLabs build is not installed, so paid video cannot play here yet';
    }
    this.close();

    this.child = spawn(drmElectron(this.deps.shellDir), ['drm/main.ts'], {
      cwd: this.deps.shellDir,
      env: { ...process.env, AANG_STATE_DIR: this.deps.stateDir, AANG_DRM_URL: url, AANG_DRM_MODE: mode },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.showing = url;

    // Its output belongs in the Shell's log, with its own prefix: when protected video fails the
    // reason is almost always in there, and it is the one place to look.
    this.child.stdout?.on('data', d => process.stdout.write(String(d)));
    this.child.stderr?.on('data', d => process.stderr.write(String(d)));
    // A spawn that fails emits this and nothing else. Without it the runtime simply never appeared and
    // nothing anywhere said why, which is exactly what happened on the first run, 2026-10-04.
    this.child.on('error', e => {
      console.error(`shell: the paid-video runtime would not start: ${e.message}`);
      this.child = null;
      this.showing = null;
    });
    this.child.on('spawn', () => console.log(`shell: paid video runtime started (${mode} mode)`));
    this.child.on('exit', code => {
      this.child = null;
      this.showing = null;
      this.deps.onExit?.(code);
    });
    return null;
  }

  close(): void {
    const c = this.child;
    this.child = null;
    this.showing = null;
    try { c?.kill(); } catch { /* already gone */ }
  }
}
