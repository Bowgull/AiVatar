// Samara and Aang by name in Task Manager (his ask, 2026-11-20: "all i saw was electron and i was like....wtf").
// Every engine folder keeps castLabs' electron.exe as it came, and gets two copies beside it with their own name and
// icon: Samara.exe (the browser) and Aang.exe (Aang's windows). castLabs signs a renamed engine for paid video (tested
// 2026-11-20 on 44.9.3: signed, and a protected stream played), as long as its switches are untouched: only the name,
// the icon and the version strings change. Samara.exe gets its own video signature (sign-pkg -H Samara). Aang's
// windows play no paid video, so Aang.exe needs none. The stamping is done by rcedit, the Electron project's own tool.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export interface Brand { file: string; name: string; icon: string }

/** The two programs, with the icons from Samara's own folder (shellDir: where pages/ and assets/ are). */
export function brands(shellDir: string): Brand[] {
  return [
    { file: 'Samara.exe', name: 'Samara', icon: path.join(shellDir, 'pages', 'art', 'samara', 'samara.ico') },
    { file: 'Aang.exe', name: 'Aang', icon: path.join(shellDir, 'assets', 'aang.ico') },
  ];
}

/** rcedit's arguments for one program: its icon and the names Windows shows (Task Manager reads FileDescription). */
export function rceditArgs(exe: string, b: Brand): string[] {
  return [exe, '--set-icon', b.icon,
    '--set-version-string', 'FileDescription', b.name,
    '--set-version-string', 'ProductName', b.name,
    '--set-version-string', 'InternalName', b.name,
    '--set-version-string', 'OriginalFilename', b.file];
}

/** rcedit's program, from its npm package, or null (not installed, or not Windows). */
export function rceditExe(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const dir = path.dirname(createRequire(import.meta.url).resolve('rcedit/package.json'));
    const exe = path.join(dir, 'bin', process.arch === 'ia32' ? 'rcedit.exe' : 'rcedit-x64.exe');
    return existsSync(exe) ? exe : null;
  } catch { return null; }
}

const run = (exe: string, args: string[]) => new Promise<number | null>((res) => {
  const p = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
  const kill = setTimeout(() => { try { p.kill(); } catch { /* gone */ } }, 60_000);
  p.on('error', () => { clearTimeout(kill); res(null); });
  p.on('exit', (c) => { clearTimeout(kill); res(c); });
});

/** Make Samara.exe and Aang.exe in an engine folder from its electron.exe. True when both were made. Any old copy (and
 *  its signature) is replaced, so they always match the electron.exe beside them. */
export async function stampEngine(engineDir: string, shellDir: string, log: (s: string) => void): Promise<boolean> {
  const rc = rceditExe();
  const src = path.join(engineDir, 'electron.exe');
  if (!rc || !existsSync(src)) { log(`shell: engine branding skipped (${rc ? 'no electron.exe' : 'rcedit is not installed'})`); return false; }
  for (const b of brands(shellDir)) {
    const out = path.join(engineDir, b.file);
    try {
      rmSync(out + '.sig', { force: true });
      copyFileSync(src, out);
    } catch (e) { log(`shell: engine branding: could not copy ${b.file}: ${(e as Error).message}`); return false; }
    if (!existsSync(b.icon)) { log(`shell: engine branding: ${b.name}'s icon is missing`); return false; }
    const code = await run(rc, rceditArgs(out, b));
    if (code !== 0) { log(`shell: engine branding: rcedit said ${code} for ${b.file}`); rmSync(out, { force: true }); return false; }
  }
  return true;
}
