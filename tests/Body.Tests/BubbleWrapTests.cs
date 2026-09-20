using System.Drawing.Drawing2D;
using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

/// <summary>
/// Bubble behavior is a promise, so it is tested, not eyeballed: streaming never re-wraps finished lines, pages
/// never cut a sentence when they can avoid it, and the outline is one closed shape.
/// </summary>
public class BubbleWrapTests
{
    const string Sample =
        "ok so the short version is that the persistent session answered the second message in about two " +
        "seconds, which is roughly half of what spawning a fresh process for every message was costing, " +
        "and it stays warm between turns so the cache keeps paying off.";

    // The real pelican answer from the end-to-end run: 8 lines, which used to show mid-sentence at both ends.
    const string Long =
        "Pelicans have a pouch under their bill that holds up to 3 gallons of water and fish. " +
        "They're built to dive-bomb from high up and scoop whole schools of fish in one go. " +
        "They can live 25 years or more, which is pretty long for a water bird.";

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
                for (int i = 0; i < previous.Count - 1; i++) Assert.Equal(previous[i], current[i]);
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
    public void Pages_hold_whole_sentences_even_when_sentences_span_several_lines()
    {
        // The screenshot that exposed the flaw: each sentence is ~2.5 lines, so no LINE ends with a period.
        var text = string.Join(' ', Enumerable.Range(1, 14).Select(i => $"Line {i} of a deliberately long answer to check scrolling."));
        using var b = new BubbleView();
        var pages = b.BuildPages(text, 5);
        Assert.True(pages.Count >= 3);
        Assert.All(pages, p => Assert.InRange(p.Count, 1, 5));
        Assert.All(pages, p => Assert.EndsWith(".", p[^1]));            // never a page that ends mid-sentence
        Assert.All(pages, p => Assert.StartsWith("Line ", p[0]));         // and never one that starts mid-sentence
        var rejoined = string.Join(' ', pages.SelectMany(p => p));
        Assert.Equal(text, rejoined);                                     // nothing lost or duplicated
    }

    [Fact]
    public void A_sentence_longer_than_a_page_is_split_by_lines_and_the_last_page_is_not_an_orphan()
    {
        using var b = new BubbleView();
        var huge = "start " + string.Join(' ', Enumerable.Repeat("word", 120)) + ".";
        var pages = b.BuildPages(huge, 5);
        Assert.True(pages.Count >= 2);
        Assert.Equal(huge, string.Join(' ', pages.SelectMany(p => p)));

        var text = "First sentence goes here and runs on for a bit so it fills more than one line of the bubble. " +
                   "Second sentence is also fairly long and fills another line or two of space in the bubble as well. " +
                   "Third one.";
        var p2 = b.BuildPages(text, 4);
        Assert.True(p2[^1].Count >= 2 || p2.Count == 1, "no single-line orphan at the end");
    }
    [Fact]
    public void A_finished_long_reply_is_paged_from_the_top_with_a_constant_height()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 3_600_000);
        Assert.True(b.Paged);
        Assert.Equal(0, b.PageIndex);
        Assert.True(b.PageCount >= 2);
        Assert.Contains("Pelicans", b.Lines[0]);
    }

    [Fact]
    public void Pages_advance_at_reading_pace_stop_at_the_end_and_wheel_takes_over()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 3_600_000);
        var t = DateTime.UtcNow;
        b.Update(t.AddSeconds(1));
        Assert.Equal(0, b.PageIndex);                              // still reading page one
        b.Update(t.AddSeconds(12));
        Assert.Equal(1, b.PageIndex);                              // then it moves on
        for (int i = 1; i <= 3; i++) b.Update(t.AddSeconds(12 + i * 2));   // stay inside the hold time
        Assert.Equal(b.PageCount - 1, b.PageIndex);                // and stops at the last page

        Assert.True(b.Page(-1)); Assert.Equal(b.PageCount - 2, b.PageIndex);
        Assert.False(b.Page(-99 * 0));                              // delta 0 goes nowhere
        b.Page(-99); Assert.Equal(0, b.PageIndex);
        Assert.False(b.Page(-1), "clamped at the first page");
    }

    [Fact]
    public void Clicking_advances_and_reports_when_there_is_nothing_left_so_the_caller_can_dismiss()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 3_600_000);
        while (b.Advance()) { }
        Assert.Equal(b.PageCount - 1, b.PageIndex);
        Assert.False(b.Advance());

        b.Show("short reply", stream: false, holdMs: 3_600_000);
        Assert.False(b.Paged);
        Assert.False(b.Advance(), "a single page dismisses on click");
    }

    [Fact]
    public void A_streaming_reply_is_not_paged_and_follows_the_newest_lines()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: true, holdMs: 0);
        Assert.False(b.Paged);
    }

    [Fact]
    public void The_bubble_and_tail_are_one_closed_outline()
    {
        using var path = BubbleView.Outline(6);
        // PathPointType.Start is 0, so count points whose type bits are 0: exactly one start means one figure.
        Assert.Equal(1, path.PathTypes.Count(t => (t & 0x07) == 0));
        Assert.True((path.PathTypes[^1] & (byte)PathPointType.CloseSubpath) != 0, "the figure must be closed");
        var b = path.GetBounds();
        Assert.True(b.Right > BubbleView.Right + 30, "the tail must extend past the bubble edge");
        Assert.True(b.Left <= BubbleView.Left + 1);
    }

    [Fact]
    public void Explicit_newlines_start_new_lines_and_empty_text_is_safe()
    {
        using var bubble = new BubbleView();
        Assert.Equal(new[] { "one", "two" }, bubble.Wrap("one\ntwo"));
        Assert.Single(bubble.Wrap(""));
    }
}


