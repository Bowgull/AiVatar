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

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= Win32.WS_EX_TOOLWINDOW | Win32.WS_EX_TOPMOST; return cp; }
    }
    // Not activated by Show(): we take focus explicitly (ForceForeground), so it works from inside a game.
    protected override bool ShowWithoutActivation => true;

    public InputWindow(float scale, InputHistory history)
    {
        this.scale = scale; this.history = history;
        stripFont = new Font(Theme.Face, Theme.StripPx * scale, FontStyle.Regular, GraphicsUnit.Pixel);
        Text = "Aang Input";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false; TopMost = true;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Theme.Ink;
        Padding = new Padding((int)(Pad * scale), (int)(8 * scale), (int)(Pad * scale), (int)((7 + StripH) * scale));
        Size = new Size((int)(BaseW * scale), Fit(1));

        box.Multiline = true; box.WordWrap = true; box.BorderStyle = BorderStyle.None;
        box.ScrollBars = ScrollBars.None; box.AcceptsReturn = false; box.AcceptsTab = false;
        box.BackColor = BackColor; box.ForeColor = Theme.Text;
        // 15 px, the same as the bubble's text, scaled by hand: this is a real control, so it is not on the
        // pre-scaled surface the bubble draws to.
        box.Font = new Font(Theme.Face, Theme.BodyPx * scale, FontStyle.Regular, GraphicsUnit.Pixel);
        box.Dock = DockStyle.Fill;
        box.TextChanged += (_, _) => Grow();
        frameFrom = frameTo = FrameTarget; chipFrom = chipTo = ChipTarget;
        fade.Tick += (_, _) => { Invalidate(); if (FadeT >= 1) fade.Stop(); };
        Controls.Add(box);
        Grow();
    }

    int Fit(int lines) => (int)((lines * LineH + 15 + StripH) * scale);

    void Grow()
    {
        var lines = Math.Clamp(box.GetLineFromCharIndex(Math.Max(0, box.TextLength)) + 1, 1, MaxLinesShown);
        var h = Fit(lines);
        if (h != Height) { Height = h; }
        using var p = Rounded(new Rectangle(0, 0, Width, Height), (int)(10 * scale));
        Region = new Region(p);
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
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var p = Rounded(new Rectangle(1, 1, Width - 3, Height - 3), (int)(10 * scale));
        // Gold, like the bubble he answers in (it was cyan: two colour languages on one screen).
        using var halo = new Pen(Theme.Halo, Theme.HaloStroke * scale) { LineJoin = LineJoin.Round };
        using var pen = new Pen(Theme.WithAlpha(Theme.Gold, 240), Theme.Stroke * scale) { LineJoin = LineJoin.Round };
        e.Graphics.DrawPath(halo, p);
        e.Graphics.DrawPath(pen, p);
        PaintModeFrame(e.Graphics);
        PaintStrip(e.Graphics);
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
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        var y = Height - (int)(StripH * scale) - (int)(2 * scale);
        var h = (int)((StripH - 3) * scale);
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
        if (hasQuota) PaintUsage(g, y, h);
    }

    /// <summary>
    /// Weekly use as ten segments, WoW-style, with the number always beside it, a tick for where the week is (so
    /// "44%" reads as ahead of or behind pace), and a thin bar under it for the last five hours. Coloured by the same
    /// rule as before: gold while fine, orange from 40%, red from 50%, green while saving.
    /// </summary>
    void PaintUsage(Graphics g, int y, int h)
    {
        var c = LevelColor(level);
        int seg = Math.Max(3, (int)(5 * scale)), gap = Math.Max(1, (int)(1 * scale)), segH = (int)(8 * scale), thin = Math.Max(2, (int)(3 * scale));
        int barW = 10 * seg + 9 * gap;
        var pct = ModelChip.Percent(week);
        var textW = TextRenderer.MeasureText(g, "100%", stripFont, Size.Empty, TextFormatFlags.NoPadding).Width;
        int right = Width - (int)(Pad * scale);
        int gx = right - textW - (int)(5 * scale) - barW;
        int gy = y + (int)(1 * scale);                                   // the week bar, with the thin one beneath it
        int ty = gy + segH + (int)(2 * scale);

        using (var back = new SolidBrush(Theme.WithAlpha(Theme.Plum, 200)))
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
            using var tick = new Pen(Theme.WithAlpha(Theme.Text, 235), Math.Max(1f, 1.4f * scale));
            g.DrawLine(tick, tx, gy - (int)(2 * scale), tx, gy + segH + (int)(1 * scale));
        }

        using (var tb = new SolidBrush(Theme.WithAlpha(Theme.Secondary, 255)))
        {
            using var back = new SolidBrush(Theme.WithAlpha(Theme.Plum, 200));
            g.FillRectangle(back, new Rectangle(gx, ty, barW, thin));
            var fiveC = five >= 0.9 ? Theme.Red : five >= 0.75 ? Theme.Orange : Theme.Secondary;
            using var fb = new SolidBrush(fiveC);
            g.FillRectangle(fb, new Rectangle(gx, ty, (int)Math.Round(barW * Math.Clamp(five, 0, 1)), thin));
        }

        using (var nb = new SolidBrush(c))
            g.DrawString(pct, stripFont, nb, right - TextRenderer.MeasureText(g, pct, stripFont, Size.Empty, TextFormatFlags.NoPadding).Width, y + (h - stripFont.Height) / 2f);
        usageRect = new Rectangle(gx - (int)(3 * scale), y - (int)(2 * scale), right - gx + (int)(6 * scale), h + (int)(4 * scale));

        if (showUsage)
        {
            var t = $"week {pct} · 5h {ModelChip.Percent(five)}";
            var sz = TextRenderer.MeasureText(g, t, stripFont, Size.Empty, TextFormatFlags.NoPadding);
            using var b = new SolidBrush(Theme.Secondary);
            var tx = gx - (int)(8 * scale) - sz.Width;
            g.DrawString(t, stripFont, b, tx, y + (h - stripFont.Height) / 2f);
            usageRect = Rectangle.Union(usageRect, new Rectangle(tx, y, sz.Width, h));
        }
    }

    Rectangle Pill(Graphics g, int x, int y, int h, string text, Color c, bool filled)
    {
        var scaled = stripFont;
        var w = TextRenderer.MeasureText(g, text, scaled, Size.Empty, TextFormatFlags.NoPadding).Width + (int)(14 * scale);
        var r = new Rectangle(x, y, w, h);
        using var path = Rounded(r, h / 2);
        if (filled) { using var f = new SolidBrush(Theme.WithAlpha(c, 46)); g.FillPath(f, path); }
        using var pen = new Pen(Theme.WithAlpha(c, 210), 1.3f);
        g.DrawPath(pen, path);
        using var b = new SolidBrush(c);
        g.DrawString(text, scaled, b, x + 7 * scale, y + (h - scaled.Height) / 2f);
        return r;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
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
