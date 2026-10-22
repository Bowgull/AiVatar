// The window's own edge, softened (his ask, 2026-10-12: "nice round soft edges like it was a mac app").
//
// Windows 11 rounds a window with a title bar (hidden or not) and draws its shadow; it also draws a thin grey or
// accent-coloured line round the edge, which on dark wood looks stuck on. Two DWM settings fix both, asked for
// explicitly: round corners (DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_ROUND = 2) and the edge line in dark
// wood (DWMWA_BORDER_COLOR = 34). Electron has no API for them.
//
// F0 of the window family (docs/WINDOW-FAMILY-RESEARCH.md section 3): this used to start a PowerShell for EVERY window,
// which blocked the main process 14-17 ms each time (measured in the pop-out baseline). There is no FFI library in the
// Shell's dependencies (koffi is not installed), so instead ONE small helper starts the first time it is needed, compiles
// the DwmSetWindowAttribute call once, and then takes one line per request on its stdin: "<hwnd> <corner>". A request is
// a write to a pipe, nothing more. The family also uses it while a window is snapped flush to another: Windows' rounding
// off (DWMWCP_DONOTROUND = 1) and a stepped region round only the outer corners (1b, 2026-10-22); back to round on leaving.
//
// It gets only numbers (a window handle, a corner value, a corner mask and steps) from here; nothing from a page ever reaches it.
// Since sheet 66 (2026-10-22) it also takes the taskbar's requests (askHelper: a pop-out's app-window style, DWM's iconic
// thumbnail of a snapped group, built here from the windows' own captures) and answers those on its stdout.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { screen, type BaseWindow } from 'electron';
import { ALL_ROUND, CORNER_RADIUS, cornerSteps } from './family.ts';

/** Dark wood, as Windows wants it: 0x00BBGGRR. #24160D. */
const EDGE = 0x000d1624;
/** DWMWCP_*: what Windows does with the window's corners. */
export const CORNER = { square: 1, round: 2 } as const;

// One C# class, compiled once when the helper starts. Region(): the window's shape as a stair-stepped polygon over the
// VISIBLE window (sent in screen pixels; Windows wants window coordinates, so the window's own corner is taken off), the same rows as
// family.ts regionRuns(). SetWindowRgn owns the region afterwards. There is no "clear": ANY SetWindowRgn call, even
// with no region, makes Chromium let the page grow by the resize borders (measured), so a window never gets one until it
// is joined, and keeps one after.
export const EDGE_HELPER_CS = `
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
namespace Aang { public static class Win {
  [StructLayout(LayoutKind.Sequential)] public struct P { public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] public struct R { public int l; public int t; public int r; public int b; }
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr h, IntPtr r, bool redraw);
  [DllImport("gdi32.dll")] static extern IntPtr CreatePolygonRgn(P[] p, int n, int mode);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  public static void Corner(IntPtr h, int c, int edge) { if (!IsWindow(h)) return; DwmSetWindowAttribute(h, 33, ref c, 4); DwmSetWindowAttribute(h, 34, ref edge, 4); }
  public static void Region(IntPtr h, int mask, int[] s, int sx, int sy, int sw, int sh) {
    if (!IsWindow(h)) return;
    R w; GetWindowRect(h, out w);
    // The visible window, in screen pixels (Electron's own bounds): its invisible resize borders are cut away too.
    int ox = sx - w.l, oy = sy - w.t, W = sw, H = sh;
    if (W <= 0 || H <= 0) return;
    int k = Math.Min(s.Length, Math.Min(W, H) / 2);
    var runs = new List<int[]>();
    var rows = new List<int>();
    for (int i = 0; i < k; i++) rows.Add(i);
    if (H - 2 * k > 0) rows.Add(k);
    for (int i = 0; i < k; i++) rows.Add(H - k + i);
    foreach (int y in rows) {
      int t = y < k ? s[y] : 0, b = H - 1 - y < k ? s[H - 1 - y] : 0;
      int l = Math.Max((mask & 1) != 0 ? t : 0, (mask & 8) != 0 ? b : 0), r = Math.Max((mask & 2) != 0 ? t : 0, (mask & 4) != 0 ? b : 0);
      int y1 = (y == k && H - 2 * k > 0) ? H - k : y + 1;
      if (runs.Count > 0) { var last = runs[runs.Count - 1]; if (last[2] == l && last[3] == r && last[1] == y) { last[1] = y1; continue; } }
      runs.Add(new int[] { y, y1, l, r });
    }
    var pts = new List<P>();
    foreach (var u in runs) { pts.Add(new P { x = ox + W - u[3], y = oy + u[0] }); pts.Add(new P { x = ox + W - u[3], y = oy + u[1] }); }
    for (int i = runs.Count - 1; i >= 0; i--) { var u = runs[i]; pts.Add(new P { x = ox + u[2], y = oy + u[1] }); pts.Add(new P { x = ox + u[2], y = oy + u[0] }); }
    IntPtr rg = CreatePolygonRgn(pts.ToArray(), pts.Count, 1);
    if (rg == IntPtr.Zero) return;
    if (SetWindowRgn(h, rg, true) == 0) DeleteObject(rg);
  }
}
} }
`;

/**
 * Pop-outs on Samara's taskbar (sheet 66 A, taskbar.ts), compiled only the first time the taskbar asks for something.
 *
 * Measured 2026-10-22 (test/electron/taskbar-check.ts): DWM takes an iconic thumbnail only from the process that owns
 * the window (DwmSetIconicThumbnail on one of Electron's windows from here: E_INVALIDARG; on a window of this process:
 * S_OK). So a SNAPPED GROUP's one picture comes from a window this helper owns: a "proxy", minimized and never shown,
 * wearing Samara's app id and lantern, iconic (DWMWA_FORCE_ICONIC_REPRESENTATION + DWMWA_HAS_ICONIC_BITMAP). DWM asks
 * it for the picture (WM_DWMSENDICONICTHUMBNAIL), it asks the Shell ("E id thumb w h"), the Shell composes the
 * members' captures and sends them back ("T"). Clicking it never restores it (WM_QUERYOPEN answers no): it says
 * "E id click" and the Shell brings the group forward. Its thumbnail buttons say "E id btn n".
 *
 * One line in, "R <seq> <answer>" out. Electron's own windows, by handle:
 *   A seq hwnd 0|1          WS_EX_APPWINDOW on (WS_EX_TOOLWINDOW off) or off; answers the new extended style
 *   Q seq hwnd              answers the extended style
 * Proxies, by a small id (1..999) the Shell picks:
 *   G seq id 1|0            make one (or remove it)      N seq id b64       its title and tooltip (UTF-8, base64)
 *   W seq id x y w h        where the group is (screen pixels: the live preview's place)
 *   T seq id w h b64        the thumbnail (premultiplied BGRA)   L seq id w h b64   the live preview, at W's place
 *   V seq id                ask DWM to ask again          K seq slot w h b64 a 16-32 px button icon (straight alpha)
 *   B seq id spec           up to 7 buttons "id.icon.flags.tipb64" joined by commas, or "-" for none
 * Only numbers, pixels and short texts: every size is checked against its pixels, texts are cut to length.
 */
export const TASKBAR_HELPER_CS = `
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text; using System.Threading;
using System.Windows.Forms; using System.Drawing;
namespace AangTb {
[ComImport, Guid("ea1afb91-9e28-4b86-90e9-9e9f8a5eefaf"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITaskbarList3 {
  void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); void ActivateTab(IntPtr h); void SetActiveAlt(IntPtr h);
  void MarkFullscreenWindow(IntPtr h, [MarshalAs(UnmanagedType.Bool)] bool f);
  void SetProgressValue(IntPtr h, ulong done, ulong total); void SetProgressState(IntPtr h, int f);
  void RegisterTab(IntPtr t, IntPtr m); void UnregisterTab(IntPtr t); void SetTabOrder(IntPtr t, IntPtr i); void SetTabActive(IntPtr t, IntPtr m, uint r);
  [PreserveSig] int ThumbBarAddButtons(IntPtr h, uint n, [MarshalAs(UnmanagedType.LPArray)] THUMBBUTTON[] b);
  [PreserveSig] int ThumbBarUpdateButtons(IntPtr h, uint n, [MarshalAs(UnmanagedType.LPArray)] THUMBBUTTON[] b);
  void ThumbBarSetImageList(IntPtr h, IntPtr l);
  void SetOverlayIcon(IntPtr h, IntPtr i, [MarshalAs(UnmanagedType.LPWStr)] string d);
  [PreserveSig] int SetThumbnailTooltip(IntPtr h, [MarshalAs(UnmanagedType.LPWStr)] string t);
  void SetThumbnailClip(IntPtr h, IntPtr r);
}
[ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090"), ClassInterface(ClassInterfaceType.None)] public class TaskbarListCls { }
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct THUMBBUTTON { public uint dwMask; public uint iId; public uint iBitmap; public IntPtr hIcon; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szTip; public uint dwFlags; }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore { int GetCount(out uint c); int GetAt(uint i, out PKEY k); int GetValue(ref PKEY k, IntPtr v); int SetValue(ref PKEY k, ref PV v); int Commit(); }
[StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PKEY { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
[StructLayout(LayoutKind.Sequential)] public struct BIH { public int size; public int w; public int h; public short planes; public short bits; public int comp; public int img; public int xp; public int yp; public int used; public int imp; }
[StructLayout(LayoutKind.Sequential)] public struct PT { public int x; public int y; }
[StructLayout(LayoutKind.Sequential)] public struct RC { public int l; public int t; public int r; public int b; }
[StructLayout(LayoutKind.Sequential)] public struct WP { public int length; public int flags; public int show; public PT min; public PT max; public RC normal; }
[StructLayout(LayoutKind.Sequential)] public struct ICONINFO { [MarshalAs(UnmanagedType.Bool)] public bool fIcon; public int x; public int y; public IntPtr mask; public IntPtr color; }

public class Px : Form {
  public int Id; public bool Ready; public string Spec; public bool Added; public int[] Slots = new int[7];
  public Px(int id) {
    Id = id; ShowInTaskbar = true; StartPosition = FormStartPosition.Manual; Location = new Point(-32000, -32000); Size = new Size(240, 140);
    MaximizeBox = false; Text = "Pop-outs";
    try { if (Tb.IconFile.Length > 0) Icon = new Icon(Tb.IconFile); } catch { }
  }
  protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.ExStyle = (cp.ExStyle | 0x40000) & ~0x80; return cp; } }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override void WndProc(ref Message m) {
    int msg = m.Msg;
    if (Tb.TBC != 0 && msg == (int)Tb.TBC) { Ready = true; Tb.Buttons(this); }
    else if (msg == 0x0013) { Tb.Out("E " + Id + " click"); m.Result = IntPtr.Zero; return; }
    else if (msg == 0x0010) { Tb.Out("E " + Id + " close"); return; }
    else if (msg == 0x0323) { long lp = m.LParam.ToInt64(); Tb.Out("E " + Id + " thumb " + ((lp >> 16) & 0xFFFF) + " " + (lp & 0xFFFF)); return; }
    else if (msg == 0x0326) { Tb.Out("E " + Id + " peek"); return; }
    else if (msg == 0x0111) {
      long wp = m.WParam.ToInt64();
      if (((wp >> 16) & 0xFFFF) == 0x1800) { int s = (int)(wp & 0xFFFF); if (s >= 0 && s < 7 && Slots[s] > 0) Tb.Out("E " + Id + " btn " + Slots[s]); return; }
    }
    base.WndProc(ref m);
  }
}

public class Host : Control { }

public static class Tb {
  public static string IconFile = "";
  public static uint TBC;
  static readonly object outLock = new object();
  static Host host;
  static ITaskbarList3 bar;
  static readonly Dictionary<int, Px> pxs = new Dictionary<int, Px>();
  static readonly IntPtr[] icons = new IntPtr[32];
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetLong(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h, ref WP p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessage(string s);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] static extern IntPtr CreateIconIndirect(ref ICONINFO i);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr i);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  [DllImport("dwmapi.dll")] static extern int DwmSetIconicThumbnail(IntPtr h, IntPtr b, uint f);
  [DllImport("dwmapi.dll")] static extern int DwmSetIconicLivePreviewBitmap(IntPtr h, IntPtr b, ref PT p, uint f);
  [DllImport("dwmapi.dll")] static extern int DwmInvalidateIconicBitmaps(IntPtr h);
  [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BIH b, uint u, out IntPtr bits, IntPtr s, uint o);
  [DllImport("gdi32.dll")] static extern IntPtr CreateBitmap(int w, int h, uint planes, uint bits, byte[] px);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ps);

  public static void Out(string s) { lock (outLock) { Console.Out.WriteLine(s); Console.Out.Flush(); } }

  static void Ensure() {
    if (host != null) return;
    ManualResetEvent ready = new ManualResetEvent(false);
    Thread t = new Thread(delegate () {
      try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
      TBC = RegisterWindowMessage("TaskbarButtonCreated");
      Host h = new Host(); IntPtr hh = h.Handle; host = h;
      try { bar = (ITaskbarList3)new TaskbarListCls(); bar.HrInit(); } catch { bar = null; }
      ready.Set();
      Application.Run();
    });
    t.IsBackground = true; t.SetApartmentState(ApartmentState.STA); t.Start();
    ready.WaitOne(10000);
  }
  static string Ui(Func<string> f) { Ensure(); if (host == null) return "nohost"; return (string)host.Invoke(f); }

  static IntPtr Dib(int w, int h, byte[] px) {
    BIH b = new BIH(); b.size = 40; b.w = w; b.h = -h; b.planes = 1; b.bits = 32;
    IntPtr bits; IntPtr hb = CreateDIBSection(IntPtr.Zero, ref b, 0, out bits, IntPtr.Zero, 0);
    if (hb == IntPtr.Zero || bits == IntPtr.Zero) return IntPtr.Zero;
    Marshal.Copy(px, 0, bits, w * h * 4);
    return hb;
  }
  static string Text(string b64, int max) {
    string s = Encoding.UTF8.GetString(Convert.FromBase64String(b64));
    StringBuilder o = new StringBuilder();
    foreach (char c in s) { if (!char.IsControl(c)) o.Append(c); if (o.Length >= max) break; }
    return o.ToString();
  }
  static void AppId(IntPtr h, string id) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore ps;
    if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0 || ps == null) return;
    PKEY k = new PKEY(); k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5;
    PV v = new PV(); v.vt = 31; v.p = Marshal.StringToCoTaskMemUni(id);
    try { ps.SetValue(ref k, ref v); ps.Commit(); } finally { Marshal.FreeCoTaskMem(v.p); Marshal.ReleaseComObject(ps); }
  }
  [DllImport("ole32.dll")] static extern int PropVariantClear(IntPtr p);
  /** A window's own app id ("-" when it has none): what Windows groups its taskbar button by. */
  static string AppIdOf(IntPtr h) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore ps;
    if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0 || ps == null) return "-";
    IntPtr pv = Marshal.AllocCoTaskMem(24);
    try {
      for (int i = 0; i < 24; i++) Marshal.WriteByte(pv, i, 0);
      PKEY k = new PKEY(); k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5;
      if (ps.GetValue(ref k, pv) != 0) return "-";
      string s = Marshal.ReadInt16(pv) == 31 ? Marshal.PtrToStringUni(Marshal.ReadIntPtr(pv, 8)) : null;
      PropVariantClear(pv);
      return string.IsNullOrEmpty(s) ? "-" : s.Replace(' ', '_');
    } finally { Marshal.FreeCoTaskMem(pv); Marshal.ReleaseComObject(ps); }
  }

  public static void Buttons(Px x) {
    if (!x.Ready || x.Spec == null || bar == null) return;
    THUMBBUTTON[] b = new THUMBBUTTON[7];
    string[] items = x.Spec == "-" ? new string[0] : x.Spec.Split(',');
    for (int i = 0; i < 7; i++) {
      b[i].dwMask = 0xE; b[i].iId = (uint)i; b[i].szTip = ""; b[i].dwFlags = 8; x.Slots[i] = 0;
      if (i >= items.Length) continue;
      string[] f = items[i].Split('.');
      int id, ic, fl;
      if (f.Length != 4 || !int.TryParse(f[0], out id) || !int.TryParse(f[1], out ic) || !int.TryParse(f[2], out fl) || id < 1 || id > 99 || ic < 0 || ic > 31 || fl < 0 || fl > 31) continue;
      b[i].hIcon = icons[ic]; b[i].dwFlags = (uint)fl; b[i].szTip = Text(f[3], 100); x.Slots[i] = id;
    }
    if (!x.Added) { if (bar.ThumbBarAddButtons(x.Handle, 7, b) == 0) x.Added = true; }
    else bar.ThumbBarUpdateButtons(x.Handle, 7, b);
  }

  public static void Line(string l) {
    string[] p = l.Split(' ');
    int seq; long hv;
    if (p.Length < 3 || !int.TryParse(p[1], out seq) || !long.TryParse(p[2], out hv)) return;
    string r;
    try { r = Do(p, hv); } catch (Exception e) { r = "error " + e.GetType().Name; }
    Out("R " + seq + " " + r);
  }

  static string Do(string[] p, long hv) {
    string op = p[0];
    if (op == "Q" || op == "A") {
      IntPtr h = new IntPtr(hv);
      if (!IsWindow(h)) return "nowindow";
      if (op == "A" && p.Length == 4) {
        long ex = GetLong(h, -20).ToInt64();
        long nx = p[3] == "1" ? ((ex | 0x40000L) & ~0x80L) : (ex & ~0x40000L);
        if (nx != ex) { SetLong(h, -20, new IntPtr(nx)); SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 0x37); }
      }
      string st = GetLong(h, -20).ToInt64().ToString();
      return op == "Q" ? st + " " + AppIdOf(h) : st;
    }
    if (op == "K") {
      int slot = (int)hv, w, hh;
      if (p.Length != 6 || slot < 0 || slot > 31 || !int.TryParse(p[3], out w) || !int.TryParse(p[4], out hh) || w < 8 || hh < 8 || w > 64 || hh > 64) return "refused";
      byte[] px = Convert.FromBase64String(p[5]);
      if (px.Length != w * hh * 4) return "badsize";
      return Ui(delegate () {
        IntPtr color = Dib(w, hh, px), mask = CreateBitmap(w, hh, 1, 1, new byte[((w + 15) / 16) * 2 * hh]);
        ICONINFO ii = new ICONINFO(); ii.fIcon = true; ii.mask = mask; ii.color = color;
        IntPtr ic = CreateIconIndirect(ref ii);
        DeleteObject(color); DeleteObject(mask);
        if (ic == IntPtr.Zero) return "noicon";
        if (icons[slot] != IntPtr.Zero) DestroyIcon(icons[slot]);
        icons[slot] = ic;
        return "0";
      });
    }
    int id = (int)hv;
    if (id < 1 || id > 999) return "refused";
    if (op == "G" && p.Length == 4) {
      bool on = p[3] == "1";
      return Ui(delegate () {
        Px x;
        pxs.TryGetValue(id, out x);
        if (!on) { if (x != null) { pxs.Remove(id); x.Dispose(); } return "0"; }
        if (x != null) return "0";
        x = new Px(id);
        IntPtr h = x.Handle;
        AppId(h, "Aang.Samara");
        int one = 1, a = DwmSetWindowAttribute(h, 7, ref one, 4), b = DwmSetWindowAttribute(h, 10, ref one, 4);
        ShowWindow(h, 7);
        pxs[id] = x;
        return a + "," + b;
      });
    }
    return Ui(delegate () {
      Px x;
      if (!pxs.TryGetValue(id, out x)) return "noproxy";
      IntPtr h = x.Handle;
      if (op == "N" && p.Length == 4) { string t = Text(p[3], 200); x.Text = t; if (bar != null) bar.SetThumbnailTooltip(h, t); return "0"; }
      if (op == "V") return DwmInvalidateIconicBitmaps(h).ToString();
      if (op == "B" && p.Length == 4) { x.Spec = p[3]; Buttons(x); return x.Ready ? "0" : "later"; }
      if (op == "W" && p.Length == 7) {
        int[] v = new int[4];
        for (int i = 0; i < 4; i++) if (!int.TryParse(p[3 + i], out v[i]) || Math.Abs(v[i]) > 100000) return "refused";
        if (v[2] < 1 || v[3] < 1) return "refused";
        WP wp = new WP(); wp.length = Marshal.SizeOf(typeof(WP)); wp.show = 7;
        wp.normal.l = v[0]; wp.normal.t = v[1]; wp.normal.r = v[0] + v[2]; wp.normal.b = v[1] + v[3];
        return SetWindowPlacement(h, ref wp) ? "0" : "failed";
      }
      if ((op == "T" && p.Length == 6) || (op == "L" && p.Length == 6)) {
        int w, hh;
        if (!int.TryParse(p[3], out w) || !int.TryParse(p[4], out hh) || w < 1 || hh < 1 || w > 4096 || hh > 4096) return "badsize";
        byte[] px = Convert.FromBase64String(p[5]);
        if (px.Length != w * hh * 4) return "badsize";
        IntPtr hb = Dib(w, hh, px);
        if (hb == IntPtr.Zero) return "nobitmap";
        PT pt = new PT();
        int hr = op == "T" ? DwmSetIconicThumbnail(h, hb, 0) : DwmSetIconicLivePreviewBitmap(h, hb, ref pt, 0);
        DeleteObject(hb);
        return hr.ToString();
      }
      return "refused";
    });
  }
}
}
`;

// One line per request: "<hwnd> 2" round (and no region), "<hwnd> 1" square, or "<hwnd> 1 <mask> <s,s,s> <x,y,w,h>"
// Windows' rounding off and the stepped region instead (mask = which corners stay round, s = the steps in real pixels,
// x,y,w,h = the visible window on the screen in real pixels).
// A line starting with a letter is the taskbar's (TASKBAR_HELPER_CS), compiled the first time one comes.
/** Samara's lantern, worn by the group proxies (the same .ico as Samara's windows, browser.ts). */
const LANTERN = path.join(import.meta.dirname, '..', 'pages', 'art', 'samara', 'samara-open.ico');
const SCRIPT = `
Add-Type -TypeDefinition @'
${EDGE_HELPER_CS}
'@
$tb = 0
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null) { break }
  if ($l.Length -gt 0 -and [char]::IsLetter($l[0])) {
    if ($tb -eq 0) {
      try {
        Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
${TASKBAR_HELPER_CS}
'@
        [AangTb.Tb]::IconFile = '${LANTERN.replace(/'/g, "''")}'
        $tb = 1
      } catch { $tb = 2 }
    }
    if ($tb -eq 1) { [AangTb.Tb]::Line($l) } else { $q = $l.Split(' '); if ($q.Length -gt 1) { [Console]::Out.WriteLine('R ' + $q[1] + ' notb'); [Console]::Out.Flush() } }
    continue
  }
  $p = $l.Split(' ')
  if ($p.Length -ne 2 -and $p.Length -ne 5) { continue }
  $n = [Int64]0; $c = 0
  if (-not [Int64]::TryParse($p[0], [ref]$n) -or -not [Int32]::TryParse($p[1], [ref]$c)) { continue }
  if ($c -lt 0 -or $c -gt 3) { continue }
  $h = [System.IntPtr]::new($n)
  if ($p.Length -eq 5) {
    $m = 0
    if (-not [Int32]::TryParse($p[2], [ref]$m) -or $m -lt 0 -or $m -gt 15) { continue }
    $s = @(); $ok = $true
    foreach ($x in $p[3].Split(',')) { $v = 0; if ([Int32]::TryParse($x, [ref]$v) -and $v -ge 0 -and $v -le 64) { $s += $v } else { $ok = $false } }
    if (-not $ok -or $s.Count -gt 48) { continue }
    $r = @(); foreach ($x in $p[4].Split(',')) { $v = 0; if ([Int32]::TryParse($x, [ref]$v) -and [Math]::Abs($v) -le 100000) { $r += $v } else { $ok = $false } }
    if (-not $ok -or $r.Count -ne 4) { continue }
    [Aang.Win]::Corner($h, $c, ${EDGE})
    [Aang.Win]::Region($h, $m, [int[]]$s, $r[0], $r[1], $r[2], $r[3])
  } else {
    [Aang.Win]::Corner($h, $c, ${EDGE})
  }
}
`;

let helper: ChildProcess | null = null;
let broken = false;
/** Answers still owed by the helper (the taskbar's requests), by sequence number. */
const owed = new Map<number, { done: (s: string) => void; timer: NodeJS.Timeout }>();
let seq = 0;

function send(line: string): void {
  // Windows only (2026-10-22, Mac audit): the helper is PowerShell + user32/dwmapi; this module also ships in the Mac's
  // Samara (browser.ts imports softEdge), where nothing may ever start it.
  if (broken || process.platform !== 'win32') return;
  if (!helper || helper.exitCode !== null || helper.killed) {
    try {
      const h = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      helper = h;
      h.on('error', () => { broken = true; helper = null; });   // no PowerShell: Windows' own edge stays
      h.on('exit', () => { if (helper === h) helper = null; for (const [k, o] of owed) { clearTimeout(o.timer); owed.delete(k); o.done('gone'); } });
      h.stdin?.on('error', () => { /* it went away; the next request starts a new one */ });
      // Its answers: "R <seq> <answer>", one per line.
      let rest = '';
      h.stdout?.setEncoding('utf8');
      h.stdout?.on('data', (d: string) => {
        rest += d;
        let i: number;
        while ((i = rest.indexOf('\n')) >= 0) {
          const ln = rest.slice(0, i).trim(); rest = rest.slice(i + 1);
          const ev = /^E (\d{1,3}) ([a-z]+)((?: \d{1,5}){0,2})$/.exec(ln);
          if (ev) { for (const f of listeners) try { f(Number(ev[1]), ev[2]!, ev[3]!.trim() ? ev[3]!.trim().split(' ').map(Number) : []); } catch { /* one listener's trouble */ } continue; }
          const m = /^R (\d+) (.*)$/.exec(ln);
          const o = m ? owed.get(Number(m[1])) : undefined;
          if (m && o) { clearTimeout(o.timer); owed.delete(Number(m[1])); o.done(m[2]!); }
        }
        if (rest.length > 4096) rest = '';
      });
      h.unref();
      (h.stdin as unknown as { unref?: () => void } | null)?.unref?.();
      (h.stdout as unknown as { unref?: () => void } | null)?.unref?.();
    } catch { broken = true; return; }
  }
  try { helper?.stdin?.write(line + '\n'); } catch { /* gone */ }
}

/** What the group proxies say: click, close, thumb (w h), peek, btn (n). */
type HelperEvent = (id: number, what: string, nums: number[]) => void;
const listeners = new Set<HelperEvent>();
export function onHelperEvent(f: HelperEvent): () => void { listeners.add(f); return () => listeners.delete(f); }

function ask(line: (n: number) => string, ms: number): Promise<string> {
  if (process.platform !== 'win32') return Promise.resolve('off');
  if (broken) return Promise.resolve('broken');
  const n = ++seq;
  return new Promise((done) => {
    owed.set(n, { done, timer: setTimeout(() => { owed.delete(n); done('timeout'); }, ms) });
    send(line(n));
  });
}

/**
 * The taskbar's two requests about one of Electron's own windows (TASKBAR_HELPER_CS): A = WS_EX_APPWINDOW on (1) or off
 * (0), Q = just look. Answers the window's extended style as a number, or a word ('nowindow', 'timeout', 'off' off
 * Windows). The first one waits for the taskbar part to compile (a few seconds); later ones answer in milliseconds.
 */
export function askHelper(op: 'A' | 'Q', w: BaseWindow, on?: boolean, ms = 15000): Promise<string> {
  const h = hwndOf(w);
  if (!h) return Promise.resolve('nowindow');
  return ask((n) => `${op} ${n} ${h}${op === 'A' ? (on === false ? ' 0' : ' 1') : ''}`, ms);
}

/**
 * A group proxy request (G N W T L V B), or an icon (K, `id` = its slot). Numbers, base64 and the button spec only:
 * anything else is refused here before it reaches the helper.
 */
export function askProxy(op: 'G' | 'N' | 'W' | 'T' | 'L' | 'V' | 'B' | 'K', id: number, args: (number | string)[] = [], ms = 15000): Promise<string> {
  if (!Number.isInteger(id) || id < 0 || id > 999) return Promise.resolve('refused');
  if (!args.every((a) => (typeof a === 'number' ? Number.isFinite(a) : /^[A-Za-z0-9+/=.,-]+$/.test(a)))) return Promise.resolve('refused');
  return ask((n) => `${op} ${n} ${id}${args.length ? ' ' + args.map((a) => (typeof a === 'number' ? String(Math.round(a)) : a)).join(' ') : ''}`, ms);
}

export function hwndOf(w: BaseWindow): string | null {
  try {
    const buf = w.getNativeWindowHandle();
    const hwnd = (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString();
    return /^\d+$/.test(hwnd) ? hwnd : null;
  } catch { return null; }   // the window is gone
}

/** Round, soft-edged, dark-wood outline. Windows 11 only; anywhere else it quietly does nothing. */
export function softEdge(w: BaseWindow): void { setCorners(w, ALL_ROUND); }

/**
 * Which corners are round (bits: 1 top-left, 2 top-right, 4 bottom-right, 8 bottom-left; 15 = all, family.ts roundMask).
 * All four: Windows' own rounding and shadow, no region. Fewer (a window joined flush in the family, his call 2026-10-22:
 * "only the joined sides may be square"): Windows can only round all four or none, so its rounding goes off and the window
 * gets a REGION instead, round only on its outer corners, pixel-stepped (family.ts cornerSteps), radius 10 px at its
 * screen's scale. A region window loses Windows' shadow and edge line.
 * Call again after the window changes size: the region is cut to the size it had.
 *
 * Measured 2026-10-22 (test/electron/family2-check.ts): the moment a region is set, Chromium stops keeping the window's
 * invisible 8 px resize borders out of the page (the page grows by them, left, right and bottom) and never takes them back,
 * not even with the region cleared. So the region is cut to the VISIBLE window (Electron's own bounds, unchanged), the
 * family pads the page by the borders it gained (familywin.ts), and once a window has had a region it keeps one:
 * `region` = true with all four corners round, stepped, when it is free again.
 */
export function setCorners(w: BaseWindow, mask: number, region = false): void {
  if (process.platform !== 'win32') return;
  const h = hwndOf(w);
  if (!h) return;
  const m = Math.max(0, Math.min(ALL_ROUND, Math.round(mask) | 0));
  if (m === ALL_ROUND && !region) { send(`${h} ${CORNER.round}`); return; }
  let scale = 1, vis: Electron.Rectangle;
  try {
    scale = screen.getDisplayMatching(w.getBounds()).scaleFactor || 1;
    vis = screen.dipToScreenRect(w as Electron.BrowserWindow, w.getBounds());
  } catch { return; }
  const steps = cornerSteps(CORNER_RADIUS * scale);
  if (!steps.length) { send(`${h} ${CORNER.square}`); return; }
  send(`${h} ${CORNER.square} ${m} ${steps.join(',')} ${[vis.x, vis.y, vis.width, vis.height].map(Math.round).join(',')}`);
}

/** Stop the helper (the Shell quitting). */
export function stopEdgeHelper(): void { try { helper?.stdin?.end(); helper?.kill(); } catch { /* gone */ } helper = null; }
