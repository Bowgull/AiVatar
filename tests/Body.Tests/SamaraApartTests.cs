using System.Diagnostics;
using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// P1 (2026-11-17): Samara on its own on the PC by default. The pet decides from one saved setting, only for Samara code
/// that has samara.ts (his releases before P1 do not), and a launcher still rolls back a trial release that dies early.
/// </summary>
public class SamaraApartTests
{
    static string Folder(bool withSamara)
    {
        var d = Path.Combine(Path.GetTempPath(), "aang-apart-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(d, "src"));
        File.WriteAllText(Path.Combine(d, "src", "main.ts"), "");
        if (withSamara) File.WriteAllText(Path.Combine(d, "src", "samara.ts"), "");
        return d;
    }
    static string Mode(string? json)
    {
        var f = Path.Combine(Path.GetTempPath(), "aang-mode-" + Guid.NewGuid().ToString("N") + ".json");
        if (json != null) File.WriteAllText(f, json);
        return f;
    }

    [Fact]
    public void On_by_default_when_the_code_has_samara_ts() => Assert.True(CoreSupervisor.ApartFrom(null, Mode(null), Folder(true)));

    [Fact]
    public void Never_for_a_release_without_samara_ts() =>
        Assert.False(CoreSupervisor.ApartFrom(null, Mode("{\"apart\": true}"), Folder(false)));

    [Fact]
    public void The_saved_setting_turns_it_off() => Assert.False(CoreSupervisor.ApartFrom(null, Mode("{\"apart\": false}"), Folder(true)));

    [Fact]
    public void A_mangled_setting_means_the_default() => Assert.True(CoreSupervisor.ApartFrom(null, Mode("{nope"), Folder(true)));

    [Fact]
    public void The_environment_wins_for_the_tests()
    {
        Assert.True(CoreSupervisor.ApartFrom("1", Mode("{\"apart\": false}"), Folder(false)));
        Assert.False(CoreSupervisor.ApartFrom("0", Mode(null), Folder(true)));
    }

    static Process Quick() => Process.Start(new ProcessStartInfo("cmd.exe", "/c exit 3") { UseShellExecute = false, CreateNoWindow = true })!;

    [Fact]
    public void A_trial_that_dies_early_is_handed_to_the_rollback()
    {
        using var p = Quick();
        string? ran = null;
        var watched = CoreSupervisor.WatchTrial(p, onTrial: true, "engine.exe", DateTime.UtcNow, (exe, _) => ran = exe, TimeSpan.FromSeconds(20));
        Assert.True(watched);
        Assert.Equal("engine.exe", ran);
    }

    [Fact]
    public void A_process_that_started_after_the_pid_file_is_not_samara()
    {
        var written = new DateTime(2026, 11, 20, 14, 50, 39, DateTimeKind.Utc);
        Assert.True(CoreSupervisor.SameRun(written.AddSeconds(-2), written));      // Samara started, then wrote its number
        Assert.False(CoreSupervisor.SameRun(written.AddMinutes(30), written));     // a later process given the same number
    }

    [Fact]
    public void A_planned_restart_on_trial_is_not_rolled_back()
    {
        // 2026-11-20: the engine update restarted Samara (exit 75) 162 s into Samara 1.60.1's trial, and 1.60.1 was undone.
        using var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c exit 75") { UseShellExecute = false, CreateNoWindow = true })!;
        var called = false;
        Assert.False(CoreSupervisor.WatchTrial(p, onTrial: true, "engine.exe", DateTime.UtcNow, (_, _) => called = true, TimeSpan.FromSeconds(20)));
        Assert.False(called);
    }

    [Fact]
    public void With_nothing_on_trial_the_launcher_does_not_wait()
    {
        using var p = Quick();
        var called = false;
        Assert.False(CoreSupervisor.WatchTrial(p, onTrial: false, "engine.exe", DateTime.UtcNow, (_, _) => called = true));
        Assert.False(called);
    }

    [Fact]
    public void A_trial_still_running_after_its_grace_is_left_alone()
    {
        using var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 6 127.0.0.1 >nul") { UseShellExecute = false, CreateNoWindow = true })!;
        var called = false;
        try { Assert.False(CoreSupervisor.WatchTrial(p, onTrial: true, "engine.exe", DateTime.UtcNow, (_, _) => called = true, TimeSpan.FromMilliseconds(300))); }
        finally { try { p.Kill(); } catch { /* gone */ } }
        Assert.False(called);
    }
}
