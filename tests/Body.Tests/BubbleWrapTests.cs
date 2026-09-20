using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

/// <summary>
/// Streaming steadiness is a promise, so it is tested, not eyeballed: as text arrives at the end, every
/// line that was already complete must stay exactly where it was.
/// </summary>
public class BubbleWrapTests
{
    const string Sample =
        "ok so the short version is that the persistent session answered the second message in about two " +
        "seconds, which is roughly half of what spawning a fresh process for every message was costing, " +
        "and it stays warm between turns so the cache keeps paying off.";

    [Fact]
    public void Appending_text_never_rewraps_completed_lines()
    {
        using var bubble = new BubbleView();
        var words = Sample.Split(' ');
        List<string>? previous = null;

        for (int n = 1; n <= words.Length; n++)
        {
            var current = bubble.Wrap(string.Join(' ', words.Take(n)));
            if (previous != null)
            {
                // every line except the last of the earlier text must be unchanged
                for (int i = 0; i < previous.Count - 1; i++)
                    Assert.Equal(previous[i], current[i]);
            }
            previous = current;
        }
    }

    [Fact]
    public void No_line_is_wider_than_the_bubble_text_area()
    {
        using var bubble = new BubbleView();
        using var bmp = new Bitmap(1, 1);
        using var g = Graphics.FromImage(bmp);
        using var font = new Font("Bahnschrift", 11f, FontStyle.Regular, GraphicsUnit.Point);

        foreach (var line in bubble.Wrap(Sample + " " + new string('x', 120) + " " + Sample))
        {
            var w = g.MeasureString(line, font, PointF.Empty, StringFormat.GenericTypographic).Width;
            Assert.True(w <= BubbleView.MaxTextW + 1, $"line too wide ({w:0.0}px): {line}");
        }
    }

    [Fact]
    public void Explicit_newlines_start_new_lines_and_empty_text_is_safe()
    {
        using var bubble = new BubbleView();
        Assert.Equal(new[] { "one", "two" }, bubble.Wrap("one\ntwo"));
        Assert.Single(bubble.Wrap(""));
    }
}
