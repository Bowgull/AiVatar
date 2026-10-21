using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Aang.Body;

/// <summary>
/// His aura, take "A · soft falloff" from sheet 51 (Joshua's pick, 2026-10-21). Pure haze, no hard edge: alpha falls
/// off with distance from his silhouette, and the breath grows it AND brightens it together on a slow 4 s ease, never
/// off. The old aura was a hard 3 px ring with a sine on its alpha, which he said felt "like a solid colour turning
/// off and on".
///
/// Why it is built this way (2026-10-21): he plays WoW, so nothing heavy runs per tick. For each sprite frame and
/// colour the halo is worked out ONCE (a distance field from his pixels, the same maths the sheet uses) and cached.
/// The halo stores a "closeness" curve out to <see cref="Reach"/> px; every tick only redraws that cached bitmap
/// through a reused colour matrix whose gain and offset pick the breath's size and brightness. Raising the offset
/// cuts the outer tail off, so the haze shrinks; the gain sets how bright it is at his edge. No bitmap is made per tick.
/// </summary>
static class Aura
{
    /// <summary>The furthest the haze can ever reach, in the 224 frame's pixels: the burst's peak. The calm breath
    /// lives between 8 and 12, as on the sheet.</summary>
    public const int Reach = 18;

    /// <summary>The stored curve's power. Picked so that cutting it with a gain and offset lands within ~0.04 alpha
    /// of the sheet's own falloff, I*(1-r/R)^1.8, across the whole calm breath (8 to 12 px); checked numerically
    /// and against the live sheet's pixels, 2026-10-21. The burst's bigger sizes come out a touch softer, which is fine.</summary>
    const double Power = 3.0;

    /// <summary>The sheet treats a pixel as "him" above this alpha, so soft sprite edges get haze behind them.</summary>
    const int Solid = 20;

    /// <summary>A cached halo: the bitmap and where its top-left sits relative to the sprite's own top-left
    /// (it is cropped to his outline plus the reach, so it is far smaller than a full padded frame).</summary>
    internal sealed record Halo(Bitmap Bitmap, int OffsetX, int OffsetY);

    readonly record struct Key(Bitmap Source, RotateFlipType Turn, int Argb, bool ClearDots);

    // Enough for every frame of the states he can glow in, at a few colours, before the oldest goes. Each entry is a
    // few hundred KB at most, so this tops out around 10 MB.
    const int MaxCached = 48;
    static readonly Dictionary<Key, Halo> cache = new();
    static readonly Queue<Key> order = new();

    // Reused every tick: one matrix, one attributes object. Only the two numbers that make the breath change.
    static readonly ColorMatrix matrix = new();
    static readonly ImageAttributes attrs = new();

    /// <summary>The cached halo for this frame, turned the way it is drawn, in this colour. <paramref name="clear"/>
    /// blanks a box of the frame first (the docked view hides the baked-in think dots, so its halo must too).</summary>
    public static Halo For(Bitmap source, RotateFlipType turn, Color tint, Rectangle? clear = null)
    {
        var key = new Key(source, turn, tint.ToArgb(), clear.HasValue);
        if (cache.TryGetValue(key, out var hit)) return hit;
        var made = Build(source, turn, tint, clear);
        cache[key] = made;
        order.Enqueue(key);
        while (order.Count > MaxCached && order.TryDequeue(out var old))
            if (cache.Remove(old, out var gone)) gone.Bitmap.Dispose();
        return made;
    }

    static Halo Build(Bitmap source, RotateFlipType turn, Color tint, Rectangle? clear)
    {
        // Read his alpha (turned, dots cleared) into a plain array once.
        using var copy = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (var cg = Graphics.FromImage(copy))
        {
            cg.DrawImage(source, new Rectangle(0, 0, source.Width, source.Height), 0, 0, source.Width, source.Height, GraphicsUnit.Pixel);
            if (clear is Rectangle box)
            {
                cg.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                using var none = new SolidBrush(Color.Transparent);
                cg.FillRectangle(none, box);
            }
        }
        copy.RotateFlip(turn);
        int sw = copy.Width, sh = copy.Height;
        var px = new int[sw * sh];
        var sd = copy.LockBits(new Rectangle(0, 0, sw, sh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try { for (int y = 0; y < sh; y++) Marshal.Copy(sd.Scan0 + y * sd.Stride, px, y * sw, sw); }
        finally { copy.UnlockBits(sd); }

        // A padded field so the haze can spill past the frame's own edge.
        int pad = Reach + 2, W = sw + pad * 2, H = sh + pad * 2;
        const float Inf = 1e9f, Diag = 1.41421356f;
        var d = new float[W * H];
        Array.Fill(d, Inf);
        int x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (int y = 0; y < sh; y++)
            for (int x = 0; x < sw; x++)
                if (((px[y * sw + x] >> 24) & 0xff) > Solid)
                {
                    d[(y + pad) * W + x + pad] = 0;
                    x0 = Math.Min(x0, x + pad); y0 = Math.Min(y0, y + pad); x1 = Math.Max(x1, x + pad); y1 = Math.Max(y1, y + pad);
                }
        if (x1 < 0) return new Halo(new Bitmap(1, 1, PixelFormat.Format32bppArgb), 0, 0);   // an empty frame: nothing to glow
        // Two-pass chamfer distance, exactly the sheet's.
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                int i = y * W + x; float v = d[i];
                if (x > 0) v = Math.Min(v, d[i - 1] + 1);
                if (y > 0)
                {
                    v = Math.Min(v, d[i - W] + 1);
                    if (x > 0) v = Math.Min(v, d[i - W - 1] + Diag);
                    if (x < W - 1) v = Math.Min(v, d[i - W + 1] + Diag);
                }
                d[i] = v;
            }
        for (int y = H - 1; y >= 0; y--)
            for (int x = W - 1; x >= 0; x--)
            {
                int i = y * W + x; float v = d[i];
                if (x < W - 1) v = Math.Min(v, d[i + 1] + 1);
                if (y < H - 1)
                {
                    v = Math.Min(v, d[i + W] + 1);
                    if (x < W - 1) v = Math.Min(v, d[i + W + 1] + Diag);
                    if (x > 0) v = Math.Min(v, d[i + W - 1] + Diag);
                }
                d[i] = v;
            }

        // Crop to his outline plus the reach, and store closeness^Power in the alpha, his colour everywhere (so the
        // fading tail never goes grey). His own pixels stay empty: the haze is only ever outside him, as on the sheet.
        int cx = Math.Max(0, x0 - Reach - 1), cy = Math.Max(0, y0 - Reach - 1);
        int cw = Math.Min(W, x1 + Reach + 2) - cx, ch = Math.Min(H, y1 + Reach + 2) - cy;
        var outPx = new int[cw * ch];
        int rgb = tint.ToArgb() & 0xffffff;
        for (int y = 0; y < ch; y++)
            for (int x = 0; x < cw; x++)
            {
                float r = d[(y + cy) * W + x + cx];
                int a = r <= 0 || r >= Reach ? 0 : (int)Math.Round(255 * Math.Pow(1 - r / Reach, Power));
                outPx[y * cw + x] = (a << 24) | rgb;
            }
        var halo = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);
        var hd = halo.LockBits(new Rectangle(0, 0, cw, ch), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try { for (int y = 0; y < ch; y++) Marshal.Copy(outPx, y * cw, hd.Scan0 + y * hd.Stride, cw); }
        finally { halo.UnlockBits(hd); }
        return new Halo(halo, cx - pad, cy - pad);
    }

    /// <summary>The colour matrix numbers that turn the stored curve into a haze reaching <paramref name="radius"/> px
    /// with <paramref name="intensity"/> alpha at his edge: alpha = gain * stored - cut, which GDI+ clamps at 0.</summary>
    internal static (float Gain, float Cut) Shape(float radius, float intensity)
    {
        double r = Math.Clamp(radius, 1f, Reach);
        double atEdge = Math.Pow(1 - r / Reach, Power);          // the stored value where the haze should hit zero
        double gain = intensity / (1 - atEdge);
        return ((float)gain, (float)(gain * atEdge));
    }

    /// <summary>The calm breath at this moment: the sheet's A, R = 8..12 px and edge alpha 0.55..0.90, on a 4 s
    /// ease-in-out (1 - cos). Never off: at its lowest it is still 8 px and 0.55.</summary>
    public static (float Radius, float Intensity) Breath(double seconds, float soften = 1f)
    {
        float ph = (float)((1 - Math.Cos(2 * Math.PI * seconds / 4.0)) / 2);
        return (8f + 4f * ph, (0.55f + 0.35f * ph) * soften);
    }

    /// <summary>The burst (his research-based attention rule, kept 2026-10-21, only softened): in ~150 ms the haze
    /// snaps out to the full reach and full brightness, flickers near 9 Hz for ~650 ms between bright and half (soft,
    /// never gone), then eases over ~700 ms into the same calm breath the ambient glow uses, so the hand-off is seamless.</summary>
    public static (float Radius, float Intensity) Burst(double msSinceStart, double wallSeconds, Func<float, float> easeOutBack)
    {
        double t = msSinceStart;
        float snap = t < 150 ? easeOutBack((float)(t / 150.0)) : t < 320 ? 1f - (float)((t - 150) / 170.0) : 0f;
        snap = Math.Clamp(snap, 0f, 1f);
        if (t < 650)
        {
            bool on = ((int)(t / 56) % 2) == 0;
            return (12f + 6f * snap, on ? 1f : 0.5f);
        }
        var calm = Breath(wallSeconds);
        float u = (float)Math.Clamp((t - 650) / 700.0, 0, 1);
        u = u * u * (3 - 2 * u);                                    // smoothstep: no visible seam
        return (12f + (calm.Radius - 12f) * u, 0.95f + (calm.Intensity - 0.95f) * u);
    }

    /// <summary>Draws the cached halo behind a sprite drawn at <paramref name="at"/>. Allocation-free.</summary>
    public static void Draw(Graphics g, Halo halo, Bitmap sprite, Rectangle at, float radius, float intensity)
    {
        var (gain, cut) = Shape(radius, intensity);
        matrix.Matrix33 = gain;
        matrix.Matrix43 = -cut;
        attrs.SetColorMatrix(matrix);
        float sx = at.Width / (float)sprite.Width, sy = at.Height / (float)sprite.Height;
        var b = halo.Bitmap;
        var dest = new Rectangle(at.X + (int)Math.Round(halo.OffsetX * sx), at.Y + (int)Math.Round(halo.OffsetY * sy),
            (int)Math.Round(b.Width * sx), (int)Math.Round(b.Height * sy));
        g.DrawImage(b, dest, 0, 0, b.Width, b.Height, GraphicsUnit.Pixel, attrs);
    }
}
