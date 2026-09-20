using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// "Press the keys you want." Guessing which key a keyboard really sends is how the last hotkey ended up
/// working in tests and not on the actual keyboard, so the combination is captured from a real key press
/// and then registered; if Windows or another program refuses it, that is said here rather than logged.
/// </summary>
sealed class HotkeyBox : Form
{
    readonly Label prompt = new();
    readonly Label current = new();
    readonly float scale;

    /// <summary>The combination he pressed, e.g. "Ctrl+NumLock". Empty until he presses one.</summary>
    public string Combo { get; private set; } = "";

    /// <summary>Asked to register the combination. Return false if it could not be taken.</summary>
    [System.ComponentModel.Browsable(false)]
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Func<string, bool>? TryRegister { get; set; }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= Win32.WS_EX_TOPMOST; return cp; }
    }

    public HotkeyBox(float scale, string currentCombo)
    {
        this.scale = scale;
        Text = "Aang hotkey";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        TopMost = true;
        KeyPreview = true;
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Color.FromArgb(16, 10, 34);
        Size = new Size((int)(340 * scale), (int)(128 * scale));

        prompt.Text = "Press the keys you want for hide and show.\nEsc to keep the one you have.";
        prompt.ForeColor = Color.FromArgb(240, 244, 255);
        prompt.Font = new Font("Bahnschrift", 10.5f, FontStyle.Regular, GraphicsUnit.Point);
        prompt.AutoSize = false;
        prompt.TextAlign = ContentAlignment.MiddleCenter;
        prompt.Bounds = new Rectangle(0, (int)(16 * scale), Width, (int)(52 * scale));

        current.Text = currentCombo.Length > 0 ? "now: " + currentCombo : "no hotkey is set";
        current.ForeColor = Color.FromArgb(150, 220, 255);
        current.Font = new Font("Bahnschrift", 12f, FontStyle.Bold, GraphicsUnit.Point);
        current.AutoSize = false;
        current.TextAlign = ContentAlignment.MiddleCenter;
        current.Bounds = new Rectangle(0, (int)(70 * scale), Width, (int)(40 * scale));

        Controls.Add(prompt);
        Controls.Add(current);
        using var p = Rounded(new Rectangle(0, 0, Width, Height), (int)(12 * scale));
        Region = new Region(p);
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
        using var p = Rounded(new Rectangle(1, 1, Width - 3, Height - 3), (int)(12 * scale));
        using var pen = new Pen(Color.FromArgb(235, 90, 220, 255), 1.8f);
        e.Graphics.DrawPath(pen, p);
    }

    /// <summary>The name Windows gave the key, in the same spelling the config file uses.</summary>
    public static string NameOf(Keys key) => key switch
    {
        Keys.NumLock => "NumLock",
        Keys.Scroll => "ScrollLock",
        Keys.Pause => "Pause",
        Keys.Space => "Space",
        Keys.Home => "Home",
        Keys.End => "End",
        Keys.Insert => "Insert",
        Keys.Delete => "Delete",
        Keys.PageUp => "PageUp",
        Keys.PageDown => "PageDown",
        Keys.Apps => "Menu",
        >= Keys.F1 and <= Keys.F24 => key.ToString(),
        >= Keys.D0 and <= Keys.D9 => ((char)('0' + (key - Keys.D0))).ToString(),
        >= Keys.NumPad0 and <= Keys.NumPad9 => "NumPad" + (key - Keys.NumPad0),
        >= Keys.A and <= Keys.Z => key.ToString(),
        _ => "",
    };

    /// <summary>Turn a key press into a combination, or empty if it is not one that can be a hotkey.</summary>
    public static string Describe(Keys keyData)
    {
        var key = keyData & Keys.KeyCode;
        if (key is Keys.ControlKey or Keys.ShiftKey or Keys.Menu or Keys.LWin or Keys.RWin or Keys.None) return "";
        var name = NameOf(key);
        if (name.Length == 0) return "";
        var parts = new List<string>();
        if ((keyData & Keys.Control) != 0) parts.Add("Ctrl");
        if ((keyData & Keys.Alt) != 0) parts.Add("Alt");
        if ((keyData & Keys.Shift) != 0) parts.Add("Shift");
        // A bare F-key or a lock key is a fine hotkey on its own; a bare letter is not.
        var standalone = key is >= Keys.F1 and <= Keys.F24 or Keys.NumLock or Keys.Scroll or Keys.Pause;
        if (parts.Count == 0 && !standalone) return "";
        parts.Add(name);
        return string.Join("+", parts);
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if ((keyData & Keys.KeyCode) == Keys.Escape) { Combo = ""; DialogResult = DialogResult.Cancel; Close(); return true; }
        var combo = Describe(keyData);
        if (combo.Length == 0) return true;                    // a modifier on its own: keep waiting
        Log.Write($"hotkey box: key press {keyData} read as '{combo}'");
        if (TryRegister != null && !TryRegister(combo))
        {
            current.Text = combo + " is taken";
            prompt.Text = "Another program already owns that one.\nTry a different key.";
            return true;
        }
        Combo = combo;
        DialogResult = DialogResult.OK;
        Close();
        return true;
    }
}
