using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Aang.Body;

/// <summary>
/// The PC's raw readings for the brain's one presence rule (attention.ts, 2026-10-30, his pick: "busy" means the same
/// on the Mac and the PC: a game, a call, full screen, Focus, the Shadow window). The pet only reads; the brain decides
/// busy and away and sends its verdict back. Names and on/off states only, nothing from inside any app.
/// </summary>
static class Readings
{
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);

    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
    const int GWL_STYLE = -16, WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000;

    /// <summary>Something really is full screen: an exclusive full-screen game (QUNS_RUNNING_D3D_FULL_SCREEN),
    /// presentation mode, or a window that covers the screen with no title bar and no resize edge (a video or page in
    /// full screen, a borderless game). One cheap call, so it is read every poll.</summary>
    public static bool FullScreen()
    {
        try
        {
            if (SHQueryUserNotificationState(out var s) != 0) return false;
            var fg = GetForegroundWindow();
            return IsFullScreen(s, IsZoomed(fg), GetWindowLong(fg, GWL_STYLE));
        }
        catch { return false; }
    }

    /// <summary>
    /// The rule, apart from Windows so it can be tested. His screen hides the taskbar, so Windows says "busy" (QUNS_BUSY)
    /// for ANY window that covers the screen. On 2026-11-02 that was patched for maximized windows only; on 2026-11-20 a
    /// big Claude window (not maximized, 8 px past each edge as every window is) still counted, 521 times in the log, and
    /// held Samara's updates and his own "Check for updates" as "Not during a game". A window that still has its title
    /// bar or its resize edge is a normal window, however big. Real full screen (a video, F11, a borderless game) drops both.
    /// </summary>
    internal static bool IsFullScreen(int state, bool zoomed, int style)
    {
        if (state is 3 or 4) return true;
        if (state != 2 || zoomed) return false;
        return (style & WS_CAPTION) != WS_CAPTION && (style & WS_THICKFRAME) == 0;
    }

    /// <summary>
    /// The microphone ("microphone") or camera ("webcam") is in use by some app right now: Windows keeps a
    /// LastUsedTimeStop of 0 for an app while it holds it (the same store the privacy indicator in the taskbar reads).
    /// Packaged apps sit under the capability's key, desktop apps under its NonPackaged key.
    /// </summary>
    public static bool InUse(string capability)
    {
        try
        {
            using var root = Registry.CurrentUser.OpenSubKey($@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{capability}");
            return root != null && AnyInUse(root, nested: true);
        }
        catch { return false; }
    }

    static bool AnyInUse(RegistryKey key, bool nested)
    {
        foreach (var name in key.GetSubKeyNames())
        {
            using var sub = key.OpenSubKey(name);
            if (sub == null) continue;
            if (nested && name.Equals("NonPackaged", StringComparison.OrdinalIgnoreCase)) { if (AnyInUse(sub, nested: false)) return true; continue; }
            if (sub.GetValue("LastUsedTimeStop") is long stop && stop == 0 && sub.GetValue("LastUsedTimeStart") is long start && start > 0) return true;
        }
        return false;
    }
}
