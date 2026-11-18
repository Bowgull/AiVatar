using Aang.Body;

namespace Samara.Launcher;

/// <summary>
/// Samara.exe (phase 5, 2026-11-18): starts Samara on the PC without the pet. It takes the switches Aang.exe took for
/// Samara, so anything that used `Aang.exe --samara` can use this instead:
///   (none) or --samara        open Samara (its window)
///   --quiet                   start it with only its doors, no window (Claude's connector, Aang starting up)
///   --url -- &lt;address&gt;        a link from Windows: one plain http or https address, checked here
///   --open-browser            Windows' "open the browser" (the Start menu's browser entry)
///   --after &lt;pid&gt;             an update restart: wait for the old Samara to finish first
///   --register-browser        tell Windows about Samara (he then clicks "Set default" himself); --unregister-browser
/// A Samara already running picks the link or the open-flag up itself; otherwise the installed release is started,
/// and a trial release that dies early is rolled back, exactly as the pet does (CoreSupervisor.StartShellAlone).
/// </summary>
static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        var exe = Environment.ProcessPath ?? "";
        if (args.Contains("--register-browser")) { DefaultBrowser.Register(exe); DefaultBrowser.OpenSettings(); return 0; }
        if (args.Contains("--unregister-browser")) { DefaultBrowser.Unregister(); return 0; }
        // So Samara, Aang's windows and Claude's connector find this launcher (samara-exe.txt, beside body-exe.txt).
        try { Directory.CreateDirectory(Path.GetDirectoryName(Paths.File("samara-exe.txt"))!); File.WriteAllText(Paths.File("samara-exe.txt"), exe); } catch { /* they fall back to Aang.exe */ }

        var link = DefaultBrowser.UrlFrom(args);
        if (args.Contains("--url"))
        {
            if (link == null) { Log.Write("samara launcher: refused a link that was not a plain http or https address"); return 0; }
            try { DefaultBrowser.Queue(link); } catch (Exception e) { Log.Write("samara launcher: could not hand over a link: " + e.Message); return 0; }
        }
        var quiet = args.Contains("--quiet") && link == null;
        if (!quiet) { try { DefaultBrowser.OpenFlag(); } catch { /* best effort */ } }
        var after = Array.IndexOf(args, "--after");
        if (after >= 0 && after + 1 < args.Length && int.TryParse(args[after + 1], out var old))
            try { using var o = System.Diagnostics.Process.GetProcessById(old); o.WaitForExit(15_000); } catch { /* already gone */ }

        Win32.AllowSetForegroundWindow(Win32.ASFW_ANY);
        using (var there = CoreSupervisor.RunningBrowser()) if (there != null) return 0;
        CoreSupervisor.StartShellAlone(Config.Load().ShellDir, quiet);
        return 0;
    }
}
