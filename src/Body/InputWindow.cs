using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The box Joshua types into. It is a real text box (IME, paste, undo, spell handling all work), shown only
/// while typing, and it hands focus back to whatever had it, usually the game, when it closes.
///
/// Keys:  Enter send | Ctrl+Enter or Shift+Enter new line | Esc stop the running reply, or close |
///        Up / Down recall earlier messages | PageUp / PageDown page the bubble.
/// </summary>
sealed class InputWindow : Form
{
    public const int LineH = 21, Pad = 10, MaxLinesShown = 4, BaseW = 256, StripH = 22;

    readonly TextBox box = new();
    readonly InputHistory history;
    readonly float scale;
    IntPtr previous;
    bool closing;

    public event Action<string>? Submitted;
    public event Action? StopRequested;
    public event Action? Dismissed;
    public event Action<int>? PageRequested;
    public event Action<string>? ModeChosen;          // "auto" | "quick" | "smart" | "deep" | "next"
    public event Action? SavingToggled;
    public event Action? ConsentAccepted;
    public event Action? ConsentDeclined;

    // What the strip under the text shows. Set by the Body whenever the Core reports something.
    string mode = "auto"; bool saving, hasQuota, consent; double week, five; string level = "ok"; string consentWanted = "";
    Rectangle chipRect, savingRect, usageRect;
    bool showUsage;
    public event Action<bool>? UsageShownChanged;
    public void SetUsageShown(bool on) { showUsage = on; Invalidate(); }
    // Pixels, like the bubble (it was 8.5 pt, about 11 px, hard to read at a glance), scaled by hand in the constructor:
    // this is a real control, not the pre-scaled surface the bubble draws to.
    readonly Font stripFont;
    // Pixel accent (StyleLab 2026-09-22): the mode chip and saving/save? pills are short UI words, not a
    // sentence, so Press Start 2P reads fine here - the percentages and the consent line stay in stripFont.
    readonly Font pixelStripFont;

    double weekResetsAt, fiveResetsAt;
    // A change of mode fades its colours over 150 ms (frame and chip) instead of snapping.
    const double FadeMs = 150;
    Color frameFrom, frameTo, chipFrom, chipTo;
    DateTime fadeAt = DateTime.MinValue;
    readonly System.Windows.Forms.Timer fade = new() { Interval = 16 };
    Color FrameTarget => !saving && mode == "auto" ? Color.FromArgb(0, Theme.Gold) : Theme.WithAlpha(Theme.ModeColor(mode, saving), 210);
    Color ChipTarget => Theme.ModeColor(mode, false);
    double FadeT => Math.Clamp((DateTime.UtcNow - fadeAt).TotalMilliseconds / FadeMs, 0, 1);
    static Color Lerp(Color a, Color b, double t) => Color.FromArgb(
        (int)Math.Round(a.A + (b.A - a.A) * t), (int)Math.Round(a.R + (b.R - a.R) * t), (int)Math.Round(a.G + (b.G - a.G) * t), (int)Math.Round(a.B + (b.B - a.B) * t));
    Color FrameNow => Lerp(frameFrom, frameTo, FadeT);
    Color ChipNow => Lerp(chipFrom, chipTo, FadeT);

    public void SetStatus(string mode, bool saving, bool hasQuota, double week, double five, string level, double weekResetsAt = 0, double fiveResetsAt = 0)
    {
        Color f0 = FrameNow, c0 = ChipNow;
        this.mode = mode; this.saving = saving; this.hasQuota = hasQuota; this.week = week; this.five = five; this.level = level;
        this.weekResetsAt = weekResetsAt; this.fiveResetsAt = fiveResetsAt;
        if (FrameTarget != frameTo || ChipTarget != chipTo)
        {
            frameFrom = f0; chipFrom = c0; frameTo = FrameTarget; chipTo = ChipTarget;
            fadeAt = Visible ? DateTime.UtcNow : DateTime.MinValue;             // hidden: no fade, it is simply the new colour
            if (Visible) fade.Start();
        }
        Invalidate();
    }
    public void SetConsent(bool pending, string wanted = "") { consent = pending; consentWanted = wanted; Invalidate(); }
    public bool ConsentPending => consent;

    /// <summary>True while a reply is running: Esc then stops it instead of closing the box.</summary>
    [System.ComponentModel.Browsable(false)]
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool Working { get; set; }
    public string Draft => box.Text;

    /// <summary>Put a half-typed message back. Used when the box is rebuilt after a display-scaling change,
    /// so changing a monitor setting does not throw away what he was in the middle of saying.</summary>
    public void SetDraft(string text)
    {
        box.Text = text ?? "";
        box.SelectionStart = box.TextLength;
        Grow();
    }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= Win32.WS_EX_TOOLWINDOW | Win32.WS_EX_TOPMOST; return cp; }
    }
    // Not activated by Show(): we take focus explicitly (ForceForeground), so it works from inside a game.
    protected override bool ShowWithoutActivation => true;

    public InputWindow(float scale, InputHistory history)
    {
        this.scale = scale; this.history = history;
        // Theme.Face is a private TTF (Atkinson Hyperlegible): new Font(name, ...) can't see it and silently
        // falls back to a system default. Theme.Font() resolves it correctly - the same bug the tray menu had.
        stripFont = Theme.Font(Theme.Face, Theme.StripPx * scale);
        pixelStripFont = Theme.Font(Theme.PixelFace, 8f * scale);
        Text = "Aang Input";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false; TopMost = true;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Theme.Ink;
        // OnPaint draws a gradient, a halo pen, the frame and the whole strip. Undoubled-buffered that is a
        // visible flash on every repaint, and this form repaints while he is typing (2026-09-24, Joshua: "every
        // time i type a letter it glitches... like the frames skip").
        DoubleBuffered = true;
        Padding = new Padding((int)(Pad * scale), (int)(8 * scale), (int)(Pad * scale), (int)((7 + StripH) * scale));
        Size = new Size((int)(BaseW * scale), Fit(1));

        box.Multiline = true; box.WordWrap = true; box.BorderStyle = BorderStyle.None;
        box.ScrollBars = ScrollBars.None; box.AcceptsReturn = false; box.AcceptsTab = false;
        // The reading/typing surface is parchment now, like the bubble (StyleLab 2026-09-22) - dark ink text on
        // it, not the pale text every other ink-filled surface uses. Flat, near the gradient's lighter end
        // (Parch1): a real TextBox cannot paint a gradient, so this is picked to blend where it actually sits.
        box.BackColor = Theme.Parch1; box.ForeColor = Theme.InkText;
        // 15 px, the same as the bubble's text, scaled by hand: this is a real control, so it is not on the
        // pre-scaled surface the bubble draws to. A real TextBox renders through Windows' own ClearType, not
        // anything this app controls, and that reads thinner here than the bubble's GDI+ text does (2026-09-22,
        // Joshua: "thin, hard to read" - about typing, specifically). Bold is the lever actually available.
        box.Font = Theme.Font(Theme.Face, Theme.BodyPx * scale, FontStyle.Bold);
        box.Dock = DockStyle.Fill;
        box.TextChanged += (_, _) => Grow();
        frameFrom = frameTo = FrameTarget; chipFrom = chipTo = ChipTarget;
        fade.Tick += (_, _) => { Invalidate(); if (FadeT >= 1) fade.Stop(); };
        Controls.Add(box);
        Grow();
    }

    /// <summary>A message Joshua pointed at from the scrollback: the row, and enough of its words to
    /// recognise it on a chip.</summary>
    public sealed record Pointed(int Id, string Text);

    /// <summary>Pinned context. His decision, 2026-10-01: these stay until he takes them off, so a back and
    /// forth about one email does not need re-pinning every message.</summary>
    readonly List<Pointed> pins = new();
    /// <summary>The one message a Reply is bound to. Cleared once sent: a reply is about that message, not a
    /// standing setting.</summary>
    Pointed? replying;

    public const int PointerRowH = 22;
    bool HasPointers => pins.Count > 0 || replying != null;
    int PointerH => HasPointers ? (int)(PointerRowH * scale) : 0;

    public IReadOnlyList<int> PinnedIds => pins.Select(p => p.Id).ToArray();
    public int? ReplyingTo => replying?.Id;

    /// <summary>Pin a message as context. Pinning the same one twice is not two pins.</summary>
    public void Pin(int id, string text)
    {
        if (id <= 0 || pins.Any(p => p.Id == id)) return;
        pins.Add(new Pointed(id, text));
        while (pins.Count > 6) pins.RemoveAt(0);      // the row has to stay readable
        Relayout();
    }

    /// <summary>Bind the next message to one he chose. Replaces any earlier binding: there is one reply.</summary>
    public void ReplyTo(int id, string text)
    {
        if (id <= 0) return;
        replying = new Pointed(id, text);
        Relayout();
    }

    /// <summary>Forget the reply binding. Pins are left alone - he removes those himself.</summary>
    public void ClearReply() { if (replying is null) return; replying = null; Relayout(); }

    public void ClearPins() { if (pins.Count == 0) return; pins.Clear(); Relayout(); }

    /// <summary>Extra width while something is attached. At 256px three chips come out as "Octup i...",
    /// which is not a label, it is a shape. The box is only this wide while there is something to show.</summary>
    const int PointerExtra = 110;

    void Relayout()
    {
        Padding = new Padding((int)(Pad * scale), (int)(8 * scale) + PointerH, (int)(Pad * scale), (int)((7 + StripH) * scale));
        var want = (int)((BaseW + (HasPointers ? PointerExtra : 0)) * scale);
        if (Width != want)
        {
            // Grow leftwards, so the box stays put against the pet rather than sliding out from under it.
            var screen = Screen.FromPoint(Location).WorkingArea;
            var x = Math.Clamp(Location.X, screen.Left, Math.Max(screen.Left, screen.Right - want));
            Bounds = new Rectangle(x, Location.Y, want, Height);
        }
        regionFor = Size.Empty;                        // the rounded region must be rebuilt at the new height
        Grow();
        Invalidate();
    }

    /// <summary>Where each chip's x sits, rebuilt on every paint so a click lands on what is drawn.</summary>
    readonly List<(RectangleF close, int id)> chipCloses = new();

    int Fit(int lines) => (int)((lines * LineH + 15 + StripH) * scale) + PointerH;

    /// <summary>The size the rounded Region was last built for, so it is only rebuilt when the box really resizes.</summary>
    Size regionFor;
    /// <summary>Kept so the previous one can be released; assigning Control.Region does not reliably free it.</summary>
    Region? ownRegion;

    void Grow()
    {
        var lines = Math.Clamp(box.GetLineFromCharIndex(Math.Max(0, box.TextLength)) + 1, 1, MaxLinesShown);
        var h = Fit(lines);
        if (h != Height) { Height = h; }
        // This runs on EVERY keystroke (box.TextChanged -> Grow). Rebuilding the rounded Region and forcing a
        // full repaint are only needed when the box actually changed size: nothing OnPaint draws depends on the
        // text, which the TextBox child paints itself. Doing both per character is what made typing stutter, and
        // it leaked a GDI Region every time (2026-09-24). Wrapping is unaffected; only the redundant work is gone.
        if (Size == regionFor) return;
        regionFor = Size;
        using var p = Rounded(new Rectangle(0, 0, Width, Height), (int)(10 * scale));
        var next = new Region(p);
        Region = next;
        ownRegion?.Dispose();
        ownRegion = next;
        Invalidate();
    }

    static GraphicsPath Rounded(Rectangle r, int radius)
    {
        var d = radius * 2; var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        using var p = Rounded(new Rectangle(1, 1, Width - 3, Height - 3), (int)(10 * scale));
        // Gold, like the bubble he answers in (it was cyan: two colour languages on one screen).
        using var halo = new Pen(Theme.Halo, Theme.HaloStroke * scale) { LineJoin = LineJoin.Round };
        g.DrawPath(halo, p);
        // The parchment reading/typing surface, inset inside the ink+gold frame - same 6px margin as the
        // bubble (StyleLab 2026-09-22), so the tail-less shapes still read as the same object.
        var inset = Rectangle.Inflate(new Rectangle(1, 1, Width - 3, Height - 3), -(int)Math.Round(6 * scale), -(int)Math.Round(6 * scale));
        if (inset.Width > 0 && inset.Height > 0)
        {
            using var ip = Rounded(inset, Math.Max(3, (int)(7 * scale)));
            using (var pg = new LinearGradientBrush(inset, Theme.Parch1, Theme.Parch2, 90f)) g.FillPath(pg, ip);
            using var ipen = new Pen(Theme.ParchEdge, 1f); g.DrawPath(ipen, ip);
        }
        using var pen = new Pen(Theme.WithAlpha(Theme.Gold, 240), Theme.Stroke * scale) { LineJoin = LineJoin.Round };
        g.DrawPath(pen, p);
        PaintModeFrame(g);
        PaintPointers(g);
        PaintStrip(g);
    }

    /// <summary>
    /// The row above what he is typing: what this message is a reply to, and anything he pinned.
    ///
    /// Drawn rather than built from controls because this form is a layered, hand-painted surface - a real
    /// FlowLayoutPanel here would sit on top of the parchment gradient with its own background and break the
    /// one-object look the frame and the bubble share.
    /// </summary>
    void PaintPointers(Graphics g)
    {
        chipCloses.Clear();
        if (!HasPointers) return;

        // Inside the parchment, not inside the window: the frame has a 6px inset and a gold stroke, and a
        // chip laid out against Width ran straight over both (2026-10-01, first capture).
        float edge = (6 + 4) * scale;
        float left = edge, right = Width - edge;
        float h = (PointerRowH - 6) * scale, y = 7 * scale;
        float gap = 4 * scale;
        using var font = Theme.Font(Theme.Face, 10.5f * scale);
        using var ink = new SolidBrush(Theme.InkText);
        // Trimmed by the text renderer inside each chip's own rectangle. Shortening the string first is a
        // guess at the width; this is the width.
        using var fmt = new StringFormat(StringFormatFlags.NoWrap) { Trimming = StringTrimming.EllipsisCharacter, LineAlignment = StringAlignment.Center };

        // Everything he pointed at has to be on screen. Sharing the row rather than drawing until it runs
        // out means the third pin cannot silently vanish, which is what the first version did.
        var items = new List<(string lead, string body, int id)>();
        if (replying != null) items.Add(("reply: ", replying.Text, -1));
        foreach (var pinned in pins) items.Add(("", pinned.Text, pinned.Id));

        float each = (right - left - gap * (items.Count - 1)) / items.Count;
        float min = 54 * scale;
        var shown = items.Count;
        if (each < min)
        {
            // Too many to read. Show as many as stay legible and count the rest, so the number is still true.
            shown = Math.Max(1, (int)((right - left + gap) / (min + gap)) - 1);
            each = (right - left - gap * shown) / shown;      // the last slot is the "+N" chip
        }

        float x = left;
        for (var i = 0; i < shown; i++)
        {
            var (lead, body, id) = items[i];
            var r = new RectangleF(x, y, each, h);
            var isReply = id < 0;
            // A reply and a pin are different things, so they are different colours: the reply is solid gold
            // because it says what the message IS, a pin is pale because it only says what it is about.
            var fill = isReply ? Theme.WithAlpha(Theme.Gold, 210) : Theme.WithAlpha(Theme.WoodCream, 225);
            using (var b = new SolidBrush(fill)) using (var path = Rounded(Rectangle.Round(r), (int)(5 * scale))) g.FillPath(b, path);
            using (var pen = new Pen(Theme.WithAlpha(Theme.GoldDeep, 200), 1f)) using (var path = Rounded(Rectangle.Round(r), (int)(5 * scale))) g.DrawPath(pen, path);

            var closeW = isReply ? 0f : 14 * scale;
            var text = new RectangleF(r.X + 5 * scale, r.Y, r.Width - 8 * scale - closeW, r.Height);
            g.DrawString(lead + OneLine(body), font, ink, text, fmt);
            if (!isReply)
            {
                var close = new RectangleF(r.Right - closeW, r.Y, closeW, r.Height);
                using var xf = Theme.Font(Theme.Face, 11f * scale, FontStyle.Bold);
                using var cf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("x", xf, ink, close, cf);
                chipCloses.Add((close, id));
            }
            x += each + gap;
        }
        if (shown < items.Count)
        {
            var r = new RectangleF(x, y, right - x, h);
            using (var b = new SolidBrush(Theme.WithAlpha(Theme.WoodCream, 160))) using (var path = Rounded(Rectangle.Round(r), (int)(5 * scale))) g.FillPath(b, path);
            using var cf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("+" + (items.Count - shown), font, ink, r, cf);
        }
    }

    /// <summary>One line, however it was typed: a pinned message can be a paragraph, and a chip is a line.</summary>
    static string OneLine(string text) =>
        string.Join(' ', text.Split(new[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries));

    /// <summary>First few words, cut on a word where it can be, so a chip reads as language and not as a hash.</summary>
    static string Shorten(string text, int max)
    {
        var one = string.Join(' ', text.Split(new[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries));
        if (one.Length <= max) return one;
        var cut = one[..max];
        var space = cut.LastIndexOf(' ');
        return (space > max / 2 ? cut[..space] : cut) + "...";
    }

    /// <summary>
    /// The mode's own colour as an inner stroke inside the gold outline, so Quick, Smart and Deep can be told apart
    /// at a glance and in greyscale (Deep also carries a small gold diamond, so the difference is shape as well as
    /// colour). Auto is the default and adds nothing: gold on its own.
    /// </summary>
    void PaintModeFrame(Graphics g)
    {
        var c = FrameNow;
        if (c.A < 3) return;
        var inset = (int)(4 * scale);
        using var p = Rounded(new Rectangle(inset, inset, Width - 2 * inset - 1, Height - 2 * inset - 1), Math.Max(3, (int)(7 * scale)));
        using var pen = new Pen(c, Math.Max(1.2f, 1.5f * scale));
        g.DrawPath(pen, p);
        if (mode == "deep" && !saving && FadeT >= 1)
        {
            float cx = Width / 2f, cy = 1.5f * scale, r = 4.2f * scale;
            using var gold = new SolidBrush(Theme.Gold);
            using var edge = new Pen(Theme.Ink, 1.2f * scale);
            var d = new[] { new PointF(cx, cy - r + 2 * scale), new PointF(cx + r, cy + 2 * scale), new PointF(cx, cy + r + 2 * scale), new PointF(cx - r, cy + 2 * scale) };
            g.FillPolygon(gold, d); g.DrawPolygon(edge, d);
        }
    }

    // Quota levels: the same colours as everywhere. Gold is Aang; orange means careful; red means over; green means saving.
    static Color LevelColor(string level) => level switch
    {
        "saving" => Theme.Green, "offer" => Theme.Red, "warn" => Theme.Orange,
        _ => Theme.Gold,
    };

    // The chip row: [Auto v]  [saving]                       week 34% · 5h 12%
    void PaintStrip(Graphics g)
    {
        // AntiAliasGridFit, not ClearType (2026-09-22, Joshua: "thin, hard to read") - matches what already
        // reads well in the bubble; Pill() below still switches to SingleBitPerPixelGridFit for its own pixel-
        // accent labels, a deliberate different look, not body text.
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        // The "Auto" pill was measured live poking past the parchment panel's own bottom edge and getting hard-
        // clipped by the window's rounded corner (2026-09-22, Joshua: "just outside of frame") - the old offset
        // (StripH*scale + 2*scale) left the pill's bottom only ~5px off the window edge, less than the 6px the
        // parchment inset itself keeps clear. 10px clears both the inset and the window's own corner radius.
        var h = (int)((StripH - 3) * scale);
        var y = Height - (int)(10 * scale) - h;
        int x = (int)(Pad * scale);
        using var line = new Pen(Theme.WithAlpha(Theme.Gold, 60));
        g.DrawLine(line, x, y - (int)(2 * scale), Width - x, y - (int)(2 * scale));

        if (consent)
        {
            using var b = new SolidBrush(Theme.Orange);
            g.DrawString($"Allow {consentWanted} once?  Enter = yes   Esc = no", stripFont, b, x, y + 1);
            chipRect = savingRect = Rectangle.Empty; return;
        }

        // The chip wears its mode's colour (Auto is plain gold), matching the inner frame around the box.
        chipRect = Pill(g, x, y, h, ModelChip.Label(mode) + " ▾", ChipNow, true);
        x = chipRect.Right + (int)(6 * scale);
        savingRect = Rectangle.Empty;
        if (saving) { savingRect = Pill(g, x, y, h, "saving", Theme.Green, true); }
        else if (level == "offer") { savingRect = Pill(g, x, y, h, "save?", Theme.Red, false); }

        usageRect = Rectangle.Empty;
        // Never let the usage meter, which is laid out from the right, run into the pill cluster laid out from
        // the left - "Deep" + "saving" is the widest the cluster gets (Joshua, 2026-09-22: overlap risk found
        // while fixing the chip's contrast).
        var clusterRight = (savingRect.IsEmpty ? chipRect.Right : savingRect.Right) + (int)(10 * scale);
        if (hasQuota) PaintUsage(g, y, h, clusterRight);
    }

    /// <summary>
    /// Weekly use as ten segments, WoW-style, with the number always beside it, a tick for where the week is (so
    /// "44%" reads as ahead of or behind pace), and a thin bar under it for the last five hours. Coloured by the same
    /// rule as before: gold while fine, orange from 40%, red from 50%, green while saving.
    /// </summary>
    void PaintUsage(Graphics g, int y, int h, int minX)
    {
        var c = LevelColor(level);
        int seg = Math.Max(3, (int)(5 * scale)), gap = Math.Max(1, (int)(1 * scale)), segH = (int)(8 * scale), thin = Math.Max(2, (int)(3 * scale));
        int barW = 10 * seg + 9 * gap;
        var pct = ModelChip.Percent(week);
        var textW = TextRenderer.MeasureText(g, "100%", stripFont, Size.Empty, TextFormatFlags.NoPadding).Width;
        int right = Width - (int)(Pad * scale);
        int gx = Math.Max(minX, right - textW - (int)(5 * scale) - barW);
        int gy = y + (int)(1 * scale);                                   // the week bar, with the thin one beneath it
        int ty = gy + segH + (int)(2 * scale);

        // Track colour follows the bubble's scrollbar: dim ink, not plum, now that this sits on parchment.
        using (var back = new SolidBrush(Theme.WithAlpha(Theme.InkDim, 90)))
        using (var fill = new SolidBrush(Theme.WithAlpha(c, 235)))
            for (int i = 0; i < 10; i++)
            {
                var r = new Rectangle(gx + i * (seg + gap), gy, seg, segH);
                g.FillRectangle(back, r);
                var f = Math.Clamp(week * 10 - i, 0, 1);
                if (f > 0.02) g.FillRectangle(fill, new Rectangle(r.X, r.Y, Math.Max(1, (int)Math.Round(seg * f)), segH));
            }

        // Where the week is. A tick past the fill means there is room; a fill past the tick means faster than the week.
        if (weekResetsAt > 0)
        {
            var left = weekResetsAt - DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var elapsed = Math.Clamp(1 - left / (7 * 86400.0), 0, 1);
            var tx = gx + (int)Math.Round(barW * elapsed);
            using var tick = new Pen(Theme.WithAlpha(Theme.InkText, 235), Math.Max(1f, 1.4f * scale));
            g.DrawLine(tick, tx, gy - (int)(2 * scale), tx, gy + segH + (int)(1 * scale));
        }

        using (var back = new SolidBrush(Theme.WithAlpha(Theme.InkDim, 90)))
        {
            g.FillRectangle(back, new Rectangle(gx, ty, barW, thin));
            var fiveC = five >= 0.9 ? Theme.Red : five >= 0.75 ? Theme.Orange : Theme.InkDim;
            using var fb = new SolidBrush(fiveC);
            g.FillRectangle(fb, new Rectangle(gx, ty, (int)Math.Round(barW * Math.Clamp(five, 0, 1)), thin));
        }

        // Dark ink, not the level colour: gold-on-parchment read poorly (too close in tone). The bars still
        // carry the colour signal; the number just needs to be legible.
        using (var nb = new SolidBrush(Theme.InkText))
            g.DrawString(pct, stripFont, nb, right - TextRenderer.MeasureText(g, pct, stripFont, Size.Empty, TextFormatFlags.NoPadding).Width, y + (h - stripFont.Height) / 2f);
        usageRect = new Rectangle(gx - (int)(3 * scale), y - (int)(2 * scale), right - gx + (int)(6 * scale), h + (int)(4 * scale));

        if (showUsage)
        {
            var t = $"week {pct} · 5h {ModelChip.Percent(five)}";
            var sz = TextRenderer.MeasureText(g, t, stripFont, Size.Empty, TextFormatFlags.NoPadding);
            using var b = new SolidBrush(Theme.InkDim);
            var tx = gx - (int)(8 * scale) - sz.Width;
            g.DrawString(t, stripFont, b, tx, y + (h - stripFont.Height) / 2f);
            usageRect = Rectangle.Union(usageRect, new Rectangle(tx, y, sz.Width, h));
        }
    }

    Rectangle Pill(Graphics g, int x, int y, int h, string text, Color c, bool filled)
    {
        // Redesigned for weight (2026-09-22, Joshua: "so light and frail looking") - a hairline stroke over a
        // near-invisible 18% tint read as barely there against the parchment. A solid tint plus a bottom lip,
        // the same carved-button language as the gold menu's own pill, gives it body without going heavy.
        var scaled = pixelStripFont;
        var w = TextRenderer.MeasureText(g, text, scaled, Size.Empty, TextFormatFlags.NoPadding).Width + (int)(16 * scale);
        var r = new Rectangle(x, y, w, h);
        using var path = Rounded(r, h / 2);
        if (filled) { using var f = new SolidBrush(Theme.WithAlpha(c, 95)); g.FillPath(f, path); }
        using (var lip = new Pen(Theme.WithAlpha(Color.Black, 60), Math.Max(1.4f, 1.8f * scale)))
            g.DrawArc(lip, r.X + 1, r.Y + r.Height / 3, r.Width - 2, r.Height - 2, 20, 140);          // a shadowed lower edge, not a flat ring
        using var pen = new Pen(Theme.WithAlpha(c, 235), Math.Max(1.6f, 1.9f * scale));
        g.DrawPath(pen, path);
        // Dark ink, not the mode colour (2026-09-22, live screenshot: gold text on a gold-tinted pill was
        // nearly unreadable). The border still carries which mode it is; the text just needs to be legible.
        using var b = new SolidBrush(Theme.InkText);
        var old = g.TextRenderingHint;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
        g.DrawString(text, scaled, b, x + 8 * scale, y + (h - scaled.Height) / 2f);
        g.TextRenderingHint = old;
        return r;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
        // An x on a pinned chip takes that one off. Checked before the mode pill: the rows do not overlap,
        // but this one is above and a miss here should never cycle the mode.
        foreach (var (close, id) in chipCloses)
            if (close.Contains(e.Location)) { pins.RemoveAll(p => p.Id == id); Relayout(); box.Focus(); return; }
        if (chipRect.Contains(e.Location)) ModeChosen?.Invoke("next");
        else if (usageRect.Contains(e.Location)) { showUsage = !showUsage; UsageShownChanged?.Invoke(showUsage); Invalidate(); }
        else if (savingRect.Contains(e.Location)) SavingToggled?.Invoke();
        box.Focus();
    }

    /// <summary>Show the box just below the bubble and take keyboard focus, remembering who had it.</summary>
    public void Open(Point bodyLocation, IntPtr previousForeground)
    {
        previous = previousForeground;
        closing = false;
        var wa = Screen.FromPoint(bodyLocation).WorkingArea;
        var x = Math.Clamp(bodyLocation.X + (int)(6 * scale), wa.Left, wa.Right - Width);
        var y = Math.Min(bodyLocation.Y + (int)(132 * scale), wa.Bottom - Height - 4);
        Location = new Point(x, y);
        if (!Visible) Show();
        Win32.ForceForeground(Handle);
        box.Focus();
        box.SelectionStart = box.TextLength;
    }

    /// <summary>Hide the box. When <paramref name="giveBackFocus"/> the previous window (the game) gets focus back.</summary>
    public void Close(bool giveBackFocus)
    {
        if (!Visible) return;
        closing = true;
        Hide();
        if (giveBackFocus && previous != IntPtr.Zero) Win32.ForceForeground(previous);
        closing = false;
    }

    // Clicking away closes the box quietly, keeping the draft, and does NOT steal focus back from what was clicked.
    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        // Hide after the click that caused this has been delivered; hiding inside the deactivation swallowed it.
        BeginInvoke(() => { if (Visible && !closing && ActiveForm != this) { Hide(); Dismissed?.Invoke(); } });
    }

    bool OnFirstLine => box.GetLineFromCharIndex(box.SelectionStart) == 0;
    bool OnLastLine => box.GetLineFromCharIndex(box.SelectionStart) >= box.GetLineFromCharIndex(Math.Max(0, box.TextLength));

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Enter when consent && box.Text.Trim().Length == 0:
                ConsentAccepted?.Invoke(); return true;
            case Keys.Enter:
                Send(); return true;
            case Keys.Escape when consent:
                ConsentDeclined?.Invoke(); Close(true); Dismissed?.Invoke(); return true;
            case Keys.Control | Keys.Enter:
            case Keys.Shift | Keys.Enter:
                box.SelectedText = Environment.NewLine; return true;
            case Keys.Escape:
                if (Working) StopRequested?.Invoke();
                else { Close(true); Dismissed?.Invoke(); }
                return true;
            case Keys.Up when OnFirstLine:
                { var prev = history.Prev(box.Text); if (prev != null) SetText(prev); return true; }
            case Keys.Down when OnLastLine && history.Browsing:
                { var next = history.Next(); if (next != null) SetText(next); return true; }
            case Keys.PageUp: PageRequested?.Invoke(-1); return true;
            case Keys.PageDown: PageRequested?.Invoke(1); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    void SetText(string s) { box.Text = s; box.SelectionStart = box.TextLength; }

    void Send()
    {
        var text = box.Text.Trim();
        if (text.Length == 0) return;                          // an empty Enter does nothing
        history.Add(text);
        box.Clear();
        Close(true);
        Submitted?.Invoke(text);
    }

    /// <summary>Test hook: what the box currently holds.</summary>
    public string Text_ => box.Text;
}
