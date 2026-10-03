using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// The Panel: the at-desk place to look at what Aang knows, what he may do without asking, what he did, and the email
/// drafts waiting for a yes. Everything here is worked out by the Core without the model, so opening it costs no quota.
/// Nothing is decided in this window: each button sends one message and the Core answers with a fresh list, so what is
/// on screen is always what the Core has. A draft is approved by id AND hash, the same as a Discord card.
/// </summary>
sealed class PanelWindow : Form
{
    readonly Func<object, Task> send;
    readonly float s;
    readonly Panel host = new();
    readonly Label notice = new();
    const int Tabs = 7;
    readonly Button[] tabs = new Button[Tabs];
    readonly Control[] pages = new Control[Tabs];
    int current;

    readonly ListView facts, trust, drafts, sessions;
    readonly TextBox activity = new(), preview = new();
    readonly Label draftsEmpty = new(), memoryHint = new(), trustHint = new();
    readonly Button forget, takeBack, sendBtn, saveBtn, discardBtn;
    List<DraftRow> rows = new();

    // History: every past message, newest first, searchable as he types, and copyable (the whole text of a long answer).
    readonly TextBox search = new();
    ConversationView conversation = null!;
    readonly Button copyBtn;
    readonly System.Windows.Forms.Timer searchWait = new() { Interval = 250 };
    bool historyAsked;

    // Settings: the switches from his right-click menu, in one place. The Body owns them; this only shows and flips them.
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)] public Func<string, bool>? GetSetting { get; set; }
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)] public Action<string, bool>? SetSetting { get; set; }
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)] public Action<string>? RunAction { get; set; }
    readonly List<(CheckBox Box, string Key)> switches = new();

    sealed record DraftRow(string Id, string Hash, string To, string Subject, string Body, string Status, string NewTo);

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    public PanelWindow(Func<object, Task> send)
    {
        this.send = send;
        s = Math.Max(1f, DeviceDpi / 96f);
        Text = "Aang: Panel";
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Theme.Ink; ForeColor = Theme.Text;
        // Theme.Face/FaceBold are private TTFs: new Font(name, ...) can't see them and silently falls back to a
        // system default, the same bug the tray menu and input box had. Theme.Font() resolves it; sizes below
        // are point-to-pixel equivalents (pt * 4/3) of what was here before.
        Font = Theme.Font(Theme.Face, 13.3f * (s > 1.4f ? 1f : 1f));
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size((int)(820 * s), (int)(560 * s));
        MinimumSize = new Size((int)(640 * s), (int)(420 * s));
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { /* the default icon */ }

        var names = new[] { "What I know", "What I may do", "What I did", "Drafts", "Jobs", "History", "Settings" };
        var strip = new Panel { Dock = DockStyle.Top, Height = (int)(48 * s), BackColor = Theme.Ink };
        for (int i = 0; i < Tabs; i++)
        {
            int at = i;
            var b = new Button { Text = names[i], FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, TabStop = false,
                Left = (int)((14 + i * 132) * s), Top = (int)(8 * s), Width = (int)(126 * s), Height = (int)(34 * s), Font = Theme.Font(Theme.FaceBold, 14f) };
            b.FlatAppearance.BorderSize = 0;
            b.Click += (_, _) => Select(at);
            tabs[i] = b; strip.Controls.Add(b);
        }

        notice.Dock = DockStyle.Bottom; notice.Height = (int)(30 * s); notice.ForeColor = Theme.Orange;
        notice.Padding = new Padding((int)(16 * s), (int)(6 * s), 0, 0); notice.Text = "";

        host.Dock = DockStyle.Fill; host.BackColor = Theme.Ink;

        // ---- what I know
        facts = MakeList(("What he knows about you", 520), ("Confirmed", 80), ("Last seen", 130));
        forget = MakeButton("Forget this", Kind.Red); forget.Click += (_, _) =>
        {
            if (facts.SelectedItems.Count == 1 && facts.SelectedItems[0].Tag is long id) _ = send(new { t = "forget.fact", id });
        };
        memoryHint.Text = "Forgetting one stops him using it from his next answer. \"Undo that\" brings it back.";
        pages[0] = Page(facts, forget, memoryHint);

        // ---- what I may do
        trust = MakeList(("Allowed without asking", 240), ("For example", 380), ("Since", 110));
        takeBack = MakeButton("Take this back", Kind.Red); takeBack.Click += (_, _) =>
        {
            if (trust.SelectedItems.Count == 1 && trust.SelectedItems[0].Tag is string kind) _ = send(new { t = "revoke", kind });
        };
        trustHint.Text = "Taking one back means he asks again next time. Deleting files, force quits and sending mail always ask.";
        pages[1] = Page(trust, takeBack, trustHint);

        // ---- what I did
        activity.Multiline = true; activity.ReadOnly = true; activity.ScrollBars = ScrollBars.Vertical; activity.BorderStyle = BorderStyle.None;
        activity.BackColor = Theme.Panel2; activity.ForeColor = Theme.Text; activity.Font = new Font("Consolas", 10f, FontStyle.Regular, GraphicsUnit.Point); activity.Dock = DockStyle.Fill;
        // Claude jobs he started through Aang, on top: what each is doing now. A double-click brings Claude forward.
        sessions = MakeList(("Claude job", 190), ("State", 100), ("Started", 130), ("Last news", 300));
        sessions.Dock = DockStyle.Top; sessions.Height = (int)(150 * s);
        sessions.DoubleClick += (_, _) => RunAction?.Invoke("claude");
        var actPage = new Panel { Dock = DockStyle.Fill, Padding = new Padding((int)(14 * s)) };
        actPage.Controls.Add(activity); actPage.Controls.Add(new Panel { Dock = DockStyle.Top, Height = (int)(10 * s) }); actPage.Controls.Add(sessions);
        actPage.Controls.SetChildIndex(activity, 0);
        pages[2] = actPage;

        // ---- drafts
        drafts = MakeList(("To", 230), ("Subject", 370), ("Status", 110));
        drafts.Dock = DockStyle.Top; drafts.Height = (int)(150 * s);
        preview.Multiline = true; preview.ReadOnly = true; preview.ScrollBars = ScrollBars.Vertical; preview.BorderStyle = BorderStyle.None;
        preview.BackColor = Theme.Panel2; preview.ForeColor = Theme.Text; preview.Font = Theme.Font(Theme.Face, 14f); preview.Dock = DockStyle.Fill;
        sendBtn = MakeButton("Send", Kind.Gold); saveBtn = MakeButton("Save as Gmail draft", Kind.Plum); discardBtn = MakeButton("Discard", Kind.Red);
        sendBtn.Click += (_, _) => Act("send"); saveBtn.Click += (_, _) => Act("save"); discardBtn.Click += (_, _) => Act("discard");
        draftsEmpty.Text = ""; draftsEmpty.ForeColor = Theme.Secondary; draftsEmpty.Dock = DockStyle.Top; draftsEmpty.Height = (int)(26 * s);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = (int)(52 * s), Padding = new Padding((int)(14 * s), (int)(8 * s), 0, 0), BackColor = Theme.Ink };
        bar.Controls.AddRange(new Control[] { sendBtn, saveBtn, discardBtn });
        var previewHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding((int)(14 * s), (int)(10 * s), (int)(14 * s), 0) }; previewHost.Controls.Add(preview);
        var draftPage = new Panel { Dock = DockStyle.Fill };
        draftPage.Controls.Add(previewHost); draftPage.Controls.Add(bar);
        var listHost = new Panel { Dock = DockStyle.Top, Height = (int)(176 * s), Padding = new Padding((int)(14 * s), (int)(12 * s), (int)(14 * s), 0) };
        listHost.Controls.Add(drafts); listHost.Controls.Add(draftsEmpty);
        draftPage.Controls.Add(listHost);
        draftPage.Controls.SetChildIndex(previewHost, 0);
        drafts.SelectedIndexChanged += (_, _) => ShowDraft();
        pages[3] = draftPage;

        // ---- history
        search.BorderStyle = BorderStyle.FixedSingle; search.BackColor = Theme.Panel2; search.ForeColor = Theme.Text;
        search.Font = Theme.Font(Theme.Face, 14.7f); search.Dock = DockStyle.Top;
        search.PlaceholderText = "Search everything you and Aang have said...";
        search.TextChanged += (_, _) => { searchWait.Stop(); searchWait.Start(); };
        searchWait.Tick += (_, _) => { searchWait.Stop(); _ = send(new { t = "history", q = search.Text.Trim() }); };
        // The conversation itself, not a table of it (4.3). A three-column ListView with the selected row in
        // a box underneath answers "find the turn where I said X" and cannot answer "what were we talking
        // about on Monday", which is the thing he actually asked for. Both voices are now on screen at once
        // and told apart without reading a word.
        conversation = new ConversationView(s) { Dock = DockStyle.Fill, EmptyMessage = "Nothing here yet." };
        // Right-click a message: reply to that exact one, pin it, copy it, or forget it. The Panel only
        // relays - which row is meant is decided by what he clicked, never inferred from what is newest.
        // Reply closes the Panel, because the next thing he does is type. Pin does not: pinning two things
        // means right-clicking twice, and opening the type box after the first one would put the Panel behind
        // it. The notice is how he knows it landed.
        conversation.ReplyRequested += (id, text) => { PointAt?.Invoke("reply", id, text); Hide(); };
        conversation.PinRequested += (id, text) =>
        {
            PointAt?.Invoke("pin", id, text);
            Say("Pinned. It rides along with everything you type until you take it off.");
        };
        conversation.ForgetRequested += id =>
        {
            _ = send(new { t = "forget.turn", id });
            // Take it off screen now rather than waiting for a round trip, so the click visibly did something.
            _ = send(new { t = "history", q = search.Text.Trim() });
        };
        copyBtn = MakeButton("Copy", Kind.Gold);
        copyBtn.Click += (_, _) =>
        {
            if (conversation.IsEmpty) return;
            try { Clipboard.SetDataObject(conversation.AsText(), true, 5, 60); copyBtn.Text = "Copied"; } catch { copyBtn.Text = "Try again"; }
            var back = new System.Windows.Forms.Timer { Interval = 1200 }; back.Tick += (_, _) => { copyBtn.Text = "Copy"; back.Dispose(); }; back.Start();
        };
        var hBar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = (int)(52 * s), Padding = new Padding((int)(14 * s), (int)(8 * s), 0, 0), BackColor = Theme.Ink };
        hBar.Controls.Add(copyBtn);
        var hText = new Panel { Dock = DockStyle.Fill, Padding = new Padding((int)(14 * s), (int)(4 * s), (int)(14 * s), 0) }; hText.Controls.Add(conversation);
        var hTop = new Panel { Dock = DockStyle.Top, Height = (int)(54 * s), Padding = new Padding((int)(14 * s), (int)(12 * s), (int)(14 * s), 0) };
        hTop.Controls.Add(search);
        var historyPage = new Panel { Dock = DockStyle.Fill };
        historyPage.Controls.Add(hText); historyPage.Controls.Add(hBar); historyPage.Controls.Add(hTop);
        historyPage.Controls.SetChildIndex(hText, 0);
        pages[5] = historyPage;
        pages[4] = BuildJobs();

        // ---- settings
        var set = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding((int)(22 * s), (int)(18 * s), 0, 0), BackColor = Theme.Ink, AutoScroll = true };
        foreach (var (key, label) in new[] {
            ("quietGame", "Stay quiet while WoW has focus"),
            ("mute", "Mute: nothing unprompted"),
            ("seeWindow", "Let him see which app I'm in"),
            ("usage", "Show the usage bars under the box"),
            ("autostart", "Start with Windows") })
        {
            var cb = new CheckBox { Text = label, AutoSize = true, ForeColor = Theme.Text, BackColor = Theme.Ink, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
                Font = Theme.Font(Theme.FaceBold, 14.7f), Margin = new Padding(0, 0, 0, (int)(14 * s)) };
            cb.FlatAppearance.BorderColor = Theme.Gold; cb.FlatAppearance.CheckedBackColor = Theme.Gold; cb.FlatAppearance.MouseOverBackColor = Theme.Plum;
            var k = key;
            cb.CheckedChanged += (_, _) => { if (!loadingSettings) SetSetting?.Invoke(k, cb.Checked); };
            switches.Add((cb, key)); set.Controls.Add(cb);
        }
        var hotkeyBtn = MakeButton("Change the hide and show key...", Kind.Plum); hotkeyBtn.Width = (int)(280 * s); hotkeyBtn.Margin = new Padding(0, (int)(10 * s), 0, (int)(10 * s));
        hotkeyBtn.Click += (_, _) => RunAction?.Invoke("hotkey");
        var undockBtn = MakeButton("Bring him off the edge (undock)", Kind.Plum); undockBtn.Width = (int)(280 * s); undockBtn.Margin = new Padding(0, 0, 0, (int)(10 * s));
        undockBtn.Click += (_, _) => RunAction?.Invoke("undock");
        set.Controls.Add(hotkeyBtn); set.Controls.Add(undockBtn);
        pages[6] = set;

        foreach (var p in pages) { p.Dock = DockStyle.Fill; p.Visible = false; host.Controls.Add(p); }
        Controls.Add(host); Controls.Add(notice); Controls.Add(strip);
        Select(0);
        ShowDraft();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int dark = 1; try { DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int)); } catch { /* an older Windows: a light title bar */ }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); }        // closing only hides it; reopening is instant
        base.OnFormClosing(e);
    }

    /// <summary>Ask the Core for a fresh copy of everything, e.g. every time the Panel is opened.</summary>
    public void Refresh() => _ = send(new { t = "panel" });

    public void Select(int i)
    {
        current = i;
        if (i == 4) ShowJob();
        if (i == 5 && !historyAsked) { historyAsked = true; _ = send(new { t = "history", q = "" }); }
        if (i == 6) LoadSettings();
        for (int k = 0; k < Tabs; k++)
        {
            pages[k].Visible = k == i;
            tabs[k].BackColor = k == i ? Theme.Gold : Theme.Plum;
            tabs[k].ForeColor = k == i ? Theme.Ink : Theme.Text;
        }
    }

    // ---- jobs: the card stack
    //
    // 4.5. One card at a time, not a list. A list of fifteen jobs is a chore you put off; one card with two
    // real answers on it is a decision you can actually make, and then the next one appears. That is the
    // whole design, and it is why the count ("3 of 7") matters - it says the end is in sight.
    //
    // Triaged from the keyboard: A to apply, X to skip, O to open the posting, Z to put the last one back.
    // The keys work only while the Panel has focus, so they can never fire into the game.
    sealed record JobCard(string Id, string Title, string Company, string Location, string Salary,
                          int Score, string Verdict, string Reason, string Url);
    List<JobCard> jobCards = new();
    int jobAt;
    readonly Label jobCount = new(), jobTitle = new(), jobWhere = new(), jobWhy = new(), jobEmpty = new();
    readonly Panel jobChip = new();
    Keycap jobOpen = null!, jobApply = null!, jobSkip = null!, jobUndo = null!;

    Control BuildJobs()
    {
        var page = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Ink, Visible = false };

        jobEmpty.Text = "Nothing waiting on you. Jobs arrive from #job-inbox and the weekly sweep.";
        jobEmpty.ForeColor = Theme.Secondary; jobEmpty.AutoSize = false;
        jobEmpty.Bounds = new Rectangle((int)(24 * s), (int)(24 * s), (int)(560 * s), (int)(28 * s));
        page.Controls.Add(jobEmpty);

        // The card. 340 px wide was the agreed width and it is a good one: wide enough for a real company
        // name, narrow enough that the eye takes the whole card in without travelling.
        var card = new Panel { BackColor = Theme.Plum, Bounds = new Rectangle((int)(24 * s), (int)(56 * s), (int)(340 * s), (int)(250 * s)) };
        card.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Gold, 1.6f);
            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            e.Graphics.DrawRectangle(pen, 0, 0, card.Width - 2, card.Height - 2);
        };

        jobCount.ForeColor = Theme.Secondary; jobCount.AutoSize = false;
        jobCount.Bounds = new Rectangle((int)(24 * s), (int)(26 * s), (int)(300 * s), (int)(22 * s));
        page.Controls.Add(jobCount);

        jobTitle.ForeColor = Theme.Text; jobTitle.AutoSize = false; jobTitle.Font = Theme.Font(Theme.FaceBold, 15f);
        jobTitle.Bounds = new Rectangle((int)(16 * s), (int)(14 * s), (int)(308 * s), (int)(46 * s));
        card.Controls.Add(jobTitle);

        jobWhere.ForeColor = Theme.Secondary; jobWhere.AutoSize = false;
        jobWhere.Bounds = new Rectangle((int)(16 * s), (int)(64 * s), (int)(308 * s), (int)(40 * s));
        card.Controls.Add(jobWhere);

        // The score chip, in the five-way tone vocabulary Theme already uses everywhere else.
        jobChip.Bounds = new Rectangle((int)(16 * s), (int)(108 * s), (int)(92 * s), (int)(24 * s));
        jobChip.Paint += (_, e) =>
        {
            if (jobCards.Count == 0) return;
            var c = jobCards[Math.Min(jobAt, jobCards.Count - 1)];
            var tone = c.Verdict == "apply" ? Theme.Green : c.Verdict == "skip" ? Theme.Red : Theme.Gold;
            e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var b = new SolidBrush(tone);
            e.Graphics.FillRectangle(b, 0, 0, jobChip.Width - 1, jobChip.Height - 1);
            using var f = Theme.Font(Theme.FaceBold, 11f);
            using var tb = new SolidBrush(Theme.Ink);
            var label = $"{c.Verdict}  {c.Score}";
            var sz = e.Graphics.MeasureString(label, f);
            e.Graphics.DrawString(label, f, tb, (jobChip.Width - sz.Width) / 2, (jobChip.Height - sz.Height) / 2);
        };
        card.Controls.Add(jobChip);

        // Why this one. Aang's own reason, shown on the card rather than behind a link: the point of the
        // score is lost if you cannot see what it was for without another click.
        jobWhy.ForeColor = Theme.Secondary; jobWhy.AutoSize = false;
        jobWhy.Bounds = new Rectangle((int)(16 * s), (int)(142 * s), (int)(308 * s), (int)(92 * s));
        card.Controls.Add(jobWhy);
        page.Controls.Add(card);

        // The buttons, in the order he would use them: look, then decide, then the escape hatch.
        int bx = (int)(24 * s), by = (int)(322 * s), bw = (int)(96 * s), bh = (int)(34 * s), gap = (int)(10 * s);
        // The two families come straight from the bubble so they read as the same object: a gold face on a
        // deep-gold lip with dark ink for the thing he usually wants, and a plum face on a deep-plum lip with
        // LIGHT ink for the rest. The first attempt passed Ink as the plum lip and left the dark ink on it,
        // so three of the four buttons had near-invisible text and no lip at all (capture, 2026-10-03).
        Keycap Cap(string text, string key, bool primary, Action go)
        {
            var k = new Keycap {
                Text = text, Key = key, Primary = primary,
                Face = primary ? Theme.Gold : Theme.Plum,
                Lip  = primary ? Theme.GoldDeep : Theme.PlumDeep,
                Edge = primary ? Theme.GoldLight : Theme.PlumEdge,
                Ink  = primary ? Theme.Ink : Theme.Text,
                Bounds = new Rectangle(bx, by, bw, bh), BackColor = Theme.Ink };
            k.Click += (_, _) => go();
            bx += bw + gap;
            page.Controls.Add(k);
            return k;
        }
        jobOpen  = Cap("Open",  "O", false, () => JobAct("open"));
        jobApply = Cap("Apply", "A", true,  () => JobAct("apply"));
        jobSkip  = Cap("Skip",  "X", false, () => JobAct("skip"));
        jobUndo  = Cap("Undo",  "Z", false, () => JobAct("undo"));

        return page;
    }

    void JobAct(string action)
    {
        if (action == "undo") { _ = send(new { t = "job.act", id = "undo", action = "undo" }); return; }
        if (jobCards.Count == 0) return;
        var c = jobCards[Math.Min(jobAt, jobCards.Count - 1)];
        _ = send(new { t = "job.act", id = c.Id, action });
        // Opening the posting is not a decision, so the stack does not move on.
        if (action == "open") return;
        // Move on straight away rather than waiting for the Core's refreshed list. He has decided; making him
        // watch a round trip before the next card appears is what makes a triage flow feel slow.
        jobCards.RemoveAt(Math.Min(jobAt, jobCards.Count - 1));
        if (jobAt >= jobCards.Count) jobAt = Math.Max(0, jobCards.Count - 1);
        ShowJob();
    }

    void ShowJob()
    {
        var any = jobCards.Count > 0;
        jobEmpty.Visible = !any;
        // Hidden, not greyed. Four dead buttons under "nothing waiting on you" is clutter, and the greyed
        // version did not read as disabled anyway (capture, 2026-10-03). Undo stays, because the moment
        // after clearing the last card is exactly when he might want the last one back.
        foreach (var k in new[] { jobOpen, jobApply, jobSkip }) k.Visible = any;
        jobTitle.Parent!.Visible = any;
        jobCount.Visible = any;
        if (!any) { jobCount.Text = ""; return; }

        var c = jobCards[Math.Min(jobAt, jobCards.Count - 1)];
        jobCount.Text = $"{Math.Min(jobAt, jobCards.Count - 1) + 1} of {jobCards.Count} waiting on you";
        jobTitle.Text = c.Title;
        jobWhere.Text = string.Join("   ", new[] { c.Company, c.Location, c.Salary }.Where(x => x.Length > 0));
        jobWhy.Text = c.Reason;
        jobChip.Invalidate();
    }

    /// <summary>
    /// The stack's keys: A apply, X skip, O open, Z undo.
    /// </summary>
    /// <remarks>
    /// Only while the Jobs tab is showing, and only when he is not typing in a box - otherwise an "x" in the
    /// history search would skip a job. ProcessCmdKey runs before the focused control sees the key, which is
    /// what makes a bare letter work as a shortcut at all; the guards below are what keep it from being a
    /// menace. They cannot reach the game, because a window only gets these while it has focus.
    /// </remarks>
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (current == 4 && ActiveControl is not TextBox && jobCards.Count > 0)
        {
            switch (keyData)
            {
                case Keys.A: JobAct("apply"); return true;
                case Keys.X: JobAct("skip"); return true;
                case Keys.O: JobAct("open"); return true;
                case Keys.Z: JobAct("undo"); return true;
            }
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    public int CurrentTab => current;

    // ------------------------------------------------------------------ what the Core sent

    public void Load(JsonElement m)
    {
        notice.Text = m.TryGetProperty("notice", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : "";

        facts.BeginUpdate(); facts.Items.Clear();
        if (m.TryGetProperty("facts", out var fs) && fs.ValueKind == JsonValueKind.Array)
            foreach (var f in fs.EnumerateArray())
            {
                var it = new ListViewItem(Str(f, "text")) { Tag = f.TryGetProperty("id", out var id) ? id.GetInt64() : 0L };
                it.SubItems.Add(f.TryGetProperty("times", out var t) ? "x" + t.GetInt32() : ""); it.SubItems.Add(Day(Str(f, "seen")));
                facts.Items.Add(it);
            }
        facts.EndUpdate();
        memoryHint.Text = facts.Items.Count == 0 ? "He has kept nothing about you yet." : $"{facts.Items.Count} things. Forgetting one stops him using it from his next answer. \"Undo that\" brings it back.";

        trust.BeginUpdate(); trust.Items.Clear();
        if (m.TryGetProperty("trust", out var ts) && ts.ValueKind == JsonValueKind.Array)
            foreach (var t in ts.EnumerateArray())
            {
                var it = new ListViewItem(Str(t, "kind")) { Tag = Str(t, "kind") };
                it.SubItems.Add(Str(t, "example")); it.SubItems.Add(Str(t, "since")); trust.Items.Add(it);
            }
        trust.EndUpdate();
        trustHint.Text = trust.Items.Count == 0 ? "He asks before each kind of thing." : "Taking one back means he asks again next time. Deleting files, force quits and sending mail always ask.";

        sessions.BeginUpdate(); sessions.Items.Clear();
        if (m.TryGetProperty("sessions", out var ss) && ss.ValueKind == JsonValueKind.Array)
            foreach (var j in ss.EnumerateArray())
            {
                var it = new ListViewItem(Str(j, "name")); it.SubItems.Add(Str(j, "state")); it.SubItems.Add(Day(Str(j, "since")) + " " + Clock(Str(j, "since")));
                it.SubItems.Add(Str(j, "last").Replace("\n", " ")); sessions.Items.Add(it);
            }
        if (sessions.Items.Count == 0) { var none = new ListViewItem("No Claude jobs yet. Ask Aang for a longer job, a browsing job, or a change to himself."); sessions.Items.Add(none); }
        sessions.EndUpdate();
        activity.Text = (Str(m, "actions") ?? "").Replace("\r", "").Replace("\n", "\r\n");
        activity.SelectionStart = activity.TextLength; activity.ScrollToCaret();

        var keep = drafts.SelectedItems.Count == 1 ? drafts.SelectedItems[0].Text : null;
        rows = new();
        if (m.TryGetProperty("drafts", out var ds) && ds.ValueKind == JsonValueKind.Array)
            foreach (var d in ds.EnumerateArray())
            {
                var to = d.TryGetProperty("to", out var tl) && tl.ValueKind == JsonValueKind.Array ? string.Join(", ", tl.EnumerateArray().Select(x => x.GetString())) : "";
                var nw = d.TryGetProperty("newTo", out var nl) && nl.ValueKind == JsonValueKind.Array ? string.Join(", ", nl.EnumerateArray().Select(x => x.GetString())) : "";
                rows.Add(new DraftRow(Str(d, "id"), Str(d, "hash"), to, Str(d, "subject"), Str(d, "body"), Str(d, "status"), nw));
            }
        drafts.BeginUpdate(); drafts.Items.Clear();
        foreach (var r in rows) { var it = new ListViewItem(r.To) { Tag = r.Id }; it.SubItems.Add(r.Subject); it.SubItems.Add(r.Status == "confirm" ? "asks again" : "waiting"); drafts.Items.Add(it); }
        drafts.EndUpdate();
        var mailOn = !m.TryGetProperty("mail", out var mo) || mo.ValueKind != JsonValueKind.False;
        draftsEmpty.Text = !mailOn ? "Google is not connected. Double-click tools\\google-setup.cmd once." : rows.Count == 0 ? "No drafts waiting." : $"{rows.Count} waiting. Nothing is sent until you press Send.";
        tabs[3].Text = rows.Count > 0 ? $"Drafts ({rows.Count})" : "Drafts";

        // 4.5: the card stack. The count on the tab is the point - he should be able to tell from the tab
        // strip alone whether anything is waiting, without opening it.
        jobCards = new List<JobCard>();
        if (m.TryGetProperty("jobs", out var js) && js.ValueKind == JsonValueKind.Array)
            foreach (var j in js.EnumerateArray())
                jobCards.Add(new JobCard(Str(j, "id"), Str(j, "title"), Str(j, "company"), Str(j, "location"),
                    Str(j, "salary"), j.TryGetProperty("score", out var sc) && sc.ValueKind == JsonValueKind.Number ? sc.GetInt32() : 0,
                    Str(j, "verdict"), Str(j, "reason"), Str(j, "url")));
        jobAt = 0;
        tabs[4].Text = jobCards.Count > 0 ? $"Jobs ({jobCards.Count})" : "Jobs";
        ShowJob();
        var again = keep is null ? -1 : rows.FindIndex(r => r.To == keep);
        if (rows.Count > 0) drafts.Items[Math.Max(0, again)].Selected = true;
        ShowDraft();
    }

    bool loadingSettings;
    public void LoadSettings()
    {
        loadingSettings = true;
        foreach (var (box, key) in switches) box.Checked = GetSetting?.Invoke(key) ?? false;
        loadingSettings = false;
    }

    /// <summary>The History tab's list, from the Core. A reply to an older search than the box now holds is ignored.</summary>
    /// <summary>Joshua pointed at a message: "reply" or "pin", the row id, and its text for the chip. The
    /// Panel does not own the type box, so it hands this up rather than acting on it.</summary>
    public Action<string, int, string>? PointAt;

    /// <summary>A line along the bottom, cleared after a few seconds. Used for things that happened because
    /// he clicked, where a dialog would be too much and silence would be too little.</summary>
    void Say(string text)
    {
        notice.Text = text;
        var clear = new System.Windows.Forms.Timer { Interval = 4000 };
        clear.Tick += (_, _) => { if (notice.Text == text) notice.Text = ""; clear.Stop(); clear.Dispose(); };
        clear.Start();
    }

    public void LoadHistory(JsonElement m)
    {
        if (Str(m, "q") != search.Text.Trim()) return;
        var list = new List<ConversationView.Turn>();
        if (m.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
            foreach (var it in items.EnumerateArray())
                list.Add(new ConversationView.Turn(Str(it, "ts"), Str(it, "who"), Str(it, "text"),
                    it.TryGetProperty("id", out var tid) && tid.TryGetInt32(out var tn) ? tn : 0));
        // Oldest first: a conversation is read downwards, and the Core returns newest first for the old table.
        list.Reverse();
        conversation.EmptyMessage = search.Text.Length > 0 ? "Nothing matches that." : "Nothing here yet.";
        conversation.SetTurns(list, atNewest: search.Text.Length == 0);   // search results start at the top
    }


    /// <summary>"2026-09-21 18:04:10" (UTC, as stored) as a Toronto time of day.</summary>
    static string Clock(string stamp)
    {
        if (!DateTime.TryParse(stamp, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var utc)) return "";
        try { return TimeZoneInfo.ConvertTimeFromUtc(utc, TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time")).ToString("HH:mm"); } catch { return utc.ToLocalTime().ToString("HH:mm"); }
    }

    static string Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
    static string Day(string stamp) => stamp.Length >= 10 ? stamp[..10] : stamp;

    DraftRow? Selected() => drafts.SelectedItems.Count == 1 && drafts.SelectedItems[0].Tag is string id ? rows.FirstOrDefault(r => r.Id == id) : null;

    void ShowDraft()
    {
        var d = Selected();
        sendBtn.Enabled = saveBtn.Enabled = discardBtn.Enabled = d is not null;
        if (d is null) { preview.Text = ""; sendBtn.Text = "Send"; return; }
        var extra = d.NewTo.Length > 0 ? $"\r\n\r\nYou have not written to {d.NewTo} through me before." + (d.Status == "confirm" ? " Send it anyway?" : " I will ask once more before it goes.") : "";
        preview.Text = $"To: {d.To}\r\nSubject: {d.Subject}\r\n\r\n{d.Body.Replace("\r", "").Replace("\n", "\r\n")}{extra}";
        sendBtn.Text = d.Status == "confirm" ? "Yes, send to the new address" : d.NewTo.Length > 0 ? "Send..." : "Send";
        sendBtn.Width = (int)((d.Status == "confirm" ? 250 : 120) * s);
    }

    void Act(string action)
    {
        var d = Selected(); if (d is null) return;
        _ = send(new { t = "mail.act", id = d.Id, hash = d.Hash, action });
    }

    // ------------------------------------------------------------------ dark controls

    enum Kind { Gold, Plum, Red }

    Button MakeButton(string text, Kind kind)
    {
        var b = new Button { Text = text, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Height = (int)(34 * s), Width = (int)((text.Length > 14 ? 170 : 120) * s), Font = Theme.Font(Theme.FaceBold, 14f), Margin = new Padding(0, 0, (int)(10 * s), 0) };
        b.FlatAppearance.BorderSize = 0;
        b.BackColor = kind switch { Kind.Gold => Theme.Gold, Kind.Plum => Theme.Plum, _ => Theme.Red };
        b.ForeColor = kind == Kind.Plum ? Theme.Text : Theme.Ink;
        return b;
    }

    Control Page(ListView list, Button button, Label hint)
    {
        hint.ForeColor = Theme.Secondary; hint.Dock = DockStyle.Bottom; hint.Height = (int)(30 * s); hint.Padding = new Padding((int)(14 * s), (int)(6 * s), 0, 0);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = (int)(52 * s), Padding = new Padding((int)(14 * s), (int)(8 * s), 0, 0), BackColor = Theme.Ink };
        bar.Controls.Add(button);
        var wrap = new Panel { Dock = DockStyle.Fill, Padding = new Padding((int)(14 * s), (int)(12 * s), (int)(14 * s), 0) };
        list.Dock = DockStyle.Fill; wrap.Controls.Add(list);
        var page = new Panel { Dock = DockStyle.Fill };
        page.Controls.Add(wrap); page.Controls.Add(bar); page.Controls.Add(hint);
        page.Controls.SetChildIndex(wrap, 0);
        return page;
    }

    ListView MakeList(params (string name, int width)[] cols)
    {
        var l = new ListView { View = View.Details, FullRowSelect = true, MultiSelect = false, HideSelection = false, OwnerDraw = true, BorderStyle = BorderStyle.None,
            BackColor = Theme.Panel2, ForeColor = Theme.Text, HeaderStyle = ColumnHeaderStyle.Nonclickable, Font = Theme.Font(Theme.Face, 14f) };
        foreach (var (name, width) in cols) l.Columns.Add(name, (int)(width * s));
        // The last column takes whatever width is left, so no bare header shows at the right (it drew white).
        l.Resize += (_, _) => { if (l.Columns.Count == 0) return; var used = 0; for (int i = 0; i < l.Columns.Count - 1; i++) used += l.Columns[i].Width; l.Columns[^1].Width = Math.Max(60, l.ClientSize.Width - used); };
        l.DrawColumnHeader += (_, e) =>
        {
            using var back = new SolidBrush(Theme.PlumDeep); e.Graphics.FillRectangle(back, e.Bounds);
            TextRenderer.DrawText(e.Graphics, e.Header?.Text ?? "", Theme.Font(Theme.FaceBold, 13.3f), Rectangle.Inflate(e.Bounds, -6, 0), Theme.Gold, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        };
        l.DrawItem += (_, _) => { };
        l.DrawSubItem += (_, e) =>
        {
            var sel = e.Item?.Selected == true;
            using var back = new SolidBrush(sel ? Theme.Plum : Theme.Panel2); e.Graphics.FillRectangle(back, e.Bounds);
            TextRenderer.DrawText(e.Graphics, e.SubItem?.Text ?? "", l.Font, Rectangle.Inflate(e.Bounds, -6, 0), sel ? Theme.Gold : Theme.Text, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        };
        return l;
    }
}
