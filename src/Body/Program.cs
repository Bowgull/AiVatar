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
        if (args.Contains("--open-browser")) { try { DefaultBrowser.OpenFlag(); } catch { /* best effort */ } }

        using var single = new Mutex(true, @"Local\Aang.Body.Single", out var first);
        if (!first)
        {
            // Aang is already running: let the browser come to the front for the link he just clicked.
            Win32.AllowSetForegroundWindow(Win32.ASFW_ANY);
            return 0;
        }

        // A crash in the pet must be logged, never silent, and must not leave a zombie window.
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Write("UI exception: " + e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write("fatal: " + e.ExceptionObject);

        ApplicationConfiguration.Initialize();
        try { Application.Run(new PetWindow(args)); }
        catch (Exception e) { Log.Write("startup failed: " + e); MessageBox.Show(e.Message, "Aang could not start"); }
        return 0;
    }
}
