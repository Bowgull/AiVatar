// Which Electron runs Aang's windows (6.28, his decision 2026-10-13: small engine updates install themselves,
// only after the tests pass, and roll back on their own if anything breaks).
//
// The brain downloads a new engine into src/Shell/engines/<version>/ beside the old one, tests it, and writes
// engines/current.json pointing at it as a TRIAL. The pet reads the pointer every time it starts the Shell. If the
// trial engine dies within its first three minutes, the pet points back at the previous engine (never deleted) and
// the very next start uses that. The brain marks the trial GOOD once the Shell has run on it for five minutes.
//
// No pointer, or anything wrong with it: the Electron that ships in node_modules, exactly as before.
using System.Text.Json;

namespace Aang.Body;

internal static class EnginePointer
{
    /// <summary>A trial engine that dies sooner than this after starting is treated as broken.</summary>
    public static readonly TimeSpan TrialGrace = TimeSpan.FromMinutes(3);

    internal sealed record Engine(string version, string dir);
    internal sealed record Pointer(string version, string dir, string status, Engine? previous, string? at);

    static string PointerPath(string shellDir) => Path.Combine(shellDir, "engines", "current.json");
    static string ExeIn(string dir) => Path.Combine(dir, "electron.exe");

    internal static Pointer? Read(string shellDir)
    {
        try
        {
            var p = PointerPath(shellDir);
            if (!File.Exists(p)) return null;
            return JsonSerializer.Deserialize<Pointer>(File.ReadAllText(p));
        }
        catch { return null; }
    }

    static void Write(string shellDir, Pointer? ptr)
    {
        var p = PointerPath(shellDir);
        if (ptr == null) { try { File.Delete(p); } catch { /* already gone */ } return; }
        var tmp = p + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(ptr));
        File.Move(tmp, p, overwrite: true);
    }

    /// <summary>
    /// The engine to start the Shell with: the pointer's, if it names an engine folder inside engines/ that really has
    /// electron.exe in it; otherwise the one that ships in node_modules.
    /// </summary>
    public static string Pick(string shellDir, string fallbackExe)
    {
        var ptr = Read(shellDir);
        if (ptr == null || (ptr.status != "good" && ptr.status != "trial")) return fallbackExe;
        var exe = Safe(shellDir, ptr.dir);
        return exe ?? fallbackExe;
    }

    /// <summary>An engine folder's electron.exe, only if the folder is inside engines/ (a pointer can never send the
    /// pet to run something elsewhere on the disk).</summary>
    static string? Safe(string shellDir, string dir)
    {
        try
        {
            var root = Path.GetFullPath(Path.Combine(shellDir, "engines")) + Path.DirectorySeparatorChar;
            var full = Path.GetFullPath(Path.Combine(shellDir, "engines", dir));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
            var exe = ExeIn(full);
            return File.Exists(exe) ? exe : null;
        }
        catch { return null; }
    }

    /// <summary>
    /// The Shell exited. If it was running a TRIAL engine and died within the grace period, go back to the previous
    /// engine (or to node_modules if there was none). True when it rolled back.
    /// </summary>
    public static bool AfterExit(string shellDir, string exeThatRan, TimeSpan ranFor)
    {
        var ptr = Read(shellDir);
        if (ptr == null || ptr.status != "trial" || ranFor >= TrialGrace) return false;
        var trialExe = Safe(shellDir, ptr.dir);
        // Only the trial engine failing counts: the OLD engine quitting so the new one can start is not a failure.
        if (trialExe == null || !string.Equals(Path.GetFullPath(trialExe), Path.GetFullPath(exeThatRan), StringComparison.OrdinalIgnoreCase)) return false;
        // The brain never offers this version again.
        try { File.AppendAllText(Path.Combine(shellDir, "engines", "failed.txt"), ptr.version + Environment.NewLine); } catch { /* best effort */ }
        if (ptr.previous != null && Safe(shellDir, ptr.previous.dir) != null)
            Write(shellDir, new Pointer(ptr.previous.version, ptr.previous.dir, "good", null, DateTime.UtcNow.ToString("o")));
        else
            Write(shellDir, null);
        Log.Write($"engine {ptr.version} failed its trial after {(int)ranFor.TotalSeconds} s: rolled back to {(ptr.previous?.version ?? "the built-in engine")}");
        return true;
    }
}
