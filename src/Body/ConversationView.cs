using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// Reading back a conversation, rather than looking it up in a table.
///
/// The Panel's History tab used to be a three-column ListView (When / Who / What was said) with the selected
/// row's full text in a box underneath. That is a lookup tool: fine for "find the turn where I said X",
/// useless for "what were we talking about on Monday", which is what Joshua actually asked for. You cannot
/// read a conversation one selected row at a time.
///
/// So: both voices at once, told apart without reading a word. Joshua's turns sit on recessed plum with a YOU
/// label, Aang's on parchment, which is the same surface he speaks on in the bubble. Theme.Plum, PlumDeep and
/// PlumEdge already existed and were used only for the quiet button; this is the second thing in the whole app
/// that uses them.
///
/// Conversations are separated by gaps in time rather than by session id, because that is how he remembers
/// them. A quiet half hour ends one conversation and starts another, and the divider says when.
/// </summary>
sealed class ConversationView : Control
{
    /// <param name="Id">The database row. 0 means "not known", which is what a turn read from an older
    /// reply looks like; the menu stays closed on those rather than acting on the wrong row.</param>
    public sealed record Turn(string Stamp, string Who, string Text, int Id = 0);

    /// <summary>A quiet stretch this long reads as a new conversation. Thirty minutes is long enough that a
    /// pause to make coffee does not split a thread, and short enough that the morning and the evening are
    /// not run together.</summary>
    static readonly TimeSpan NewConversation = TimeSpan.FromMinutes(30);

    readonly float s;
    List<Turn> turns = new();
    List<Block> blocks = new();
    int scroll, contentH;
    bool toBottom;
    bool layoutStale = true;

    /// <summary>A laid-out thing to draw: either a divider between conversations or one person's turn. Laid
    /// out once per resize rather than per paint, because wrapping a few hundred turns on every scroll tick
    /// is exactly how a list like this ends up stuttering.</summary>
    sealed class Block
    {
        public bool Divider;
        public string Label = "";          // the divider's date, or "YOU" / "AANG"
        public string Time = "";
        public List<string> Lines = new();
        public bool Mine;
        public int Y, H;
        public int Id;
        public string Text = "";       // the unwrapped original, for Copy and for the pinned chip
    }

    public ConversationView(float scale)
    {
        s = scale;
        DoubleBuffered = true;
        BackColor = Theme.Panel2;
        SetStyle(ControlStyles.ResizeRedraw | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
    }

    /// <param name="atNewest">Open on the most recent turn, the way every chat window does. False for search
    /// results, where the best match is the point, not the time.</param>
    public void SetTurns(IEnumerable<Turn> t, bool atNewest = true)
    {
        turns = t.ToList();
        scroll = 0;
        toBottom = atNewest;   // the height is not known until the layout runs, so this is applied there
        layoutStale = true;
        Invalidate();
    }

    /// <summary>Everything currently loaded, as plain text, for the Copy button. "YOU" and "Aang" rather than
    /// the stored role names, so what is pasted reads the way the panel does.</summary>
    public string AsText() => string.Join(Environment.NewLine + Environment.NewLine,
        turns.Select(t => (Mine(t.Who) ? "YOU" : "Aang") + "  " + t.Stamp + Environment.NewLine + t.Text));

    public bool IsEmpty => turns.Count == 0;
    /// <summary>Shown instead of the conversation when there is nothing to show. [DesignerSerializationVisibility]
    /// because this control is built in code, never dropped on a designer surface, and WFO1000 is an error here.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string EmptyMessage { get; set; } = "";

    static bool Mine(string who) => who.Equals("user", StringComparison.OrdinalIgnoreCase)
                                 || who.Equals("joshua", StringComparison.OrdinalIgnoreCase)
                                 || who.Equals("you", StringComparison.OrdinalIgnoreCase);

    /// <summary>What Joshua chose from a message's own menu. The view does not act on any of these itself
    /// (except Copy, which needs nothing from the Core): it names the row, and the Panel sends it.</summary>
    public event Action<int, string>? ReplyRequested;      // row id, the text, so the box can quote it
    public event Action<int, string>? PinRequested;
    public event Action<int>? ForgetRequested;

    /// <summary>The message under a point, or null for a divider, a gap, or empty space.</summary>
    Block? BlockAt(int x, int y)
    {
        if (x < 0 || x > Width) return null;
        foreach (var b in blocks)
        {
            if (b.Divider) continue;
            var top = b.Y - scroll;
            if (y >= top && y < top + b.H) return b;
        }
        return null;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();
        if (e.Button != MouseButtons.Right) return;
        if (layoutStale) return;                       // nothing has been measured yet: no row to name
        var hit = BlockAt(e.X, e.Y);
        if (hit is null) return;
        // A turn with no row id came from somewhere that did not know it. Copy still works; anything that
        // would act on a row stays out, rather than guessing at one and acting on the wrong message.
        ShowMenu(hit, e.Location);
    }

    void ShowMenu(Block b, Point at)
    {
        var menu = new ContextMenuStrip { ShowImageMargin = false };
        void Add(string label, Action go, bool on = true)
        {
            var item = new ToolStripMenuItem(label) { Enabled = on };
            item.Click += (_, _) => go();
            menu.Items.Add(item);
        }
        var known = b.Id > 0;
        Add("Reply to this", () => ReplyRequested?.Invoke(b.Id, b.Text), known);
        Add("Add as context", () => PinRequested?.Invoke(b.Id, b.Text), known);
        Add("Copy text", () => { try { Clipboard.SetDataObject(b.Text, true, 5, 60); } catch { /* another app had the clipboard */ } });
        menu.Items.Add(new ToolStripSeparator());
        Add("Forget this", () => ForgetRequested?.Invoke(b.Id), known);
        GoldMenu.Apply(menu);
        menu.Closed += (_, _) => menu.Dispose();
        menu.Show(this, at);
    }

    protected override void OnResize(EventArgs e) { base.OnResize(e); layoutStale = true; Invalidate(); }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        Scroll(-e.Delta / 120 * (int)(54 * s));
    }

    protected override bool IsInputKey(Keys k) => k is Keys.Up or Keys.Down or Keys.PageUp or Keys.PageDown or Keys.Home or Keys.End || base.IsInputKey(k);

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        var page = Math.Max(1, Height - (int)(24 * s));
        switch (e.KeyCode)
        {
            case Keys.Down: Scroll((int)(40 * s)); break;
            case Keys.Up: Scroll(-(int)(40 * s)); break;
            case Keys.PageDown: Scroll(page); break;
            case Keys.PageUp: Scroll(-page); break;
            case Keys.Home: Scroll(int.MinValue / 2); break;
            case Keys.End: Scroll(int.MaxValue / 2); break;
            default: return;
        }
        e.Handled = true;
    }

    void Scroll(int by)
    {
        var max = Math.Max(0, contentH - Height);
        var next = Math.Clamp(scroll + by, 0, max);
        if (next == scroll) return;
        scroll = next;
        Invalidate();
    }

    // ---------------------------------------------------------------- layout

    int Pad => (int)(14 * s);
    int BubblePad => (int)(10 * s);
    int LabelH => (int)(16 * s);
    int Gap => (int)(10 * s);
    int DividerH => (int)(34 * s);

    void Measure(Graphics g)
    {
        blocks = new List<Block>();
        var w = Math.Max(120, Width - 2 * Pad);
        using var body = Theme.Font(Theme.Face, 14f);
        var textW = w - 2 * BubblePad;
        var lineH = (int)Math.Ceiling(g.MeasureString("Ag", body).Height);
        var y = Pad;
        DateTime? last = null;

        foreach (var t in turns)
        {
            var when = Parse(t.Stamp);
            // A gap, or the very first turn, opens a conversation.
            if (last is null || (when is DateTime w2 && when - last > NewConversation))
            {
                blocks.Add(new Block { Divider = true, Label = DayLabel(when), Y = y, H = DividerH });
                y += DividerH;
            }
            last = when ?? last;

            var mine = Mine(t.Who);
            var lines = Wrap(g, t.Text, body, textW);
            var h = LabelH + lines.Count * lineH + 2 * BubblePad;
            blocks.Add(new Block { Mine = mine, Label = mine ? "YOU" : "AANG", Time = Clock(when), Lines = lines, Y = y, H = h,
                                   Id = t.Id, Text = t.Text });
            y += h + Gap;
        }
        contentH = y + Pad;
        if (toBottom) { scroll = Math.Max(0, contentH - Height); toBottom = false; }
        scroll = Math.Clamp(scroll, 0, Math.Max(0, contentH - Height));
        layoutStale = false;
    }

    static List<string> Wrap(Graphics g, string text, Font f, int w)
    {
        var outp = new List<string>();
        foreach (var para in text.Replace("\r", "").Split('\n'))
        {
            if (para.Length == 0) { outp.Add(""); continue; }
            var line = "";
            foreach (var word in para.Split(' '))
            {
                var next = line.Length == 0 ? word : line + " " + word;
                if (g.MeasureString(next, f, PointF.Empty, StringFormat.GenericTypographic).Width <= w) { line = next; continue; }
                if (line.Length > 0) outp.Add(line);
                line = word;
                // A single word wider than the column (a long path, a URL) is broken rather than left to run
                // out of the block.
                while (g.MeasureString(line, f, PointF.Empty, StringFormat.GenericTypographic).Width > w && line.Length > 1)
                {
                    var cut = line.Length;
                    while (cut > 1 && g.MeasureString(line[..cut], f, PointF.Empty, StringFormat.GenericTypographic).Width > w) cut--;
                    outp.Add(line[..cut]);
                    line = line[cut..];
                }
            }
            outp.Add(line);
        }
        return outp;
    }

    // ---------------------------------------------------------------- paint

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(BackColor);
        if (layoutStale) Measure(g);

        if (turns.Count == 0)
        {
            if (EmptyMessage.Length == 0) return;
            using var f = Theme.Font(Theme.Face, 14f);
            using var b = new SolidBrush(Theme.Secondary);
            g.DrawString(EmptyMessage, f, b, Pad, Pad);
            return;
        }

        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var body = Theme.Font(Theme.Face, 14f);
        using var labelF = Theme.Font(Theme.PixelFace, 7f);
        using var timeF = Theme.Font(Theme.Face, 11.5f);
        var lineH = (int)Math.Ceiling(g.MeasureString("Ag", body).Height);
        var w = Math.Max(120, Width - 2 * Pad);

        foreach (var b in blocks)
        {
            var y = b.Y - scroll;
            if (y + b.H < -40 || y > Height + 40) continue;        // off screen: do not draw it

            if (b.Divider)
            {
                using var dp = new Pen(Theme.WithAlpha(Theme.PlumEdge, 90), 1f);
                using var df = Theme.Font(Theme.Face, 11.5f);
                using var db = new SolidBrush(Theme.Secondary);
                var tw = g.MeasureString(b.Label, df, PointF.Empty, StringFormat.GenericTypographic).Width;
                var mid = y + DividerH / 2f;
                g.DrawLine(dp, Pad, mid, Pad + (w - tw) / 2f - 10, mid);
                g.DrawLine(dp, Pad + (w + tw) / 2f + 10, mid, Pad + w, mid);
                g.DrawString(b.Label, df, db, Pad + (w - tw) / 2f, mid - df.Height / 2f, StringFormat.GenericTypographic);
                continue;
            }

            var rect = new RectangleF(Pad, y, w, b.H);
            using (var path = Round(rect, 6f * s))
            {
                if (b.Mine)
                {
                    // Recessed plum: darker at the top so it reads as sunk into the panel, the same bevel
                    // direction the bubble's reading pane uses. His own words should feel pressed in; Aang's
                    // sit on the surface.
                    using var fill = new LinearGradientBrush(rect, Theme.PlumDeep, Theme.Plum, 90f);
                    g.FillPath(fill, path);
                    using var edge = new Pen(Theme.WithAlpha(Theme.PlumEdge, 150), 1.2f);
                    g.DrawPath(edge, path);
                }
                else
                {
                    using var fill = new LinearGradientBrush(rect, Theme.Parch1, Theme.Parch2, 90f);
                    g.FillPath(fill, path);
                    using var edge = new Pen(Theme.WithAlpha(Theme.ParchEdge, 140), 1.2f);
                    g.DrawPath(edge, path);
                }
            }

            var labelC = b.Mine ? Theme.PlumEdge : Theme.InkDim;
            var textC = b.Mine ? Theme.Text : Theme.InkText;
            using (var lb = new SolidBrush(labelC)) g.DrawString(b.Label, labelF, lb, rect.X + BubblePad, rect.Y + BubblePad - 1, StringFormat.GenericTypographic);
            if (b.Time.Length > 0)
            {
                using var tb = new SolidBrush(b.Mine ? Theme.WithAlpha(Theme.PlumEdge, 170) : Theme.InkDim);
                var tw = g.MeasureString(b.Time, timeF, PointF.Empty, StringFormat.GenericTypographic).Width;
                g.DrawString(b.Time, timeF, tb, rect.Right - BubblePad - tw, rect.Y + BubblePad - 2, StringFormat.GenericTypographic);
            }
            using (var tb = new SolidBrush(textC))
            {
                var ty = rect.Y + BubblePad + LabelH;
                foreach (var line in b.Lines) { g.DrawString(line, body, tb, rect.X + BubblePad, ty, StringFormat.GenericTypographic); ty += lineH; }
            }
        }

        // The scrollbar: the same plum thumb the rest of the Panel uses, drawn rather than hosted so the view
        // stays one control.
        if (contentH > Height)
        {
            var trackH = Height - 2 * Pad;
            var thumbH = Math.Max(24f * s, trackH * (float)Height / contentH);
            var t = (float)scroll / Math.Max(1, contentH - Height);
            var ty2 = Pad + t * (trackH - thumbH);
            using var tb = new SolidBrush(Theme.WithAlpha(Theme.PlumEdge, 150));
            using var tp = Round(new RectangleF(Width - (int)(8 * s), ty2, (int)(4 * s), thumbH), 2f * s);
            g.FillPath(tb, tp);
        }
    }

    static GraphicsPath Round(RectangleF r, float rad)
    {
        var p = new GraphicsPath();
        var d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    // ---------------------------------------------------------------- time

    /// <summary>Stamps arrive as "2026-09-21 18:04:10" in UTC, the shape memory stores.</summary>
    static DateTime? Parse(string stamp)
        => DateTime.TryParse(stamp, null, System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var d)
            ? d : null;

    static readonly TimeZoneInfo Toronto = Find("America/Toronto", "Eastern Standard Time");
    static TimeZoneInfo Find(params string[] ids)
    {
        foreach (var id in ids) { try { return TimeZoneInfo.FindSystemTimeZoneById(id); } catch { /* try the next spelling */ } }
        return TimeZoneInfo.Local;
    }

    static string Clock(DateTime? utc) => utc is DateTime d
        ? TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(d, DateTimeKind.Utc), Toronto).ToString("h:mm tt").ToLowerInvariant()
        : "";

    /// <summary>"Today", "Yesterday", or a date - how he would say it, not how it is stored.</summary>
    static string DayLabel(DateTime? utc)
    {
        if (utc is not DateTime d) return "earlier";
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(d, DateTimeKind.Utc), Toronto);
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Toronto).Date;
        var days = (today - local.Date).Days;
        return days switch
        {
            0 => "Today, " + local.ToString("h:mm tt").ToLowerInvariant(),
            1 => "Yesterday, " + local.ToString("h:mm tt").ToLowerInvariant(),
            < 7 and > 0 => local.ToString("dddd, h:mm tt").Replace("AM", "am").Replace("PM", "pm"),
            _ => local.ToString("d MMMM, h:mm tt").Replace("AM", "am").Replace("PM", "pm"),
        };
    }
}
