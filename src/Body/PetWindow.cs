using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text.Json;

namespace Aang.Body;

/// <summary>
/// The always-on pet window: a per-pixel-alpha layered window that draws pre-rendered sprite frames and
/// the speech bubble on the CPU. It never takes focus, passes clicks through transparent pixels (Windows
/// does that itself), goes quiet while WoW has focus, and keeps working when the Core is not running.
/// </summary>
sealed class PetWindow : Form
{
    public const int W = 470, H = 310, Extra = 110;   // Extra: room above the old window so a bubble can grow to 12 lines
    const int HotkeyId = 0xA46, EscId = 0xA47;
    static readonly TimeSpan WakeFor = TimeSpan.FromSeconds(4);

    readonly Config cfg = Config.Load();
    readonly float scale;
    readonly int pw, ph;
    readonly LayeredSurface surface;
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
    ToolStripMenuItem quietItem = null!, showItem = null!, modelItems = null!;

    string? heldText;               // latest proactive message waiting for quiet mode to end
    string foreground = "";
    bool dirty = true, quiet, autoQuiet, dragging, moved, hotkeyOk, bubbleWasVisible, wasAnimating = true;
    bool? forcedQuiet;
    DateTime wakeUntil = DateTime.MinValue;
    Point dragStart, startLoc;
    int tick;

    readonly InputWindow input;
    readonly InputHistory history = new(Paths.File("input-history.json"));
    readonly System.Windows.Forms.Timer ackTimer = new() { Interval = 4000 };
    readonly System.Windows.Forms.Timer awayTimer = new() { Interval = 30 };
    string? currentId;
    bool working, acked, escRegistered, thumbDrag, mouseWasDown;
    int idCounter;

    // model chip + quota + consent
    string mode = "auto";
    bool saving, hasQuota;
    double weekUse, fiveUse;
    string level = "ok";
    string? lastText, consentText, replyId;
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
            if (cfg.Y is int oldY) cfg.Y = oldY - (int)Math.Round(Extra * scale);
            cfg.LayoutVersion = 2; cfg.Save();
        }
        if (cfg.LayoutVersion < 3) { cfg.Hotkey = "Ctrl+NumLock"; cfg.LayoutVersion = 3; cfg.Save(); }
        Location = cfg is { X: not null, Y: not null } ? Clamp(new Point(cfg.X.Value, cfg.Y.Value)) : DefaultPos();

        // Test/diagnostic flag: --quiet=never or --quiet=always overrides the WoW-focus detection.
        foreach (var a in args)
        {
            if (a.Equals("--quiet=never", StringComparison.OrdinalIgnoreCase)) forcedQuiet = false;
            else if (a.Equals("--quiet=always", StringComparison.OrdinalIgnoreCase)) forcedQuiet = true;
            else if (a.Equals("--no-core", StringComparison.OrdinalIgnoreCase)) noCore = true;   // tests: do not start the Core or touch autostart
        }

        sprites = new SpriteBank(Path.Combine(AppContext.BaseDirectory, "assets", "aang", "frames"));
        if (!sprites.HasAssets) throw new FileNotFoundException("Sprite frames are missing next to the executable.");
        surface = new LayeredSurface(pw, ph);

        link.Message += m => { if (IsHandleCreated) BeginInvoke(() => OnCore(m)); };
        timer.Tick += (_, _) => Tick();
        fgTimer.Tick += (_, _) => PollForeground();
        ackTimer.Tick += (_, _) => AckTimeout();
        awayTimer.Tick += (_, _) => WatchForClickAway();

        input = new InputWindow(scale, history);
        input.Submitted += Submit;
        input.StopRequested += StopReply;
        mode = ModelChip.Normalize(cfg.Mode); saving = cfg.Saving;
        input.ModeChosen += m => SetMode(m == "next" ? ModelChip.Next(mode) : m);
        input.SavingToggled += () => SetSaving(!saving);
        input.SetUsageShown(cfg.ShowUsage);
        input.UsageShownChanged += on => { cfg.ShowUsage = on; cfg.Save(); };
        input.ConsentAccepted += AllowOnce;
        input.ConsentDeclined += DeclineConsent;
        link.ConnectionChanged += up => { if (up && saving) _ = link.SendAsync(new { t = "saving", on = true }); };
        PushStatus();
        input.PageRequested += d => { if (d > 0 && bubble.More) ExpandBubble(); else if (bubble.Scroll(d * 6)) dirty = true; };
        BuildTray();
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
        link.Start();
        if (!noCore)
        {
            if (!cfg.AutostartAsked) { Autostart.Set(true); cfg.AutostartAsked = true; cfg.Save(); }   // first run: start with Windows
            supervisor = new CoreSupervisor(47831, cfg.CoreDir, cfg.NodePath);
            supervisor.StatusChanged += st => { if (IsHandleCreated) BeginInvoke(() => coreItem.Text = "Core: " + st); };
            supervisor.Start();
        }
        hotkeyOk = RegisterHotkey();
        UpdateTrayText();
        anim.Play("hello");
        Log.Write($"shown at {Location} {pw}x{ph} scale {scale:0.00}");
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
                    var text = Str(m, "text") ?? "";
                    if (Bool(m, "proactive") && quiet) { heldText = text; break; }
                    Wake();
                    ExitExpanded(collapse: false);
                    ShowBubble(text, Bool(m, "stream"));
                    if (!Bool(m, "stream") && !Bool(m, "proactive") && Str(m, "id") is { Length: > 0 } rid) { replyId = rid; bubble.Tools = true; bubble.Rating = 0; }
                    if (!Bool(m, "stream")) { working = false; input.Working = false; ackTimer.Stop(); }
                    break;
                case "bubble.dots":
                    Wake(); bubble.ShowDots(); anim.Play("think"); dirty = true;
                    break;
                case "bubble.clear":
                    ExitExpanded(collapse: false);
                    bubble.Clear(); dirty = true;
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
                case "quota":
                    hasQuota = true;
                    weekUse = Num(m, "week"); fiveUse = Num(m, "five");
                    level = Str(m, "level") ?? ModelChip.LevelFor(weekUse, saving);
                    saving = level == "saving";
                    if (cfg.Saving != saving) { cfg.Saving = saving; cfg.Save(); }
                    PushStatus();
                    break;
                case "quiet":
                    forcedQuiet = Bool(m, "on"); ApplyQuiet();
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
        var wow = cfg.QuietProcessPrefixes.Any(p => foreground.StartsWith(p, StringComparison.OrdinalIgnoreCase));
        if (wow != autoQuiet) { autoQuiet = wow; ApplyQuiet(); }
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
        anim.Play("idle");
        if (!quiet && heldText != null) { ShowBubble(heldText, false); heldText = null; }
        dirty = true;
        _ = link.SendAsync(new { t = "presence", quiet, foreground });
    }

    // ------------------------------------------------------------------ frame loop

    void Tick()
    {
        try
        {
            var now = DateTime.UtcNow;
            tick++;
            var changed = bubble.Update(now);

            if (bubbleWasVisible && !bubble.Visible)
            {
                bubbleWasVisible = false;
                if (anim.State == "talk") { anim.Play("idle"); changed = true; }
            }
            if (bubble.Visible) bubbleWasVisible = true;

            // Quiet mode freezes the idle loop; anything Joshua triggers (a reply, a poke) wakes it briefly.
            var animate = !quiet || bubble.Visible || now < wakeUntil;
            if (animate)
            {
                if (anim.Tick(now, sprites.Count(anim.State), out var finished)) changed = true;
                if (finished) { anim.Play(bubble.Visible && !bubble.Dots ? "talk" : "idle"); changed = true; }
                wasAnimating = true;
            }
            else if (wasAnimating)
            {
                wasAnimating = false;
                anim.Play("idle");
                changed = true;
            }

            if (changed || dirty) Render();
            timer.Interval = bubble.Animating ? 33 : (!animate ? (bubble.More ? 250 : 250) : Math.Clamp(anim.FrameMs, 33, 200));
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
            g.TranslateTransform(0, Extra);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;

            bubble.Draw(g, tick);
            g.DrawImage(sprites.Frame(anim.State, anim.Frame), new Rectangle(246, 86, 224, 224));

            surface.Present(Handle, Location);
            dirty = false;
        }
        catch (Exception e) { Log.Write("render failed: " + e); }
    }

    // ------------------------------------------------------------------ mouse

    /// <summary>Window pixels to bubble coordinates (unscaled, minus the headroom above the old window).</summary>
    PointF BubblePoint(Point p) => new(p.X / scale, p.Y / scale - Extra);

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
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

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        if (bubble.Expanded && bubble.Scroll(e.Delta > 0 ? -2 : 2)) dirty = true;
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (thumbDrag) { thumbDrag = false; Capture = false; return; }
        if (!dragging) return;
        dragging = false; Capture = false;
        if (moved)
        {
            cfg.X = Location.X; cfg.Y = Location.Y; cfg.Save();
            _ = link.SendAsync(new { t = "moved", x = Location.X, y = Location.Y });
            return;
        }

        var bp = BubblePoint(e.Location);
        var tool = bubble.HitTool(bp.X, bp.Y);
        if (tool >= 0) { UseTool(tool); dirty = true; return; }
        if (bubble.Visible && bubble.Contains(bp.X, bp.Y))
        {
            if (consentText != null) AllowOnce();
            else if (bubble.More) ExpandBubble();                      // "...v": grow it to read the rest
            else if (bubble.Expanded) { /* clicking inside the open bubble does nothing; Esc or a click outside closes it */ }
            else if (working) StopReply();                        // clicking the bubble while Aang is thinking stops it
            else { bubble.Clear(); if (anim.State == "talk") anim.Play("idle"); }
            dirty = true;
        }
        else
        {
            // A click on Aang himself opens the box to type to him.
            Wake(); anim.Play("look"); dirty = true;
            _ = link.SendAsync(new { t = "poked" });
            OpenInput();
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
                Location.X + (int)(BubbleView.Left * scale), Location.Y + (int)((bubble.CurrentTop + Extra) * scale),
                (int)((BubbleView.Right - BubbleView.Left) * scale), (int)((BubbleView.Bottom - bubble.CurrentTop) * scale));
            if (!r.Contains(c)) ExitExpanded(true);
        }
        mouseWasDown = down;
    }

    // ------------------------------------------------------------------ typing to Aang

    void OpenInput()
    {
        if (!Visible) Show();
        var prev = Win32.GetForegroundWindow();
        if (prev == Handle || prev == input.Handle) prev = IntPtr.Zero;
        input.Working = working;
        input.Open(new Point(Location.X, Location.Y + (int)(Extra * scale)), prev);
        Wake(); dirty = true;
    }

    void Submit(string text)
    {
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
        _ = link.SendAsync(new { t = "submit", id, text, mode });
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
        bubble.Show((message + " " + next).Trim(), false, 12000);
        anim.Play("talk"); dirty = true;
    }

    void StopReply()
    {
        _ = link.SendAsync(new { t = "stop", id = currentId });
        working = false; input.Working = false; ackTimer.Stop();
        ExitExpanded(collapse: false);
        bubble.Clear(); anim.Play("idle"); dirty = true;
    }

    // ------------------------------------------------------------------ model chip, quota, consent

    void PushStatus() => input.SetStatus(mode, saving, hasQuota, weekUse, fiveUse, saving ? "saving" : level);

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

    void OnConsent(string wanted)
    {
        consentWanted = ModelChip.Label(wanted); consentText = lastText; pendingMode = ModelChip.Normalize(wanted);
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
        bubble.Clear(); anim.Play("idle"); dirty = true;
    }

    // ------------------------------------------------------------------ hotkey

    string activeHotkey = "";

    /// <summary>Try the configured hotkey, then the fallbacks. Another program may already own a combination
    /// (Ctrl+Alt+A and Ctrl+Alt+Space are taken on this machine), so the result is logged and shown in the tray.</summary>
    bool RegisterHotkey()
    {
        foreach (var combo in new[] { cfg.Hotkey })
        {
            if (!TryParseHotkey(combo, out var mods, out var vk)) { Log.Write("hotkey not understood: " + combo); continue; }
            if (Win32.RegisterHotKey(Handle, HotkeyId, mods | Win32.MOD_NOREPEAT, vk))
            {
                activeHotkey = combo;
                Log.Write("hotkey registered: " + combo);
                return true;
            }
            Log.Write("hotkey unavailable (taken by another program): " + combo);
        }
        activeHotkey = "";
        return false;
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
                case "home": vk = 0x24; break;
                case "numlock": vk = 0x90; break;
                case var f when f.Length is 2 or 3 && f[0] == 'f' && int.TryParse(f.AsSpan(1), out var n) && n is >= 1 and <= 24: vk = (uint)(0x6F + n); break;
                case var c when c.Length == 1 && char.IsLetterOrDigit(c[0]): vk = char.ToUpperInvariant(c[0]); break;
                default: return false;
            }
        }
        return vk != 0 && mods != 0;
    }

    void UpdateTrayText()
    {
        var hk = activeHotkey.Length > 0 ? activeHotkey : "no hotkey available";
        showItem.Text = $"Show or hide  ({hk})";
        tray.Text = activeHotkey.Length > 0 ? $"Aang ({activeHotkey})" : "Aang";
    }

    void ToggleVisible()
    {
        if (Visible) { Hide(); return; }
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
            case Win32.WM_HOTKEY when (int)m.WParam == HotkeyId:
                ToggleVisible();                        // the one global hotkey: hide or reveal Aang
                return;
            case Win32.WM_HOTKEY when (int)m.WParam == EscId:
                ExitExpanded(collapse: true);           // Esc while the bubble is expanded
                return;
        }
        base.WndProc(ref m);
    }

    // ------------------------------------------------------------------ tray

    void BuildTray()
    {
        var menu = new ContextMenuStrip();
        showItem = new ToolStripMenuItem("Show or hide");
        var show = showItem;
        show.Click += (_, _) => ToggleVisible();
        var talk = new ToolStripMenuItem("Talk to Aang");
        talk.Click += (_, _) => OpenInput();
        quietItem = new ToolStripMenuItem("Quiet mode: auto");
        quietItem.Click += (_, _) => { forcedQuiet = forcedQuiet switch { null => true, true => false, false => null }; ApplyQuiet(); };
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
        menu.Items.AddRange(new ToolStripItem[] { talk, show, modelMenu, savingItem, quietItem, new ToolStripSeparator(), coreItem, autostartItem, new ToolStripSeparator(), quit });
        tray.ContextMenuStrip = menu;
        tray.Text = "Aang";
        tray.Icon = MakeIcon();
        tray.Visible = true;
        tray.DoubleClick += (_, _) => ToggleVisible();
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
        timer.Stop(); fgTimer.Stop(); ackTimer.Stop(); awayTimer.Stop();
        if (hotkeyOk) Win32.UnregisterHotKey(Handle, HotkeyId);
        if (escRegistered) Win32.UnregisterHotKey(Handle, EscId);
        input.Dispose();
        supervisor?.Dispose();
        tray.Visible = false; tray.Dispose();
        link.Dispose();
        base.OnFormClosing(e);
    }
}


