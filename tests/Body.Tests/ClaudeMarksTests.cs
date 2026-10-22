using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

/// <summary>
/// C5 (2026-10-21): the marks over his head and the chimes' volume. The art is lifted from sheets 45d/45e, so these
/// check the maps stayed whole and the palette exact, and write one picture of every mark at its real size over his
/// real head (tests/out/claude-marks.png, scaled up by a whole number) for looking at, not for eyeballing a pass.
/// </summary>
public class ClaudeMarksTests
{
    static readonly string[] Kinds = { "working", "permission", "question", "plan", "step", "complete", "done", "paused", "failed" };

    [Fact]
    public void Every_mark_is_a_whole_grid_of_palette_pixels()
    {
        foreach (var k in Kinds)
        {
            Assert.True(ClaudeMarks.Known(k), k);
            var m = ClaudeMarks.Map(k);
            Assert.All(m, row => Assert.Equal(m[0].Length, row.Length));
            Assert.All(m, row => Assert.Matches("^[.OHFSW]+$", row));
        }
        // The step tick is the small one; the job-complete tick is bigger, but not huge (his "not too large").
        Assert.True(ClaudeMarks.Map("step").Length < ClaudeMarks.Map("complete").Length);
        Assert.True(ClaudeMarks.Map("complete").Length <= 16);
        Assert.False(ClaudeMarks.Known("none"));
    }

    // 2026-10-22 (his pick): the unread tick is the job-complete tick, teal, steady, and never glows.
    [Fact]
    public void Done_is_the_teal_tick_with_no_glow()
    {
        Assert.Equal(ClaudeMarks.Map("complete"), ClaudeMarks.Map("done"));
        Assert.Equal(Color.FromArgb(0x3f, 0xc4, 0xb4).ToArgb(), ClaudeMarks.ColorOf("done").ToArgb());
        Assert.False(ClaudeMarks.Glows("done"));
        Assert.True(ClaudeMarks.Glows("complete"));
    }

    [Fact]
    public void Drawn_crisp_every_colour_is_from_the_palette()
    {
        using var bmp = new Bitmap(80, 80, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) ClaudeMarks.Draw(g, "question", 40, 70, 3);
        var c = ClaudeMarks.ColorOf("question");
        int face = 0;
        for (int y = 0; y < 80; y++) for (int x = 0; x < 80; x++)
        {
            var p = bmp.GetPixel(x, y);
            if (p.A == 255 && p.ToArgb() == c.ToArgb()) face++;
        }
        Assert.True(face > 0, "the face colour is drawn exactly, no blending");
        Assert.Contains(Color.FromArgb(42, 26, 16).ToArgb(), Enumerable.Range(0, 80 * 80).Select(i => bmp.GetPixel(i % 80, i / 80).ToArgb()));
        Assert.Equal(3, ClaudeMarks.PxFor(1f));
        Assert.Equal(4, ClaudeMarks.PxFor(1.25f));
        Assert.Equal(5, ClaudeMarks.PxFor(1.5f));
    }

    [Fact]
    public void Volume_scales_the_samples_and_leaves_the_header()
    {
        var wav = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "sfx", "chimes", "step.wav"));
        var half = Chimes.Scaled(wav, 50);
        Assert.Equal(wav.Length, half.Length);
        Assert.Equal(wav.Take(44), half.Take(44));
        // The loudest sample, roughly halved.
        short Peak(byte[] b) { short m = 0; for (int i = 44; i + 1 < b.Length; i += 2) { var s = (short)(b[i] | (b[i + 1] << 8)); if (Math.Abs((int)s) > Math.Abs((int)m)) m = s; } return m; }
        Assert.InRange(Math.Abs((int)Peak(half)), Math.Abs((int)Peak(wav)) / 2 - 1, Math.Abs((int)Peak(wav)) / 2 + 1);
        foreach (var n in Chimes.Names)
            Assert.True(File.Exists(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "sfx", "chimes", n + ".wav")), n);
    }

    [Fact]
    public void Picture_of_every_mark_over_his_head()
    {
        using var frame = new Bitmap(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "frames", "idle_0.png"));
        var art = Docking.ArtBox(frame);
        const int Crop = 150, Top = 20, Zoom = 3;                    // his head and shoulders, at a whole-number zoom
        using var sheet = new Bitmap(Kinds.Length * Crop, Crop, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(sheet))
        {
            g.Clear(Color.FromArgb(18, 12, 26));
            for (int i = 0; i < Kinds.Length; i++)
            {
                int ox = i * Crop - (int)(art.X + art.Width / 2f - Crop / 2f), oy = -Top;
                g.SetClip(new Rectangle(i * Crop, 0, Crop, Crop));
                g.DrawImage(frame, ox, oy, frame.Width, frame.Height);
                var at = ClaudeMarks.AboveHead(art, false);
                ClaudeMarks.Draw(g, Kinds[i], ox + (int)Math.Round(at.X), oy + (int)Math.Round(at.Y), ClaudeMarks.PxFor(1f));
                g.ResetClip();
            }
        }
        using var big = new Bitmap(sheet.Width * Zoom, sheet.Height * Zoom, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(big))
        {
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(sheet, 0, 0, big.Width, big.Height);
        }
        var dir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "out"));
        Directory.CreateDirectory(dir);
        big.Save(Path.Combine(dir, "claude-marks.png"), ImageFormat.Png);
        // The mark sits just above his head: its bottom is within a few pixels of the top of his art.
        Assert.InRange(art.Y - ClaudeMarks.AboveHead(art, false).Y, 6, 12);
    }

    // 2026-10-21: the click on a mark is worked out in the pet from the same sums the mark is drawn with. These check
    // the box covers every pixel drawn (bob and all), and never his head, standing and tucked at each edge.
    static readonly Rectangle Art = new(80, 40, 60, 160);   // a stand-in for Docking.ArtBox, in frame pixels

    /// <summary>Every painted pixel of a mark drawn at (cx, bottom), shifted by (sx, sy), in window pixels.</summary>
    static List<Point> Painted(string kind, int cx, int bottom, int px, int sx, int sy)
    {
        int w = Docking.Margin + PetWindow.W * 2, h = (PetWindow.H + PetWindow.Extra) * 2;
        using var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) ClaudeMarks.Draw(g, kind, cx + sx, bottom + sy, px);
        var r = ClaudeMarks.HitBox(kind, cx, bottom, px);
        var pts = new List<Point>();
        for (int y = Math.Max(0, r.Top - 4 * px); y < Math.Min(h, r.Bottom + 4 * px); y++)
            for (int x = Math.Max(0, r.Left - 4 * px); x < Math.Min(w, r.Right + 4 * px); x++)
                if (bmp.GetPixel(x, y).A > 0) pts.Add(new Point(x, y));
        return pts;
    }

    /// <summary>His head's box in window pixels: the turned art, as DrawPeeking / the standing draw place it.</summary>
    static Rectangle Head(DockEdge edge, float scale)
    {
        var r = Docking.Rotated(Art, edge);
        return Rectangle.FromLTRB((int)Math.Round((Docking.Margin + Docking.SpriteX + r.Left) * scale), (int)Math.Round((PetWindow.Extra + Docking.SpriteY + r.Top) * scale),
            (int)Math.Round((Docking.Margin + Docking.SpriteX + r.Right) * scale), (int)Math.Round((PetWindow.Extra + Docking.SpriteY + r.Bottom) * scale));
    }

    [Theory]
    [InlineData(1f)]
    [InlineData(1.25f)]
    [InlineData(1.5f)]
    public void Standing_mark_click_box_covers_the_drawing_and_not_his_head(float scale)
    {
        var (cx, bottom, bx, by) = ClaudeMarks.Anchor("working", Art, false, DockEdge.None, scale, Docking.Margin, PetWindow.Extra);
        Assert.Equal((0, -1), (bx, by));
        Assert.Equal((int)Math.Round((Docking.Margin + Docking.SpriteX + Art.X + Art.Width / 2f) * scale), cx);
        Assert.Equal((int)Math.Round((PetWindow.Extra + Docking.SpriteY + Art.Y - ClaudeMarks.Gap) * scale), bottom);
        int px = ClaudeMarks.PxFor(scale);
        var box = ClaudeMarks.HitBox("working", cx, bottom, px, bx, by);
        // At rest and bobbed one art pixel up: every drawn pixel is clickable (the 0.3 s pop-in is left out on purpose).
        foreach (var dy in new[] { 0, -px })
            Assert.All(Painted("working", cx, bottom, px, 0, dy), p => Assert.True(box.Contains(p), $"{p} outside {box} (dy {dy})"));
        Assert.False(box.IntersectsWith(Head(DockEdge.None, scale)), $"{box} reaches his head {Head(DockEdge.None, scale)}");
        Assert.True(box.Contains(cx, bottom - 4 * px));
        Assert.False(box.Contains(cx, Head(DockEdge.None, scale).Top + 1));
        // Walking left mirrors him, and the mark with him.
        var (fx, _, _, _) = ClaudeMarks.Anchor("working", Art, true, DockEdge.None, scale, Docking.Margin, PetWindow.Extra);
        Assert.Equal((int)Math.Round((Docking.Margin + Docking.SpriteX + Docking.Frame - (Art.X + Art.Width / 2f)) * scale), fx);
    }

    [Theory]
    [InlineData("Bottom", 1f)]
    [InlineData("Bottom", 1.5f)]
    [InlineData("Left", 1f)]
    [InlineData("Right", 1.25f)]
    [InlineData("Top", 1f)]
    public void Tucked_mark_click_box_covers_the_drawing_and_not_his_head(string edgeName, float scale)
    {
        var edge = Docking.Parse(edgeName);   // DockEdge is internal, so the cases name it
        foreach (var kind in new[] { "working", "permission", "question" })
        {
            var (cx, bottom, bx, by) = ClaudeMarks.Anchor(kind, Art, false, edge, scale, Docking.Margin, PetWindow.Extra);
            int px = ClaudeMarks.PxFor(scale);
            var box = ClaudeMarks.HitBox(kind, cx, bottom, px, bx, by);
            // At rest and bobbed one art pixel away from his head.
            foreach (var k in new[] { 0, 1 })
                Assert.All(Painted(kind, cx, bottom, px, bx * k * px, by * k * px), p => Assert.True(box.Contains(p), $"{kind} {edge}: {p} outside {box} (k {k})"));
            var head = Head(edge, scale);
            Assert.False(box.IntersectsWith(head), $"{kind} {edge}: {box} reaches his head {head}");
        }
        // Tucked at the bottom it sits where it does standing: over the top of his head.
        if (edge == DockEdge.Bottom)
            Assert.Equal(ClaudeMarks.Anchor("working", Art, false, DockEdge.None, scale, Docking.Margin, PetWindow.Extra),
                         ClaudeMarks.Anchor("working", Art, false, DockEdge.Bottom, scale, Docking.Margin, PetWindow.Extra));
    }
}
