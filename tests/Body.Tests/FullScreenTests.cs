using Aang.Body;
using Xunit;

namespace Body.Tests;

/// <summary>2026-11-20: a big Claude window counted as full screen and held Samara's updates as "Not during a game".</summary>
public class FullScreenTests
{
    const int Busy = 2, D3D = 3, Presenting = 4, Free = 5;
    // Styles read off his PC: the Claude app (title bar and resize edge), and the same window in real full screen.
    const int ClaudeWindow = 0x14C70000, NoFrame = 0x14000000;

    [Fact] public void A_big_window_with_a_title_bar_is_not_full_screen() => Assert.False(Readings.IsFullScreen(Busy, false, ClaudeWindow));
    [Fact] public void A_maximized_window_is_not_full_screen() => Assert.False(Readings.IsFullScreen(Busy, true, NoFrame));
    [Fact] public void A_frameless_window_covering_the_screen_is_full_screen() => Assert.True(Readings.IsFullScreen(Busy, false, NoFrame));
    [Fact] public void A_resize_edge_alone_still_means_a_normal_window() => Assert.False(Readings.IsFullScreen(Busy, false, 0x14040000));
    [Fact] public void An_exclusive_game_is_full_screen() => Assert.True(Readings.IsFullScreen(D3D, false, ClaudeWindow));
    [Fact] public void Presentation_mode_is_full_screen() => Assert.True(Readings.IsFullScreen(Presenting, false, ClaudeWindow));
    [Fact] public void Nothing_busy_is_not_full_screen() => Assert.False(Readings.IsFullScreen(Free, false, NoFrame));
}
