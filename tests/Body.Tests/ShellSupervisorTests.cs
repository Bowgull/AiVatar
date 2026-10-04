using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>
/// Step 6.2: the tray looks after Aang's windows the same way it looks after his brain, and a crash in
/// them never reaches the pet. These check the parts that can be checked without putting a window on
/// screen; the real "kill it and watch it come back" is in tests/fakecore/shell-restart.mjs.
/// </summary>
public class ShellSupervisorTests
{
    [Fact]
    public void It_finds_the_Shell_next_to_the_Core()
    {
        var shell = CoreSupervisor.FindShellDir();
        var core = CoreSupervisor.FindCoreDir();
        Assert.NotNull(shell);
        Assert.NotNull(core);
        // Both live under src/, so finding one and not the other means the walk up is wrong.
        Assert.Equal(Path.GetDirectoryName(core), Path.GetDirectoryName(shell));
        Assert.True(File.Exists(Path.Combine(shell!, "src", "main.ts")));
    }

    [Fact]
    public void The_Shell_is_run_by_the_Electron_that_ships_with_it()
    {
        var dir = CoreSupervisor.FindShellDir()!;
        var electron = Path.Combine(dir, "node_modules", "electron", "dist", "electron.exe");
        // Not the Core's Node, and not whatever Electron happens to be on the machine.
        Assert.True(File.Exists(electron), $"the Shell's own Electron should be at {electron}");
    }

    [Fact]
    public void A_missing_Shell_is_a_status_line_and_not_a_crash()
    {
        // An older copy of Aang, or one installed before the Shell existed, must still run.
        using var s = CoreSupervisor.ForShell(Path.Combine(Path.GetTempPath(), "aang-no-shell-here"));
        s.Start();
        Thread.Sleep(600);
        Assert.False(s.GivenUp);
        Assert.Contains("not found", s.Status, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Disposing_it_twice_is_harmless()
    {
        var s = CoreSupervisor.ForShell(Path.Combine(Path.GetTempPath(), "aang-no-shell-here"));
        s.Dispose();
        s.Dispose();
    }
}
