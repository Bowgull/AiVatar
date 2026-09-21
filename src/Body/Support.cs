using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// Start with Windows, through a shortcut in the Startup folder.
///
/// It used to be a value under HKCU\...\Run. Found 2026-09-20 from the Shell-Core event log: across seven logins
/// on this Shadow PC, Windows started every other entry and never once started Aang, although the value was
/// there; the list Windows ran at login did not even match what the Run key held. The Startup folder is what
/// demonstrably works here - Ollama and Rainmeter start from it at every boot.
/// </summary>
static class Autostart
{
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run", Name = "Aang";
    static string Shortcut => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "Aang.lnk");
    /// <summary>Under test the Body runs from a throwaway folder and must not change how Joshua's machine starts.</summary>
    static bool Testing => Environment.GetEnvironmentVariable("AANG_BODY_DIR") is { Length: > 0 };

    public static bool IsOn() => File.Exists(Shortcut);

    public static void Set(bool on)
    {
        if (Testing) return;
        try
        {
            ClearRunValue();
            if (!on) { File.Delete(Shortcut); return; }
            var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("no WScript.Shell");
            dynamic shell = Activator.CreateInstance(shellType)!;
            dynamic link = shell.CreateShortcut(Shortcut);
            link.TargetPath = Environment.ProcessPath!;
            link.WorkingDirectory = Path.GetDirectoryName(Environment.ProcessPath!)!;
            link.Description = "Aang";
            link.Save();
        }
        catch (Exception e) { Log.Write("autostart change failed: " + e.Message); }
    }

    /// <summary>Move an old Run-key registration over to the shortcut, once, at start.</summary>
    public static void Migrate()
    {
        if (Testing) return;
        try
        {
            using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey);
            if (k?.GetValue(Name) is string) { Set(true); Log.Write("autostart moved from the Run key to the Startup folder"); }
        }
        catch (Exception e) { Log.Write("autostart migrate failed: " + e.Message); }
    }

    static void ClearRunValue()
    {
        using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
        k?.DeleteValue(Name, throwOnMissingValue: false);
    }
}

/// <summary>
/// Write a file so it is always either the old version or the new one, never half of each. This machine is a
/// Shadow cloud PC that shuts down hard every four hours; writing body.json in place could leave it truncated,
/// and Config.Load treats an unreadable file as a fresh install - losing position, model, hotkey and mute.
/// </summary>
static class Atomic
{
    public static void Write(string path, string text)
    {
        var tmp = path + ".tmp";
        using (var f = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None))
        using (var w = new StreamWriter(f)) { w.Write(text); w.Flush(); f.Flush(flushToDisk: true); }
        File.Move(tmp, path, overwrite: true);
    }
}

static class Paths
{
    // AANG_BODY_DIR is for the tests: they run a real Body, and without it they wrote over Joshua's own settings.
    public static readonly string Dir = Environment.GetEnvironmentVariable("AANG_BODY_DIR") is { Length: > 0 } d
        ? d : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Aang");
    public static string File(string name) { Directory.CreateDirectory(Dir); return Path.Combine(Dir, name); }
}

/// <summary>Tiny append-only log. Diagnostics must never be able to crash the pet, so every failure is swallowed.</summary>
static class Log
{
    static readonly object gate = new();
    public static void Write(string msg)
    {
        try
        {
            lock (gate)
            {
                var p = Paths.File("body.log");
                if (System.IO.File.Exists(p) && new FileInfo(p).Length > 512 * 1024) System.IO.File.Delete(p);
                System.IO.File.AppendAllText(p, $"{DateTime.Now:HH:mm:ss.fff} {msg}{Environment.NewLine}");
            }
        }
        catch { /* logging is best effort */ }
    }
}

sealed class Config
{
    public int? X { get; set; }
    public int? Y { get; set; }
    /// <summary>2 = the window is 110 px taller (room for an expanded bubble; saved positions shifted once). 3 = the hotkey is Ctrl+NumLock.</summary>
    public int LayoutVersion { get; set; }
    /// <summary>Process-name prefixes that put Aang into quiet mode while they hold focus.</summary>
    public string[] QuietProcessPrefixes { get; set; } = { "Wow" };
    /// <summary>The only global hotkey: hides or reveals Aang. If another program owns it the tray says so; no other key is picked.</summary>
    public string Hotkey { get; set; } = "Ctrl+NumLock";
    /// <summary>The model chip (auto, quick, smart, deep) and whether quota saving is on; both survive restarts.</summary>
    public string Mode { get; set; } = "auto";
    public bool Saving { get; set; }
    /// <summary>Start with Windows was switched on the first time Aang ran; after that the tray toggle decides.</summary>
    public bool AutostartAsked { get; set; }
    /// <summary>Optional overrides for where the Core lives and which node runs it (normally found automatically).</summary>
    public string CoreDir { get; set; } = "";
    public string NodePath { get; set; } = "";
    /// <summary>Whether the usage numbers are open next to the gauge in the input box.</summary>
    public bool ShowUsage { get; set; }
    /// <summary>Master mute: Aang never speaks up on his own until it is switched off.</summary>
    public bool Muted { get; set; }
    /// <summary>Let Aang see the title of the window in front, so he knows which app Joshua is in.</summary>
    public bool SeeActiveWindow { get; set; } = true;

    public static Config Load()
    {
        try
        {
            var p = Paths.File("body.json");
            if (System.IO.File.Exists(p)) return JsonSerializer.Deserialize<Config>(System.IO.File.ReadAllText(p)) ?? new();
        }
        catch (Exception e) { Log.Write("config load failed: " + e.Message); }
        return new();
    }

    public void Save()
    {
        try { Atomic.Write(Paths.File("body.json"), JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true })); }
        catch (Exception e) { Log.Write("config save failed: " + e.Message); }
    }
}

