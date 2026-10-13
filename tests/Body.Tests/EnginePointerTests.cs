using System.Text.Json;
using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// 6.28 (his decision, 2026-10-13): small engine updates install themselves after the tests pass and roll back on
/// their own if anything breaks. The pet's half: which engine to start, and going back when a trial engine dies.
/// </summary>
public class EnginePointerTests
{
    static string NewShellDir()
    {
        var d = Path.Combine(Path.GetTempPath(), "aang-engine-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(d, "engines"));
        return d;
    }
    static string Engine(string shell, string version)
    {
        var dir = Path.Combine(shell, "engines", version);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "electron.exe"), "");
        return Path.Combine(dir, "electron.exe");
    }
    static void Point(string shell, string version, string status, string? prev = null) =>
        File.WriteAllText(Path.Combine(shell, "engines", "current.json"), JsonSerializer.Serialize(new
        {
            version, dir = version, status,
            previous = prev == null ? null : new { version = prev, dir = prev },
            at = DateTime.UtcNow.ToString("o"),
        }));

    [Fact]
    public void No_pointer_means_the_engine_that_ships_with_the_Shell()
    {
        var s = NewShellDir();
        Assert.Equal("fallback.exe", EnginePointer.Pick(s, "fallback.exe"));
    }

    [Fact]
    public void A_tested_engine_is_used()
    {
        var s = NewShellDir();
        var exe = Engine(s, "44.7.0");
        Point(s, "44.7.0", "trial");
        Assert.Equal(exe, EnginePointer.Pick(s, "fallback.exe"));
    }

    [Fact]
    public void A_pointer_can_never_send_the_pet_outside_the_engines_folder()
    {
        var s = NewShellDir();
        File.WriteAllText(Path.Combine(s, "engines", "current.json"),
            JsonSerializer.Serialize(new { version = "x", dir = @"..\..\Windows\System32", status = "good", previous = (object?)null, at = "" }));
        Assert.Equal("fallback.exe", EnginePointer.Pick(s, "fallback.exe"));
    }

    [Fact]
    public void A_trial_engine_that_dies_early_rolls_back_to_the_previous_one()
    {
        var s = NewShellDir();
        var old = Engine(s, "44.5.1");
        var trial = Engine(s, "44.7.0");
        Point(s, "44.7.0", "trial", prev: "44.5.1");
        Assert.True(EnginePointer.AfterExit(s, trial, TimeSpan.FromSeconds(20)));
        Assert.Equal(old, EnginePointer.Pick(s, "fallback.exe"));
        Assert.Contains("44.7.0", File.ReadAllText(Path.Combine(s, "engines", "failed.txt")));
    }

    [Fact]
    public void The_old_engine_quitting_for_the_swap_is_not_a_failure()
    {
        var s = NewShellDir();
        var old = Engine(s, "44.5.1");
        var trial = Engine(s, "44.7.0");
        Point(s, "44.7.0", "trial", prev: "44.5.1");
        Assert.False(EnginePointer.AfterExit(s, old, TimeSpan.FromSeconds(20)));
        Assert.Equal(trial, EnginePointer.Pick(s, "fallback.exe"));
    }

    [Fact]
    public void A_trial_that_ran_past_the_grace_period_stays()
    {
        var s = NewShellDir();
        Engine(s, "44.5.1");
        var trial = Engine(s, "44.7.0");
        Point(s, "44.7.0", "trial", prev: "44.5.1");
        Assert.False(EnginePointer.AfterExit(s, trial, TimeSpan.FromMinutes(10)));
        Assert.Equal(trial, EnginePointer.Pick(s, "fallback.exe"));
    }

    [Fact]
    public void With_no_previous_engine_it_goes_back_to_the_built_in_one()
    {
        var s = NewShellDir();
        var trial = Engine(s, "44.7.0");
        Point(s, "44.7.0", "trial");
        Assert.True(EnginePointer.AfterExit(s, trial, TimeSpan.FromSeconds(5)));
        Assert.Equal("fallback.exe", EnginePointer.Pick(s, "fallback.exe"));
    }
}
