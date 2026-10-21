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
    static readonly string[] Kinds = { "working", "permission", "question", "plan", "step", "complete", "paused", "failed" };

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
        // The step tick is the small one; the job-complete seal is bigger, but not huge (his "not too large").
        Assert.True(ClaudeMarks.Map("step").Length < ClaudeMarks.Map("complete").Length);
        Assert.True(ClaudeMarks.Map("complete").Length <= 16);
        Assert.False(ClaudeMarks.Known("none"));
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
}
