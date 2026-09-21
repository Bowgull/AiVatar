using System.Drawing;
using Aang.Body;
using Xunit;

public class LookTests
{
    static Bitmap Filled(Color c, int w = 400, int h = 300)
    {
        var b = new Bitmap(w, h);
        using var g = Graphics.FromImage(b);
        g.Clear(c);
        return b;
    }

    [Fact]
    public void Protected_video_comes_out_black_and_is_seen_as_black()
    {
        // What a Netflix window looks like to any capture API: a black rectangle under the browser's toolbar.
        using var b = Filled(Color.Black);
        using (var g = Graphics.FromImage(b)) g.FillRectangle(Brushes.DimGray, 0, 0, 400, 30);
        Assert.True(Look.BlackShare(b) >= 0.85, $"black share {Look.BlackShare(b):P0}");
    }

    [Fact]
    public void A_dark_editor_theme_is_not_mistaken_for_protected_video()
    {
        // VS Code's dark theme background, #1E1E1E: dark, but not black.
        using var b = Filled(Color.FromArgb(30, 30, 30));
        Assert.True(Look.BlackShare(b) < 0.1, $"black share {Look.BlackShare(b):P0}");
    }

    [Fact]
    public void Nothing_is_captured_from_a_window_that_is_gone()
    {
        var shot = Look.Capture(new IntPtr(0x7ffffff0), Array.Empty<IntPtr>());
        Assert.Null(shot.Jpeg);
        Assert.Contains("gone", shot.Error);
    }
}
