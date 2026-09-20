using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The speech bubble. Layout rules that make streaming feel steady:
///  - wrapping is greedy left to right, so text arriving at the end never re-wraps earlier lines;
///  - the bubble grows upward from a fixed bottom edge and eases toward its target height;
///  - once it hits the line cap it scrolls to the newest lines.
/// Geometry and colours match the existing Rainmeter Aang so the look carries over.
/// </summary>
sealed class BubbleView : IDisposable
{
    public const int Left = 6, Right = 262, Bottom = 124, MaxLines = 6, LineH = 16, TextX = 20, PadTop = 10;
    public const int MinH = 54, MaxH = 118, MaxTextW = 232;

    readonly Font font = new("Bahnschrift", 11f, FontStyle.Regular, GraphicsUnit.Point);
    readonly Bitmap measureBmp = new(1, 1);
    readonly Graphics measure;
    readonly Dictionary<string, float> widths = new();
    readonly float spaceW;
    readonly Color fillC = Color.FromArgb(244, 14, 8, 30);
    readonly Color strokeC = Color.FromArgb(235, 255, 196, 60);
    readonly Color textC = Color.FromArgb(255, 240, 244, 255);

    string text = "";
    List<string> lines = new();
    float shownH, targetH;
    DateTime hideAt = DateTime.MaxValue;
    int first;                                  // index of the first visible line
    DateTime scrollAt = DateTime.MaxValue;      // when to page down next (finished long replies only)
    const int StartReadingMs = 3000, PerLineMs = 1500;

    public int FirstVisible => first;
    public bool Visible { get; private set; }
    public bool Dots { get; private set; }
    public string Text => text;
    public IReadOnlyList<string> Lines => lines;
    public bool Animating => Visible && (Dots || Math.Abs(shownH - targetH) > 0.4f);

    public BubbleView()
    {
        measure = Graphics.FromImage(measureBmp);
        measure.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        spaceW = Width("a a") - Width("aa");
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

    public void Show(string t, bool stream, int holdMs)
    {
        Dots = false;
        text = t;
        lines = Wrap(t);
        var shown = Math.Min(lines.Count, MaxLines);
        targetH = Math.Clamp(shown * LineH + 22, MinH, MaxH);
        if (!Visible) shownH = targetH * 0.55f;
        Visible = true;
        var overflow = Math.Max(0, lines.Count - MaxLines);
        if (stream)
        {
            // Streaming: follow the newest lines so the text being written is always in view.
            first = overflow;
            scrollAt = DateTime.MaxValue;
        }
        else
        {
            // Finished: start at the top so the reply is read from its first word, then page down at
            // reading pace. (An earlier version stayed on the tail and showed a reply starting mid-sentence.)
            first = 0;
            scrollAt = overflow > 0 ? DateTime.UtcNow.AddMilliseconds(StartReadingMs) : DateTime.MaxValue;
        }
        hideAt = (stream || holdMs <= 0) ? DateTime.MaxValue : DateTime.UtcNow.AddMilliseconds(holdMs + overflow * PerLineMs);
    }

    public void ShowDots()
    {
        text = ""; lines = new(); Dots = true;
        targetH = MinH;
        if (!Visible) shownH = targetH * 0.55f;
        Visible = true;
        hideAt = DateTime.MaxValue;
    }

    public void Clear() { Visible = false; Dots = false; text = ""; lines = new(); hideAt = DateTime.MaxValue; first = 0; scrollAt = DateTime.MaxValue; }

    /// <summary>Mouse wheel: the reader takes over paging and the bubble stays up a little longer.</summary>
    public void Scroll(int lineDelta)
    {
        var max = Math.Max(0, lines.Count - MaxLines);
        first = Math.Clamp(first + lineDelta, 0, max);
        scrollAt = DateTime.MaxValue;
        if (hideAt != DateTime.MaxValue) hideAt = DateTime.UtcNow.AddSeconds(8);
    }

    /// <summary>Advance animation and expiry. Returns true if anything visible changed.</summary>
    public bool Update(DateTime now)
    {
        var changed = false;
        if (Visible && now >= hideAt) { Clear(); return true; }
        if (Visible && Math.Abs(shownH - targetH) > 0.4f) { shownH += (targetH - shownH) * 0.4f; changed = true; }
        else if (Visible && shownH != targetH) { shownH = targetH; changed = true; }
        if (Visible && !Dots && now >= scrollAt && first < Math.Max(0, lines.Count - MaxLines))
        {
            first++; changed = true;
            scrollAt = first < Math.Max(0, lines.Count - MaxLines) ? now.AddMilliseconds(PerLineMs) : DateTime.MaxValue;
        }
        if (Visible && Dots) changed = true;
        return changed;
    }

    static GraphicsPath RoundRect(RectangleF r, float radius)
    {
        var d = radius * 2;
        var p = new GraphicsPath();
        p.AddArc(r.Left, r.Top, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    public void Draw(Graphics g, int tick)
    {
        if (!Visible) return;
        var h = Math.Max(shownH, MinH * 0.5f);
        var rect = new RectangleF(Left, Bottom - h, Right - Left, h);

        var old = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = RoundRect(rect, 14);
        using var fill = new SolidBrush(fillC);
        using var pen = new Pen(strokeC, 1.8f) { LineJoin = LineJoin.Round };
        g.FillPath(fill, path);
        g.DrawPath(pen, path);

        var tail = new[] { new PointF(254, 88), new PointF(306, 114), new PointF(254, 112) };
        g.FillPolygon(fill, tail);
        g.DrawPolygon(pen, tail);
        using (var seam = new Pen(Color.FromArgb(255, 14, 8, 30), 3f)) g.DrawLine(seam, 255, 89, 255, 111);
        g.SmoothingMode = old;

        if (Dots)
        {
            using var dot = new SolidBrush(textC);
            for (int i = 0; i < 3; i++)
            {
                var phase = (tick / 4 + i) % 3;
                var a = phase == 0 ? 255 : 110;
                using var b = new SolidBrush(Color.FromArgb(a, textC));
                g.FillEllipse(b, TextX + i * 14, Bottom - 24 - (phase == 0 ? 3 : 0), 7, 7);
            }
            return;
        }

        g.SetClip(path);
        using var tb = new SolidBrush(textC);
        for (int i = 0; i < Math.Min(lines.Count - first, MaxLines); i++)
        {
            var y = rect.Top + PadTop + i * LineH;
            g.DrawString(lines[first + i], font, tb, TextX, y, StringFormat.GenericTypographic);
        }
        g.ResetClip();
    }

    public void Dispose() { font.Dispose(); measure.Dispose(); measureBmp.Dispose(); }
}

