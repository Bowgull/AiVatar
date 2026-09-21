// AangReader --hwnd <handle> [--max <chars>] [--budget <ms>]
//
// Prints one JSON line per stage, each a complete answer on its own:
//   {"ok":true,"kind":"document"|"controls"|"empty","app":"...","text":"...","nodes":n,"ms":n}
// The Core keeps the LAST line it received. So if a later stage crashes the process (the reason this is
// a separate process at all), what was read before it still counts.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace Aang.Reader;

static class Program
{
    static readonly Stopwatch Clock = Stopwatch.StartNew();

    static volatile bool emitted;

    static int Main(string[] args)
    {
        Clock.Restart();
        long hwnd = Arg(args, "--hwnd", 0);
        int max = (int)Arg(args, "--max", 3000);
        int budget = (int)Arg(args, "--budget", 600);
        int deadline = (int)Arg(args, "--deadline", 2500);
        if (hwnd == 0) { Emit(false, "empty", "", "", 0, "no window given"); return 2; }

        // The reading happens on a worker, because a single UI Automation call cannot be interrupted: one
        // FindAll on Battle.net took 14.7 s. When the deadline passes, whatever was already printed stands
        // and the process leaves, abandoning the call where it is.
        var worker = new Thread(() => Read(hwnd, max, budget)) { IsBackground = true };
        worker.SetApartmentState(ApartmentState.MTA);
        worker.Start();
        if (!worker.Join(deadline) && !emitted)
        {
            if (partialText.Length > 0) Emit(true, partialKind, partialApp, partialText, partialNodes, "partial: that window stopped answering part way");
            else Emit(false, "empty", ClassName(new IntPtr(hwnd)), "", 0, "that window took too long to answer");
        }
        return 0;
    }

    static void Read(long hwnd, int max, int budget)
    {
        AutomationElement root;
        try { root = AutomationElement.FromHandle(new IntPtr(hwnd)); }
        catch (Exception e) { Emit(false, "empty", "", "", 0, "that window is gone: " + e.Message); return; }
        string app = ClassName(new IntPtr(hwnd));
        Trace("root");

        partialApp = app;
        var result = Walk(root, budget, max);
        Trace("walk");
        if (result.kind != "document" && WakesOnDemand(app))
        {
            // Chromium and Firefox build their accessibility tree only once something asks for it, so the
            // first question gets a thin window. Measured: the Claude app gave 15 elements on the first read
            // and 158 on the second; Firefox gave its toolbar first and the page on the second.
            Thread.Sleep(400);
            result = Walk(root, budget, max);
            Trace("walk again");
        }
        Emit(true, result.kind, app, result.text, result.nodes, null);

        // The part of the document actually on screen. The first 3,000 characters of a web page are mostly
        // its navigation, not what he is reading. TextPattern.GetVisibleRanges would be the obvious way, and
        // it crashed the process (0xC0000005 inside UiaCoreApi.RawTextRange_GetText) on every window tried.
        // Scroll position is not exposed on these documents either. So: walk inside the document, skipping
        // everything the app marks off screen. It only reads element properties, and it comes after the
        // answer above is already out.
        if (result.kind == "document" && lastDocElement != null)
        {
            var visible = VisibleInside(lastDocElement, budget, max);
            Trace("visible");
            if (visible.Length >= 80) Emit(true, "visible", app, visible, result.nodes, null);
        }
    }

    static AutomationElement? lastDocElement;

    /// <summary>The words inside a document that are on screen right now, top to bottom.</summary>
    static string VisibleInside(AutomationElement doc, int budgetMs, int max)
    {
        var lines = new List<string>();
        var seen = new HashSet<string>();
        var stack = new Stack<AutomationElement>();                 // depth first keeps reading order
        var walker = TreeWalker.ControlViewWalker;
        try { for (var c = walker.GetLastChild(doc); c != null; c = walker.GetPreviousSibling(c)) stack.Push(c); }
        catch { return ""; }
        int length = 0;
        long end = Clock.ElapsedMilliseconds + budgetMs;
        while (stack.Count > 0 && Clock.ElapsedMilliseconds < end && length < max)
        {
            var e = stack.Pop();
            try
            {
                if (e.Current.IsOffscreen) continue;
                var type = e.Current.ControlType;
                if (type == ControlType.Text || type == ControlType.Hyperlink || type == ControlType.ListItem || type == ControlType.Edit)
                {
                    var name = Clean(e.Current.Name ?? "");
                    if (name.Length > 1 && (name.Length > 40 || seen.Add(name))) { lines.Add(name); length += name.Length + 1; }
                    if (type == ControlType.Text) continue;             // a text run has no further words inside
                }
                for (var c = walker.GetLastChild(e); c != null; c = walker.GetPreviousSibling(c)) stack.Push(c);
            }
            catch { /* went away mid-walk */ }
        }
        return Cap(string.Join(" ", lines), max);
    }
    static bool WakesOnDemand(string cls) => IsChromium(cls) || cls == "MozillaWindowClass";

    // What the walk has so far, for the main thread to report if one call hangs past the deadline.
    static volatile string partialApp = "", partialText = "", partialKind = "empty";
    static volatile int partialNodes;

    /// <summary>
    /// One walk, breadth first, until the budget runs out. A Document - the page in a browser, the file in an
    /// editor, the conversation in an Electron app - is read whole through its TextPattern and not walked
    /// into: Firefox gave 4,000 characters of a Wikipedia article in 143 ms that way, against 2.4 s to visit
    /// its 2,000 elements. Everything outside a document contributes the names of controls that carry words,
    /// which is what Explorer, Spotify and settings pages have instead. A single search of the whole tree for
    /// the Document was tried first and took 14.7 s on Battle.net, which is why nothing here is unbounded.
    /// </summary>
    static (string kind, string text, int nodes) Walk(AutomationElement root, int budgetMs, int max)
    {
        var keep = new HashSet<ControlType> { ControlType.Text, ControlType.Hyperlink, ControlType.ListItem, ControlType.TreeItem,
            ControlType.TabItem, ControlType.DataItem, ControlType.Header, ControlType.HeaderItem, ControlType.Edit, ControlType.Button };
        var chrome = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Minimize", "Maximize", "Restore", "Close", "System", "Application" };
        var seen = new HashSet<string>();
        var lines = new List<string>();
        string doc = "";
        var queue = new Queue<AutomationElement>(); queue.Enqueue(root);
        var walker = TreeWalker.ControlViewWalker;
        int nodes = 0, length = 0;
        long end = Clock.ElapsedMilliseconds + budgetMs;
        while (queue.Count > 0 && Clock.ElapsedMilliseconds < end && length < max && doc.Length < max)
        {
            var e = queue.Dequeue(); nodes++;
            try
            {
                var type = e.Current.ControlType;
                if (type == ControlType.Document)
                {
                    if (e.TryGetCurrentPattern(TextPattern.Pattern, out var p))
                    {
                        var text = Clean(((TextPattern)p).DocumentRange.GetText(max * 2));
                        if (text.Length > doc.Length) { doc = text; lastDocElement = e; partialKind = "document"; partialText = Cap(doc, max); partialNodes = nodes; }
                        continue;                                   // read whole; its insides add nothing
                    }
                }
                // A plain text box keeps its words in a value, not a document: forms, simple editors, the
                // stand-in window the tests use. A long one is read like a document.
                if (type == ControlType.Edit && e.TryGetCurrentPattern(ValuePattern.Pattern, out var vp))
                {
                    var value = Clean(((ValuePattern)vp).Current.Value ?? "");
                    if (value.Length >= 20 && value.Length > doc.Length) { doc = value; lastDocElement = e; partialKind = "document"; partialText = Cap(doc, max); partialNodes = nodes; }
                }
                var name = Clean(e.Current.Name ?? "");
                if (keep.Contains(type) && name.Length > 1 && !chrome.Contains(name) && seen.Add(name))
                {
                    lines.Add(name); length += name.Length + 1;
                    if (doc.Length == 0) { partialKind = "controls"; partialText = Cap(string.Join("\n", lines), max); partialNodes = nodes; }
                }
                if (e.Current.IsOffscreen && e != root) continue;  // what he cannot see is not "on screen"
                for (var c = walker.GetFirstChild(e); c != null; c = walker.GetNextSibling(c)) queue.Enqueue(c);
            }
            catch { /* element went away mid-walk */ }
        }
        if (doc.Length >= 20) return ("document", Cap(doc, max), nodes);
        if (lines.Count > 0) return ("controls", Cap(string.Join("\n", lines), max), nodes);
        return ("empty", "", nodes);                        // a game, a canvas, or no accessibility at all
    }

    /// <summary>Stage timings, to stderr, so they can be measured without touching the answer.</summary>
    static void Trace(string stage) => Console.Error.WriteLine($"{Clock.ElapsedMilliseconds,6} ms  {stage}");

    static bool IsChromium(string cls) => cls.StartsWith("Chrome_WidgetWin", StringComparison.Ordinal);

    /// <summary>Object-replacement marks, runs of blank space: the noise between the words.</summary>
    static string Clean(string s) => Regex.Replace(Regex.Replace(s.Replace('￼', ' '), @"[ \t ]+", " "), @"\s*\n\s*(\n\s*)+", "\n").Trim();

    static string Cap(string s, int max) => s.Length <= max ? s : s[..max] + " ...";

    static void Emit(bool ok, string kind, string app, string text, int nodes, string? error)
    {
        var line = JsonSerializer.Serialize(new { ok, kind, app, text, nodes, ms = Clock.ElapsedMilliseconds, error });
        lock (Clock) { Console.Out.WriteLine(line); Console.Out.Flush(); emitted = true; }
    }

    static long Arg(string[] args, string name, long fallback)
    {
        int i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length && long.TryParse(args[i + 1], out var v) ? v : fallback;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    static string ClassName(IntPtr h) { var sb = new StringBuilder(256); return GetClassName(h, sb, sb.Capacity) > 0 ? sb.ToString() : ""; }
}
