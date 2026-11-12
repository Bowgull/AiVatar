# Run a command on a separate, invisible Windows desktop (2026-11-12, his ask while playing WoW: "can you not do these
# tests without taking my mouse or keyboard?"). A window made there is drawn on that desktop, never on his; the system
# never lets a program there take the foreground, the mouse or the keyboard from the desktop he is using. The test
# harnesses already keep their windows off-screen and unfocused; this makes it impossible rather than just unlikely.
#
# Usage (from src/Shell):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/persist-check.ts" [-TimeoutSec 300]
# Prints the command's output and exits with its exit code.
param(
  [Parameter(Mandatory = $true)][string]$Command,
  [int]$TimeoutSec = 300,
  [string]$Desktop = 'samara-tests'
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HiddenDesktop {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct STARTUPINFO { public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags; public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr sa);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool CloseDesktop(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  /** CreateProcess, with its error read at once (PowerShell's own calls would replace it before it could be read). */
  public static int Start(string cmd, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi) {
    return CreateProcess(null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, dir, ref si, out pi) ? 0 : Marshal.GetLastWin32Error();
  }
}
'@
$GENERIC_ALL = 0x10000000
$desk = [HiddenDesktop]::CreateDesktop($Desktop, [IntPtr]::Zero, [IntPtr]::Zero, 0, $GENERIC_ALL, [IntPtr]::Zero)
if ($desk -eq [IntPtr]::Zero) { Write-Error "could not make the hidden desktop ($([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"; exit 90 }
$out = [IO.Path]::Combine([IO.Path]::GetTempPath(), "hidden-desktop-$PID.txt")
$si = New-Object HiddenDesktop+STARTUPINFO
$si.cb = [Runtime.InteropServices.Marshal]::SizeOf($si)
$si.lpDesktop = $Desktop
$pi = New-Object HiddenDesktop+PROCESS_INFORMATION
$cmdLine = "`"$env:ComSpec`" /d /s /c `"$Command > `"$out`" 2>&1`""
$err = [HiddenDesktop]::Start($cmdLine, (Get-Location).Path, [ref]$si, [ref]$pi)
if ($err -ne 0) {
  [HiddenDesktop]::CloseDesktop($desk) | Out-Null
  Write-Error "could not start it (Windows error $err)"; exit 91
}
$code = 0
if ([HiddenDesktop]::WaitForSingleObject($pi.hProcess, [uint32]($TimeoutSec * 1000)) -ne 0) {
  # Timed out: end the whole tree (cmd, npx, electron and its helpers), which lives only on the hidden desktop.
  & taskkill.exe /PID $pi.dwProcessId /T /F | Out-Null
  $code = 124
} else { $c = [uint32]0; [HiddenDesktop]::GetExitCodeProcess($pi.hProcess, [ref]$c) | Out-Null; $code = [int]$c }
[HiddenDesktop]::CloseHandle($pi.hProcess) | Out-Null; [HiddenDesktop]::CloseHandle($pi.hThread) | Out-Null
[HiddenDesktop]::CloseDesktop($desk) | Out-Null
if (Test-Path $out) { Get-Content -Raw -Encoding UTF8 $out; Remove-Item $out -Force -ErrorAction SilentlyContinue }
if ($code -eq 124) { Write-Output "HIDDEN DESKTOP: timed out after $TimeoutSec s, stopped" }
exit $code
