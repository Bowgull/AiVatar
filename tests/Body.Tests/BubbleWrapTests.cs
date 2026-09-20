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

    // A reply of ~8 lines: the real pelican answer that showed up starting mid-sentence.
    const string Long =
        "Pelicans have a massive throat pouch they use to scoop up fish, not to store them like people think. " +
        "They're one of the heaviest flying birds, and some can weigh up to 15 kilos. " +
        "They're super social and hunt in groups, herding fish together before diving.";

    [Fact]
    public void A_finished_long_reply_starts_at_the_top_and_pages_down()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 3_600_000);   // held for an hour so simulated time cannot expire it
        Assert.True(b.Lines.Count > BubbleView.MaxLines, "test text must overflow the bubble");
        Assert.Equal(0, b.FirstVisible);

        var t = DateTime.UtcNow;
        b.Update(t.AddSeconds(1));
        Assert.Equal(0, b.FirstVisible);                     // still reading the first page
        b.Update(t.AddSeconds(3.2));
        Assert.Equal(1, b.FirstVisible);                     // then it pages down a line at a time
        for (int i = 1; i < 20; i++) b.Update(t.AddSeconds(3.2 + i * 1.6));
        Assert.Equal(b.Lines.Count - BubbleView.MaxLines, b.FirstVisible);   // and stops at the end
    }

    [Fact]
    public void A_streaming_reply_follows_the_newest_lines()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: true, holdMs: 0);
        Assert.Equal(b.Lines.Count - BubbleView.MaxLines, b.FirstVisible);
    }

    [Fact]
    public void The_mouse_wheel_takes_over_from_auto_paging_and_is_clamped()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 3_600_000);
        b.Scroll(1);
        Assert.Equal(1, b.FirstVisible);
        b.Update(DateTime.UtcNow.AddSeconds(5));             // auto paging must not fight the reader (still inside the 8 s the wheel grants)
        Assert.Equal(1, b.FirstVisible);
        b.Scroll(-99); Assert.Equal(0, b.FirstVisible);
        b.Scroll(99); Assert.Equal(b.Lines.Count - BubbleView.MaxLines, b.FirstVisible);
    }

    [Fact]
    public void Explicit_newlines_start_new_lines_and_empty_text_is_safe()
    {
        using var bubble = new BubbleView();
        Assert.Equal(new[] { "one", "two" }, bubble.Wrap("one\ntwo"));
        Assert.Single(bubble.Wrap(""));
    }
}

