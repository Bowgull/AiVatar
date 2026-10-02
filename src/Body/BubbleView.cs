using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

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
    // Clean Gold: 15 px text, radius 12, 12 px padding. LineH was 21 (a 1.4x line-height, under WCAG's own
    // 1.5x target for readable body text); 23 is 1.53x, in range - Joshua, 2026-09-23: "jumbled and hard to
    // read", researched rather than guessed. The bubble grows UP from Bottom, so PetWindow.Extra must cover
    // ExpandedMaxH - Bottom (see there), which is 176, not the 152 the old stale comment implied.
    public const int Left = 6, Right = 262, Bottom = 124, LineH = 23, TextX = 20, Pad = 12;
    public const int CollapsedLines = 6, ExpandedLines = 12;
    public const int MinH = 58, MaxTextW = 232, Radius = Theme.Radius;
    public const int CollapsedH = CollapsedLines * LineH + 2 * Pad;     // 162
    public const int ExpandedMaxH = ExpandedLines * LineH + 2 * Pad;    // 300

    // Those two comments said 150 and 276 until 2026-10-02. They were right when a line was 21px, and were
    // never updated when LineH became 23 - so the headroom above the window was sized from a stale number
    // and a fully expanded bubble was drawn 8px past the top of its own window. Nothing showed it until the
    // scrollback made the bubble routinely reach full height (Joshua: "the top of the expanded bubble is cut
    // off its just missing the entire border"). Anything deriving a size from these must use the constants,
    // never the comments.
    // Tail: base on the bubble's right edge, tip aimed at Aang's face.
    const int TailBaseTop = Bottom - 40, TailBaseBottom = Bottom - 18, TailTipX = 320, TailTipY = 152;
    // Scrollbar: a slim track in the right margin inside the outline.
    const int TrackX = 253, TrackW = 6;

    // Pixel units, not points. The bubble is drawn into a surface that is already scaled by the DPI factor,
    // and a point-sized font is scaled by the DPI again on top of that: at 200% the text came out 4x and
    // the lines overlapped. These are the 96-dpi pixel equivalents of 11pt / 8.5pt / 9pt.
    readonly Font font = Theme.Font(Theme.Face, Theme.BodyPx);
    readonly Bitmap measureBmp = new(1, 1);
    readonly Graphics measure;
    readonly Dictionary<string, float> widths = new();
    readonly float spaceW, ellipsisW;
    readonly Color strokeC = Theme.WithAlpha(Theme.Gold, 240);
    // The reading pane inside the ink+gold frame is parchment (StyleLab 2026-09-22), so its text is dark ink,
    // not the pale text every other ink-filled surface uses.
    readonly Color textC = Theme.InkText;
    readonly Color dimC = Theme.WithAlpha(Theme.InkDim, 235);
    readonly Color gripC = Theme.WithAlpha(Theme.PlumEdge, 220);    // the scrollbar thumb
    readonly Color trackC = Theme.WithAlpha(Theme.InkDim, 90);
    /// <summary>Claude's brand terracotta, lightened to read on the ink: the colour of anything that is Claude.</summary>
    readonly Color linkC = Theme.Claude;
    readonly Font bold = Theme.Font(Theme.FaceBold, Theme.BodyPx, FontStyle.Bold);
    /// <summary>A word in the text to mark as a link (e.g. "Claude"), or empty.</summary>
    public string Link { get; set; } = "";
    /// <summary>What he typed, shown small and dim above the reply so a reply found later still makes sense
    /// on its own (recognition over recall - NN/g). Never a log: it lives and dies with this one reply.</summary>
    public string Asked { get; set; } = "";
    const int AskedRowH = 18;

    string text = "";
    List<string> lines = new();
    /// <summary>Who each line in <see cref="lines"/> belongs to, same length, same order. Only meaningful in
    /// scrollback: a normal reply is all his.</summary>
    List<bool> mineLine = new();
    bool streaming, expanded;

    /// <summary>One thing that was said, kept so he can scroll back to it without opening the Panel.</summary>
    /// <param name="When">Used for the date dividers. Scrolling back days without them is just a wall.</param>
    public sealed record Said(int Id, string Text, bool Mine, DateTime When);

    /// <summary>
    /// The recent conversation, newest last.
    ///
    /// Capped hard: this is a bubble over a game, not an archive. Everything older is in the Panel, which is
    /// searchable and is where scrollback properly belongs - the desktop only has to answer "what were we
    /// just saying", which is a dozen turns at most.
    /// </summary>
    readonly List<Said> back = new();
    /// <summary>
    /// How many live turns to hold before the oldest drop off.
    ///
    /// There is deliberately no cap on how far BACK he can scroll: reaching the top asks the database for
    /// the next older page, and keeps doing that until there is nothing older. This number only bounds what
    /// one run of the app accumulates on its own. A turn is a short string - his real messages average 28
    /// characters - so holding a few thousand costs nothing worth measuring.
    /// </summary>
    const int KeepTurns = 400;

    /// <summary>The oldest row now in the stack, which is where the next page back starts. 0 when empty.</summary>
    public int OldestId => back.FirstOrDefault(b => b.Id > 0)?.Id ?? 0;

    /// <summary>Set once the database says there is nothing older, so the Body stops asking.</summary>
    public bool ReachedTheStart { get; set; }

    /// <summary>True when he has scrolled to the top and there may be more behind it.</summary>
    public bool WantsOlder => scrollback && scroll == 0 && !ReachedTheStart;

    /// <summary>True once the stack has been topped up from the database, so it is asked for once per
    /// scrollback and not on every scroll tick.</summary>
    public bool FilledFromMemory { get; set; }

    /// <summary>True while the bubble is showing the conversation rather than one reply.</summary>
    bool scrollback;
    public bool InScrollback => scrollback;
    int scroll;
    float shownH, targetH;
    /// <summary>Where the view actually sits, in pixels, easing toward `scroll * LineH`. The scroll position
    /// itself is still whole lines; this is only how it gets there. Jumping a whole 23px line per wheel notch
    /// is what read as "really jumpy and glitchy" (Joshua, 2026-10-02).</summary>
    float scrollPx;
    DateTime hideAt = DateTime.MaxValue;
    string receipt = "";

    /// <summary>Set once, alongside the reply's own final (non-streaming) Show(), when present_list ran this
    /// turn (2026-09-24). Never part of Show()'s own signature - that call site count is already long, and a
    /// list is the exception, not the shape every reply takes. Cleared by Clear() and by a genuinely new
    /// (non-continuing) Show(), same as Wide is just below. Setting it recomputes the target height the same
    /// way Asking's own setter does, so the bubble grows to actually fit the rows.</summary>
    public BubbleRows? Rows
    {
        get => rows;
        set { rows = value; targetH = HeightFor(Math.Min(lines.Count, CollapsedLines)); }
    }
    BubbleRows? rows;
    const float RowH = 34f, RowGap = 5f, RowIconSlot = 22f;
    /// <summary>Extra height the rows need, added into HeightFor's own clamp - zero with no list, so nothing
    /// here changes a plain reply's layout.</summary>
    const float PlaqueH = 22f, PlaqueGap = 6f;
    /// <summary>Whether this list carries a header plaque. Checked in one place so the height and the drawing
    /// can never disagree - leaving the rows out of the height calculation is exactly the bug that pushed two
    /// of them onto the desktop (2026-10-01).</summary>
    bool HasPlaque => rows != null && !string.IsNullOrWhiteSpace(rows.HeaderText);
    float RowsH => rows == null || rows.Items.Count == 0 ? 0f
        : rows.Items.Count * (RowH + RowGap) + 6f + (rows.MoreCount is int mc && mc > 0 ? 18f : 0f)
          + (HasPlaque ? PlaqueH + PlaqueGap : 0f);

    // Two widths: a short reply keeps the narrow bubble; a long one widens to the left by WideExtra so it takes fewer
    // lines. Decided once per reply and kept while it streams, so the text re-wraps at most once.
    //
    // WideAfterLines was 4, so 2-4 line replies - most of them - sat at the narrow width: measured (2026-09-23)
    // at ~35 characters per line, under the ~45 accessibility floor for reading multiple lines (WCAG/typography
    // research; the wide width measures ~59, comfortably in the 50-75 ideal range). A single line has no line-
    // length problem to fix (nothing to read rhythm across), so the real threshold is "more than one line",
    // not "many": Joshua, 2026-09-23, "jumbled and hard to read", researched rather than guessed at a number.
    public const int WideExtra = 160, WideAfterLines = 1;

    /// <summary>
    /// How much wider and taller the bubble gets while it is showing the conversation.
    ///
    /// A reply is read once and dismissed; scrollback is read like a page, and at 12 lines in a 416px box it
    /// was "too small and cramped" (Joshua, 2026-10-02). These only apply in scrollback, so a normal reply
    /// over the game is exactly the size it was.
    /// </summary>
    public const int ScrollbackExtra = 300, ScrollbackLines = 22;
    public const int ScrollbackMaxH = ScrollbackLines * LineH + 2 * Pad;   // 530
    public bool Wide { get; private set; }
    public float LeftNow => scrollback ? Left - ScrollbackExtra : Wide ? Left - WideExtra : Left;

    /// <summary>Lines that fit at the current size. The conversation gets more room than one reply does.</summary>
    int FitLines => scrollback ? ScrollbackLines : ExpandedLines;
    /// <summary>Where text starts. Derived from LeftNow rather than restating the widening, so a new width
    /// cannot move the frame and leave the text behind - which is exactly what the conversation width did on
    /// its first run: a dead slab of empty parchment down the left (2026-10-02).</summary>
    float TextXNow => LeftNow + (TextX - Left);
    float MaxW => Wide ? MaxTextW + WideExtra : MaxTextW;

    /// <summary>Text width inside a conversation card. Narrower than MaxW by the card's own padding, or the
    /// last word of a long reply sits on the card edge (2026-10-02, seen in a capture).</summary>
    float CardTextW => MaxW - 44;

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
    /// <summary>A question that needs an answer before anything happens. Buttons show only for this.</summary>
    public bool Asking
    {
        get => asking;
        set
        {
            if (asking == value) return;
            asking = value;
            if (asking) LayoutChoices();          // a long verb ("Start Claude on the job hunt") must not run past the frame
            targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        }
    }
    bool asking;
    /// <summary>The verb button's own words (e.g. "Open Chrome"), not a generic "Yes" - StyleLab 2026-09-22.</summary>
    public string VerbLabel { get; set; } = "Do it";
    /// <summary>Set only when this kind of thing can be trusted from now on. Empty means the once/not-now pair
    /// is the whole choice - the third row never appears, same shape as the old Yes/No.</summary>
    public string AlwaysLabel { get; set; } = "";
    // Weighted buttons: 28 px tall (they were 20, small for a decision that grants a permission).
    public const int ChoiceH = 28, ChoiceGap = 8;
    /// <summary>True when the verb label is too wide to sit beside "Not now" even in the wide bubble, so all
    /// three choices stack in their own row instead of two sharing one (found live, 2026-09-22: "Start Claude
    /// on the job hunt" ran "Not now" clean off the edge of the frame).</summary>
    bool stacked;
    int AskRows => (stacked ? 2 : 1) + (AlwaysLabel.Length > 0 ? 1 : 0);
    public int AskRow => AskRows * (ChoiceH + ChoiceGap);
    // Rects are measured text width, so they are pinned down once per Draw() (DrawChoices) and read back here -
    // a formula can't know a label's width without a Graphics, which HitChoice is not given one of.
    readonly RectangleF[] choiceRects = new RectangleF[3];
    /// <summary>0 = once (VerbLabel), 1 = not now, 2 = always (AlwaysLabel) - present only when AlwaysLabel is set.</summary>
    public RectangleF ChoiceRect(int i) => choiceRects[i];
    public int HitChoice(float x, float y)
    {
        if (!Asking || !Visible) return -1;
        var count = AlwaysLabel.Length > 0 ? 3 : 2;
        for (int i = 0; i < count; i++) { var r = ChoiceRect(i); r.Inflate(4, 4); if (r.Contains(x, y)) return i; }
        return -1;
    }
    public const int ToolW = 20, ToolH = 17, ToolGap = 6;
    /// <summary>0 = copy, 1 = good, 2 = not good. A small toolbar floating above the bubble's top-right corner -
    /// it used to straddle the border itself, half in and half out, which read as misaligned rather than
    /// deliberate (2026-09-22 feedback). Clear of the frame now, with its own halo so it still reads as his.</summary>
    public RectangleF ToolRect(int i) => new(Right - 8 - (3 - i) * (ToolW + 3), CurrentTop - ToolH - ToolGap, ToolW, ToolH);
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
    public bool CanScroll => (expanded || scrollback) && lines.Count > FitLines;
    public int VisibleLineCount => expanded ? Math.Min(lines.Count, FitLines) : Math.Min(lines.Count, CollapsedLines);
    public bool Animating => Visible && (Dots || Revealing || Math.Abs(shownH - targetH) > 0.4f || Math.Abs(scrollPx - scroll * (float)LineH) > 0.5f);
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
    public List<string> Wrap(string t) => Wrap(t, MaxW);

    /// <param name="maxW">The width to wrap to. Defaults to the bubble's own; a conversation card is
    /// narrower, because its padding is inside that width and not outside it.</param>
    public List<string> Wrap(string t, float maxW)
    {
        var result = new List<string>();
        foreach (var para in t.Replace("\r", "").Split('\n'))
        {
            var cur = "";
            float curW = 0;
            foreach (var word in para.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            {
                var w = Width(word);
                if (w > maxW)
                {
                    if (cur.Length > 0) { result.Add(cur); cur = ""; curW = 0; }
                    var chunk = "";
                    foreach (var ch in word)
                    {
                        if (chunk.Length > 0 && Width(chunk + ch) > maxW) { result.Add(chunk); chunk = ""; }
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

    float HeightFor(int lineCount) => Math.Clamp(lineCount * LineH + (asking ? AskRow : 0) + (Asked.Length > 0 ? AskedRowH : 0) + RowsH + 2 * Pad,
        MinH, scrollback ? ScrollbackMaxH : ExpandedMaxH + AskRow + AskedRowH + RowsH);

    public void Show(string t, bool stream, int holdMs)
    {
        // The next piece of the same reply (or its final form) carries on from what is already shown.
        var same = Visible && !Dots && full.Length > 0 && t.StartsWith(full, StringComparison.Ordinal);
        Dots = false; receipt = "";
        if (!same) { Wide = false; shown = stream ? 0 : t.Length; rows = null; }   // a genuinely new reply starts with no list until told otherwise
        full = t;
        if (!Wide) Wide = Wrap(t).Count > WideAfterLines;          // measured at the narrow width
        text = full[..Math.Min(shown, full.Length)];
        lines = Wrap(text);
        coreStreaming = stream; holdAfter = holdMs;
        streaming = stream || Revealing;
        expanded = false; scrollback = false; scroll = 0; Tools = false; Rating = 0; CopiedUntil = default; Asking = false;
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

    /// <summary>Characters revealed per 50ms tick, so 2 is 40 a second. Steady, and deliberately not tied to
    /// how much text is waiting.
    ///
    /// It used to be `Math.Max(2, backlog / 6)`, which meant a reply that arrived all at once was dumped at
    /// around 2,000 characters a second while a slow one trickled: the same bubble read as typing or as a
    /// flash depending on how fast Claude happened to answer. Joshua's decision, and the convention every RPG
    /// uses: one even pace you can start reading immediately, and a click to skip the rest. 40 a second is
    /// brisk against roughly 20 for comfortable prose reading, which is right for text you can already see
    /// landing rather than text you must decode word by word.</summary>
    const int RevealPerTick = 2;

    /// <summary>Show the rest of the reply at once: the click half of the RPG convention. Only meaningful
    /// once the whole reply has arrived - while Claude is still generating there is nothing to skip to, and a
    /// click there means "stop", which PetWindow handles instead.</summary>
    public bool SkipReveal()
    {
        if (!Visible || Dots || !Revealing) return false;
        shown = full.Length;
        text = full; lines = Wrap(text);
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        if (!coreStreaming) { streaming = false; SetHold(); }   // the hold starts now, not when the animation would have ended
        return true;
    }

    /// <summary>Reveal a few more characters. True when the text changed.</summary>
    bool StepReveal()
    {
        if (!Visible || Dots || !Revealing) return false;
        shown = Math.Min(full.Length, shown + RevealPerTick);
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
        text = ""; full = ""; shown = 0; Wide = false; receipt = ""; lines = new(); hideAt = DateTime.MaxValue; shownH = 0; Link = ""; Asked = ""; rows = null;
    }

    /// <summary>Grow the bubble upward to fit up to 12 lines. Returns false if there is nothing more to show.</summary>
    public bool Expand()
    {
        if (!More) return false;
        expanded = true; scroll = 0;
        targetH = HeightFor(Math.Min(lines.Count, FitLines));
        hideAt = DateTime.UtcNow.AddMinutes(5);           // stays until Joshua closes it
        return true;
    }

    /// <summary>Keep something that was said. Called as each turn lands, so scrolling up has anything to show.</summary>
    public void Remember(int id, string text, bool mine) => RememberAt(id, text, mine, DateTime.Now);

    /// <summary>Remember something said at a given time. Separate so tests can lay out several days.</summary>
    public void RememberAt(int id, string text, bool mine, DateTime when)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) return;
        // The same reply arrives repeatedly while it streams; only the finished one is kept.
        if (back.Count > 0 && back[^1].Mine == mine && t.StartsWith(back[^1].Text, StringComparison.Ordinal)) back.RemoveAt(back.Count - 1);
        back.Add(new Said(id, t, mine, when));
        while (back.Count > KeepTurns) back.RemoveAt(0);
    }

    /// <summary>
    /// Fill in the row ids for the exchange that just finished.
    ///
    /// The two turns are remembered as they happen - his the moment he presses Enter, the reply when it
    /// lands - and neither has a row until the Core has written them. Matched from the end rather than by
    /// position: anything else goes wrong the first time a message is dropped or a reply never arrives.
    /// </summary>
    public void AssignIds(int userTurn, int aangTurn)
    {
        for (var i = back.Count - 1; i >= 0 && i >= back.Count - 2; i--)
        {
            if (back[i].Id != 0) continue;
            back[i] = back[i] with { Id = back[i].Mine ? userTurn : aangTurn };
        }
        if (scrollback) { var at = scroll; Rebuild(); scroll = at; }
    }

    /// <summary>What a stored turn actually said, for Copy and for the chip. Empty if it is no longer kept.</summary>
    public string Remembered(int id) => back.FirstOrDefault(b => b.Id == id)?.Text ?? "";

    /// <summary>Drop a turn from the stack because he forgot it. The Core hides the row; this takes it off
    /// the screen now, rather than leaving it there until something else redraws.</summary>
    public void Forget(int id)
    {
        if (back.RemoveAll(b => b.Id == id) == 0) return;
        if (!scrollback) return;
        if (back.Count == 0) { LeaveScrollback(); return; }
        var wasAt = scroll;
        Rebuild();
        scroll = Math.Clamp(wasAt, 0, Math.Max(0, lines.Count - FitLines));
        targetH = HeightFor(Math.Min(lines.Count, FitLines));
    }

    /// <summary>
    /// The row id of the message under a point, or 0.
    ///
    /// Outside scrollback that is whatever reply is on screen: right-clicking the answer he is reading is
    /// the obvious case, and limiting this to scrollback meant the menu only existed somewhere he had to
    /// find first (2026-10-02).
    /// </summary>
    public int TurnAt(float y)
    {
        if (!scrollback) return back.Count > 0 && !back[^1].Mine ? back[^1].Id : 0;
        var i = LineAt(y);
        if (i < 0 || i >= lineTurn.Count) return 0;
        if (lineTurn[i] > 0) return lineTurn[i];
        // A blank line, or a date divider, between two lines of the same message. Snap to the message just
        // below, then just above, rather than doing nothing: a click landing in the gap is still a click on
        // something, and silence reads as the menu being broken (which is exactly how it read to me when a
        // test click landed on a divider, 2026-10-02).
        for (var d = 1; d <= 2; d++)
        {
            if (i + d < lineTurn.Count && lineTurn[i + d] > 0) return lineTurn[i + d];
            if (i - d >= 0 && lineTurn[i - d] > 0) return lineTurn[i - d];
        }
        return 0;
    }

    /// <summary>The visible line index at a y in bubble coordinates, or -1.</summary>
    int LineAt(float y)
    {
        var top = CurrentTop + Pad;
        var i = (int)((y - top) / LineH);
        return i < 0 ? -1 : scroll + i;
    }

    /// <summary>Which stored turn each line came from, so a click can name a row.</summary>
    readonly List<int> lineTurn = new();

    /// <summary>
    /// Show the conversation instead of the last reply.
    ///
    /// His decision, 2026-10-01: the bubble rests on one reply and only becomes the stack when he goes
    /// looking, so it stays small over the game. Built on the same wrapped-lines list the expanded view
    /// already scrolls, rather than a second renderer, so paging, the scrollbar and the height all keep
    /// working as they do.
    /// </summary>
    /// <summary>
    /// Put older turns in front of what is already there.
    ///
    /// Called with what the database holds, so scrolling back reaches past this run of the app. Anything
    /// already in the stack wins: the live copy is the one whose row ids have been filled in, and it is the
    /// one he has been looking at.
    /// </summary>
    public void Prepend(IEnumerable<Said> older)
    {
        var have = new HashSet<int>(back.Where(b => b.Id > 0).Select(b => b.Id));
        var add = older.Where(o => o.Id > 0 && !have.Contains(o.Id)).ToList();
        if (add.Count == 0) return;
        // The newest of the fetched turns is almost always the same text as the live one; ids keep them apart.
        back.InsertRange(0, add);
        // No trimming here: these are the pages he asked for by scrolling to them.
        if (!scrollback) return;
        // Keep his eye where it was: everything shifted down by however many lines went in above.
        var before = lines.Count;
        Rebuild();
        scroll = Math.Clamp(scroll + (lines.Count - before), 0, Math.Max(0, lines.Count - FitLines));
        targetH = HeightFor(Math.Min(lines.Count, FitLines));
    }

    /// <summary>
    /// Open the conversation on demand, with or without a reply on screen.
    ///
    /// Scrolling only reached it while a bubble happened to be up, which meant saying something to Aang
    /// first just to have something to scroll (Joshua, 2026-10-02: "the chat bubble should always be
    /// accesable not only when i send a message to try and get to it").
    /// </summary>
    public bool OpenConversation()
    {
        if (scrollback) return false;
        Visible = true; Dots = false; streaming = false; Asking = false;
        Asked = ""; rows = null;                       // neither belongs to a conversation, only to one reply
        scrollback = true; expanded = true;
        Rebuild();
        scroll = Math.Max(0, lines.Count - FitLines);
        targetH = HeightFor(Math.Min(Math.Max(lines.Count, 3), FitLines));
        scrollPx = scroll * LineH;
        if (shownH <= 0) shownH = targetH * 0.55f;
        hideAt = DateTime.UtcNow.AddMinutes(10);        // it stays until he closes it
        return true;
    }

    public bool EnterScrollback()
    {
        if (scrollback || back.Count == 0) return false;
        scrollback = true; expanded = true;
        Rebuild();
        scroll = Math.Max(0, lines.Count - FitLines);     // open at the newest, like any chat window
        targetH = HeightFor(Math.Min(lines.Count, FitLines));
        hideAt = DateTime.UtcNow.AddMinutes(5);
        return true;
    }

    void Rebuild()
    {
        lines = new(); mineLine = new(); lineTurn.Clear(); dividers.Clear(); heads.Clear();
        void Mark(string text, bool mine, int id, bool divider = false)
        {
            if (divider) dividers.Add(lines.Count);
            lines.Add(text); mineLine.Add(mine); lineTurn.Add(id);
        }
        if (ReachedTheStart) Mark(back.Count > 0 ? "This is the start." : "Nothing said yet.", false, 0, divider: true);
        var day = DateTime.MinValue.Date;
        for (var i = 0; i < back.Count; i++)
        {
            var said = back[i];
            // A date whenever the day changes. Scrolling back a week without them is a wall of sentences with
            // no idea where you are in it.
            if (said.When.Date != day)
            {
                day = said.When.Date;
                if (lines.Count > 0) Mark("", false, 0);
                Mark(DayName(day), false, 0, divider: true);
            }
            // Who said it and when, on its own small line above the words.
            //
            // This replaces a blank separator. A blank line says "something changed" and leaves him to work
            // out what; with long replies and several turns on screen that is the wall he described
            // (2026-10-02: "a bit hard to decern what is what espically with long replies or lots of input").
            // A costed line that names the speaker is worth more than an empty one that does not.
            heads.Add(lines.Count);
            Mark((said.Mine ? "YOU" : "AANG") + "   " + said.When.ToString("h:mm tt").ToLowerInvariant(), said.Mine, said.Id);
            foreach (var l in Wrap(said.Text, CardTextW)) Mark(l, said.Mine, said.Id);
        }
    }

    /// <summary>
    /// The conversation, drawn as a container of messages rather than a page of text (mockup F).
    ///
    /// A recessed dark panel, then one card per turn: Joshua's right-aligned on plum and only as wide as
    /// its words, Aang's left-aligned on parchment. The label sits ABOVE its card, outside it, so the eye
    /// gets "who" before "what" and a long reply still reads as one object with a top and a bottom.
    /// </summary>
    void DrawConversation(Graphics g, float textTop, int first, int count)
    {
        float left = TextXNow - 4, right = Right - 10;
        // The panel the cards sit on: the same carved mahogany the tray menu and the bubble's own frame are
        // cut from, lit from the top, with its grain. The first version washed Theme.Ink over the parchment,
        // which is a cold purple-black and came out exactly as Joshua described it - "grey and dead"
        // (2026-10-02). Wood1/Wood2 were already the right colours; Ink was never a wood.
        var panel = new RectangleF(left - 4, textTop - 6, right - left + 10, count * LineH + 10);
        using (var pp = RoundRect(panel, 7))
        {
            using (var pb = new LinearGradientBrush(panel, Theme.Wood1, Theme.Wood2, 90f)) g.FillPath(pb, pp);
            DrawGrain(g, pp, panel, Theme.WoodGrain, 6f);
            // A dark lip round the inside, so the panel reads as recessed into the bubble rather than laid on it.
            using var lip = new Pen(Theme.WoodPlaque, 1.4f);
            g.DrawPath(lip, pp);
        }

        using var body = Theme.Font(Theme.Face, Theme.BodyPx);
        using var small = Theme.Font(Theme.Face, Theme.ReceiptPx);
        using var ink = new SolidBrush(Theme.InkText);
        using var pale = new SolidBrush(Theme.Text);
        using var dim = new SolidBrush(Theme.WithAlpha(Theme.Text, 150));

        for (int i = 0; i < count && first + i < lines.Count; i++)
        {
            var idx = first + i;
            float y = textTop + i * LineH;

            if (dividers.Contains(idx))
            {
                var w = Width(lines[idx]);
                var cx = left + (right - left - w) / 2f;
                using var rule = new Pen(Theme.WithAlpha(Theme.Text, 70), 1f);
                g.DrawLine(rule, left, y + 10, cx - 6, y + 10);
                g.DrawLine(rule, cx + w + 6, y + 10, right, y + 10);
                g.DrawString(lines[idx], small, dim, cx, y + 3, StringFormat.GenericTypographic);
                continue;
            }
            if (!heads.Contains(idx)) continue;           // body lines are drawn with their own card below

            // How far this turn runs, in visible lines.
            var mine = mineLine[idx];
            var last = i;
            while (last + 1 < count && first + last + 1 < lines.Count
                   && !heads.Contains(first + last + 1) && !dividers.Contains(first + last + 1)
                   && lineTurn[first + last + 1] == lineTurn[idx]) last++;
            var bodyCount = last - i;                      // the header itself is not in the card

            // The label, above the card and outside it.
            var label = lines[idx];
            var lw = Width(label);
            g.DrawString(label, small, dim, mine ? right - lw : left, y + 3, StringFormat.GenericTypographic);

            if (bodyCount <= 0) continue;
            // His own messages are as wide as they need to be; Aang's take the width, because his are longer
            // and ragged right-edges on a paragraph read worse than a block.
            float widest = 0;
            for (var b = 1; b <= bodyCount; b++) widest = Math.Max(widest, Width(lines[first + i + b]));
            float cardW = mine ? Math.Min(widest + 18, right - left) : right - left;
            float cardX = mine ? right - cardW : left;
            var card = new RectangleF(cardX, y + LineH - 3, cardW, bodyCount * LineH + 7);

            using (var cp = RoundRect(card, 6))
            {
                if (mine)
                {
                    using var b = new SolidBrush(Theme.Plum);
                    g.FillPath(b, cp);
                }
                else
                {
                    using var b = new LinearGradientBrush(card, Theme.Parch1, Theme.Parch2, 90f);
                    g.FillPath(b, cp);
                }
                using var edge = new Pen(Theme.WithAlpha(mine ? Theme.Gold : Theme.ParchEdge, mine ? 110 : 200), 1f);
                g.DrawPath(edge, cp);
            }
            for (var b = 1; b <= bodyCount; b++)
                g.DrawString(lines[first + i + b], body, mine ? pale : ink,
                    cardX + 9, y + b * LineH, StringFormat.GenericTypographic);
            i = last;
        }
    }

    /// <summary>Lines that name the speaker rather than repeat what was said.</summary>
    readonly List<int> heads = new();

    /// <summary>Lines that are a divider rather than something said: drawn centred and dim, never as speech.</summary>
    readonly List<int> dividers = new();

    static string DayName(DateTime d)
    {
        var today = DateTime.Now.Date;
        if (d == today) return "Today";
        if (d == today.AddDays(-1)) return "Yesterday";
        return d > today.AddDays(-6) ? d.ToString("dddd") : d.ToString("d MMMM");
    }

    /// <summary>Leave the stack and go back to the last reply. Called when he answers, or presses Esc.</summary>
    public bool LeaveScrollback()
    {
        if (!scrollback) return false;
        scrollback = false; expanded = false; scroll = 0; scrollPx = 0;
        lines = Wrap(text); mineLine = new(); lineTurn.Clear();
        // Opened from the menu with nothing on screen, there is no reply to fall back to, and collapsing to a
        // bubble containing no words left an empty parchment box sitting there with no way to shift it
        // (2026-10-02, Joshua: "right now hes stuck"). Nothing to say means nothing on screen.
        if (text.Length == 0) { Visible = false; Dots = false; hideAt = DateTime.MaxValue; shownH = 0; return true; }
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        return true;
    }

    /// <summary>Back to the normal size (Esc, or a click outside).</summary>
    public bool Collapse()
    {
        if (!expanded) return false;
        // Esc out of the stack puts the last reply back, not an empty expanded bubble: `lines` is the whole
        // conversation while scrolled back, and collapsing without rebuilding would show six lines of it.
        if (scrollback) return LeaveScrollback();
        expanded = false; scroll = 0;
        targetH = HeightFor(Math.Min(lines.Count, CollapsedLines));
        hideAt = DateTime.UtcNow.AddSeconds(60);
        return true;
    }

    /// <summary>Scroll the expanded view by whole lines. Returns false if it did not move.</summary>
    public bool Scroll(int delta)
    {
        // Scrolling up with nothing above is how he asks for the conversation: it is the gesture he would
        // make anyway, so there is nothing extra to learn.
        if (delta < 0 && !scrollback && scroll == 0 && back.Count > 0) return EnterScrollback();
        if (!CanScroll) return false;
        var max = lines.Count - FitLines;
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
            var maxScroll = lines.Count - FitLines;
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
        var next = (int)Math.Round(frac * (lines.Count - FitLines));
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
        var scrollTo = scroll * (float)LineH;
        if (Visible && Math.Abs(scrollPx - scrollTo) > 0.5f) { scrollPx += (scrollTo - scrollPx) * 0.28f; changed = true; }
        else if (Visible && scrollPx != scrollTo) { scrollPx = scrollTo; changed = true; }
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
        var pathBounds = path.GetBounds();
        using var halo = new Pen(Theme.Halo, Theme.HaloStroke) { LineJoin = LineJoin.Round };
        using var pen = new Pen(strokeC, Theme.Stroke) { LineJoin = LineJoin.Round };
        // Carved wood, not a flat ink fill (mockup D, StyleLab 2026-09-24): a top-lit gradient plus a few grain
        // streaks - Theme.Wood1/Wood2/WoodGrain already existed for the tray menu's wood panel, but the bubble
        // itself never picked them up, which is why the first pass at this list read as "just rows on ink."
        using (var wg = new LinearGradientBrush(pathBounds, Theme.Wood1, Theme.Wood2, 90f)) g.FillPath(wg, path);
        DrawGrain(g, path, pathBounds, Theme.WoodGrain, 7f);
        g.DrawPath(halo, path);                 // a dark edge under the gold, so it holds on a bright snowfield as well as a dark forest
        g.DrawPath(pen, path);
        // The gold bevel (mockup D, finished 2026-10-01). A single flat stroke reads as an outline drawn round
        // a shape; a carved frame is lit from above, so the gold is bright along the top and falls to GoldDeep
        // along the bottom. GoldDeep already existed in Theme.cs as "the lip under a gold button" and was never
        // used here. One gradient pen rather than two clipped arcs, because the outline includes the tail wedge
        // and clipping an arbitrary path by quadrant is fragile.
        using (var bevelBrush = new LinearGradientBrush(pathBounds, Theme.GoldLit, Theme.GoldDeep, 90f))
        using (var bevel = new Pen(bevelBrush, Theme.Stroke * 0.55f) { LineJoin = LineJoin.Round })
            g.DrawPath(bevel, path);

        // The reading pane: parchment inset inside the wood+gold frame, StyleLab 2026-09-22. Plain rounded rect,
        // no tail - the tail wedge stays wood, the same as every RPG dialogue box this was measured against.
        var bodyRect = new RectangleF(LeftNow, top, Right - LeftNow, Bottom - top);
        var inset = RectangleF.Inflate(bodyRect, -6, -6);
        if (inset.Width > 0 && inset.Height > 0)
        {
            using var ip = RoundRect(inset, Math.Max(4f, Radius - 6f));
            using (var pg = new LinearGradientBrush(inset, Theme.Parch1, Theme.Parch2, 90f)) g.FillPath(pg, ip);
            DrawGrain(g, ip, inset, Theme.WithAlpha(Theme.ParchEdge, 22), 11f);
            // Recessed, not painted on (mockup D). The bevel runs the opposite way to the frame's: the pane is
            // sunk, so its top edge is in shadow and its bottom edge catches the light. That inversion is the
            // whole reason it reads as carved rather than as a lighter rectangle sitting on wood.
            using (var insetBevel = new LinearGradientBrush(inset, Theme.WithAlpha(Theme.Wood2, 190), Theme.WithAlpha(Theme.WoodCream, 150), 90f))
            using (var ipen = new Pen(insetBevel, 1.6f)) g.DrawPath(ipen, ip);
        }

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
                using var small = Theme.Font(Theme.Face, Theme.ReceiptPx);
                using var rb = new SolidBrush(dimC);
                g.DrawString(receipt + "...", small, rb, TextXNow, (Bottom + top) / 2 - 2, StringFormat.GenericTypographic);
            }
            return;
        }

        g.SetClip(path);
        using var tb = new SolidBrush(textC);
        // In scrollback the view sits at a PIXEL offset that eases toward the line it is scrolling to, so the
        // first visible line can be a partial one. Everything else still works in whole lines.
        var smooth = scrollback ? scrollPx : scroll * (float)LineH;
        var first = streaming ? Math.Max(0, lines.Count - CollapsedLines) : expanded ? (int)(smooth / LineH) : 0;
        var count = streaming ? Math.Min(lines.Count, CollapsedLines) : VisibleLineCount;
        // One extra line, so the part-line scrolling in at the bottom is drawn rather than popping in.
        if (scrollback && first + count < lines.Count) count++;
        var slide = scrollback ? -(smooth - first * LineH) : 0f;
        // A short reply does not fill the minimum bubble height, so the leftover space is split above and
        // below instead of all falling underneath the text. Joshua asked for even padding; the MinH clamp
        // had quietly reintroduced 11px above and 27px below on a one-liner.
        // RowsH belongs here, and leaving it out was a real bug (found 2026-10-01 by looking at a capture
        // rather than at the tests, which all passed). HeightFor already grows the bubble by RowsH, so a reply
        // with rows got a tall bubble and a `slack` computed as if the rows did not exist. Half that phantom
        // slack went above the text, which pushed the rows down by the same amount and straight out of the
        // frame: with five rows, two of them and the "N more" line drew on the desktop below the bubble.
        var used = count * LineH + (asking ? AskRow : 0) + (Asked.Length > 0 ? AskedRowH : 0) + RowsH;
        var slack = Math.Max(0f, (Bottom - top) - 2 * Pad - used);
        var textTop = top + Pad + slack / 2f + slide;
        if (Asked.Length > 0)
        {
            using var af = Theme.Font(Theme.Face, Theme.ReceiptPx);
            using var ab = new SolidBrush(dimC);
            var line = Asked.Replace("\r", " ").Replace("\n", " ").Trim();
            if (line.Length > 50) line = line[..49].TrimEnd() + "…";
            g.DrawString(line, af, ab, TextXNow, textTop, StringFormat.GenericTypographic);
            textTop += AskedRowH;
        }
        // Only the first "Claude" in the message is the link: every mention marked at once reads as noise.
        int linkLine = -1;
        if (Link.Length > 0) for (int j = 0; j < lines.Count; j++) if (lines[j].Contains(Link, StringComparison.Ordinal)) { linkLine = j; break; }
        // In scrollback the bubble stops being a sheet of text and becomes a container of messages: a
        // recessed dark panel with a card per turn on it, his on the right in plum, Aang's on the left in
        // parchment, each labelled above itself (mockup F). Bands on one sheet told the voices apart but not
        // where a message started and stopped, which is what made long replies hard to follow
        // (Joshua, 2026-10-02: "hard to decern what is what espically with long replies").
        if (scrollback)
        {
            DrawConversation(g, textTop, first, count);
            g.ResetClip();
        }
        else
        {
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
        }
        g.ResetClip();
        if (rows != null && rows.Items.Count > 0) DrawRows(g, textTop + count * LineH + 6f);

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

    /// <summary>A fixed diagonal streak pattern clipped to <paramref name="path"/> - "always the same seed"
    /// (Theme.WoodGrain's own comment), not randomized per frame, so the bubble does not shimmer as it redraws.
    /// Used at two different spacings/colours: wide dark streaks on the wood frame, faint ones on the parchment.</summary>
    static void DrawGrain(Graphics g, GraphicsPath path, RectangleF bounds, Color color, float spacing)
    {
        g.SetClip(path);
        using var grain = new Pen(color, 1f);
        for (float x = bounds.Left - bounds.Height; x < bounds.Right; x += spacing)
            g.DrawLine(grain, x, bounds.Bottom, x + bounds.Height, bounds.Top);
        g.ResetClip();
    }

    /// <summary>good/normal/careful/stop/inactive -> Theme.cs's own colours, not a new palette. Same five-way
    /// vocabulary the working-state marker and everything else in the app already uses.</summary>
    static Color ChipColor(string? tone) => tone switch
    {
        "good" => Theme.Green, "careful" => Theme.Orange, "stop" => Theme.Red,
        "inactive" => Theme.WithAlpha(Theme.Secondary, 200), _ => Theme.Gold,   // "normal" or unset
    };

    /// <summary>The list a reply's present_list call produced (2026-09-24): one carved-feeling row per item,
    /// icon on the left naming what kind of thing it is, an optional chip on the right saying how it is doing.
    /// At most 5 rows ever reach here (present_list's own schema caps it), so this never needs to scroll on
    /// its own - a "moreCount" line under the rows is the overflow, not a scrollbar.</summary>
    /// <summary>Shorten <paramref name="s"/> to fit <paramref name="w"/>, ending in "..." when anything was
    /// dropped. Takes its own measuring function because a row's title and its subtitle are different fonts:
    /// the title reuses the bubble's cached metrics, the subtitle has to be measured against its own.</summary>
    static string Clip(string s, float w, Func<string, float> measure)
    {
        if (string.IsNullOrEmpty(s) || measure(s) <= w) return s;
        var dots = measure("...");
        var t = s;
        while (t.Length > 0 && measure(t) + dots > w) t = t[..^1];
        // Trailing punctuation before an ellipsis reads as a typo ("the scene...."), the same reason
        // Ellipsize() trims it.
        return t.TrimEnd(',', ';', ':', '.', ' ', '-') + "...";
    }

    void DrawRows(Graphics g, float top)
    {
        if (rows == null) return;
        var icon = PixelIcon.For(rows.Icon);
        using var titleB = new SolidBrush(textC);
        using var subB = new SolidBrush(dimC);
        using var subF = Theme.Font(Theme.Face, Theme.ReceiptPx);
        using var chipF = Theme.Font(Theme.PixelFace, 7f);
        var y = top;
        // The recessed header plaque (mockup D). Carved INTO the parchment rather than laid on it: the
        // WoodPlaque fill is the darkest colour in the theme and its comment already called it "recessed panel
        // behind a header row", so it was made for this and had never been used. Its bevel runs shadow-at-top
        // like the reading pane, the opposite way to the outer frame, which is what sells the recess. The tone
        // colour is the tier - the same five-way vocabulary as the chips, never a sixth meaning.
        if (HasPlaque)
        {
            var plaqueRect = new RectangleF(TextXNow, y, MaxW, PlaqueH);
            var tone = ChipColor(rows.HeaderTone);
            using (var pp = RoundRect(plaqueRect, 4f))
            {
                using (var fill = new SolidBrush(Theme.WoodPlaque)) g.FillPath(fill, pp);
                using (var bev = new LinearGradientBrush(plaqueRect, Theme.WithAlpha(Color.Black, 150), Theme.WithAlpha(Theme.WoodCream, 90), 90f))
                using (var bp = new Pen(bev, 1.4f)) g.DrawPath(bp, pp);
            }
            using (var stripe = new SolidBrush(tone)) g.FillRectangle(stripe, plaqueRect.X + 3, plaqueRect.Y + 4, 3f, plaqueRect.Height - 8);
            using var plaqueF = Theme.Font(Theme.PixelFace, 8f);
            using var plaqueB = new SolidBrush(tone);
            g.DrawString(Clip(rows.HeaderText!, MaxW - 20f, t => g.MeasureString(t, plaqueF, PointF.Empty, StringFormat.GenericTypographic).Width),
                plaqueF, plaqueB, plaqueRect.X + 12, plaqueRect.Y + 6, StringFormat.GenericTypographic);
            y += PlaqueH + PlaqueGap;
        }
        foreach (var item in rows.Items)
        {
            var rowRect = new RectangleF(TextXNow, y, MaxW, RowH);
            var edgeC = ChipColor(item.ChipTone);
            // A carved row, not a flat wash: a two-stop ink gradient for depth and a hairline border, same
            // recipe as the wood frame outside it. The left edge repeats the chip's own colour even when a row
            // has no chip - mockup D's "colour ranks the results," which a bare icon+chip never carried on its
            // own (Joshua, 2026-09-24: "not even close" to that pass).
            using (var rp = RoundRect(rowRect, 5f))
            {
                using (var rg = new LinearGradientBrush(rowRect, Theme.WithAlpha(Theme.ParchEdge, 50), Theme.WithAlpha(Theme.ParchEdge, 20), 90f)) g.FillPath(rg, rp);
                using (var rowLine = new Pen(Theme.WithAlpha(Theme.ParchEdge, 130), 1f)) g.DrawPath(rowLine, rp);
            }
            using (var stripe = new SolidBrush(edgeC)) g.FillRectangle(stripe, rowRect.X, rowRect.Y + 3, 3f, rowRect.Height - 6);

            var slotRect = new RectangleF(rowRect.X + 9, rowRect.Y + (RowH - RowIconSlot) / 2f, RowIconSlot, RowIconSlot);
            using (var slotPath = RoundRect(slotRect, 4f))
            {
                using (var slotFill = new SolidBrush(Theme.WoodPlaque)) g.FillPath(slotFill, slotPath);
                using (var slotPen = new Pen(Theme.WithAlpha(Theme.Gold, 160), 1f)) g.DrawPath(slotPen, slotPath);
            }
            PixelIcon.Draw(g, icon, new PointF(slotRect.X + slotRect.Width / 2f, slotRect.Y + slotRect.Height / 2f), Theme.Gold, 1.9f);

            var chipW = 0f;
            if (!string.IsNullOrEmpty(item.ChipText))
            {
                var chipSize = g.MeasureString(item.ChipText, chipF, PointF.Empty, StringFormat.GenericTypographic);
                chipW = Math.Max(30f, chipSize.Width + 12);
                var chipRect = new RectangleF(rowRect.Right - chipW - 6, rowRect.Y + (RowH - 18) / 2f, chipW, 18);
                using (var cp = RoundRect(chipRect, 4f)) using (var cb = new SolidBrush(ChipColor(item.ChipTone))) g.FillPath(cb, cp);
                using var ct = new SolidBrush(Theme.Ink);
                g.DrawString(item.ChipText, chipF, ct, chipRect.X + (chipRect.Width - chipSize.Width) / 2f, chipRect.Y + 5, StringFormat.GenericTypographic);
                chipW += 10;
            }

            var textX = slotRect.Right + 10;
            var textW = rowRect.Right - textX - 8 - chipW;
            // Cut with an ellipsis, never mid-word in silence. Both of these used to drop characters off the end
            // with nothing to show for it, so "Customer Success Manager" became "Customer Success Mana" and read
            // as a rendering fault rather than as a shortened line (seen in snaps-bubble/03, 2026-10-01). The
            // main text already ellipsizes - Ellipsize() above - and rows now match it.
            g.DrawString(Clip(item.Title, textW, t => Width(t)), bold, titleB, textX, rowRect.Y + 4, StringFormat.GenericTypographic);
            if (!string.IsNullOrEmpty(item.Subtitle))
            {
                var measure = (string t) => g.MeasureString(t, subF, PointF.Empty, StringFormat.GenericTypographic).Width;
                g.DrawString(Clip(item.Subtitle, textW, measure), subF, subB, textX, rowRect.Y + 18, StringFormat.GenericTypographic);
            }
            y += RowH + RowGap;
        }
        if (rows.MoreCount is int more && more > 0)
        {
            using var moreF = Theme.Font(Theme.Face, Theme.ReceiptPx);
            g.DrawString($"{more} more", moreF, subB, TextXNow, y + 2, StringFormat.GenericTypographic);
        }
    }

    float ButtonW(string label)
    {
        using var f = Theme.Font(Theme.PixelFace, Theme.ButtonPx);
        return measure.MeasureString(label, f, PointF.Empty, StringFormat.GenericTypographic).Width + 24;
    }

    /// <summary>Decide, before the first paint, whether the verb and "Not now" fit side by side. Narrow first;
    /// widen like a long reply already does; if even the wide bubble cannot hold both, stack every choice in
    /// its own row instead of letting the row run past the frame.</summary>
    void LayoutChoices()
    {
        var verbW = ButtonW(VerbLabel); var notW = ButtonW("Not now");
        var alwaysW = AlwaysLabel.Length > 0 ? ButtonW(AlwaysLabel) : 0f;
        var row1 = verbW + ChoiceGap + notW;
        if (row1 <= MaxTextW && alwaysW <= MaxTextW) { stacked = false; return; }
        if (!Wide) Wide = true;
        var wideCap = MaxTextW + WideExtra;
        stacked = row1 > wideCap || alwaysW > wideCap;
    }

    /// <summary>
    /// Three real choices, not a collapsed yes/no (StyleLab 2026-09-22, from Joshua's own "ask once per kind,
    /// then trust" rule): the verb itself ("Open Chrome") does it once and forgets; "Not now" declines; a third,
    /// deliberately separate row - orange, never the default - trusts the whole kind from then on. Widths follow
    /// the label (a fixed 68px box could not hold "Open Chrome"), so the rects are measured here and cached for
    /// HitChoice, which has no Graphics of its own to measure with. Stacks instead of overflowing when even the
    /// wide bubble cannot fit the verb beside "Not now" (LayoutChoices decides this before the first paint).
    /// </summary>
    void DrawChoices(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        // Pixel accent (StyleLab 2026-09-22): short button words, not a sentence, so Press Start 2P reads fine here.
        using var f = Theme.Font(Theme.PixelFace, Theme.ButtonPx);
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
        float MeasureW(string label) => g.MeasureString(label, f, PointF.Empty, StringFormat.GenericTypographic).Width + 24;

        var topY = Bottom - Pad - ChoiceH - (AskRows - 1) * (ChoiceH + ChoiceGap);
        var verbW = MeasureW(VerbLabel);
        var notW = MeasureW("Not now");
        float RowY(int row) => topY + row * (ChoiceH + ChoiceGap);

        choiceRects[0] = new RectangleF(TextXNow, RowY(0), verbW, ChoiceH);
        DrawChoice(g, f, choiceRects[0], VerbLabel, Theme.Gold, Theme.GoldDeep, Theme.GoldLight, Theme.Ink, primary: true);
        choiceRects[1] = stacked
            ? new RectangleF(TextXNow, RowY(1), notW, ChoiceH)
            : new RectangleF(TextXNow + verbW + ChoiceGap, RowY(0), notW, ChoiceH);
        DrawChoice(g, f, choiceRects[1], "Not now", Theme.Plum, Theme.PlumDeep, Theme.PlumEdge, Theme.Text, primary: false);

        if (AlwaysLabel.Length > 0)
        {
            var alwaysW = MeasureW(AlwaysLabel);
            choiceRects[2] = new RectangleF(TextXNow, RowY(stacked ? 2 : 1), alwaysW, ChoiceH);
            DrawChoice(g, f, choiceRects[2], AlwaysLabel, Theme.Orange, Theme.OrangeDeep, Theme.OrangeDeep, Theme.Ink, primary: false);
        }
        else choiceRects[2] = RectangleF.Empty;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    }

    /// <summary>One weighted button: a solid face with a lip under it and a catch-light along its top edge.</summary>
    void DrawChoice(Graphics g, Font f, RectangleF r, string label, Color faceColor, Color lip, Color edge, Color text, bool primary)
    {
        var face = new RectangleF(r.X, r.Y, r.Width, r.Height - Theme.Lip);
        using (var lipPath = RoundRect(r, 9)) using (var lb = new SolidBrush(lip)) g.FillPath(lb, lipPath);
        using (var facePath = RoundRect(face, 9))
        {
            using (var fb = new SolidBrush(faceColor)) g.FillPath(fb, facePath);
            if (!primary) using (var ep = new Pen(edge, 1.2f)) g.DrawPath(ep, facePath);
        }
        using (var light = new Pen(Theme.WithAlpha(primary ? Theme.GoldLight : edge, 170), 1f))
            g.DrawLine(light, face.X + 9, face.Y + 1.5f, face.Right - 9, face.Y + 1.5f);
        using var tb = new SolidBrush(text);
        var sz = g.MeasureString(label, f, PointF.Empty, StringFormat.GenericTypographic);
        g.DrawString(label, f, tb, face.X + (face.Width - sz.Width) / 2, face.Y + (face.Height - sz.Height) / 2, StringFormat.GenericTypographic);
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
            using var path = RoundRect(r, 4);
            using (var halo = new Pen(Theme.Halo, 3f) { LineJoin = LineJoin.Round }) g.DrawPath(halo, path);   // now it floats free of the frame, its own dark edge holds it together visually
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
