# Persistent keyboard/mouse/focus driver for end-to-end tests. Reads one command per line, prints one reply.
#   fg                         title of the foreground window
#   focus <process>            bring that process's main window to the front (e.g. WowB, notepad)
#   hotkey <Ctrl+Shift+Space>  press a key combination
#   send <SendKeys text>       type into whatever has focus, e.g.  hello{ENTER}   ^{ENTER}   {ESC}   {UP}   {PGDN}
#   click <x> <y>              left click at screen coordinates
#   wheel <delta> <x> <y>      mouse wheel at screen coordinates (positive = up)
#   rect <title part>          "L T R B" of the first visible window whose title contains the text
#   pid <process>              "1" if the process is running
# Only ever click on coordinates the caller has checked belong to Aang or to a throwaway window.
param([switch]$Serve)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public class K {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr e);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] static extern bool EnumWindows(EW f, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  delegate bool EW(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static string Fg() { return Title(GetForegroundWindow()); }
  public static string Rect(string part) { string o = "none";
    EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var t = Title(h); if (t.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) { R r; GetWindowRect(h, out r); o = r.L + " " + r.T + " " + r.Rr + " " + r.B; return false; } return true; }, IntPtr.Zero); return o; }
}
'@
function KeyCodes([string]$c) { $codes = @(); foreach ($part in ($c -split '\+')) { switch -Regex ($part.Trim().ToLower()) { '^ctrl$' { $codes += 0x11 } '^alt$' { $codes += 0x12 } '^shift$' { $codes += 0x10 } '^win$' { $codes += 0x5B } '^space$' { $codes += 0x20 } '^home$' { $codes += 0x24 } '^numlock$' { $codes += 0x90 } '^esc$' { $codes += 0x1B } '^f(\d+)$' { $codes += (0x6F + [int]$Matches[1]) } '^[a-z0-9]$' { $codes += [int][char]$part.Trim().ToUpper() } } }; $codes }
function Press([string]$combo) { $k = KeyCodes $combo; foreach ($c in $k) { [K]::keybd_event([byte]$c, 0, 0, [UIntPtr]::Zero) }; Start-Sleep -Milliseconds 60; [array]::Reverse($k); foreach ($c in $k) { [K]::keybd_event([byte]$c, 0, 2, [UIntPtr]::Zero) } }

if (-not $Serve) { "run with -Serve"; exit 1 }
[Console]::Out.WriteLine("ready"); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $cmd, $rest = $line -split ' ', 2
  try {
    switch ($cmd) {
      'quit'   { exit 0 }
      'fg'     { $r = [K]::Fg() }
      'focus'  { $p = Get-Process $rest -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { [K]::SwitchToThisWindow($p.MainWindowHandle, $true); Start-Sleep -Milliseconds 900; $r = [K]::Fg() } else { $r = "no such process" } }
      'hotkey' { Press $rest; Start-Sleep -Milliseconds 350; $r = "ok" }
      'send'   { [System.Windows.Forms.SendKeys]::SendWait($rest); Start-Sleep -Milliseconds 250; $r = "ok" }
      'click'  { $xy = $rest -split ' '; [void][K]::SetCursorPos([int]$xy[0], [int]$xy[1]); Start-Sleep -Milliseconds 120; [K]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [K]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 300; $r = "ok" }
      'drag'   { $a = $rest -split ' '; $x = [int]$a[0]; $y = [int]$a[1]; $dx = [int]$a[2]; $dy = [int]$a[3]; [void][K]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 150; [K]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); for ($i = 1; $i -le 12; $i++) { [void][K]::SetCursorPos($x + [int]($dx * $i / 12), $y + [int]($dy * $i / 12)); Start-Sleep -Milliseconds 25 }; [K]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 300; $r = "ok" }
      'move'   { $a = $rest -split ' '; [void][K]::SetCursorPos([int]$a[0], [int]$a[1]); Start-Sleep -Milliseconds 250; $r = 'ok' }
      'wheel'  { $a = $rest -split ' '; [void][K]::SetCursorPos([int]$a[1], [int]$a[2]); Start-Sleep -Milliseconds 120; [K]::mouse_event(0x0800, 0, 0, [int]$a[0], [UIntPtr]::Zero); Start-Sleep -Milliseconds 250; $r = "ok" }
      'setclip' { Start-Process powershell -ArgumentList '-STA','-NoProfile','-Command',("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('$rest')") -Wait -WindowStyle Hidden; $r = 'ok' }
      'rect'   { $r = [K]::Rect($rest) }
      'movewin'   { $a = $rest -split ' '; $p = Get-Process $a[0] -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { [void][K]::MoveWindow($p.MainWindowHandle, [int]$a[1], [int]$a[2], [int]$a[3], [int]$a[4], $true); $r = "ok" } else { $r = "no such process" } }
      'pid'    { $r = $(if (Get-Process $rest -ErrorAction SilentlyContinue) { "1" } else { "0" }) }
      default  { $r = "bad-command" }
    }
  } catch { $r = "error: " + $_.Exception.Message }
  [Console]::Out.WriteLine($r); [Console]::Out.Flush()
}
