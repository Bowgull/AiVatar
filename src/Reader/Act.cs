// AangReader --act --app <process or title piece> --do find|press|fill [--name <control>] [--index <n>] [--text-b64 <base64 of the text>]
//
// Acting inside another app through UI Automation, by control NAME: press the "Save" button, fill the field called
// "Search". It does what the app's own accessibility interface offers (Invoke, Toggle, Select, SetValue), which is
// the same interface a screen reader uses, so it acts on real controls, not guessed pixels.
//
// One JSON line comes out: {"ok","window":{"title","process"},"matches":[{"i","name","type","password","enabled"}],
// "done","detail","error"}. `find` only looks. `press` and `fill` re-find the control first and refuse if its name is
// no longer what the Core asked about (the window changed under it), so the Core can decide about a control it saw.
//
// Same reasons as the reader for being its own process: another app's accessibility code can hang or crash, and a
// single UI Automation call cannot be interrupted. So it runs on a worker with a deadline, and a press that opens a
// modal dialog (which blocks Invoke until the dialog closes) is reported as "pressed", not waited on.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Windows.Automation;

namespace Aang.Reader;

static class Act
{
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

    record Ctl(int I, AutomationElement El, string Name, string Type, bool Password, bool Enabled);

    static readonly Stopwatch Clock = Stopwatch.StartNew();
    static bool emitted;

    public static int Run(string[] args)
    {
        string app = Str(args, "--app"), doWhat = Str(args, "--do"), name = Str(args, "--name");
        int index = int.TryParse(Str(args, "--index"), out var ix) ? ix : -1;
        string text = "";
        var b64 = Str(args, "--text-b64");
        if (b64.Length > 0) { try { text = Encoding.UTF8.GetString(Convert.FromBase64String(b64)); } catch { Emit(new { ok = false, error = "the text could not be read" }); return 2; } }
        if (app.Length == 0 || (doWhat != "find" && doWhat != "press" && doWhat != "fill")) { Emit(new { ok = false, error = "say which app and whether to find, press or fill" }); return 2; }

        var worker = new Thread(() => Work(app, doWhat, name, index, text)) { IsBackground = true };
        worker.SetApartmentState(ApartmentState.MTA);
        worker.Start();
        if (!worker.Join(4000) && !emitted) Emit(new { ok = false, error = "that app took too long to answer" });
        return 0;
    }

    static void Work(string app, string doWhat, string name, int index, string text)
    {
        try
        {
            var win = FindWindow(app);
            if (win == null) { Emit(new { ok = false, error = $"I could not find an open window for \"{app}\"." }); return; }
            var (hwnd, title, process) = win.Value;
            AutomationElement root;
            try { root = AutomationElement.FromHandle(hwnd); }
            catch (Exception e) { Emit(new { ok = false, error = "that window is gone: " + e.Message }); return; }
            var all = Collect(root);
            var windowInfo = new { title, process };

            if (doWhat == "find")
            {
                var hits = name.Length == 0 ? all : all.Where(c => c.Name.Contains(name, StringComparison.OrdinalIgnoreCase)).ToList();
                Emit(new { ok = true, window = windowInfo, matches = hits.Take(60).Select(Brief), total = hits.Count });
                return;
            }

            var pick = index >= 0 && index < all.Count && all[index].Name.Equals(name, StringComparison.OrdinalIgnoreCase) ? all[index]
                : all.FirstOrDefault(c => c.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (pick == null) { Emit(new { ok = false, window = windowInfo, error = $"\"{name}\" is not in that window any more." }); return; }
            if (!pick.Enabled) { Emit(new { ok = false, window = windowInfo, error = $"\"{pick.Name}\" is greyed out, so it cannot be used right now." }); return; }

            if (doWhat == "press") Press(pick, windowInfo);
            else Fill(pick, text, windowInfo);
        }
        catch (Exception e) { Emit(new { ok = false, error = "that did not work: " + e.Message }); }
    }

    static void Press(Ctl c, object window)
    {
        var el = c.El;
        // Invoke can block until a modal dialog the press opened is closed: run it aside and report what is known.
        string? result = null; Exception? err = null;
        var t = new Thread(() =>
        {
            try
            {
                if (el.TryGetCurrentPattern(InvokePattern.Pattern, out var inv)) { ((InvokePattern)inv).Invoke(); result = "pressed"; }
                else if (el.TryGetCurrentPattern(TogglePattern.Pattern, out var tg)) { var p = (TogglePattern)tg; p.Toggle(); result = "switched " + (p.Current.ToggleState == ToggleState.On ? "on" : p.Current.ToggleState == ToggleState.Off ? "off" : "to its next state"); }
                else if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var sel)) { ((SelectionItemPattern)sel).Select(); result = "selected"; }
                else if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out var ex)) { var p = (ExpandCollapsePattern)ex; if (p.Current.ExpandCollapseState == ExpandCollapseState.Collapsed) { p.Expand(); result = "opened"; } else { p.Collapse(); result = "closed"; } }
            }
            catch (Exception e) { err = e; }
        }) { IsBackground = true };
        t.SetApartmentState(ApartmentState.MTA);
        t.Start();
        bool finished = t.Join(1500);
        if (!finished) { Emit(new { ok = true, window, done = true, detail = $"Pressed \"{c.Name}\". It has not finished answering, which usually means it opened a dialog." }); return; }
        if (err != null) { Emit(new { ok = false, window, error = $"\"{c.Name}\" would not be pressed: {err.Message}" }); return; }
        if (result == null) { Emit(new { ok = false, window, error = $"\"{c.Name}\" is a {c.Type} that does not offer a way to press it." }); return; }
        Emit(new { ok = true, window, done = true, detail = $"{char.ToUpper(result[0])}{result[1..]} \"{c.Name}\"." });
    }

    static void Fill(Ctl c, string text, object window)
    {
        if (c.Password) { Emit(new { ok = false, window, error = "that is a password field, and I never fill those." }); return; }
        if (!c.El.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) { Emit(new { ok = false, window, error = $"\"{c.Name}\" is a {c.Type} that cannot be typed into." }); return; }
        var v = (ValuePattern)vp;
        if (v.Current.IsReadOnly) { Emit(new { ok = false, window, error = $"\"{c.Name}\" is read-only." }); return; }
        v.SetValue(text);
        string after = "";
        try { after = v.Current.Value ?? ""; } catch { /* some fields do not read back */ }
        bool same = after == text;
        Emit(new { ok = same, window, done = same, detail = same ? $"Filled \"{c.Name}\" ({text.Length} characters)." : null, error = same ? null : $"I typed into \"{c.Name}\" but it did not keep the text; it now says: {Trim(after)}" });
    }

    static object Brief(Ctl c) => new { i = c.I, name = c.Name, type = c.Type, password = c.Password, enabled = c.Enabled };
    static string Trim(string s) => s.Length <= 60 ? s : s[..60] + "...";

    // ------------------------------------------------------------------ finding things

    /// <summary>The window for "notepad" or "spotify" or a piece of its title. The one in front wins if several match.</summary>
    static (IntPtr hwnd, string title, string process)? FindWindow(string what)
    {
        var w = what.Trim().ToLowerInvariant();
        var alias = w switch { "google chrome" => "chrome", "edge" or "microsoft edge" => "msedge", "file explorer" or "explorer" => "explorer", "paint" => "mspaint", "calculator" => "calculatorapp", "vs code" or "vscode" or "visual studio code" => "code", _ => w };
        var found = new List<(IntPtr, string, string)>();
        var fg = GetForegroundWindow();
        EnumWindows((h, _) =>
        {
            if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
            var sb = new StringBuilder(300);
            if (GetWindowText(h, sb, sb.Capacity) == 0) return true;
            GetWindowThreadProcessId(h, out var pid);
            string proc; try { using var p = Process.GetProcessById((int)pid); proc = p.ProcessName; } catch { return true; }
            if (proc.Equals(alias, StringComparison.OrdinalIgnoreCase) || proc.Replace(" ", "").Equals(alias.Replace(" ", ""), StringComparison.OrdinalIgnoreCase)) found.Add((h, sb.ToString(), proc));
            return true;
        }, IntPtr.Zero);
        if (found.Count == 0)
            EnumWindows((h, _) =>
            {
                if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
                var sb = new StringBuilder(300);
                if (GetWindowText(h, sb, sb.Capacity) == 0 || !sb.ToString().Contains(what.Trim(), StringComparison.OrdinalIgnoreCase)) return true;
                GetWindowThreadProcessId(h, out var pid);
                string proc; try { using var p = Process.GetProcessById((int)pid); proc = p.ProcessName; } catch { return true; }
                found.Add((h, sb.ToString(), proc));
                return true;
            }, IntPtr.Zero);
        if (found.Count == 0) return null;
        var front = found.FirstOrDefault(f => f.Item1 == fg);
        return front.Item1 != IntPtr.Zero ? front : found[0];
    }

    static readonly HashSet<string> Frame = new(StringComparer.OrdinalIgnoreCase) { "Minimize", "Maximize", "Restore", "Close", "System", "System menu", "Application" };

    static readonly HashSet<ControlType> Wanted = new()
    {
        ControlType.Button, ControlType.CheckBox, ControlType.RadioButton, ControlType.ComboBox, ControlType.Edit, ControlType.MenuItem,
        ControlType.TabItem, ControlType.ListItem, ControlType.Hyperlink, ControlType.SplitButton, ControlType.TreeItem,
    };

    /// <summary>The controls a person could use, top to bottom, in a stable order so an index means the same thing twice.</summary>
    static List<Ctl> Collect(AutomationElement root)
    {
        var list = new List<Ctl>();
        var queue = new Queue<AutomationElement>(); queue.Enqueue(root);
        var walker = TreeWalker.ControlViewWalker;
        int nodes = 0;
        long end = Clock.ElapsedMilliseconds + 2500;
        while (queue.Count > 0 && nodes < 4000 && Clock.ElapsedMilliseconds < end)
        {
            var e = queue.Dequeue(); nodes++;
            try
            {
                if (e.Current.IsOffscreen && e != root) continue;
                var type = e.Current.ControlType;
                if (Wanted.Contains(type))
                {
                    var name = (e.Current.Name ?? "").Trim();
                    if (name.Length == 0 && type == ControlType.Edit) name = (e.Current.AutomationId ?? "").Trim();
                    // The window's own frame buttons are not the app's controls; closing an app has its own tool.
                    if (Frame.Contains(name) && (type == ControlType.Button || type == ControlType.MenuItem)) name = "";
                    if (name.Length > 0 && name.Length <= 120)
                        list.Add(new Ctl(list.Count, e, name, TypeName(type), e.Current.IsPassword, e.Current.IsEnabled));
                }
                for (var c = walker.GetFirstChild(e); c != null; c = walker.GetNextSibling(c)) queue.Enqueue(c);
            }
            catch { /* went away mid-walk */ }
        }
        return list;
    }

    static string TypeName(ControlType t) => t.ProgrammaticName.Replace("ControlType.", "").ToLowerInvariant();

    // ------------------------------------------------------------------ output

    static void Emit(object o)
    {
        lock (Clock) { if (emitted) return; emitted = true; Console.Out.WriteLine(JsonSerializer.Serialize(o)); Console.Out.Flush(); }
    }
    static string Str(string[] a, string n) { int i = Array.IndexOf(a, n); return i >= 0 && i + 1 < a.Length ? a[i + 1] : ""; }
}
