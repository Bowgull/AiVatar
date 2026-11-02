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

    /// <summary>Something covers the screen: a full-screen app or video (QUNS_BUSY), an exclusive full-screen game
    /// (QUNS_RUNNING_D3D_FULL_SCREEN) or presentation mode. One cheap call, so it is read every poll.
    /// A maximized window is not full screen (2026-11-02): with the taskbar hidden it covers the screen too, Windows
    /// called a maximized Samara "busy", and Samara's update would not go in ("Not during a game").</summary>
    public static bool FullScreen()
    {
        try
        {
            if (SHQueryUserNotificationState(out var s) != 0) return false;
            if (s is 3 or 4) return true;
            return s == 2 && !IsZoomed(GetForegroundWindow());
        }
        catch { return false; }
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
