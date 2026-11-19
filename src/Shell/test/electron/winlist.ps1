# The visible top-level windows of some processes, on the desktop this runs on: "pid<TAB>appid<TAB>x,y,w,h<TAB>title" per
# line. With -Shot <folder>, each one is also drawn (PrintWindow, full content) into <folder>\<pid>-<n>.png. Used by
# tools-standalone-check.ts on the hidden desktop (2026-11-18), where no screenshot of his screen is taken.
param([string]$Pids, [string]$Shot = '')
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text; using System.Drawing;
public static class WinList {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RC { public int l, t, r, b; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RC r);
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr dc, uint f);
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { int GetCount(out uint c); int GetAt(uint i, out PKEY k); int GetValue(ref PKEY k, IntPtr v); int SetValue(ref PKEY k, IntPtr v); int Commit(); }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PKEY { public Guid fmtid; public uint pid; }
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, out IPropertyStore ps);
  [DllImport("ole32.dll")] static extern int PropVariantClear(IntPtr p);
  static string AppId(IntPtr h) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"); IPropertyStore ps;
    if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0 || ps == null) return "-";
    PKEY k = new PKEY(); k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5;
    IntPtr v = Marshal.AllocCoTaskMem(24);
    try { for (int i = 0; i < 24; i++) Marshal.WriteByte(v, i, 0); if (ps.GetValue(ref k, v) != 0) return "-";
      if (Marshal.ReadInt16(v) != 31) { PropVariantClear(v); return "-"; }
      string s = Marshal.PtrToStringUni(Marshal.ReadIntPtr(v, 8)); PropVariantClear(v); return s ?? "-"; }
    finally { Marshal.FreeCoTaskMem(v); Marshal.ReleaseComObject(ps); }
  }
  public static List<string> List(int[] pids, string shot) {
    var outp = new List<string>(); var want = new HashSet<int>(pids); int n = 0;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      int pid; GetWindowThreadProcessId(h, out pid);
      if (!want.Contains(pid) || !IsWindowVisible(h)) return true;
      var sb = new StringBuilder(256); GetWindowText(h, sb, 256); RC r; GetWindowRect(h, out r);
      int w = r.r - r.l, hh = r.b - r.t;
      outp.Add(pid + "\t" + AppId(h) + "\t" + r.l + "," + r.t + "," + w + "," + hh + "\t" + sb.ToString());
      if (shot.Length > 0 && w > 8 && hh > 8 && w < 4000 && hh < 3000) {
        using (var bmp = new Bitmap(w, hh)) using (var g = Graphics.FromImage(bmp)) {
          IntPtr dc = g.GetHdc(); PrintWindow(h, dc, 2); g.ReleaseHdc(dc);
          bmp.Save(System.IO.Path.Combine(shot, pid + "-" + (n++) + ".png"), System.Drawing.Imaging.ImageFormat.Png);
        }
      }
      return true;
    }, IntPtr.Zero);
    return outp;
  }
}
'@
$ids = @($Pids.Split(',') | Where-Object { $_ } | ForEach-Object { [int]$_ })
if ($Shot) { New-Item -ItemType Directory -Force $Shot | Out-Null }
[WinList]::List($ids, $Shot) | ForEach-Object { [Console]::Out.WriteLine($_) }
