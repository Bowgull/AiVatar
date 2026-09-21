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
    readonly Button[] tabs = new Button[4];
    readonly Control[] pages = new Control[4];
    int current;

    readonly ListView facts, trust, drafts;
    readonly TextBox activity = new(), preview = new();
    readonly Label draftsEmpty = new(), memoryHint = new(), trustHint = new();
    readonly Button forget, takeBack, sendBtn, saveBtn, discardBtn;
    List<DraftRow> rows = new();

    sealed record DraftRow(string Id, string Hash, string To, string Subject, string Body, string Status, string NewTo);

    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    public PanelWindow(Func<object, Task> send)
    {
        this.send = send;
        s = Math.Max(1f, DeviceDpi / 96f);
        Text = "Aang: Panel";
        AutoScaleMode = AutoScaleMode.None;
        BackColor = Theme.Ink; ForeColor = Theme.Text;
        Font = new Font(Theme.Face, 10f * (s > 1.4f ? 1f : 1f), FontStyle.Regular, GraphicsUnit.Point);
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size((int)(820 * s), (int)(560 * s));
        MinimumSize = new Size((int)(640 * s), (int)(420 * s));
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { /* the default icon */ }

        var names = new[] { "What I know", "What I may do", "What I did", "Drafts" };
        var strip = new Panel { Dock = DockStyle.Top, Height = (int)(48 * s), BackColor = Theme.Ink };
        for (int i = 0; i < 4; i++)
        {
            int at = i;
            var b = new Button { Text = names[i], FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, TabStop = false,
                Left = (int)((14 + i * 158) * s), Top = (int)(8 * s), Width = (int)(150 * s), Height = (int)(34 * s), Font = new Font(Theme.FaceBold, 10.5f, FontStyle.Regular, GraphicsUnit.Point) };
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
        var actPage = new Panel { Dock = DockStyle.Fill, Padding = new Padding((int)(14 * s)) }; actPage.Controls.Add(activity);
        pages[2] = actPage;

        // ---- drafts
        drafts = MakeList(("To", 230), ("Subject", 370), ("Status", 110));
        drafts.Dock = DockStyle.Top; drafts.Height = (int)(150 * s);
        preview.Multiline = true; preview.ReadOnly = true; preview.ScrollBars = ScrollBars.Vertical; preview.BorderStyle = BorderStyle.None;
        preview.BackColor = Theme.Panel2; preview.ForeColor = Theme.Text; preview.Font = new Font(Theme.Face, 10.5f, FontStyle.Regular, GraphicsUnit.Point); preview.Dock = DockStyle.Fill;
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
        for (int k = 0; k < 4; k++)
        {
            pages[k].Visible = k == i;
            tabs[k].BackColor = k == i ? Theme.Gold : Theme.Plum;
            tabs[k].ForeColor = k == i ? Theme.Ink : Theme.Text;
        }
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
        var again = keep is null ? -1 : rows.FindIndex(r => r.To == keep);
        if (rows.Count > 0) drafts.Items[Math.Max(0, again)].Selected = true;
        ShowDraft();
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
        var b = new Button { Text = text, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Height = (int)(34 * s), Width = (int)((text.Length > 14 ? 170 : 120) * s), Font = new Font(Theme.FaceBold, 10.5f, FontStyle.Regular, GraphicsUnit.Point), Margin = new Padding(0, 0, (int)(10 * s), 0) };
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
            BackColor = Theme.Panel2, ForeColor = Theme.Text, HeaderStyle = ColumnHeaderStyle.Nonclickable, Font = new Font(Theme.Face, 10.5f, FontStyle.Regular, GraphicsUnit.Point) };
        foreach (var (name, width) in cols) l.Columns.Add(name, (int)(width * s));
        l.DrawColumnHeader += (_, e) =>
        {
            using var back = new SolidBrush(Theme.PlumDeep); e.Graphics.FillRectangle(back, e.Bounds);
            TextRenderer.DrawText(e.Graphics, e.Header?.Text ?? "", new Font(Theme.FaceBold, 10f, FontStyle.Regular, GraphicsUnit.Point), Rectangle.Inflate(e.Bounds, -6, 0), Theme.Gold, TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
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
