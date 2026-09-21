using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>
/// A picture of the window Joshua is in, for the questions text cannot answer: a game, a drawing, "does this
/// look right". The text read (AangReader) comes first and answers most things for a tenth of the cost; this
/// is the fallback, and only ever on request.
///
/// Only that window, never the whole screen. Aang's own windows are excluded from the capture while it is
/// taken, so he never shows up in his own pictures. Downscaled to 1280 on the long side and sent as JPEG:
/// about 1,200 tokens, where a full 1440p screenshot would be several times that.
/// </summary>
static class Look
{
    public const int MaxSide = 1280;
    const uint WDA_NONE = 0, WDA_EXCLUDEFROMCAPTURE = 0x11;
    const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr h, uint affinity);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);

    public sealed record Shot(string? Jpeg, int Width, int Height, double Black, string? Error);

    public static Shot Capture(IntPtr target, IEnumerable<IntPtr> own)
    {
        if (target == IntPtr.Zero || !IsWindow(target)) return new(null, 0, 0, 0, "that window is gone");
        if (IsIconic(target)) return new(null, 0, 0, 0, "that window is minimised");
        // The visible frame, without the invisible resize border GetWindowRect includes on Windows 10 and 11.
        if (DwmGetWindowAttribute(target, DWMWA_EXTENDED_FRAME_BOUNDS, out var r, Marshal.SizeOf<RECT>()) != 0) GetWindowRect(target, out r);
        var screen = SystemInformation.VirtualScreen;
        var area = Rectangle.Intersect(Rectangle.FromLTRB(r.L, r.T, r.R, r.B), screen);
        if (area.Width < 8 || area.Height < 8) return new(null, 0, 0, 0, "that window is off screen");

        var hidden = own.Where(h => h != IntPtr.Zero).ToList();
        foreach (var h in hidden) SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
        try
        {
            using var full = new Bitmap(area.Width, area.Height, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(full)) g.CopyFromScreen(area.Location, Point.Empty, area.Size, CopyPixelOperation.SourceCopy);
            var black = BlackShare(full);
            var scale = Math.Min(1.0, (double)MaxSide / Math.Max(area.Width, area.Height));
            int w = Math.Max(1, (int)Math.Round(area.Width * scale)), ht = Math.Max(1, (int)Math.Round(area.Height * scale));
            using var small = new Bitmap(w, ht, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(small))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(full, 0, 0, w, ht);
            }
            return new(ToJpeg(small, 70), w, ht, black, null);
        }
        catch (Exception e) { return new(null, 0, 0, 0, "the capture failed: " + e.Message); }
        finally { foreach (var h in hidden) SetWindowDisplayAffinity(h, WDA_NONE); }
    }

    /// <summary>
    /// How much of the picture is black. Protected video (Netflix and the rest, through DRM) and some games
    /// come out as a black rectangle to every capture API, and a black picture must be reported as "I cannot
    /// see it", never described.
    /// </summary>
    public static double BlackShare(Bitmap b)
    {
        int dark = 0, total = 0;
        for (int y = 0; y < b.Height; y += 8)
            for (int x = 0; x < b.Width; x += 8)
            {
                var c = b.GetPixel(x, y);
                if (c.R < 16 && c.G < 16 && c.B < 16) dark++;
                total++;
            }
        return total == 0 ? 0 : (double)dark / total;
    }

    static string ToJpeg(Bitmap b, long quality)
    {
        var codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        using var args = new EncoderParameters(1);
        args.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        using var ms = new MemoryStream();
        b.Save(ms, codec, args);
        return Convert.ToBase64String(ms.ToArray());
    }
}
