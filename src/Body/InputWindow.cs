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

    public void SetStatus(string mode, bool saving, bool hasQuota, double week, double five, string level)
    {
        this.mode = mode; this.saving = saving; this.hasQuota = hasQuota; this.week = week; this.five = five; this.level = level;
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
        PaintStrip(e.Graphics);
    }

    // Quota levels: the same colours as everywhere. Gold is Aang; orange means careful; red means over; green means saving.
    static Color LevelColor(string level) => level switch
    {
        "saving" => Theme.Green, "offer" => Theme.Red, "warn" => Theme.Orange,
        _ => Theme.Secondary,
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

        chipRect = Pill(g, x, y, h, ModelChip.Label(mode) + " ▾", Theme.Gold, true);
        x = chipRect.Right + (int)(6 * scale);
        savingRect = Rectangle.Empty;
        if (saving) { savingRect = Pill(g, x, y, h, "saving quota", Theme.Green, true); }
        else if (level == "offer") { savingRect = Pill(g, x, y, h, "save quota?", Theme.Red, false); }

        usageRect = Rectangle.Empty;
        if (hasQuota)
        {
            // A small gauge: filled to the week's usage, coloured by the 40% / 50% rule, ticks at 40 and 50.
            // The numbers stay hidden until it is clicked.
            var c = LevelColor(level);
            int gw = (int)(34 * scale), gh = (int)(11 * scale);
            var gx = Width - (int)(Pad * scale) - gw; var gy = y + (h - gh) / 2;
            var gr = new Rectangle(gx, gy, gw, gh);
            using (var path = Rounded(gr, gh / 2))
            {
                using var back = new SolidBrush(Color.FromArgb(40, c)); g.FillPath(back, path);
                var fill = (int)Math.Round(gw * Math.Clamp(week, 0, 1));
                if (fill > 0)
                {
                    var old = g.Clip; g.SetClip(new Rectangle(gx, gy, fill, gh));
                    using var fb = new SolidBrush(Color.FromArgb(200, c)); g.FillPath(fb, path);
                    g.Clip = old;
                }
                using var pen = new Pen(Color.FromArgb(210, c), 1.2f); g.DrawPath(pen, path);
            }
            using (var tick = new Pen(Color.FromArgb(160, 16, 10, 34), 1f))
                foreach (var at in new[] { 0.4, 0.5 }) { var tx = gx + (int)(gw * at); g.DrawLine(tick, tx, gy + 2, tx, gy + gh - 2); }
            usageRect = Rectangle.Inflate(gr, (int)(3 * scale), (int)(3 * scale));
            if (showUsage)
            {
                var t = $"week {ModelChip.Percent(week)} · 5h {ModelChip.Percent(five)}";
                var sz = TextRenderer.MeasureText(g, t, stripFont, Size.Empty, TextFormatFlags.NoPadding);
                using var b = new SolidBrush(c);
                var tx = gx - (int)(6 * scale) - sz.Width;
                g.DrawString(t, stripFont, b, tx, y + 1);
                usageRect = Rectangle.Union(usageRect, new Rectangle(tx, y, sz.Width, h));
            }
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
