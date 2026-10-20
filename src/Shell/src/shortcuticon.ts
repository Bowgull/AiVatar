// His ask (2026-10-20): Samara's desktop and Start menu shortcuts show the lit lantern while Samara is open and the dark
// one while it is closed, like the taskbar.
//
// Windows has no live icon for a shortcut, so the shortcut itself is changed: its IconLocation is pointed at the open or
// closed .ico, then Windows is told that one file changed (SHChangeNotify) so the desktop redraws just that icon. A desktop
// icon cannot animate; it swaps. The taskbar button is the one that lights up smoothly (browser.ts).
//
// Only Samara's own shortcuts are touched: a Samara.lnk on the Desktop or in the Start menu whose target is Aang.exe run
// with --samara. Anything else with that name is left alone. PowerShell does the work, hidden, and a change made as Samara
// quits still lands after this process has gone. A crash can leave it lit; the next start puts it right,
// because the state is applied once at start whatever it was before.
import { spawn } from 'node:child_process';
import path from 'node:path';

const ART = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara');

/** The PowerShell that points Samara's shortcuts at one lantern. Exported for its test. */
export function shortcutScript(lit: boolean): string {
  const ico = path.join(ART, lit ? 'samara-open.ico' : 'samara-closed.ico').replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -Namespace AangShortcut -Name Shell -MemberDefinition \'[DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern void SHChangeNotify(int e, uint f, string a, System.IntPtr b);\'',
    '$sh = New-Object -ComObject WScript.Shell',
    "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {",
    "  $p = Join-Path $dir 'Samara.lnk'",
    '  if (-not (Test-Path -LiteralPath $p)) { continue }',
    '  $l = $sh.CreateShortcut($p)',
    "  if ($l.TargetPath -notmatch '\\\\Aang\\.exe$' -or $l.Arguments -notmatch '--samara') { continue }",
    `  if ($l.IconLocation -eq '${ico},0') { continue }`,
    `  $l.IconLocation = '${ico},0'`,
    '  $l.Save()',
    '  [AangShortcut.Shell]::SHChangeNotify(0x2000, 0x0005, $p, [System.IntPtr]::Zero)',
    '}',
  ].join('\n');
}

/** How PowerShell is started for it: -EncodedCommand, so the script's quotes never meet Windows' argument quoting. */
export function shortcutArgs(lit: boolean): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(shortcutScript(lit), 'utf16le').toString('base64')];
}

let applied: boolean | null = null;     // what was last asked for
let running = false;                     // one PowerShell at a time: two at once raced, and the slower one won
let quitting = false;

function run(lit: boolean): void {
  running = true;
  try {
    // Found testing it, 2026-10-20: started 'detached' (no console at all), PowerShell exits 0 in a tenth of a second having
    // done nothing, and the same with its input from nowhere. So: an ordinary hidden child, its input a pipe left open until
    // it finishes. Samara runs in no job object, so a child started as it quits still finishes after it has gone.
    const ps = spawn('powershell.exe', shortcutArgs(lit), { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    ps.on('exit', () => ps.stdin?.destroy());
    ps.on('error', () => { running = false; applied = null; });
    // Finished: if what is wanted changed meanwhile, do that now, so the last ask always wins.
    ps.on('exit', () => { running = false; if (applied !== null && applied !== lit && !quitting) run(applied); });
    ps.unref();
  } catch { running = false; applied = null; }
}

/** Point Samara's shortcuts at the lit or the dark lantern. Does nothing when that is already what they show. */
export function samaraShortcutsLit(lit: boolean, opts: { quitting?: boolean } = {}): void {
  if (process.platform !== 'win32' || applied === lit) return;
  applied = lit;
  if (opts.quitting) quitting = true;
  // On the way out there is no waiting for a turn: this process is about to go, and the dark lantern must still land.
  if (running && !opts.quitting) return;
  run(lit);
}
