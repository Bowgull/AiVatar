using System.Text.Json;

namespace Aang.Body;

static class Paths
{
    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Aang");
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
        try { System.IO.File.WriteAllText(Paths.File("body.json"), JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true })); }
        catch (Exception e) { Log.Write("config save failed: " + e.Message); }
    }
}

