using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using Aang.Body;
using Xunit;

namespace Aang.Body.Tests;

/// <summary>
/// 2026-10-21: his aura, take "A · soft falloff" from sheet 51. Checks the halo is built once per frame and colour
/// (he plays WoW, so nothing heavy per tick), that it is a haze fading with distance and not a ring, and that the
/// breath never goes fully off. Writes tests/out/aura-soft.png (his idle frame, four colours, three breath phases,
/// 3x whole pixels) for looking at next to the sheet's A tiles.
/// </summary>
public class AuraTests
{
    static Bitmap Square()
    {
        var b = new Bitmap(60, 60, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(b);
        g.FillRectangle(Brushes.White, 20, 20, 20, 20);
        return b;
    }

    static Bitmap Render(Bitmap sprite, Color c, float radius, float intensity, int pad = 22)
    {
        var canvas = new Bitmap(sprite.Width + pad * 2, sprite.Height + pad * 2, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(canvas);
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = PixelOffsetMode.Half;
        var at = new Rectangle(pad, pad, sprite.Width, sprite.Height);
        Aura.Draw(g, Aura.For(sprite, RotateFlipType.RotateNoneFlipNone, c), sprite, at, radius, intensity);
        return canvas;
    }

    [Fact]
    public void The_halo_for_a_frame_is_built_once_and_reused()
    {
        using var s = Square();
        var a = Aura.For(s, RotateFlipType.RotateNoneFlipNone, Color.FromArgb(0x7c, 0xc4, 0xff));
        var b = Aura.For(s, RotateFlipType.RotateNoneFlipNone, Color.FromArgb(0x7c, 0xc4, 0xff));
        Assert.Same(a, b);
        Assert.Same(a.Bitmap, b.Bitmap);
        // A different colour or turn is its own halo.
        Assert.NotSame(a, Aura.For(s, RotateFlipType.RotateNoneFlipNone, Color.FromArgb(0x3f, 0xc4, 0xb4)));
        Assert.NotSame(a, Aura.For(s, RotateFlipType.RotateNoneFlipX, Color.FromArgb(0x7c, 0xc4, 0xff)));
    }

    [Fact]
    public void Alpha_falls_off_with_distance_like_a_haze()
    {
        using var s = Square();
        // At the top of the breath: 12 px reach, 0.9 at his edge (the sheet's A at ph = 1).
        using var img = Render(s, Color.FromArgb(0x7c, 0xc4, 0xff), 12f, 0.9f);
        // The square's right edge is at x = 39 in the sprite, so x = 22 + 39 + d is d px out from it.
        int Alpha(int d) => img.GetPixel(22 + 39 + d, 22 + 30).A;
        int at2 = Alpha(2), at6 = Alpha(6), at10 = Alpha(10), at14 = Alpha(14);
        Assert.True(at2 > at6 && at6 > at10, $"2px {at2}, 6px {at6}, 10px {at10}");
        Assert.True(at10 > 0, "the tail is still there at 10 px");
        Assert.Equal(0, at14);                                   // and gone past the 12 px reach
        // Close to the sheet's curve: 0.9*(1-2/12)^1.8 = 0.65 and 0.9*(1-10/12)^1.8 = 0.036 (within ~0.07).
        Assert.InRange(at2 / 255.0, 0.58, 0.72);
        Assert.InRange(at10 / 255.0, 0.0, 0.10);
        // No hard ring: neighbouring pixels never jump by more than a gentle step.
        for (int d = 1; d < 13; d++) Assert.True(Math.Abs(Alpha(d) - Alpha(d + 1)) < 50, $"step at {d}px");
        // His own pixels stay empty in the halo (it is only ever behind/outside him).
        Assert.Equal(0, img.GetPixel(22 + 30, 22 + 30).A);
    }

    [Fact]
    public void The_breath_never_goes_off()
    {
        using var s = Square();
        float minR = 99, minI = 99, maxR = 0, maxI = 0;
        for (double t = 0; t < 8; t += 0.05)
        {
            var (r, i) = Aura.Breath(t);
            minR = Math.Min(minR, r); minI = Math.Min(minI, i); maxR = Math.Max(maxR, r); maxI = Math.Max(maxI, i);
        }
        Assert.InRange(minR, 8.9f, 9.1f); Assert.InRange(maxR, 12.9f, 13.1f);   // brightened 2026-10-22
        Assert.InRange(minI, 0.67f, 0.69f); Assert.InRange(maxI, 0.99f, 1.01f);
        // At its lowest, it is still clearly there next to him.
        var (lr, li) = Aura.Breath(0);
        using var low = Render(s, Color.FromArgb(0x7c, 0xc4, 0xff), lr, li);
        Assert.True(low.GetPixel(22 + 39 + 2, 22 + 30).A > 60);
        // The burst never goes off either: its flicker dips to half, and it lands in the same breath.
        for (double ms = 0; ms < 3000; ms += 10)
        {
            var (br, bi) = Aura.Burst(ms, 1.0, x => x);
            Assert.True(bi >= 0.5f && br >= 8f, $"burst at {ms}ms: {br}px {bi}");
        }
        var settled = Aura.Burst(5000, 1.0, x => x);
        Assert.Equal(Aura.Breath(1.0).Radius, settled.Radius, 3);
        Assert.Equal(Aura.Breath(1.0).Intensity, settled.Intensity, 3);
    }

    [Fact]
    public void Writes_a_picture_of_the_soft_aura()
    {
        using var frame = new Bitmap(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "frames", "idle_0.png"));
        var cols = new[] { "#7cc4ff", "#b07cff", "#3fc4b4", "#ffb35a" }.Select(ColorTranslator.FromHtml).ToArray();
        var phases = new[] { 0.0, 0.5, 1.0 };                  // breath low, middle, top
        const int pad = 22, sc = 3, gap = 6;
        // The sheet's tile crop: his bounding box plus 20 px, 10 more on top.
        int x0 = 999, y0 = 999, x1 = 0, y1 = 0;
        for (int y = 0; y < frame.Height; y++) for (int x = 0; x < frame.Width; x++)
            if (frame.GetPixel(x, y).A > 20) { x0 = Math.Min(x0, x); y0 = Math.Min(y0, y); x1 = Math.Max(x1, x); y1 = Math.Max(y1, y); }
        var crop = new Rectangle(pad + x0 - 20, pad + y0 - 30, x1 - x0 + 41, y1 - y0 + 51);
        using var sheet = new Bitmap(phases.Length * (crop.Width * sc + gap) + gap, cols.Length * (crop.Height * sc + gap) + gap, PixelFormat.Format32bppArgb);
        using (var sg = Graphics.FromImage(sheet))
        {
            sg.Clear(ColorTranslator.FromHtml("#1c1a18"));
            sg.InterpolationMode = InterpolationMode.NearestNeighbor;
            sg.PixelOffsetMode = PixelOffsetMode.Half;
            for (int r = 0; r < cols.Length; r++)
                for (int p = 0; p < phases.Length; p++)
                {
                    var (rad, inten) = Aura.Breath(phases[p] * 2.0);   // ph = (1-cos(2*pi*t/4))/2: t = 0, 1, 2 s
                    using var tile = new Bitmap(frame.Width + pad * 2, frame.Height + pad * 2, PixelFormat.Format32bppArgb);
                    using (var tg = Graphics.FromImage(tile))
                    {
                        tg.Clear(ColorTranslator.FromHtml("#0e0c0b"));
                        tg.InterpolationMode = InterpolationMode.NearestNeighbor;
                        tg.PixelOffsetMode = PixelOffsetMode.Half;
                        var at = new Rectangle(pad, pad, frame.Width, frame.Height);
                        Aura.Draw(tg, Aura.For(frame, RotateFlipType.RotateNoneFlipNone, cols[r]), frame, at, rad, inten);
                        tg.DrawImage(frame, at);
                    }
                    var dest = new Rectangle(gap + p * (crop.Width * sc + gap), gap + r * (crop.Height * sc + gap), crop.Width * sc, crop.Height * sc);
                    sg.DrawImage(tile, dest, crop, GraphicsUnit.Pixel);
                }
        }
        var dir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "out"));
        Directory.CreateDirectory(dir);
        sheet.Save(Path.Combine(dir, "aura-soft.png"), ImageFormat.Png);
    }
}
