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
    public const int LineH = 19, Pad = 8, MaxLinesShown = 4, BaseW = 256;

    readonly TextBox box = new();
    readonly InputHistory history;
    readonly float scale;
    IntPtr previous;
    bool closing;

    public event Action<string>? Submitted;
    public event Action? StopRequested;
    public event Action? Dismissed;
    public event Action<int>? PageRequested;

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
        Text = "Aang Input";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false; TopMost = true;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.FromArgb(16, 10, 34);
        Padding = new Padding((int)(Pad * scale), (int)(7 * scale), (int)(Pad * scale), (int)(6 * scale));
        Size = new Size((int)(BaseW * scale), Fit(1));

        box.Multiline = true; box.WordWrap = true; box.BorderStyle = BorderStyle.None;
        box.ScrollBars = ScrollBars.None; box.AcceptsReturn = false; box.AcceptsTab = false;
        box.BackColor = BackColor; box.ForeColor = Color.FromArgb(240, 244, 255);
        box.Font = new Font("Bahnschrift", 11f, FontStyle.Regular, GraphicsUnit.Point);
        box.Dock = DockStyle.Fill;
        box.TextChanged += (_, _) => Grow();
        Controls.Add(box);
        Grow();
    }

    int Fit(int lines) => (int)((lines * LineH + 13) * scale);

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
        using var pen = new Pen(Color.FromArgb(235, 90, 220, 255), 1.8f);
        e.Graphics.DrawPath(pen, p);
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
        if (Visible && !closing) { Hide(); Dismissed?.Invoke(); }
    }

    bool OnFirstLine => box.GetLineFromCharIndex(box.SelectionStart) == 0;
    bool OnLastLine => box.GetLineFromCharIndex(box.SelectionStart) >= box.GetLineFromCharIndex(Math.Max(0, box.TextLength));

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Enter:
                Send(); return true;
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
