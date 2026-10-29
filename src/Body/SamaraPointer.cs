// Which Samara the pet starts on the PC (his picks, 2026-10-29: "same as the Mac"). Samara takes its releases from
// GitHub: the Shell unpacks each sealed release into %LOCALAPPDATA%\Aang\Samara\versions\<x.y.z>\ and, when he presses
// Restart now, writes current.json pointing at it as a TRIAL. The pet reads the pointer every time it starts the Shell.
// If the trial dies within its first three minutes, the pet points back at the version before (or the code folder, before
// the first release) and the very next start uses that. The Shell marks the trial GOOD once it has run five minutes.
// The engine (EnginePointer) and the paid-video runtime stay in the code folder; only Samara's own code moves.
//
// No pointer, or anything wrong with it: the code folder, exactly as before.
using System.Text.Json;

namespace Aang.Body;

internal static class SamaraPointer
{
    public static readonly TimeSpan TrialGrace = TimeSpan.FromMinutes(3);
    internal sealed record Version(string version, string dir);
    internal sealed record Pointer(string version, string dir, string status, Version? previous, string? at);

    public static string DefaultRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Aang", "Samara");
    static string PointerPath(string root) => Path.Combine(root, "current.json");

    internal static Pointer? Read(string root)
    {
        try
        {
            var p = PointerPath(root);
            return File.Exists(p) ? JsonSerializer.Deserialize<Pointer>(File.ReadAllText(p)) : null;
        }
        catch { return null; }
    }

    static void Write(string root, Pointer? ptr)
    {
        var p = PointerPath(root);
        if (ptr == null) { try { File.Delete(p); } catch { /* already gone */ } return; }
        var tmp = p + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(ptr));
        File.Move(tmp, p, overwrite: true);
    }

    /// <summary>The installed Samara to start (its folder), or null for the code folder.</summary>
    public static string? Pick(string root)
    {
        var ptr = Read(root);
        if (ptr == null || (ptr.status != "good" && ptr.status != "trial")) return null;
        return Safe(root, ptr);
    }

    /// <summary>A release's folder, only if it is versions\&lt;its version&gt; inside the root and holds Samara's main.ts (a
    /// pointer can never send the pet to run something elsewhere on the disk).</summary>
    static string? Safe(string root, Version v) => Safe(root, v.version, v.dir);
    static string? Safe(string root, Pointer p) => Safe(root, p.version, p.dir);
    static string? Safe(string root, string version, string dir)
    {
        try
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(version ?? "", @"^\d{1,4}\.\d{1,4}\.\d{1,4}$") || dir != "versions/" + version) return null;
            var top = Path.GetFullPath(Path.Combine(root, "versions")) + Path.DirectorySeparatorChar;
            var full = Path.GetFullPath(Path.Combine(root, "versions", version));
            if (!full.StartsWith(top, StringComparison.OrdinalIgnoreCase)) return null;
            return File.Exists(Path.Combine(full, "src", "main.ts")) ? full : null;
        }
        catch { return null; }
    }

    /// <summary>
    /// The Shell exited. If it was running a TRIAL release and died within the grace period, go back to the version
    /// before (or the code folder). True when it rolled back.
    /// </summary>
    public static bool AfterExit(string root, string dirThatRan, TimeSpan ranFor)
    {
        var ptr = Read(root);
        if (ptr == null || ptr.status != "trial" || ranFor >= TrialGrace) return false;
        var trial = Safe(root, ptr);
        // Only the trial failing counts: the old version quitting so the new one can start is not a failure.
        if (trial == null || !string.Equals(Path.GetFullPath(trial).TrimEnd('\\', '/'), Path.GetFullPath(dirThatRan).TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase)) return false;
        try { File.AppendAllText(Path.Combine(root, "failed.txt"), ptr.version + Environment.NewLine); } catch { /* best effort */ }
        if (ptr.previous != null && Safe(root, ptr.previous) != null)
            Write(root, new Pointer(ptr.previous.version, ptr.previous.dir, "good", null, DateTime.UtcNow.ToString("o")));
        else
            Write(root, null);
        Log.Write($"samara {ptr.version} failed its trial after {(int)ranFor.TotalSeconds} s: back to {(ptr.previous?.version ?? "the code folder")}");
        return true;
    }
}
