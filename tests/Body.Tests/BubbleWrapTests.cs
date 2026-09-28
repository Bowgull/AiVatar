using System.Drawing.Drawing2D;
using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

/// <summary>
/// Bubble behavior is a promise, so it is tested, not eyeballed: streaming never re-wraps finished lines, a long
/// reply fills the bubble and waits with an arrow, clicking grows it, and the outline is one closed shape.
/// </summary>
public class BubbleWrapTests
{
    const string Sample =
        "ok so the short version is that the persistent session answered the second message in about two " +
        "seconds, which is roughly half of what spawning a fresh process for every message was costing, " +
        "and it stays warm between turns so the cache keeps paying off.";

    // Must wrap to MORE than CollapsedLines (6) at the WIDE bubble width, not the narrow one: Show() promotes
    // any reply over one line to Wide (2026-09-23, the line-length readability fix), so a fixture only needs
    // to be "long" is measured under the wide MaxW. Re-verify with ZZZ_diagnostic_wrap_count in this file if
    // LineH, MaxTextW, WideExtra or the body font ever change again (found 2026-09-24: the previous fixture
    // wrapped to 8 lines narrow but only 5 wide, so every test that depended on More/Expand/the long-hold
    // silently broke and nothing caught it because the suite did not compile - see BubbleView.Outline nearby).
    const string Long =
        "Pelicans have a pouch under their bill that holds up to 3 gallons of water and fish. " +
        "They're built to dive-bomb from high up and scoop whole schools of fish in one go. " +
        "They can live 25 years or more, which is pretty long for a water bird. " +
        "A colony can number in the thousands, and they fly in a tidy V to save energy on the long haul. " +
        "Brown pelicans dive from as high as 60 feet and fold their wings just before they hit the water.";

    static string VeryLong => string.Join(' ', Enumerable.Range(1, 40).Select(i => $"Sentence number {i} keeps going for a while."));

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
    public void A_short_reply_has_no_arrow_and_cannot_be_expanded()
    {
        using var b = new BubbleView();
        b.Show("short reply", stream: false, holdMs: 10_000);
        Assert.False(b.More);
        Assert.False(b.Expand());
    }

    [Fact]
    public void A_long_reply_fills_the_bubble_from_the_top_and_shows_the_arrow()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 10_000);
        Assert.True(b.More);
        Assert.False(b.Expanded);
        Assert.Equal(BubbleView.CollapsedLines, b.VisibleLineCount);
        Assert.Contains("Pelicans", b.Lines[0]);                   // starts at the first word
    }

    [Fact]
    public void The_last_visible_line_ends_in_an_ellipsis_and_leaves_room_for_the_arrow()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 10_000);
        var e = b.Ellipsize(b.Lines[BubbleView.CollapsedLines - 1]);
        Assert.EndsWith("...", e);
        using var bmp = new Bitmap(1, 1);
        using var g = Graphics.FromImage(bmp);
        // Must measure with the font and width BubbleView itself actually draws with, not a stand-in: the body
        // font moved from Bahnschrift to Atkinson Hyperlegible (2026-09-22, "never meant to run this small"),
        // and Ellipsize measures against the WIDE width whenever Show() promoted the bubble to Wide, not the
        // narrow MaxTextW constant. A mismatched font or width here checks nothing real (found 2026-09-24).
        using var font = Theme.Font(Theme.Face, Theme.BodyPx);
        var maxW = b.Wide ? BubbleView.MaxTextW + BubbleView.WideExtra : BubbleView.MaxTextW;
        Assert.True(g.MeasureString(e, font, PointF.Empty, StringFormat.GenericTypographic).Width <= maxW - 20,
            "the shortened line must leave room for the arrow");
    }

    [Fact]
    public void A_sentence_cut_at_its_full_stop_gets_three_dots_not_four()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 10_000);
        Assert.Equal("so I can't tell you the scene...", b.Ellipsize("so I can't tell you the scene."));
        Assert.Equal("wait, really?...", b.Ellipsize("wait, really?"));
    }

    [Fact]
    public void Nothing_turns_the_page_by_itself()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 10_000);
        var before = b.VisibleLineCount;
        b.Update(DateTime.UtcNow.AddSeconds(20));                   // still inside the long idle hold
        Assert.True(b.Visible);
        Assert.True(b.More);
        Assert.False(b.Expanded);
        Assert.Equal(before, b.VisibleLineCount);
        Assert.Equal(0, b.ScrollLine);
    }

    [Fact]
    public void A_waiting_reply_goes_away_only_after_a_long_idle_time()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 5_000);                  // the caller's short hold is extended for long replies
        b.Update(DateTime.UtcNow.AddSeconds(30));
        Assert.True(b.Visible);
        b.Update(DateTime.UtcNow.AddMinutes(2));
        Assert.False(b.Visible);
    }

    [Fact]
    public void Expanding_shows_everything_that_fits_and_collapsing_restores_the_small_bubble()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: false, holdMs: 10_000);
        Assert.True(b.Expand());
        Assert.True(b.Expanded);
        Assert.False(b.More);                                        // the arrow is gone once expanded
        Assert.Equal(Math.Min(b.Lines.Count, BubbleView.ExpandedLines), b.VisibleLineCount);
        Assert.False(b.CanScroll, "an 8-line reply fits in 12 lines: no scrollbar");

        Assert.True(b.Collapse());
        Assert.False(b.Expanded);
        Assert.True(b.More);
        Assert.False(b.Collapse(), "already collapsed");
    }

    [Fact]
    public void A_reply_longer_than_twelve_lines_scrolls_and_the_scroll_is_clamped()
    {
        using var b = new BubbleView();
        b.Show(VeryLong, stream: false, holdMs: 10_000);
        Assert.True(b.Lines.Count > BubbleView.ExpandedLines);
        Assert.True(b.Expand());
        Assert.True(b.CanScroll);
        Assert.Equal(0, b.ScrollLine);
        Assert.True(b.Scroll(3)); Assert.Equal(3, b.ScrollLine);
        b.Scroll(-99); Assert.Equal(0, b.ScrollLine);
        b.Scroll(9999); Assert.Equal(b.Lines.Count - BubbleView.ExpandedLines, b.ScrollLine);
        Assert.False(b.Scroll(1), "at the end");
    }

    [Fact]
    public void The_scrollbar_thumb_tracks_the_position_and_dragging_it_scrolls()
    {
        using var b = new BubbleView();
        b.Show(VeryLong, stream: false, holdMs: 10_000);
        b.Expand();
        for (int i = 0; i < 40; i++) b.Update(DateTime.UtcNow);       // let the height settle
        var top = b.Thumb;
        Assert.True(top.Height >= 24 && top.Height < b.Track.Height, "the thumb is a fraction of the track");
        b.Scroll(9999);
        Assert.True(b.Thumb.Y > top.Y, "the thumb moves down as we scroll");
        Assert.True(b.Thumb.Bottom <= b.Track.Bottom + 0.5f);

        b.ScrollToY(b.Track.Y);                                       // drag to the very top
        Assert.Equal(0, b.ScrollLine);
        b.ScrollToY(b.Track.Bottom);                                  // and to the very bottom
        Assert.Equal(b.Lines.Count - BubbleView.ExpandedLines, b.ScrollLine);
        Assert.True(b.HitThumb(b.Thumb.X + 2, b.Thumb.Y + 5));
        Assert.False(b.HitThumb(10, 10));
    }

    [Fact]
    public void A_streaming_reply_is_never_collapsed_with_an_arrow()
    {
        using var b = new BubbleView();
        b.Show(Long, stream: true, holdMs: 0);
        Assert.False(b.More);
        Assert.False(b.Expand());
    }

    [Fact]
    public void The_bubble_and_tail_are_one_closed_outline()
    {
        using var bubble = new BubbleView();
        using var path = bubble.Outline(6);
        // PathPointType.Start is 0, so count points whose type bits are 0: exactly one start means one figure.
        Assert.Equal(1, path.PathTypes.Count(t => (t & 0x07) == 0));
        Assert.True((path.PathTypes[^1] & (byte)PathPointType.CloseSubpath) != 0, "the figure must be closed");
        var bounds = path.GetBounds();
        Assert.True(bounds.Right > BubbleView.Right + 30, "the tail must extend past the bubble edge");
        Assert.True(bounds.Left <= BubbleView.Left + 1);
    }

    [Fact]
    public void Explicit_newlines_start_new_lines_and_empty_text_is_safe()
    {
        using var bubble = new BubbleView();
        Assert.Equal(new[] { "one", "two" }, bubble.Wrap("one\ntwo"));
        Assert.Single(bubble.Wrap(""));
    }

    // present_list (2026-09-24): a reply can carry a short list of rows alongside its own prose, rendered
    // below the text rather than as dashes inside it.
    [Fact]
    public void Setting_Rows_grows_the_bubble_to_fit_them()
    {
        using var b = new BubbleView();
        b.Show("Three worth your time.", stream: false, holdMs: 10_000);
        var now = DateTime.UtcNow;
        for (int i = 0; i < 50; i++) b.Update(now);      // let shownH converge on targetH
        var plainTop = b.CurrentTop;

        b.Rows = new BubbleRows { Icon = "job", Items = { new BubbleRow { Title = "Senior CSM", Subtitle = "Shopify" } } };
        for (int i = 0; i < 50; i++) b.Update(now);
        var withRowsTop = b.CurrentTop;

        // The bubble grows UPWARD from Bottom, so a taller bubble has a SMALLER (higher on screen) top.
        Assert.True(withRowsTop < plainTop, "a bubble with rows must be taller than the same text without them");
    }

    [Fact]
    public void A_genuinely_new_reply_starts_with_no_carried_over_list()
    {
        using var b = new BubbleView();
        b.Show("Three worth your time.", stream: false, holdMs: 10_000);
        b.Rows = new BubbleRows { Icon = "job", Items = { new BubbleRow { Title = "Senior CSM" } } };
        Assert.NotNull(b.Rows);

        b.Show("Something unrelated entirely.", stream: false, holdMs: 10_000);   // does not start with the old text
        Assert.Null(b.Rows);
    }

    [Fact]
    public void Clear_drops_the_list_along_with_everything_else()
    {
        using var b = new BubbleView();
        b.Show("Three worth your time.", stream: false, holdMs: 10_000);
        b.Rows = new BubbleRows { Icon = "job", Items = { new BubbleRow { Title = "Senior CSM" } } };
        b.Clear();
        Assert.Null(b.Rows);
    }
}
