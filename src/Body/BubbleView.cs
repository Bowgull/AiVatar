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

    readonly Font font = new("Bahnschrift", 11f, FontStyle.Regular, GraphicsUnit.Point);
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

    float HeightFor(int lineCount) => Math.Clamp(lineCount * LineH + 2 * Pad, MinH, ExpandedMaxH);

    public void Show(string t, bool stream, int holdMs)
    {
        Dots = false; receipt = "";
        text = t;
        lines = Wrap(t);
        streaming = stream; expanded = false; scroll = 0;
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
    public void ShowDots(string? receiptLine = null)
    {
        text = ""; lines = new(); streaming = false; expanded = false; scroll = 0;
        Dots = true; receipt = receiptLine ?? "";
        targetH = receipt.Length > 0 ? MinH + 6 : MinH;
        if (!Visible || shownH <= 0) shownH = targetH * 0.55f;
        Visible = true;
        hideAt = DateTime.MaxValue;
    }

    public void Clear()
    {
        Visible = false; Dots = false; streaming = false; expanded = false; scroll = 0;
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
        if (Visible && now >= hideAt) { Clear(); return true; }
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
            var dotsY = receipt.Length > 0 ? Bottom - 34 : Bottom - 26;
            for (int i = 0; i < 3; i++)
            {
                var phase = (tick / 4 + i) % 3;
                using var b = new SolidBrush(Color.FromArgb(phase == 0 ? 255 : 110, textC));
                g.FillEllipse(b, TextX + i * 14, dotsY - (phase == 0 ? 3 : 0), 7, 7);
            }
            if (receipt.Length > 0)
            {
                using var small = new Font("Bahnschrift", 8.5f, FontStyle.Regular, GraphicsUnit.Point);
                using var rb = new SolidBrush(dimC);
                g.DrawString(receipt + "...", small, rb, TextX, Bottom - 22, StringFormat.GenericTypographic);
            }
            return;
        }

        g.SetClip(path);
        using var tb = new SolidBrush(textC);
        var first = streaming ? Math.Max(0, lines.Count - CollapsedLines) : expanded ? scroll : 0;
        var count = streaming ? Math.Min(lines.Count, CollapsedLines) : VisibleLineCount;
        for (int i = 0; i < count && first + i < lines.Count; i++)
        {
            var line = lines[first + i];
            if (More && i == count - 1) line = Ellipsize(line);            // "..." on the last visible line
            g.DrawString(line, font, tb, TextX, top + Pad + i * LineH, StringFormat.GenericTypographic);
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
        g.SmoothingMode = old;
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
