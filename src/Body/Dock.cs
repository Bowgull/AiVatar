using System.Drawing;
using System.Drawing.Imaging;

namespace Aang.Body;

enum DockEdge { None, Left, Right, Top, Bottom }

/// <summary>
/// Docking to a screen edge: where the window has to be so that only Aang's head and shoulders show, and where it has to
/// be so that he stands out at the edge again. Pure arithmetic, so it can be checked without a screen
/// (`Aang.exe --selftest-dock`).
///
/// The sprite is never redrawn. At an edge he is turned by exactly 90 or 180 degrees with RotateFlip, which moves each
/// pixel to another pixel and changes none, drawn with nearest-neighbour like every other frame. The art's bounding box
/// is found once from a real frame, and these functions move it through the same turn.
/// </summary>
static class Docking
{
    /// <summary>Where the sprite frame sits in the window, before the headroom (see PetWindow.Extra), and its size.</summary>
    public const int SpriteX = 246, SpriteY = 86, Frame = 224;
    /// <summary>How much of him shows when docked, and when he has something to say (unscaled pixels, measured along the turn).</summary>
    public const int PeekPx = 56, PeekMorePx = 90;
    /// <summary>Dragging him within this of an edge docks him there.</summary>
    public const int SnapPx = 24;
    /// <summary>The collapsed bubble reaches this far above the old window top: it must stay on screen when he stands at an edge.</summary>
    public const int BubbleAboveOldTop = 124 - 150;

    public static DockEdge Parse(string? s) => Enum.TryParse<DockEdge>(s, true, out var e) ? e : DockEdge.None;
    public static string Name(DockEdge e) => e == DockEdge.None ? "" : e.ToString().ToLowerInvariant();

    /// <summary>Head towards the middle of the screen: left edge turns him clockwise, right anticlockwise, top upside down.</summary>
    public static RotateFlipType Rotation(DockEdge e) => e switch
    {
        DockEdge.Left => RotateFlipType.Rotate90FlipNone,
        DockEdge.Right => RotateFlipType.Rotate270FlipNone,
        DockEdge.Top => RotateFlipType.Rotate180FlipNone,
        _ => RotateFlipType.RotateNoneFlipNone,
    };

    /// <summary>The smallest box holding every visible pixel of a frame, in frame coordinates.</summary>
    public static Rectangle ArtBox(Bitmap frame)
    {
        var data = frame.LockBits(new Rectangle(0, 0, frame.Width, frame.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
        int minX = frame.Width, minY = frame.Height, maxX = -1, maxY = -1;
        try
        {
            var row = new byte[Math.Abs(data.Stride)];
            for (int y = 0; y < frame.Height; y++)
            {
                System.Runtime.InteropServices.Marshal.Copy(data.Scan0 + y * data.Stride, row, 0, row.Length);
                for (int x = 0; x < frame.Width; x++)
                    if (row[x * 4 + 3] > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
            }
        }
        finally { frame.UnlockBits(data); }
        return maxX < 0 ? new Rectangle(0, 0, frame.Width, frame.Height) : new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
    }

    /// <summary>The same box after the edge's turn.</summary>
    public static Rectangle Rotated(Rectangle b, DockEdge e) => e switch
    {
        DockEdge.Left => new Rectangle(Frame - b.Y - b.Height, b.X, b.Height, b.Width),          // 90 clockwise: (x, y) -> (N-1-y, x)
        DockEdge.Right => new Rectangle(b.Y, Frame - b.X - b.Width, b.Height, b.Width),          // 90 anticlockwise: (x, y) -> (y, N-1-x)
        DockEdge.Top => new Rectangle(Frame - b.X - b.Width, Frame - b.Y - b.Height, b.Width, b.Height),
        _ => b,
    };

    /// <summary>Where a box in frame coordinates lands on the screen, for a window at <paramref name="win"/>.</summary>
    public static Rectangle OnScreen(Point win, Rectangle box, int extra, float scale) => new(
        win.X + (int)Math.Round((SpriteX + box.X) * scale), win.Y + (int)Math.Round((SpriteY + extra + box.Y) * scale),
        (int)Math.Round(box.Width * scale), (int)Math.Round(box.Height * scale));

    static double Along(DockEdge e, double frac, Rectangle wa) => e is DockEdge.Left or DockEdge.Right ? wa.Top + frac * wa.Height : wa.Left + frac * wa.Width;

    /// <summary>The window position that leaves exactly <paramref name="peek"/> pixels of him showing past the edge.</summary>
    public static Point PeekWindow(DockEdge e, double frac, Rectangle wa, Rectangle upright, int extra, float s, int peek)
    {
        var r = Rotated(upright, e);
        double p = peek * s, sx = SpriteX + r.X, sy = SpriteY + extra + r.Y, along = Along(e, frac, wa);
        double x, y;
        switch (e)
        {
            case DockEdge.Bottom: y = wa.Bottom - p - sy * s; x = along - (SpriteX + r.X + r.Width / 2.0) * s; break;
            case DockEdge.Top: y = wa.Top + p - (sy + r.Height) * s; x = along - (SpriteX + r.X + r.Width / 2.0) * s; break;
            case DockEdge.Right: x = wa.Right - p - sx * s; y = along - (sy + r.Height / 2.0) * s; break;
            default: x = wa.Left + p - (sx + r.Width) * s; y = along - (sy + r.Height / 2.0) * s; break;           // Left
        }
        return new Point((int)Math.Round(x), (int)Math.Round(y));
    }

    /// <summary>
    /// The window position for standing at the edge, upright. At the left and top the bubble (which sits to his left and
    /// above) would be off screen, so those are pushed in just far enough to keep a normal bubble visible.
    /// </summary>
    public static Point StandWindow(DockEdge e, double frac, Rectangle wa, Rectangle upright, int extra, float s)
    {
        double sx = SpriteX + upright.X, sy = SpriteY + extra + upright.Y, along = Along(e, frac, wa);
        double x, y;
        switch (e)
        {
            case DockEdge.Bottom: y = wa.Bottom - (sy + upright.Height) * s; x = along - (SpriteX + upright.X + upright.Width / 2.0) * s; break;
            case DockEdge.Top: y = wa.Top - sy * s; x = along - (SpriteX + upright.X + upright.Width / 2.0) * s; break;
            case DockEdge.Right: x = wa.Right - (sx + upright.Width) * s; y = along - (sy + upright.Height / 2.0) * s; break;
            default: x = wa.Left - sx * s; y = along - (sy + upright.Height / 2.0) * s; break;                        // Left
        }
        x = Math.Max(x, wa.Left - 6 * s);
        y = Math.Max(y, wa.Top - (extra + BubbleAboveOldTop) * s);
        return new Point((int)Math.Round(x), (int)Math.Round(y));
    }

    /// <summary>Which edge, if any, the art is within <paramref name="snap"/> pixels of. The bottom only when asked: he already stands there.</summary>
    public static DockEdge Nearest(Rectangle art, Rectangle wa, int snap, bool allowBottom)
    {
        var best = DockEdge.None; int bestD = int.MaxValue;
        void Try(DockEdge e, int d) { if (d <= snap && d < bestD) { best = e; bestD = d; } }
        Try(DockEdge.Left, art.Left - wa.Left);
        Try(DockEdge.Right, wa.Right - art.Right);
        Try(DockEdge.Top, art.Top - wa.Top);
        if (allowBottom) Try(DockEdge.Bottom, wa.Bottom - art.Bottom);
        return best;
    }

    /// <summary>How far along the edge his middle is, 0 to 1, kept off the very corners.</summary>
    public static double Fraction(DockEdge e, Rectangle art, Rectangle wa) =>
        Math.Clamp(e is DockEdge.Left or DockEdge.Right ? (art.Top + art.Height / 2.0 - wa.Top) / Math.Max(1, wa.Height) : (art.Left + art.Width / 2.0 - wa.Left) / Math.Max(1, wa.Width), 0.04, 0.96);

    // ------------------------------------------------------------------ self test

    /// <summary>`Aang.exe --selftest-dock`: prints one line per check and returns the number that failed.</summary>
    public static int SelfTest(TextWriter o)
    {
        int bad = 0;
        void Check(string name, bool ok, string detail = "") { o.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}{(detail.Length > 0 && !ok ? "  " + detail : "")}"); if (!ok) bad++; }

        // 1. The box maths against what RotateFlip really does to pixels.
        var box = new Rectangle(70, 60, 88, 150);
        foreach (var e in new[] { DockEdge.Bottom, DockEdge.Left, DockEdge.Right, DockEdge.Top })
        {
            using var bmp = new Bitmap(Frame, Frame, PixelFormat.Format32bppPArgb);
            using (var g = Graphics.FromImage(bmp)) { g.Clear(Color.Transparent); g.FillRectangle(Brushes.White, box); g.FillRectangle(Brushes.White, box.X + 3, box.Y + 3, 10, 10); }
            bmp.RotateFlip(Rotation(e));
            var found = ArtBox(bmp); var expected = Rotated(box, e);
            Check($"the {Name(e).PadRight(6)} turn moves the art box exactly where RotateFlip does", found == expected, $"found {found}, expected {expected}");
        }
        // Turning by exactly 90 or 180 must change no pixel value, only positions: count colours before and after.
        using (var src = new Bitmap(Frame, Frame, PixelFormat.Format32bppPArgb))
        {
            var rnd = new Random(7);
            for (int i = 0; i < 400; i++) src.SetPixel(rnd.Next(Frame), rnd.Next(Frame), Color.FromArgb(255, rnd.Next(256), rnd.Next(256), rnd.Next(256)));
            long Sum(Bitmap b) { long s = 0; for (int y = 0; y < b.Height; y++) for (int x = 0; x < b.Width; x++) s += b.GetPixel(x, y).ToArgb(); return s; }
            var before = Sum(src);
            bool same = true;
            foreach (var e in new[] { DockEdge.Left, DockEdge.Right, DockEdge.Top }) { using var c = (Bitmap)src.Clone(); c.RotateFlip(Rotation(e)); if (Sum(c) != before) same = false; }
            Check("turning him changes no pixel, it only moves them", same);
        }

        // 2. On a 1920x1080 screen at 150%, exactly the peek shows, on every edge.
        var wa = new Rectangle(0, 0, 1920, 1080); float s = 1.5f; const int extra = 168;
        foreach (var e in new[] { DockEdge.Bottom, DockEdge.Left, DockEdge.Right, DockEdge.Top })
        {
            var win = PeekWindow(e, 0.4, wa, box, extra, s, PeekPx);
            var art = OnScreen(win, Rotated(box, e), extra, s);
            var visible = Rectangle.Intersect(art, wa);
            int shown = e is DockEdge.Left or DockEdge.Right ? visible.Width : visible.Height;
            Check($"docked at the {Name(e).PadRight(6)} exactly {PeekPx} px of him shows", Math.Abs(shown - PeekPx * s) <= 1.5, $"showing {shown}, wanted {PeekPx * s}");
            double frac = Fraction(e, art, wa);
            Check($"…and his place along the {Name(e)} edge round-trips", Math.Abs(frac - 0.4) < 0.01, $"fraction {frac}");
            Check($"…and dragging him there snaps to the {Name(e)}", Nearest(art, wa, (int)(SnapPx * s), true) == e, $"got {Nearest(art, wa, (int)(SnapPx * s), true)}");
        }
        Check("the more-to-say peek shows more of him", Rectangle.Intersect(OnScreen(PeekWindow(DockEdge.Right, 0.5, wa, box, extra, s, PeekMorePx), Rotated(box, DockEdge.Right), extra, s), wa).Width > (int)(PeekPx * s));

        // 3. Standing at the edge: on screen, touching the edge on the right and bottom, and the bubble is not lost off the left or top.
        foreach (var e in new[] { DockEdge.Bottom, DockEdge.Right })
        {
            var win = StandWindow(e, 0.5, wa, box, extra, s); var art = OnScreen(win, box, extra, s);
            int gap = e == DockEdge.Bottom ? wa.Bottom - art.Bottom : wa.Right - art.Right;
            Check($"standing at the {Name(e).PadRight(6)} edge he touches it", Math.Abs(gap) <= 1, $"gap {gap}");
        }
        foreach (var e in new[] { DockEdge.Left, DockEdge.Top })
        {
            var win = StandWindow(e, 0.5, wa, box, extra, s);
            var bubbleLeft = win.X + 6 * s; var bubbleTop = win.Y + (extra + BubbleAboveOldTop) * s;
            Check($"standing at the {Name(e).PadRight(6)} edge his bubble stays on screen", bubbleLeft >= wa.Left - 1 && bubbleTop >= wa.Top - 1, $"bubble at {bubbleLeft:0},{bubbleTop:0}");
        }
        Check("the bottom is not snapped to unless asked", Nearest(OnScreen(StandWindow(DockEdge.Bottom, 0.5, wa, box, extra, s), box, extra, s), wa, 24, false) == DockEdge.None);
        Check("a place in the middle of the screen snaps to nothing", Nearest(new Rectangle(800, 400, 130, 220), wa, 24, true) == DockEdge.None);
        Check("the nearer of two edges wins in a corner", Nearest(new Rectangle(10, 5, 130, 220), wa, 24, false) == DockEdge.Top);
        Check("fractions are kept off the corners", Fraction(DockEdge.Right, new Rectangle(1800, 0, 100, 100), wa) >= 0.04 && Fraction(DockEdge.Right, new Rectangle(1800, 1000, 100, 100), wa) <= 0.96);
        return bad;
    }
}
