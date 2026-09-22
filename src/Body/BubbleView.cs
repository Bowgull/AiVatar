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
    // Clean Gold: 15 px text on a 21 px line (it was 14.7 on 16, which read cramped), radius 12, 12 px padding.
    // The bubble grows UP from Bottom, so PetWindow.Extra must cover ExpandedMaxH - Bottom (see there).
    public const int Left = 6, Right = 262, Bottom = 124, LineH = 21, TextX = 20, Pad = 12;
    public const int CollapsedLines = 6, ExpandedLines = 12;
    public const int MinH = 58, MaxTextW = 232, Radius = Theme.Radius;
    public const int CollapsedH = CollapsedLines * LineH + 2 * Pad;     // 150
    public const int ExpandedMaxH = ExpandedLines * LineH + 2 * Pad;    // 276
    // Tail: base on the bubble's right edge, tip aimed at Aang's face.
    const int TailBaseTop = Bottom - 40, TailBaseBottom = Bottom - 18, TailTipX = 320, TailTipY = 152;
    // Scrollbar: a slim track in the right margin inside the outline.
    const int TrackX = 253, TrackW = 6;

    // Pixel units, not points. The bubble is drawn into a surface that is already scaled by the DPI factor,
    // and a point-sized font is scaled by the DPI again on top of that: at 200% the text came out 4x and
    // the lines overlapped. These are the 96-dpi pixel equivalents of 11pt / 8.5pt / 9pt.
    readonly Font font = new(Theme.Face, Theme.BodyPx, FontStyle.Regular, GraphicsUnit.Pixel);
    readonly Bitmap measureBmp = new(1, 1);
    readonly Graphics measure;
    readonly Dictionary<string, float> widths = new();
    readonly float spaceW, ellipsisW;
    readonly Color fillC = Theme.InkFill;
    readonly Color strokeC = Theme.WithAlpha(Theme.Gold, 240);
    readonly Color textC = Theme.Text;
    readonly Color dimC = Theme.WithAlpha(Theme.Secondary, 210);
    readonly Color gripC = Theme.WithAlpha(Theme.PlumEdge, 220);    // the scrollbar thumb
    readonly Color trackC = Theme.WithAlpha(Theme.Plum, 150);
    /// <summary>Claude's brand terracotta, lightened to read on the ink: the colour of anything that is Claude.</summary>
    readonly Color linkC = Theme.Claude;
    readonly Font bold = new(Theme.FaceBold, Theme.BodyPx, FontStyle.Regular, GraphicsUnit.Pixel);
    /// <summary>A word in the text to mark as a link (e.g. "Claude"), or empty.</summary>
    public string Link { get; set; } = "";

    string text = "";
    List<string> lines = new();
    bool streaming, expanded;
    int scroll;
    float shownH, targetH;
    DateTime hideAt = DateTime.MaxValue;
    string receipt = "";

    // Two widths: a short reply keeps the narrow bubble; a long one widens to the left by WideExtra so it takes fewer
    // lines. Decided once per reply and kept while it streams, so the text re-wraps at most once.
    public const int WideExtra = 160, WideAfterLines = 4;
    public bool Wide { get; private set; }
    public float LeftNow => Wide ? Left - WideExtra : Left;
    float TextXNow => Wide ? TextX - WideExtra : TextX;
    float MaxW => Wide ? MaxTextW + WideExtra : MaxTextW;

    // Smoothed streaming: the words are revealed at an even pace instead of in the lumps they arrive in. The pace
    // quickens with the backlog, so it never falls far behind; everything else (copy, the tools) waits for the end.
    string full = "";
    int shown;
    bool coreStreaming;
    int holdAfter;
    public bool Revealing => shown < full.Length;

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
    // Weighted buttons: 28 px tall (they were 20, small for a decision that grants a permission) and a row of their own.
    public const int ChoiceW = 68, ChoiceH = 28, AskRow = ChoiceH + 8;
    /// <summary>0 = Yes, 1 = No.</summary>
    public RectangleF ChoiceRect(int i) => new(Right - 14 - (2 - i) * (ChoiceW + 8), Bottom - Pad - ChoiceH, ChoiceW, ChoiceH);
    public int HitChoice(float x, float y)
    {
        if (!Asking || !Visible) return -1;
        for (int i = 0; i < 2; i++) { var r = ChoiceRect(i); r.Inflate(4, 4); if (r.Contains(x, y)) return i; }
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
    /// <summary>The whole message, even the part not revealed yet (copy uses this).</summary>
    public string Text => full;
    public IReadOnlyList<string> Lines => lines;
    public bool Expanded => expanded;
    public int ScrollLine => scroll;

    /// <summary>The reply is longer than the collapsed bubble: show "..." and the arrow.</summary>
    public bool More => Visible && !streaming && !Dots && !expanded && lines.Count > CollapsedLines;
    public bool CanScroll => expanded && lines.Count > ExpandedLines;
    public int VisibleLineCount => expanded ? Math.Min(lines.Count, ExpandedLines) : Math.Min(lines.Count, CollapsedLines);
    public bool Animating => Visible && (Dots || Revealing || Math.Abs(shownH - targetH) > 0.4f);
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
                if (w > MaxW)
                {
                    if (cur.Length > 0) { result.Add(cur); cur = ""; curW = 0; }
                    var chunk = "";
                    foreach (var ch in word)
                    {
                        if (chunk.Length > 0 && Width(chunk + ch) > MaxW) { result.Add(chunk); chunk = ""; }
                        chunk += ch;
                    }
                    cur = chunk; curW = Width(cur);
                    continue;
                }
                if (cur.Length == 0) { cur = word; curW = w; }
                else if (curW + spaceW + w <= MaxW) { cur += " " + word; curW += spaceW + w; }
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
        while (l.Length > 0 && Width(l) + ellipsisW + room > MaxW)
        {
            var cut = l.LastIndexOf(' ');
            l = cut > 0 ? l[..cut] : l[..^1];
        }
        // A full stop goes too: a sentence that ended right at the cut read "the scene...." (2026-09-21).
        return l.TrimEnd(',', ';', ':', '.', ' ') + "...";
    }

    float HeightFor(int lineCount) => Math.Clamp(lineCount * LineH + (asking ? AskRow : 0) + 2 * Pad, MinH, ExpandedMaxH + AskRow);

    public void Show(string t, bool stream, int holdMs)
    {
        // The next piece of the same reply (or its final form) carries on from what is already shown.
        var same = Visible && !Dots && full.Length > 0 && t.StartsWith(full, StringComparison.Ordinal);
        Dots = false; receipt = "";
        if (!same) { Wide = false; shown = stream ? 0 : t.Length; }
        full = t;
        if (!Wide) Wide = Wrap(t).Count > WideAfterLines;          // measured at the narrow width
        text = full[..Math.Min(shown, full.Length)];
        lines = Wrap(text);
        coreStreaming = stream; holdAfter = holdMs;
        streaming = stream || Revealing;
        expanded = false; scroll = 0; Tools = false; Rating = 0; CopiedUntil = default; Asking = false;
        Visible = true;
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        if (shownH <= 0) shownH = targetH * 0.55f;
        SetHold();
    }

    void SetHold()
    {
        if (streaming || holdAfter <= 0) { hideAt = DateTime.MaxValue; return; }
        // A reply that continues waits for the reader: nothing turns the page for them. It only goes away
        // after a long idle time.
        var hold = lines.Count > CollapsedLines ? Math.Max(holdAfter, 60_000) : holdAfter;
        hideAt = DateTime.UtcNow.AddMilliseconds(hold);
    }

    /// <summary>Reveal a few more characters. True when the text changed.</summary>
    bool StepReveal()
    {
        if (!Visible || Dots || !Revealing) return false;
        var backlog = full.Length - shown;
        shown = Math.Min(full.Length, shown + Math.Max(2, backlog / 6));
        text = full[..shown]; lines = Wrap(text);
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        if (!Revealing && !coreStreaming) { streaming = false; SetHold(); }
        return true;
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
        text = ""; full = ""; shown = 0; Wide = false; lines = new(); streaming = false; expanded = false; scroll = 0;
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
        text = ""; full = ""; shown = 0; Wide = false; receipt = ""; lines = new(); hideAt = DateTime.MaxValue; shownH = 0; Link = "";
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
        Visible && x >= LeftNow && x <= TailTipX && y >= CurrentTop && y <= Bottom;

    /// <summary>Advance animation and expiry. Returns true if anything visible changed.</summary>
    public bool Update(DateTime now)
    {
        var changed = StepReveal();
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
    public GraphicsPath Outline(float top)
    {
        var r = Radius; var d = r * 2f; var Left = LeftNow;
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
        using var halo = new Pen(Theme.Halo, Theme.HaloStroke) { LineJoin = LineJoin.Round };
        using var pen = new Pen(strokeC, Theme.Stroke) { LineJoin = LineJoin.Round };
        g.FillPath(fill, path);
        g.DrawPath(halo, path);                 // a dark edge under the gold, so it holds on a bright snowfield as well as a dark forest
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
                g.FillEllipse(b, TextXNow + i * 14, dotsY - (phase == 0 ? 3 : 0), 7, 7);
            }
            if (receipt.Length > 0)
            {
                using var small = new Font(Theme.Face, Theme.ReceiptPx, FontStyle.Regular, GraphicsUnit.Pixel);
                using var rb = new SolidBrush(dimC);
                g.DrawString(receipt + "...", small, rb, TextXNow, (Bottom + top) / 2 - 2, StringFormat.GenericTypographic);
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
        var used = count * LineH + (asking ? AskRow : 0);
        var slack = Math.Max(0f, (Bottom - top) - 2 * Pad - used);
        var textTop = top + Pad + slack / 2f;
        // Only the first "Claude" in the message is the link: every mention marked at once reads as noise.
        int linkLine = -1;
        if (Link.Length > 0) for (int j = 0; j < lines.Count; j++) if (lines[j].Contains(Link, StringComparison.Ordinal)) { linkLine = j; break; }
        for (int i = 0; i < count && first + i < lines.Count; i++)
        {
            var line = lines[first + i];
            if (More && i == count - 1) line = Ellipsize(line);            // "..." on the last visible line
            float y = textTop + i * LineH + 2;               // a 15 px face sits in the upper part of a 21 px line; nudge it to the middle
            int at = first + i == linkLine ? line.IndexOf(Link, StringComparison.Ordinal) : -1;
            if (at < 0) { g.DrawString(line, font, tb, TextXNow, y, StringFormat.GenericTypographic); continue; }
            // The linked word - "Claude", the app his job runs in - is drawn in Claude's own colour and underlined,
            // so it reads as a place to go rather than part of the sentence. A click on the bubble goes there.
            var before = line[..at];
            float x = TextXNow + (before.Length > 0 ? Width(before) + (before.EndsWith(' ') ? spaceW : 0) : 0);
            if (before.Length > 0) g.DrawString(before, font, tb, TextXNow, y, StringFormat.GenericTypographic);
            using (var lb = new SolidBrush(linkC)) g.DrawString(Link, bold, lb, x, y, StringFormat.GenericTypographic);
            float lw = Width(Link) + 1;
            using (var up = new Pen(linkC, 1.2f)) g.DrawLine(up, x, y + 17, x + lw, y + 17);
            var after = line[(at + Link.Length)..];
            // The gap is added by hand and the space itself dropped: drawing " on" after adding a space doubled it.
            if (after.Length > 0) g.DrawString(after.TrimStart(' '), font, tb, x + lw + (after.StartsWith(' ') ? spaceW : 0), y, StringFormat.GenericTypographic);
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

    static readonly string[] ChoiceText = { "Yes", "No" };

    /// <summary>
    /// A weighted button: a solid face with a lip under it and a catch-light along its top edge, so it reads as
    /// something to press rather than a label with an outline. Yes is gold (the main thing); No is plum (the quiet
    /// alternative). Neither is green or red: those colours mean "good" and "bad", and declining is not bad.
    /// </summary>
    void DrawChoices(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var f = new Font(Theme.FaceBold, Theme.ButtonPx, FontStyle.Regular, GraphicsUnit.Pixel);
        for (int i = 0; i < 2; i++)
        {
            var r = ChoiceRect(i);
            var yes = i == 0;
            var face = new RectangleF(r.X, r.Y, r.Width, r.Height - Theme.Lip);
            using (var lipPath = RoundRect(r, 9)) using (var lip = new SolidBrush(yes ? Theme.GoldDeep : Theme.PlumDeep)) g.FillPath(lip, lipPath);
            using (var facePath = RoundRect(face, 9))
            {
                using (var fb = new SolidBrush(yes ? Theme.Gold : Theme.Plum)) g.FillPath(fb, facePath);
                if (!yes) using (var edge = new Pen(Theme.PlumEdge, 1.2f)) g.DrawPath(edge, facePath);
            }
            using (var light = new Pen(Theme.WithAlpha(yes ? Theme.GoldLight : Theme.PlumEdge, 170), 1f))
                g.DrawLine(light, face.X + 9, face.Y + 1.5f, face.Right - 9, face.Y + 1.5f);
            using var tb = new SolidBrush(yes ? Theme.Ink : Theme.Text);
            var sz = g.MeasureString(ChoiceText[i], f, PointF.Empty, StringFormat.GenericTypographic);
            g.DrawString(ChoiceText[i], f, tb, face.X + (face.Width - sz.Width) / 2, face.Y + (face.Height - sz.Height) / 2, StringFormat.GenericTypographic);
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
            var c = i == 1 ? Theme.Green : i == 2 ? Theme.Red : Theme.Gold;
            using var path = RoundRect(r, 6);
            using (var bg = new SolidBrush(on || copied ? Theme.WithAlpha(c, 230) : Theme.WithAlpha(Theme.Ink, 240))) g.FillPath(bg, path);
            using (var pen = new Pen(c, 1.4f)) g.DrawPath(pen, path);
            var ink = on || copied ? Theme.Ink : c;
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
