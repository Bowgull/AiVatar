using System.Drawing;
using System.Drawing.Drawing2D;

namespace Aang.Body;

/// <summary>
/// The speech bubble.
///  - Wrapping is greedy left to right, so text arriving at the end never re-wraps earlier lines.
///  - The bubble and its tail are ONE continuous outline (an earlier version drew the tail as a separate
///    shape over the bubble and it visibly did not line up).
///  - While text streams it follows the newest lines. A finished reply that does not fit is split into whole
///    pages that break after a sentence where possible, never leave a one-line orphan page, and advance at
///    reading pace, on click, on the mouse wheel, or with the keyboard.
/// Geometry and colours follow the original Rainmeter Aang so the look carries over.
/// </summary>
sealed class BubbleView : IDisposable
{
    public const int Left = 6, Right = 262, Bottom = 124, LineH = 16, TextX = 20, Pad = 11;
    public const int MaxLines = 6, PagedLines = 5;       // a paged bubble spends one row on the page indicator
    public const int MinH = 54, MaxH = 118, MaxTextW = 232, Radius = 14;
    // Tail: base on the bubble's right edge, tip aimed at Aang's face.
    const int TailBaseTop = Bottom - 40, TailBaseBottom = Bottom - 18, TailTipX = 320, TailTipY = 152;

    readonly Font font = new("Bahnschrift", 11f, FontStyle.Regular, GraphicsUnit.Point);
    readonly Font small = new("Bahnschrift", 8.5f, FontStyle.Regular, GraphicsUnit.Point);
    readonly Bitmap measureBmp = new(1, 1);
    readonly Graphics measure;
    readonly Dictionary<string, float> widths = new();
    readonly float spaceW;
    readonly Color fillC = Color.FromArgb(244, 14, 8, 30);
    readonly Color strokeC = Color.FromArgb(235, 255, 196, 60);
    readonly Color textC = Color.FromArgb(255, 240, 244, 255);
    readonly Color dimC = Color.FromArgb(200, 178, 170, 215);

    string text = "";
    List<string> lines = new();
    List<List<string>> pages = new();
    int page;
    bool streaming;
    float shownH, targetH;
    DateTime hideAt = DateTime.MaxValue;
    DateTime pageAt = DateTime.MaxValue;
    string receipt = "";

    public bool Visible { get; private set; }
    public bool Dots { get; private set; }
    public string Text => text;
    public IReadOnlyList<string> Lines => lines;
    public int PageIndex => page;
    public int PageCount => Math.Max(1, pages.Count);
    public bool Paged => !streaming && pages.Count > 1;
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

    static readonly System.Text.RegularExpressions.Regex SentenceBreak = new(@"(?<=[.!?])\s+|\n+");
    public static List<string> SplitSentences(string t) =>
        SentenceBreak.Split(t.Replace("\r", "")).Select(s => s.Trim()).Where(s => s.Length > 0).ToList();

    /// <summary>
    /// Split a finished reply into pages of whole sentences. Sentences are packed greedily and each page is
    /// wrapped on its own, so a page never ends mid-sentence unless a single sentence is longer than a page.
    /// The last page is never a single stranded line when the previous page can give up its last sentence.
    /// </summary>
    public List<List<string>> BuildPages(string text, int perPage)
    {
        var pages = new List<List<string>>();
        var pageSentences = new List<List<string>>();
        var cur = new List<string>();
        var curText = "";

        void Flush()
        {
            if (curText.Length == 0) return;
            pages.Add(Wrap(curText));
            pageSentences.Add(cur);
            cur = new(); curText = "";
        }

        foreach (var s in SplitSentences(text))
        {
            var candidate = curText.Length == 0 ? s : curText + " " + s;
            if (Wrap(candidate).Count <= perPage) { curText = candidate; cur.Add(s); continue; }
            Flush();
            var alone = Wrap(s);
            if (alone.Count <= perPage) { curText = s; cur.Add(s); continue; }
            for (int i = 0; i < alone.Count; i += perPage)          // one sentence longer than a page: split by lines
            {
                pages.Add(alone.Skip(i).Take(perPage).ToList());
                pageSentences.Add(new List<string> { string.Join(' ', alone.Skip(i).Take(perPage)) });
            }
        }
        Flush();

        if (pages.Count >= 2 && pages[^1].Count == 1 && pageSentences[^2].Count >= 2)
        {
            var moved = pageSentences[^2][^1];
            var merged = Wrap(moved + " " + string.Join(' ', pages[^1]));
            if (merged.Count <= perPage)
            {
                pageSentences[^2].RemoveAt(pageSentences[^2].Count - 1);
                pages[^2] = Wrap(string.Join(' ', pageSentences[^2]));
                pages[^1] = merged;
            }
        }
        return pages;
    }

    static int ReadMs(IReadOnlyList<string> pageLines)
    {
        var words = pageLines.Sum(l => l.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length);
        return Math.Clamp(1400 + words * 300, 3000, 10000);
    }

    IReadOnlyList<string> PageLinesOf(int p) => pages[p];
    public void Show(string t, bool stream, int holdMs)
    {
        Dots = false; receipt = "";
        text = t;
        lines = Wrap(t);
        streaming = stream;
        Visible = true;

        if (stream)
        {
            pages = new(); page = 0;
            targetH = Math.Clamp(Math.Min(lines.Count, MaxLines) * LineH + 2 * Pad, MinH, MaxH);
            hideAt = DateTime.MaxValue; pageAt = DateTime.MaxValue;
        }
        else if (lines.Count <= MaxLines)
        {
            pages = new() { lines }; page = 0;
            targetH = Math.Clamp(lines.Count * LineH + 2 * Pad, MinH, MaxH);
            pageAt = DateTime.MaxValue;
            hideAt = holdMs <= 0 ? DateTime.MaxValue : DateTime.UtcNow.AddMilliseconds(holdMs);
        }
        else
        {
            pages = BuildPages(t, PagedLines); page = 0;
            targetH = MaxH;                                       // constant height so paging does not jump around
            pageAt = DateTime.UtcNow.AddMilliseconds(ReadMs(PageLinesOf(0)));
            var total = Enumerable.Range(0, pages.Count).Sum(p => ReadMs(PageLinesOf(p)));
            hideAt = holdMs <= 0 ? DateTime.MaxValue : DateTime.UtcNow.AddMilliseconds(total + 4000);
        }
        if (shownH <= 0) shownH = targetH * 0.55f;
    }

    /// <summary>Thinking dots, with an optional short receipt line such as "checking the weather".</summary>
    public void ShowDots(string? receiptLine = null)
    {
        text = ""; lines = new(); pages = new(); page = 0; streaming = false;
        Dots = true; receipt = receiptLine ?? "";
        targetH = receipt.Length > 0 ? MinH + 6 : MinH;
        if (!Visible || shownH <= 0) shownH = targetH * 0.55f;
        Visible = true;
        hideAt = DateTime.MaxValue; pageAt = DateTime.MaxValue;
    }

    public void Clear()
    {
        Visible = false; Dots = false; streaming = false; text = ""; receipt = "";
        lines = new(); pages = new(); page = 0; hideAt = DateTime.MaxValue; pageAt = DateTime.MaxValue; shownH = 0;
    }

    /// <summary>Move to another page (wheel, keys). Returns false if there was nowhere to go.</summary>
    public bool Page(int delta)
    {
        if (!Paged) return false;
        var next = Math.Clamp(page + delta, 0, pages.Count - 1);
        if (next == page) return false;
        page = next;
        pageAt = DateTime.MaxValue;                                // the reader took over
        if (hideAt != DateTime.MaxValue) hideAt = DateTime.UtcNow.AddSeconds(12);
        return true;
    }

    /// <summary>Click: next page if there is one. Returns false when already on the last page (caller dismisses).</summary>
    public bool Advance() => Page(1);

    public bool Contains(float x, float y) => Visible && x >= Left && x <= Right + (TailTipX - Right) && y >= Bottom - Math.Max(shownH, MinH * 0.5f) && y <= Bottom;

    /// <summary>Advance animation, paging and expiry. Returns true if anything visible changed.</summary>
    public bool Update(DateTime now)
    {
        var changed = false;
        if (Visible && now >= hideAt) { Clear(); return true; }
        if (Visible && Math.Abs(shownH - targetH) > 0.4f) { shownH += (targetH - shownH) * 0.4f; changed = true; }
        else if (Visible && shownH != targetH) { shownH = targetH; changed = true; }
        if (Visible && Paged && now >= pageAt && page < pages.Count - 1)
        {
            page++; changed = true;
            pageAt = page < pages.Count - 1 ? now.AddMilliseconds(ReadMs(PageLinesOf(page))) : DateTime.MaxValue;
        }
        if (Visible && Dots) changed = true;
        return changed;
    }

    /// <summary>The bubble and its tail as a single closed outline: no seam, nothing to misalign.</summary>
    public static GraphicsPath Outline(float top)
    {
        var r = Radius; var d = r * 2f;
        var p = new GraphicsPath();
        p.StartFigure();
        p.AddArc(Left, top, d, d, 180, 90);                                   // top-left
        p.AddArc(Right - d, top, d, d, 270, 90);                              // top-right
        p.AddLine(Right, top + r, Right, TailBaseTop);
        p.AddLine(Right, TailBaseTop, TailTipX, TailTipY);                    // tail out to the tip ...
        p.AddLine(TailTipX, TailTipY, Right, TailBaseBottom);                 // ... and back to the edge
        p.AddLine(Right, TailBaseBottom, Right, Bottom - r);
        p.AddArc(Right - d, Bottom - d, d, d, 0, 90);                         // bottom-right
        p.AddArc(Left, Bottom - d, d, d, 90, 90);                             // bottom-left
        p.CloseFigure();
        return p;
    }

    public void Draw(Graphics g, int tick)
    {
        if (!Visible) return;
        var h = Math.Max(shownH, MinH * 0.5f);
        var top = Bottom - h;

        var old = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = Outline(top);
        using var fill = new SolidBrush(fillC);
        using var pen = new Pen(strokeC, 1.8f) { LineJoin = LineJoin.Round };
        g.FillPath(fill, path);
        g.DrawPath(pen, path);
        g.SmoothingMode = old;

        if (Dots)
        {
            var dotsY = receipt.Length > 0 ? Bottom - 34 : Bottom - 26;
            for (int i = 0; i < 3; i++)
            {
                var phase = (tick / 4 + i) % 3;
                using var b = new SolidBrush(Color.FromArgb(phase == 0 ? 255 : 110, textC));
                g.FillEllipse(b, TextX + i * 14, dotsY - (phase == 0 ? 3 : 0), 7, 7);
            }
            if (receipt.Length > 0)
            {
                using var rb = new SolidBrush(dimC);
                g.DrawString(receipt + "...", small, rb, TextX, Bottom - 22, StringFormat.GenericTypographic);
            }
            return;
        }

        g.SetClip(path);
        using var tb = new SolidBrush(textC);
        IEnumerable<string> shown;
        if (streaming) shown = lines.Skip(Math.Max(0, lines.Count - MaxLines)).Take(MaxLines);
        else if (pages.Count > 0) shown = PageLinesOf(page);
        else shown = lines;
        int row = 0;
        foreach (var line in shown)
            g.DrawString(line, font, tb, TextX, top + Pad + row++ * LineH, StringFormat.GenericTypographic);

        if (Paged)
        {
            using var db = new SolidBrush(dimC);
            var label = $"{page + 1}/{pages.Count}" + (page < pages.Count - 1 ? "  click for more" : "");
            g.DrawString(label, small, db, TextX, Bottom - Pad - 8, StringFormat.GenericTypographic);
        }
        g.ResetClip();
    }

    public void Dispose() { font.Dispose(); small.Dispose(); measure.Dispose(); measureBmp.Dispose(); }
}

