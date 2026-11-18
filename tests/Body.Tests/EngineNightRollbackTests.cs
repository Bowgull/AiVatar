using System.Diagnostics;
using System.Text.Json;
using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// Phase 2 of the browser plan (his call, 2026-11-17): an engine with security fixes goes in by itself overnight, on
/// trial. If it is broken, the pet's own code sends it back: Pick starts the trial engine, the trial watch sees it die
/// early, and AfterExit points back at the engine before and puts the broken one on failed.txt.
/// src/Shell/test/electron/engine-night-check.ts runs this on its own engine folders (AANG_NIGHT_SHELL); alone, it
/// makes the same layout itself.
/// </summary>
public class EngineNightRollback
{
    [Fact]
    public void A_broken_security_engine_put_in_overnight_goes_back_by_itself()
    {
        var shell = Environment.GetEnvironmentVariable("AANG_NIGHT_SHELL");
        if (string.IsNullOrEmpty(shell))
        {
            shell = Path.Combine(Path.GetTempPath(), "aang-night-" + Guid.NewGuid().ToString("N"));
            var good = Path.Combine(shell, "engines", "44.99.0");
            Directory.CreateDirectory(good);
            File.WriteAllText(Path.Combine(good, "electron.exe"), "");
            var broken = Path.Combine(shell, "engines", "44.98.0");
            Directory.CreateDirectory(broken);
            // An engine that dies at once: Windows' own where.exe, run with no arguments, exits with 2.
            File.Copy(Path.Combine(Environment.SystemDirectory, "where.exe"), Path.Combine(broken, "electron.exe"));
            File.WriteAllText(Path.Combine(shell, "engines", "current.json"), JsonSerializer.Serialize(new
            {
                version = "44.98.0", dir = "44.98.0", status = "trial",
                previous = new { version = "44.99.0", dir = "44.99.0" }, at = DateTime.UtcNow.ToString("o"),
            }));
        }

        // What the pet does when it starts Samara: the pointer's engine, on trial.
        var exe = EnginePointer.Pick(shell, "fallback.exe");
        Assert.EndsWith(Path.Combine("44.98.0", "electron.exe"), exe);
        var started = DateTime.UtcNow;
        using var p = Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true })!;
        var watched = CoreSupervisor.WatchTrial(p, onTrial: EnginePointer.Read(shell)?.status == "trial", exe, started,
            (ran, ranFor) => EnginePointer.AfterExit(shell, ran, ranFor), TimeSpan.FromSeconds(30));

        Assert.True(watched);
        var now = EnginePointer.Read(shell)!;
        Assert.Equal("44.99.0", now.version);
        Assert.Equal("good", now.status);
        Assert.Null(now.previous);
        Assert.Contains("44.98.0", File.ReadAllLines(Path.Combine(shell, "engines", "failed.txt")));
        // And the next start picks the engine before, not the broken one.
        Assert.EndsWith(Path.Combine("44.99.0", "electron.exe"), EnginePointer.Pick(shell, "fallback.exe"));
    }
}
