using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The speech bubble, in the style of an old adventure-game text box.
///  - Wrapping is greedy left to right, so text arriving at the end never re-wraps earlier lines.
///  - The bubble and its tail are ONE continuous outline (an earlier version drew the tail as a separate shape
///    and it visibly did not line up).
///  - While text streams it follows the newest lines.
///  - A finished reply longer than the bubble fills it, cuts where the text runs out and ends with "..." and a
///    bobbing arrow. It waits for the reader (no timers turn pages). Clicking grows the bubble upward to fit
///    up to 12 lines; beyond that it scrolls with a scrollbar styled like the rest of the UI.
/// Geometry and colours follow the original Rainmeter Aang so the look carries over.
/// </summary>
sealed class BubbleView : IDisposable
{
    public const int Left = 6, Right = 262, Bottom = 124, LineH = 16, TextX = 20, Pad = 11;
    public const int CollapsedLines = 6, ExpandedLines = 12;
    public const int MinH = 54, MaxTextW = 232, Radius = 14;
    public const int CollapsedH = CollapsedLines * LineH + 2 * Pad;     // 118
    public const int ExpandedMaxH = ExpandedLines * LineH + 2 * Pad;    // 214
    // Tail: base on the bubble's right edge, tip aimed at Aang's face.
    const int TailBaseTop = Bottom - 40, TailBaseBottom = Bottom - 18, TailTipX = 320, TailTipY = 152;
    // Scrollbar: a slim track in the right margin inside the outline.
    const int TrackX = 253, TrackW = 6;

    // Pixel units, not points. The bubble is drawn into a surface that is already scaled by the DPI factor,
    // and a point-sized font is scaled by the DPI again on top of that: at 200% the text came out 4x and
    // the lines overlapped. These are the 96-dpi pixel equivalents of 11pt / 8.5pt / 9pt.
    readonly Font font = new("Bahnschrift", 14.667f, FontStyle.Regular, GraphicsUnit.Pixel);
    readonly Bitmap measureBmp = new(1, 1);
    readonly Graphics measure;
    readonly Dictionary<string, float> widths = new();
    readonly float spaceW, ellipsisW;
    readonly Color fillC = Color.FromArgb(244, 14, 8, 30);
    readonly Color strokeC = Color.FromArgb(235, 255, 196, 60);
    readonly Color textC = Color.FromArgb(255, 240, 244, 255);
    readonly Color dimC = Color.FromArgb(200, 178, 170, 215);
    readonly Color gripC = Color.FromArgb(200, 178, 120, 255);      // the drag-handle purple from the original skin
    readonly Color trackC = Color.FromArgb(150, 44, 24, 92);

    string text = "";
    List<string> lines = new();
    bool streaming, expanded;
    int scroll;
    float shownH, targetH;
    DateTime hideAt = DateTime.MaxValue;
    string receipt = "";

    public bool Visible { get; private set; }
    /// <summary>A finished reply from Claude can be copied and rated: three small buttons straddle the top edge while the mouse is over the bubble.</summary>
    public bool Tools { get; set; }
    public bool Hover { get; set; }
    /// <summary>1 = good, -1 = not good, 0 = not rated.</summary>
    public int Rating { get; set; }
    public DateTime CopiedUntil { get; set; }
    /// <summary>A question that needs a yes or a no before anything happens. Buttons show only for this.</summary>
    public bool Asking
    {
        get => asking;
        set { if (asking == value) return; asking = value; targetH = HeightFor(Math.Min(lines.Count, CollapsedLines)); }
    }
    bool asking;
    public const int ChoiceW = 52, ChoiceH = 20;
    /// <summary>0 = Yes, 1 = No.</summary>
    public RectangleF ChoiceRect(int i) => new(Right - 12 - (2 - i) * (ChoiceW + 6), Bottom - Pad - ChoiceH + 2, ChoiceW, ChoiceH);
    public int HitChoice(float x, float y)
    {
        if (!Asking || !Visible) return -1;
        for (int i = 0; i < 2; i++) { var r = ChoiceRect(i); r.Inflate(3, 3); if (r.Contains(x, y)) return i; }
        return -1;
    }
    public const int ToolW = 20, ToolH = 17;
    /// <summary>0 = copy, 1 = good, 2 = not good.</summary>
    public RectangleF ToolRect(int i) => new(Right - 8 - (3 - i) * (ToolW + 3), CurrentTop - ToolH / 2f - 1, ToolW, ToolH);
    public bool ToolsShown => Tools && Visible && !Dots && !streaming && !Asking;
    public int HitTool(float x, float y)
    {
        if (!ToolsShown) return -1;
        for (int i = 0; i < 3; i++) { var r = ToolRect(i); r.Inflate(2, 2); if (r.Contains(x, y)) return i; }
        return -1;
    }
    public bool Dots { get; private set; }
    public string Text => text;
    public IReadOnlyList<string> Lines => lines;
    public bool Expanded => expanded;
    public int ScrollLine => scroll;

    /// <summary>The reply is longer than the collapsed bubble: show "..." and the arrow.</summary>
    public bool More => Visible && !streaming && !Dots && !expanded && lines.Count > CollapsedLines;
    public bool CanScroll => expanded && lines.Count > ExpandedLines;
    public int VisibleLineCount => expanded ? Math.Min(lines.Count, ExpandedLines) : Math.Min(lines.Count, CollapsedLines);
    public bool Animating => Visible && (Dots || Math.Abs(shownH - targetH) > 0.4f);
    public float CurrentTop => Bottom - Math.Max(shownH, MinH * 0.5f);

    public BubbleView()
    {
        measure = Graphics.FromImage(measureBmp);
        measure.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        spaceW = Width("a a") - Width("aa");
        ellipsisW = Width("...");
    }

    float Width(string s)
    {
        if (widths.TryGetValue(s, out var w)) return w;
        w = measure.MeasureString(s, font, PointF.Empty, StringFormat.GenericTypographic).Width;
        if (widths.Count > 4000) widths.Clear();
        return widths[s] = w;
    }

    /// <summary>Greedy word wrap. Deterministic and append-stable, apart from the last partial word.</summary>
    public List<string> Wrap(string t)
    {
        var result = new List<string>();
        foreach (var para in t.Replace("\r", "").Split('\n'))
        {
            var cur = "";
            float curW = 0;
            foreach (var word in para.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            {
                var w = Width(word);
                if (w > MaxTextW)
                {
                    if (cur.Length > 0) { result.Add(cur); cur = ""; curW = 0; }
                    var chunk = "";
                    foreach (var ch in word)
                    {
                        if (chunk.Length > 0 && Width(chunk + ch) > MaxTextW) { result.Add(chunk); chunk = ""; }
                        chunk += ch;
                    }
                    cur = chunk; curW = Width(cur);
                    continue;
                }
                if (cur.Length == 0) { cur = word; curW = w; }
                else if (curW + spaceW + w <= MaxTextW) { cur += " " + word; curW += spaceW + w; }
                else { result.Add(cur); cur = word; curW = w; }
            }
            result.Add(cur);
        }
        while (result.Count > 1 && result[^1].Length == 0) result.RemoveAt(result.Count - 1);
        return result;
    }

    /// <summary>The last visible line when the reply continues: shortened so "..." and the arrow fit after it.</summary>
    public string Ellipsize(string line)
    {
        const float room = 24;                        // space kept for the arrow in the corner
        var l = line.TrimEnd();
        while (l.Length > 0 && Width(l) + ellipsisW + room > MaxTextW)
        {
            var cut = l.LastIndexOf(' ');
            l = cut > 0 ? l[..cut] : l[..^1];
        }
        return l.TrimEnd(',', ';', ':', ' ') + "...";
    }

    float HeightFor(int lineCount) => Math.Clamp((lineCount + (asking ? 1 : 0)) * LineH + 2 * Pad, MinH, ExpandedMaxH);

    public void Show(string t, bool stream, int holdMs)
    {
        Dots = false; receipt = "";
        text = t;
        lines = Wrap(t);
        streaming = stream; expanded = false; scroll = 0; Tools = false; Rating = 0; CopiedUntil = default; Asking = false;
        Visible = true;
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        if (shownH <= 0) shownH = targetH * 0.55f;
        if (stream || holdMs <= 0) hideAt = DateTime.MaxValue;
        else
        {
            // A reply that continues waits for the reader: nothing turns the page for them. It only goes away
            // after a long idle time.
            var hold = lines.Count > CollapsedLines ? Math.Max(holdMs, 60_000) : holdMs;
            hideAt = DateTime.UtcNow.AddMilliseconds(hold);
        }
    }

    /// <summary>Thinking dots, with an optional short receipt line such as "checking the weather".</summary>
    /// <summary>
    /// Waiting on Claude. With no receipt there is nothing to read, so no box is drawn at all: the think
    /// animation already has the dots over his head and the glow, and an empty speech bubble is something
    /// no game with dialogue would ever put on screen. Zelda, Stardew and Animal Crossing all emote above
    /// the character and only open the box once there are words for it. With a receipt ("searching the
    /// web") there ARE words, so the box opens for them.
    /// </summary>
    public void ShowDots(string? receiptLine = null)
    {
        text = ""; lines = new(); streaming = false; expanded = false; scroll = 0;
        Dots = true; receipt = receiptLine ?? "";
        Tools = false; Asking = false; Rating = 0;
        if (receipt.Length == 0) { Visible = false; hideAt = DateTime.MaxValue; return; }
        targetH = MinH + 6;
        if (!Visible || shownH <= 0) shownH = targetH * 0.55f;
        Visible = true;
        hideAt = DateTime.MaxValue;
    }

    public void Clear()
    {
        Visible = false; Dots = false; streaming = false; expanded = false; scroll = 0; Tools = false; Hover = false; Rating = 0; Asking = false;
        text = ""; receipt = ""; lines = new(); hideAt = DateTime.MaxValue; shownH = 0;
    }

    /// <summary>Grow the bubble upward to fit up to 12 lines. Returns false if there is nothing more to show.</summary>
    public bool Expand()
    {
        if (!More) return false;
        expanded = true; scroll = 0;
        targetH = HeightFor(Math.Min(lines.Count, ExpandedLines));
        hideAt = DateTime.UtcNow.AddMinutes(5);           // stays until Joshua closes it
        return true;
    }

    /// <summary>Back to the normal size (Esc, or a click outside).</summary>
    public bool Collapse()
    {
        if (!expanded) return false;
        expanded = false; scroll = 0;
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        hideAt = DateTime.UtcNow.AddSeconds(60);
        return true;
    }

    /// <summary>Scroll the expanded view by whole lines. Returns false if it did not move.</summary>
    public bool Scroll(int delta)
    {
        if (!CanScroll) return false;
        var max = lines.Count - ExpandedLines;
        var next = Math.Clamp(scroll + delta, 0, max);
        if (next == scroll) return false;
        scroll = next;
        hideAt = DateTime.UtcNow.AddMinutes(5);
        return true;
    }

    // ---- scrollbar geometry, in bubble coordinates

    public RectangleF Track
    {
        get { var top = CurrentTop + Pad; return new RectangleF(TrackX, top, TrackW, Bottom - Pad - top); }
    }

    public RectangleF Thumb
    {
        get
        {
            var t = Track;
            if (!CanScroll) return RectangleF.Empty;
            var frac = ExpandedLines / (float)lines.Count;
            var h = Math.Max(24, t.Height * frac);
            var maxScroll = lines.Count - ExpandedLines;
            var y = t.Y + (t.Height - h) * (scroll / (float)maxScroll);
            return new RectangleF(t.X, y, t.Width, h);
        }
    }

    /// <summary>Scrollbar drag: put the thumb's centre at <paramref name="y"/> (bubble coordinates).</summary>
    public bool ScrollToY(float y)
    {
        if (!CanScroll) return false;
        var t = Track; var th = Thumb.Height;
        var frac = Math.Clamp((y - t.Y - th / 2) / Math.Max(1, t.Height - th), 0f, 1f);
        var next = (int)Math.Round(frac * (lines.Count - ExpandedLines));
        if (next == scroll) return false;
        scroll = next; hideAt = DateTime.UtcNow.AddMinutes(5);
        return true;
    }

    public bool HitThumb(float x, float y) { var r = Thumb; r.Inflate(4, 2); return !r.IsEmpty && r.Contains(x, y); }
    public bool HitTrack(float x, float y) { var r = Track; r.Inflate(5, 0); return CanScroll && r.Contains(x, y); }

    public bool Contains(float x, float y) =>
        Visible && x >= Left && x <= TailTipX && y >= CurrentTop && y <= Bottom;

    /// <summary>Advance animation and expiry. Returns true if anything visible changed.</summary>
    public bool Update(DateTime now)
    {
        var changed = false;
        if (Hover && ToolsShown && hideAt != DateTime.MaxValue && hideAt < now.AddSeconds(2)) hideAt = now.AddSeconds(2);   // do not vanish under the mouse
        if (Visible && now >= hideAt) { Clear(); return true; }
        if (CopiedUntil != default && now >= CopiedUntil) { CopiedUntil = default; changed = true; }
        if (Visible && Math.Abs(shownH - targetH) > 0.4f) { shownH += (targetH - shownH) * 0.4f; changed = true; }
        else if (Visible && shownH != targetH) { shownH = targetH; changed = true; }
        if (Visible && Dots) changed = true;
        if (More) changed = true;                         // the arrow bobs
        return changed;
    }

    /// <summary>The bubble and its tail as a single closed outline: no seam, nothing to misalign.</summary>
    public static GraphicsPath Outline(float top)
    {
        var r = Radius; var d = r * 2f;
        var p = new GraphicsPath();
        p.StartFigure();
        p.AddArc(Left, top, d, d, 180, 90);
        p.AddArc(Right - d, top, d, d, 270, 90);
        p.AddLine(Right, top + r, Right, TailBaseTop);
        p.AddLine(Right, TailBaseTop, TailTipX, TailTipY);
        p.AddLine(TailTipX, TailTipY, Right, TailBaseBottom);
        p.AddLine(Right, TailBaseBottom, Right, Bottom - r);
        p.AddArc(Right - d, Bottom - d, d, d, 0, 90);
        p.AddArc(Left, Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    public void Draw(Graphics g, int tick)
    {
        if (!Visible) return;
        var top = CurrentTop;

        var old = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = Outline(top);
        using var fill = new SolidBrush(fillC);
        using var pen = new Pen(strokeC, 1.8f) { LineJoin = LineJoin.Round };
        g.FillPath(fill, path);
        g.DrawPath(pen, path);

        if (Dots)
        {
            g.SmoothingMode = old;
            // centre the dots in the bubble rather than letting them sit low in it
            var dotsY = (int)((top + Bottom) / 2 - 12);
            for (int i = 0; i < 3; i++)
            {
                var phase = (tick / 4 + i) % 3;
                using var b = new SolidBrush(Color.FromArgb(phase == 0 ? 255 : 110, textC));
                g.FillEllipse(b, TextX + i * 14, dotsY - (phase == 0 ? 3 : 0), 7, 7);
            }
            if (receipt.Length > 0)
            {
                using var small = new Font("Bahnschrift", 11.333f, FontStyle.Regular, GraphicsUnit.Pixel);
                using var rb = new SolidBrush(dimC);
                g.DrawString(receipt + "...", small, rb, TextX, (Bottom + top) / 2 - 2, StringFormat.GenericTypographic);
            }
            return;
        }

        g.SetClip(path);
        using var tb = new SolidBrush(textC);
        var first = streaming ? Math.Max(0, lines.Count - CollapsedLines) : expanded ? scroll : 0;
        var count = streaming ? Math.Min(lines.Count, CollapsedLines) : VisibleLineCount;
        // A short reply does not fill the minimum bubble height, so the leftover space is split above and
        // below instead of all falling underneath the text. Joshua asked for even padding; the MinH clamp
        // had quietly reintroduced 11px above and 27px below on a one-liner.
        var rows = count + (asking ? 1 : 0);
        var slack = Math.Max(0f, (Bottom - top) - 2 * Pad - rows * LineH);
        var textTop = top + Pad + slack / 2f;
        for (int i = 0; i < count && first + i < lines.Count; i++)
        {
            var line = lines[first + i];
            if (More && i == count - 1) line = Ellipsize(line);            // "..." on the last visible line
            g.DrawString(line, font, tb, TextX, textTop + i * LineH, StringFormat.GenericTypographic);
        }
        g.ResetClip();

        if (More)
        {
            // The bobbing "more" arrow, bottom-right inside the bubble.
            var bob = tick % 2 == 0 ? 0 : 2;
            var ax = Right - 20; var ay = Bottom - 19 + bob;
            using var ab = new SolidBrush(strokeC);
            g.FillPolygon(ab, new[] { new PointF(ax, ay), new PointF(ax + 11, ay), new PointF(ax + 5.5f, ay + 7) });
        }
        else if (CanScroll)
        {
            using var tk = new SolidBrush(trackC);
            using var th = new SolidBrush(gripC);
            var t = Track; var b = Thumb;
            FillRound(g, tk, t); FillRound(g, th, b);
        }
        if (Asking) DrawChoices(g);
        if (ToolsShown && Hover) DrawTools(g);
        g.SmoothingMode = old;
    }

    static readonly string[] ChoiceText = { "yes", "no" };

    void DrawChoices(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var f = new Font("Bahnschrift", 12f, FontStyle.Bold, GraphicsUnit.Pixel);
        for (int i = 0; i < 2; i++)
        {
            var r = ChoiceRect(i);
            var c = i == 0 ? Color.FromArgb(120, 230, 150) : Color.FromArgb(255, 130, 120);
            using var path = RoundRect(r, ChoiceH / 2f);
            using (var bg = new SolidBrush(Color.FromArgb(45, c))) g.FillPath(bg, path);
            using (var pen = new Pen(c, 1.5f)) g.DrawPath(pen, path);
            using var tb = new SolidBrush(c);
            var sz = g.MeasureString(ChoiceText[i], f);
            g.DrawString(ChoiceText[i], f, tb, r.X + (r.Width - sz.Width) / 2, r.Y + (r.Height - sz.Height) / 2 + 1);
        }
    }

    void DrawTools(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        for (int i = 0; i < 3; i++)
        {
            var r = ToolRect(i);
            var on = (i == 1 && Rating == 1) || (i == 2 && Rating == -1);
            var copied = i == 0 && CopiedUntil != default;
            var c = i == 1 ? Color.FromArgb(120, 230, 150) : i == 2 ? Color.FromArgb(255, 130, 120) : Color.FromArgb(150, 220, 255);
            using var path = RoundRect(r, 6);
            using (var bg = new SolidBrush(on || copied ? Color.FromArgb(230, c) : Color.FromArgb(240, 16, 10, 34))) g.FillPath(bg, path);
            using (var pen = new Pen(c, 1.4f)) g.DrawPath(pen, path);
            var ink = on || copied ? Color.FromArgb(16, 10, 34) : c;
            using var ip = new Pen(ink, 1.7f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            float cx = r.X + r.Width / 2, cy = r.Y + r.Height / 2;
            if (i == 0 && copied) g.DrawLines(ip, new[] { new PointF(cx - 4, cy), new PointF(cx - 1, cy + 3), new PointF(cx + 4, cy - 3) });
            else if (i == 0) { g.DrawRectangle(ip, cx - 4, cy - 4, 6, 7); g.DrawLines(ip, new[] { new PointF(cx + 2, cy + 4), new PointF(cx + 4, cy + 4), new PointF(cx + 4, cy - 2) }); }
            else if (i == 1) g.DrawLines(ip, new[] { new PointF(cx - 4, cy), new PointF(cx - 1, cy + 3), new PointF(cx + 4, cy - 3) });
            else { g.DrawLine(ip, cx - 3, cy - 3, cx + 3, cy + 3); g.DrawLine(ip, cx + 3, cy - 3, cx - 3, cy + 3); }
        }
    }

    static GraphicsPath RoundRect(RectangleF r, float rad)
    {
        var d = rad * 2; var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    static void FillRound(Graphics g, Brush br, RectangleF r)
    {
        var d = Math.Min(r.Width, r.Height);
        using var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); g.FillPath(br, p);
    }

    public void Dispose() { font.Dispose(); measure.Dispose(); measureBmp.Dispose(); }
}
