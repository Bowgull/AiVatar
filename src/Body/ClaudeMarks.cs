using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// C5 (2026-10-21): the marks over Aang's head while Claude works, one colour each, and the wooden chimes that go
/// with them. The brain decides WHICH mark (src/Core/src/claudemark.ts, sent as `claude.mark`); this only draws it.
///
/// Lifted from the sheets he picked, not redrawn: the shapes and colours are sheet 45d's (working, permission,
/// question, plan, paused) and 45e's (the small step tick, the cute skull; the job-complete tick lost its seal 2026-10-21), and so is the
/// palette rule (O dark wood, never black; H lit, F face, S shade; a soft shadow one art pixel down and right).
/// Pixel art stays crisp: every art pixel is a whole number of screen pixels, placed on whole screen pixels.
/// </summary>
static class ClaudeMarks
{
    // The maps, verbatim from the sheets (O outline, H light, F face, S shade, W white, . clear).
    static readonly Dictionary<string, string[]> Shapes = new()
    {
        ["working"] = new[] { "..OOOOOOOOO..", ".OHHHHHFFFSO.", "OHFFFFFFFFFSO", "OHFOFFOFFOFSO", "OHFFFFFFFFFSO", ".OFFFFFFFFSO.", "..OOOFSOOOO..", "....OSO......", "....OO......." },
        ["permission"] = new[] { ".OOOOO..........", "OHHHFSO.........", "OHO.OFSOOOOOOOO.", "OHO.OFFHHHHHHFSO", "OFO.OFSSSSSSSSSO", "OFFFFSOOOOOOSOSO", ".OSSSO.....OSOSO", "..OOO......OOOOO" },
        ["question"] = new[] { "...OOOOO...", "..OHHFFSO..", ".OHFOOOFSO.", ".OHO...OFSO", "..O....OFSO", "......OFFSO", ".....OFFSO.", "....OFFSO..", "....OFSO...", "....OFSO...", "....OOOO...", "...........", "....OOOO...", "...OHFFSO..", "...OFFSSO..", "....OOOO..." },
        ["plan"] = new[] { ".OOOOOOOOOO.", "OHHHHHHHFFSO", "OSSSSSSSSSSO", ".OFFFFFFFSO.", ".OFOOOOFFSO.", ".OFFFFFFFSO.", ".OFOOOOOFSO.", ".OFFFFFFFSO.", "OHHHHHHHFFSO", "OSSSSSSSSSSO", ".OOOOOOOOOO." },
        ["paused"] = new[] { "OOOOOOOOO", "OHHHHFFSO", ".OHFFFSO.", "..OHFSO..", "...OSO...", "..OF.SO..", ".OF...SO.", "OHFFFFFSO", "OOOOOOOOO" },
        // 45e: "the step tick is impossible to see" fixed - small but bold.
        ["step"] = new[] { "........OOO", ".......OHHO", "......OHFSO", ".OOO.OHFSO.", "OHHOOHFSO..", "OFHHHFSO...", ".OFFFSO....", "..OSSO.....", "...OO......" },
        // The job-complete tick: the step tick grown up, no circle (his call, 2026-10-21: "I didnt want that tick mark with
        // the circle"). Bigger than a step, still not huge, and gold so it can never be mistaken for the coral skull.
        ["complete"] = new[] { "..........OOO", ".........OHHO", "........OHHFO", ".......OHHFSO", ".OOO..OHHFSO.", "OHHHOOHHFSO..", "OFHHHHHFSO...", ".OFFHHFSO....", "..OFFFSO.....", "...OSSO......", "....OO......." },
        // 45e: "failed should be a cute little skull".
        ["failed"] = new[] { "..OOOOOOO..", ".OHHHHFFFO.", "OHHFFFFFFSO", "OHOOFFFOOSO", "OFOOFFFOOSO", "OFFFFOFFFSO", ".OFFFFFFSO.", "..OFOFOFO..", "..OOOOOOO.." },
    };

    /// <summary>One colour per mark (45d), and the glow around him takes it too.</summary>
    public static Color ColorOf(string kind) => kind switch
    {
        "working" => Color.FromArgb(236, 194, 126),     // honey, softer than Aang's gold
        "permission" => Color.FromArgb(191, 227, 255),  // pale Avatar State blue: blocking only
        "question" => Color.FromArgb(201, 179, 255),    // lavender
        "plan" => Color.FromArgb(240, 222, 180),        // parchment: a scroll in its own paper (was sage, too close to the step's sea)
        "step" => Color.FromArgb(138, 213, 201),        // sea, the job bar's colour
        "complete" => Color.FromArgb(255, 196, 60),     // Aang's gold (was terracotta, too close to the failed coral)
        "paused" => Color.FromArgb(154, 168, 192),      // dusk slate
        "failed" => Color.FromArgb(240, 138, 122),      // soft coral
        _ => Color.FromArgb(236, 194, 126),
    };

    /// <summary>
    /// Which marks also make him glow (his question, 2026-10-21: "some should, some shouldn't"). Only what wants him or
    /// is worth turning round for: needs you, a question, a plan, the job done (its few seconds), failed. Working, a step
    /// and paused are marks only, so he stays calm while Claude works (sheet 45).
    /// </summary>
    public static bool Glows(string? kind) => kind is "permission" or "question" or "plan" or "complete" or "failed";

    public static bool Known(string? kind) => kind != null && Shapes.ContainsKey(kind);
    public static string[] Map(string kind) => Shapes[kind];

    /// <summary>Frame pixels between the top of his head and the mark's bottom: 45e's "a few pixels clear" (6) plus
    /// the mark's own shadow (3). He said the early mockups floated far too high.</summary>
    public const float Gap = 9f;

    /// <summary>Where a mark's bottom-centre sits over his head, in the 224 frame's own pixels. <paramref name="art"/>
    /// is the sprite's visible box (Docking.ArtBox); walking left mirrors him, so it mirrors this too.</summary>
    public static PointF AboveHead(Rectangle art, bool flip)
    {
        float cx = art.X + art.Width / 2f;
        if (flip) cx = Docking.Frame - cx;
        return new PointF(cx, art.Y - Gap);
    }

    /// <summary>Screen pixels per art pixel at this display scale: the sheets' 3 per frame pixel, rounded to a whole number.</summary>
    public static int PxFor(float scale) => Math.Max(1, (int)Math.Round(3 * scale, MidpointRounding.AwayFromZero));

    static Color Mix(Color a, int r, int g, int b, double k) =>
        Color.FromArgb(255, (int)Math.Round(a.R + (r - a.R) * k), (int)Math.Round(a.G + (g - a.G) * k), (int)Math.Round(a.B + (b - a.B) * k));

    /// <summary>
    /// Draws a mark with its bottom-centre at (<paramref name="cx"/>, <paramref name="bottom"/>) in SCREEN pixels of
    /// <paramref name="g"/>'s surface (the caller resets any scaling first), <paramref name="px"/> whole pixels per art pixel.
    /// </summary>
    public static void Draw(Graphics g, string kind, int cx, int bottom, int px)
    {
        var map = Shapes[kind];
        int w = map[0].Length, h = map.Length;
        int x0 = cx - w * px / 2, y0 = bottom - h * px;
        var c = ColorOf(kind);
        var saved = g.Save();
        g.SmoothingMode = SmoothingMode.None;
        g.PixelOffsetMode = PixelOffsetMode.None;
        g.CompositingQuality = CompositingQuality.HighSpeed;
        using var shadow = new SolidBrush(Color.FromArgb(102, 0, 0, 0));     // rgba(0,0,0,.4), as the sheets
        using var ol = new SolidBrush(Color.FromArgb(255, 42, 26, 16));      // dark wood, not black (soft edges)
        using var hi = new SolidBrush(Mix(c, 255, 255, 255, 0.55));
        using var face = new SolidBrush(c);
        using var sh = new SolidBrush(Mix(c, 40, 20, 10, 0.35));
        using var white = new SolidBrush(Color.FromArgb(255, 255, 250, 240));
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
            if (map[y][x] != '.') g.FillRectangle(shadow, x0 + (x + 1) * px, y0 + (y + 1) * px, px, px);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
        {
            var b = map[y][x] switch { 'O' => ol, 'H' => hi, 'F' => face, 'S' => sh, 'W' => white, _ => null };
            if (b != null) g.FillRectangle(b, x0 + x * px, y0 + y * px, px, px);
        }
        g.Restore(saved);
    }
}

/// <summary>
/// The wooden chime set he picked (docs/cockpit/sounds-45b, copied to assets/aang/sfx/chimes), played at his volume.
/// System.Media.SoundPlayer has no volume of its own, so the 16-bit samples are scaled once per volume and kept.
/// </summary>
static class Chimes
{
    public static readonly string[] Names = { "permission", "question", "plan-ready", "step", "job-complete", "failed" };
    static readonly Dictionary<string, byte[]> raw = new();
    static readonly Dictionary<string, (int vol, System.Media.SoundPlayer player)> made = new();
    static System.Media.SoundPlayer? playing;

    static byte[]? Raw(string name)
    {
        if (raw.TryGetValue(name, out var b)) return b;
        try { b = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "sfx", "chimes", name + ".wav")); }
        catch (Exception e) { Log.Write("chime load failed: " + e.Message); return null; }
        raw[name] = b;
        return b;
    }

    /// <summary>A copy of a 16-bit PCM WAV with every sample times <paramref name="volume"/>/100 (linear, like the sheet's slider).</summary>
    internal static byte[] Scaled(byte[] wav, int volume)
    {
        var o = (byte[])wav.Clone();
        if (volume >= 100) return o;
        // Walk the chunks to the "data" one; the header length is not fixed.
        int i = 12;
        while (i + 8 <= o.Length)
        {
            var id = System.Text.Encoding.ASCII.GetString(o, i, 4);
            int len = BitConverter.ToInt32(o, i + 4);
            if (id == "data")
            {
                double k = Math.Clamp(volume, 0, 100) / 100.0;
                int end = Math.Min(o.Length, i + 8 + len);
                for (int p = i + 8; p + 1 < end; p += 2)
                {
                    var s = (short)(o[p] | (o[p + 1] << 8));
                    var v = (short)Math.Round(s * k);
                    o[p] = (byte)(v & 0xFF); o[p + 1] = (byte)((v >> 8) & 0xFF);
                }
                break;
            }
            i += 8 + len + (len & 1);
        }
        return o;
    }

    public static void Play(string name, int volume)
    {
        if (volume <= 0 || Array.IndexOf(Names, name) < 0) return;
        try
        {
            if (!made.TryGetValue(name, out var m) || m.vol != volume)
            {
                var wav = Raw(name); if (wav == null) return;
                var p = new System.Media.SoundPlayer(new MemoryStream(Scaled(wav, volume)));
                p.Load();
                m = (volume, p); made[name] = m;
            }
            playing = m.player;
            playing.Play();
        }
        catch (Exception e) { Log.Write("chime play failed: " + e.Message); }
    }
}
