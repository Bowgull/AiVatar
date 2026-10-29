using System.Text.Json;
using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// Samara's update engine on the PC (his picks, 2026-10-29): the pet starts the installed release the pointer names,
/// only from inside its own folder, and goes back by itself when a trial release dies early.
/// </summary>
public class SamaraPointerTests
{
    static string NewRoot()
    {
        var d = Path.Combine(Path.GetTempPath(), "aang-samara-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(d, "versions"));
        return d;
    }
    static string Release(string root, string version)
    {
        var dir = Path.Combine(root, "versions", version);
        Directory.CreateDirectory(Path.Combine(dir, "src"));
        File.WriteAllText(Path.Combine(dir, "src", "main.ts"), "");
        return Path.GetFullPath(dir);
    }
    static void Point(string root, string version, string status, string? prev = null, string? dir = null) =>
        File.WriteAllText(Path.Combine(root, "current.json"), JsonSerializer.Serialize(new
        {
            version, dir = dir ?? "versions/" + version, status,
            previous = prev == null ? null : new { version = prev, dir = "versions/" + prev },
            at = DateTime.UtcNow.ToString("o"),
        }));

    [Fact]
    public void No_pointer_means_the_code_folder() => Assert.Null(SamaraPointer.Pick(NewRoot()));

    [Fact]
    public void An_installed_release_is_started()
    {
        var r = NewRoot();
        var dir = Release(r, "1.0.0");
        Point(r, "1.0.0", "trial");
        Assert.Equal(dir, SamaraPointer.Pick(r));
    }

    [Fact]
    public void A_pointer_can_never_send_the_pet_outside_its_releases()
    {
        var r = NewRoot();
        Release(r, "1.0.0");
        Point(r, "1.0.0", "good", dir: @"..\..\Windows");
        Assert.Null(SamaraPointer.Pick(r));
        Point(r, @"..\..\x", "good", dir: @"versions/..\..\x");
        Assert.Null(SamaraPointer.Pick(r));
    }

    [Fact]
    public void A_release_that_is_not_all_there_is_not_started()
    {
        var r = NewRoot();
        Directory.CreateDirectory(Path.Combine(r, "versions", "1.0.0"));
        Point(r, "1.0.0", "good");
        Assert.Null(SamaraPointer.Pick(r));
    }

    [Fact]
    public void A_trial_that_dies_early_goes_back_to_the_version_before()
    {
        var r = NewRoot();
        var old = Release(r, "1.0.0");
        var trial = Release(r, "1.1.0");
        Point(r, "1.1.0", "trial", prev: "1.0.0");
        Assert.True(SamaraPointer.AfterExit(r, trial, TimeSpan.FromSeconds(20)));
        Assert.Equal(old, SamaraPointer.Pick(r));
        Assert.Contains("1.1.0", File.ReadAllText(Path.Combine(r, "failed.txt")));
    }

    [Fact]
    public void The_first_release_dying_early_goes_back_to_the_code_folder()
    {
        var r = NewRoot();
        var trial = Release(r, "1.0.0");
        Point(r, "1.0.0", "trial");
        Assert.True(SamaraPointer.AfterExit(r, trial, TimeSpan.FromSeconds(5)));
        Assert.Null(SamaraPointer.Pick(r));
    }

    [Fact]
    public void The_old_version_quitting_for_the_swap_is_not_a_failure()
    {
        var r = NewRoot();
        var old = Release(r, "1.0.0");
        var trial = Release(r, "1.1.0");
        Point(r, "1.1.0", "trial", prev: "1.0.0");
        Assert.False(SamaraPointer.AfterExit(r, old, TimeSpan.FromSeconds(20)));
        Assert.Equal(trial, SamaraPointer.Pick(r));
    }

    [Fact]
    public void A_trial_that_ran_past_the_grace_period_stays()
    {
        var r = NewRoot();
        Release(r, "1.0.0");
        var trial = Release(r, "1.1.0");
        Point(r, "1.1.0", "trial", prev: "1.0.0");
        Assert.False(SamaraPointer.AfterExit(r, trial, TimeSpan.FromMinutes(4)));
        Assert.Equal(trial, SamaraPointer.Pick(r));
    }

    [Fact]
    public void The_Shell_starts_the_installed_release_on_the_code_folders_engine()
    {
        var home = CoreSupervisor.FindShellDir()!;
        using var sup = CoreSupervisor.ForShell(null);
        // The engine is always the code folder's (castLabs' signed engine lives there); the code may come from a release.
        Assert.Equal(Path.Combine(home, "node_modules", "electron", "dist", "electron.exe"), sup.Spec.Exe);
        Assert.NotNull(sup.Spec.PickDir);
        Assert.Equal(home, sup.Spec.Dir);
    }
}
