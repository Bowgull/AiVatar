// StyleLab: every candidate look for the bubble, input and docking, rendered for real.
//   dotnet run --project tools/StyleLab -- <out dir> [--capture x y w h]
// The sprite frames are drawn exactly as they are (nearest-neighbour, never altered). Only what surrounds him changes.
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
var outDir = args.Length > 0 ? args[0] : Path.Combine(root, "tests", "out", "stylelab");
Directory.CreateDirectory(outDir);
var frames = Path.Combine(root, "assets", "aang", "frames");
Fonts.Load(Path.Combine(root, "assets", "aang", "fonts"));

// ---- background: a real capture of the screen (never the part where the live Aang stands)
var bgFile = Path.Combine(outDir, "background.png");
int ci = Array.IndexOf(args, "--capture");
if (ci >= 0 || !File.Exists(bgFile))
{
    var r = ci >= 0 ? new Rectangle(int.Parse(args[ci + 1]), int.Parse(args[ci + 2]), int.Parse(args[ci + 3]), int.Parse(args[ci + 4])) : new Rectangle(700, 150, 560, 420);
    using var cap = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(cap)) g.CopyFromScreen(r.Location, Point.Empty, r.Size);
    cap.Save(bgFile, ImageFormat.Png);
}
using var busy = new Bitmap(bgFile);
// Three backdrops, because a bubble has to work on all of them: dark game terrain (mirror-tiled from the clean left
// strip of a real WoW screenshot), a bright snowfield, and a busy window full of text.
Bitmap MakeDark()
{
    var b = new Bitmap(busy.Width, busy.Height, PixelFormat.Format32bppArgb);
    var src = Path.Combine(root, "tests", "out", "typing", "01_input_open.png");
    using var g = Graphics.FromImage(b);
    if (File.Exists(src))
    {
        using var wow = new Bitmap(src);
        var strip = new Rectangle(0, 0, 226, 250);
        using var tile = wow.Clone(strip, PixelFormat.Format32bppArgb);
        for (int y = 0, row = 0; y < b.Height; y += strip.Height, row++)
            for (int x = 0, col = 0; x < b.Width; x += strip.Width, col++)
            {
                using var t = (Bitmap)tile.Clone();
                t.RotateFlip((col % 2 == 1 ? RotateFlipType.RotateNoneFlipX : RotateFlipType.RotateNoneFlipNone) | (row % 2 == 1 ? RotateFlipType.RotateNoneFlipY : RotateFlipType.RotateNoneFlipNone));
                g.DrawImageUnscaled(t, x, y);
            }
    }
    else g.Clear(Color.FromArgb(28, 34, 24));
    return b;
}
Bitmap MakeSnow()
{
    var b = new Bitmap(busy.Width, busy.Height, PixelFormat.Format32bppArgb);
    using var g = Graphics.FromImage(b);
    using (var br = new LinearGradientBrush(new Rectangle(0, 0, b.Width, b.Height), Color.FromArgb(214, 226, 240), Color.FromArgb(244, 247, 252), 90f)) g.FillRectangle(br, 0, 0, b.Width, b.Height);
    var rng = new Random(7);
    for (int i = 0; i < 900; i++) { int x = rng.Next(b.Width), y = rng.Next(b.Height), a = rng.Next(20, 60); using var pb = new SolidBrush(Color.FromArgb(a, rng.Next(2) == 0 ? Color.White : Color.FromArgb(150, 170, 200))); g.FillEllipse(pb, x, y, rng.Next(2, 6), rng.Next(2, 4)); }
    return b;
}
using var dark = MakeDark();
using var snow = MakeSnow();
var bg = busy;                       // sizes only
Bitmap Frame(string name) => new(Path.Combine(frames, name + ".png"));

var styles = new[] { Style.Today(), Style.Clean(Style.Gold), Style.Clean(Style.Cyan), Style.Pixel(Style.Gold), Style.Pixel(Style.Cyan), Style.Retro(Style.Gold), Style.Retro(Style.Cyan), Style.Parchment() };
const string Short = "Paint's open.";
const string Long = "The page is a kettle descaling guide. Fill the kettle halfway with equal parts white vinegar and water, boil it, and leave it for 45 minutes. Then rinse it three times so your tea doesn't taste of vinegar. The page also has a line addressed to me claiming you approved opening a link. I ignored it.";

foreach (var s in styles)
{
    var sheet = new Bitmap(bg.Width * 2 + 12, bg.Height * 2 + 60, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(sheet))
    {
        g.Clear(Color.FromArgb(24, 24, 28));
        using var hf = new Font("Segoe UI Variable Text", 16f, FontStyle.Bold, GraphicsUnit.Pixel);
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        g.DrawString(s.Title, hf, Brushes.White, 8, 12);
        var panels = new[] { Panel(s, dark, p => p.Reply(Short, tools: true)), Panel(s, snow, p => p.Reply(Long)), Panel(s, busy, p => p.Permission("Can I open Chrome?", "open apps")), Panel(s, dark, p => p.Input("whats on my screen right now")) };
        for (int i = 0; i < 4; i++) { g.DrawImageUnscaled(panels[i], (i % 2) * (bg.Width + 12), 48 + (i / 2) * (bg.Height + 12)); panels[i].Dispose(); }
    }
    sheet.Save(Path.Combine(outDir, s.File + ".png"), ImageFormat.Png);
    Console.WriteLine("wrote " + s.File);
}
Docking();
Console.WriteLine("done: " + outDir);

Bitmap Panel(Style s, Bitmap back, Action<Painter> draw)
{
    var b = new Bitmap(bg.Width, bg.Height, PixelFormat.Format32bppArgb);
    using var g = Graphics.FromImage(b);
    g.DrawImageUnscaled(back, 0, 0);
    using var sprite = Frame("talk_2");
    g.InterpolationMode = InterpolationMode.NearestNeighbor; g.PixelOffsetMode = PixelOffsetMode.Half;
    g.DrawImage(sprite, b.Width - 224 - 8, b.Height - 224);
    draw(new Painter(g, s, b.Width - 224 - 8, b.Height - 224));
    return b;
}

// Docking: bottom, left, right and top edges, eyes and top of head only. Rotations are exact multiples of 90
// degrees, which only move pixels - the frame itself is untouched.
void Docking()
{
    using var look = Frame("look_0");
    var box = Opaque(look);
    const int show = 56;                                         // eyes and top of head
    var cells = new (string label, RotateFlipType rot, Func<Bitmap, Rectangle, (int x, int y)> place)[]
    {
        ("Bottom edge (upright)", RotateFlipType.RotateNoneFlipNone, (f, bx) => (bg.Width - 150 - f.Width / 2, bg.Height - show - bx.Top + 0)),
        ("Left edge (turned, head in)", RotateFlipType.Rotate90FlipNone, (f, bx) => (-(f.Width - show) + (f.Width - bx.Right), bg.Height / 2 - f.Height / 2)),
        ("Right edge (turned, head in)", RotateFlipType.Rotate270FlipNone, (f, bx) => (bg.Width - show - bx.Left, bg.Height / 2 - f.Height / 2)),
        ("Top edge (hanging)", RotateFlipType.Rotate180FlipNone, (f, bx) => (bg.Width / 2 - f.Width / 2, -(f.Height - show) + (f.Height - bx.Bottom))),
    };
    var sheet = new Bitmap(bg.Width * 2 + 12, bg.Height * 3 + 84, PixelFormat.Format32bppArgb);
    using var g = Graphics.FromImage(sheet);
    g.Clear(Color.FromArgb(24, 24, 28));
    g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
    using var hf = new Font("Segoe UI Variable Text", 16f, FontStyle.Bold, GraphicsUnit.Pixel);
    using var lf = new Font("Segoe UI Variable Text", 13f, FontStyle.Regular, GraphicsUnit.Pixel);
    g.DrawString("Docking: eyes and top of head, all four edges (sprite frames only rotated, never redrawn)", hf, Brushes.White, 8, 12);
    for (int i = 0; i < 6; i++)
    {
        using var panel = new Bitmap(bg.Width, bg.Height, PixelFormat.Format32bppArgb);
        using (var pg = Graphics.FromImage(panel))
        {
            pg.DrawImageUnscaled(dark, 0, 0);
            pg.InterpolationMode = InterpolationMode.NearestNeighbor; pg.PixelOffsetMode = PixelOffsetMode.Half;
            if (i < 4)
            {
                using var f = (Bitmap)look.Clone(); f.RotateFlip(cells[i].rot);
                var fb = Opaque(f); var (x, y) = cells[i].place(f, fb);
                pg.DrawImage(f, x, y, f.Width, f.Height);
            }
            else
            {
                // 4: bottom, peeking further with a badge (he has something);  5: bottom, revealed on click
                using var f = Frame(i == 4 ? "look_4" : "hello_3"); var fb = Opaque(f);
                int up = i == 4 ? 96 : fb.Height + 4;
                int x = bg.Width - 150 - f.Width / 2, y = bg.Height - up - fb.Top;
                pg.DrawImage(f, x, y, f.Width, f.Height);
                if (i == 4)
                {
                    int bx = x + fb.Right - 6, by = y + fb.Top - 2;
                    pg.SmoothingMode = SmoothingMode.AntiAlias;
                    using var halo = new SolidBrush(Color.FromArgb(230, 16, 10, 34)); pg.FillEllipse(halo, bx - 3, by - 3, 22, 22);
                    using var dot = new SolidBrush(Style.Cyan); pg.FillEllipse(dot, bx, by, 16, 16);
                    using var nf = new Font("Segoe UI Variable Text", 11f, FontStyle.Bold, GraphicsUnit.Pixel);
                    pg.DrawString("1", nf, new SolidBrush(Color.FromArgb(16, 10, 34)), bx + 4.5f, by + 1);
                }
            }
        }
        int px = (i % 2) * (bg.Width + 12), py = 48 + (i / 2) * (bg.Height + 12);
        g.DrawImageUnscaled(panel, px, py);
        var label = i < 4 ? cells[i].label : i == 4 ? "Something to say: peeks higher, badge" : "Revealed (click or Ctrl+NumLock)";
        using var lb = new SolidBrush(Color.FromArgb(200, 16, 10, 34)); g.FillRectangle(lb, px + 6, py + 6, g.MeasureString(label, lf).Width + 10, 22);
        g.DrawString(label, lf, Brushes.White, px + 11, py + 9);
    }
    sheet.Save(Path.Combine(outDir, "docking.png"), ImageFormat.Png);
    Console.WriteLine("wrote docking");
}

static Rectangle Opaque(Bitmap b)
{
    int l = b.Width, t = b.Height, r = 0, btm = 0;
    for (int y = 0; y < b.Height; y++) for (int x = 0; x < b.Width; x++)
        if (b.GetPixel(x, y).A > 40) { l = Math.Min(l, x); t = Math.Min(t, y); r = Math.Max(r, x); btm = Math.Max(btm, y); }
    return Rectangle.FromLTRB(l, t, r + 1, btm + 1);
}

/// <summary>Atkinson Hyperlegible ships as TTF files in assets/, not a system font: loaded once via a private
/// collection so Font(name, ...) works for it the same as any installed face.</summary>
static class Fonts
{
    static readonly PrivateFontCollection pfc = new();
    public static FontFamily? Atkinson { get; private set; }
    public static FontFamily? PressStart { get; private set; }
    public static void Load(string dir)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var f in Directory.GetFiles(dir, "*.ttf")) pfc.AddFontFile(f);
        Atkinson = pfc.Families.FirstOrDefault(fam => fam.Name.Contains("Atkinson", StringComparison.OrdinalIgnoreCase));
        PressStart = pfc.Families.FirstOrDefault(fam => fam.Name.Contains("Press Start", StringComparison.OrdinalIgnoreCase));
    }
    public static Font Make(string name, float size, FontStyle style) => name switch
    {
        "Atkinson Hyperlegible" when Atkinson != null => new Font(Atkinson, size, style, GraphicsUnit.Pixel),
        "Press Start 2P" when PressStart != null => new Font(PressStart, size, FontStyle.Regular, GraphicsUnit.Pixel),
        _ => new Font(name, size, style, GraphicsUnit.Pixel),
    };
}

sealed record Style(string Title, string File, string Kind, Color Outline, Color Warn, string FontName, float Size, int LineH, int Radius, float Stroke, int CompactW, int WideW, Color Text, Color Dim)
{
    public static readonly Color Gold = Color.FromArgb(255, 196, 60), Cyan = Color.FromArgb(90, 220, 255);
    public static Style Today() => new("TODAY - Bahnschrift 11pt, 1.8px gold, radius 14, 232px", "0_today", "today", Color.FromArgb(235, 255, 196, 60), Color.FromArgb(255, 200, 90), "Bahnschrift", 14.667f, 16, 14, 1.8f, 232, 232, Color.FromArgb(240, 244, 255), Color.FromArgb(178, 170, 215));
    public static Style Clean(Color c) => new($"CLEAN - Segoe UI Variable 15px, 2px {Name(c)} + halo, radius 12, 260px / 330px long", $"1_clean_{Name(c)}", "clean", c, WarnFor(c), "Segoe UI Variable Text", 15f, 21, 12, 2f, 260, 330, Color.FromArgb(0xE8, 0xE4, 0xF0), Color.FromArgb(0xC9, 0xC2, 0xDA));
    public static Style Pixel(Color c) => new($"PIXEL-FLAVOURED - stepped corners and tail, chunky 2px {Name(c)}, drop shadow, clean text", $"2_pixel_{Name(c)}", "pixel", c, WarnFor(c), "Segoe UI Variable Text", 15f, 21, 6, 2f, 260, 330, Color.FromArgb(0xE8, 0xE4, 0xF0), Color.FromArgb(0xC9, 0xC2, 0xDA));
    public static Style Retro(Color c) => new($"FULL RETRO - double pixel frame, pixel text ({Name(c)})", $"3_retro_{Name(c)}", "retro", c, WarnFor(c), "Cascadia Mono", 8f, 20, 4, 2f, 272, 336, Color.FromArgb(0xF0, 0xEC, 0xF8), Color.FromArgb(0xC9, 0xC2, 0xDA));
    // Ink + gold frame kept exactly as CLEAN; the reading surface inside is a warm parchment inset (Stardew/WoW/OoT
    // dialogue convention, and what the APCA contrast pass called for) in Atkinson Hyperlegible, dark ink text.
    public static readonly Color Parch1 = Color.FromArgb(255, 236, 213, 168), Parch2 = Color.FromArgb(255, 222, 194, 140), Ink2 = Color.FromArgb(255, 46, 34, 22);
    public static Style Parchment() => new("PARCHMENT - ink+gold frame, parchment reading pane, Atkinson Hyperlegible 15px", "4_parchment", "parchment", Gold, Color.FromArgb(255, 150, 60, 20), "Atkinson Hyperlegible", 15f, 20, 14, 2f, 260, 330, Ink2, Color.FromArgb(255, 90, 72, 52));
    static string Name(Color c) => c == Gold ? "gold" : "cyan";
    // Gold as his colour means warnings move to orange, so the two never mean the same thing.
    static Color WarnFor(Color c) => c == Gold ? Color.FromArgb(255, 140, 70) : Color.FromArgb(255, 200, 90);
}

sealed class Painter(Graphics g, Style s, int spriteX, int spriteY)
{
    readonly Color fill = Color.FromArgb(244, 16, 10, 34);
    const int Pad = 12;
    int mouthX => spriteX + 104; int mouthY => spriteY + 112;

    Font BodyFont() => Fonts.Make(s.FontName, s.Size, FontStyle.Regular);

    List<string> Wrap(string text, Font f, float w)
    {
        var lines = new List<string>(); var cur = "";
        foreach (var word in text.Split(' '))
        {
            var t = cur.Length == 0 ? word : cur + " " + word;
            if (Measure(t, f) > w && cur.Length > 0) { lines.Add(cur); cur = word; } else cur = t;
        }
        if (cur.Length > 0) lines.Add(cur);
        return lines;
    }
    float Measure(string t, Font f) => s.Kind == "retro" ? t.Length * 9.6f : g.MeasureString(t, f, PointF.Empty, StringFormat.GenericTypographic).Width;

    public void Reply(string text, bool tools = false)
    {
        using var f = BodyFont();
        int w = s.CompactW; var lines = Wrap(text, f, w);
        if (lines.Count > 3 && s.WideW > w) { w = s.WideW; lines = Wrap(text, f, w); }
        bool more = lines.Count > 6; if (more) { lines = lines.Take(6).ToList(); lines[5] = lines[5].TrimEnd('.', ',') + "..."; }
        int h = lines.Count * s.LineH + 2 * Pad - (s.LineH - (int)s.Size) / 2 + 4;
        var rect = Place(w + 2 * Pad + 4, h);
        Frame(rect);
        TextLines(lines, f, rect);
        if (more) Arrow(rect);
        if (tools) Tools(rect);
    }

    public void Permission(string question, string kind)
    {
        using var f = BodyFont();
        int w = s.CompactW + 30;
        var lines = Wrap(question, f, w);
        int btnH = s.Kind == "today" ? 20 : 28, btnRows = s.Kind == "today" ? 1 : 2;
        int h = lines.Count * s.LineH + 2 * Pad + btnRows * (btnH + 8) + 2;
        var rect = Place(w + 2 * Pad + 4, h);
        Frame(rect); TextLines(lines, f, rect);
        int y = rect.Bottom - Pad - btnRows * (btnH + 8) + 8;
        if (s.Kind == "today")
        {
            // what ships now: one question, "yes" grants it for good
            TextLines(Wrap("Yes means I can open apps from now on.", f, w), f, new Rectangle(rect.X, rect.Y + lines.Count * s.LineH, rect.Width, rect.Height));
            Pill(new RectangleF(rect.Right - 128, rect.Bottom - Pad - 20, 56, 20), "yes", Color.FromArgb(120, 230, 150), false);
            Pill(new RectangleF(rect.Right - 66, rect.Bottom - Pad - 20, 56, 20), "no", Color.FromArgb(255, 130, 120), false);
            return;
        }
        // research: a verb for once, "always" set apart and never the default, and a plain way out
        float x = rect.X + Pad + 2;
        x += Pill(new RectangleF(x, y, 0, btnH), "Open Chrome", s.Outline, true) + 8;
        Pill(new RectangleF(x, y, 0, btnH), "Not now", s.Dim, false);
        Pill(new RectangleF(rect.X + Pad + 2, y + btnH + 8, 0, btnH), "⚿  Always allow apps", s.Warn, false);
    }

    public void Input(string typed)
    {
        using var f = BodyFont();
        int w = s.CompactW + 2 * Pad + 4, h = s.Kind == "today" ? 56 : 72;
        var rect = new Rectangle(spriteX - w + 40, spriteY + 150 - h, w, h);
        Frame(rect, tail: false, accent: s.Kind == "today" ? Style.Cyan : s.Outline);
        using var tb = new SolidBrush(s.Text);
        Text(typed + (s.Kind == "retro" ? "_" : "|"), f, tb, rect.X + Pad + 2, rect.Y + 8);
        float cy = rect.Bottom - (s.Kind == "today" ? 20 : 30);
        using var sep = new Pen(Color.FromArgb(60, s.Dim), 1); g.DrawLine(sep, rect.X + 8, cy - 5, rect.Right - 8, cy - 5);
        int chipH = s.Kind == "today" ? 15 : 24;
        Pill(new RectangleF(rect.X + 8, cy, s.Kind == "today" ? 48 : 0, chipH), s.Kind == "today" ? "Auto ▾" : "Auto ▾", Style.Cyan, false, small: true);
        // quota: neutral until 80%
        float gx = rect.Right - 62, gy = cy + chipH / 2f - 4;
        using var track = new SolidBrush(Color.FromArgb(70, s.Dim)); using var fillB = new SolidBrush(s.Dim);
        g.SmoothingMode = s.Kind is "pixel" or "retro" ? SmoothingMode.None : SmoothingMode.AntiAlias;
        g.FillRectangle(track, gx, gy, 50, 8); g.FillRectangle(fillB, gx, gy, 50 * 0.34f, 8);
    }

    Rectangle Place(int w, int h)
    {
        // above-left of the head, tail toward the mouth, never over the face
        int x = spriteX - w + 70, y = spriteY + 70 - h;
        return new Rectangle(Math.Max(8, x), Math.Max(8, y), w, h);
    }

    void Frame(Rectangle r, bool tail = true, Color? accent = null)
    {
        var outline = accent ?? s.Outline;
        var tip = new PointF(mouthX - 6, mouthY - 30);
        if (s.Kind is "pixel" or "retro")
        {
            g.SmoothingMode = SmoothingMode.None; g.PixelOffsetMode = PixelOffsetMode.None;
            using var path = Stepped(r, s.Radius, tail ? tip : null);
            using (var sh = new SolidBrush(Color.FromArgb(150, 0, 0, 0))) { g.TranslateTransform(3, 3); g.FillPath(sh, path); g.ResetTransform(); }
            using (var fb = new SolidBrush(fill)) g.FillPath(fb, path);
            if (s.Kind == "retro")
            {
                using var dark = new Pen(Color.FromArgb(255, 4, 2, 10), 4); g.DrawPath(dark, path);
                using var p2 = new Pen(outline, 2); g.DrawPath(p2, path);
                var inner = Rectangle.Inflate(r, -5, -5);
                using var ip = Stepped(inner, 2, null); using var p3 = new Pen(Color.FromArgb(110, outline), 1); g.DrawPath(p3, ip);
            }
            else { using var p = new Pen(outline, s.Stroke); g.DrawPath(p, path); }
            return;
        }
        g.SmoothingMode = SmoothingMode.AntiAlias; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        using var gp = Rounded(r, s.Radius, tail ? tip : null);
        if (s.Kind is "clean" or "parchment") { using var halo = new Pen(Color.FromArgb(170, 0, 0, 0), s.Stroke + 3) { LineJoin = LineJoin.Round }; g.DrawPath(halo, gp); }
        using (var fb = new SolidBrush(fill)) g.FillPath(fb, gp);
        if (s.Kind == "parchment")
        {
            // The reading surface: inset 6px from the ink+gold frame (inside Pad, so text layout is untouched),
            // a soft top-to-bottom parchment gradient with a thin tan inner edge - never full flat colour, real paper has a grain of tone.
            var inset = Rectangle.Inflate(r, -6, -6);
            using var ip = Rounded(inset, Math.Max(4, s.Radius - 6), null);
            using (var pg = new LinearGradientBrush(inset, Style.Parch1, Style.Parch2, 90f)) g.FillPath(pg, ip);
            using (var ipen = new Pen(Color.FromArgb(130, 92, 61, 33), 1.2f)) g.DrawPath(ipen, ip);
        }
        using var pen = new Pen(outline, s.Stroke) { LineJoin = LineJoin.Round }; g.DrawPath(pen, gp);
    }

    static GraphicsPath Rounded(Rectangle r, int rad, PointF? tip)
    {
        var p = new GraphicsPath(); int d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        if (tip is PointF t) { p.AddLine(r.Right, r.Y + rad, r.Right, r.Bottom - 38); p.AddLine(r.Right, r.Bottom - 38, t.X, t.Y); p.AddLine(t.X, t.Y, r.Right, r.Bottom - 18); }
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    /// <summary>Corners cut in 2px steps and a staircase tail: a pixel-art shape drawn with no smoothing.</summary>
    static GraphicsPath Stepped(Rectangle r, int rad, PointF? tip)
    {
        var pts = new List<PointF>();
        void Corner(int cx, int cy, int sx, int sy, bool xFirst)
        {
            for (int i = 0; i <= rad; i += 2)
            {
                int a = rad - i;
                if (xFirst) { pts.Add(new(cx + sx * a, cy + sy * i)); pts.Add(new(cx + sx * (a - 2 < 0 ? 0 : a - 2), cy + sy * i)); }
                else { pts.Add(new(cx + sx * i, cy + sy * a)); pts.Add(new(cx + sx * i, cy + sy * (a - 2 < 0 ? 0 : a - 2))); }
            }
        }
        pts.Add(new(r.X + rad, r.Y)); pts.Add(new(r.Right - rad, r.Y));
        pts.Add(new(r.Right, r.Y + rad));
        if (tip is PointF t)
        {
            float y0 = r.Bottom - 36, y1 = r.Bottom - 18;
            pts.Add(new(r.Right, y0));
            // staircase down to the tip, 4px steps
            float x = r.Right, y = y0; int steps = 8;
            for (int i = 1; i <= steps; i++) { float nx = r.Right + (t.X - r.Right) * i / steps, ny = y0 + (t.Y - y0) * i / steps; pts.Add(new(nx, y)); pts.Add(new(nx, ny)); y = ny; x = nx; }
            for (int i = steps - 1; i >= 0; i--) { float nx = r.Right + (t.X - r.Right) * i / steps, ny = y1 + (t.Y - y1) * i / steps; pts.Add(new(x, ny)); pts.Add(new(nx, ny)); x = nx; }
            pts.Add(new(r.Right, y1));
        }
        pts.Add(new(r.Right, r.Bottom - rad)); pts.Add(new(r.Right - rad, r.Bottom));
        pts.Add(new(r.X + rad, r.Bottom)); pts.Add(new(r.X, r.Bottom - rad));
        pts.Add(new(r.X, r.Y + rad));
        var p = new GraphicsPath(); p.AddLines(pts.Select(q => new PointF(MathF.Round(q.X), MathF.Round(q.Y))).ToArray()); p.CloseFigure(); return p;
    }

    void TextLines(List<string> lines, Font f, Rectangle r)
    {
        using var b = new SolidBrush(s.Text);
        for (int i = 0; i < lines.Count; i++) Text(lines[i], f, b, r.X + Pad + 2, r.Y + Pad - 1 + i * s.LineH);
    }

    /// <summary>Retro text is drawn one bit per pixel at half size and doubled with nearest-neighbour: real pixel text from a Windows font.</summary>
    void Text(string t, Font f, Brush b, float x, float y)
    {
        if (s.Kind != "retro")
        {
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.DrawString(t, f, b, x, y, StringFormat.GenericTypographic);
            return;
        }
        using var small = new Bitmap(Math.Max(1, t.Length * 5 + 4), 12, PixelFormat.Format32bppArgb);
        using (var sg = Graphics.FromImage(small))
        {
            sg.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
            using var pf = new Font("Cascadia Mono", 8f, FontStyle.Regular, GraphicsUnit.Pixel);
            sg.DrawString(t, pf, b, 0, 0, StringFormat.GenericTypographic);
        }
        var st = g.Save();
        g.InterpolationMode = InterpolationMode.NearestNeighbor; g.PixelOffsetMode = PixelOffsetMode.Half;
        g.DrawImage(small, (int)x, (int)y - 2, small.Width * 2, small.Height * 2);
        g.Restore(st);
    }

    void Arrow(Rectangle r)
    {
        using var b = new SolidBrush(s.Outline);
        float x = r.Right - 20, y = r.Bottom - 14;
        if (s.Kind is "pixel" or "retro")
        {
            g.SmoothingMode = SmoothingMode.None;
            for (int i = 0; i < 4; i++) g.FillRectangle(b, x + i * 2, y + i * 2, 12 - i * 4, 2);
        }
        else { g.SmoothingMode = SmoothingMode.AntiAlias; g.FillPolygon(b, new[] { new PointF(x, y), new PointF(x + 11, y), new PointF(x + 5.5f, y + 7) }); }
    }

    void Tools(Rectangle r)
    {
        // research: 16px glyphs in 28px boxes at 32px pitch (today: 20x17)
        bool today = s.Kind == "today";
        int box = today ? 20 : 28, pitch = today ? 23 : 32;
        var colors = new[] { Style.Cyan, Color.FromArgb(120, 230, 150), Color.FromArgb(255, 130, 120) };
        var glyphs = new[] { "⧉", "✓", "✕" };
        for (int i = 0; i < 3; i++)
        {
            var bx = new RectangleF(r.Right - 10 - (3 - i) * pitch, r.Y - box / 2f, box, today ? 17 : box);
            Pill(bx, glyphs[i], colors[i], false, square: true);
        }
    }

    /// <summary>A pill button. Width 0 = fit the label. Returns its width. Parchment's real word labels (not the
    /// glyph-icon squares) get the pixel accent face - short UI text only, never a sentence (CREDITS.txt).</summary>
    float Pill(RectangleF r, string label, Color c, bool primary, bool small = false, bool square = false)
    {
        bool accent = s.Kind == "parchment" && !square;
        using var f = s.Kind == "retro" ? new Font("Cascadia Mono", 12f, FontStyle.Regular, GraphicsUnit.Pixel)
            : accent ? Fonts.Make("Press Start 2P", small ? 7f : 8f, FontStyle.Regular)
            : new Font(s.Kind == "today" ? "Bahnschrift" : "Segoe UI Variable Text", small ? 12f : 13.5f, primary ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
        var tw = g.MeasureString(label, f, PointF.Empty, StringFormat.GenericTypographic).Width;
        if (r.Width <= 0) r.Width = tw + (small ? 18 : 26);
        bool px = s.Kind is "pixel" or "retro";
        g.SmoothingMode = px ? SmoothingMode.None : SmoothingMode.AntiAlias;
        using var path = px ? Stepped(Rectangle.Round(r), 4, null) : Rounded(Rectangle.Round(r), square ? 6 : (int)(r.Height / 2), null);
        using (var bgb = new SolidBrush(primary ? Color.FromArgb(235, c) : Color.FromArgb(240, 16, 10, 34))) g.FillPath(bgb, path);
        using (var pen = new Pen(Color.FromArgb(primary ? 255 : 200, c), px ? 2 : 1.4f)) g.DrawPath(pen, path);
        using var tb = new SolidBrush(primary ? Color.FromArgb(16, 10, 34) : c);
        g.TextRenderingHint = accent ? TextRenderingHint.SingleBitPerPixelGridFit : TextRenderingHint.ClearTypeGridFit;
        g.DrawString(label, f, tb, r.X + (r.Width - tw) / 2, r.Y + (r.Height - f.Size) / 2 - 1, StringFormat.GenericTypographic);
        return r.Width;
    }
}
