namespace Aang.Body;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        // `Aang.exe --selftest-dock`: checks the docking geometry without opening a window.
        if (args.Contains("--selftest-dock"))
        {
            var bad = Docking.SelfTest(Console.Out);
            Console.Out.WriteLine(bad == 0 ? "all docking checks passed" : $"{bad} docking check(s) failed");
            return bad == 0 ? 0 : 1;
        }
        // 6.27: `Aang.exe --register-browser` / `--unregister-browser`, run once by hand; nothing else changes Windows.
        if (args.Contains("--register-browser")) { DefaultBrowser.Register(Environment.ProcessPath!); DefaultBrowser.OpenSettings(); return 0; }
        if (args.Contains("--unregister-browser")) { DefaultBrowser.Unregister(); return 0; }
        // 6.27: a link from Windows. Checked here, left as a file for the Shell; a bad one is dropped.
        var link = DefaultBrowser.UrlFrom(args);
        if (args.Contains("--url"))
        {
            if (link == null) { Log.Write("default browser: refused a link that was not a plain http or https address"); return 0; }
            try { DefaultBrowser.Queue(link); } catch (Exception e) { Log.Write("default browser: could not hand over a link: " + e.Message); return 0; }
        }
        var samara = args.Contains("--samara");
        if (args.Contains("--open-browser") || samara) { try { DefaultBrowser.OpenFlag(); } catch { /* best effort */ } }

        using var single = new Mutex(true, @"Local\Aang.Body.Single", out var first);
        if (!first)
        {
            // Aang is already running: let the browser come to the front for the link he just clicked.
            Win32.AllowSetForegroundWindow(Win32.ASFW_ANY);
            return 0;
        }
        // Samara on its own (his ask, 2026-10-20: "Samara only"). The Samara shortcut, the Start menu's browser entry
        // and a link from Windows open the browser, never the pet: Aang stays off until he starts him. A Samara that is
        // already open picks the link or the flag up itself. `--after <pid>`: a Samara restarting for an update waits
        // for the old one to finish first.
        if (samara || link != null || args.Contains("--open-browser"))
        {
            var after = Array.IndexOf(args, "--after");
            if (after >= 0 && after + 1 < args.Length && int.TryParse(args[after + 1], out var old))
                try { using var o = System.Diagnostics.Process.GetProcessById(old); o.WaitForExit(15_000); } catch { /* already gone */ }
            Win32.AllowSetForegroundWindow(Win32.ASFW_ANY);
            using (var there = CoreSupervisor.RunningShell()) if (there != null) return 0;
            CoreSupervisor.StartShellAlone(Config.Load().ShellDir);
            return 0;
        }
        // Samara watches for the pet (shell.pid's partner): while this file names a live Aang, Aang's windows are on;
        // when it goes, Samara keeps his tabs and closes only Aang's own windows. body-exe.txt lets Samara restart
        // itself through here after an update when the pet is off.
        try { File.WriteAllText(Paths.File("body.pid"), Environment.ProcessId.ToString()); File.WriteAllText(Paths.File("body-exe.txt"), Environment.ProcessPath ?? ""); } catch { /* Samara then treats Aang as off */ }

        // A crash in the pet must be logged, never silent, and must not leave a zombie window.
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Write("UI exception: " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write("fatal: " + e.ExceptionObject);

        ApplicationConfiguration.Initialize();
        try { Application.Run(new PetWindow(args)); }
        catch (Exception e) { Log.Write("startup failed: " + e); MessageBox.Show(e.Message, "Aang could not start"); }
        // Aang is closing: Samara sees this and puts Aang's own windows away (a crash leaves the file, but Samara also
        // checks that the pid in it is alive).
        try { if (File.ReadAllText(Paths.File("body.pid")).Trim() == Environment.ProcessId.ToString()) File.Delete(Paths.File("body.pid")); } catch { /* gone */ }
        return 0;
    }
}
