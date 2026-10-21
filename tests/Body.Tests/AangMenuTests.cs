using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>Sheet 56 (2026-10-21): every pick from the new right-click menu runs the pet's own handler, and nothing else.</summary>
public class AangMenuTests
{
    static (AangMenu.Host host, List<string> ran) Recorder()
    {
        var ran = new List<string>();
        var host = new AangMenu.Host
        {
            ClaudeJobs = () => ran.Add("jobs"),
            JobHunt = () => ran.Add("hunt"),
            Hush = m => ran.Add("hush " + m),
            ToggleMute = () => ran.Add("mute"),
            Quiet = q => ran.Add("quiet " + AangMenu.QuietName(q)),
            Dock = e => ran.Add("dock " + AangMenu.DockName(e)),
            ComeBack = () => ran.Add("comeback"),
            Hide = () => ran.Add("hide"),
            Model = m => ran.Add("model " + m),
            ToggleSaving = () => ran.Add("saving"),
            Quit = () => ran.Add("quit"),
        };
        return (host, ran);
    }

    static readonly DateTime Evening = new(2026, 10, 21, 19, 40, 0);

    [Theory]
    [InlineData("jobs", "jobs")] [InlineData("hunt", "hunt")]
    [InlineData("hush.15", "hush 15")] [InlineData("hush.60", "hush 60")] [InlineData("hush.240", "hush 240")] [InlineData("hush.off", "hush 0")]
    [InlineData("mute", "mute")]
    [InlineData("quiet.auto", "quiet auto")] [InlineData("quiet.always", "quiet always")] [InlineData("quiet.never", "quiet never")]
    [InlineData("dock.bottom", "dock bottom")] [InlineData("dock.left", "dock left")] [InlineData("dock.right", "dock right")] [InlineData("dock.top", "dock top")]
    [InlineData("comeback", "comeback")] [InlineData("hide", "hide")]
    [InlineData("model.auto", "model auto")] [InlineData("model.quick", "model quick")] [InlineData("model.smart", "model smart")] [InlineData("model.deep", "model deep")]
    [InlineData("saving", "saving")] [InlineData("quit", "quit")]
    public void Each_pick_runs_exactly_its_handler(string id, string expected)
    {
        var (host, ran) = Recorder();
        Assert.True(AangMenu.Run(id, host, Evening));
        Assert.Equal(new[] { expected }, ran);
    }

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("back")] [InlineData("model.opus")] [InlineData("model.")] [InlineData("panel")] [InlineData("permissions")] [InlineData("QUIT")]
    public void Unknown_or_dropped_ids_run_nothing(string? id)
    {
        var (host, ran) = Recorder();
        Assert.False(AangMenu.Run(id, host, Evening));
        Assert.Empty(ran);
    }

    [Fact] public void Until_tomorrow_runs_to_six_next_morning()
    {
        var (host, ran) = Recorder();
        AangMenu.Run("hush.tomorrow", host, Evening);
        Assert.Equal(new[] { "hush " + (4 * 60 + 20 + 6 * 60) }, ran);   // 19:40 -> 06:00 is 10 h 20 min
    }

    [Fact] public void Before_six_until_tomorrow_means_this_morning() =>
        Assert.Equal(90, AangMenu.MinutesUntilMorning(new DateTime(2026, 10, 22, 4, 30, 0)));

    [Fact] public void Names_for_the_menu_rows()
    {
        Assert.Equal("auto", AangMenu.QuietName(null));
        Assert.Equal("always", AangMenu.QuietName(true));
        Assert.Equal("never", AangMenu.QuietName(false));
        Assert.Equal("none", AangMenu.DockName(DockEdge.None));
        Assert.Equal("bottom", AangMenu.DockName(DockEdge.Bottom));
    }
}
