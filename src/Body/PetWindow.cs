using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// The always-on pet window: a per-pixel-alpha layered window that draws pre-rendered sprite frames and
/// the speech bubble on the CPU. It never takes focus, passes clicks through transparent pixels (Windows
/// does that itself), goes quiet while WoW has focus, and keeps working when the Core is not running.
/// </summary>
sealed class PetWindow : Form
{
    // Extra: room above the old window so a bubble can grow. The conversation reaches ScrollbackMaxH (530)
    // - Bottom = 406, so 430 leaves a little over. For one reply a full one reaches
    // ExpandedMaxH (300) - Bottom = 176, and the "what you asked" line can add 18 more, so 208 leaves a
    // little over. It was 168, sized from a comment that still said 276 after LineH changed 21 -> 23, which
    // cut the top border off every fully expanded bubble (2026-10-02).
    // (124) = 152 above the old top; the copy/rate buttons stand another ~10 above that edge. 168 covers both.
    // W includes a left margin (Docking.Margin) where a long reply's bubble widens into; it is transparent and click-through.
    public const int W = 470 + Docking.Margin, H = 310, Extra = 430;
    const int Margin = Docking.Margin;
    const int HotkeyId = 0xA46, EscId = 0xA47, HotkeyPadId = 0xA48;
    static readonly TimeSpan WakeFor = TimeSpan.FromSeconds(4);

    readonly Config cfg = Config.Load();
    // Not readonly: all three are recomputed when Windows' display scaling changes (OnDpiChanged).
    float scale;
    int pw, ph;
    /// <summary>Not readonly: it is sized in real pixels, so a change to display scaling replaces it.</summary>
    LayeredSurface surface;
    readonly SpriteBank sprites;
    readonly Anim anim = new();
    readonly BubbleView bubble = new();
    readonly CoreLink link = new(new Uri("ws://127.0.0.1:47831/body"));
    readonly System.Windows.Forms.Timer timer = new() { Interval = 50 };
    readonly System.Windows.Forms.Timer fgTimer = new() { Interval = 500 };
    readonly NotifyIcon tray = new();
    CoreSupervisor? supervisor;
    bool noCore;
    ToolStripMenuItem coreItem = null!, autostartItem = null!;
    ToolStripMenuItem quietItem = null!, showItem = null!, modelItems = null!, muteItem = null!, seeWindowItem = null!;

    string? heldText;               // latest proactive message waiting for quiet mode to end
    string? heldJobCwd;             // the held message's job, if it has one - clicking the marker opens its Panel tab
    bool urgent;                    // Avatar State: something is glowing/waved, not just marked
    Color urgentColor = Theme.AvatarGlow;       // which tier is glowing: white-blue = blocking, terracotta = a job done
    Color badgeColor = Theme.Gold;              // the dot keeps its tier after the glow settles, so a glance still tells them apart
    int heldRank;                               // 3 needs him, 2 done, 1 ordinary news: the dot shows the most pressing one
    DateTime urgentUntil = DateTime.MinValue;   // when the current burst's loom/pulse ends (the ambient glow does not)
    static readonly TimeSpan UrgentGlowFor = TimeSpan.FromSeconds(4);
    /// <summary>He missed a real one in WoW (2026-09-22) and asked not to lose the glow until he acts, and asked
    /// it be re-examined. Research (peripheral vision, motion-onset capture, habituation - see chat) found the
    /// real cause: a 14x32px icon is far below what is resolvable ~27deg into the periphery, and smooth continuous
    /// motion is the one pattern proven NOT to capture attention and to habituate fastest. Fix: keep a quiet
    /// ambient glow alive for as long as something is unread (his ask), but do the actual attention-getting with a
    /// few abrupt, bigger bursts on a backoff, then stop bursting - never stop the ambient glow.</summary>
    static readonly TimeSpan[] BurstBackoff = { TimeSpan.Zero, TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(45), TimeSpan.FromSeconds(90) };
    int burstsFired;
    DateTime nextBurstAt = DateTime.MaxValue;
    DateTime burstStart = DateTime.MinValue;    // when the current burst's loom/flicker began
    bool ambientGlow;                           // ...urgent settled but still unread: a slow, quiet pulse, never fully gone
    /// <summary>A Claude Code session he is following (a job hunt, a self-change, anything start_claude opened)
    /// is currently working or waiting on him, right now - continuous, from the Core, not an event he was told
    /// about once. Joshua, 2026-09-23: asked for a job search, could not tell it was doing anything; then, on
    /// seeing the news dot alone, asked for the arrow and eyes too. Reuses the two glows that already exist
    /// rather than inventing a third: DrawThinkGlow (eyes + arrow tattoo) while standing, the same quiet ambient
    /// outline as "something waits" while docked/peeking - both already Theme.AvatarGlow, so nothing about what
    /// the colour means changes, it is just no longer only a settled-burst state.</summary>
    bool claudeWorking;
    string workingWhat = "";                    // "job hunt": what to say if he clicks the icon
    string? workingHost;                        // "mac" when it is running on the MacBook

    /// <summary>Back to rest. While a Claude session is working that means THINKING, not standing idle: the
    /// think animation is what says he is busy (and carries the arrow/eyes glow with it). Everywhere that used
    /// to drop straight to idle goes through here, or the working state would be wiped by the next reply
    /// ending, bubble closing or one-shot finishing.</summary>
    void PlayRest() => anim.Play(claudeWorking ? "think" : "idle");
    string? bubbleFocus;            // the window a click on the bubble brings forward (a Claude session), if any
    string foreground = "";
    string foregroundTitle = "";
    /// <summary>The handle of the window he is in, for the Core to read what is in it. Never one of Aang's own.</summary>
    long foregroundHwnd;
    string sentWindow = "";
    DateTime windowSentAt = DateTime.MinValue;
    bool dirty = true, quiet, autoQuiet, dragging, moved, hotkeyOk, bubbleWasVisible, wasAnimating = true;
    bool? forcedQuiet;
    DateTime wakeUntil = DateTime.MinValue;
    Point dragStart, startLoc;
    int tick;

    /// <summary>Not readonly: a change to Windows' display scaling rebuilds it, because the box bakes the
    /// scale in when it is constructed. See MakeInput and OnDpiChanged.</summary>
    InputWindow input;
    /// <summary>True when --dpi= forced a scale for testing, so a real DPI change must not overwrite it.</summary>
    bool dpiForced;
    float dpiChangeTo;   // tests: --dpi-change=N rescales to N% a few seconds after start
    int quitAfter;       // tests: --quit-after=N quits the way the tray menu does, N seconds in
    readonly InputHistory history = new(Paths.File("input-history.json"));
    readonly System.Windows.Forms.Timer ackTimer = new() { Interval = 4000 };
    readonly System.Windows.Forms.Timer awayTimer = new() { Interval = 30 };
    string? currentId;
    bool working, acked, escRegistered, thumbDrag, mouseWasDown;
    /// <summary>
    /// Joshua hid him, so he stays hidden until Joshua asks for him back. Clippy's real failure was not the
    /// art, it was coming back by itself after being dismissed, and OpenAI's pet has the same bug open today.
    /// Nothing below may call Show() while this is set.
    /// </summary>
    bool hiddenByUser;
    /// <summary>Test flag (--set-hotkey): open the key chooser as soon as the window is up.</summary>
    bool openHotkeyBox;
    /// <summary>Test flag (--panel): open the Panel as soon as the window is up.</summary>
    bool openPanel;
    /// <summary>Test flag (--urgent-test / --urgent-test=badge|glow|wave): trigger a notification state as soon as
    /// the window is up, with no Core round trip.</summary>
    string? urgentTest;
    /// <summary>Test flag (--bubble-test / --bubble-test=long): show a fixed reply in the bubble as soon as the
    /// window is up, with no Core round trip - for checking a bubble redesign against real GDI+ output.</summary>
    string? bubbleTest;
    bool pinsTest;   // tests: show the type box with a reply and two pins attached, so the chips can be looked at
    bool stackTest;  // tests: fill the bubble with a conversation and open the scrollback
    bool factTest;   // tests: the fact-approval question
    int panelTab;
    PanelWindow? panel;
    int idCounter;

    // model chip + quota + consent
    string mode = "auto";
    bool saving, hasQuota;
    double weekUse, fiveUse, weekResetsAt, fiveResetsAt;      // resets are unix seconds, 0 when unknown
    string level = "ok";
    string? lastText, consentText, replyId, permissionId;
    int? factId;   // a fact from one of his documents, waiting on yes or no
    bool backupAsk;  // the vault backup offer is on screen
    string consentWanted = "", pendingMode = "smart";

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= Win32.WS_EX_LAYERED | Win32.WS_EX_TOPMOST | Win32.WS_EX_TOOLWINDOW | Win32.WS_EX_NOACTIVATE;
            return cp;
        }
    }
    protected override bool ShowWithoutActivation => true;

    public PetWindow(string[] args)
    {
        scale = DeviceDpi / 96f;
        // Test flag: --dpi=150 draws at 150% on any desktop, so every scale can be looked at without changing Windows.
        foreach (var a in args) if (a.StartsWith("--dpi=", StringComparison.OrdinalIgnoreCase) && int.TryParse(a[6..], out var d) && d is >= 96 and <= 400) { scale = d / 96f; dpiForced = true; }
        pw = (int)Math.Round(W * scale);
        ph = (int)Math.Round((H + Extra) * scale);

        Text = "Aang Body";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        AutoScaleMode = AutoScaleMode.None;
        Size = new Size(pw, ph);
        // The window grew taller by Extra so a bubble can expand upward. Keep the sprite where it was by moving
        // the saved top edge up by the same amount, once.
        if (cfg.LayoutVersion < 2)
        {
            if (cfg.Y is int oldY) cfg.Y = oldY - (int)Math.Round(110 * scale);
            cfg.LayoutVersion = 2; cfg.Save();
        }
        if (cfg.LayoutVersion < 3) { cfg.Hotkey = "Ctrl+NumLock"; cfg.LayoutVersion = 3; cfg.Save(); }
        // Version 4 (Clean Gold): the window grew taller again, 110 to 160, for the roomier bubble. Same trick: the saved
        // top edge moves up by what was added, once, so the sprite, which stands at the bottom, does not move.
        if (cfg.LayoutVersion < 4)
        {
            if (cfg.Y is int oldY4) cfg.Y = oldY4 - (int)Math.Round((Extra - 110) * scale);
            cfg.LayoutVersion = 4; cfg.Save();
        }
        if (cfg.LayoutVersion < 5) { cfg.Hotkey = "Ctrl+Plus"; cfg.LayoutVersion = 5; cfg.Save(); }
        // Version 6: the window grew on the left for the wide bubble; the saved left edge moves by the same so he does not.
        if (cfg.LayoutVersion < 6) { if (cfg.X is int oldX6) cfg.X = oldX6 - (int)Math.Round(Margin * scale); cfg.LayoutVersion = 6; cfg.Save(); }   // Joshua, 2026-09-21: Ctrl and +
        // Extra grew 168 -> 208 to stop a full bubble losing its top border. The window grows upward, so move
        // the saved position up by the same amount or Aang would jump 40px down the screen on this one start.
        // Same correction LayoutVersion 4 made the last time this changed.
        if (cfg.LayoutVersion < 7) { if (cfg.Y is int oldY7) cfg.Y = oldY7 - (int)Math.Round((208 - 168) * scale); cfg.LayoutVersion = 7; cfg.Save(); }
        // The conversation needs a far bigger bubble than one reply does: Margin 160 -> 300 and Extra
        // 208 -> 430. The window grows left and up, so the saved position moves by the same amounts or Aang
        // would walk down and right across the screen on this one start. Transparent pixels in a layered
        // window are click-through, so a bigger window does not take any more clicks off the game.
        if (cfg.LayoutVersion < 8)
        {
            if (cfg.X is int oldX8) cfg.X = oldX8 - (int)Math.Round((300 - 160) * scale);
            if (cfg.Y is int oldY8) cfg.Y = oldY8 - (int)Math.Round((430 - 208) * scale);
            cfg.LayoutVersion = 8; cfg.Save();
        }
        Location = cfg is { X: not null, Y: not null } ? Clamp(new Point(cfg.X.Value, cfg.Y.Value)) : DefaultPos();

        // Test/diagnostic flag: --quiet=never or --quiet=always overrides the WoW-focus detection.
        foreach (var a in args)
        {
            if (a.Equals("--quiet=never", StringComparison.OrdinalIgnoreCase)) forcedQuiet = false;
            else if (a.Equals("--quiet=always", StringComparison.OrdinalIgnoreCase)) forcedQuiet = true;
            else if (a.Equals("--no-core", StringComparison.OrdinalIgnoreCase)) noCore = true;   // tests: do not start the Core or touch autostart
            else if (a.Equals("--set-hotkey", StringComparison.OrdinalIgnoreCase)) openHotkeyBox = true;  // tests: open the key chooser at start
            else if (a.StartsWith("--panel", StringComparison.OrdinalIgnoreCase)) { openPanel = true; if (a.Length > 8 && int.TryParse(a[8..], out var pt)) panelTab = Math.Clamp(pt, 0, 5); }   // tests: open the Panel at start, on a tab
            else if (a.Equals("--urgent-test", StringComparison.OrdinalIgnoreCase)) urgentTest = "glow";      // tests: Tier 2, docked - use with --dock=bottom
            else if (a.Equals("--urgent-test=glow", StringComparison.OrdinalIgnoreCase)) urgentTest = "glow"; // same, explicit
            else if (a.Equals("--urgent-test=wave", StringComparison.OrdinalIgnoreCase)) urgentTest = "wave"; // Tier 2, standing - do NOT pass --dock
            else if (a.Equals("--urgent-test=badge", StringComparison.OrdinalIgnoreCase)) urgentTest = "badge"; // Tier 1, docked - use with --dock=bottom
            else if (a.Equals("--urgent-test=done", StringComparison.OrdinalIgnoreCase)) urgentTest = "done";   // Tier 3, docked, terracotta, no sound - use with --dock=bottom
            else if (a.Equals("--pins-test", StringComparison.OrdinalIgnoreCase)) pinsTest = true;   // tests: the reply and pinned-context chips
            else if (a.Equals("--fact-test", StringComparison.OrdinalIgnoreCase)) factTest = true;   // tests: a fact from a document, offered for approval
            else if (a.Equals("--stack-test", StringComparison.OrdinalIgnoreCase)) stackTest = true;  // tests: the desktop scrollback
            else if (a.StartsWith("--dpi-change=", StringComparison.OrdinalIgnoreCase) && int.TryParse(a[13..], out var dc) && dc is >= 96 and <= 400) dpiChangeTo = dc / 96f;   // tests: rescale while running
            else if (a.StartsWith("--quit-after=", StringComparison.OrdinalIgnoreCase) && int.TryParse(a[13..], out var qa) && qa is > 0 and <= 120) quitAfter = qa;   // tests: the real quit path
            else if (a.Equals("--bubble-test", StringComparison.OrdinalIgnoreCase)) bubbleTest = "short";
            else if (a.Equals("--bubble-test=long", StringComparison.OrdinalIgnoreCase)) bubbleTest = "long";
            else if (a.Equals("--bubble-test=ask", StringComparison.OrdinalIgnoreCase)) bubbleTest = "ask";
            else if (a.Equals("--bubble-test=consent", StringComparison.OrdinalIgnoreCase)) bubbleTest = "consent";
            else if (a.Equals("--bubble-test=consent-long", StringComparison.OrdinalIgnoreCase)) bubbleTest = "consent-long";
            else if (a.Equals("--bubble-test=always-long", StringComparison.OrdinalIgnoreCase)) bubbleTest = "always-long";   // tests: a button label wider than the bubble
            else if (a.Equals("--bubble-test=think", StringComparison.OrdinalIgnoreCase)) bubbleTest = "think";
            else if (a.Equals("--bubble-test=input", StringComparison.OrdinalIgnoreCase)) bubbleTest = "input";
            else if (a.Equals("--done-icon=q", StringComparison.OrdinalIgnoreCase)) doneIcon = "q";             // preview: WoW's turn-in "?" for done
            else if (a.Equals("--icons-gold", StringComparison.OrdinalIgnoreCase)) iconsGold = true;            // preview: every icon in Aang's gold, as WoW's are
        }

        sprites = new SpriteBank(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "frames"));
        if (!sprites.HasAssets) throw new FileNotFoundException("Sprite frames are missing next to the executable.");
        surface = new LayeredSurface(pw, ph);

        // Docking: find the sprite's visible pixels once, and start docked if he was left at an edge.
        try { art = Docking.ArtBox(sprites.Frame("idle", 0)); } catch (Exception e) { Log.Write("art box failed: " + e.Message); }
        foreach (var a in args) if (a.StartsWith("--dock=", StringComparison.OrdinalIgnoreCase)) cfg.DockEdge = a[7..];      // test flag
        dock = Docking.Parse(cfg.DockEdge);
        if (dock != DockEdge.None) { dockFrac = Math.Clamp(cfg.DockFrac, 0.04, 0.96); peeking = true; Location = PeekPos(); LogArt("start"); }

        link.Message += m => { if (IsHandleCreated) BeginInvoke(() => OnCore(m)); };
        timer.Tick += (_, _) => Tick();
        fgTimer.Tick += (_, _) => PollForeground();
        ackTimer.Tick += (_, _) => AckTimeout();
        awayTimer.Tick += (_, _) => WatchForClickAway();

        mode = ModelChip.Normalize(cfg.Mode); saving = cfg.Saving;
        MakeInput();
        link.ConnectionChanged += up =>
        {
            if (!up) return;
            if (saving) _ = link.SendAsync(new { t = "saving", on = true });
            _ = link.SendAsync(new { t = "mute", on = cfg.Muted });
            sentWindow = ""; sentDesk = null;                                      // resend after a reconnect
            _ = link.SendAsync(new { t = "presence", quiet, foreground, title = foregroundTitle, watching = cfg.SeeActiveWindow, hwnd = foregroundHwnd });
        };
        PushStatus();
        BuildTray();
    }

    /// <summary>
    /// Windows' display scaling changed while Aang was running.
    /// </summary>
    /// <remarks>
    /// Every surface here reads the scale ONCE, when it is built: the pet's own bitmap, the type box, the
    /// Panel. Nothing recomputed it, so moving a laptop to a 150% monitor, or changing scaling in Settings,
    /// left him drawn at the old size until the next restart - sharp but wrong, or soft and wrong, with no
    /// hint why.
    ///
    /// The Panel is simply disposed: it is already built lazily, so the next opening builds it correctly for
    /// free. The type box has to be rebuilt because it is held, and MakeInput exists so that rebuild carries
    /// every handler with it.
    ///
    /// A scale forced by --dpi= is left alone. That flag exists to look at any size on this desktop, and a
    /// real DPI event overwriting it would quietly undo the thing being tested.
    /// </remarks>
    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        if (dpiForced) return;                 // a forced test scale is not overwritten by a real event
        Rescale(e.DeviceDpiNew / 96f);
    }

    /// <summary>Rebuild everything at a new scale. Separate from OnDpiChanged so a test can drive it without
    /// changing Windows' display settings for the whole desktop.</summary>
    internal void Rescale(float next)
    {
        if (Math.Abs(next - scale) < 0.01f) return;
        Log.Write($"display scaling changed: {scale:0.00} -> {next:0.00}");
        var was = scale;
        scale = next;
        pw = (int)Math.Round(W * scale);
        ph = (int)Math.Round((H + Extra) * scale);

        var old = surface;
        surface = new LayeredSurface(pw, ph);
        old.Dispose();
        Size = new Size(pw, ph);

        // Keep the SPRITE where it was, not the window corner. The window grows down and to the right from
        // its top-left, and the sprite sits a long way into it, so a plain resize slides him across the
        // screen and at 150% pushed him mostly off the right-hand edge (seen in a capture, 2026-10-02).
        // Clamp() does not catch that: it only asks whether the window touches a screen at all, and a window
        // four fifths off the edge still does.
        var drift = Docking.SpriteX * (was - scale);
        var moved = new Point(Location.X + (int)Math.Round(drift), Location.Y + (int)Math.Round(Docking.SpriteY * (was - scale)));
        var work = Screen.FromPoint(Location).WorkingArea;
        Location = new Point(
            Math.Clamp(moved.X, work.Left - (int)(Docking.SpriteX * scale), work.Right - (int)(Docking.SpriteX * scale) - 80),
            Math.Clamp(moved.Y, work.Top - (int)(Docking.SpriteY * scale), work.Bottom - (int)(Docking.SpriteY * scale) - 80));

        // Rebuilt rather than rescaled: both bake the scale in at construction.
        var wasOpen = input.Visible;
        var draft = input.Draft;
        input.Dispose();
        MakeInput();
        PushStatus();
        if (wasOpen) { input.Open(Location, IntPtr.Zero); input.SetDraft(draft); }

        if (panel is { IsDisposed: false }) { panel.Dispose(); panel = null; }

        dirty = true;
        Render();
        Log.Write($"rescaled to {scale:0.00}: window {Location} {pw}x{ph}, sprite at "
            + $"{Location.X + (int)(Docking.SpriteX * scale)},{Location.Y + (int)(Docking.SpriteY * scale)} "
            + $"(screen {Screen.FromPoint(Location).WorkingArea})");
    }

    /// <summary>
    /// Build the type box and wire it up.
    /// </summary>
    /// <remarks>
    /// Its own method because the box bakes in the display scale at construction, so changing Windows'
    /// scaling while Aang is running means building a new one. Every handler lives here, so a rebuilt box
    /// is wired exactly like the first - the alternative is nine subscriptions to remember by hand, which
    /// is a bug waiting for the first person who adds a tenth.
    /// </remarks>
    void MakeInput()
    {
        input = new InputWindow(scale, history);
        input.Submitted += Submit;
        input.StopRequested += StopReply;
        input.ModeChosen += m => SetMode(m == "next" ? ModelChip.Next(mode) : m);
        input.SavingToggled += () => SetSaving(!saving);
        input.SetUsageShown(cfg.ShowUsage);
        input.UsageShownChanged += on => { cfg.ShowUsage = on; cfg.Save(); };
        input.ConsentAccepted += AllowOnce;
        input.ConsentDeclined += DeclineConsent;
        input.PageRequested += d => { if (d > 0 && bubble.More) ExpandBubble(); else if (bubble.Scroll(d * 6)) dirty = true; FillStackFromMemory(); };
    }

    Point DefaultPos()
    {
        var wa = Screen.PrimaryScreen!.WorkingArea;
        return new Point(wa.Right - pw - 12, wa.Bottom - ph);
    }

    Point Clamp(Point p)
    {
        var r = new Rectangle(p, new Size(pw, ph));
        foreach (var s in Screen.AllScreens) if (s.WorkingArea.IntersectsWith(r)) return p;
        return DefaultPos();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        Render();
        timer.Start(); fgTimer.Start(); PollForeground(); ApplyQuiet();
        wowTimer.Tick += (_, _) => _ = Task.Run(() => { try { wowRunning = System.Diagnostics.Process.GetProcesses().Any(p => { using (p) return p.ProcessName.StartsWith("Wow", StringComparison.OrdinalIgnoreCase); }); } catch { } });
        wowTimer.Start();
        link.Start();
        if (!noCore)
        {
            if (!cfg.AutostartAsked) { Autostart.Set(true); cfg.AutostartAsked = true; cfg.Save(); }   // first run: start with Windows
            else Autostart.Migrate();
            supervisor = new CoreSupervisor(47831, cfg.CoreDir, cfg.NodePath);
            supervisor.StatusChanged += st => { if (IsHandleCreated) BeginInvoke(() => coreItem.Text = "Core: " + st); };
            // A crash loop used to be invisible: the pet looked perfectly normal while nothing behind it
            // worked. The supervisor now stops after a burst rather than retrying forever, and when it
            // does, Aang says so himself. The tray menu alone is not enough - nobody opens it to check
            // whether their desktop pet is secretly dead.
            supervisor.GaveUp += msg =>
            {
                if (!IsHandleCreated) return;
                BeginInvoke(() => { Wake(); ShowBubble(msg, false); dirty = true; });
            };
            supervisor.Start();
        }
        hotkeyOk = RegisterHotkey();
        UpdateTrayText();
        anim.Play("hello");
        Log.Write($"shown at {Location} {pw}x{ph} scale {scale:0.00}");
        if (openHotkeyBox) BeginInvoke(AskForHotkey);
        if (openPanel) BeginInvoke(OpenPanel);
        if (quitAfter > 0)
        {
            // Exactly what the tray's "Quit Aang" does, which is the real way this happens. taskkill without
            // /F never reaches this window at all - it is a no-activate tool window - so it could not test
            // the close path (2026-10-03).
            var q = new System.Windows.Forms.Timer { Interval = quitAfter * 1000 };
            q.Tick += (_, _) => { q.Stop(); q.Dispose(); tray.Visible = false; Application.Exit(); };
            q.Start();
        }
        if (dpiChangeTo > 0)
        {
            // Drives the real rescale path a few seconds in, so the thing that runs when Windows' scaling
            // changes is actually exercised rather than assumed.
            var t = new System.Windows.Forms.Timer { Interval = 4000 };
            t.Tick += (_, _) => { t.Stop(); t.Dispose(); Rescale(dpiChangeTo); };
            t.Start();
        }
        if (urgentTest != null) BeginInvoke(() =>
        {
            if (urgentTest == "badge") Hold("Job hunt done. Two applied.", "C:\\test", 1, Theme.Gold);
            else if (urgentTest == "done") { Hold("Job hunt done. Two applied.", "C:\\test", 2, Theme.Claude, "Claude"); TriggerDone(); }
            else { Hold("Need input in Claude on the test job: which one?", "C:\\test", 3, Theme.AvatarGlow, "Claude"); TriggerUrgent(); }
        });
        if (factTest) BeginInvoke(() =>
        {
            Wake();
            var m = System.Text.Json.JsonDocument.Parse(
                "{\"id\":42,\"text\":\"Joshua's current role is Account Manager at PayMyTuition since January 2026.\","
                + "\"fromDoc\":\"profile.md\",\"left\":7}").RootElement;
            OnFactAsk(m);
            dirty = true;
        });
        if (stackTest) BeginInvoke(() =>
        {
            Wake();
            // Shaped like his real history: short pings, one long reply, one with a path in it. His 207 real
            // messages average 28 characters, so a view that only looks right with paragraphs looks wrong daily.
            // Spread over three days, so the date dividers have something to divide.
            bubble.ReachedTheStart = true;
            var d2 = DateTime.Now.AddDays(-2); var d1 = DateTime.Now.AddDays(-1); var now = DateTime.Now;
            bubble.RememberAt(801, "morning", true, d2);
            bubble.RememberAt(802, "Morning. Nothing waiting on you yet.", false, d2);
            bubble.RememberAt(803, "whats my status with octup", true, d1);
            bubble.RememberAt(804, "Octup is the only one past first round. You interviewed on the 30th and are waiting on the outcome.", false, d1);
            bubble.RememberAt(805, "how many applications are still open", true, now);
            bubble.RememberAt(806, "Twenty are still waiting on a reply. Three follow-ups were due today: Deliverect, GreenShield and Litmus.", false, now);
            ShowBubble("Twenty are still waiting on a reply. Three follow-ups were due today: Deliverect, GreenShield and Litmus.", false);
            bubble.EnterScrollback();
            dirty = true;
        });
        if (pinsTest) BeginInvoke(() =>
        {
            Wake();
            input.ReplyTo(812, "Twenty are still waiting on a reply. Three follow-ups were due today: Deliverect, GreenShield and Litmus.");
            input.Pin(806, @"can you read G:\My Drive\Job Search 2026\applications.md and tell me how many are still open");
            input.Pin(799, "Octup is the only one past first round.");
            input.Open(Location, IntPtr.Zero);
        });
        if (bubbleTest != null) BeginInvoke(() =>
        {
            if (bubbleTest == "think")
            {
                Wake(); bubble.ShowDots("checking your calendar"); anim.Play("think"); dirty = true;
                return;
            }
            if (bubbleTest == "input")
            {
                hasQuota = true; weekUse = 0.34; fiveUse = 0.12; level = "ok";
                weekResetsAt = DateTimeOffset.UtcNow.AddDays(5).ToUnixTimeSeconds(); fiveResetsAt = DateTimeOffset.UtcNow.AddHours(2).ToUnixTimeSeconds();
                PushStatus();
                OpenInput(userAsked: true);
                return;
            }
            if (bubbleTest is "consent" or "consent-long")
            {
                var longVerb = bubbleTest == "consent-long";
                bubble.Show(longVerb ? "Can I start Claude on the job hunt?" : "Can I open Chrome?", false, 120000);
                bubble.VerbLabel = longVerb ? "Start Claude on the job hunt" : "Open Chrome";
                bubble.AlwaysLabel = longVerb ? "Always start Claude sessions for you" : "Always allow apps";
                bubble.Asking = true; Wake(); dirty = true;
                return;
            }
            if (bubbleTest == "always-long")
            {
                // Deliberately absurd, to prove the clamp rather than the current wording. The real label
                // was shortened at source, but nothing stops a future one being long again.
                OnPermission("test", "write to .../Documents/TikTok_Cogni_Transcript.txt",
                    "write and change files on this computer including anything in Documents, keeping the old version so it can always be undone");
                return;
            }
            var ask = bubbleTest == "ask" ? "whats on my screen right now" : "whats up";
            var reply = bubbleTest == "long"
                ? "The page is a kettle descaling guide. Fill the kettle halfway with equal parts white vinegar and water, boil it, and leave it for 45 minutes. Then rinse it three times so your tea doesn't taste of vinegar."
                : "Paint's open.";
            bubble.Asked = ask; ShowBubble(reply, false); bubble.Tools = true; bubble.Hover = true; Wake(); dirty = true;
        });
    }

    /// <summary>The Panel: made once, then hidden and shown. Every time it is shown it asks the Core for a fresh copy.</summary>
    void OpenPanel()
    {
        if (panel is null || panel.IsDisposed)
        {
            panel = new PanelWindow(payload => link.SendAsync(payload))
            {
                GetSetting = key => key switch
                {
                    "quietGame" => forcedQuiet != false, "mute" => cfg.Muted, "seeWindow" => cfg.SeeActiveWindow,
                    "usage" => cfg.ShowUsage, "autostart" => Autostart.IsOn(), _ => false,
                },
                SetSetting = (key, on) =>
                {
                    switch (key)
                    {
                        case "quietGame": forcedQuiet = on ? null : false; ApplyQuiet(); break;
                        case "mute": SetMuted(on); break;
                        case "seeWindow":
                            cfg.SeeActiveWindow = on; cfg.Save(); seeWindowItem.Checked = on;
                            sentWindow = ""; windowSentAt = DateTime.MinValue; PollForeground();
                            break;
                        case "usage": cfg.ShowUsage = on; cfg.Save(); input.SetUsageShown(on); break;
                        case "autostart": Autostart.Set(on); break;
                    }
                },
                RunAction = what => { if (what == "hotkey") AskForHotkey(); else if (what == "undock") Undock(moveToStand: true); else if (what == "claude") Hands.Arrange("Claude", "front"); },
            };
            // Right-clicking a message in the Panel's scrollback puts it on the type box, where he can see
            // what is attached before he sends anything.
            panel.PointAt = (what, id, text) =>
            {
                if (what == "pin") { input.Pin(id, text); return; }      // the Panel stays up so he can pin another
                input.ReplyTo(id, text);
                Wake();
                input.Open(Location, Win32.GetForegroundWindow());
            };
        }
        panel.Show(); panel.WindowState = FormWindowState.Normal; Win32.ForceForeground(panel.Handle); panel.Activate();   // Windows otherwise leaves it behind the window in front
        if (panelTab > 0) { panel.Select(panelTab); panelTab = 0; }
        panel.Refresh();
    }

    // ------------------------------------------------------------------ Core messages

    void OnCore(JsonElement m)
    {
        try
        {
            if (!m.TryGetProperty("t", out var tp)) return;
            switch (tp.GetString())
            {
                case "state":
                    Wake();
                    anim.Play(Str(m, "state") ?? "idle"); dirty = true;
                    break;
                case "bubble":
                {
                    var text = Str(m, "text") ?? "";
                    var proactive = Bool(m, "proactive");
                    var blocking = Bool(m, "blocking");
                    var done = Bool(m, "done");
                    var jobCwd = Str(m, "jobCwd");
                    // Muted always wins - nothing unprompted at all, glow included. Hidden normally wins too; a
                    // truly blocking message is the one exception he asked for (2026-09-22): let it through
                    // quietly, as a glow, rather than lose it - never by popping the box open on its own (that
                    // was Clippy's real bug). A finished job is not urgent enough to earn either exception.
                    if (proactive && cfg.Muted && !blocking) break;
                    if (proactive && hiddenByUser && !blocking) break;
                    if (proactive && hiddenByUser && blocking) { hiddenByUser = false; Show(); }
                    // Tucked at the edge or standing while the game has focus: ordinary news waits as a silent
                    // marker on him (the Stardew "mailbox flag" - Tier 1); a finished job glows terracotta with
                    // no sound (Tier 3, quieter than urgent); only something truly blocking gets the full Avatar
                    // State treatment (Tier 2) - none of them ever pop him fully out over your play.
                    var focus = Str(m, "focus"); var host = Str(m, "host");
                    if (proactive && quiet && blocking) { if (Hold(text, jobCwd, 3, Theme.AvatarGlow, focus, host)) TriggerUrgent(); break; }
                    if (proactive && quiet && done) { if (Hold(text, jobCwd, 2, Theme.Claude, focus, host)) TriggerDone(); break; }
                    if (proactive && quiet) { Hold(text, jobCwd, 1, Theme.Gold, focus, host); break; }
                    if (peeking) Reveal(greet: false);
                    Wake();
                    ExitExpanded(collapse: false);
                    bubble.Asked = proactive ? "" : (lastText ?? "");
                    ShowBubble(text, Bool(m, "stream"));
                    // Only ever present on the reply's own final message, never a streamed delta (core.ts
                    // attaches it once, at result time) - so this only needs checking here, not per delta.
                    if (!Bool(m, "stream")) bubble.Rows = ParseRows(m);
                    bubbleFocus = Str(m, "focus");
                    bubble.Link = bubbleFocus != null ? Str(m, "link") ?? "" : "";
                    if (!Bool(m, "stream") && !proactive && Str(m, "id") is { Length: > 0 } rid) { replyId = rid; bubble.Tools = true; bubble.Rating = 0; }
                    if (!Bool(m, "stream")) { working = false; input.Working = false; ackTimer.Stop(); }
                    // Keep the finished reply so he can scroll back to it. Only the finished one: a streamed
                    // delta is the same reply arriving again, not another thing said. A proactive message
                    // carries its own row, because it was stored on its way out.
                    if (!Bool(m, "stream"))
                        bubble.Remember(m.TryGetProperty("turn", out var tr) && tr.TryGetInt32(out var trn) ? trn : 0, text, false);
                    // 4.4: something is genuinely STUCK, and he is at his desk rather than in a game.
                    //
                    // The three persistent markers above are all gated on `quiet`, which only means a game has
                    // focus. Away from a game a blocking message showed a bubble that faded after twenty
                    // seconds and left nothing behind, so stepping out of the room lost it entirely. A session
                    // waiting on him is the one state where something really is stopped, and it should still
                    // be saying so when he comes back.
                    //
                    // Marker only, no burst and no sound: he is sitting here and has just seen the bubble.
                    // The loud version is for when a game has his attention. This is the quiet pulse the
                    // ambient glow was written for, which until now could only be reached by a burst expiring.
                    if (proactive && blocking && !quiet && Hold(text, jobCwd, 3, Theme.AvatarGlow, focus, host))
                    {
                        ambientGlow = true;
                        Log.Write("stuck: marker left for a blocked session (at desk, no burst)");
                        dirty = true;
                    }
                    permissionId = null;
                    break;
                }
                case "bubble.dots":
                    Wake(); bubble.ShowDots(); anim.Play("think"); dirty = true;
                    break;
                case "bubble.clear":
                    ExitExpanded(collapse: false);
                    bubble.Clear(); dirty = true;
                    break;
                case "turn.saved":
                    // The exchange is now two rows. Until this arrives the Body has only the submit id, which
                    // names the request and not the stored turn.
                    if (m.TryGetProperty("userTurn", out var ut) && ut.TryGetInt32(out var utn)
                        && m.TryGetProperty("aangTurn", out var at2) && at2.TryGetInt32(out var atn))
                        bubble.AssignIds(utn, atn);
                    break;
                case "ack":
                    acked = true; ackTimer.Stop();
                    break;
                case "tool":
                    if (working && Str(m, "phase") == "start") { bubble.ShowDots(Str(m, "label")); dirty = true; }
                    break;
                case "queued":
                    if (working) { bubble.ShowDots($"waiting, number {(m.TryGetProperty("position", out var pos) ? pos.GetInt32() : 1)} in line"); dirty = true; }
                    break;
                case "error":
                    ShowError(Str(m, "message") ?? "Something went wrong.", Str(m, "next") ?? "");
                    break;
                case "consent":
                    OnConsent(Str(m, "wanted") ?? "smart");
                    break;
                case "backup.ask":
                    OnBackupAsk(m);
                    break;
                case "fact.ask":
                    OnFactAsk(m);
                    break;
                case "permission":
                    OnPermission(Str(m, "id") ?? "", Str(m, "question") ?? "do that", Str(m, "remembers"));
                    break;
                case "clipboard.request":
                    SendClipboard(Str(m, "id") ?? "");
                    break;
                case "look.request":
                    SendLook(Str(m, "id") ?? "");
                    break;
                case "hands.request":
                    RunHands(Str(m, "id") ?? "", Str(m, "action") ?? "", Str(m, "what") ?? "", Str(m, "how") ?? "");
                    break;
                case "quota":
                    hasQuota = true;
                    weekUse = Num(m, "week"); fiveUse = Num(m, "five");
                    weekResetsAt = Num(m, "weekResetsAt"); fiveResetsAt = Num(m, "fiveResetsAt");
                    level = Str(m, "level") ?? ModelChip.LevelFor(weekUse, saving);
                    saving = level == "saving";
                    if (cfg.Saving != saving) { cfg.Saving = saving; cfg.Save(); }
                    PushStatus();
                    break;
                case "claude.working": {
                    var was = claudeWorking;
                    claudeWorking = Bool(m, "working");
                    workingWhat = Str(m, "what") ?? "";
                    workingHost = Str(m, "host");
                    if (claudeWorking != was)
                    {
                        markerSince = DateTime.UtcNow;                       // the icon pops in, same as any other
                        // Thinking is an ANIMATION, not a wash painted over the idle sprite - his own point
                        // (2026-09-23): "when aang is thinking regularly it changes its animation correct?".
                        // A session working IS him thinking, so it plays the same 12 frames, and the glow that
                        // already rides on the think state comes with it instead of being smeared on alone.
                        if (anim.State is "idle" or "think") PlayRest();
                    }
                    dirty = true;
                    break;
                }
                case "panel.reply":
                    panel?.Load(m);
                    break;
                case "history.reply":
                    panel?.LoadHistory(m);
                    // The same reply fills the bubble's stack. The Core returns newest first; the stack is
                    // read downwards, so it goes in reversed.
                    if (bubble.InScrollback && m.TryGetProperty("items", out var hit) && hit.ValueKind == JsonValueKind.Array)
                    {
                        awaitingOlder = false;
                        var older = new List<BubbleView.Said>();
                        foreach (var it in hit.EnumerateArray())
                            older.Add(new BubbleView.Said(
                                it.TryGetProperty("id", out var hid) && hid.TryGetInt32(out var hn) ? hn : 0,
                                Str(it, "text") ?? "", Str(it, "who") == "you",
                                DateTime.TryParse(Str(it, "ts"), System.Globalization.CultureInfo.InvariantCulture,
                                    System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                                    out var hts) ? hts.ToLocalTime() : DateTime.Now));
                        older.Reverse();
                        // An empty page means the database has nothing older: stop asking, and say so in the
                        // bubble rather than letting him scroll into silence wondering if it is broken.
                        if (older.Count == 0) bubble.ReachedTheStart = true;
                        bubble.Prepend(older);
                        dirty = true;
                    }
                    break;
                case "quiet":
                    forcedQuiet = Bool(m, "on"); ApplyQuiet();
                    break;
                case "job.hunt.reply":
                    Note(Bool(m, "onMac") ? "Running on your MacBook." : "Your MacBook is not reachable - running it here.");
                    break;
                case "hush.reply":
                    Note(Str(m, "text") ?? "Hush.");
                    break;
                case "ping":
                    _ = link.SendAsync(new { t = "pong" });
                    break;
            }
        }
        catch (Exception e) { Log.Write("core message failed: " + e.Message); }
    }

    static string? Str(JsonElement m, string name) => m.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    static double Num(JsonElement m, string name) => m.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : 0;
    static bool Bool(JsonElement m, string name) => m.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    /// <summary>protocol.ts's StructuredList, off the wire (2026-09-24): the "bubble" message's own "list"
    /// field, present only on the turn present_list actually ran on. Null on anything malformed rather than
    /// throwing - a bad list is a missing list, never a crashed Body.</summary>
    static BubbleRows? ParseRows(JsonElement m)
    {
        if (!m.TryGetProperty("list", out var l) || l.ValueKind != JsonValueKind.Object) return null;
        if (!l.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array) return null;
        var rows = new BubbleRows { Icon = Str(l, "icon") ?? "file" };
        foreach (var it in items.EnumerateArray())
        {
            if (it.ValueKind != JsonValueKind.Object) continue;
            var title = Str(it, "title"); if (string.IsNullOrEmpty(title)) continue;
            rows.Items.Add(new BubbleRow { Title = title, Subtitle = Str(it, "subtitle"), ChipText = Str(it, "chipText"), ChipTone = Str(it, "chipTone") });
        }
        if (l.TryGetProperty("moreCount", out var mc) && mc.ValueKind == JsonValueKind.Number) rows.MoreCount = mc.GetInt32();
        if (l.TryGetProperty("header", out var hd) && hd.ValueKind == JsonValueKind.Object)
        {
            rows.HeaderText = Str(hd, "text");
            rows.HeaderTone = Str(hd, "tone");
        }
        return rows.Items.Count > 0 ? rows : null;
    }

    void Wake() => wakeUntil = DateTime.UtcNow + WakeFor;

    void ShowBubble(string text, bool stream)
    {
        var hold = stream ? 0 : Math.Clamp(2500 + 45 * text.Length, 3000, 20000);
        bubble.Show(text, stream, hold);
        if (anim.State is "idle" or "think") anim.Play("talk");
        dirty = true;
    }

    // ------------------------------------------------------------------ quiet mode

    void PollForeground()
    {
        foreground = ForegroundName();
        foregroundTitle = cfg.SeeActiveWindow ? ForegroundTitle() : "";
        if (!cfg.SeeActiveWindow) foregroundHwnd = 0;
        var wow = cfg.QuietProcessPrefixes.Any(p => foreground.StartsWith(p, StringComparison.OrdinalIgnoreCase));
        if (wow != autoQuiet) { autoQuiet = wow; ApplyQuiet(); }
        ReportWindow();
        ReportDesk();
    }

    /// <summary>
    /// Whether Joshua is at this PC: any key or mouse input in the last five minutes. The Core uses it to say
    /// things he did not ask for in one place only - the bubble while he is here, Discord while he is not.
    /// Sent when it changes, and again after a reconnect.
    /// </summary>
    static readonly TimeSpan AwayAfter = TimeSpan.FromMinutes(5);
    bool? sentDesk;
    void ReportDesk()
    {
        var active = Win32.IdleFor() < AwayAfter;
        if (active == sentDesk) return;
        sentDesk = active;
        Log.Write($"at desk={active}");
        _ = link.SendAsync(new { t = "desk", active });
    }

    /// <summary>
    /// Tell the Core which window is in front, when it changes. The title is the cheap half of knowing what
    /// Joshua is doing: it names the app, and usually the repo, file, page or game, for no cost at all.
    /// Only sent when it actually changes, and not more than twice a second, so alt-tabbing does not flood
    /// the socket.
    /// </summary>
    void ReportWindow()
    {
        var now = DateTime.UtcNow;
        var key = foreground + "\u0000" + foregroundTitle + "\u0000" + foregroundHwnd;
        if (key == sentWindow || now - windowSentAt < TimeSpan.FromMilliseconds(500)) return;
        sentWindow = key; windowSentAt = now;
        _ = link.SendAsync(new { t = "presence", quiet, foreground, title = foregroundTitle, watching = cfg.SeeActiveWindow, hwnd = foregroundHwnd });
    }

    /// <summary>The foreground window's title. Read every poll, because it changes without the window
    /// changing: a new browser tab or a new file is the same window with a different title.</summary>
    string ForegroundTitle()
    {
        try
        {
            var h = Win32.GetForegroundWindow();
            if (h == IntPtr.Zero) return "";
            Win32.GetWindowThreadProcessId(h, out var pid);
            if (pid == Environment.ProcessId) return "";      // never report Aang's own windows
            foregroundHwnd = h.ToInt64();
            var sb = new System.Text.StringBuilder(256);
            return Win32.GetWindowText(h, sb, sb.Capacity) > 0 ? sb.ToString() : "";
        }
        catch { return ""; }
    }

    // The foreground window almost never changes, so the process name is looked up only when it does.
    // System.Diagnostics.Process.ProcessName snapshots every process on the machine, which measured as
    // a ~1.4% CPU floor when polled twice a second; QueryFullProcessImageName is a single cheap call.
    IntPtr lastForegroundHwnd;
    string lastForegroundName = "";

    string ForegroundName()
    {
        try
        {
            var h = Win32.GetForegroundWindow();
            if (h == lastForegroundHwnd) return lastForegroundName;
            lastForegroundHwnd = h;
            lastForegroundName = "";
            if (h == IntPtr.Zero) return "";
            Win32.GetWindowThreadProcessId(h, out var pid);
            if (pid == Environment.ProcessId) return "";
            var proc = Win32.OpenProcess(Win32.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (proc == IntPtr.Zero) return "";
            try
            {
                var sb = new System.Text.StringBuilder(512);
                uint size = (uint)sb.Capacity;
                if (Win32.QueryFullProcessImageName(proc, 0, sb, ref size))
                    lastForegroundName = Path.GetFileNameWithoutExtension(sb.ToString());
            }
            finally { Win32.CloseHandle(proc); }
            return lastForegroundName;
        }
        catch { return ""; }
    }

    void ApplyQuiet()
    {
        var q = forcedQuiet ?? autoQuiet;
        UpdateQuietMenu();
        if (q == quiet) return;
        quiet = q;
        Log.Write($"quiet={quiet} foreground={foreground}");
        // Found live, 2026-09-24 (Josh, tabbing into WoW fullscreen): a session working stayed shown as the
        // dot-marker, but the sprite itself dropped out of "think" back to idle - no wind, no glow - and
        // never came back, because idle loops forever and only a one-shot animation's own finish reasserts
        // PlayRest() (Tick(), below). This one call bypassed PlayRest() and forced idle unconditionally,
        // directly against the very next comment's own intent: a working session is what quiet must NOT hide.
        PlayRest();
        if (!quiet && !peeking && heldText != null) { ShowBubble(heldText, false); heldText = null; }
        dirty = true;
        _ = link.SendAsync(new { t = "presence", quiet, foreground, title = foregroundTitle, watching = cfg.SeeActiveWindow, hwnd = foregroundHwnd });
    }

    // ------------------------------------------------------------------ frame loop

    void Tick()
    {
        try
        {
            var now = DateTime.UtcNow;
            tick++;
            // Esc and the click-away watcher belong to the STATE, not to whichever call opened it. Arming
            // them at each entry point meant any path that did not know to arm them produced a bubble with
            // no way out, which is how the conversation shipped stuck (2026-10-02).
            if (bubble.Expanded && !awayTimer.Enabled) EnterExpandedMode();
            var changed = bubble.Update(now);
            if (StepSlide(now)) changed = true;
            WatchDock(now);

            if (bubbleWasVisible && !bubble.Visible)
            {
                bubbleWasVisible = false;
                if (anim.State == "talk") { PlayRest(); changed = true; }
            }
            if (bubble.Visible) bubbleWasVisible = true;

            if (urgent || claudeWorking || (badge && peeking)) changed = true;  // the outline/glow pulses even while quiet holds the idle loop

            // Quiet mode freezes the idle loop; anything Joshua triggers (a reply, a poke) wakes it briefly.
            // claudeWorking is right beside urgent here on purpose: a session working is exactly the kind of
            // thing the WoW-quiet-hold should not be able to hide - he is not being interrupted, just shown.
            var animate = !quiet || bubble.Visible || now < wakeUntil || urgent || claudeWorking;
            if (animate)
            {
                if (anim.Tick(now, sprites.Count(anim.State), out var finished)) changed = true;
                if (finished) { if (bubble.Visible && !bubble.Dots) anim.Play("talk"); else PlayRest(); changed = true; }
                wasAnimating = true;
            }
            else if (wasAnimating)
            {
                // Only reached when animate is false, which requires claudeWorking to already be false too (it
                // is OR'd into animate above) - so this always resolved to idle anyway. Routed through PlayRest()
                // regardless, on the same principle as ApplyQuiet's fix just above: every "return to rest" call
                // site goes through the one helper, so this can never silently start hiding a working session
                // again if the animate condition above is ever changed.
                wasAnimating = false;
                PlayRest();
                changed = true;
            }

            if (changed || dirty) Render();
            timer.Interval = slideStart != DateTime.MinValue ? 16 : bubble.Animating || urgent ? 33 : (badge && peeking) || claudeWorking ? 50 : (!animate ? (bubble.More ? 250 : 250) : Math.Clamp(anim.FrameMs, 33, 200));
        }
        catch (Exception e) { Log.Write("tick failed: " + e); }
    }

    void Render()
    {
        try
        {
            var g = surface.G;
            surface.Clear();
            g.ResetTransform();
            g.ScaleTransform(scale, scale);
            g.TranslateTransform(Margin, Extra);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;

            if (dock != DockEdge.None && peeking && slideStart == DateTime.MinValue) DrawPeeking(g);        // tucked at the edge
            else
            {
                bubble.Draw(g, tick);
                var standing = new Rectangle(246, 86, 224, 224);
                var frame = sprites.Frame(anim.State, anim.Frame);
                Bitmap? mirrored = null;
                if (flipX)
                {
                    mirrored = (Bitmap)frame.Clone();
                    mirrored.RotateFlip(RotateFlipType.RotateNoneFlipX);               // walking left: a mirror, every pixel kept
                }
                var shown = mirrored ?? frame;
                // 4.4: the marker for something genuinely stuck, drawn STANDING as well as docked.
                //
                // Until now both outlines lived only in DrawPeeking, so a waiting session showed nothing at
                // all unless he happened to be tucked at a screen edge - and "he is at his desk" is precisely
                // the case 4.4 exists for. The state was being set correctly and had nowhere to appear.
                // Behind the sprite, same as DrawPeeking does it, so it reads as a halo and not a box.
                if (urgent) DrawOutline(g, shown, standing, loom: true);
                else if (ambientGlow) DrawOutline(g, shown, standing, loom: false);
                g.DrawImage(shown, standing);
                mirrored?.Dispose();
                if (anim.State == "think") DrawThinkGlow(g);
            }

            surface.Present(Handle, Location);
            dirty = false;
        }
        catch (Exception e) { Log.Write("render failed: " + e); }
    }

    /// <summary>
    /// Working (2026-09-22, Joshua: "get his arrow and eyes to glow like getting into avatar state"): the
    /// tattoo and both eyes get a soft white-blue halo, breathing slowly, the same colour as Avatar State in
    /// the show and the same Theme.AvatarGlow already used for "needs him". Positions are read off the sprite
    /// sheet itself (think_5.png), not guessed: the arrow sits at 111,88 and the eyes at 100,106 / 121,106 in
    /// the 224x224 frame. No new art - a glow drawn over the existing pixels, same trick as the bubble's own halo.
    /// </summary>
    void DrawThinkGlow(Graphics g, RotateFlipType turn = RotateFlipType.RotateNoneFlipNone)
    {
        var old = g.SmoothingMode; g.SmoothingMode = SmoothingMode.AntiAlias;
        var phase = (Math.Sin(DateTime.UtcNow.TimeOfDay.TotalSeconds * 2.2) + 1) / 2;   // 0..1, ~2.9s breath
        var a = (int)(115 + 100 * phase);
        void Glow(float cx, float cy, float r)
        {
            // Docking turns the whole frame (Docking.Rotation), so these points - read off the sprite itself -
            // make the same turn, or they would glow the back of his head. Bottom, where he actually lives, is
            // no turn at all: the numbers below are already right for it (2026-09-23).
            const float n = Docking.Frame - 1;
            var (rx, ry) = turn switch
            {
                RotateFlipType.Rotate90FlipNone => (n - cy, cx),
                RotateFlipType.Rotate180FlipNone => (n - cx, n - cy),
                RotateFlipType.Rotate270FlipNone => (cy, n - cx),
                _ => (cx, cy),
            };
            var x = Docking.SpriteX + rx; var y = Docking.SpriteY + ry;
            using var path = new GraphicsPath(); path.AddEllipse(x - r, y - r, r * 2, r * 2);
            using var brush = new PathGradientBrush(path)
            {
                CenterColor = Theme.WithAlpha(Theme.AvatarGlow, Math.Min(255, a)),
                SurroundColors = new[] { Theme.WithAlpha(Theme.AvatarGlow, 0) },
            };
            g.FillEllipse(brush, x - r, y - r, r * 2, r * 2);
        }
        Glow(111, 88, 12);   // the arrow tattoo
        Glow(100, 106, 7);   // left eye
        Glow(121, 106, 7);   // right eye
        g.SmoothingMode = old;
    }

    // ------------------------------------------------------------------ mouse

    /// <summary>Window pixels to bubble coordinates (unscaled, minus the headroom above the old window).</summary>
    PointF BubblePoint(Point p) => new(p.X / scale - Margin, p.Y / scale - Extra);

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
        if (travelStep != 0) { travelStep = 0; slideStart = DateTime.MinValue; flipX = false; anim.Play("idle"); dirty = true; }
        var bp = BubblePoint(e.Location);
        if (bubble.Expanded && bubble.CanScroll && (bubble.HitThumb(bp.X, bp.Y) || bubble.HitTrack(bp.X, bp.Y)))
        {
            thumbDrag = true; Capture = true;                    // dragging the scrollbar
            if (bubble.ScrollToY(bp.Y)) dirty = true;
            return;
        }
        dragging = true; moved = false;
        dragStart = Cursor.Position; startLoc = Location;
        Capture = true;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (thumbDrag) { if (bubble.ScrollToY(BubblePoint(e.Location).Y)) dirty = true; return; }
        if (!dragging)
        {
            var hp = BubblePoint(e.Location);
            var over = bubble.Visible && (bubble.Contains(hp.X, hp.Y) || bubble.HitTool(hp.X, hp.Y) >= 0);
            if (over != bubble.Hover) { bubble.Hover = over; dirty = true; }
        }
        if (!dragging) return;
        var c = Cursor.Position;
        int dx = c.X - dragStart.X, dy = c.Y - dragStart.Y;
        if (!moved && Math.Abs(dx) + Math.Abs(dy) < 4) return;
        moved = true;
        Location = new Point(startLoc.X + dx, startLoc.Y + dy);
        surface.Present(Handle, Location);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (bubble.Hover) { bubble.Hover = false; dirty = true; }
    }

    /// <summary>
    /// Top the stack up from the database the first time he scrolls back.
    ///
    /// Without this the bubble could only show what happened since the app last started, which is not
    /// "scroll back an hour", it is "scroll back as far as the last restart" - and the Core restarts several
    /// times a day. Asked once per scrollback, not per scroll tick.
    /// </summary>
    void FillStackFromMemory()
    {
        if (!bubble.WantsOlder || awaitingOlder) return;
        awaitingOlder = true;
        // Older than the oldest already shown. Repeats every time he reaches the top, so there is no limit
        // on how far back he can go - days, weeks, until the database runs out.
        _ = link.SendAsync(new { t = "history", q = "", before = bubble.OldestId });
    }

    /// <summary>One page of older turns is in flight; stops a scroll at the top asking over and over.</summary>
    bool awaitingOlder;

    /// <summary>The same four choices the Panel offers, on the desktop. One list of actions, one place they
    /// are defined, so the two cannot drift apart.</summary>
    void ShowTurnMenu(int row, Point at)
    {
        var said = bubble.Remembered(row);
        var menu = new ContextMenuStrip { ShowImageMargin = false };
        void Add(string label, Action go)
        {
            var item = new ToolStripMenuItem(label);
            item.Click += (_, _) => go();
            menu.Items.Add(item);
        }
        Add("Reply to this", () => { input.ReplyTo(row, said); Wake(); input.Open(Location, Win32.GetForegroundWindow()); });
        Add("Add as context", () => input.Pin(row, said));
        Add("Copy text", () => { try { Clipboard.SetDataObject(said, true, 5, 60); } catch { /* another app had the clipboard */ } });
        menu.Items.Add(new ToolStripSeparator());
        Add("Forget this", () => { _ = link.SendAsync(new { t = "forget.turn", id = row }); bubble.Forget(row); dirty = true; });
        GoldMenu.Apply(menu);
        menu.Closed += (_, _) => menu.Dispose();
        menu.Show(this, at);
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        // Scroll up over the bubble to reach back through the conversation. Scroll() opens the stack itself
        // when there is nothing above - the gesture is the same one either way, so there is nothing to learn.
        if (!bubble.Visible && e.Delta > 0) { if (bubble.OpenConversation()) { Wake(); dirty = true; } }
        else if (bubble.Scroll(e.Delta > 0 ? -1 : 1)) dirty = true;
        FillStackFromMemory();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button == MouseButtons.Right)
        {
            // A right-click ON A MESSAGE is about that message; anywhere else on Aang is the tray menu
            // (Panel, Talk, Model, Dock...). Decided here and nowhere else: the tray menu opens on mouse UP,
            // so an earlier handler on mouse DOWN just meant both ran and this one won (2026-10-02, Joshua:
            // "the right clcik doesnt work in the bubble it ddefualts to the regular right click menu").
            var onBubble = BubblePoint(e.Location);
            if (bubble.Contains(onBubble.X, onBubble.Y))
            {
                var row = bubble.TurnAt(onBubble.Y);
                if (row > 0) { ShowTurnMenu(row, e.Location); return; }
            }
            SetClickAwayHook(true);
            tray.ContextMenuStrip?.Show(new Point(Cursor.Position.X - 34, Cursor.Position.Y), ToolStripDropDownDirection.Left);
            return;   // to his left: he is drawn above a menu that opens under him
        }

        if (thumbDrag) { thumbDrag = false; Capture = false; return; }
        if (!dragging) return;
        dragging = false; Capture = false;
        if (moved) { AfterDrag(); return; }
        // A waiting Claude session: the icon takes him to it (here or on the Mac), not to the bubble.
        if (dock != DockEdge.None && peeking && badge && GoToHeldSession()) return;
        if (dock != DockEdge.None && peeking && !badge && ExplainAndGoToWorking()) return;
        if (dock != DockEdge.None && peeking) { Reveal(thenType: true); return; }  // a click on his head: up, and the box opens (Reveal clears the marker)

        var bp = BubblePoint(e.Location);
        var choice = bubble.HitChoice(bp.X, bp.Y);
        // The same two buttons answer two different questions. A fact being offered is not a permission:
        // it has no "always", because the answer is about one claim rather than a standing rule.
        if (choice >= 0 && backupAsk) { AnswerBackup(choice == 0); dirty = true; return; }
        if (choice >= 0 && factId != null) { AnswerFact(choice == 0); dirty = true; return; }
        if (choice >= 0) { AnswerPermission(choice switch { 0 => "once", 2 => "always", _ => "no" }); dirty = true; return; }
        var tool = bubble.HitTool(bp.X, bp.Y);
        if (tool >= 0) { UseTool(tool); dirty = true; return; }
        if (bubble.Visible && bubble.Contains(bp.X, bp.Y))
        {
            if (consentText != null) AllowOnce();
            else if (bubbleFocus != null)
            {
                // "Need input in Claude": take him straight to that session's window.
                var r = Hands.Arrange(bubbleFocus, "front");
                Log.Write($"bubble link -> {bubbleFocus}: {r.Detail}");
                if (!r.Ok) { ShowBubble("That Claude window is closed now.", false); bubbleFocus = null; bubble.Link = ""; }
                else { bubble.Clear(); bubbleFocus = null; if (anim.State == "talk") PlayRest(); }
            }
            // The click half of the RPG convention (2026-10-01): the reply is all here, it is just still
            // being revealed, so show the rest now. Deliberately below the consent and link branches, which
            // are decisions rather than impatience, and guarded on !working so that clicking while Claude is
            // still generating keeps meaning "stop" - there is nothing to skip to yet.
            else if (!working && bubble.SkipReveal()) { /* the rest is now shown */ }
            else if (bubble.More) ExpandBubble();                      // "...v": grow it to read the rest
            else if (bubble.Expanded) { /* clicking inside the open bubble does nothing; Esc or a click outside closes it */ }
            else if (working) StopReply();                        // clicking the bubble while Aang is thinking stops it
            else { bubble.Clear(); if (anim.State == "talk") PlayRest(); }
            dirty = true;
        }
        else
        {
            // A click on Aang himself opens the box to type to him.
            Wake(); anim.Play("look"); dirty = true;
            _ = link.SendAsync(new { t = "poked" });
            OpenInput(userAsked: true);
        }
    }

    // ------------------------------------------------------------------ expanded bubble

    void ExpandBubble()
    {
        if (!bubble.Expand()) return;
        EnterExpandedMode();
        dirty = true;
    }

    // While the bubble is expanded, Esc closes it. RegisterHotKey swallows the key so the game does not also open
    // its own menu, and a light poll of the mouse button spots a click outside the bubble. Both exist only while
    // expanded, and neither is a global hook.
    void EnterExpandedMode()
    {
        if (!escRegistered) escRegistered = Win32.RegisterHotKey(Handle, EscId, Win32.MOD_NOREPEAT, 0x1B);
        mouseWasDown = false;
        awayTimer.Start();
    }

    /// <summary>
    /// Put everything of Aang's away and leave him standing there.
    ///
    /// Joshua's rule, stated twice: clicking anywhere outside Aang returns him to neutral. Previously this
    /// only collapsed the bubble, which was fine when a bubble always had a reply in it, and wrong once the
    /// conversation could be opened with nothing to collapse back to.
    /// </summary>
    void ReturnToNeutral()
    {
        ExitExpanded(collapse: true);
        if (bubble.InScrollback && bubble.LeaveScrollback()) dirty = true;
        if (input.Visible) input.Close(giveBackFocus: true);
        if (anim.State is "talk" or "think") anim.Play("idle");
        dirty = true;
    }

    void ExitExpanded(bool collapse)
    {
        if (escRegistered) { Win32.UnregisterHotKey(Handle, EscId); escRegistered = false; }
        awayTimer.Stop();
        if (collapse && bubble.Collapse()) dirty = true;
    }

    void WatchForClickAway()
    {
        if (!bubble.Expanded) { ExitExpanded(false); return; }
        var down = (Win32.GetAsyncKeyState(0x01) & 0x8000) != 0 || (Win32.GetAsyncKeyState(0x02) & 0x8000) != 0;
        if (down && !mouseWasDown)
        {
            var c = Cursor.Position;
            var r = new Rectangle(
                Location.X + (int)((Margin + bubble.LeftNow) * scale), Location.Y + (int)((bubble.CurrentTop + Extra) * scale),
                (int)((BubbleView.Right - bubble.LeftNow) * scale), (int)((BubbleView.Bottom - bubble.CurrentTop) * scale));
            // The type box is Aang's too: clicking into it is not clicking away from him.
            var onInput = input.Visible && input.Bounds.Contains(c);
            if (!r.Contains(c) && !onInput) ReturnToNeutral();
        }
        mouseWasDown = down;
    }

    // ------------------------------------------------------------------ typing to Aang

    /// <param name="userAsked">
    /// True only when Joshua did something that means "come back": the tray item, or clicking Aang. A
    /// consent or permission question must never bring a hidden pet back on screen.
    /// </param>
    bool OpenInput(bool userAsked = false)
    {
        if (hiddenByUser && !userAsked) { Log.Write("input box suppressed: hidden by Joshua"); return false; }
        if (peeking && userAsked) { Reveal(thenType: true); return true; }         // docked: bring him out first, then open the box
        if (!Visible) { hiddenByUser = false; Show(); }
        var prev = Win32.GetForegroundWindow();
        if (prev == Handle || prev == input.Handle) prev = IntPtr.Zero;
        input.Working = working;
        input.Open(new Point(Location.X + (int)(Margin * scale), Location.Y + (int)(Extra * scale)), prev);
        Wake(); dirty = true;
        return true;
    }

    void Submit(string text)
    {
        // Rainmeter: "yip yip" sends him away. Docked, that means back down to the edge; it never reaches the model.
        if (dock != DockEdge.None && System.Text.RegularExpressions.Regex.IsMatch(text.Trim(), @"^yip\s*yip\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            input.Close(false); Peek(); return;
        }
        var id = $"u{++idCounter}";
        currentId = id; working = true; acked = false; input.Working = true;
        // Instant feedback first, before any network: Aang reacts the moment Enter is pressed.
        Wake(); ExitExpanded(collapse: false);
        bubble.ShowDots(); anim.Play("think"); dirty = true;

        if (!link.IsConnected)
        {
            ShowError("I can't reach my brain right now.", "It reconnects on its own. Try again in a few seconds.");
            return;
        }
        lastText = text; consentText = null; input.SetConsent(false);
        bubble.Remember(0, text, true);        // his own turn; its row id arrives with turn.saved
        // What he pointed at travels with the message. Both are his own choices from the scrollback, never
        // inferred: a reply bound by recency misattributes, which is why Slack and Discord carry an explicit
        // reference rather than guessing from what came last.
        var replyTo = input.ReplyingTo;
        var pinned = input.PinnedIds;
        _ = link.SendAsync(replyTo is int r
            ? new { t = "submit", id, text, mode, replyTo = r, context = pinned }
            : pinned.Count > 0 ? (object)new { t = "submit", id, text, mode, context = pinned }
                               : new { t = "submit", id, text, mode });
        // The reply binding was about that one message. Pins stay until he takes them off (his decision).
        input.ClearReply();
        ackTimer.Stop(); ackTimer.Start();                        // if the Core never acknowledges, say so
    }

    void AckTimeout()
    {
        ackTimer.Stop();
        if (working && !acked) ShowError("My brain did not answer.", "Try again in a moment.");
    }

    /// <summary>Never an empty bubble: say what failed and what to do.</summary>
    void ShowError(string message, string next)
    {
        working = false; input.Working = false; ackTimer.Stop();
        Wake(); ExitExpanded(collapse: false);
        bubble.Asked = "";
        bubble.Show((message + " " + next).Trim(), false, 12000);
        anim.Play("talk"); dirty = true;
    }

    void StopReply()
    {
        _ = link.SendAsync(new { t = "stop", id = currentId });
        working = false; input.Working = false; ackTimer.Stop();
        ExitExpanded(collapse: false);
        bubble.Clear(); PlayRest(); dirty = true;
    }

    // ------------------------------------------------------------------ model chip, quota, consent

    void PushStatus() => input.SetStatus(mode, saving, hasQuota, weekUse, fiveUse, saving ? "saving" : level, weekResetsAt, fiveResetsAt);

    void SetMode(string m)
    {
        mode = ModelChip.Normalize(m);
        cfg.Mode = mode; cfg.Save();
        PushStatus(); UpdateModeMenu();
        Note("Model: " + ModelChip.Label(mode));
    }

    void SetSaving(bool on)
    {
        saving = on; cfg.Saving = on; cfg.Save();
        _ = link.SendAsync(new { t = "saving", on });
        if (!on) level = ModelChip.LevelFor(weekUse, false);
        PushStatus();
        Note(on ? "Saving quota: on" : "Saving quota: off");
    }

    /// <summary>A short line from Aang for a hotkey or chip change. Never interrupts a running reply.</summary>
    void Note(string text)
    {
        if (working || consentText != null) return;
        Wake(); ExitExpanded(collapse: false);
        bubble.Asked = "";
        bubble.Show(text, false, 1800);
        dirty = true;
    }

    /// <summary>Copy the reply, or rate it. Clicking a rating again takes it back. Ratings feed the voice review.</summary>
    void UseTool(int tool)
    {
        if (tool == 0)
        {
            try { Clipboard.SetDataObject(bubble.Text, true, 5, 60); bubble.CopiedUntil = DateTime.UtcNow.AddMilliseconds(1200); }
            catch (Exception e) { Log.Write("copy failed: " + e.Message); }
            return;
        }
        var want = tool == 1 ? 1 : -1;
        bubble.Rating = bubble.Rating == want ? 0 : want;
        _ = link.SendAsync(new { t = "rate", id = replyId, value = bubble.Rating == 1 ? "up" : bubble.Rating == -1 ? "down" : "none" });
    }

    /// <summary>
    /// Closing, moving and force-quitting windows, and the media keys. Only ever asked for by the Core after
    /// Joshua agreed to that kind of thing. Run off the UI thread: closing waits for the app to answer.
    /// </summary>
    void RunHands(string id, string action, string what, string how)
    {
        _ = Task.Run(() =>
        {
            Hands.Result r;
            try
            {
                r = action switch
                {
                    "close" => Hands.Close(what),
                    "forcequit" => Hands.ForceQuit(what),
                    "arrange" => Hands.Arrange(what, how),
                    "media" => Hands.Media(what),
                    // The clipboard belongs to the UI thread. The Core has already asked Joshua (once, and again after outside content).
                    "clipset" => SetClipboard(what),
                    _ => new(false, $"I do not know how to {action}."),
                };
            }
            catch (Exception e) { Log.Write("hands failed: " + e.Message); r = new(false, "That failed: " + e.Message); }
            Log.Write($"hands {action} '{what}' {how} -> {r.Ok}");
            _ = link.SendAsync(new { t = "hands", id, ok = r.Ok, detail = r.Detail });
        });
    }

    Hands.Result SetClipboard(string text)
    {
        if (string.IsNullOrEmpty(text) || text.Length > 100_000) return new(false, "There was nothing sensible to copy.");
        // The native calls, not System.Windows.Forms.Clipboard: on this machine that threw "Requested Clipboard
        // operation did not succeed" although the text had landed, and could not read back its own write (found by
        // testing the real Body, 2026-09-21). Windows-owned memory also outlives the Body.
        string? why = null;
        Invoke(() => { why = Win32.SetClipboardText(text, Handle); });
        Log.Write($"clipset len={text.Length} result={(why ?? "ok")}");
        return why == null ? new(true, $"Put {text.Length} characters on the clipboard.") : new(false, "The clipboard would not take it: " + why + ".");
    }

    /// <summary>
    /// The clipboard is Windows', not Node's, so the Core asks for it and this answers. Only ever after
    /// Joshua has agreed, and only the text: no images, no files, nothing that is not what he copied.
    /// </summary>
    void SendClipboard(string id)
    {
        string? text = null;
        try { if (Clipboard.ContainsText()) text = Clipboard.GetText(); }
        catch (Exception e) { Log.Write("clipboard read failed: " + e.Message); }
        _ = link.SendAsync(new { t = "clipboard", id, text });
    }

    /// <summary>
    /// A picture of the window Joshua is in, asked for by the Core only after he has agreed to it. Taken
    /// here because the Body owns the desktop and knows which windows are Aang's own, to leave them out.
    /// </summary>
    void SendLook(string id)
    {
        if (!cfg.SeeActiveWindow || foregroundHwnd == 0)
        {
            _ = link.SendAsync(new { t = "look", id, ok = false, error = "seeing his windows is turned off" });
            return;
        }
        var shot = Look.Capture(new IntPtr(foregroundHwnd), new[] { Handle, input.IsHandleCreated ? input.Handle : IntPtr.Zero });
        if (shot.Error != null) Log.Write("look failed: " + shot.Error);
        // Tests only: keep a copy of exactly what was sent, to check by eye that Aang is not in it.
        if (shot.Jpeg != null && Environment.GetEnvironmentVariable("AANG_LOOK_SAVE") is { Length: > 0 } save)
            try { File.WriteAllBytes(save, Convert.FromBase64String(shot.Jpeg)); } catch (Exception e) { Log.Write("look save failed: " + e.Message); }
        _ = link.SendAsync(new { t = "look", id, ok = shot.Jpeg != null, data = shot.Jpeg, w = shot.Width, h = shot.Height, black = shot.Black, error = shot.Error });
    }

    /// <summary>Aang wants to change something on the machine. He does not do it until Joshua says yes.</summary>
    void OnPermission(string id, string question, string? remembers = null)
    {
        if (hiddenByUser)
        {
            // He cannot see it, so he cannot agree to it. No is the safe answer, and it is immediate
            // rather than leaving the Core waiting two minutes for a prompt nobody will ever see.
            Log.Write("permission refused: hidden by Joshua");
            _ = link.SendAsync(new { t = "permission.reply", id, choice = "no" });
            return;
        }
        permissionId = id;
        if (peeking) Reveal();                                    // a question cannot be answered by a head at the edge
        Wake(); ExitExpanded(collapse: false);
        // Three real choices (2026-09-22, was a single Yes that silently meant "forever"): the verb button
        // does this one thing and forgets it; "Always allow X" is set apart, its own row, never the default,
        // because that is the one that commits to more than what was asked.
        bubble.Show("Can I " + question + "?", false, 120000);
        bubble.VerbLabel = Capitalize(Truncate(question, 34));
        bubble.AlwaysLabel = string.IsNullOrEmpty(remembers) ? "" : "Always " + remembers;
        bubble.Asking = true;
        anim.Play("look"); dirty = true;
    }

    /// <summary>
    /// Something the local model read in one of Joshua's documents, offered for approval.
    ///
    /// Shown the same way a permission is, because the shape fits - a short question and two buttons - but
    /// answered separately. There is no "always": the answer is about this one claim, not a standing rule,
    /// and offering to remember it forever would be answering a question nobody asked.
    /// </summary>
    void OnFactAsk(JsonElement m)
    {
        if (!m.TryGetProperty("id", out var idp) || !idp.TryGetInt32(out var id)) return;
        var text = Str(m, "text") ?? "";
        if (text.Length == 0) return;
        if (hiddenByUser || cfg.Muted) { _ = link.SendAsync(new { t = "fact.reply", id, keep = false }); return; }

        factId = id;
        if (peeking) Reveal();
        Wake(); ExitExpanded(collapse: false);
        var from = Str(m, "fromDoc") ?? "";
        var left = m.TryGetProperty("left", out var lp) && lp.TryGetInt32(out var ln) ? ln : 0;
        var shown = from.Length > 0 ? text + Environment.NewLine + Environment.NewLine + "from " + from : text;
        bubble.Show(shown, false, 180000);
        bubble.Asked = left > 1 ? $"Worth remembering? ({left} waiting)" : "Worth remembering?";
        bubble.VerbLabel = "Yes, remember";
        bubble.DeclineLabel = "No, drop it";   // declining DELETES it, so the button must not say "not now"
        bubble.AlwaysLabel = "";              // no standing rule: this is about one claim
        bubble.Asking = true;
        anim.Play("look"); dirty = true;
    }

    /// <summary>
    /// The vault has changes and has not been saved for a few days. Offered, never done unasked.
    ///
    /// "Not now" is the honest word here, unlike on a fact: declining really does mean later, and the Core
    /// waits half a day before raising it again.
    /// </summary>
    void OnBackupAsk(JsonElement m)
    {
        if (hiddenByUser || cfg.Muted) { _ = link.SendAsync(new { t = "backup.reply", now = false }); return; }
        var days = m.TryGetProperty("days", out var dp) && dp.TryGetInt32(out var dn) ? dn : 3;
        backupAsk = true;
        if (peeking) Reveal();
        Wake(); ExitExpanded(collapse: false);
        bubble.Show($"Your vault has changes and has not been backed up for {days} days. Save it to GitHub?", false, 180000);
        bubble.Asked = "";
        bubble.VerbLabel = "Back it up";
        bubble.AlwaysLabel = "";
        bubble.Asking = true;
        anim.Play("look"); dirty = true;
    }

    void AnswerBackup(bool now)
    {
        backupAsk = false;
        _ = link.SendAsync(new { t = "backup.reply", now });
        bubble.Asking = false;
        if (now) { bubble.ShowDots(); anim.Play("think"); }
        else bubble.Show("Alright, later.", false, 2000);
        dirty = true;
    }

    void AnswerFact(bool keep)
    {
        if (factId == null) return;
        _ = link.SendAsync(new { t = "fact.reply", id = factId, keep });
        factId = null;
        bubble.Asking = false;
        bubble.Asked = "";
        bubble.Show(keep ? "Got it." : "Dropped it.", false, 2000);
        dirty = true;
    }

    static string Capitalize(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
    static string Truncate(string s, int max) => s.Length <= max ? s : s[..(max - 1)].TrimEnd() + "…";

    void AnswerPermission(string choice)
    {
        if (permissionId == null) return;
        _ = link.SendAsync(new { t = "permission.reply", id = permissionId, choice });
        permissionId = null;
        bubble.Asking = false;
        if (choice != "no") { bubble.ShowDots(); anim.Play("think"); }
        else { bubble.Show("Alright, skipping that.", false, 2500); }
        dirty = true;
    }

    void OnConsent(string wanted)
    {
        if (hiddenByUser) { Log.Write("consent question dropped: hidden by Joshua"); return; }
        consentWanted = ModelChip.Label(wanted); consentText = lastText; pendingMode = ModelChip.Normalize(wanted);
        if (peeking) Reveal();
        working = false; input.Working = false; ackTimer.Stop();
        Wake(); ExitExpanded(collapse: false);
        bubble.Show($"{consentWanted} costs more of your week and saving quota is on. Click here or press Enter to allow it once, Esc to skip.", false, 60000);
        anim.Play("talk"); dirty = true;
        input.SetConsent(true, consentWanted);
        OpenInput();
    }

    void AllowOnce()
    {
        if (consentText == null) return;
        var text = consentText; consentText = null; input.SetConsent(false);
        var id = $"u{++idCounter}";
        currentId = id; working = true; acked = false; input.Working = true;
        Wake(); bubble.ShowDots(); anim.Play("think"); dirty = true;
        input.Close(true);
        _ = link.SendAsync(new { t = "submit", id, text, mode = pendingMode, once = true });
        ackTimer.Stop(); ackTimer.Start();
    }

    void DeclineConsent()
    {
        if (consentText == null) return;
        consentText = null; input.SetConsent(false);
        bubble.Clear(); PlayRest(); dirty = true;
    }

    // ------------------------------------------------------------------ hotkey

    string activeHotkey = "";

    /// <summary>Take the one global hotkey. Another program may already own a combination, so the result is
    /// logged, shown in the tray, and changeable by pressing a different key (see AskForHotkey).</summary>
    bool RegisterHotkey()
    {
        if (activeHotkey.Length > 0) { Win32.UnregisterHotKey(Handle, HotkeyId); activeHotkey = ""; }
        var combo = cfg.Hotkey;
        if (!TryParseHotkey(combo, out var mods, out var vk)) { Log.Write("hotkey not understood: " + combo); return false; }
        if (!Win32.RegisterHotKey(Handle, HotkeyId, mods | Win32.MOD_NOREPEAT, vk))
        {
            Log.Write("hotkey unavailable (taken by another program): " + combo);
            return false;
        }
        activeHotkey = combo;
        // Ctrl + "+" means either + key: the number pad one is registered alongside (best effort).
        Win32.UnregisterHotKey(Handle, HotkeyPadId);
        if (vk == 0xBB) Win32.RegisterHotKey(Handle, HotkeyPadId, mods | Win32.MOD_NOREPEAT, 0x6B);
        Log.Write("hotkey registered: " + combo);
        return true;
    }

    /// <summary>Let him press the key he wants. What the keyboard really sends is the only thing worth trusting.</summary>
    void AskForHotkey()
    {
        using var box = new HotkeyBox(scale, activeHotkey);
        box.TryRegister = combo =>
        {
            var previous = cfg.Hotkey;
            cfg.Hotkey = combo;
            if (RegisterHotkey()) { cfg.Save(); return true; }
            cfg.Hotkey = previous;
            hotkeyOk = RegisterHotkey();            // put the old one back
            return false;
        };
        // Taking focus has to happen once the window is actually on screen. Doing it before ShowDialog
        // forces the handle to exist but the window is not visible yet, so the keys went to whatever was
        // in front and the chooser sat there ignoring them.
        box.Shown += (_, _) => Win32.ForceForeground(box.Handle);
        if (box.ShowDialog() == DialogResult.OK && box.Combo.Length > 0)
        {
            hotkeyOk = true;
            UpdateTrayText();
            Note("Hide and show: " + box.Combo);
        }
    }

    static bool TryParseHotkey(string text, out uint mods, out uint vk)
    {
        mods = 0; vk = 0;
        foreach (var part in text.Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            switch (part.ToLowerInvariant())
            {
                case "ctrl": case "control": mods |= 0x2; break;
                case "alt": mods |= 0x1; break;
                case "shift": mods |= 0x4; break;
                case "win": mods |= 0x8; break;
                case "space": vk = 0x20; break;
                case "scrolllock": vk = 0x91; break;
                case "pause": vk = 0x13; break;
                case "insert": vk = 0x2D; break;
                case "delete": vk = 0x2E; break;
                case "end": vk = 0x23; break;
                case "pageup": vk = 0x21; break;
                case "pagedown": vk = 0x22; break;
                case "menu": vk = 0x5D; break;
                case var np when np.StartsWith("numpad") && np.Length == 7 && char.IsDigit(np[6]): vk = (uint)(0x60 + (np[6] - '0')); break;
                case "home": vk = 0x24; break;
                case "numlock": vk = 0x90; break;
                case "plus": case "=": case "oemplus": vk = 0xBB; break;                  // the +/= key on the main keyboard
                case "add": case "numpadadd": case "numpad+": vk = 0x6B; break;          // + on the number pad
                case var f when f.Length is 2 or 3 && f[0] == 'f' && int.TryParse(f.AsSpan(1), out var n) && n is >= 1 and <= 24: vk = (uint)(0x6F + n); break;
                case var c when c.Length == 1 && char.IsLetterOrDigit(c[0]): vk = char.ToUpperInvariant(c[0]); break;
                default: return false;
            }
        }
        // A lock or function key needs no modifier; a bare letter would swallow normal typing, so it still does.
        var standalone = vk == 0x90 || vk == 0x91 || vk == 0x13 || (vk >= 0x70 && vk <= 0x87);
        return vk != 0 && (mods != 0 || standalone);
    }

    void UpdateTrayText()
    {
        var hk = activeHotkey.Length > 0 ? activeHotkey : "no key set - right click to set one";
        showItem.Text = $"Show or hide  ({hk})";
        tray.Text = activeHotkey.Length > 0 ? $"Aang ({activeHotkey})" : "Aang";
    }

    void ToggleVisible()
    {
        if (Visible) { hiddenByUser = true; input.Close(true); Hide(); Log.Write("hidden by Joshua"); return; }
        hiddenByUser = false;
        Show(); dirty = true; Render();
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            // Screenshot tools call PrintWindow, which sends WM_PRINT. A layered window fed by
            // UpdateLayeredWindow never paints, so answer with the same pixels we push to the screen.
            case Win32.WM_PRINT:
            case Win32.WM_PRINTCLIENT:
                Win32.BitBlt(m.WParam, 0, 0, pw, ph, surface.Dc, 0, 0, Win32.SRCCOPY);
                return;
            case Win32.WM_ERASEBKGND:
                m.Result = (IntPtr)1;
                return;
            case Win32.WM_HOTKEY when (int)m.WParam == HotkeyId || (int)m.WParam == HotkeyPadId:
                if (dock != DockEdge.None) { if (peeking) Reveal(thenType: true); else Peek(); return; }   // docked: up with the box, or back down
                ToggleVisible();                        // the one global hotkey: hide or reveal Aang
                return;
            case Win32.WM_HOTKEY when (int)m.WParam == EscId:
                ExitExpanded(collapse: true);           // Esc while the bubble is expanded
                return;
        }
        base.WndProc(ref m);
    }

    // ------------------------------------------------------------------ docking to a screen edge

    DockEdge dock = DockEdge.None;
    double dockFrac = 0.5;
    bool peeking, badge;                                   // peeking: tucked at the edge with only his forehead and eyes showing
    Rectangle art = new(70, 60, 88, 150);                  // the sprite's visible pixels within its frame, measured from a real frame at start
    Point slideFrom, slideTo;
    DateTime slideStart = DateTime.MinValue, engagedAt = DateTime.UtcNow;
    const int SlideMs = 170;
    int slideMs = SlideMs;
    bool slideLinear;
    bool inputAfterSlide, greetOnArrive;
    string? dockHint;

    // Docking works the way his Rainmeter skin did (BloodWired: AangEdge.ini and Aang.lua), Joshua 2026-09-21: "the SAME
    // behaviour as rainmeter". At rest only his forehead and eyes show. Hovering the edge where he is brings him up with a
    // wave and a hello; clicking his head brings him up with the box open. He stays up, doing his idle things, and after
    // 45 seconds with nothing going on (never while a bubble is up) he spins and slides back down. The hotkey toggles him,
    // "yip yip" sends him down, and while WoW is running the edge does not wake him.
    const int RevealMs = 600, TuckMs = 700, TuckAfterMs = 45_000, IdleEveryMs = 6_000;
    bool hoverArmed = true;                                // after a tuck the mouse has to leave the edge before hovering wakes him again
    volatile bool wowRunning;
    readonly System.Windows.Forms.Timer wowTimer = new() { Interval = 1500 };
    DateTime nextIdleAt = DateTime.MaxValue, behaviourUntil = DateTime.MaxValue, travelPauseUntil;
    bool flipX;
    int travelStep;                                        // 0 none, 1 going, 2 looking around, 3 coming back
    string travelAnim = "walk";
    readonly Random rnd = new();

    Screen DockScreen() => Screen.AllScreens.FirstOrDefault(s => s.DeviceName == cfg.DockMonitor) ?? Screen.FromRectangle(Docking.OnScreen(Location, art, Extra, scale));
    /// <summary>
    /// The area he docks against. At the bottom that is the real bottom of the screen, over the taskbar, exactly as the
    /// Rainmeter skin measured it (SCREENAREAHEIGHT): tucked, 34 px of his head show at the very bottom of the screen;
    /// up, his feet are 9 px from it. Measuring from the top of the taskbar put him 40 px too high.
    /// </summary>
    Rectangle DockArea()
    {
        var sc = DockScreen(); var wa = sc.WorkingArea;
        return dock == DockEdge.Bottom ? Rectangle.FromLTRB(wa.Left, wa.Top, wa.Right, sc.Bounds.Bottom) : wa;
    }
    // claudeWorking is deliberately NOT here (2026-09-23, Joshua: "why is he poking out? i didnt want that").
    // Working is a state to SHOW, not an interruption: the glow and the icon say it without him moving.
    Point PeekPos() => Docking.PeekWindow(dock, dockFrac, DockArea(), art, Extra, scale, urgent || ambientGlow ? Docking.PeekMorePx : Docking.PeekPx);

    /// <summary>Real SFX he picked live, 2026-09-22 (see assets/aang/sfx/CREDITS.txt for source and licence),
    /// auditioned through a proper picker after System sound and a hand-synthesised square wave both turned out
    /// to be exactly the "boring, generic" he was trying to get away from.</summary>
    static readonly System.Media.SoundPlayer SfxNeedsYou = LoadSfx("needs-you.wav");
    static readonly System.Media.SoundPlayer SfxDone = LoadSfx("done.wav");
    static System.Media.SoundPlayer LoadSfx(string file)
    {
        var p = new System.Media.SoundPlayer();
        try { p.SoundLocation = Path.Combine(AppContext.BaseDirectory, "assets", "aang", "sfx", file); p.LoadAsync(); }
        catch (Exception e) { Log.Write("sfx load failed: " + e.Message); }
        return p;
    }

    /// <summary>Avatar State: something truly blocking. Docked, he peeks a little further out and glows; standing,
    /// a brief wave is all - never a full pop-out, that is what "hidden" and "asked" already cover.</summary>
    void TriggerUrgent() => TriggerGlow(Theme.AvatarGlow, SfxNeedsYou);

    /// <summary>A job he started finished on its own - its own quieter tier (2026-09-22, "aang needs to tell me
    /// its done", after ChatGPT's pet on a finished background task): the same motion as urgent, Claude's
    /// terracotta instead of Avatar State's white-blue, and its own quieter sound - he chose a distinct one
    /// (2026-09-22) rather than leaving it silent, precisely so it never gets mistaken for needs-you by ear.</summary>
    void TriggerDone() => TriggerGlow(Theme.Claude, SfxDone);

    /// <summary>Keep what he has not seen yet, unless something more pressing is already waiting: a finished job
    /// never covers up one that is stuck on him. False when it was not kept.</summary>
    bool Hold(string text, string? jobCwd, int rank, Color color, string? focus = null, string? host = null)
    {
        if (badge && rank < heldRank) return false;
        if (!badge || rank != heldRank) markerSince = DateTime.UtcNow;     // a new or different icon pops in again
        heldText = text; heldJobCwd = jobCwd; heldRank = rank; badgeColor = color; heldFocus = focus; heldHost = host; badge = true; dirty = true;
        return true;
    }
    string? heldFocus, heldHost;   // where the waiting session is: a window here ("Claude"), or "mac"

    /// <summary>Nothing left waiting: the icon, the glow (burst or ambient) and its schedule all stop together.</summary>
    void ClearBadge()
    {
        badge = false; urgent = false; ambientGlow = false; burstsFired = 0; nextBurstAt = DateTime.MaxValue;
        heldText = null; heldJobCwd = null; heldFocus = null; heldHost = null;
    }

    /// <summary>A click on the icon of a waiting Claude session takes him there (2026-09-22): Claude forward on
    /// this PC, or on the MacBook through its one-job listener. The icon goes; he stays tucked.</summary>
    bool GoToHeldSession()
    {
        if (heldHost != "mac" && heldFocus == null) return false;
        var mac = heldHost == "mac";
        ClearBadge(); dirty = true;
        if (mac) _ = link.SendAsync(new { t = "claude.front", host = "mac" });
        else Hands.Arrange("Claude", "front");
        Log.Write("icon clicked: " + (mac ? "Claude on the MacBook" : "Claude here"));
        return true;
    }

    /// <summary>The working-state icon's own click, extending GoToHeldSession's pattern to the continuous
    /// "a session is working" signal, which previously had neither half of it (2026-09-23, Joshua: "when i
    /// click the yellow chat bubble its not bringing me to the right session nor is it tell me what its
    /// working on and where"). badge already outranks this for what is drawn (DrawMarker) and so it outranks
    /// it for what a click does too - this only ever fires when there is no badge.</summary>
    bool ExplainAndGoToWorking()
    {
        if (!claudeWorking) return false;
        var mac = workingHost == "mac";
        var what = string.IsNullOrEmpty(workingWhat) ? "something" : workingWhat;
        Note(mac ? $"Working on {what}, on your MacBook." : $"Working on {what}.");
        if (mac) _ = link.SendAsync(new { t = "claude.front", host = "mac" });
        else Hands.Arrange("Claude", "front");
        Log.Write("working icon clicked: " + what + (mac ? " (MacBook)" : ""));
        return true;
    }

    void TriggerGlow(Color color, System.Media.SoundPlayer sound)
    {
        urgent = true; ambientGlow = false; urgentColor = color; burstStart = DateTime.UtcNow;
        urgentUntil = burstStart.AddSeconds(UrgentGlowFor.TotalSeconds); badge = true;
        burstsFired++;
        nextBurstAt = burstsFired < BurstBackoff.Length ? DateTime.UtcNow.Add(BurstBackoff[burstsFired]) : DateTime.MaxValue;
        if (!cfg.Muted) { try { sound.Play(); } catch (Exception e) { Log.Write("sfx play failed: " + e.Message); } }
        if (dock != DockEdge.None && peeking) { if (slideStart == DateTime.MinValue) SlideTo(PeekPos()); }
        else if (anim.State is "idle" or "think") { anim.Play("hello"); Wake(); }
        dirty = true;
    }
    Point StandPos()
    {
        var p = Docking.StandWindow(dock, dockFrac, DockArea(), art, Extra, scale);
        return dock == DockEdge.Bottom ? new Point(p.X, p.Y - (int)Math.Round(9 * scale)) : p;
    }

    void SlideTo(Point to, int ms = SlideMs, bool linear = false) { slideFrom = Location; slideTo = to; slideStart = DateTime.UtcNow; slideMs = Math.Max(1, ms); slideLinear = linear; timer.Interval = 16; dirty = true; }

    /// <summary>Advance a slide in progress: ease-out for rising and tucking, steady for walking. True if he moved.</summary>
    bool StepSlide(DateTime now)
    {
        if (slideStart == DateTime.MinValue) return false;
        var t = Math.Clamp((now - slideStart).TotalMilliseconds / slideMs, 0, 1);
        var e = slideLinear ? t : 1 - Math.Pow(1 - t, 3);
        Location = new Point((int)Math.Round(slideFrom.X + (slideTo.X - slideFrom.X) * e), (int)Math.Round(slideFrom.Y + (slideTo.Y - slideFrom.Y) * e));
        if (t >= 1) { slideStart = DateTime.MinValue; OnSlideDone(); }
        return true;
    }

    /// <summary>Where his art is on screen right now, in the log, so a test can check docking by numbers.</summary>
    void LogArt(string why)
    {
        var r = Docking.OnScreen(Location, Docking.Rotated(art, peeking ? dock : DockEdge.None), Extra, scale);
        Log.Write($"artrect {why} {r.X},{r.Y},{r.Width},{r.Height}");
    }

    void OnSlideDone()
    {
        if (travelStep != 0) { TravelNext(); return; }
        LogArt(peeking ? "peek" : "out");
        if (peeking) { flipX = false; return; }
        var now = DateTime.UtcNow;
        engagedAt = now; nextIdleAt = now.AddMilliseconds(IdleEveryMs);
        if (dockHint != null) { ShowBubble(dockHint, false); dockHint = null; }
        else if (heldText != null && !quiet) { ShowBubble(heldText, false); heldText = null; }
        else if (greetOnArrive && !inputAfterSlide) ShowBubble(Greeting(), false);
        greetOnArrive = false;
        if (inputAfterSlide) { inputAfterSlide = false; OpenInput(userAsked: true); }
    }

    static int TorontoHour()
    {
        try { return TimeZoneInfo.ConvertTime(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time")).Hour; }
        catch { return DateTime.Now.Hour; }
    }

    /// <summary>His Rainmeter hellos, by the time of day in Toronto.</summary>
    string Greeting()
    {
        var h = TorontoHour();
        string[] pool = h >= 5 && h < 11 ? new[] { "Good morning! Yip yip!", "Morning! The sky looks great today.", "Up early? Nice!" }
            : h >= 11 && h < 17 ? new[] { "Hey! What are we up to?", "Hi! Need a hand?", "Yip yip! I am here." }
            : h >= 17 && h < 22 ? new[] { "Good evening! What is up?", "Hey! Long day?", "Yip yip! Ready when you are." }
            : new[] { "Whoa, still up? Okay, what is up?", "Late night, huh? I am here.", "Shh... night mode. What do you need?" };
        return pool[rnd.Next(pool.Length)];
    }

    /// <summary>Dock at an edge. The first time, he stands out once to say how to bring him back, then tucks away by himself.</summary>
    void DockTo(DockEdge edge, double frac, Screen screen)
    {
        dock = edge; dockFrac = frac; badge = false; urgent = false; ambientGlow = false; burstsFired = 0; nextBurstAt = DateTime.MaxValue; travelStep = 0; flipX = false;
        cfg.DockEdge = Docking.Name(edge); cfg.DockFrac = frac; cfg.DockMonitor = screen.DeviceName;
        input.Close(false); ExitExpanded(collapse: false); bubble.Clear(); anim.Play("idle");
        if (!cfg.DockHinted)
        {
            cfg.DockHinted = true;
            dockHint = $"Docked. Hover the edge or click my head{(activeHotkey.Length > 0 ? $", or press {activeHotkey}," : "")} to bring me up. Say \"yip yip\" to send me back down.";
        }
        cfg.Save();
        Log.Write($"docked {edge} at {frac:0.00} on {screen.DeviceName}");
        peeking = dockHint == null;
        hoverArmed = false;                                    // the mouse is on him right now; it must leave before hovering counts
        engagedAt = DateTime.UtcNow;
        SlideTo(peeking ? PeekPos() : StandPos());
        dirty = true;
    }

    /// <summary>Bring him up: hovering the edge, clicking his head, the hotkey, a message, or a question all come here.</summary>
    void Reveal(bool thenType = false, bool greet = true)
    {
        if (dock == DockEdge.None || !peeking) { if (thenType) OpenInput(userAsked: true); return; }
        peeking = false; badge = false; urgent = false; ambientGlow = false; burstsFired = 0; nextBurstAt = DateTime.MaxValue; inputAfterSlide = thenType; greetOnArrive = greet; engagedAt = DateTime.UtcNow;
        anim.Play("hello"); Wake();
        SlideTo(StandPos(), RevealMs);
    }

    /// <summary>Back down to the edge: a spin, then a slide, leaving only his forehead and eyes.</summary>
    void Peek()
    {
        if (dock == DockEdge.None || peeking) return;
        peeking = true; travelStep = 0; flipX = false; hoverArmed = false; behaviourUntil = DateTime.MaxValue;
        if (input.Visible) input.Close(false);
        ExitExpanded(collapse: false); bubble.Clear();
        anim.Play("spin"); Wake();
        SlideTo(PeekPos(), TuckMs);
        dirty = true;
    }

    /// <summary>Leave the edge. From the tray he walks out to stand at the edge; after a drag he stays where he was dropped.</summary>
    void Undock(bool moveToStand)
    {
        if (dock == DockEdge.None) return;
        var target = moveToStand ? StandPos() : Location;
        dock = DockEdge.None; peeking = false; badge = false; urgent = false; ambientGlow = false; burstsFired = 0; nextBurstAt = DateTime.MaxValue; travelStep = 0; flipX = false; cfg.DockEdge = "";
        cfg.X = target.X; cfg.Y = target.Y; cfg.Save();
        if (moveToStand) SlideTo(target);
        Log.Write("undocked"); dirty = true;
    }

    /// <summary>
    /// After a drag: within 24 px of the left, right or top edge he docks there; the bottom only if he was already
    /// docked there (he normally stands on the taskbar, so snapping to it would tuck him away by accident). Dragged along
    /// the edge he is docked at while he is up, that is just his new spot: he stays up, as in Rainmeter.
    /// </summary>
    void AfterDrag()
    {
        var turned = peeking ? dock : DockEdge.None;
        var artRect = Docking.OnScreen(Location, Docking.Rotated(art, turned), Extra, scale);
        var screen = Screen.FromPoint(Cursor.Position);
        var edge = Docking.Nearest(artRect, screen.WorkingArea, (int)(Docking.SnapPx * scale), allowBottom: dock == DockEdge.Bottom);
        if (edge != DockEdge.None && edge == dock && !peeking)
        {
            dockFrac = Docking.Fraction(edge, artRect, screen.WorkingArea);
            cfg.DockFrac = dockFrac; cfg.DockMonitor = screen.DeviceName; cfg.Save();
            engagedAt = DateTime.UtcNow; nextIdleAt = engagedAt.AddMilliseconds(IdleEveryMs);
            SlideTo(StandPos());
            return;
        }
        if (edge != DockEdge.None) { DockTo(edge, Docking.Fraction(edge, artRect, screen.WorkingArea), screen); return; }
        if (dock != DockEdge.None) { peeking = false; badge = false; urgent = false; ambientGlow = false; burstsFired = 0; nextBurstAt = DateTime.MaxValue; dock = DockEdge.None; cfg.DockEdge = ""; }
        cfg.X = Location.X; cfg.Y = Location.Y; cfg.Save();
        _ = link.SendAsync(new { t = "moved", x = Location.X, y = Location.Y });
    }

    void DockFromTray(DockEdge e)
    {
        var artRect = Docking.OnScreen(Location, Docking.Rotated(art, peeking ? dock : DockEdge.None), Extra, scale);
        var screen = Screen.FromPoint(new Point(artRect.Left + artRect.Width / 2, artRect.Top + artRect.Height / 2));
        DockTo(e, Docking.Fraction(e, artRect, screen.WorkingArea), screen);
    }

    /// <summary>Is the mouse on him or on his bubble?</summary>
    bool OverMe() => OverMe(Cursor.Position);
    bool OverMe(Point c)
    {
        var me = Docking.OnScreen(Location, art, Extra, scale); me.Inflate((int)(14 * scale), (int)(14 * scale));
        if (me.Contains(c)) return true;
        if (!bubble.Visible) return false;
        return new Rectangle(Location.X + (int)((Margin + bubble.LeftNow) * scale), Location.Y + (int)((bubble.CurrentTop + Extra) * scale),
            (int)((BubbleView.Right - bubble.LeftNow) * scale), (int)((BubbleView.Bottom - bubble.CurrentTop) * scale)).Contains(c);
    }

    /// <summary>
    /// Where hovering wakes him while he is tucked: the part of him that shows, and a 3 px strip along the very edge of the
    /// screen beside it (the Rainmeter AangEdge strip), so a flick of the mouse to the edge is enough.
    /// </summary>
    bool InHoverZone(Point c)
    {
        var sc = DockScreen();
        var full = Docking.OnScreen(Location, Docking.Rotated(art, dock), Extra, scale);
        var head = Rectangle.Intersect(full, DockArea());
        head.Inflate(2, 2);
        if (head.Contains(c)) return true;
        var mon = sc.Bounds;
        var strip = dock switch
        {
            DockEdge.Bottom => new Rectangle(full.X, mon.Bottom - 3, full.Width, 3),
            DockEdge.Top => new Rectangle(full.X, mon.Top, full.Width, 3),
            DockEdge.Left => new Rectangle(mon.Left, full.Y, 3, full.Height),
            _ => new Rectangle(mon.Right - 3, full.Y, 3, full.Height),
        };
        return strip.Contains(c);
    }

    // A click outside him sends him back down (Joshua, 2026-09-21), like his Rainmeter click-away. A low-level mouse
    // hook sees clicks in other programs; it is installed only while he is docked and up, and it never eats a click.
    IntPtr mouseHook;
    Win32.HookProc? mouseProc;
    DateTime topmostAt;

    void SetClickAwayHook(bool on)
    {
        if (on && mouseHook == IntPtr.Zero)
        {
            mouseProc ??= MouseHook;
            mouseHook = Win32.SetWindowsHookEx(Win32.WH_MOUSE_LL, mouseProc, Win32.GetModuleHandle(null), 0);
        }
        else if (!on && mouseHook != IntPtr.Zero) { Win32.UnhookWindowsHookEx(mouseHook); mouseHook = IntPtr.Zero; }
    }

    /// <summary>Is pt over this menu or any of its open submenus, at any depth?</summary>
    static bool OverAnyMenu(ToolStripDropDown? menu, Point pt)
    {
        if (menu == null || !menu.Visible) return false;
        if (menu.Bounds.Contains(pt)) return true;
        foreach (ToolStripItem item in menu.Items)
            if (item is ToolStripMenuItem mi && mi.HasDropDownItems && OverAnyMenu(mi.DropDown, pt))
                return true;
        return false;
    }

    IntPtr MouseHook(int code, IntPtr wParam, IntPtr lParam)
    {
        try
        {
            var msg = (int)wParam;
            if (code >= 0 && (msg == Win32.WM_LBUTTONDOWN || msg == Win32.WM_RBUTTONDOWN))
            {
                var info = System.Runtime.InteropServices.Marshal.PtrToStructure<Win32.MSLLHOOKSTRUCT>(lParam);
                var pt = new Point(info.x, info.y);
                var menu = tray.ContextMenuStrip;
                // A submenu ("Window" -> Dock left/right/top/bottom) is its own popup, outside the top-level
                // menu's own Bounds - checking only menu.Bounds meant every click on a submenu item read as a
                // click AWAY and closed the whole tree via BeginInvoke before the Click event ever fired. That
                // was the real bug behind "the dock items don't work" - Joshua, 2026-09-22. Walk every open
                // submenu, not just the top level.
                var overMenu = OverAnyMenu(menu, pt);
                if (menu != null && menu.Visible && !overMenu) BeginInvoke(() => menu.Close());
                var inside = OverMe(pt) || (input.Visible && input.Bounds.Contains(pt)) || overMenu;
                if (!inside) BeginInvoke(ClickedAway);
            }
        }
        catch { /* the hook must never break the mouse */ }
        return Win32.CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    void ClickedAway()
    {
        if (dock == DockEdge.None || peeking || working || dragging || permissionId != null || consentText != null) return;
        Peek();
    }

    void WatchDock(DateTime now)
    {
        // The glow settles after a few seconds; the marker itself (badge, heldText) stays until he clicks it.
        if (urgent && now >= urgentUntil)
        {
            // The burst is over, but he asked not to lose the glow until he acts on it (2026-09-22): a quiet
            // ambient pulse takes over, and he stays peeked out further, not back to the plain 34px forehead.
            urgent = false; ambientGlow = badge;
            if (dock != DockEdge.None && peeking && slideStart == DateTime.MinValue) SlideTo(PeekPos());
            dirty = true;
        }
        // A few real, abrupt bursts beat one that never stops (research, 2026-09-22): continuous motion is the one
        // pattern proven not to capture attention and to habituate fastest. Re-fire on a backoff until he acts.
        if (badge && heldRank >= 2 && !urgent && now >= nextBurstAt) TriggerGlow(badgeColor, heldRank == 3 ? SfxNeedsYou : SfxDone);
        SetClickAwayHook((dock != DockEdge.None && !peeking) || (tray.ContextMenuStrip?.Visible ?? false));
        if (dock == DockEdge.None) return;
        // The taskbar is always-on-top too, and clicking it lifts it over him; at the bottom he takes the top back each second.
        if (dock == DockEdge.Bottom && (now - topmostAt).TotalMilliseconds > 1000)
        {
            topmostAt = now;
            Win32.SetWindowPos(Handle, Win32.HWND_TOPMOST, 0, 0, 0, 0, Win32.SWP_NOMOVE | Win32.SWP_NOSIZE | Win32.SWP_NOACTIVATE);
        }
        if (peeking)
        {
            if (slideStart != DateTime.MinValue || dragging) return;
            if (!InHoverZone(Cursor.Position)) { hoverArmed = true; return; }
            if (hoverArmed && !wowRunning) Reveal();
            return;
        }
        if (slideStart != DateTime.MinValue && travelStep == 0) return;
        var engaged = input.Visible || working || bubble.Visible || bubble.Expanded || dragging || thumbDrag || permissionId != null || consentText != null || OverMe();
        if (engaged)
        {
            engagedAt = now;
            if (travelStep == 0) nextIdleAt = now.AddMilliseconds(IdleEveryMs);
            if (behaviourUntil != DateTime.MaxValue) { behaviourUntil = DateTime.MaxValue; if (anim.State == "nap") { anim.Play("idle"); dirty = true; } }
        }
        if (travelStep == 2 && now >= travelPauseUntil) TravelNext();
        if (behaviourUntil != DateTime.MaxValue && now >= behaviourUntil) { behaviourUntil = DateTime.MaxValue; anim.Play("idle"); nextIdleAt = now.AddMilliseconds(IdleEveryMs); dirty = true; }
        if (engaged || travelStep != 0) return;
        if ((now - engagedAt).TotalMilliseconds > TuckAfterMs) { Peek(); return; }
        if (now >= nextIdleAt && anim.State == "idle" && behaviourUntil == DateTime.MaxValue && !quiet) StartBehaviour(now);
    }

    /// <summary>What he does on his own while he is up, with Rainmeter's odds: look, spin, scooter, walk, a nap late at night, or nothing.</summary>
    void StartBehaviour(DateTime now)
    {
        var h = TorontoHour();
        var night = h >= 23 || h < 6;
        var opts = new (string n, int w)[] { ("look", 3), ("spin", 2), ("scooter", 3), ("walk", 2), ("nap", night ? 7 : 0), ("idle", 2) };
        var r = rnd.Next(1, opts.Sum(o => o.w) + 1); var pick = "idle";
        foreach (var o in opts) { r -= o.w; if (r <= 0) { pick = o.n; break; } }
        nextIdleAt = now.AddMilliseconds(IdleEveryMs);
        if (pick is "walk" or "scooter") { if (!StartTravel(pick)) anim.Play("look"); }
        else if (pick == "nap") { anim.Play("nap"); behaviourUntil = now.AddSeconds(9); }
        else if (pick != "idle") anim.Play(pick);
        dirty = true;
    }

    /// <summary>A little trip along the bottom edge and back home, as in Rainmeter (only at the bottom: elsewhere he would walk off his edge).</summary>
    bool StartTravel(string how)
    {
        if (dock != DockEdge.Bottom) return false;
        var home = StandPos(); var wa = DockScreen().WorkingArea;
        var lo = Math.Max(wa.Left + (int)(20 * scale) - (int)((Docking.WinSpriteX + art.X) * scale), home.X - (int)(240 * scale));
        if (home.X - lo < (int)(80 * scale)) return false;
        var tx = rnd.Next(lo, home.X - (int)(60 * scale));
        var speed = (how == "scooter" ? 60 : 30) * scale;                                   // px per second, Rainmeter's pace
        travelAnim = how; travelStep = 1; flipX = tx < Location.X; anim.Play(how);
        SlideTo(new Point(tx, home.Y), (int)Math.Max(800, Math.Abs(tx - Location.X) / speed * 1000), linear: true);
        return true;
    }

    void TravelNext()
    {
        if (travelStep == 1) { travelStep = 2; flipX = false; anim.Play("look"); travelPauseUntil = DateTime.UtcNow.AddMilliseconds(1400); dirty = true; return; }
        if (travelStep == 2)
        {
            var home = StandPos();
            travelStep = 3; flipX = home.X < Location.X; anim.Play(travelAnim);
            SlideTo(home, (int)Math.Max(800, Math.Abs(home.X - Location.X) / (120 * scale) * 1000), linear: true);
            return;
        }
        travelStep = 0; flipX = false; anim.Play("idle"); nextIdleAt = DateTime.UtcNow.AddMilliseconds(IdleEveryMs); dirty = true;
    }

    /// <summary>What is drawn while he is tucked at the edge: only him, turned to face the screen, an outline while
    /// something has just come in, and an icon over his head while it waits.</summary>
    /// <summary>Every think frame's own baked-in "..." dots, verified by pixel analysis to occupy exactly this box
    /// in frame-local space (224x224) and nothing else, in every one of the 118 sprite frames - so clearing it is
    /// always safe, not just while thinking. Docked/peeking gets its own thinking state (the yellow marker below,
    /// now animated to the same rhythm) rather than the sprite's built-in ones, which read as a second, competing
    /// set once his head is this small (2026-09-23/24). The locked source sprite is never touched: this clears a
    /// CLONE, made fresh every draw.</summary>
    static readonly Rectangle ThinkDotsBox = new(148, 48, 30, 10);

    void DrawPeeking(Graphics g)
    {
        using var rot = (Bitmap)sprites.Frame(anim.State, anim.Frame).Clone();
        using (var cg = Graphics.FromImage(rot))
        {
            cg.CompositingMode = CompositingMode.SourceCopy;               // overwrite alpha, not blend onto it
            using var clear = new SolidBrush(Color.Transparent);
            cg.FillRectangle(clear, ThinkDotsBox);
        }
        rot.RotateFlip(Docking.Rotation(dock));                           // an exact turn: pixels move, none change
        var at = new Rectangle(Docking.SpriteX, Docking.SpriteY, Docking.Frame, Docking.Frame);
        if (urgent) DrawOutline(g, rot, at, loom: true);
        else if (ambientGlow) DrawOutline(g, rot, at, loom: false);
        g.DrawImage(rot, at);
        // Exactly what the undocked view does, nothing invented for here: the glow rides on the think state,
        // which a working session now puts him in. Turned with the frame so it lands on his real arrow and
        // eyes at any edge. Not the silhouette outline (that already means "something unread is waiting"),
        // and no peeking further out, which he explicitly did not want.
        if (anim.State == "think") DrawThinkGlow(g, Docking.Rotation(dock));
        if (badge || claudeWorking) DrawMarker(g);
    }


    /// <summary>The moment something comes in: a pulsing outline in its tier's colour, traced from his own
    /// silhouette so it hugs him exactly. It sits outside his pixels, so none of them change (the sprite lock).
    /// Joshua, 2026-09-22, after seeing the soft glow disappear behind him in a real capture.</summary>
    /// <summary>Offsets that stamp a sprite's own silhouette into an outline of about radius <paramref name="r"/>
    /// hugging its real pixel edges, not a generic circle around its box.</summary>
    static Point[] RingOffsets(float r)
    {
        var set = new HashSet<(int, int)>();
        int n = Math.Max(12, (int)(r * 6));
        for (int i = 0; i < n; i++)
        {
            double a = i * 2 * Math.PI / n;
            set.Add(((int)Math.Round(r * Math.Cos(a)), (int)Math.Round(r * Math.Sin(a))));
        }
        return set.Select(p => new Point(p.Item1, p.Item2)).ToArray();
    }

    /// <summary>Two moods, from what actually captures peripheral attention versus what merely marks a wait
    /// (research, 2026-09-22). A BURST (loom=true) is an abrupt, non-smooth event: it snaps larger in ~150ms
    /// (motion onset and looming both capture attention; smooth continuous motion does neither and habituates
    /// fastest), hard-flickers near 9Hz for ~650ms (the periphery's fastest comfortably visible rate), then holds
    /// steady and bright - no more motion after that, on purpose. Ambient is small, slow and quiet: present, not
    /// attention-seeking, exactly because he asked the glow never fully disappear while something waits.</summary>
    void DrawOutline(Graphics g, Bitmap sprite, Rectangle at, bool loom)
    {
        var c = urgentColor;
        float radius; int alpha;
        if (loom)
        {
            double t = (DateTime.UtcNow - burstStart).TotalMilliseconds;
            float snap = t < 150 ? EaseOutBack((float)(t / 150.0)) : t < 320 ? 1f - (float)((t - 150) / 170.0) : 0f;
            radius = 3f + 6f * Math.Clamp(snap, 0f, 1f);
            alpha = t < 650 ? (((int)(t / 56) % 2) == 0 ? 245 : 70) : 235;   // ~9Hz hard on/off, then steady
        }
        else
        {
            double phase = (Math.Sin(DateTime.UtcNow.TimeOfDay.TotalSeconds * Math.PI * 0.5) + 1) / 2;   // slow, ~4s
            radius = 3f; alpha = (int)(95 + 90 * phase);   // 45-100 read as a grey smudge against a dark desktop; brighter now
        }
        using var solid = new Bitmap(sprite.Width, sprite.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var sg = Graphics.FromImage(solid))
        using (var flat = new System.Drawing.Imaging.ImageAttributes())
        {
            flat.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix(new[]
            {
                new float[] { 0, 0, 0, 0, 0 }, new float[] { 0, 0, 0, 0, 0 }, new float[] { 0, 0, 0, 0, 0 },
                new float[] { 0, 0, 0, 1, 0 }, new float[] { c.R / 255f, c.G / 255f, c.B / 255f, 0, 1 },
            }));
            sg.DrawImage(sprite, new Rectangle(0, 0, sprite.Width, sprite.Height), 0, 0, sprite.Width, sprite.Height, GraphicsUnit.Pixel, flat);
        }
        int pad = (int)Math.Ceiling(radius) + 2;
        using var ring = new Bitmap(sprite.Width + pad * 2, sprite.Height + pad * 2, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var rg = Graphics.FromImage(ring)) foreach (var o in RingOffsets(radius)) rg.DrawImageUnscaled(solid, pad + o.X, pad + o.Y);
        using var fade = new System.Drawing.Imaging.ImageAttributes();
        fade.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix { Matrix33 = alpha / 255f });
        g.DrawImage(ring, new Rectangle(at.X - pad, at.Y - pad, ring.Width, ring.Height), 0, 0, ring.Width, ring.Height, GraphicsUnit.Pixel, fade);
    }

    // Pixel icons on his own grain (one art pixel = 2 frame pixels), in the tradition he named (2026-09-22): a WoW
    // quest mark, Stardew's bubble over a head, an N64 HUD icon. O outline, H catch-light, F face, S shade, . clear.
    static readonly string[] IconNeeds =
    {
        ".OOOOO.", "OHHFFSO", "OHFFFSO", "OHFFFSO", "OHFFFSO", ".OHFSO.", ".OHFSO.", ".OHFSO.",
        ".OFFSO.", "..OSO..", "..OOO..", ".......", ".OOOOO.", "OHFFFSO", "OFFFSSO", ".OOOOO.",
    };
    static readonly string[] IconDoneQ =
    {
        "...OOOOO...", "..OHHFFSO..", ".OHFOOOFSO.", ".OHO...OFSO", "..O....OFSO", "......OFFSO", ".....OFFSO.", "....OFFSO..",
        "....OFSO...", "....OFSO...", "....OOOO...", "...........", "....OOOO...", "...OHFFSO..", "...OFFSSO..", "....OOOO...",
    };
    static readonly string[] IconDoneTick =
    {
        "........O.", ".......OHO", "......OHFO", ".OO..OHFO.", "OHFO.OHFO.", "OHFOOHFO..", ".OFFFFO...", "..OOOO....",
    };
    static readonly string[] IconNews =
    {
        "..OOOOOOOOO..", ".OHHHHHFFFSO.", "OHFFFFFFFFFSO", "OHFOFFOFFOFSO", "OHFFFFFFFFFSO", ".OFFFFFFFFSO.", "..OOOFSOOOO..", "....OSO......", "....OO.......",
    };
    /// <summary>IconNews with its "..." row (row 3) empty, so the working icon can type the same three
    /// hand-pixelled dots in one at a time instead of always showing all three (2026-09-24: "animate the
    /// yellow bubble's dots typewriter-style"). Row 3 otherwise matches rows 2/4 exactly.</summary>
    static readonly string[] IconNewsEmpty =
    {
        "..OOOOOOOOO..", ".OHHHHHFFFSO.", "OHFFFFFFFFFSO", "OHFFFFFFFFFSO", "OHFFFFFFFFFSO", ".OFFFFFFFFSO.", "..OOOFSOOOO..", "....OSO......", "....OO.......",
    };
    /// <summary>0 to 3 of IconNews's own dot positions (indices 3, 6, 9 of row 3), so this is exactly IconNews's
    /// existing art, just phased in - no new dot shape was designed. dots=3 reproduces IconNews's row exactly.</summary>
    static string[] IconNewsWithDots(int dots)
    {
        var row = IconNewsEmpty[3].ToCharArray();
        if (dots >= 1) row[3] = 'O';
        if (dots >= 2) row[6] = 'O';
        if (dots >= 3) row[9] = 'O';
        var copy = (string[])IconNewsEmpty.Clone();
        copy[3] = new string(row);
        return copy;
    }
    /// <summary>Preview flags for choosing the look: --done-icon=q|tick, --icons-gold.</summary>
    string doneIcon = "tick";
    bool iconsGold;
    DateTime markerSince = DateTime.MinValue;
    const double PopMs = 320, BobPeriodS = 1.4;

    /// <summary>What is waiting, over his head (towards the middle of the screen, whichever edge he is on), until he
    /// clicks it. Pops in with an overshoot, then bobs gently, the way a quest mark does, so it feels like a thing
    /// in the world rather than a notification dot. A shape per kind, so they are told apart in any scene.</summary>
    void DrawMarker(Graphics g)
    {
        // Real news outranks "a session is working" - his call, 2026-09-23 - and badge/heldRank already carries
        // that. With nothing held, this is the working state on its own: the gold news bubble he already knows,
        // said in gold explicitly so a colour left behind by the last notification cannot leak into it.
        var working = claudeWorking && !badge;
        // Typed in over 9 of the think frames (3 each), holds full for the last 3, then the loop resets it to
        // empty - the sprite's own 8fps/12-frame think cycle IS the clock, not a separate timer, so it can
        // never drift out of step with the glow/wind the sprite already carries (2026-09-24).
        var map = working ? IconNewsWithDots(Math.Clamp(anim.Frame / 3, 0, 3))
            : heldRank switch { 3 => IconNeeds, 2 => doneIcon == "q" ? IconDoneQ : IconDoneTick, _ => IconNews };
        var color = iconsGold || working ? Theme.Gold : badgeColor;
        const float px = IconPx;
        var r = Docking.Rotated(art, dock);
        float cx = Docking.SpriteX + r.X + r.Width / 2f, cy = Docking.SpriteY + r.Y + r.Height / 2f;
        float half = map.Length * px / 2f + 14f, halfW = map[0].Length * px / 2f + 14f;   // clear air between it and his head
        var dir = dock switch { DockEdge.Bottom => new PointF(0, -1), DockEdge.Top => new PointF(0, 1), DockEdge.Right => new PointF(-1, 0), _ => new PointF(1, 0) };
        var p = dock switch
        {
            DockEdge.Bottom => new PointF(cx, Docking.SpriteY + r.Y - half),
            DockEdge.Top => new PointF(cx, Docking.SpriteY + r.Bottom + half),
            DockEdge.Right => new PointF(Docking.SpriteX + r.X - halfW, cy),
            _ => new PointF(Docking.SpriteX + r.Right + halfW, cy),
        };
        var t = (DateTime.UtcNow - markerSince).TotalMilliseconds;
        float pop = t >= PopMs ? 1f : EaseOutBack((float)(t / PopMs));
        float bob = (float)((Math.Sin(DateTime.UtcNow.TimeOfDay.TotalSeconds * 2 * Math.PI / BobPeriodS) + 1) / 2 * 2 * px);
        p = new PointF(p.X + dir.X * bob, p.Y + dir.Y * bob);
        PixelIcon.Draw(g, map, p, color, IconPx, Math.Max(0.05f, pop));
    }

    static float EaseOutBack(float t) { const float c1 = 1.9f, c3 = c1 + 1; var u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }

    /// <summary>One icon pixel = one of his art pixels (2 frame pixels). 1.5x was tried and he found it too large
    /// (2026-09-22); his own grain is the size he chose.</summary>
    const float IconPx = 2.4f;   // "slightly bigger" than his own art pixel (2026-09-22); 3f had been too large

    // ------------------------------------------------------------------ tray

    void BuildTray()
    {
        var menu = new ContextMenuStrip();
        showItem = new ToolStripMenuItem("Show or hide");
        var show = showItem;
        show.Click += (_, _) => ToggleVisible();
        var hotkeyItem = new ToolStripMenuItem("Set the hide and show key...");
        hotkeyItem.Click += (_, _) => AskForHotkey();
        var panelItem = new ToolStripMenuItem("Panel...");
        panelItem.Click += (_, _) => OpenPanel();
        var talk = new ToolStripMenuItem("Talk to Aang");
        talk.Click += (_, _) => OpenInput(userAsked: true);
        // Scrolling up over him opens this too, but a wheel gesture is not discoverable, and he should not
        // have to say something to Aang just to have a bubble to scroll.
        var conversation = new ToolStripMenuItem("Conversation");
        conversation.Click += (_, _) => { Wake(); if (bubble.OpenConversation()) { dirty = true; FillStackFromMemory(); } };
        // Parity with Discord's command deck (2026-09-22): job hunt, permissions and activity were only ever
        // one tap away on the phone. Permissions and Activity already have a real, fuller view in the Panel
        // (its "What I may do" / "What I did" tabs) - these just jump straight to it instead of building a
        // second, thinner copy of the same list here.
        var jobHuntItem = new ToolStripMenuItem("Job hunt now");
        jobHuntItem.Click += (_, _) => { Note("Starting the job hunt..."); _ = link.SendAsync(new { t = "job.hunt" }); };
        var permsItem = new ToolStripMenuItem("Permissions...");
        permsItem.Click += (_, _) => { panelTab = 1; OpenPanel(); };
        var activityItem = new ToolStripMenuItem("Activity...");
        activityItem.Click += (_, _) => { panelTab = 2; OpenPanel(); };
        var hushMenu = new ToolStripMenuItem("Hush");
        foreach (var (label, mins) in new (string, int)[] { ("15 minutes", 15), ("1 hour", 60), ("4 hours", 240), ("Until I turn it off", 24 * 60) })
        {
            var item = new ToolStripMenuItem(label);
            item.Click += (_, _) => _ = link.SendAsync(new { t = "hush", minutes = mins });
            hushMenu.DropDownItems.Add(item);
        }
        var unhushItem = new ToolStripMenuItem("End hush now");
        unhushItem.Click += (_, _) => _ = link.SendAsync(new { t = "hush", minutes = 0 });
        hushMenu.DropDownItems.Add(new ToolStripSeparator());
        hushMenu.DropDownItems.Add(unhushItem);
        // Docking: tuck him against an edge with only his head showing. Dragging him within 24 px of the left, right or
        // top edge does the same; the bottom is here because he normally stands there.
        // Flat, not a "Dock to an edge" flyout (2026-09-22, Joshua: hover was iffy, the click didn't always
        // take) - a third level of nested owner-drawn popup was the likely cause (the dock geometry itself
        // passes its full self-test, --selftest-dock, unchanged). One click fewer either way.
        var dockItems = new ToolStripMenuItem[4];
        for (int i = 0; i < 4; i++)
        {
            var edge = new[] { DockEdge.Left, DockEdge.Right, DockEdge.Top, DockEdge.Bottom }[i];
            var item = new ToolStripMenuItem("Dock " + edge.ToString().ToLowerInvariant()) { Tag = edge };
            item.Click += (_, _) => DockFromTray(edge);
            dockItems[i] = item;
        }
        var comeBack = new ToolStripMenuItem("Come back (undock)");
        comeBack.Click += (_, _) => Undock(moveToStand: true);
        menu.Opening += (_, _) => comeBack.Enabled = dock != DockEdge.None;
        quietItem = new ToolStripMenuItem("Quiet mode: auto");
        quietItem.Click += (_, _) => { forcedQuiet = forcedQuiet switch { null => true, true => false, false => null }; ApplyQuiet(); };
        seeWindowItem = new ToolStripMenuItem("Let him see which app I'm in") { Checked = cfg.SeeActiveWindow };
        seeWindowItem.Click += (_, _) =>
        {
            cfg.SeeActiveWindow = !cfg.SeeActiveWindow; cfg.Save();
            seeWindowItem.Checked = cfg.SeeActiveWindow;
            sentWindow = ""; windowSentAt = DateTime.MinValue;
            PollForeground();
            Note(cfg.SeeActiveWindow ? "I can see which app you're in." : "I can't see which app you're in now.");
        };
        muteItem = new ToolStripMenuItem("Mute (nothing unprompted)") { Checked = cfg.Muted };
        muteItem.Click += (_, _) => SetMuted(!cfg.Muted);
        var quit = new ToolStripMenuItem("Quit Aang");
        quit.Click += (_, _) => { tray.Visible = false; Application.Exit(); };
        var modelMenu = new ToolStripMenuItem("Model");
        foreach (var md in ModelChip.Modes)
        {
            var item = new ToolStripMenuItem(ModelChip.Describe(md)) { Tag = md };
            item.Click += (_, _) => SetMode(md);
            modelMenu.DropDownItems.Add(item);
        }
        modelItems = modelMenu;
        var savingItem = new ToolStripMenuItem("Save quota");
        savingItem.Click += (_, _) => SetSaving(!saving);
        modelMenu.DropDownOpening += (_, _) => { UpdateModeMenu(); savingItem.Checked = saving; };
        coreItem = new ToolStripMenuItem("Core: starting") { Enabled = false };
        autostartItem = new ToolStripMenuItem("Start with Windows");
        autostartItem.Click += (_, _) => Autostart.Set(!Autostart.IsOn());
        menu.Opening += (_, _) => autostartItem.Checked = Autostart.IsOn();
        // Three groups, carved-plaque headers (GoldMenu 2026-09-22): Window (how he sits on screen), Aang (his
        // behaviour and quota), Settings (the machine). Talk to Aang, Panel and Quit are common enough to stay
        // on the main menu; everything else moved one click deeper so the main list reads at a glance.
        var windowMenu = GoldMenu.Header("Window");
        windowMenu.DropDownItems.Add(show);
        windowMenu.DropDownItems.AddRange(dockItems);
        windowMenu.DropDownItems.AddRange(new ToolStripItem[] { comeBack, hotkeyItem });
        // Aang: what he does and what you check on him. Settings: everything about how he behaves (2026-09-22,
        // Joshua: "job hunt permissions and activity belong in aang everything else is a setting").
        var aangMenu = GoldMenu.Header("Aang");
        aangMenu.DropDownItems.AddRange(new ToolStripItem[] { jobHuntItem, permsItem, activityItem });
        var settingsMenu = GoldMenu.Header("Settings");
        settingsMenu.DropDownItems.AddRange(new ToolStripItem[] { hushMenu, modelMenu, savingItem, quietItem, seeWindowItem, muteItem, autostartItem, coreItem });
        menu.Items.AddRange(new ToolStripItem[] { talk, conversation, panelItem, new ToolStripSeparator(), windowMenu, aangMenu, settingsMenu, new ToolStripSeparator(), quit });
        GoldMenu.Apply(menu);
        tray.ContextMenuStrip = menu;
        tray.Text = "Aang";
        tray.Icon = MakeIcon();
        tray.Visible = true;
        tray.DoubleClick += (_, _) => ToggleVisible();
    }

    /// <summary>Master mute. Nothing unprompted gets through; anything held is delivered when it is turned off.</summary>
    void SetMuted(bool on)
    {
        cfg.Muted = on; cfg.Save();
        muteItem.Checked = on;
        _ = link.SendAsync(new { t = "mute", on });
        Note(on ? "Muted. Nothing unprompted." : "Unmuted.");
    }

    void UpdateModeMenu()
    {
        foreach (ToolStripMenuItem i in modelItems.DropDownItems) i.Checked = (string?)i.Tag == mode;
    }

    void UpdateQuietMenu() =>
        quietItem.Text = "Quiet mode: " + (forcedQuiet switch { null => "auto (quiet while WoW has focus)", true => "always", false => "never" });

    Icon MakeIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.DrawImage(sprites.Frame("idle", 0), new Rectangle(0, 0, 32, 32));
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        Log.Write($"closing: reason={e.CloseReason}");
        timer.Stop(); fgTimer.Stop(); ackTimer.Stop(); awayTimer.Stop();
        if (hotkeyOk) Win32.UnregisterHotKey(Handle, HotkeyId);
        Win32.UnregisterHotKey(Handle, HotkeyPadId);
        SetClickAwayHook(false);
        if (escRegistered) Win32.UnregisterHotKey(Handle, EscId);
        input.Dispose();
        // Ask the Core to stop before killing it.
        //
        // Until now this went straight to Dispose, which hard-kills the whole process tree, so the Core's
        // own cleanup - answering pending permission questions, closing the database properly - almost never
        // ran. Windows cannot send a real SIGTERM from .NET, so the request goes over the socket the Body
        // already holds. Three seconds is long enough for a Core that is listening and short enough that a
        // wedged one does not keep the window open; Dispose still kills it either way.
        if (supervisor != null)
        {
            try { link.SendAsync(new { t = "shutdown" }).Wait(500); } catch { /* socket already gone */ }
            if (!supervisor.WaitForExit(TimeSpan.FromSeconds(3))) Log.Write("core did not stop when asked; killing it");
        }
        supervisor?.Dispose();
        tray.Visible = false; tray.Dispose();
        link.Dispose();
        base.OnFormClosing(e);
    }
}


