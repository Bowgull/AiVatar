using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Aang.Body;

/// <summary>
/// What Aang does to other windows: close an app, quit it by force, minimise, maximise, bring to the front,
/// snap to half the screen, and the media keys. The Core decides and asks Joshua; this only does it, here,
/// because the Body owns the desktop and Node has no way to reach a window.
///
/// Closing is a request (WM_CLOSE to each of the app's windows), exactly like clicking its X, so the app
/// can still ask "save your changes?". Only "force" ends the process, and the Core always asks for that.
/// Aang's own windows are never touched.
/// </summary>
static class Hands
{
    public sealed record Win(long Hwnd, string Title, string Process, int Pid);
    public sealed record Result(bool Ok, string Detail);

    const uint WM_CLOSE = 0x0010;
    const int SW_MINIMIZE = 6, SW_MAXIMIZE = 3, SW_RESTORE = 9;
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool alt);
    [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }

    /// <summary>
    /// The windows a person would call open: visible, titled, top-level, not owned by another window and not
    /// a tool window. Aang's own are left out.
    /// </summary>
    public static List<Win> Windows()
    {
        var list = new List<Win>();
        var own = Environment.ProcessId;
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || GetWindow(h, 4 /* GW_OWNER */) != IntPtr.Zero) return true;
            if ((GetWindowLong(h, -20 /* GWL_EXSTYLE */) & 0x80 /* WS_EX_TOOLWINDOW */) != 0) return true;
            var sb = new StringBuilder(300);
            if (GetWindowText(h, sb, sb.Capacity) == 0) return true;
            GetWindowThreadProcessId(h, out var pid);
            if (pid == own) return true;
            string name;
            try { using var p = Process.GetProcessById((int)pid); name = p.ProcessName; } catch { return true; }
            if (name is "TextInputHost" or "ApplicationFrameHost" && sb.ToString() is "Windows Input Experience") return true;
            list.Add(new Win(h.ToInt64(), sb.ToString(), name, (int)pid));
            return true;
        }, IntPtr.Zero);
        return list;
    }

    /// <summary>
    /// The windows that match what he called it: the process name ("chrome", "spotify") or a piece of the
    /// title ("the raid spreadsheet"). Process name wins when it matches, so "close chrome" is every Chrome
    /// window and never some other app whose title happens to mention Chrome.
    /// </summary>
    public static List<Win> Find(string what)
    {
        var all = Windows();
        var w = (what ?? "").Trim().ToLowerInvariant();
        if (w.Length == 0) return new();
        var alias = w switch { "google chrome" => "chrome", "edge" or "microsoft edge" => "msedge", "file explorer" or "explorer" => "explorer", "paint" => "mspaint", "calculator" => "calculatorapp", "wow" or "world of warcraft" => "wowb", _ => w };
        var byProcess = all.Where(x => x.Process.Equals(alias, StringComparison.OrdinalIgnoreCase) || x.Process.Replace(" ", "").Equals(alias.Replace(" ", ""), StringComparison.OrdinalIgnoreCase)).ToList();
        if (byProcess.Count > 0) return byProcess;
        return all.Where(x => x.Title.Contains(what!.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
    }

    static string Named(List<Win> ws) => ws.Count == 1 ? $"\"{ws[0].Title}\"" : $"{ws.Count} {ws[0].Process} windows";

    public static Result Close(string what)
    {
        var ws = Find(what);
        if (ws.Count == 0) return new(false, $"Nothing called {what} is open.");
        foreach (var w in ws) PostMessage(new IntPtr(w.Hwnd), WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        Thread.Sleep(1200);
        var left = ws.Where(w => IsWindow(new IntPtr(w.Hwnd)) && IsWindowVisible(new IntPtr(w.Hwnd))).ToList();
        if (left.Count == 0) return new(true, $"Closed {Named(ws)}.");
        // Still there: usually a "save your changes?" question. That is his to answer, not Aang's.
        return new(true, $"Asked {Named(ws)} to close. {left.Count} still open - it may be asking to save something, which is his to answer.");
    }

    public static Result ForceQuit(string what)
    {
        var ws = Find(what);
        if (ws.Count == 0) return new(false, $"Nothing called {what} is open.");
        var pids = ws.Select(w => w.Pid).Distinct().ToList();
        int ended = 0;
        foreach (var pid in pids)
            try { using var p = Process.GetProcessById(pid); p.Kill(entireProcessTree: true); ended++; } catch { /* already gone */ }
        return new(ended > 0, ended > 0 ? $"Force-quit {ws[0].Process}. Anything unsaved in it is gone." : $"Could not end {ws[0].Process}.");
    }

    public static Result Arrange(string what, string how)
    {
        var ws = Find(what);
        if (ws.Count == 0) return new(false, $"Nothing called {what} is open.");
        var h = new IntPtr(ws[0].Hwnd);
        switch (how)
        {
            case "minimise": ShowWindow(h, SW_MINIMIZE); break;
            case "maximise": ShowWindow(h, SW_MAXIMIZE); break;
            case "restore": ShowWindow(h, SW_RESTORE); break;
            case "front": ShowWindow(h, SW_RESTORE); SwitchToThisWindow(h, true); SetForegroundWindow(h); break;
            case "left": case "right":
                var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
                GetMonitorInfo(MonitorFromWindow(h, 2 /* nearest */), ref mi);
                var wk = mi.rcWork; int half = (wk.R - wk.L) / 2;
                ShowWindow(h, SW_RESTORE);
                MoveWindow(h, how == "left" ? wk.L : wk.L + half, wk.T, half, wk.B - wk.T, true);
                break;
            default: return new(false, $"I do not know how to {how} a window.");
        }
        var verb = how switch { "minimise" => "Minimised", "maximise" => "Maximised", "restore" => "Restored", "front" => "Brought up", _ => $"Moved to the {how} half:" };
        return new(true, $"{verb} \"{ws[0].Title}\".");
    }

    /// <summary>The media keys, as if pressed: whatever is playing (Spotify, a browser tab) answers them.</summary>
    public static Result Media(string key)
    {
        byte vk = key switch
        {
            "playpause" => 0xB3, "next" => 0xB0, "previous" => 0xB1, "stop" => 0xB2,
            "volumeup" => 0xAF, "volumedown" => 0xAE, "mute" => 0xAD, _ => 0,
        };
        if (vk == 0) return new(false, $"There is no media key called {key}.");
        int times = key is "volumeup" or "volumedown" ? 5 : 1;    // one press is 2%, too small to notice
        for (int i = 0; i < times; i++) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
        return new(true, key switch { "playpause" => "Pressed play/pause.", "volumeup" => "Turned the volume up.", "volumedown" => "Turned the volume down.", "mute" => "Toggled mute.", _ => $"Pressed {key}." });
    }
}
